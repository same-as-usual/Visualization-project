# Skill Trends — job-market skill demand, measured honestly

An automated data pipeline + dashboard that tracks which skills employers are asking
for, across **India and global** job markets, built on legitimate APIs (no scraping).

```
GitHub Actions cron (daily, idempotent)
  → Python collectors (Adzuna IN/US/GB + Remotive, Pydantic-validated at the boundary)
  → append-only raw JSONL on the `data-raw` branch          [Phase 0 — DONE]
  → Postgres (Neon) + dbt: staging → marts, tested          [Phase 1 — DONE]
  → spaCy PhraseMatcher skill extraction, versioned taxonomy [Phase 2 — extractor DONE]
  → extraction orchestrator (raw → mentions JSONL)           [Phase 2 — DONE]
  → gold-set precision gate (CI fails if P<0.85, R<0.70)    [Phase 2 — gate DONE, labels pending]
  → weekly skill-share marts (Wilson CIs, min-n suppression) [Phase 3 — DONE]
  → static JSON export → React + Recharts dashboard (Vercel) [Phase 4 — DONE]
```

## Data sources (see `docs/adr/0001`)
| Source | Coverage | Text | Auth |
|---|---|---|---|
| Adzuna | IN, US, GB (configurable) | truncated excerpts | free key, ~1,000 calls/mo |
| Remotive | global remote roles | **full descriptions** | none |

Adzuna's truncation is a known, measured limitation — the NLP phase quantifies
excerpt-vs-full-text skill recall instead of pretending excerpts are full postings.

## Call budget (enforced, not aspirational)
The config loader computes `roles × countries × pages × runs/day × 31` and **refuses to
start** if it projects past 900 Adzuna calls/month (limit: 1,000).

Default: 6 roles × 3 countries × 1 page × 1 run/day ≈ **558 calls/month**.

```bash
python -m ingestion.run budget   # print the math for the current config
```

## Choosing your roles
Edit `role_queries` in `config/pipeline.yaml` — **any six or fewer** queries
(cap enforced; duplicates rejected; budget re-checked against your selection).

## Running collection

```bash
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
export ADZUNA_APP_ID=...   # free keys: https://developer.adzuna.com
export ADZUNA_APP_KEY=...

python -m ingestion.run collect                      # both sources
python -m ingestion.run collect --source remotive    # no key needed
python -m ingestion.run collect --backfill           # day-0: ~30 days via max_days_old
```

Output (append-only, never mutated — see `docs/adr/0003`):
```
data/raw/<source>/<YYYY-MM-DD>/<run_id>.jsonl   # enveloped verbatim API records
data/quarantine/...                             # records that failed validation
data/ingestion_runs.jsonl                       # run metadata (observability backbone)
```

## Scheduled collection (CI)
`.github/workflows/collect.yml` runs daily at 02:30 UTC and commits raw JSONL to the
`data-raw` branch. Setup:
1. Add repo secrets `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`.
2. Trigger the workflow once manually with `backfill: true` (seeds ~4 weeks of history).
3. Missed cron days recover automatically (`max_days_old=2` re-covers yesterday).

## Skill extraction (`nlp/`)
spaCy PhraseMatcher over a **versioned taxonomy** (`nlp/taxonomy/skills.yaml`,
~120 skills, growing toward ~300 via ESCO/Lightcast mapping). False positives are a
case + context problem, not just word boundaries:
- `plain` — case-insensitive ("python")
- `case_sensitive` — "Excel" the tool matches; "excel in this role" doesn't
- `context_required` — "analysis in R" matches; "apply via our R portal" doesn't
  (the context regex must cover the mention, not merely appear in the document)

Every mention carries `(matched_alias, char_span, taxonomy_version, extractor_version)`
so extraction is reproducible and re-runnable over the raw zone.

```python
from nlp.extractor import SkillExtractor
SkillExtractor().extract("Pipelines in Python, dbt and Snowflake.")
```

## Extraction orchestrator (`nlp/run.py`)
Reads raw JSONL from the landing zone, runs skill extraction, writes mentions JSONL.

```bash
python -m nlp.run --input data/raw/ --output data/extracted/
```

Output mirrors the raw zone layout:
```
data/extracted/<source>/<YYYY-MM-DD>/<run_id>.jsonl   # one line per skill mention
data/extracted/extraction_runs.jsonl                   # per-run stats
```

## Warehouse (`warehouse/`)
Postgres loader with (source, source_id) deduplication and dbt models.

```bash
pip install -e ".[warehouse]"   # installs psycopg2-binary
python -m warehouse.load --db-url $DATABASE_URL --input data/raw/
```

### dbt models (`warehouse/dbt/`)
```
staging/
  stg_postings         — cleaned, typed, deduplicated raw postings
  stg_posting_skills   — join table from NLP extraction

marts/
  fct_skill_mentions   — one row per (posting, skill) with week, role, location
  dim_skills           — skill taxonomy with category
  dim_dates            — week/month/calendar helpers
  weekly_skill_share   — % of postings mentioning each skill, by week/role/location
```

## Aggregation (`aggregation/trends.py`)
Computes trend signals from extraction output:
- **Skill share**: % of postings mentioning each skill (not raw count)
- **Wilson score CIs**: proper confidence intervals, not normal approximation
- **4-week rolling averages**: smooths week-over-week noise
- **Direction flags**: rising / falling / stable / insufficient_data
- **Suppression**: cells with n < 30 are flagged, not hidden

```python
from aggregation.trends import compute_skill_shares, compute_deltas, build_trend_result
shares = compute_skill_shares(data, min_n=30)
deltas = compute_deltas(shares)
result = build_trend_result(deltas)
```

## Dashboard (React + Recharts)
Interactive dashboard with four views:
- **Trend line**: skill demand over time, filterable by role/category
- **Ranked bar chart**: top skills with delta indicators
- **Heatmap**: skill × location matrix
- **Pipeline Health**: collection/extraction stats

```bash
cd dashboard && npm install && npm run dev    # local dev
cd dashboard && npm run build                 # production build
```

### Static JSON export (MVP — no live backend)
```bash
python scripts/export.py --input data/extracted/ --output dashboard/public/data/ --raw data/raw/
```

## Gold-set precision gate (`tests/test_gold_set.py`)
CI fails if extraction precision drops below 0.85 or recall below 0.70.
The gold set is in `tests/gold_set/labeled_postings.json` — 100-150 hand-labeled postings.

```bash
python scripts/build_gold_set.py --input data/raw/ --output tests/gold_set/labeled_postings.json
```

## Tests
```bash
.venv/bin/python -m pytest
```
50 tests covering: config validation, collector HTTP behavior (mocked), landing zone
mechanics, extractor false-positive controls, extraction orchestrator, trend aggregation
(Wilson CIs, deltas, rolling averages), taxonomy hygiene.

## Design records
`docs/adr/` — why these APIs and not scraping (0001), why Actions and not Airflow
(0002), why a git raw zone (0003).

## Project structure
```
skill-trends/
├── config/pipeline.yaml          # single source of truth for collection
├── ingestion/                    # Phase 0: API collectors + landing zone
│   ├── collectors/adzuna.py
│   ├── collectors/remotive.py
│   ├── config.py
│   ├── landing.py
│   ├── models.py
│   └── run.py
├── nlp/                          # Phase 2: skill extraction
│   ├── extractor.py
│   ├── run.py                    # extraction orchestrator
│   └── taxonomy/skills.yaml      # ~120 skills, versioned
├── warehouse/                    # Phase 1: Postgres + dbt
│   ├── loader.py
│   └── dbt/
│       ├── dbt_project.yml
│       └── models/
│           ├── staging/
│           └── marts/
├── aggregation/                  # Phase 3: trend computation
│   └── trends.py
├── dashboard/                    # Phase 4: React + Recharts
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   └── public/data/              # static JSON export target
├── scripts/
│   ├── build_gold_set.py         # gold-set labeling tool
│   └── export.py                 # static JSON exporter
├── tests/
│   ├── gold_set/                 # labeled postings for CI gate
│   ├── test_collectors.py
│   ├── test_config.py
│   ├── test_extraction.py
│   ├── test_extractor.py
│   ├── test_gold_set.py
│   ├── test_landing.py
│   └── test_trends.py
└── docs/
    ├── adr/
    └── plan.md
```
