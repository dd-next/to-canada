"""Rebuild every housing & cost output.  Run from the repo root:  python3 -I pipeline/housing/run.py"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from common.contract import write_processed  # noqa: E402
from common.fetch import now_iso  # noqa: E402
import asking  # noqa: E402


def main(stages: tuple[str, ...] = ("asking",)) -> None:
    sources, metrics, observations, series, ctx = [], [], [], [], {}
    o, s, cov, x = asking.build()
    observations += o
    series += s
    metrics += asking.metric_defs()
    from common.statcan import source_record
    sources.append(source_record(asking.TABLE, reference_period="2019-Q1 to 2026-Q2 (quarterly; REF_DATE is first month of quarter)",
        transformations=["Kept apartment rows only (Studio = 'Apartment - No bedroom'; 3 bedroom+ = 'Apartment - 3 or more bedrooms'); houses and rooms not used.",
                         "REF_DATE 'YYYY-MM' (first month of quarter) relabelled 'YYYY-Qn'.",
                         "Values are StatCan's published dollars (rounded to $10); '..' -> null/not_available, E -> use_with_caution.",
                         "1-year change computed as value(t)/value(t-4 quarters)-1."],
        notes=["Experimental estimates (Quarterly Rent Statistics): asking rents from major online rental platforms (Rentals.ca Network, Zumper and others); in scope = units advertised at any point in the quarter; excludes subsidised, lease transfers, short-term.",
               "StatCan: 2025-Q2 and 2025-Q3 estimates should be used with caution (one platform unavailable; modelled), Calgary values for those quarters partly unavailable.",
               "Average paid rent (moving average of last three quarters, apartments with 1 or 2 bedrooms) is published for 18 CMAs only, added 2026-09-09."]))
    write_processed("housing", "sources", sources)
    write_processed("housing", "metrics", metrics)
    write_processed("housing", "observations", observations)
    write_processed("housing", "series", series)
    print("asking coverage gaps:", {k: v for k, v in cov.items() if v != "covered"})


if __name__ == "__main__":
    main()
