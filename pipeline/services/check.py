"""Validate the Services snapshot without upstream requests."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.ingest import COPYRIGHT, validate_snapshot

ROOT = Path(__file__).resolve().parents[2]


def validate_directory(directory: Path):
    catalogue = json.loads((directory / "catalogue.json").read_text())
    history = json.loads((directory / "history.json").read_text())
    validate_snapshot(catalogue, history)
    assert catalogue["entries"], "No valid Services snapshot has been imported"
    assert catalogue["meta"]["firstImportedAt"]
    assert catalogue["meta"]["source"]["commit"]
    assert catalogue["meta"]["source"]["contentHash"]
    license_text = (directory / "LICENSE.txt").read_text()
    assert COPYRIGHT in license_text
    assert "Permission is hereby granted, free of charge" in license_text
    assert 'THE SOFTWARE IS PROVIDED "AS IS"' in license_text
    assert "IN THE SOFTWARE." in " ".join(license_text.split())
    quarantine = json.loads((directory / "quarantine.json").read_text())
    assert quarantine["schemaVersion"] == 1
    if quarantine["accepted"]:
        assert not quarantine["records"] and quarantine["error"] is None
    else:
        assert catalogue["meta"]["status"] == "failed" and quarantine["error"]
    return catalogue


if __name__ == "__main__":
    result = validate_directory(ROOT / "public/data/services")
    counts = result["meta"]["counts"]
    print(f"Services snapshot valid: {counts['current']}/{counts['input']} current records; "
          f"{counts['retired']} retired; {counts['categories']} categories; {counts['jurisdictions']} jurisdictions; "
          f"status={result['meta']['status']}")
