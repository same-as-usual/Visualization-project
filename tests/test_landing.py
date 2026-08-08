import json
from datetime import datetime, timezone

from ingestion.landing import LandingWriter, log_run, new_run_id
from ingestion.models import IngestionRun, LandedRecord


def test_landing_is_append_only(tmp_path):
    run_id = new_run_id("adzuna")
    writer = LandingWriter(tmp_path / "raw", tmp_path / "q", "adzuna", run_id)
    for i in range(3):
        writer.land(
            LandedRecord.wrap(
                source="adzuna", source_id=str(i), run_id=run_id,
                query={"country": "in"}, payload={"id": i},
            )
        )
    files = list((tmp_path / "raw").rglob("*.jsonl"))
    assert len(files) == 1
    lines = files[0].read_text().splitlines()
    assert len(lines) == 3
    assert [json.loads(l)["source_id"] for l in lines] == ["0", "1", "2"]


def test_within_run_dedupe_on_source_id(tmp_path):
    run_id = new_run_id("remotive")
    writer = LandingWriter(tmp_path / "raw", tmp_path / "q", "remotive", run_id)
    rec = lambda: LandedRecord.wrap(
        source="remotive", source_id="777", run_id=run_id,
        query={"category": "data"}, payload={"id": 777},
    )
    assert writer.land(rec()) is True
    assert writer.land(rec()) is False  # same id, same run -> skipped
    assert writer.landed == 1
    assert writer.deduped == 1
    files = list((tmp_path / "raw").rglob("*.jsonl"))
    assert len(files[0].read_text().splitlines()) == 1


def test_run_ids_unique():
    assert new_run_id("adzuna") != new_run_id("adzuna")


def test_run_log_appends(tmp_path):
    log_path = tmp_path / "runs.jsonl"
    for source in ("adzuna", "remotive"):
        log_run(log_path, IngestionRun(
            run_id=new_run_id(source), source=source,
            started_at=datetime.now(timezone.utc),
        ))
    rows = [json.loads(l) for l in log_path.read_text().splitlines()]
    assert [r["source"] for r in rows] == ["adzuna", "remotive"]
