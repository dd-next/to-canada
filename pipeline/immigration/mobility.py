"""Streaming filter for StatCan 43-10-0022-01 (mobility of immigrant taxfilers; ~20 GB uncompressed CSV).
Streamed from the cached zip (never extracted) into data/raw/statcan_tables/43100022/filtered_northward.csv."""
from __future__ import annotations

import zipfile

import pandas as pd

from common.derived_cache import current, mark, signature
from common.fetch import RAW, fetch
from taxfilers import wanted_geos

URL = "https://www150.statcan.gc.ca/n1/tbl/csv/43100022-eng.zip"
OUT_DIR = RAW / "statcan_tables" / "43100022"
FILTERED = OUT_DIR / "filtered_northward.csv"


def build_filtered(zpath):
    geos = wanted_geos()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = FILTERED.with_suffix(".part")
    first = True
    with zipfile.ZipFile(zpath) as zf, zf.open("43100022.csv") as fh:
        for ch in pd.read_csv(fh, dtype=str, chunksize=500_000, encoding="utf-8-sig", keep_default_na=False):
            m = (ch["GEO"].isin(geos) & ch["Age group at taxation year and sex"].eq("Total, age group")
                 & ch["Pre-admission experience"].eq("Total, pre-admission experience")
                 & ch["Knowledge of official languages at admission"].eq("Total, knowledge of official languages"))
            ch[m].drop(columns=["COORDINATE", "VECTOR", "TERMINATED", "UOM_ID", "SCALAR_ID"], errors="ignore").to_csv(
                tmp, mode="w" if first else "a", header=first, index=False)
            first = False
    tmp.replace(FILTERED)
    return FILTERED


def read_filtered() -> pd.DataFrame:
    source = fetch(URL, max_age_days=7)
    expected = signature(source, {"version": 2, "geos": sorted(wanted_geos())})
    if not current(FILTERED, expected):
        build_filtered(source)
        mark(FILTERED, expected)
    df = pd.read_csv(FILTERED, dtype=str, keep_default_na=False)
    df["VALUE_NUM"] = pd.to_numeric(df["VALUE"], errors="coerce")
    return df
