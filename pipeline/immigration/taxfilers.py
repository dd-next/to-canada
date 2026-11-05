"""Streaming filter for the very large StatCan 43-10-0030-01 (immigrant taxfiler income) full-table CSV.

The full CSV is ~16 GB uncompressed, so it is never extracted: we stream it from the cached zip in chunks and keep
only the rows we use in data/raw/statcan_tables/43100030/filtered_northward.csv (a few MB).
"""
from __future__ import annotations

import zipfile
from pathlib import Path

import pandas as pd

from common.derived_cache import current, mark, signature
from common.fetch import RAW, fetch, fetch_json
from common.statcan import WDS
from common_i import TAX_GEO, PROV_NAME

OUT_DIR = RAW / "statcan_tables" / "43100030"
FILTERED = OUT_DIR / "filtered_northward.csv"
KEEP_STATS = ["Total number of residents", "Median employment income", "Median wages, salaries and commissions"]
COLS = ["REF_DATE", "GEO", "DGUID", "Sex", "Pre-admission experience", "Knowledge of official languages at admission",
        "Admission year", "Immigrant admission category", "Statistics", "UOM", "SCALAR_FACTOR", "VALUE", "STATUS", "SYMBOL"]


def wanted_geos() -> set[str]:
    return {"Canada", *PROV_NAME.values(), *TAX_GEO.values()}


def build_filtered(zpath: Path) -> Path:
    geos = wanted_geos()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    first = True
    tmp = FILTERED.with_suffix(".part")

    def run(fh):
        nonlocal first
        for ch in pd.read_csv(fh, dtype=str, usecols=COLS, chunksize=500_000, encoding="utf-8-sig", keep_default_na=False):
            m = (ch["GEO"].isin(geos) & ch["Sex"].eq("Total, sex") & ch["Pre-admission experience"].eq("Total, pre-admission experience")
                 & ch["Knowledge of official languages at admission"].eq("Total, knowledge of official languages")
                 & ch["Statistics"].isin(KEEP_STATS))
            ch[m].to_csv(tmp, mode="w" if first else "a", header=first, index=False)
            first = False

    with zipfile.ZipFile(zpath) as zf:
        with zf.open("43100030.csv") as fh:
            run(fh)
    tmp.replace(FILTERED)
    return FILTERED


def read_filtered() -> pd.DataFrame:
    info = fetch_json(f"{WDS}/getFullTableDownloadCSV/43100030/en", max_age_days=7)
    source = fetch(info["object"], max_age_days=7)
    expected = signature(source, {"version": 2, "geos": sorted(wanted_geos()), "columns": COLS, "statistics": KEEP_STATS})
    if not current(FILTERED, expected):
        build_filtered(source)
        mark(FILTERED, expected)
    df = pd.read_csv(FILTERED, dtype=str, keep_default_na=False)
    df["VALUE_NUM"] = pd.to_numeric(df["VALUE"], errors="coerce")
    return df
