"""Pipeline configuration: load, validate, and enforce the API call budget.

Design decisions encoded here (see docs/adr/):
- Role queries are user-selectable but capped at SIX. The cap exists because the
  Adzuna free tier (~1,000 calls/month) is the binding constraint; the budget
  check below turns that constraint into a fail-fast validation instead of a
  silent mid-month cutoff.
"""

from __future__ import annotations

from pathlib import Path
from typing import List

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator

MAX_ROLE_QUERIES = 6
DAYS_PER_MONTH = 31  # worst case, for budget projection


class AdzunaConfig(BaseModel):
    countries: List[str] = Field(min_length=1)
    pages_per_query: int = Field(ge=1, le=10)
    results_per_page: int = Field(ge=1, le=50)  # Adzuna caps at 50
    max_days_old: int = Field(ge=1, le=60)
    backfill_max_days_old: int = Field(ge=1, le=60)
    backfill_pages_per_query: int = Field(ge=1, le=20)
    monthly_call_limit: int = Field(ge=1)
    monthly_budget_guard: int = Field(ge=1)

    @field_validator("countries")
    @classmethod
    def _lowercase_countries(cls, v: List[str]) -> List[str]:
        return [c.strip().lower() for c in v]


class RemotiveConfig(BaseModel):
    categories: List[str] = Field(min_length=1)
    limit: int = Field(ge=1, le=1000)


class CollectionConfig(BaseModel):
    runs_per_day: int = Field(ge=1, le=4)
    landing_dir: str
    quarantine_dir: str
    runs_log: str


class PipelineConfig(BaseModel):
    role_queries: List[str] = Field(min_length=1)
    adzuna: AdzunaConfig
    remotive: RemotiveConfig
    collection: CollectionConfig

    @field_validator("role_queries")
    @classmethod
    def _validate_roles(cls, v: List[str]) -> List[str]:
        cleaned = [r.strip() for r in v if r and r.strip()]
        if not cleaned:
            raise ValueError("at least one role query is required")
        if len(cleaned) > MAX_ROLE_QUERIES:
            raise ValueError(
                f"role_queries is capped at {MAX_ROLE_QUERIES} (got {len(cleaned)}). "
                "The cap keeps the Adzuna free-tier call budget viable — pick your six."
            )
        if len(set(r.lower() for r in cleaned)) != len(cleaned):
            raise ValueError("role_queries contains duplicates")
        return cleaned

    @model_validator(mode="after")
    def _validate_call_budget(self) -> "PipelineConfig":
        projected = self.projected_monthly_adzuna_calls()
        if projected > self.adzuna.monthly_budget_guard:
            raise ValueError(
                f"Projected Adzuna usage of {projected} calls/month exceeds the budget guard "
                f"({self.adzuna.monthly_budget_guard}, free-tier limit "
                f"{self.adzuna.monthly_call_limit}). Reduce role_queries, countries, "
                "pages_per_query, or collection.runs_per_day."
            )
        return self

    # ---- budget math -----------------------------------------------------
    def adzuna_calls_per_run(self, backfill: bool = False) -> int:
        pages = (
            self.adzuna.backfill_pages_per_query if backfill else self.adzuna.pages_per_query
        )
        return len(self.role_queries) * len(self.adzuna.countries) * pages

    def projected_monthly_adzuna_calls(self) -> int:
        return self.adzuna_calls_per_run() * self.collection.runs_per_day * DAYS_PER_MONTH

    def budget_summary(self) -> str:
        return (
            f"{len(self.role_queries)} roles x {len(self.adzuna.countries)} countries x "
            f"{self.adzuna.pages_per_query} page(s) = {self.adzuna_calls_per_run()} calls/run; "
            f"{self.collection.runs_per_day} run(s)/day -> "
            f"~{self.projected_monthly_adzuna_calls()} calls/month "
            f"(guard {self.adzuna.monthly_budget_guard}, "
            f"limit {self.adzuna.monthly_call_limit})"
        )


def load_config(path: str | Path = "config/pipeline.yaml") -> PipelineConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return PipelineConfig.model_validate(raw)
