"""Append-only raw landing zone.

Layout (committed to the `data-raw` branch by the GitHub Actions workflow):

    data/raw/<source>/<YYYY-MM-DD>/<run_id>.jsonl      # LandedRecord per line
    data/quarantine/<source>/<YYYY-MM-DD>/<run_id>.jsonl
    data/ingestion_runs.jsonl                          # IngestionRun per line

Rules: never overwrite, never mutate. The warehouse is rebuildable from this
zone at any time; dedupe happens at load time, not here.
"""

from __future__ import annotations

import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .models import IngestionRun, LandedRecord


def new_run_id(source: str) -> str:
    now = datetime.now(timezone.utc)
    return f"{now:%Y%m%dT%H%M%S}-{source}-{uuid.uuid4().hex[:8]}"


def git_sha() -> str | None:
    # In CI the collector runs from the raw-zone checkout, so prefer the
    # workflow-provided SHA of the *code* repo over `git rev-parse` of the cwd.
    env_sha = os.environ.get("GITHUB_SHA")
    if env_sha:
        return env_sha[:7]
    try:
        return (
            subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=5, check=True,
            ).stdout.strip()
            or None
        )
    except Exception:
        return None


class LandingWriter:
    """Buffers records for one run and appends them as JSONL, append-only.

    Within-run dedupe on source_id: overlapping queries return the same posting
    more than once per run — Adzuna role queries overlap ("data engineer" ads
    also match "data scientist"), and Remotive currently ignores its category
    param entirely. Cross-run dedupe stays a load-time concern (ADR 0003); this
    only prevents landing the identical record twice in one run.
    """

    def __init__(self, base_dir: str | Path, quarantine_dir: str | Path, source: str, run_id: str):
        self.source = source
        self.run_id = run_id
        day = f"{datetime.now(timezone.utc):%Y-%m-%d}"
        self._landing_path = Path(base_dir) / source / day / f"{run_id}.jsonl"
        self._quarantine_path = Path(quarantine_dir) / source / day / f"{run_id}.jsonl"
        self._seen_ids: set[str] = set()
        self.landed = 0
        self.deduped = 0
        self.quarantined = 0

    def land(self, record: LandedRecord) -> bool:
        """Append the record; returns False if this run already landed its id."""
        if record.source_id in self._seen_ids:
            self.deduped += 1
            return False
        self._seen_ids.add(record.source_id)
        self._append(self._landing_path, record.model_dump(mode="json"))
        self.landed += 1
        return True

    def quarantine(self, payload: dict, *, error: str, query: dict) -> None:
        self._append(
            self._quarantine_path,
            {
                "source": self.source,
                "run_id": self.run_id,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "error": error,
                "query": query,
                "payload": payload,
            },
        )
        self.quarantined += 1

    @staticmethod
    def _append(path: Path, obj: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False, default=str) + "\n")


def log_run(runs_log: str | Path, run: IngestionRun) -> None:
    path = Path(runs_log)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(run.model_dump_json() + "\n")
