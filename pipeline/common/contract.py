"""Writers/validators for the shared data contract (see src/types/contract.ts).

Every pipeline writes data/processed/<domain>/<name>.json via write_processed().
"""
from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
SEED = ROOT / "pipeline" / "places_seed.json"

UNITS = {"CAD", "CAD_hour", "CAD_month", "CAD_year", "percent", "pp", "degC", "mm", "cm", "days", "hours",
         "count", "persons", "index", "ratio", "minutes", "km", "months"}
FLAGS = {"suppressed", "not_available", "use_with_caution", "too_unreliable", "preliminary", "revised", "rounded",
         "regional_value", "provincial_value", "national_value", "station_proxy", "cma_wide", "annual_wage", "small_sample"}


def geo(level: str, id: str, name: str, dguid: str | None = None, vintage: str | None = None) -> dict:
    g = {"level": level, "id": str(id), "name": name}
    if dguid:
        g["dguid"] = dguid
    if vintage:
        g["vintage"] = vintage
    return g


def obs(place_id: str, metric_id: str, value, period: str, geo_ref: dict, source_id: str,
        flags: list[str] | None = None, note: str | None = None) -> dict:
    if value is not None and (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        value = None
    o = {"placeId": place_id, "metricId": metric_id, "value": value, "period": str(period), "geo": geo_ref,
         "sourceId": source_id}
    fl = sorted(set(flags or []))
    if value is None and not fl:
        fl = ["not_available"]
    if fl:
        o["flags"] = fl
    if note:
        o["note"] = note
    return o


def load_places() -> list[dict]:
    """Verified places from the geography workstream if present, else the lead's seed."""
    verified = PROCESSED / "geo" / "places.json"
    if verified.exists():
        return json.loads(verified.read_text(encoding="utf-8"))
    return json.loads(SEED.read_text(encoding="utf-8"))["places"]


def validate(name: str, data) -> list[str]:
    """Light structural checks; returns a list of problems (empty = OK)."""
    problems: list[str] = []
    if name == "observations":
        keys = Counter()
        for o in data:
            for k in ("placeId", "metricId", "value", "period", "geo", "sourceId"):
                if k not in o:
                    problems.append(f"observation missing {k}: {o}")
            for f in o.get("flags", []):
                if f not in FLAGS:
                    problems.append(f"unknown flag {f}")
            keys[(o.get("placeId"), o.get("metricId"), o.get("period"))] += 1
        problems += [f"duplicate observation key {k}" for k, n in keys.items() if n > 1]
    if name == "metrics":
        for m in data:
            if m.get("unit") not in UNITS:
                problems.append(f"metric {m.get('id')} has unknown unit {m.get('unit')}")
    if name == "series":
        for s in data:
            if s.get("unit") not in UNITS:
                problems.append(f"series {s.get('id')} has unknown unit {s.get('unit')}")
    return problems


def write_processed(domain: str, name: str, data, *, check: bool = True) -> Path:
    out = PROCESSED / domain / f"{name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if check:
        probs = validate(name, data)
        if probs:
            raise ValueError(f"{domain}/{name}: " + "; ".join(probs[:10]))
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")
    return out
