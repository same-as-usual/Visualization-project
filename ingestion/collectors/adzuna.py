"""Adzuna collector.

Endpoint: GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}
Auth: app_id/app_key query params (ADZUNA_APP_ID / ADZUNA_APP_KEY env vars).

Budget discipline: every call is counted; the run is shaped by the validated
config (roles x countries x pages), which the config layer has already checked
against the free-tier monthly limit.

Resilience: normal runs use max_days_old=2 so a missed cron day is recovered
by the next run for free. `backfill=True` uses max_days_old=30 + more pages to
seed ~4 weeks of history on day 0 (postings are bucketed downstream by their
source-claimed `created` date, not fetch date).
"""

from __future__ import annotations

import os

import httpx
import structlog
from pydantic import ValidationError
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from ..config import PipelineConfig
from ..landing import LandingWriter
from ..models import AdzunaJob, LandedRecord

log = structlog.get_logger()

BASE_URL = "https://api.adzuna.com/v1/api/jobs"


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        s = exc.response.status_code
        return s == 429 or s >= 500
    return isinstance(exc, (httpx.TransportError, httpx.TimeoutException))


class AdzunaCollector:
    def __init__(self, config: PipelineConfig, client: httpx.Client | None = None):
        self.config = config
        self.app_id = os.environ.get("ADZUNA_APP_ID", "")
        self.app_key = os.environ.get("ADZUNA_APP_KEY", "")
        self.client = client or httpx.Client(timeout=30)
        self.api_calls = 0
        self.records_fetched = 0
        self.http_errors = 0

    def check_credentials(self) -> None:
        if not self.app_id or not self.app_key:
            raise RuntimeError(
                "ADZUNA_APP_ID / ADZUNA_APP_KEY not set. "
                "Get free keys at https://developer.adzuna.com and export them "
                "(locally: .env / shell; CI: repository secrets)."
            )

    @retry(
        retry=retry_if_exception(_is_retryable),
        wait=wait_exponential(multiplier=2, min=2, max=60),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def _fetch_page(self, country: str, role: str, page: int, max_days_old: int) -> dict:
        url = f"{BASE_URL}/{country}/search/{page}"
        resp = self.client.get(
            url,
            params={
                "app_id": self.app_id,
                "app_key": self.app_key,
                "what": role,
                "results_per_page": self.config.adzuna.results_per_page,
                "max_days_old": max_days_old,
                "sort_by": "date",
                "content-type": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()

    def collect(self, writer: LandingWriter, *, backfill: bool = False) -> None:
        cfg = self.config.adzuna
        pages = cfg.backfill_pages_per_query if backfill else cfg.pages_per_query
        max_days_old = cfg.backfill_max_days_old if backfill else cfg.max_days_old

        for country in cfg.countries:
            for role in self.config.role_queries:
                for page in range(1, pages + 1):
                    query = {
                        "country": country,
                        "role": role,
                        "page": page,
                        "max_days_old": max_days_old,
                    }
                    try:
                        self.api_calls += 1
                        data = self._fetch_page(country, role, page, max_days_old)
                    except Exception as exc:
                        self.http_errors += 1
                        log.error("adzuna.fetch_failed", **query, error=str(exc))
                        continue  # one failed page must not kill the run

                    results = data.get("results", [])
                    self.records_fetched += len(results)
                    for raw in results:
                        try:
                            job = AdzunaJob.model_validate(raw)
                            writer.land(
                                LandedRecord.wrap(
                                    source="adzuna",
                                    source_id=job.id,
                                    run_id=writer.run_id,
                                    query=query,
                                    payload=raw,
                                )
                            )
                        except ValidationError as exc:
                            writer.quarantine(raw, error=str(exc), query=query)

                    log.info("adzuna.page_done", **query, results=len(results))
                    if len(results) < cfg.results_per_page:
                        break  # exhausted this query; save the remaining page calls
