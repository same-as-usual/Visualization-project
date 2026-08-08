"""Tests for aggregation/trends.py — Wilson CIs, deltas, rolling averages."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from aggregation.trends import (
    SkillShare,
    SkillDelta,
    TrendResult,
    wilson_lower,
    wilson_upper,
    compute_skill_shares,
    compute_deltas,
    build_trend_result,
    export_json,
    _rolling_average,
)


class TestWilsonInterval:
    def test_wilson_zero_n(self):
        assert wilson_lower(0, 0.5) == 0.0
        assert wilson_upper(0, 0.5) == 0.0

    def test_wilson_perfect_score(self):
        """When p=1.0 (all postings mention the skill), upper bound should be 1.0."""
        lower = wilson_lower(100, 1.0)
        upper = wilson_upper(100, 1.0)
        assert upper >= 0.9999  # effectively 1.0 (floating point)
        assert lower > 0.9  # should be high

    def test_wilson_zero_score(self):
        """When p=0.0, lower bound should be 0.0."""
        lower = wilson_lower(100, 0.0)
        upper = wilson_upper(100, 0.0)
        assert lower == 0.0
        assert upper < 0.1  # should be low

    def test_wilson_symmetry(self):
        """Wilson interval for p=0.5 should be roughly symmetric."""
        lower = wilson_lower(100, 0.5)
        upper = wilson_upper(100, 0.5)
        assert abs((upper - 0.5) - (0.5 - lower)) < 0.01

    def test_wilson_narrows_with_more_data(self):
        """Interval should be narrower with n=1000 than n=10."""
        width_small = wilson_upper(10, 0.5) - wilson_lower(10, 0.5)
        width_large = wilson_upper(1000, 0.5) - wilson_lower(1000, 0.5)
        assert width_large < width_small

    def test_wilson_bounds_clamped(self):
        """Bounds should stay in [0, 1]."""
        for n in [1, 5, 10, 50]:
            for p in [0.0, 0.1, 0.5, 0.9, 1.0]:
                assert 0.0 <= wilson_lower(n, p) <= 1.0
                assert 0.0 <= wilson_upper(n, p) <= 1.0


class TestComputeSkillShares:
    def test_basic_shares(self):
        data = [
            {"skill": "Python", "category": "language", "week": "2026-32",
             "postings_in_group": 100, "mentions": 45},
        ]
        shares = compute_skill_shares(data)
        assert len(shares) == 1
        assert shares[0].share == 0.45
        assert shares[0].postings_in_group == 100
        assert shares[0].mentions == 45
        assert not shares[0].suppressed

    def test_suppression(self):
        data = [
            {"skill": "Python", "category": "language", "week": "2026-32",
             "postings_in_group": 20, "mentions": 10},
        ]
        shares = compute_skill_shares(data, min_n=30)
        assert shares[0].suppressed is True

    def test_wilson_ci_present(self):
        data = [
            {"skill": "Python", "category": "language", "week": "2026-32",
             "postings_in_group": 100, "mentions": 50},
        ]
        shares = compute_skill_shares(data)
        assert shares[0].wilson_lower > 0.0
        assert shares[0].wilson_upper > shares[0].wilson_lower


class TestComputeDeltas:
    def test_basic_delta(self):
        shares = [
            SkillShare(skill="Python", category="language", week="2026-31",
                       postings_in_group=100, mentions=40, share=0.4),
            SkillShare(skill="Python", category="language", week="2026-32",
                       postings_in_group=100, mentions=50, share=0.5),
        ]
        deltas = compute_deltas(shares)
        assert len(deltas) == 2
        # First week has no previous
        assert deltas[0].previous_share == 0.0
        # Second week delta
        assert deltas[1].previous_share == 0.4
        assert abs(deltas[1].delta_pp - 0.1) < 1e-6
        assert abs(deltas[1].delta_pct - 25.0) < 1e-6

    def test_rolling_average(self):
        """Test that rolling averages are computed correctly."""
        values = [0.1, 0.2, 0.3, 0.4, 0.5]
        result = _rolling_average(values, window=4)
        assert len(result) == 5
        # First value: just [0.1]
        assert result[0] == 0.1
        # Last value: avg of [0.2, 0.3, 0.4, 0.5]
        assert abs(result[4] - 0.35) < 1e-6

    def test_direction_flag(self):
        """Test that direction flags are set correctly."""
        # Create 5 weeks of rising data
        shares = [
            SkillShare(skill="Python", category="language", week=f"2026-{30+i}",
                       postings_in_group=100, mentions=40+i*5,
                       share=(40 + i * 5) / 100)
            for i in range(5)
        ]
        deltas = compute_deltas(shares)
        # After 3+ weeks of rising, direction should be "rising"
        assert deltas[-1].direction == "rising"

    def test_suppressed_direction(self):
        """Suppressed cells should have 'insufficient_data' direction."""
        shares = [
            SkillShare(skill="Rare", category="tool", week="2026-32",
                       postings_in_group=5, mentions=2, share=0.4,
                       suppressed=True),
        ]
        deltas = compute_deltas(shares)
        assert deltas[0].direction == "insufficient_data"


class TestBuildTrendResult:
    def test_summary_counts(self):
        deltas = [
            SkillDelta(skill="Python", category="language", week="2026-32",
                       current_share=0.5, direction="rising"),
            SkillDelta(skill="SQL", category="language", week="2026-32",
                       current_share=0.4, direction="stable"),
            SkillDelta(skill="Rare", category="tool", week="2026-32",
                       current_share=0.01, direction="insufficient_data",
                       suppressed=True),
        ]
        result = build_trend_result(deltas, taxonomy_version="2026.08.0")
        assert result.summary["total_skills"] == 3
        assert result.summary["rising"] == 1
        assert result.summary["stable"] == 1
        assert result.summary["suppressed"] == 1


class TestExportJson:
    def test_export_creates_file(self, tmp_path: Path):
        result = TrendResult(
            generated_at="2026-08-07T12:00:00Z",
            taxonomy_version="2026.08.0",
            groups=[
                SkillDelta(skill="Python", category="language", week="2026-32",
                           current_share=0.5, direction="rising"),
            ],
            summary={"total_skills": 1},
        )
        output_path = tmp_path / "output" / "trends.json"
        export_json(result, output_path)

        assert output_path.exists()
        data = json.loads(output_path.read_text())
        assert data["taxonomy_version"] == "2026.08.0"
        assert len(data["groups"]) == 1
        assert data["groups"][0]["skill"] == "Python"
