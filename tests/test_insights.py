"""Tests for the extra insight metrics in scripts/export.py."""
from __future__ import annotations

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "export_mod", Path(__file__).resolve().parents[1] / "scripts" / "export.py"
)
export = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(export)


def _postings(n_by_market):
    """Build a postings dict: {(source,id): {country,...}}."""
    postings = {}
    i = 0
    for market, n in n_by_market.items():
        for _ in range(n):
            postings[("adzuna", str(i))] = {"country": market, "posted_at": "2026-08-01T00:00:00Z"}
            i += 1
    return postings


def _mentions(pairs):
    """pairs: list of (posting_index, skill, category)."""
    return [
        {"source": "adzuna", "source_id": str(idx), "skill": s, "category": c}
        for idx, s, c in pairs
    ]


def test_cooccurrence_counts_and_lift():
    postings = _postings({"X": 100})
    # 30 postings mention both React and TypeScript; 10 mention React only.
    mentions = []
    for i in range(30):
        mentions += _mentions([(i, "React", "frontend"), (i, "TypeScript", "language")])
    for i in range(30, 40):
        mentions += _mentions([(i, "React", "frontend")])

    pairs = export.build_cooccurrence(postings, mentions, min_count=10)
    assert pairs, "expected at least one pair above the count floor"
    top = pairs[0]
    assert {top["a"], top["b"]} == {"React", "TypeScript"}
    assert top["count"] == 30
    # lift = P(A&B)/(P(A)P(B)) = 0.30 / (0.40 * 0.30) = 2.5
    assert top["lift"] == 2.5


def test_cooccurrence_drops_negative_association():
    postings = _postings({"X": 100})
    # Two common skills that never co-occur -> lift 0 -> dropped.
    mentions = []
    for i in range(40):
        mentions += _mentions([(i, "A", "x")])
    for i in range(40, 80):
        mentions += _mentions([(i, "B", "y")])
    assert export.build_cooccurrence(postings, mentions, min_count=1) == []


def test_categories_share_and_distinct_skills():
    postings = _postings({"X": 10})
    mentions = _mentions([(0, "Python", "language"), (0, "SQL", "language"),
                          (1, "Python", "language")])
    cats = export.build_categories(postings, mentions)
    lang = next(c for c in cats if c["category"] == "language")
    assert lang["postings"] == 2          # 2 of 10 postings mention a language skill
    assert lang["share"] == 0.2
    assert lang["distinct_skills"] == 2   # Python + SQL


def test_market_specialization_lift():
    # India-heavy skill: 'Tableau' appears in 20% of India postings but little globally.
    postings = _postings({"India": 300, "United States": 300})
    mentions = []
    for i in range(60):                      # 60/300 India postings -> 20% local
        mentions += _mentions([(i, "Tableau", "analytics")])
    spec = export.build_market_specialization(postings, mentions, min_market=100)
    india = next(m for m in spec if m["market"] == "India")
    tableau = next(s for s in india["skills"] if s["skill"] == "Tableau")
    # global share = 60/600 = 0.10; local = 0.20; lift = 2.0
    assert tableau["lift"] == 2.0


def test_movers_uses_latest_complete_week():
    from aggregation.trends import SkillDelta
    deltas = [
        SkillDelta(skill="LLM", category="ml", week="2026-W31", current_share=0.10,
                   delta_pp=0.05, direction="rising"),
        SkillDelta(skill="PHP", category="backend", week="2026-W31", current_share=0.02,
                   delta_pp=-0.03, direction="falling"),
    ]
    out = export.build_movers(deltas, full_weeks={"2026-W31"})
    assert out["latest_week"] == "2026-W31"
    assert out["risers"][0]["skill"] == "LLM"
    assert out["fallers"][0]["skill"] == "PHP"
