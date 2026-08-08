"""Postgres loader: raw JSONL → warehouse with (source, source_id) dedupe.

Reads LandedRecord envelopes from the raw zone and upserts into Postgres.
Cross-run deduplication uses (source, source_id) uniqueness with
first_seen_at / last_seen_at tracking for reposting detection.

Usage:
    python -m warehouse.load --db-url $DATABASE_URL --input data/raw/
    python -m warehouse.load --db-url $DATABASE_URL --input data/raw/remotive/2026-08-07/

Idempotent: re-running over the same JSONL produces no duplicates.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import structlog

try:
    import psycopg2
    import psycopg2.extras
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE IF NOT EXISTS raw.postings (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    company_name TEXT,
    location_name TEXT,
    date_posted TIMESTAMPTZ,
    category TEXT,
    contract_type TEXT,
    salary_min DOUBLE PRECISION,
    salary_max DOUBLE PRECISION,
    salary_is_predicted BOOLEAN,
    redirect_url TEXT,
    source_url TEXT,
    raw_payload JSONB NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fetch_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_postings_source ON raw.postings (source);
CREATE INDEX IF NOT EXISTS idx_postings_date ON raw.postings (date_posted);
CREATE INDEX IF NOT EXISTS idx_postings_category ON raw.postings (category);

CREATE TABLE IF NOT EXISTS raw.posting_skills (
    posting_id INTEGER NOT NULL REFERENCES raw.postings(id),
    skill TEXT NOT NULL,
    category TEXT NOT NULL,
    matched_alias TEXT,
    char_start INTEGER,
    char_end INTEGER,
    taxonomy_version TEXT NOT NULL,
    extractor_version TEXT NOT NULL,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (posting_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_posting_skills_skill ON raw.posting_skills (skill);
CREATE INDEX IF NOT EXISTS idx_posting_skills_category ON raw.posting_skills (category);
"""


def ensure_schema(conn) -> None:
    """Create tables if they don't exist."""
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
    conn.commit()
    log.info("warehouse.schema_ready")


def upsert_posting(conn, record: dict) -> int:
    """Upsert a single posting. Returns the posting id."""
    payload = record.get("payload", {})
    source = record["source"]
    source_id = record["source_id"]

    # Extract fields from payload based on source
    if source == "adzuna":
        title = payload.get("title", "")
        description = payload.get("description", "")
        company_name = (payload.get("company") or {}).get("display_name")
        location_name = (payload.get("location") or {}).get("display_name")
        date_posted = payload.get("created")
        category = (payload.get("category") or {}).get("tag")
        contract_type = payload.get("contract_type")
        salary_min = payload.get("salary_min")
        salary_max = payload.get("salary_max")
        salary_is_predicted = _parse_bool(payload.get("salary_is_predicted"))
        redirect_url = payload.get("redirect_url")
        source_url = None
    elif source == "remotive":
        title = payload.get("title", "")
        description = payload.get("description", "")
        company_name = payload.get("company_name")
        location_name = payload.get("candidate_required_location")
        date_posted = payload.get("publication_date")
        category = payload.get("category")
        contract_type = payload.get("job_type")
        salary_min = None
        salary_max = None
        salary_is_predicted = None
        redirect_url = None
        source_url = payload.get("url")
    else:
        log.warning("warehouse.unknown_source", source=source)
        return -1

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO raw.postings (
                source, source_id, title, description, company_name,
                location_name, date_posted, category, contract_type,
                salary_min, salary_max, salary_is_predicted,
                redirect_url, source_url, raw_payload,
                first_seen_at, last_seen_at, fetch_count
            ) VALUES (
                %(source)s, %(source_id)s, %(title)s, %(description)s, %(company_name)s,
                %(location_name)s, %(date_posted)s, %(category)s, %(contract_type)s,
                %(salary_min)s, %(salary_max)s, %(salary_is_predicted)s,
                %(redirect_url)s, %(source_url)s, %(raw_payload)s,
                %(fetched_at)s, %(fetched_at)s, 1
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                last_seen_at = EXCLUDED.last_seen_at,
                fetch_count = raw.postings.fetch_count + 1
            RETURNING id
            """,
            {
                "source": source,
                "source_id": source_id,
                "title": title,
                "description": description,
                "company_name": company_name,
                "location_name": location_name,
                "date_posted": date_posted,
                "category": category,
                "contract_type": contract_type,
                "salary_min": salary_min,
                "salary_max": salary_max,
                "salary_is_predicted": salary_is_predicted,
                "redirect_url": redirect_url,
                "source_url": source_url,
                "raw_payload": json.dumps(payload, default=str),
                "fetched_at": record.get("fetched_at", datetime.now(timezone.utc)),
            },
        )
        row = cur.fetchone()
        return row[0] if row else -1


def upsert_skills(conn, posting_id: int, mentions: list[dict]) -> int:
    """Upsert extracted skills for a posting. Returns count inserted."""
    if not mentions:
        return 0

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO raw.posting_skills (
                posting_id, skill, category, matched_alias,
                char_start, char_end, taxonomy_version, extractor_version
            ) VALUES %s
            ON CONFLICT (posting_id, skill) DO UPDATE SET
                matched_alias = EXCLUDED.matched_alias,
                char_start = EXCLUDED.char_start,
                char_end = EXCLUDED.char_end,
                taxonomy_version = EXCLUDED.taxonomy_version,
                extractor_version = EXCLUDED.extractor_version,
                extracted_at = NOW()
            """,
            [
                (
                    posting_id,
                    m["skill"],
                    m["category"],
                    m.get("matched_alias"),
                    m.get("start"),
                    m.get("end"),
                    m.get("taxonomy_version", ""),
                    m.get("extractor_version", ""),
                )
                for m in mentions
            ],
            page_size=500,
        )
    return len(mentions)


def load_jsonl(conn, input_path: Path) -> dict:
    """Load one JSONL file into the warehouse. Returns stats."""
    records_read = 0
    records_inserted = 0
    records_updated = 0
    errors = 0

    with open(input_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                log.warning("warehouse.bad_json", file=str(input_path), line=line_num)
                errors += 1
                continue

            records_read += 1
            try:
                posting_id = upsert_posting(conn, record)
                if posting_id > 0:
                    records_inserted += 1
            except Exception as e:
                log.warning("warehouse.upsert_error", file=str(input_path), line=line_num, error=str(e))
                errors += 1
                conn.rollback()
                continue

    conn.commit()
    return {
        "file": str(input_path),
        "records_read": records_read,
        "records_inserted": records_inserted,
        "errors": errors,
    }


def _parse_bool(v) -> bool | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.lower() in ("true", "1", "yes")
    return bool(v)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="warehouse.load")
    parser.add_argument("--db-url", required=True, help="Postgres connection string")
    parser.add_argument("--input", required=True, help="Raw zone dir or single JSONL file")
    parser.add_argument("--schema-only", action="store_true", help="Just create schema, don't load")
    args = parser.parse_args(argv)

    if not HAS_PSYCOPG2:
        log.error("warehouse.psycopg2_missing", hint="pip install psycopg2-binary")
        return 1

    conn = psycopg2.connect(args.db_url)
    try:
        ensure_schema(conn)
        if args.schema_only:
            return 0

        input_path = Path(args.input)
        if input_path.is_file():
            jsonl_files = [input_path]
        elif input_path.is_dir():
            jsonl_files = sorted(input_path.rglob("*.jsonl"))
            jsonl_files = [f for f in jsonl_files if "runs.jsonl" not in f.name]
        else:
            log.error("warehouse.input_not_found", path=str(input_path))
            return 1

        if not jsonl_files:
            log.warning("warehouse.no_files", path=str(input_path))
            return 0

        log.info("warehouse.loading", files=len(jsonl_files))
        total_stats = {"records_read": 0, "records_inserted": 0, "errors": 0}
        for jsonl_file in jsonl_files:
            stats = load_jsonl(conn, jsonl_file)
            for k in total_stats:
                total_stats[k] += stats[k]
            log.info("warehouse.file_done", **stats)

        log.info("warehouse.done", **total_stats)
        return 0 if total_stats["errors"] == 0 else 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
