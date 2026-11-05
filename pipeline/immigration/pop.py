"""StatCan 17-10-0148-01 population estimates, July 1, CMA/CA (2021 boundaries): denominators for per-1,000 rates."""
from __future__ import annotations

import zipfile

import pandas as pd

from common.derived_cache import current, mark, signature
from common.fetch import RAW, fetch
from common_i import POP_GEO

URL = "https://www150.statcan.gc.ca/n1/tbl/csv/17100148-eng.zip"
FILTERED = RAW / "statcan_tables" / "17100148" / "filtered_northward.csv"


def build_filtered(z):
    FILTERED.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    with zipfile.ZipFile(z) as zf, zf.open("17100148.csv") as fh:
        for ch in pd.read_csv(fh, dtype=str, chunksize=500_000, encoding="utf-8-sig", keep_default_na=False):
            m = ch["Gender"].eq("Total - gender") & ch["Age group"].eq("All ages")
            parts.append(ch[m][["REF_DATE", "GEO", "DGUID", "UOM", "SCALAR_FACTOR", "VALUE", "STATUS", "SYMBOL"]])
    temporary = FILTERED.with_suffix(".part")
    pd.concat(parts).to_csv(temporary, index=False)
    temporary.replace(FILTERED)
    return FILTERED


def read_filtered() -> pd.DataFrame:
    source = fetch(URL, max_age_days=7)
    expected = signature(source, {"version": 2, "gender": "Total - gender", "age": "All ages"})
    if not current(FILTERED, expected):
        build_filtered(source)
        mark(FILTERED, expected)
    df = pd.read_csv(FILTERED, dtype=str, keep_default_na=False)
    df["VALUE_NUM"] = pd.to_numeric(df["VALUE"], errors="coerce")
    return df
