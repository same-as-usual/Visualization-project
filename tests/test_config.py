import pytest
from pydantic import ValidationError

from ingestion.config import PipelineConfig, load_config


def test_default_repo_config_is_valid_and_within_budget():
    cfg = load_config("config/pipeline.yaml")
    assert 1 <= len(cfg.role_queries) <= 6
    assert cfg.projected_monthly_adzuna_calls() <= cfg.adzuna.monthly_budget_guard


def test_role_queries_capped_at_six(base_config_dict):
    base_config_dict["role_queries"] = [f"role {i}" for i in range(7)]
    with pytest.raises(ValidationError, match="capped at 6"):
        PipelineConfig.model_validate(base_config_dict)


def test_six_roles_allowed(base_config_dict):
    base_config_dict["role_queries"] = [f"role {i}" for i in range(6)]
    base_config_dict["adzuna"]["countries"] = ["in"]
    cfg = PipelineConfig.model_validate(base_config_dict)
    assert len(cfg.role_queries) == 6


def test_duplicate_roles_rejected(base_config_dict):
    base_config_dict["role_queries"] = ["data analyst", "Data Analyst"]
    with pytest.raises(ValidationError, match="duplicates"):
        PipelineConfig.model_validate(base_config_dict)


def test_blown_budget_rejected(base_config_dict):
    # 6 roles x 2 countries x 5 pages x 2 runs/day x 31 days = 3720 >> 900 guard
    base_config_dict["role_queries"] = [f"role {i}" for i in range(6)]
    base_config_dict["adzuna"]["pages_per_query"] = 5
    base_config_dict["collection"]["runs_per_day"] = 2
    with pytest.raises(ValidationError, match="exceeds the budget guard"):
        PipelineConfig.model_validate(base_config_dict)


def test_budget_math(base_config_dict):
    cfg = PipelineConfig.model_validate(base_config_dict)
    # 2 roles x 2 countries x 1 page
    assert cfg.adzuna_calls_per_run() == 4
    assert cfg.adzuna_calls_per_run(backfill=True) == 20  # 5 pages
    assert cfg.projected_monthly_adzuna_calls() == 4 * 31
