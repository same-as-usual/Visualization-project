"""Static JSON export: extraction output → dashboard-ready JSON files.

This is the MVP path — no live backend. The dashboard reads pre-computed
JSON files at build time. Run this script after extraction to refresh the
data the dashboard shows.

Usage:
    python scripts/export.py --input data/extracted/ --output dashboard/public/data/

Output files:
    trends.json          — skill shares, deltas, directions
    top_skills.json      — ranked skills for the current period
    pipeline_health.json — collection/extraction stats
    taxonomy.json        — skill taxonomy for the dashboard filter
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from aggregation.trends import (
    compute_skill_shares,
    compute_deltas,
    build_trend_result,
    export_json,
    SkillShare,
)
from nlp.extractor import SkillExtractor


def load_extraction_output(extracted_dir: Path) -> list[dict]:
    """Load all extracted mentions from the extraction output directory."""
    mentions = []
    for jsonl_file in sorted(extracted_dir.rglob("*.jsonl")):
        if "runs.jsonl" in jsonl_file.name:
            continue
        with open(jsonl_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        mentions.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    return mentions


def load_ingestion_stats(raw_dir: Path) -> dict:
    """Load ingestion run stats from the raw zone."""
    runs = []
    for jsonl_file in raw_dir.rglob("ingestion_runs.jsonl"):
        with open(jsonl_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        runs.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    return {
        "total_runs": len(runs),
        "total_landed": sum(r.get("records_landed", 0) for r in runs),
        "total_quarantined": sum(r.get("records_quarantined", 0) for r in runs),
        "latest_run": runs[-1] if runs else None,
    }


def group_mentions_by_week(mentions: list[dict]) -> list[dict]:
    """Group extracted mentions into (skill, week) aggregates."""
    # Count unique postings per (skill, week)
    skill_week_postings: dict[tuple, set[str]] = defaultdict(set)
    skill_categories: dict[str, str] = {}

    for m in mentions:
        key = (m["skill"], m.get("fetched_at", "")[:10])  # group by date for now
        skill_week_postings[key].add(m.get("source_id", ""))
        skill_categories[m["skill"]] = m.get("category", "")

    # Count total unique postings per week
    week_postings: dict[str, set[str]] = defaultdict(set)
    for m in mentions:
        week = m.get("fetched_at", "")[:10]
        week_postings[week].add(m.get("source_id", ""))

    result = []
    for (skill, week), posting_ids in skill_week_postings.items():
        total = len(week_postings[week])
        result.append({
            "skill": skill,
            "category": skill_categories.get(skill, ""),
            "week": week,
            "postings_in_group": total,
            "mentions": len(posting_ids),
        })

    return result


def build_top_skills(shares: list[SkillShare], top_n: int = 20) -> list[dict]:
    """Build ranked top skills for the latest period."""
    # Group by skill, take latest week
    latest_by_skill: dict[str, SkillShare] = {}
    for s in shares:
        if s.suppressed:
            continue
        existing = latest_by_skill.get(s.skill)
        if existing is None or s.week > existing.week:
            latest_by_skill[s.skill] = s

    ranked = sorted(latest_by_skill.values(), key=lambda s: s.share, reverse=True)
    return [
        {
            "skill": s.skill,
            "category": s.category,
            "share": s.share,
            "wilson_lower": s.wilson_lower,
            "wilson_upper": s.wilson_upper,
            "mentions": s.mentions,
            "postings": s.postings_in_group,
        }
        for s in ranked[:top_n]
    ]


def build_taxonomy_json(extractor: SkillExtractor) -> dict:
    """Export the skill taxonomy for the dashboard filters."""
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

    # Load extraction output
    print("Loading extraction output...")
    mentions = load_extraction_output(extracted_dir)
    print(f"  {len(mentions)} mentions loaded")

    if not mentions:
        print("No mentions found. Run extraction first.")
        return 1

    # Group and compute trends
    print("Computing trends...")
    grouped = group_mentions_by_week(mentions)
    shares = compute_skill_shares(grouped, min_n=30)
    deltas = compute_deltas(shares)
    result = build_trend_result(deltas)

    # Export trends
    export_json(result, output_dir / "trends.json")
    print(f"  trends.json: {len(deltas)} data points")

    # Export top skills
    top_skills = build_top_skills(shares)
    with open(output_dir / "top_skills.json", "w", encoding="utf-8") as f:
        json.dump(top_skills, f, indent=2, ensure_ascii=False)
    print(f"  top_skills.json: {len(top_skills)} skills")

    # Export taxonomy
    extractor = SkillExtractor()
    taxonomy = build_taxonomy_json(extractor)
    with open(output_dir / "taxonomy.json", "w", encoding="utf-8") as f:
        json.dump(taxonomy, f, indent=2, ensure_ascii=False)
    print(f"  taxonomy.json: {taxonomy['total_skills']} skills")

    # Export pipeline health
    if args.raw:
        raw_dir = Path(args.raw)
        health = load_ingestion_stats(raw_dir)
        health["generated_at"] = datetime.utcnow().isoformat() + "Z"
        health["extraction"] = {
            "total_mentions": len(mentions),
            "unique_skills": len(set(m["skill"] for m in mentions)),
            "unique_postings": len(set(m.get("source_id", "") for m in mentions)),
        }
        with open(output_dir / "pipeline_health.json", "w", encoding="utf-8") as f:
            json.dump(health, f, indent=2, ensure_ascii=False, default=str)
        print(f"  pipeline_health.json")

    print(f"\nExport complete → {output_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
