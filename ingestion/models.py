"""Pydantic boundary models — every API response is validated before landing.

Records that fail validation are quarantined (not dropped, not crashed on):
the raw zone must stay complete enough to replay, and one malformed record
must never kill a scheduled run.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AdzunaJob(BaseModel):
    """One posting from Adzuna /v1/api/jobs/{country}/search/{page}.

    NOTE: `description` is a TRUNCATED EXCERPT (documented Adzuna behaviour).
    Skill extraction recall on Adzuna text is measured against full-text
    sources in the NLP phase — do not treat this field as full posting text.
    """

    model_config = ConfigDict(extra="allow")  # keep unknown fields in the raw zone

    id: str
    title: str
    description: str = ""
    created: datetime
    redirect_url: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_is_predicted: Optional[str] = None
    company: Optional[dict] = None
    location: Optional[dict] = None
    category: Optional[dict] = None
    contract_type: Optional[str] = None
    contract_time: Optional[str] = None

    @field_validator("id", mode="before")
    @classmethod
    def _id_to_str(cls, v: Any) -> str:
        return str(v)

    @property
    def company_name(self) -> Optional[str]:
        return (self.company or {}).get("display_name")

    @property
    def location_name(self) -> Optional[str]:
        return (self.location or {}).get("display_name")


class RemotiveJob(BaseModel):
    """One posting from Remotive /api/remote-jobs. Full description text."""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    description: str = ""
    publication_date: datetime
    company_name: Optional[str] = None
    category: Optional[str] = None
    job_type: Optional[str] = None
    candidate_required_location: Optional[str] = None
    salary: Optional[str] = None
    url: Optional[str] = None

    @field_validator("id", mode="before")
    @classmethod
    def _id_to_str(cls, v: Any) -> str:
        return str(v)


class LandedRecord(BaseModel):
    """Envelope for one raw record in the append-only landing zone (JSONL).

    `payload` is the verbatim API record — validated but not transformed.
    Everything needed to replay/audit the fetch lives in the envelope.
    """

    source: str  # "adzuna" | "remotive"
    source_id: str
    run_id: str
    fetched_at: datetime
    query: dict  # the query params that produced this record (country, role, page, ...)
    payload: dict

    @classmethod
    def wrap(cls, *, source: str, source_id: str, run_id: str, query: dict, payload: dict) -> "LandedRecord":
        return cls(
            source=source,
            source_id=source_id,
            run_id=run_id,
            fetched_at=datetime.now(timezone.utc),
            query=query,
            payload=payload,
        )


class IngestionRun(BaseModel):
    """One row of pipeline run metadata (appended to data/ingestion_runs.jsonl).

    This is the observability backbone: the dashboard's Pipeline Health page
    and freshness badge are derived from these rows.
    """

    run_id: str
    source: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    backfill: bool = False
    api_calls: int = 0
    records_fetched: int = 0
    records_landed: int = 0
    records_deduped: int = 0  # same source_id seen more than once within this run
    records_quarantined: int = 0
    http_errors: int = 0
    error: Optional[str] = None
    collector_git_sha: Optional[str] = None
    call_budget: Optional[str] = None
