"""Remotive collector — the full-text companion source.

Endpoint: GET https://remotive.com/api/remote-jobs?category=...&limit=...
No auth required. Remotive asks for polite usage, so we make exactly one call
per configured category per run (default: 2 calls/run).

Why it exists: Adzuna descriptions are truncated excerpts; Remotive provides
full posting text (HTML), which anchors the NLP phase's excerpt-vs-full-text
recall measurement and adds global remote-role coverage.
"""

from __future__ import annotations

import httpx
import structlog
from pydantic import ValidationError
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from ..config import PipelineConfig
from ..landing import LandingWriter
from ..models import LandedRecord, RemotiveJob

log = structlog.get_logger()

BASE_URL = "https://remotive.com/api/remote-jobs"


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        s = exc.response.status_code
        return s == 429 or s >= 500
    return isinstance(exc, (httpx.TransportError, httpx.TimeoutException))


class RemotiveCollector:
    def __init__(self, config: PipelineConfig, client: httpx.Client | None = None):
        self.config = config
        self.client = client or httpx.Client(timeout=60)
        self.api_calls = 0
        self.records_fetched = 0
        self.http_errors = 0

    @retry(
        retry=retry_if_exception(_is_retryable),
        wait=wait_exponential(multiplier=2, min=2, max=60),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def _fetch_category(self, category: str) -> dict:
        resp = self.client.get(
            BASE_URL,
            params={"category": category, "limit": self.config.remotive.limit},
        )
        resp.raise_for_status()
        return resp.json()

    def collect(self, writer: LandingWriter, *, backfill: bool = False) -> None:
        # Remotive has no historical window param; backfill is a no-op distinction
        # here (the API already returns the most recent `limit` postings).
        for category in self.config.remotive.categories:
            query = {"category": category, "limit": self.config.remotive.limit}
            try:
                self.api_calls += 1
                data = self._fetch_category(category)
            except Exception as exc:
                self.http_errors += 1
                log.error("remotive.fetch_failed", **query, error=str(exc))
                continue

            jobs = data.get("jobs", [])
            self.records_fetched += len(jobs)
            for raw in jobs:
                try:
                    job = RemotiveJob.model_validate(raw)
                    writer.land(
                        LandedRecord.wrap(
                            source="remotive",
                            source_id=job.id,
                            run_id=writer.run_id,
                            query=query,
                            payload=raw,
                        )
                    )
                except ValidationError as exc:
                    writer.quarantine(raw, error=str(exc), query=query)

            log.info("remotive.category_done", **query, results=len(jobs))
