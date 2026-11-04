"""Rebuild every work-domain output: python3 -I pipeline/work/run.py (from the repo root).

Uses the raw cache in data/raw/ (set NORTHWARD_REFRESH=1 to re-download).
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from common.contract import write_processed  # noqa: E402
import wages, lfs, job_search, insights  # noqa: E402


def main():
    occ, table, meta, mismatches, ref_counts, _ = wages.build()
    wages.write(occ, table)
    print(f"wages: {len(occ)} occupations, {len(table['byNoc'])} with wages, {len(table['geos'])} geographies; ER name mismatches: {mismatches}")
    observations, series, period, coverage = lfs.build()
    sources = wages.sources(meta, ref_counts) + lfs.sources()
    sources[0]["notes"].append("ER verification against our places: " + (
        "; ".join(f"ER {m['er']}: place list says '{m['placeName']}', Job Bank says '{m['jobBank']}'" for m in mismatches) or "all names match"))
    write_processed("work", "sources", sources)
    write_processed("work", "metrics", lfs.metrics())
    write_processed("work", "observations", observations)
    write_processed("work", "series", series)
    write_processed("work", "job_search", job_search.build(), check=False)
    write_processed("work", "insights", insights.build(), check=False)
    print(f"lfs: {len(observations)} observations, {len(series)} series, latest {period}")


if __name__ == "__main__":
    main()
