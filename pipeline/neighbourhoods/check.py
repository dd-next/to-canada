"""Validate neighbourhood snapshots without network access or GIS dependencies."""
import json
import math
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def validate(bundle):
    assert bundle["schemaVersion"] == 1
    assert bundle["placeId"] in {"edmonton", "calgary"}
    sources = {s["id"] for s in bundle["sources"]}
    assert bundle["boundarySourceId"] in sources
    assert len(sources) == len(bundle["sources"])
    definitions = bundle["definitions"]
    for d in definitions.values():
        assert d["sourceId"] in sources and d["period"] and d["note"]
    rows = bundle["neighbourhoods"]
    assert len(rows) >= 100, "Unexpectedly incomplete neighbourhood coverage"
    assert len({r["id"] for r in rows}) == len(rows), "Duplicate neighbourhood IDs"
    for row in rows:
        assert re.fullmatch(r"[a-z0-9-]+", row["id"])
        assert row["name"] and row["geometry"]["type"] in {"Polygon", "MultiPolygon"}
        assert row["geometry"]["coordinates"]
        assert set(row["metrics"]) == set(definitions)
        for key, metric in row["metrics"].items():
            value = metric["value"]
            if value is None:
                assert metric.get("missingReason"), f"Missing without reason: {row['id']} {key}"
            else:
                assert isinstance(value, (int, float)) and math.isfinite(value) and value >= 0
                if definitions[key]["unit"] == "percent":
                    assert value <= 100, f"Invalid percentage: {row['id']} {key}"
        assert row["metrics"]["parks"]["value"] == len(row["parks"])
        assert row["metrics"]["rail"]["value"] == len(row["stations"])
        assert all(0 <= s["distanceToBoundaryM"] <= 800 for s in row["stations"])
    return len(rows)


def main():
    root = Path(os.environ.get("NORTHWARD_APP_DATA", ROOT / "public" / "data"))
    for city in ("edmonton", "calgary"):
        path = root / "neighbourhoods" / f"{city}.json"
        bundle = json.loads(path.read_text())
        assert bundle["placeId"] == city
        print(f"ok {city}: {validate(bundle)} neighbourhoods, source references and metric bounds")


if __name__ == "__main__":
    main()
