"""Collection entrypoint.

Usage:
    python -m ingestion.run collect [--source adzuna|remotive|all] [--backfill]
    python -m ingestion.run budget      # print call-budget math and exit

Every invocation appends an IngestionRun row to data/ingestion_runs.jsonl —
success or failure. That log is the source of truth for the Pipeline Health
page and the freshness badge.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

import structlog

from .config import load_config
from .collectors.adzuna import AdzunaCollector
from .collectors.remotive import RemotiveCollector
from .landing import LandingWriter, git_sha, log_run, new_run_id
from .models import IngestionRun

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()


def run_source(source: str, config, *, backfill: bool) -> bool:
    """Run one collector end-to-end. Returns True on success."""
    run_id = new_run_id(source)
    writer = LandingWriter(
        config.collection.landing_dir, config.collection.quarantine_dir, source, run_id
    )
    run = IngestionRun(
        run_id=run_id,
        source=source,
        started_at=datetime.now(timezone.utc),
        backfill=backfill,
        collector_git_sha=git_sha(),
        call_budget=config.budget_summary() if source == "adzuna" else None,
    )
    ok = True
    try:
        if source == "adzuna":
            collector = AdzunaCollector(config)
            collector.check_credentials()
        elif source == "remotive":
            collector = RemotiveCollector(config)
        else:
            raise ValueError(f"unknown source: {source}")
        collector.collect(writer, backfill=backfill)
        run.api_calls = collector.api_calls
        run.records_fetched = collector.records_fetched
        run.http_errors = collector.http_errors
    except Exception as exc:
        run.error = str(exc)
        ok = False
        log.error("run.failed", source=source, run_id=run_id, error=str(exc))
    finally:
        run.records_landed = writer.landed
        run.records_deduped = writer.deduped
        run.records_quarantined = writer.quarantined
        run.finished_at = datetime.now(timezone.utc)
        log_run(config.collection.runs_log, run)
        log.info(
            "run.finished",
            source=source,
            run_id=run_id,
            ok=ok,
            api_calls=run.api_calls,
            landed=run.records_landed,
            deduped=run.records_deduped,
            quarantined=run.records_quarantined,
            http_errors=run.http_errors,
        )
    return ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ingestion")
    parser.add_argument("command", choices=["collect", "budget"])
    parser.add_argument("--source", choices=["adzuna", "remotive", "all"], default="all")
    parser.add_argument("--backfill", action="store_true", help="day-0 backfill (~30 days)")
    parser.add_argument("--config", default="config/pipeline.yaml")
    args = parser.parse_args(argv)

    config = load_config(args.config)  # fails fast on >6 roles or a blown budget

    if args.command == "budget":
        print(config.budget_summary())
        return 0

    sources = ["adzuna", "remotive"] if args.source == "all" else [args.source]
    results = [run_source(s, config, backfill=args.backfill) for s in sources]
    # Partial success exits 0 with errors recorded in ingestion_runs.jsonl:
    # one flaky source must not mark the whole scheduled run red while the
    # other source's data landed fine. All-sources-failed is a real failure.
    return 0 if any(results) else 1


if __name__ == "__main__":
    sys.exit(main())
