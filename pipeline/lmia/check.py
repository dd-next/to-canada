"""Validate every committed LMIA partition and its coverage accounting."""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lmia.ingest import DATASET_ID, safe_url, validate_catalogue_cache, validate_partition


def validate_directory(directory: Path):
    cache = directory / "catalogue.json"
    cached = None
    if cache.exists():
        cached = validate_catalogue_cache(json.loads(cache.read_text()))
    metadata = json.loads((directory / "metadata.json").read_text())
    if metadata.get("schemaVersion") != 1 or metadata.get("dataset", {}).get("id") != DATASET_ID:
        raise ValueError("Invalid LMIA metadata")
    if metadata.get("status") not in ("ok", "partial", "failed"):
        raise ValueError("Invalid LMIA refresh status")
    if metadata.get("catalogue", {}).get("status") == "cached":
        catalogue = metadata["catalogue"]
        if not cached or catalogue.get("checkedAt") != cached["checkedAt"] or catalogue.get("sha256") != cached["packageSha256"]:
            raise ValueError("LMIA cached-catalogue metadata and verified cache disagree")
    migrations = metadata.get("normalizationMigrations", [])
    if not isinstance(migrations, list):
        raise ValueError("Invalid LMIA normalization history")
    for migration in migrations:
        if not isinstance(migration, dict):
            raise ValueError("Invalid LMIA normalization audit reference")
        published_path = migration.get("auditPath")
        if not isinstance(published_path, str) or not published_path.startswith("lmia/normalization-audits/"):
            raise ValueError("Invalid LMIA normalization audit path")
        relative = Path(published_path.removeprefix("lmia/"))
        path = directory / relative
        if relative.is_absolute() or ".." in relative.parts or not path.resolve().is_relative_to(directory.resolve()):
            raise ValueError("Unsafe LMIA normalization audit path")
        if not path.is_file():
            raise ValueError("Missing LMIA normalization audit")
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != migration.get("auditSha256"):
            raise ValueError("LMIA normalization audit hash mismatch")
        audit = json.loads(raw)
        if (not isinstance(audit, dict) or audit.get("schemaVersion") != 1
                or audit.get("migrationId") != migration.get("id")
                or audit.get("migrationVersion") != migration.get("version")
                or audit.get("appliedAt") != migration.get("appliedAt")
                or not isinstance(audit.get("summary"), dict)
                or audit["summary"].get("changedRows") != migration.get("changedRows")):
            raise ValueError("LMIA normalization audit and history disagree")
    resources = {r["id"]: r for r in metadata["resources"]}
    if len(resources) != len(metadata["resources"]):
        raise ValueError("Duplicate LMIA resource metadata")
    for r in metadata["resources"]:
        if not safe_url(r["url"]):
            raise ValueError("Unsafe LMIA resource URL")
    periods = sorted(metadata["periods"], key=lambda p: p["start"])
    total, end = 0, None
    for period in periods:
        if end is not None and period["start"] <= end:
            raise ValueError("Overlapping LMIA periods would double count decisions")
        date.fromisoformat(period["start"])
        date.fromisoformat(period["end"])
        if period["end"] < period["start"]:
            raise ValueError("Reversed LMIA period")
        end = period["end"]
        prefix = "lmia/"
        if not period["indexPath"].startswith(prefix):
            raise ValueError("Invalid LMIA partition path")
        relative = Path(period["indexPath"][len(prefix):])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Invalid LMIA partition path")
        path = directory / relative
        value = json.loads(path.read_text())
        count = validate_partition(value)
        if count != period["rowCount"] or value["resourceId"] != period["resourceId"] or value["periodId"] != period["id"]:
            raise ValueError("LMIA period and partition disagree")
        resource = resources.get(value["resourceId"])
        if not resource or not resource.get("sha256") or not resource.get("retrievedAt") or resource["rows"] != count:
            raise ValueError("LMIA partition has incomplete source provenance")
        total += count
    if total != metadata["coverage"]["rowCount"] or len(periods) != metadata["coverage"]["periodCount"]:
        raise ValueError("LMIA coverage totals disagree")
    if periods:
        if metadata["coverage"]["start"] != periods[0]["start"] or metadata["coverage"]["end"] != periods[-1]["end"]:
            raise ValueError("LMIA coverage dates disagree")
    elif metadata["status"] != "failed" or metadata["coverage"]["start"] is not None or metadata["coverage"]["end"] is not None:
        raise ValueError("No LMIA data cannot be reported as successful coverage")
    return metadata


if __name__ == "__main__":
    data = validate_directory(Path(__file__).resolve().parents[2] / "public/data/lmia")
    print(f"LMIA: {data['coverage']['rowCount']:,} rows; {len(data['periods'])} non-overlapping periods; status={data['status']}")
