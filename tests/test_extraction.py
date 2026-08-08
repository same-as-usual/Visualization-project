"""Tests for the extraction orchestrator (nlp/run.py)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from nlp.run import extract_from_jsonl, main


@pytest.fixture
def sample_raw_jsonl(tmp_path: Path) -> Path:
    """Create a sample raw JSONL file with LandedRecord envelopes."""
    records = [
        {
            "source": "remotive",
            "source_id": "101",
            "run_id": "20260807T120000-remotive-abc12345",
            "fetched_at": "2026-08-07T12:00:00Z",
            "query": {"category": "data"},
            "payload": {
                "id": 101,
                "title": "Data Engineer",
                "description": "<p>We need someone with <b>Python</b>, SQL, and dbt experience.</p>",
                "company_name": "Acme Corp",
                "candidate_required_location": "Worldwide",
                "publication_date": "2026-08-05T00:00:00Z",
                "category": "data",
            },
        },
        {
            "source": "remotive",
            "source_id": "102",
            "run_id": "20260807T120000-remotive-abc12345",
            "fetched_at": "2026-08-07T12:00:00Z",
            "query": {"category": "data"},
            "payload": {
                "id": 102,
                "title": "ML Engineer",
                "description": "Experience with TensorFlow, PyTorch, and AWS required.",
                "company_name": "DataCo",
                "candidate_required_location": "US",
                "publication_date": "2026-08-06T00:00:00Z",
                "category": "data",
            },
        },
    ]
    raw_dir = tmp_path / "raw" / "remotive" / "2026-08-07"
    raw_dir.mkdir(parents=True)
    jsonl_path = raw_dir / "run1.jsonl"
    with open(jsonl_path, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    return jsonl_path


def test_extract_from_jsonl(sample_raw_jsonl: Path, tmp_path: Path):
    """Test extraction from a raw JSONL file."""
    from nlp.extractor import SkillExtractor

    extractor = SkillExtractor()
    output_dir = tmp_path / "extracted"
    stats = extract_from_jsonl(sample_raw_jsonl, output_dir, extractor)

    assert stats["records_read"] == 2
    assert stats["records_extracted"] >= 1
    assert stats["total_mentions"] >= 2
    assert stats["errors"] == 0
    assert stats["source"] == "remotive"

    # Check output file exists and has valid JSONL
    output_files = list(output_dir.rglob("*.jsonl"))
    assert len(output_files) >= 1

    mentions = []
    for f in output_files:
        for line in f.read_text().splitlines():
            if line.strip():
                mentions.append(json.loads(line))

    # Should find Python, SQL, dbt, TensorFlow, PyTorch, AWS etc.
    skill_names = {m["skill"] for m in mentions}
    assert "Python" in skill_names or "SQL" in skill_names


def test_extract_from_jsonl_html_stripping(sample_raw_jsonl: Path, tmp_path: Path):
    """Test that HTML is properly stripped from Remotive descriptions."""
    from nlp.extractor import SkillExtractor

    extractor = SkillExtractor()
    output_dir = tmp_path / "extracted"
    extract_from_jsonl(sample_raw_jsonl, output_dir, extractor)

    mentions = []
    for f in output_dir.rglob("*.jsonl"):
        for line in f.read_text().splitlines():
            if line.strip():
                mentions.append(json.loads(line))

    # Check that no matched_alias contains HTML tags
    for m in mentions:
        assert "<" not in m["matched_alias"]
        assert ">" not in m["matched_alias"]


def test_extract_from_jsonl_empty_description(tmp_path: Path):
    """Test that empty descriptions are handled gracefully."""
    from nlp.extractor import SkillExtractor

    record = {
        "source": "remotive",
        "source_id": "200",
        "run_id": "run2",
        "fetched_at": "2026-08-07T12:00:00Z",
        "query": {},
        "payload": {
            "id": 200,
            "title": "Empty Job",
            "description": "",
        },
    }
    raw_dir = tmp_path / "raw" / "remotive" / "2026-08-07"
    raw_dir.mkdir(parents=True)
    jsonl_path = raw_dir / "empty.jsonl"
    with open(jsonl_path, "w") as f:
        f.write(json.dumps(record) + "\n")

    extractor = SkillExtractor()
    output_dir = tmp_path / "extracted"
    stats = extract_from_jsonl(jsonl_path, output_dir, extractor)

    assert stats["records_read"] == 1
    assert stats["total_mentions"] == 0


def test_main_cli(tmp_path: Path, sample_raw_jsonl: Path):
    """Test the CLI entrypoint."""
    output_dir = tmp_path / "cli_output"
    result = main(["--input", str(sample_raw_jsonl.parent), "--output", str(output_dir)])
    assert result == 0

    # Should have created extraction_runs.jsonl
    run_log = output_dir / "extraction_runs.jsonl"
    assert run_log.exists()
    entries = [json.loads(line) for line in run_log.read_text().splitlines() if line.strip()]
    assert len(entries) == 1
    assert entries[0]["files_processed"] == 1
