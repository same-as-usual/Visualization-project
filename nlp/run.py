"""Extraction orchestrator: raw JSONL → skill mentions JSONL.

Reads LandedRecord envelopes from the raw zone, runs skill extraction on each
posting's description, and writes SkillMention records to the extraction output
directory.

Usage:
    python -m nlp.run --input data/raw/ --output data/extracted/
    python -m nlp.run --input data/raw/remotive/2026-08-07/ --output data/extracted/

Output layout mirrors the raw zone:
    data/extracted/<source>/<YYYY-MM-DD>/<run_id>.jsonl
    data/extracted/extraction_runs.jsonl   # per-run stats

The extractor is re-runnable: re-running on the same raw zone overwrites
nothing (append-only), and the (taxonomy_version, extractor_version) stamps
on each mention make results reproducible even across taxonomy bumps.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import structlog

from nlp.extractor import SkillExtractor, SkillMention

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()


# Adzuna query country code -> display name for the dashboard heatmap.
_COUNTRY_NAMES = {
    "in": "India",
    "us": "United States",
    "gb": "United Kingdom",
    "au": "Australia",
    "ca": "Canada",
    "de": "Germany",
    "fr": "France",
    "sg": "Singapore",
}


def _posting_meta(source: str, record: dict) -> dict:
    """Pull posting-level metadata (posted date, location) out of a raw record.

    posted_at drives the weekly trend bucketing: the backfill collects postings
    created over the previous ~30 days, so bucketing by posted date (instead of
    fetched date) yields a real multi-week time series from day one.
    """
    payload = record.get("payload", {})
    posted_at = None
    country = None
    location = None

    if source == "adzuna":
        posted_at = payload.get("created")
        query = record.get("query", {}) or {}
        code = (query.get("country") or "").lower()
        loc = payload.get("location", {}) or {}
        area = loc.get("area") or []
        country = _COUNTRY_NAMES.get(code) or (area[0] if area else None)
        location = loc.get("display_name")
    elif source == "remotive":
        posted_at = payload.get("publication_date")
        # Remotive is remote-only; candidate_required_location is a region
        # string like "Europe", "USA", "Worldwide".
        country = payload.get("candidate_required_location") or "Remote"
        location = country

    return {
        "posted_at": posted_at or record.get("fetched_at"),
        "country": country,
        "location": location,
    }


def extract_from_jsonl(
    input_path: Path,
    output_dir: Path,
    extractor: SkillExtractor,
) -> dict:
    """Extract skills from one raw JSONL file. Returns run stats."""
    source = None
    run_id = None
    records_read = 0
    records_extracted = 0
    total_mentions = 0
    errors = 0

    with open(input_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                log.warning("extract.bad_json", file=str(input_path), line=line_num)
                errors += 1
                continue

            records_read += 1
            if source is None:
                source = record.get("source", "unknown")
            if run_id is None:
                run_id = record.get("run_id", input_path.stem)

            payload = record.get("payload", {})
            description = payload.get("description", "")
            title = payload.get("title", "")

            if not description and not title:
                continue

            is_html = source == "remotive"
            text = f"{title}. {description}" if title else description
            mentions = extractor.extract(text, is_html=is_html)
            meta = _posting_meta(source, record)

            if mentions:
                records_extracted += 1
                total_mentions += len(mentions)

            # Postings index: one line per posting, mentions or not. This is
            # the denominator for skill-share percentages — counting only
            # postings with >=1 mention would inflate every share.
            output_path = _output_path(output_dir, source, record, input_path)
            postings_path = output_dir / "postings" / output_path.relative_to(output_dir)
            postings_path.parent.mkdir(parents=True, exist_ok=True)
            with open(postings_path, "a", encoding="utf-8") as out:
                out.write(json.dumps({
                    "source": source,
                    "source_id": record.get("source_id"),
                    "posted_at": meta["posted_at"],
                    "country": meta["country"],
                    "location": meta["location"],
                    "mention_count": len(mentions),
                }, ensure_ascii=False, default=str) + "\n")

            # Write each mention as a line
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "a", encoding="utf-8") as out:
                for mention in mentions:
                    out.write(json.dumps({
                        "source": source,
                        "source_id": record.get("source_id"),
                        "run_id": record.get("run_id"),
                        "fetched_at": record.get("fetched_at"),
                        "posted_at": meta["posted_at"],
                        "country": meta["country"],
                        "location": meta["location"],
                        "skill": mention.skill,
                        "category": mention.category,
                        "matched_alias": mention.matched_alias,
                        "start": mention.start,
                        "end": mention.end,
                        "taxonomy_version": mention.taxonomy_version,
                        "extractor_version": mention.extractor_version,
                    }, ensure_ascii=False, default=str) + "\n")

    return {
        "source": source or "unknown",
        "run_id": run_id or input_path.stem,
        "input_file": str(input_path),
        "records_read": records_read,
        "records_extracted": records_extracted,
        "total_mentions": total_mentions,
        "errors": errors,
        "taxonomy_version": extractor.taxonomy_version,
    }


def _output_path(output_dir: Path, source: str, record: dict, input_path: Path) -> Path:
    """Mirror the raw zone layout under output_dir."""
    # input: data/raw/<source>/<date>/<run_id>.jsonl
    # output: data/extracted/<source>/<date>/<run_id>.jsonl
    parts = input_path.parts
    # Find the source/date/run_id structure
    try:
        raw_idx = parts.index("raw")
        rel = parts[raw_idx + 1:]  # (<source>, <date>, <run_id>.jsonl)
        return output_dir.joinpath(*rel)
    except (ValueError, IndexError):
        # Fallback: use the source from the record
        day = record.get("fetched_at", "")[:10] or "unknown"
        run_id = record.get("run_id", input_path.stem)
        return output_dir / source / day / f"{run_id}.jsonl"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nlp.run")
    parser.add_argument("--input", required=True, help="Raw zone dir or single JSONL file")
    parser.add_argument("--output", required=True, help="Extraction output dir")
    parser.add_argument("--taxonomy", default=None, help="Custom taxonomy path")
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    output_dir = Path(args.output)
    extractor = SkillExtractor(args.taxonomy) if args.taxonomy else SkillExtractor()

    # Collect all JSONL files to process
    if input_path.is_file():
        jsonl_files = [input_path]
    elif input_path.is_dir():
        jsonl_files = sorted(input_path.rglob("*.jsonl"))
        # Exclude ingestion_runs.jsonl and extraction_runs.jsonl
        jsonl_files = [f for f in jsonl_files if "runs.jsonl" not in f.name]
    else:
        log.error("extract.input_not_found", path=str(input_path))
        return 1

    if not jsonl_files:
        log.warning("extract.no_files", path=str(input_path))
        return 0

    log.info("extract.starting", files=len(jsonl_files), taxonomy=extractor.taxonomy_version)

    all_stats = []
    for jsonl_file in jsonl_files:
        stats = extract_from_jsonl(jsonl_file, output_dir, extractor)
        all_stats.append(stats)
        log.info(
            "extract.file_done",
            file=str(jsonl_file),
            records=stats["records_read"],
            extracted=stats["records_extracted"],
            mentions=stats["total_mentions"],
        )

    # Write extraction run log
    run_log_path = output_dir / "extraction_runs.jsonl"
    run_log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(run_log_path, "a", encoding="utf-8") as f:
        entry = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "files_processed": len(jsonl_files),
            "total_records": sum(s["records_read"] for s in all_stats),
            "total_extracted": sum(s["records_extracted"] for s in all_stats),
            "total_mentions": sum(s["total_mentions"] for s in all_stats),
            "total_errors": sum(s["errors"] for s in all_stats),
            "taxonomy_version": extractor.taxonomy_version,
        }
        f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")

    total = sum(s["total_mentions"] for s in all_stats)
    log.info("extract.done", total_mentions=total, files=len(jsonl_files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
