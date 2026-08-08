"""Build the gold-set: collect real postings and label expected skills.

This script fetches a sample of postings from the raw zone and opens an
interactive labeling session. For each posting, you mark which skills the
extractor SHOULD find. The output is tests/gold_set/labeled_postings.json.

Usage:
    python scripts/build_gold_set.py --input data/raw/ --output tests/gold_set/labeled_postings.json

For headless/CI use, you can also provide a pre-labeled JSON file directly.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from nlp.extractor import SkillExtractor


def collect_sample(input_dir: Path, max_postings: int = 150) -> list[dict]:
    """Collect a diverse sample of postings from the raw zone."""
    postings = []
    seen_ids = set()

    for jsonl_file in sorted(input_dir.rglob("*.jsonl")):
        if "runs.jsonl" in jsonl_file.name:
            continue
        with open(jsonl_file, "r", encoding="utf-8") as f:
            for line in f:
                if len(postings) >= max_postings:
                    break
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue

                source_id = record.get("source_id")
                if source_id in seen_ids:
                    continue
                seen_ids.add(source_id)

                payload = record.get("payload", {})
                postings.append({
                    "id": source_id,
                    "source": record.get("source"),
                    "title": payload.get("title", ""),
                    "description": payload.get("description", ""),
                    "is_html": record.get("source") == "remotive",
                    "expected_skills": [],  # to be filled by labeling
                })

    return postings


def interactive_label(postings: list[dict], extractor: SkillExtractor) -> list[dict]:
    """Interactive labeling: for each posting, confirm/deny extracted skills."""
    labeled = []

    for i, posting in enumerate(postings):
        text = f"{posting['title']}. {posting['description']}"
        mentions = extractor.extract(text, is_html=posting.get("is_html", False))
        extracted = sorted(set(m.skill for m in mentions))

        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(postings)}] {posting['source']}:{posting['id']}")
        print(f"Title: {posting['title']}")
        desc_preview = posting["description"][:200].replace("\n", " ")
        print(f"Desc:  {desc_preview}...")
        print(f"\nExtracted skills: {extracted}")
        print(f"\nOptions: [y] accept all  [e] edit  [s] skip  [q] quit")

        choice = input("> ").strip().lower()

        if choice == "q":
            break
        elif choice == "s":
            continue
        elif choice == "y":
            posting["expected_skills"] = extracted
        elif choice == "e":
            print("Enter expected skills (comma-separated):")
            skills_input = input("> ").strip()
            posting["expected_skills"] = [s.strip() for s in skills_input.split(",") if s.strip()]
        else:
            print("Unknown option, skipping")
            continue

        labeled.append(posting)

    return labeled


def main():
    parser = argparse.ArgumentParser(description="Build gold-set for extraction validation")
    parser.add_argument("--input", required=True, help="Raw zone directory")
    parser.add_argument("--output", default="tests/gold_set/labeled_postings.json")
    parser.add_argument("--max", type=int, default=150, help="Max postings to label")
    parser.add_argument("--non-interactive", action="store_true",
                        help="Just output unlabeled sample (for pre-labeling)")
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_path = Path(args.output)

    postings = collect_sample(input_dir, args.max)
    print(f"Collected {len(postings)} unique postings from {input_dir}")

    if args.non_interactive:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(postings, f, indent=2, ensure_ascii=False)
        print(f"Wrote unlabeled sample to {output_path}")
        print("Label expected_skills manually, then run with --non-interactive=false")
        return

    extractor = SkillExtractor()
    labeled = interactive_label(postings, extractor)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(labeled, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(labeled)} labeled postings to {output_path}")


if __name__ == "__main__":
    main()
