"""Trend aggregation: skill mentions → weekly skill-share metrics.

Computes:
- Skill share: % of postings in a (week, role, location) group mentioning each skill
- Week-over-week deltas with Wilson score confidence intervals
- 4-week rolling averages with direction flags
- Suppression for cells with n < 30 (too noisy to report)

This module operates on query results from the dbt marts. It can also work
directly on JSONL extraction output for the static-export MVP path.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


@dataclass
class SkillShare:
    """One skill's share in a (week, role, location) group."""
    skill: str
    category: str
    week: str  # ISO week: YYYY-Www
    role: str | None = None
    location: str | None = None
    postings_in_group: int = 0
    mentions: int = 0
    share: float = 0.0  # mentions / postings_in_group
    wilson_lower: float = 0.0
    wilson_upper: float = 0.0
    suppressed: bool = False  # True when n < 30


@dataclass
class SkillDelta:
    """Week-over-week change for one skill."""
    skill: str
    category: str
    week: str
    role: str | None = None
    location: str | None = None
    current_share: float = 0.0
    previous_share: float = 0.0
    delta_pp: float = 0.0  # percentage points
    delta_pct: float = 0.0  # relative % change
    rolling_4w_avg: float = 0.0
    direction: str = "stable"  # rising | falling | stable | insufficient_data
    suppressed: bool = False


@dataclass
class TrendResult:
    """Complete trend analysis output."""
    generated_at: str
    taxonomy_version: str
    groups: list[SkillDelta]
    summary: dict = field(default_factory=dict)


def wilson_lower(n: int, p: float, z: float = 1.96) -> float:
    """Wilson score interval lower bound (95% CI)."""
    if n == 0:
        return 0.0
    denom = 1 + z**2 / n
    center = p + z**2 / (2 * n)
    spread = z * math.sqrt((p * (1 - p) + z**2 / (4 * n)) / n)
    return max(0.0, (center - spread) / denom)


def wilson_upper(n: int, p: float, z: float = 1.96) -> float:
    """Wilson score interval upper bound (95% CI)."""
    if n == 0:
        return 0.0
    denom = 1 + z**2 / n
    center = p + z**2 / (2 * n)
    spread = z * math.sqrt((p * (1 - p) + z**2 / (4 * n)) / n)
    return min(1.0, (center + spread) / denom)


def compute_skill_shares(
    mentions_by_group: list[dict],
    min_n: int = 30,
) -> list[SkillShare]:
    """Compute skill share percentages with Wilson CIs.

    Args:
        mentions_by_group: list of dicts with keys:
            - skill, category, week, role (opt), location (opt)
            - postings_in_group: total postings in this group
            - mentions: how many postings mention this skill
        min_n: suppress groups with fewer than this many postings

    Returns:
        list of SkillShare objects
    """
    results = []
    for row in mentions_by_group:
        n = row["postings_in_group"]
        mentions = row["mentions"]
        p = mentions / n if n > 0 else 0.0
        suppressed = n < min_n

        ss = SkillShare(
            skill=row["skill"],
            category=row.get("category", ""),
            week=row["week"],
            role=row.get("role"),
            location=row.get("location"),
            postings_in_group=n,
            mentions=mentions,
            share=round(p, 6),
            wilson_lower=round(wilson_lower(n, p), 6),
            wilson_upper=round(wilson_upper(n, p), 6),
            suppressed=suppressed,
        )
        results.append(ss)
    return results


def compute_deltas(
    shares: list[SkillShare],
    min_n: int = 30,
) -> list[SkillDelta]:
    """Compute week-over-week deltas with rolling averages.

    Expects shares sorted by (skill, role, location, week).
    """
    # Group by (skill, role, location)
    groups: dict[tuple, list[SkillShare]] = {}
    for s in shares:
        key = (s.skill, s.role, s.location)
        groups.setdefault(key, []).append(s)

    deltas = []
    for key, group_shares in groups.items():
        # Sort by week
        group_shares.sort(key=lambda x: x.week)
        skill, role, location = key

        # Compute rolling 4-week averages
        share_values = [s.share for s in group_shares]
        rolling_avgs = _rolling_average(share_values, window=4)

        for i, ss in enumerate(group_shares):
            prev_share = group_shares[i - 1].share if i > 0 else 0.0
            delta_pp = ss.share - prev_share
            delta_pct = (delta_pp / prev_share * 100) if prev_share > 0 else 0.0

            # Direction based on rolling average trend
            if ss.suppressed:
                direction = "insufficient_data"
            elif i < 3:
                direction = "insufficient_data"  # not enough history
            else:
                ra = rolling_avgs[i]
                ra_prev = rolling_avgs[i - 1] if i > 0 else ra
                if ra > ra_prev * 1.02:
                    direction = "rising"
                elif ra < ra_prev * 0.98:
                    direction = "falling"
                else:
                    direction = "stable"

            deltas.append(SkillDelta(
                skill=ss.skill,
                category=ss.category,
                week=ss.week,
                role=role,
                location=location,
                current_share=ss.share,
                previous_share=prev_share,
                delta_pp=round(delta_pp, 6),
                delta_pct=round(delta_pct, 2),
                rolling_4w_avg=round(rolling_avgs[i], 6),
                direction=direction,
                suppressed=ss.suppressed,
            ))

    return deltas


def _rolling_average(values: list[float], window: int = 4) -> list[float]:
    """Compute rolling average with the given window size."""
    result = []
    for i in range(len(values)):
        start = max(0, i - window + 1)
        window_vals = values[start:i + 1]
        result.append(sum(window_vals) / len(window_vals))
    return result


def build_trend_result(
    deltas: list[SkillDelta],
    taxonomy_version: str = "",
) -> TrendResult:
    """Package deltas into a TrendResult with summary stats."""
    total_skills = len(set(d.skill for d in deltas))
    total_groups = len(deltas)
    rising = sum(1 for d in deltas if d.direction == "rising")
    falling = sum(1 for d in deltas if d.direction == "falling")
    suppressed = sum(1 for d in deltas if d.suppressed)

    return TrendResult(
        generated_at=datetime.utcnow().isoformat() + "Z",
        taxonomy_version=taxonomy_version,
        groups=deltas,
        summary={
            "total_skills": total_skills,
            "total_data_points": total_groups,
            "rising": rising,
            "falling": falling,
            "stable": total_groups - rising - falling - suppressed,
            "suppressed": suppressed,
        },
    )


def export_json(result: TrendResult, output_path: Path) -> None:
    """Export TrendResult to JSON for the dashboard."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "generated_at": result.generated_at,
        "taxonomy_version": result.taxonomy_version,
        "summary": result.summary,
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
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
