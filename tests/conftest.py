import copy

import pytest

from ingestion.config import PipelineConfig

BASE_CONFIG = {
    "role_queries": ["data analyst", "data engineer"],
    "adzuna": {
        "countries": ["in", "us"],
        "pages_per_query": 1,
        "results_per_page": 50,
        "max_days_old": 2,
        "backfill_max_days_old": 30,
        "backfill_pages_per_query": 5,
        "monthly_call_limit": 1000,
        "monthly_budget_guard": 900,
    },
    "remotive": {"categories": ["data"], "limit": 100},
    "collection": {
        "runs_per_day": 1,
        "landing_dir": "data/raw",
        "quarantine_dir": "data/quarantine",
        "runs_log": "data/ingestion_runs.jsonl",
    },
}


@pytest.fixture
def base_config_dict():
    return copy.deepcopy(BASE_CONFIG)


@pytest.fixture
def config(base_config_dict, tmp_path):
    base_config_dict["collection"]["landing_dir"] = str(tmp_path / "raw")
    base_config_dict["collection"]["quarantine_dir"] = str(tmp_path / "quarantine")
    base_config_dict["collection"]["runs_log"] = str(tmp_path / "ingestion_runs.jsonl")
    return PipelineConfig.model_validate(base_config_dict)
