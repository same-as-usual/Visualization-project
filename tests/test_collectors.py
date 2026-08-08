"""Collector tests against recorded/mocked HTTP — no network, no API keys."""

import json

import httpx
import pytest

from ingestion.collectors.adzuna import AdzunaCollector
from ingestion.collectors.remotive import RemotiveCollector
from ingestion.landing import LandingWriter, new_run_id

ADZUNA_PAGE = {
    "results": [
        {
            "id": 12345,
            "title": "Data Engineer",
            "description": "Build pipelines with Python and SQL...",
            "created": "2026-08-01T10:00:00Z",
            "redirect_url": "https://example.com/1",
            "company": {"display_name": "Acme"},
            "location": {"display_name": "Bengaluru, Karnataka"},
            "category": {"label": "IT Jobs", "tag": "it-jobs"},
            "salary_is_predicted": "1",
        },
        {"id": 99, "title": "Broken record"},  # missing `created` -> quarantine
    ]
}

REMOTIVE_PAGE = {
    "jobs": [
        {
            "id": 777,
            "title": "Remote Data Analyst",
            "description": "<p>Full description with SQL, Tableau, dbt.</p>",
            "publication_date": "2026-08-05T00:00:00",
            "company_name": "Globex",
            "category": "Data",
            "candidate_required_location": "Worldwide",
            "url": "https://remotive.com/jobs/777",
        }
    ]
}


def make_writer(config, source):
    return LandingWriter(
        config.collection.landing_dir,
        config.collection.quarantine_dir,
        source,
        new_run_id(source),
    )


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_adzuna_lands_valid_and_quarantines_invalid(config, monkeypatch, tmp_path):
    monkeypatch.setenv("ADZUNA_APP_ID", "test-id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "test-key")
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=ADZUNA_PAGE)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    collector = AdzunaCollector(config, client=client)
    writer = make_writer(config, "adzuna")
    collector.collect(writer)

    # 2 roles x 2 countries x 1 page = 4 calls (short pages stop pagination anyway)
    assert collector.api_calls == 4
    # The same posting comes back for every query; within-run dedupe lands it once.
    assert writer.landed == 1
    assert writer.deduped == 3
    assert writer.quarantined == 4  # 1 broken record per page (quarantine never dedupes)

    landed_files = list((tmp_path / "raw" / "adzuna").rglob("*.jsonl"))
    assert len(landed_files) == 1
    records = read_jsonl(landed_files[0])
    assert records[0]["source"] == "adzuna"
    assert records[0]["source_id"] == "12345"
    assert records[0]["payload"]["title"] == "Data Engineer"
    assert records[0]["query"]["country"] in ("in", "us")

    # auth + budget params actually sent
    first = calls[0]
    assert first.url.params["app_id"] == "test-id"
    assert first.url.params["max_days_old"] == "2"
    assert first.url.params["sort_by"] == "date"


def test_adzuna_backfill_uses_wide_window(config, monkeypatch):
    monkeypatch.setenv("ADZUNA_APP_ID", "x")
    monkeypatch.setenv("ADZUNA_APP_KEY", "y")
    seen_params = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_params.append(dict(request.url.params))
        return httpx.Response(200, json={"results": []})

    collector = AdzunaCollector(config, client=httpx.Client(transport=httpx.MockTransport(handler)))
    collector.collect(make_writer(config, "adzuna"), backfill=True)
    assert all(p["max_days_old"] == "30" for p in seen_params)


def test_adzuna_missing_credentials_fails_fast(config, monkeypatch):
    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    monkeypatch.delenv("ADZUNA_APP_KEY", raising=False)
    collector = AdzunaCollector(config)
    with pytest.raises(RuntimeError, match="ADZUNA_APP_ID"):
        collector.check_credentials()


def test_adzuna_http_error_does_not_kill_run(config, monkeypatch):
    monkeypatch.setenv("ADZUNA_APP_ID", "x")
    monkeypatch.setenv("ADZUNA_APP_KEY", "y")
    n = {"i": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        n["i"] += 1
        if n["i"] == 1:
            return httpx.Response(403)  # non-retryable, first query fails
        return httpx.Response(200, json={"results": []})

    collector = AdzunaCollector(config, client=httpx.Client(transport=httpx.MockTransport(handler)))
    writer = make_writer(config, "adzuna")
    collector.collect(writer)  # must not raise
    assert collector.http_errors == 1
    assert collector.api_calls == 4


def test_remotive_lands_full_text(config, tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["category"] == "data"
        return httpx.Response(200, json=REMOTIVE_PAGE)

    collector = RemotiveCollector(config, client=httpx.Client(transport=httpx.MockTransport(handler)))
    writer = make_writer(config, "remotive")
    collector.collect(writer)

    assert collector.api_calls == 1
    assert writer.landed == 1
    files = list((tmp_path / "raw" / "remotive").rglob("*.jsonl"))
    records = read_jsonl(files[0])
    assert records[0]["source_id"] == "777"
    assert "dbt" in records[0]["payload"]["description"]
