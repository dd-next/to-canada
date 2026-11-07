"""Validate neighbourhood snapshots without network access or GIS dependencies."""
import json
import math
import os
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def validate(bundle):
    assert bundle["schemaVersion"] == 1
    assert re.fullmatch(r"[a-z0-9-]+", bundle["placeId"])
    assert bundle["cityName"] and bundle["boundaryNote"] and bundle["boundaryVintage"]
    assert bundle.get("areaType", "neighbourhood") in {"neighbourhood", "census tract", "comparison area"}
    sources = {s["id"] for s in bundle["sources"]}
    assert bundle["boundarySourceId"] in sources
    assert len(sources) == len(bundle["sources"])
    for source in bundle["sources"]:
        assert all(source.get(key) for key in ("title", "publisher", "url", "retrievedAt", "licence", "referencePeriod"))
        assert source["url"].startswith("https://")
        datetime.fromisoformat(source["retrievedAt"].replace("Z", "+00:00"))
    definitions = bundle["definitions"]
    assert definitions, "No measured information in bundle"
    for d in definitions.values():
        assert d["sourceId"] in sources and d["period"] and d["note"]
        assert d["label"] and d["unit"] in {"persons", "percent", "CAD_month", "count"}
    rows = bundle["neighbourhoods"]
    assert rows, "Empty neighbourhood coverage"
    expected_counts = {"toronto": 158, "vancouver": 22, "halifax": 99,
                       "victoria": 10, "winnipeg": 194, "quebec-city": 35}
    if bundle["placeId"] in expected_counts:
        assert len(rows) == expected_counts[bundle["placeId"]], "Incomplete publisher geography"
    if bundle["placeId"] in {"edmonton", "calgary"}:
        assert len(rows) >= 100, "Unexpectedly incomplete neighbourhood coverage"
    assert len({r["id"] for r in rows}) == len(rows), "Duplicate neighbourhood IDs"
    for row in rows:
        assert re.fullmatch(r"[a-z0-9-]+", row["id"])
        assert row["name"] and row["geometry"]["type"] in {"Polygon", "MultiPolygon"}
        assert row["geometry"]["coordinates"]
        polygons = [row["geometry"]["coordinates"]] if row["geometry"]["type"] == "Polygon" else row["geometry"]["coordinates"]
        for polygon in polygons:
            assert polygon
            for ring in polygon:
                assert len(ring) >= 4 and ring[0] == ring[-1], "Unclosed polygon ring"
                for lon, lat, *_ in ring:
                    assert math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90
        assert set(row["metrics"]) == set(definitions)
        for key, metric in row["metrics"].items():
            value = metric["value"]
            if value is None:
                assert metric.get("missingReason"), f"Missing without reason: {row['id']} {key}"
            else:
                assert type(value) in (int, float) and math.isfinite(value) and value >= 0
                if definitions[key]["unit"] == "percent":
                    assert value <= 100, f"Invalid percentage: {row['id']} {key}"
        for metric, listing in (("parks", "parks"), ("rail", "stations")):
            value = row["metrics"].get(metric, {}).get("value")
            if value is not None:
                assert value == len(row[listing]), f"{metric} count/list mismatch: {row['id']}"
            else:
                assert not row[listing], f"Unattributed {listing}: {row['id']}"
        assert len({s["id"] for s in row["stations"]}) == len(row["stations"])
        assert all(0 <= s["distanceToBoundaryM"] <= 800 for s in row["stations"])
        for amenity in row.get("amenities", []):
            assert amenity["name"] and amenity["category"] and amenity["sourceId"] in sources
        description = row.get("description")
        if description:
            datetime.fromisoformat(description["verifiedAt"].replace("Z", "+00:00"))
            assert len(description["sections"]) >= 4
            for section in description["sections"]:
                assert section["kind"] in {"measured", "editorial"}
                assert section["heading"] and len(section["text"]) >= 80
                assert section["sourceIds"] and set(section["sourceIds"]) <= sources
    if bundle["placeId"] in {"toronto", "vancouver"}:
        assert sum(bool(row.get("description")) for row in rows) >= 10, "Description demo incomplete"
    assert len({s["id"] for s in bundle["stations"]}) == len(bundle["stations"])
    for station in bundle["stations"]:
        assert station["name"] and -180 <= station["lon"] <= 180 and -90 <= station["lat"] <= 90
    return len(rows)


def main():
    root = Path(os.environ.get("NORTHWARD_APP_DATA", ROOT / "public" / "data"))
    paths = sorted((root / "neighbourhoods").glob("*.json"))
    assert paths, "No neighbourhood snapshots found"
    for path in paths:
        city = path.stem
        bundle = json.loads(path.read_text())
        assert bundle["placeId"] == city
        print(f"ok {city}: {validate(bundle)} neighbourhoods, source references and metric bounds")


if __name__ == "__main__":
    main()
