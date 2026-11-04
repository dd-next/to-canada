"""Rebuild every housing & cost output (rents, CMHC, CPI, MBM, insights).

Run from the repo root:   python3 -I pipeline/housing/run.py
Refresh from the network: NORTHWARD_REFRESH=1 python3 -I pipeline/housing/run.py
Writes data/processed/housing/*.json and data/processed/cost/*.json.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from common.contract import write_processed  # noqa: E402
from common.fetch import now_iso  # noqa: E402
from common.statcan import source_record  # noqa: E402
import asking, cmhc, cpi, mbm, insights  # noqa: E402


def main() -> None:
    today = date.today().isoformat()
    # ---- StatCan asking / paid rents
    a_obs, a_series, a_cov, a_ctx = asking.build()
    src_asking = source_record(
        asking.TABLE, reference_period="2019-Q1 to 2026-Q2 (quarterly; REF_DATE is the first month of the quarter)",
        transformations=[
            "Kept apartment rows only: Studio = 'Apartment - No bedroom', 3 bedroom+ = 'Apartment - 3 or more bedrooms'; houses and rooms not used.",
            "REF_DATE 'YYYY-MM' (first month of quarter) relabelled 'YYYY-Qn' (2026-04 -> 2026-Q2).",
            "Values are StatCan's published dollars (rounded to $10); '..' -> null + not_available, E -> use_with_caution.",
            "1-year change = value(t) / value(t-4 quarters) - 1, computed by us from published values and flagged use_with_caution because the comparison quarter (2025-Q2) is modelled by StatCan.",
            "Ottawa and Gatineau use the published Ontario part (2021S050535505) and Quebec part (2021S050524505) of CMA 505."],
        notes=[
            "Experimental Quarterly Rent Statistics: asking rents of units advertised on major rental platforms (Rentals.ca Network, Zumper and others) at any point in the quarter; excludes subsidised units, lease transfers, short-term rentals.",
            "StatCan: 2025-Q2 and 2025-Q3 estimates should be used with caution (one platform unavailable; modelled/interpolated); some Calgary values for those quarters are not available.",
            "Average paid rent (moving average of the last three quarters) is published for a subset of CMAs only (2026-Q2: 5 CMAs for 1-bedroom, 17 for 2-bedroom, 2 for 3+ bedroom; none for studios); we keep 1- and 2-bedroom. Added with the 2026-09-09 release.",
            "Table covers CMAs only: Charlottetown, Brandon, Whitehorse, Yellowknife and Iqaluit are not in it."])
    # ---- CMHC
    c_obs, c_ctx, c_cov, c_prov = cmhc.build()
    any_prov = next(iter(c_prov.values()))
    src_cmhc = {
        "id": cmhc.SID, "title": "Rental Market Survey Data Tables, 2025 edition (October 2025 survey)", "publisher": "Canada Mortgage and Housing Corporation (CMHC)",
        "tableId": "RMS 2025 tables 1.1.1 (vacancy rate) and 1.1.2 (average rent) by centre", "url": cmhc.LANDING,
        "downloadUrl": cmhc.BASE.format(slug="{centre}"), "releaseDate": "2025-12-11", "retrievedAt": any_prov["retrievedAt"],
        "referencePeriod": "October 2025 survey (data collected early October; 2025 edition)",
        "licence": "Open Government Licence – Canada (CMHC Housing Market Information Portal, listed on open.canada.ca); CMHC website terms of use apply to site materials",
        "attribution": "Source: Canada Mortgage and Housing Corporation, Rental Market Survey, 2025.",
        "transformations": ["Read the whole-centre row of Table 1.1.1 (Total vacancy rate) and Table 1.1.2 (average rent by Studio / 1 / 2 / 3+ bedroom) from each centre's workbook.",
                            "Numbers with thousands separators parsed to numbers; CMHC reliability code a/b/c/d kept in the note (d also flagged use_with_caution); '**' -> null + suppressed.",
                            "Ottawa and Gatineau are separate CMHC centres (Ontario part, Quebec part of CMA 505); Quebec-city value read from the 'Québec CMA' row of the Québec workbook."],
        "notes": ["Universe: privately initiated apartment structures of three units and over (purpose-built rentals); rents are those charged for all units in the stock (sitting tenants and new leases), not asking rents.",
                  "CMHC publishes the next (October 2026) survey in December 2026; this is the latest available on 2026-11-04.",
                  "Brandon, Whitehorse and Iqaluit have no CMHC Rental Market Survey data table; Charlottetown and Yellowknife are covered as CAs.",
                  "Per-centre workbooks: " + "; ".join(f"{k}: {v['url']}" for k, v in sorted(c_prov.items()))[:4000]],
        "status": "ok"}
    # ---- CPI
    p_obs, p_series, p_cov, p_ctx = cpi.build()
    src_cpi = source_record(
        cpi.TABLE, reference_period=f"2019-01 to {p_ctx['latest']} (monthly; 12-month changes computed from 2018-01)",
        transformations=["12-month % change = index(t) / index(t-12 months) - 1, rounded to 1 decimal, computed from the published index (2002=100).",
                         "Rent sub-index used: 'Rented accommodation' (city-level series exist only for this aggregate; 'Rent' alone is published for Canada and provinces only).",
                         "Places without a city series receive their province's value, flagged provincial_value."],
        notes=["CPI is a measure of price change, not price level, and is not a cost-of-living index.",
               "Territorial capitals are published without a Rented accommodation series (only Shelter), so cpi_rent_change_1y is not_available for Whitehorse, Yellowknife and Iqaluit; all-items is provided."])
    # ---- MBM (cost domain)
    m_obs, m_ctx = mbm.build()
    src_mbm = source_record(
        mbm.TABLE, reference_period=f"{m_ctx['latest']} (annual), 2023-base MBM, current dollars",
        transformations=["Filtered to Base year '2023 base', Dollar concept 'Current dollars', latest year; components mapped Food, Clothing, Transportation, Shelter, Communication services, Other expenses, Total threshold.",
                         "Each place mapped to an MBM region explicitly (see observation geo and notes)."],
        notes=["Reference family: 2 adults + 2 children (Nunavut: 2 adults + 3 children). Dollars are annual, as published.",
               "Total threshold = sum of components (Communication services is its own component in the 2023-base MBM); Nunavut totals also include Inuusiqattiarniq."])
    src_sizes = source_record(
        mbm.TABLE_SIZES, reference_period="2025 (annual)", transformations=["Used only to verify the square-root equivalence scale (not ingested as observations)."],
        notes=["Total MBM threshold by family size 1..10 persons; matches reference-family total x sqrt(n/4)."])
    chk = mbm.size_check()
    # ---- insights
    ins, ins_extra = insights.build(a_ctx, c_ctx, p_ctx, m_ctx, today)

    # ---- write housing
    metrics = asking.metric_defs() + cmhc.metric_defs() + cpi.metric_defs()
    write_processed("housing", "sources", [src_asking, src_cmhc, src_cpi])
    write_processed("housing", "metrics", metrics)
    write_processed("housing", "observations", a_obs + c_obs + p_obs)
    write_processed("housing", "series", a_series + p_series)
    write_processed("housing", "insights", ins)
    # ---- write cost
    write_processed("cost", "sources", [src_mbm, src_sizes])
    write_processed("cost", "metrics", mbm.metric_defs())
    write_processed("cost", "observations", m_obs)

    print("asking gaps:", {k: v for k, v in a_cov.items() if v != "covered"})
    print("cmhc gaps:", {k: v for k, v in c_cov.items() if not v.startswith("covered")})
    print("cpi geos:", p_cov)
    print("mbm mapping:", m_ctx["cov"])
    print("equivalence-scale check:", chk)
    print("runway:", ins_extra["runway"])
    print("done", now_iso())


if __name__ == "__main__":
    main()
