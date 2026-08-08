"""Static JSON export: extraction output → dashboard-ready JSON files.

This is the MVP path — no live backend. The dashboard reads pre-computed
JSON files at build time. Run this script after extraction to refresh the
data the dashboard shows.

Usage:
    python scripts/export.py --input data/extracted/ --raw data/raw/ --output dashboard/public/data/

Output files:
    trends.json          — weekly skill shares + deltas + skill×country heatmap
    top_skills.json      — ranked skills over the full period
    pipeline_health.json — collection/extraction stats
    taxonomy.json        — skill taxonomy for the dashboard filter

Correctness notes (each of these was a real bug once):
- Weekly buckets use the posting's *posted* date, not the date we fetched it.
  A backfill run fetches ~30 days of postings in one day; bucketing by fetch
  date collapses the whole series onto a single point.
- Share denominators come from the postings index (every posting, mentions or
  not). Counting only postings with >=1 mention inflates every share.
- Postings are deduplicated by (source, source_id): the same ad can be
  collected on multiple days / via overlapping queries.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from aggregation.trends import (
    compute_skill_shares,
    compute_deltas,
    build_trend_result,
    wilson_lower,
    wilson_upper,
)
from nlp.extractor import SkillExtractor

MIN_N = 30  # suppress groups with fewer postings than this


def _read_jsonl(path: Path) -> list[dict]:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return rows


def load_mentions(extracted_dir: Path) -> list[dict]:
    """Load skill mentions (excludes the postings index and run logs)."""
    postings_dir = extracted_dir / "postings"
    mentions = []
    for jsonl_file in sorted(extracted_dir.rglob("*.jsonl")):
        if "runs.jsonl" in jsonl_file.name:
            continue
        if postings_dir in jsonl_file.parents:
            continue
        mentions.extend(_read_jsonl(jsonl_file))
    return mentions


def load_postings(extracted_dir: Path) -> dict[tuple, dict]:
    """Load the postings index, deduplicated by (source, source_id)."""
    postings: dict[tuple, dict] = {}
    postings_dir = extracted_dir / "postings"
    if not postings_dir.exists():
        return postings
    for jsonl_file in sorted(postings_dir.rglob("*.jsonl")):
        for row in _read_jsonl(jsonl_file):
            key = (row.get("source"), str(row.get("source_id")))
            existing = postings.get(key)
            # Keep the earliest posted_at (first sighting of the ad).
            if existing is None or (row.get("posted_at") or "") < (existing.get("posted_at") or ""):
                postings[key] = row
    return postings


def iso_week(date_str: str | None) -> str | None:
    """'2026-08-05T09:45:42[Z]' → '2026-W32' (ISO week)."""
    if not date_str:
        return None
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        return None
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def build_weekly_groups(
    postings: dict[tuple, dict],
    mentions: list[dict],
) -> list[dict]:
    """Aggregate to (skill, week) rows with true denominators, zero-filled.

    Zero-fill matters: a skill absent from a week is a real 0% observation
    (the denominator is known), and the trend line should show it rather
    than skip the week.
    """
    posting_week: dict[tuple, str] = {}
    for key, p in postings.items():
        week = iso_week(p.get("posted_at"))
        if week:
            posting_week[key] = week

    week_postings: dict[str, set] = defaultdict(set)
    for key, week in posting_week.items():
        week_postings[week].add(key)

    skill_week: dict[tuple, set] = defaultdict(set)
    skill_categories: dict[str, str] = {}
    for m in mentions:
        key = (m.get("source"), str(m.get("source_id")))
        week = posting_week.get(key) or iso_week(m.get("posted_at") or m.get("fetched_at"))
        if not week:
            continue
        skill_week[(m["skill"], week)].add(key)
        skill_categories[m["skill"]] = m.get("category", "")

    weeks = sorted(week_postings)
    skills = sorted({s for s, _ in skill_week})

    rows = []
    for skill in skills:
        for week in weeks:
            rows.append({
                "skill": skill,
                "category": skill_categories.get(skill, ""),
                "week": week,
                "postings_in_group": len(week_postings[week]),
                "mentions": len(skill_week.get((skill, week), ())),
            })
    return rows


def build_heatmap(
    postings: dict[tuple, dict],
    mentions: list[dict],
    min_n: int = MIN_N,
) -> list[dict]:
    """Skill × country shares over the full period."""
    posting_country: dict[tuple, str] = {}
    for key, p in postings.items():
        country = p.get("country")
        if country:
            posting_country[key] = country

    country_postings: dict[str, set] = defaultdict(set)
    for key, country in posting_country.items():
        country_postings[country].add(key)

    skill_country: dict[tuple, set] = defaultdict(set)
    skill_categories: dict[str, str] = {}
    for m in mentions:
        key = (m.get("source"), str(m.get("source_id")))
        country = posting_country.get(key)
        if not country:
            continue
        skill_country[(m["skill"], country)].add(key)
        skill_categories[m["skill"]] = m.get("category", "")

    rows = []
    for (skill, country), pids in skill_country.items():
        n = len(country_postings[country])
        if n < min_n:
            continue
        p = len(pids) / n
        rows.append({
            "skill": skill,
            "category": skill_categories.get(skill, ""),
            "location": country,
            "share": round(p, 6),
            "postings": n,
            "mentions": len(pids),
        })
    rows.sort(key=lambda r: (-r["share"], r["skill"]))
    return rows


def complete_weeks(postings: dict[tuple, dict]) -> set[str]:
    """Weeks whose Sunday is on/before the latest posted date we've seen.

    The newest week is almost always partial (postings still accruing), and
    the oldest backfill week only covers its tail. Comparing a partial week
    against a full one produces phantom 'falling' deltas — so deltas and
    direction flags only use complete weeks.
    """
    dates = []
    for p in postings.values():
        try:
            dates.append(datetime.fromisoformat(
                (p.get("posted_at") or "").replace("Z", "+00:00")))
        except ValueError:
            continue
    if not dates:
        return set()
    max_date = max(d.replace(tzinfo=None) for d in dates)
    weeks = set()
    for d in dates:
        d = d.replace(tzinfo=None)
        iso = d.isocalendar()
        # Days remaining in this ISO week after d (Sunday = weekday 7)
        week_end = d + timedelta(days=7 - iso.weekday)
        if week_end <= max_date:
            weeks.add(f"{iso.year}-W{iso.week:02d}")
    return weeks


def build_top_skills(
    postings: dict[tuple, dict],
    mentions: list[dict],
    shares: list,
    usable_weeks: set[str],
    top_n: int = 25,
) -> list[dict]:
    """Rank skills by share over the FULL period (stable), with an honest
    delta: latest complete week vs the week before, only when both weeks
    clear the suppression threshold — otherwise delta is null and the
    dashboard shows nothing rather than noise."""
    total = len(postings)
    if total == 0:
        return []

    skill_pids: dict[str, set] = defaultdict(set)
    skill_categories: dict[str, str] = {}
    for m in mentions:
        key = (m.get("source"), str(m.get("source_id")))
        if key not in postings:
            continue
        skill_pids[m["skill"]].add(key)
        skill_categories[m["skill"]] = m.get("category", "")

    # Weekly shares per skill for the delta computation.
    weekly: dict[str, list] = defaultdict(list)
    for s in shares:
        weekly[s.skill].append(s)

    ranked = sorted(skill_pids.items(), key=lambda kv: -len(kv[1]))
    out = []
    for skill, pids in ranked[:top_n]:
        p = len(pids) / total
        delta_pp = None
        wk = sorted(weekly.get(skill, []), key=lambda s: s.week)
        usable = [s for s in wk if not s.suppressed and s.week in usable_weeks]
        if len(usable) >= 2:
            delta_pp = round(usable[-1].share - usable[-2].share, 6)
        out.append({
            "skill": skill,
            "category": skill_categories.get(skill, ""),
            "share": round(p, 6),
            "wilson_lower": round(wilson_lower(total, p), 6),
            "wilson_upper": round(wilson_upper(total, p), 6),
            "mentions": len(pids),
            "postings": total,
            "delta_pp": delta_pp,
        })
    return out


def load_ingestion_stats(raw_dir: Path) -> dict:
    runs = []
    # ingestion_runs.jsonl lives at the data root (sibling of raw/), so scan
    # the parent as well as the raw dir itself.
    seen = set()
    for base in (raw_dir, raw_dir.parent):
        for jsonl_file in base.rglob("ingestion_runs.jsonl"):
            if jsonl_file in seen:
                continue
            seen.add(jsonl_file)
            runs.extend(_read_jsonl(jsonl_file))
    return {
        "total_runs": len(runs),
        "total_landed": sum(r.get("records_landed", 0) for r in runs),
        "total_quarantined": sum(r.get("records_quarantined", 0) for r in runs),
        "latest_run": runs[-1] if runs else None,
    }


def build_taxonomy_json(extractor: SkillExtractor) -> dict:
    categories = defaultdict(list)
    for sd in extractor.skills.values():
        categories[sd.category].append({
            "name": sd.name,
            "match_policy": sd.match_policy,
        })
    return {
        "version": extractor.taxonomy_version,
        "total_skills": len(extractor.skills),
        "categories": dict(categories),
    }


def main():
    parser = argparse.ArgumentParser(description="Export dashboard JSON files")
    parser.add_argument("--input", required=True, help="Extraction output dir")
    parser.add_argument("--raw", default=None, help="Raw zone dir (for pipeline health)")
    parser.add_argument("--output", required=True, help="Dashboard public/data dir")
    args = parser.parse_args()

    extracted_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading extraction output...")
    mentions = load_mentions(extracted_dir)
    postings = load_postings(extracted_dir)
    print(f"  {len(mentions)} mentions, {len(postings)} unique postings")

    if not mentions:
        print("No mentions found. Run extraction first.")
        return 1
    if not postings:
        print("No postings index found. Re-run extraction (python -m nlp.run ...) first.")
        return 1

    print("Computing trends...")
    grouped = build_weekly_groups(postings, mentions)
    shares = compute_skill_shares(grouped, min_n=MIN_N)
    deltas = compute_deltas(shares)
    result = build_trend_result(deltas)
    full_weeks = complete_weeks(postings)

    # Header stats: count each skill once, using its latest COMPLETE week's
    # direction (counting every (skill, week) point overstates everything,
    # and partial weeks produce phantom rises/falls).
    latest_dir: dict[str, str] = {}
    for d in sorted(deltas, key=lambda d: d.week):
        if d.week in full_weeks and not d.suppressed:
            latest_dir[d.skill] = d.direction
    result.summary["rising"] = sum(1 for v in latest_dir.values() if v == "rising")
    result.summary["falling"] = sum(1 for v in latest_dir.values() if v == "falling")
    result.summary["stable"] = sum(1 for v in latest_dir.values() if v == "stable")

    # trends.json (groups + heatmap in one file)
    heatmap = build_heatmap(postings, mentions)
    trends_data = {
        "generated_at": result.generated_at,
        "taxonomy_version": result.taxonomy_version,
        "summary": result.summary,
        "partial_weeks": sorted({d.week for d in deltas} - full_weeks),
        "groups": [
            {
                "skill": d.skill,
                "category": d.category,
                "week": d.week,
                "role": d.role,
                "location": d.location,
                "current_share": d.current_share,
                "previous_share": d.previous_share,
                "delta_pp": d.delta_pp,
                "delta_pct": d.delta_pct,
                "rolling_4w_avg": d.rolling_4w_avg,
                "direction": d.direction,
                "suppressed": d.suppressed,
            }
            for d in result.groups
        ],
        "locations": heatmap,
    }
    with open(output_dir / "trends.json", "w", encoding="utf-8") as f:
        json.dump(trends_data, f, ensure_ascii=False, indent=2)
    weeks = sorted({d.week for d in deltas})
    print(f"  trends.json: {len(deltas)} points across {len(weeks)} weeks "
          f"({weeks[0]}..{weeks[-1]}), {len(heatmap)} heatmap cells")

    # top_skills.json
    top_skills = build_top_skills(postings, mentions, shares, full_weeks)
    with open(output_dir / "top_skills.json", "w", encoding="utf-8") as f:
        json.dump(top_skills, f, indent=2, ensure_ascii=False)
    print(f"  top_skills.json: {len(top_skills)} skills over {len(postings)} postings")

    # taxonomy.json
    extractor = SkillExtractor()
    taxonomy = build_taxonomy_json(extractor)
    with open(output_dir / "taxonomy.json", "w", encoding="utf-8") as f:
        json.dump(taxonomy, f, indent=2, ensure_ascii=False)
    print(f"  taxonomy.json: {taxonomy['total_skills']} skills")

    # pipeline_health.json
    if args.raw:
        health = load_ingestion_stats(Path(args.raw))
        health["generated_at"] = datetime.utcnow().isoformat() + "Z"
        health["extraction"] = {
            "total_mentions": len(mentions),
            "unique_skills": len(set(m["skill"] for m in mentions)),
            "unique_postings": len(postings),
            "postings_with_mentions": len(
                set((m.get("source"), str(m.get("source_id"))) for m in mentions)
            ),
        }
        with open(output_dir / "pipeline_health.json", "w", encoding="utf-8") as f:
            json.dump(health, f, indent=2, ensure_ascii=False, default=str)
        print("  pipeline_health.json")

    print(f"\nExport complete → {output_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
