"""Statistics Canada Web Data Service (WDS) helpers.

Docs: https://www.statcan.gc.ca/en/developers/wds/user-guide
Full-table CSV columns: REF_DATE, GEO, DGUID, <dimension columns...>, UOM, UOM_ID,
SCALAR_FACTOR, SCALAR_ID, VECTOR, COORDINATE, VALUE, STATUS, SYMBOL, TERMINATED, DECIMALS
"""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Callable, Iterable

import pandas as pd

from .fetch import RAW, fetch, fetch_json, meta_for

WDS = "https://www150.statcan.gc.ca/t1/wds/rest"
LICENCE = "Statistics Canada Open Licence"
LICENCE_URL = "https://www.statcan.gc.ca/en/reference/licence"


def pid_of(table_id: str) -> str:
    """'46-10-0092-01' -> '46100092' (8-digit product id used by WDS)."""
    digits = table_id.replace("-", "")
    return digits[:8]


def table_url(table_id: str) -> str:
    return f"https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={table_id.replace('-', '')}"


def cube_metadata(table_id: str) -> dict:
    """getCubeMetadata (POST). Returns the 'object' dict (titles, dimensions, members, release time)."""
    res = fetch_json(f"{WDS}/getCubeMetadata", json_payload=[{"productId": int(pid_of(table_id))}], max_age_days=1)
    item = res[0] if isinstance(res, list) else res
    if item.get("status") != "SUCCESS":
        raise RuntimeError(f"getCubeMetadata failed for {table_id}: {item}")
    return item["object"]


def full_table_csv(table_id: str, max_age_days: float | None = 7) -> tuple[Path, Path, dict]:
    """Download the full-table CSV zip once; return (data_csv, metadata_csv, fetch_meta)."""
    pid = pid_of(table_id)
    info = fetch_json(f"{WDS}/getFullTableDownloadCSV/{pid}/en", max_age_days=max_age_days)
    if info.get("status") != "SUCCESS":
        raise RuntimeError(f"getFullTableDownloadCSV failed for {table_id}: {info}")
    zpath = fetch(info["object"], max_age_days=max_age_days)
    out_dir = RAW / "statcan_tables" / pid
    data_csv, meta_csv = out_dir / f"{pid}.csv", out_dir / f"{pid}_MetaData.csv"
    if not data_csv.exists() or data_csv.stat().st_mtime < zpath.stat().st_mtime:
        out_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zpath) as zf:
            zf.extractall(out_dir)
    m = meta_for(zpath)
    m["zipUrl"] = info["object"]
    return data_csv, meta_csv, m


def read_table(
    table_id: str,
    *,
    usecols: Iterable[str] | None = None,
    row_filter: Callable[[pd.DataFrame], pd.DataFrame] | None = None,
    chunksize: int = 250_000,
) -> pd.DataFrame:
    """Read a full table CSV with optional chunked filtering (keeps memory small)."""
    data_csv, _, _ = full_table_csv(table_id)
    parts = []
    for chunk in pd.read_csv(data_csv, dtype=str, usecols=list(usecols) if usecols else None,
                             chunksize=chunksize, encoding="utf-8-sig", keep_default_na=False):
        parts.append(row_filter(chunk) if row_filter else chunk)
    df = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
    if "VALUE" in df.columns:
        df["VALUE_NUM"] = pd.to_numeric(df["VALUE"], errors="coerce")
    return df


# StatCan STATUS codes -> contract flags. See "Symbol legend" on any table page.
STATUS_FLAGS = {
    "..": ["not_available"],
    "...": ["not_available"],
    "x": ["suppressed"],
    "X": ["suppressed"],
    "E": ["use_with_caution"],
    "F": ["too_unreliable"],
}
SYMBOL_FLAGS = {"p": ["preliminary"], "r": ["revised"]}


def flags_for(status: str | None, symbol: str | None) -> list[str]:
    out: list[str] = []
    out += STATUS_FLAGS.get((status or "").strip(), [])
    for s in (symbol or "").strip().split():
        out += SYMBOL_FLAGS.get(s, [])
    return out


def clean_value(value: float | None, status: str | None) -> float | None:
    """F (too unreliable) and suppressed cells become None — never 0."""
    if value is None or pd.isna(value):
        return None
    if (status or "").strip() in ("F", "x", "X", "..", "..."):
        return None
    return float(value)


SCALAR_MULTIPLIER = {"units": 1, "tens": 10, "hundreds": 100, "thousands": 1_000, "millions": 1_000_000, "billions": 1_000_000_000}


def scalar_multiplier(scalar_factor: str) -> int:
    return SCALAR_MULTIPLIER.get((scalar_factor or "units").strip().lower(), 1)


def source_record(table_id: str, *, title: str | None = None, reference_period: str | None = None,
                  transformations: list[str] | None = None, notes: list[str] | None = None) -> dict:
    """Build a contract SourceRecord for a StatCan table from live metadata + fetch metadata."""
    meta = {}
    try:
        meta = cube_metadata(table_id)
    except Exception as e:  # metadata is best-effort; data provenance below still holds
        notes = (notes or []) + [f"Cube metadata unavailable at build time: {e}"]
    _, _, fm = full_table_csv(table_id)
    return {
        "id": f"statcan-{table_id}",
        "title": title or meta.get("cubeTitleEn") or table_id,
        "publisher": "Statistics Canada",
        "tableId": table_id,
        "url": table_url(table_id),
        "downloadUrl": fm.get("zipUrl"),
        "releaseDate": (meta.get("releaseTime") or "")[:10] or None,
        "retrievedAt": fm.get("retrievedAt"),
        "referencePeriod": reference_period or (f"{meta.get('cubeStartDate','')[:10]} to {meta.get('cubeEndDate','')[:10]}" if meta else None),
        "licence": LICENCE,
        "attribution": f"Source: Statistics Canada, Table {table_id}. Reproduced and distributed on an 'as is' basis with the permission of Statistics Canada.",
        "transformations": transformations or [],
        "notes": notes or [],
        "status": "ok",
    }
