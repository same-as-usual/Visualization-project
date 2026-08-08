# ADR 0003: Append-only raw zone on a `data-raw` git branch

**Status:** accepted · 2026-08-07

## Decision
Land every validated API response verbatim as JSONL under `data/raw/<source>/<date>/
<run_id>.jsonl`, committed by CI to a dedicated `data-raw` branch (the "git-scraping"
pattern). Invalid records go to `data/quarantine/...` instead of being dropped.

## Why
- **Replayability:** the warehouse and every downstream mart can be rebuilt from raw at
  any time — including re-running skill extraction when the taxonomy or extractor
  version changes.
- **Free, versioned, auditable storage:** each commit timestamps a run; `git log` is the
  ingestion history; no object store to pay for or lose credentials to.
- **Separation:** raw data never pollutes `main`'s history; local dev output is
  gitignored.

## Rules
1. Never overwrite, never mutate — append-only.
2. Envelope every record (`source`, `source_id`, `run_id`, `fetched_at`, `query`) so a
   record is traceable to the exact API call that produced it.
3. Dedupe is a *load-time* concern (`(source, source_id)` unique key,
   `first_seen_at`/`last_seen_at`), never a landing-time concern.

## Revisit when
Raw volume approaches GitHub repo limits (~1–2 GB) → migrate the landing zone to
object storage (R2/S3), keeping the same layout.
