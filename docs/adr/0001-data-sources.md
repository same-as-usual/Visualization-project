# ADR 0001: Adzuna + Remotive APIs, not scraping LinkedIn/Naukri

**Status:** accepted · 2026-08-07

## Decision
Collect postings from the **Adzuna API** (India + US + UK country endpoints, free tier)
and the **Remotive API** (global remote roles, no auth). No scraping of LinkedIn/Naukri.

## Why
- LinkedIn/Naukri prohibit scraping in their ToS and actively block it; LinkedIn has
  litigated against scrapers (hiQ Labs). A pipeline that can be IP-banned or subpoenaed
  mid-project is not a foundation for a time-series dataset.
- Adzuna provides structured metadata (title, location, category, `created` date,
  salary) across the countries we need, with a documented free tier.
- **Known limitation:** Adzuna `description` is a *truncated excerpt*, not full posting
  text. Remotive supplies full descriptions, which anchors the NLP phase's
  excerpt-vs-full-text recall measurement.
- SerpAPI/Google-Jobs was rejected: paid, and ToS-gray in a way that undermines the
  "we chose legitimate sources" position.

## Consequences
- A hard call budget: Adzuna free tier ≈ 1,000 calls/month. The config layer computes
  projected usage (roles × countries × pages × runs/day × 31) and refuses to start past
  a 900-call guard. Default: 6 roles × 3 countries × 1 page × 1 run/day ≈ 558/month.
- Role queries are user-selectable but capped at **six** to keep that budget viable.
- Historical backfill is limited to what `max_days_old=30` returns (still-live ads);
  Adzuna's `/history` endpoint is salary averages only and cannot backfill postings.
