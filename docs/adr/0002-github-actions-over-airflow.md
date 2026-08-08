# ADR 0002: GitHub Actions cron, not Airflow/Dagster

**Status:** accepted · 2026-08-07

## Decision
Orchestrate collection with a scheduled GitHub Actions workflow (`collect.yml`),
not a dedicated orchestrator.

## Why
This pipeline is one linear DAG (fetch → validate → land → commit) running once a day.
Airflow/Dagster add an always-on scheduler, a metadata DB, and hosting costs to solve
problems we don't have (fan-out, backfill orchestration, task-level retries across a
large graph). Retries live in the HTTP client (tenacity); observability lives in
`data/ingestion_runs.jsonl`.

## Handling GitHub cron's weaknesses
Scheduled runs are best-effort (delayed or dropped, worst at the top of the hour):
- cron fires at 02:30 UTC, off the congested slots;
- normal runs use `max_days_old=2`, so a missed day is recovered by the next run;
- runs are idempotent — the warehouse dedupes on `(source, source_id)` at load time,
  so overlap or manual re-runs cost API calls, never data quality;
- `workflow_dispatch` allows manual catch-up and the day-0 `--backfill`.

## Revisit when
Multiple interdependent DAGs, cross-task dependencies, or per-task retry policies
become real requirements.
