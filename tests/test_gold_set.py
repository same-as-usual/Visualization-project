"""Gold-set precision gate: validates extraction accuracy against hand-labeled data.

This test FAILS the build if precision or recall drops below thresholds.
The gold set is in tests/gold_set/labeled_postings.json — each posting has
expected_skills annotated, and we compare extractor output against them.

Target: precision >= 0.85, recall >= 0.70
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from nlp.extractor import SkillExtractor

GOLD_SET_PATH = Path(__file__).parent / "gold_set" / "labeled_postings.json"
PRECISION_THRESHOLD = 0.85
RECALL_THRESHOLD = 0.70


@pytest.fixture
def gold_set() -> list[dict]:
    """Load the gold-set labeled postings."""
    if not GOLD_SET_PATH.exists():
        pytest.skip("Gold set not found — run scripts/build_gold_set.py first")
    with open(GOLD_SET_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def extractor() -> SkillExtractor:
    return SkillExtractor()


def _compute_metrics(
    extracted: set[str],
    expected: set[str],
) -> tuple[float, float, float]:
    """Compute precision, recall, F1."""
    tp = len(extracted & expected)
    fp = len(extracted - expected)
    fn = len(expected - extracted)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return precision, recall, f1


def test_gold_set_precision_recall(gold_set: list[dict], extractor: SkillExtractor):
    """Fail the build if overall precision or recall drops below threshold."""
    all_tp = 0
    all_fp = 0
    all_fn = 0
    per_posting = []

    for posting in gold_set:
        text = posting.get("description", "")
        if posting.get("is_html"):
            text = f"{posting.get('title', '')}. {text}"
            mentions = extractor.extract(text, is_html=True)
        else:
            text = f"{posting.get('title', '')}. {text}"
            mentions = extractor.extract(text)

        extracted_skills = {m.skill for m in mentions}
        expected_skills = set(posting["expected_skills"])

        tp = len(extracted_skills & expected_skills)
        fp = len(extracted_skills - expected_skills)
        fn = len(expected_skills - extracted_skills)

        all_tp += tp
        all_fp += fp
        all_fn += fn

        p, r, f1 = _compute_metrics(extracted_skills, expected_skills)
        per_posting.append({
            "id": posting.get("id", "?"),
            "precision": p,
            "recall": r,
            "f1": f1,
            "fp": sorted(extracted_skills - expected_skills),
            "fn": sorted(expected_skills - extracted_skills),
        })

    overall_precision = all_tp / (all_tp + all_fp) if (all_tp + all_fp) > 0 else 0.0
    overall_recall = all_tp / (all_tp + all_fn) if (all_tp + all_fn) > 0 else 0.0
    overall_f1 = (
        2 * overall_precision * overall_recall / (overall_precision + overall_recall)
        if (overall_precision + overall_recall) > 0 else 0.0
    )

    # Log detailed results
    print(f"\n{'='*60}")
    print(f"Gold-set evaluation: {len(gold_set)} postings")
    print(f"  Precision: {overall_precision:.3f} (threshold: {PRECISION_THRESHOLD})")
    print(f"  Recall:    {overall_recall:.3f} (threshold: {RECALL_THRESHOLD})")
    print(f"  F1:        {overall_f1:.3f}")
    print(f"  TP={all_tp} FP={all_fp} FN={all_fn}")

    # Show worst postings
    worst = sorted(per_posting, key=lambda x: x["f1"])[:5]
    print(f"\n  Worst 5 postings:")
    for w in worst:
        print(f"    {w['id']}: P={w['precision']:.2f} R={w['recall']:.2f} F1={w['f1']:.2f}")
        if w["fp"]:
            print(f"      FP (unexpected): {w['fp']}")
        if w["fn"]:
            print(f"      FN (missed):     {w['fn']}")
    print(f"{'='*60}\n")

    assert overall_precision >= PRECISION_THRESHOLD, (
        f"Precision {overall_precision:.3f} below threshold {PRECISION_THRESHOLD}. "
        f"FP examples: {[w['fp'] for w in worst if w['fp']][:3]}"
    )
    assert overall_recall >= RECALL_THRESHOLD, (
        f"Recall {overall_recall:.3f} below threshold {RECALL_THRESHOLD}. "
        f"FN examples: {[w['fn'] for w in worst if w['fn']][:3]}"
    )
