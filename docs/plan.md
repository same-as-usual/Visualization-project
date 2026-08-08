# Skill Trends — Build Plan (Final)

## Status Legend
- DONE — implemented, tested, committed
- BUILD — can be built now (no external blockers)
- BLOCKED — needs user action (credentials, account, etc.)

---

## Phase 0: Collection Pipeline — DONE

| Component | Status |
|---|---|
| Adzuna collector (IN/US/GB, retry, quarantine) | DONE |
| Remotive collector (full-text, no auth) | DONE |
| Append-only JSONL landing zone | DONE |
| Within-run dedupe on `source_id` | DONE |
| `ingestion_runs.jsonl` observability log | DONE |
| Config loader with budget guard (6 roles × 3 countries = 558/mo) | DONE |
| GitHub Actions daily cron (02:30 UTC) + backfill | DONE |
| 30 tests (config, collectors, landing, extractor) | DONE |
| 3 ADRs (sources, orchestration, raw zone) | DONE |

**User action needed:** Add `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` as repo secrets, trigger workflow with `backfill: true`.

---

## Phase 1: Warehouse (Postgres + dbt) — BUILD

### 1a. Postgres loader (`warehouse/loader.py`)
- Read raw JSONL from `data-raw` branch, parse `LandedRecord` envelopes
- Upsert into `raw.postings` with `(source, source_id)` uniqueness
- Track `first_seen_at` / `last_seen_at` / `fetched_count` for reposting detection
- Idempotent: re-running the loader over the same JSONL produces no duplicates
- CLI: `python -m warehouse.load --db-url $DATABASE_URL`

### 1b. dbt models (`warehouse/dbt/`)
```
staging/
  stg_postings         — cleaned, typed, deduplicated raw postings
  stg_posting_skills   — join table from NLP extraction (Phase 2 output)

marts/
  fct_skill_mentions   — one row per (posting, skill) with week, role, location
  dim_skills           — skill taxonomy with category, ESCO URI
  dim_dates            — week/month/calendar helpers
  weekly_skill_share   — % of postings mentioning each skill, by week/role/location
  skill_deltas         — week-over-week % change with Wilson CIs
  trend_signals        — 4-week rolling avg, direction flag, suppression flag (n<30)
```

### 1c. dbt tests
- `unique` / `not_null` on natural keys
- `accepted_values` on source, category
- `relationships` between fct and dim tables
- Custom test: `weekly_skill_share` percentages sum to reasonable range per group

**User action needed:** Neon Postgres connection string → repo secret `DATABASE_URL`.

---

## Phase 2: NLP Extraction — PARTIALLY DONE

### 2a. Skill extractor — DONE
- spaCy PhraseMatcher, 3 match policies (plain / case_sensitive / context_required)
- ~120 skills, versioned taxonomy, alias support
- HTML stripping, char-span output, per-mention metadata

### 2b. Gold-set precision gate — BUILD
- `tests/gold_set/` with 100–150 hand-labeled postings
- Each posting has expected skills annotated (TP/FP/FN)
- CI test computes precision, recall, F1 per skill category
- **Build fails if precision drops below 0.85 or recall below 0.70**
- Labeling tool: simple JSON template + review script

### 2c. Extraction orchestrator — BUILD
- `nlp/run.py`: read from raw JSONL → extract skills → write to extraction output
- CLI: `python -m nlp.run --input data/raw/ --output data/extracted/`
- Output: JSONL with `(source, source_id, skill, category, matched_alias, start, end)`

### 2d. Adzuna vs Remotive recall measurement — BUILD
- Run extractor on overlapping postings (same jobs from both sources)
- Report: Adzuna excerpt recall vs Remotive full-text recall
- This becomes a citable metric ("Adzuna excerpts capture ~65% of skills found in full descriptions")

---

## Phase 3: Aggregation — BUILD

### 3a. Skill frequency computation
- Unit of analysis: **% of postings mentioning a skill** (not raw count)
- Group by: week × role_query × country
- Suppress cells with n < 30 postings (too noisy to report)

### 3b. Trend signals
- Week-over-week % change with **Wilson score intervals** (not normal approximation)
- 4-week rolling average to smooth WoW noise
- Direction flag: rising / falling / stable / insufficient_data
- Incomplete-week shading (current partial week marked as provisional)

### 3c. Implementation
- SQL in dbt marts (Phase 1b) for the core aggregation
- Python module (`aggregation/trends.py`) for the statistical computations
- Export aggregation results as JSON for the dashboard

---

## Phase 4: Dashboard — BUILD

### 4a. React + Recharts frontend
- **Trend line**: skill demand over time, filterable by role/location
- **Ranked bar chart**: top skills this month vs last month, delta highlighted
- **Heatmap**: skill × location matrix
- **Filters**: role, location, date range (interactive, not static)
- **Pipeline Health page**: data freshness, extraction stats, run log

### 4b. Static JSON export (MVP — no live backend)
- `scripts/export.py`: query dbt marts → write JSON files to `public/data/`
- Dashboard reads JSON at build time (no API calls, no cold-start)
- FastAPI backend is a documented stretch goal (after MVP proves the data works)

### 4c. Tech stack
- Vite + React 18 + Recharts + Tailwind CSS
- No D3.js (Recharts covers all three chart types; D3 adds complexity without ROI)
- Deployed to Vercel (static site, free tier, instant cold start)

---

## Phase 5: Deployment — BUILD

| Component | Platform | Why |
|---|---|---|
| Dashboard | Vercel (static) | Free, instant, no cold-start |
| Data pipeline | GitHub Actions | Already running (Phase 0) |
| Warehouse | Neon Postgres (free tier) | Serverless, sleeps when unused |
| Static JSON | Vercel (served with frontend) | No extra infra |

**No live backend for MVP.** Render/Railway free tiers cold-start for 30–60s,
which means the dashboard dying in front of a recruiter. FastAPI is a stretch goal.

---

## Phase 6: Stretch Goals (post-MVP)

- [ ] FastAPI backend for live queries (replace static JSON)
- [ ] ESCO/Lightcast URI mapping in taxonomy
- [ ] Expand taxonomy to 300+ skills
- [ ] Skill co-occurrence network graph
- [ ] Email/Slack alerts for significant trend shifts
- [ ] Historical backfill beyond 30 days (Adzuna `/history` endpoint — salary only, not postings)

---

## Interview Prep (built into the pipeline)

| Question | Answer |
|---|---|
| "Why Adzuna and not scraping LinkedIn?" | Legal/ToS reasoning (ADR 0001). LinkedIn has sued scrapers. |
| "How do you know extraction is accurate?" | Gold-set precision/recall from Phase 2b (target: P≥0.85, R≥0.70). |
| "Isn't 8 weeks too short for trends?" | Honest about this. 4-week rolling + Wilson CIs + min-n suppression. |
| "Why % of postings and not raw count?" | Raw count misleads when posting volume fluctuates. |
| "Why not a live backend?" | Free tiers cold-start 30–60s. Static JSON = instant, reliable. |

---

## Build Order (priority)

1. **Gold-set + CI gate** — makes extraction trustworthy before scaling
2. **Extraction orchestrator** — connects NLP to the pipeline
3. **Postgres loader + dbt** — needs Neon URL from user
4. **Aggregation marts** — needs dbt
5. **Static export + React dashboard** — needs aggregation output
6. **Vercel deployment** — needs dashboard
