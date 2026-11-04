"""Shared helpers for the housing & cost pipeline (place geography mapping, period labels)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import geo, load_places  # noqa: E402

PROC_HOUSING = "housing"
PROC_COST = "cost"


def norm_place(p: dict) -> dict:
    """Normalise seed (flat) or verified (Place.geo.*) place records."""
    g = p.get("geo") or {}
    cma = g.get("cma") or p.get("cma")
    part = g.get("cmaPart") or p.get("cmaPart")
    prov = p["province"]
    return {"id": p["id"], "name": p["name"], "province": prov, "tier": p.get("tier"), "cma": cma, "part": part,
            "raw": p}


def places() -> list[dict]:
    return [norm_place(p) for p in load_places()]


def dguid_for_cma(cma: dict) -> str:
    """CMA -> 2021S0503xxx ; CA -> 2021S0504xxx (SGC-based DGUID schema)."""
    if cma.get("dguid"):
        return cma["dguid"]
    return ("2021S0503" if cma["level"] == "cma" else "2021S0504") + cma["id"]


def statcan_geo_key(pl: dict) -> tuple[str, dict] | tuple[None, None]:
    """DGUID and GeoRef of the geography StatCan publishes for this place.

    Ottawa/Gatineau use the provincial part (CMA 505 parts 35505 / 24505) where the table has parts.
    """
    if pl["part"]:
        c = pl["part"]
        return "2021S0505" + c["id"], geo("cma_part", c["id"], c["name"], "2021S0505" + c["id"], "2021")
    if pl["cma"]:
        c = pl["cma"]
        d = dguid_for_cma(c)
        return d, geo(c["level"], c["id"], c["name"], d, "2021")
    return None, None


def quarter_label(ref_date: str) -> str:
    """StatCan quarterly REF_DATE 'YYYY-MM' (first month of quarter) -> 'YYYY-Qn'."""
    y, m = ref_date[:4], int(ref_date[5:7])
    return f"{y}-Q{(m - 1) // 3 + 1}"
