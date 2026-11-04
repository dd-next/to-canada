# Housing and household costs pipeline (workstream A)

Rebuild everything (from the raw cache, or the network when a file is missing):

    python3 -I pipeline/housing/run.py            # from the repo root
    NORTHWARD_REFRESH=1 python3 -I pipeline/housing/run.py   # force re-download

Outputs: `data/processed/housing/{sources,metrics,observations,series,insights}.json` and
`data/processed/cost/{sources,metrics,observations}.json`. Code: `asking.py` (StatCan rents), `cmhc.py` (CMHC),
`cpi.py` (CPI), `mbm.py` (Market Basket Measure), `insights.py`, `common_h.py` (place -> official geography mapping).

## Sources (all downloaded with `common.fetch`, cached in `data/raw/`)

| id | what | period / release |
|---|---|---|
| `statcan-46-10-0092-01` | Asking rent *and* average paid rent (experimental Quarterly Rent Statistics), apartments by bedrooms, CMAs | 2019-Q1 to 2026-Q2, released 2026-09-09. Paid rent (3-quarter moving average) exists for a subset of CMAs only |
| `cmhc-rms-2025` | CMHC Rental Market Survey data tables, tables 1.1.1 (vacancy) and 1.1.2 (average rent), one workbook per centre on assets.cmhc-schl.gc.ca | October 2025 survey, published 2025-12-11 (next edition due Dec 2026) |
| `statcan-18-10-0004-01` | CPI monthly, 2002=100: 'Rented accommodation' and 'All-items' | to 2026-09, released 2026-10-19 |
| `statcan-11-10-0066-01` | MBM thresholds, reference family, by region and component (2023 base, current dollars) | 2025, released 2026-04-29 |
| `statcan-11-10-0104-01` | MBM total by family size (used only to verify the equivalence scale) | 2025 |

Verified choices: 46-10-0092-01 is current (not archived); 11-10-0066-01 (components, 2023 base) is the right table for
components, 11-10-0104-01 for family sizes. `REF_DATE` 2026-04 = 2026-Q2 (first month of the quarter).

## Geography joins

* StatCan rent table: join on DGUID (`2021S0503` + CMA code). Ottawa = Ontario part `2021S050535505`, Gatineau = Quebec part `2021S050524505`.
* CMHC: per-centre workbook, whole-centre row (`Ottawa CMA` = Ontario part, `Gatineau CMA` = Quebec part; Québec read from the `Québec CMA` row).
* CPI: city series where published (geo recorded as published, 2011 vintage); other places get the province, flagged `provincial_value`; Charlottetown uses "Charlottetown and Summerside" flagged `regional_value`; Gatineau uses Quebec (provincial); Ottawa uses the Ontario part.
* MBM regions: see `mbm.py` (`MBM`) and the observation notes. Named regions where they exist (Toronto, Montréal, Vancouver, Calgary, Edmonton, Winnipeg, Québec, Hamilton/Burlington, Halifax, Saskatoon, Regina, St. John's, Moncton, Saint John, Fredericton, Charlottetown, Brandon, Whitehorse, Yellowknife, Iqaluit, Ottawa-Gatineau Ontario part); otherwise the CMA population class: Kitchener-Waterloo and London -> Ontario 500,000+; Windsor, Sudbury, Thunder Bay -> Ontario 100,000-499,999; Victoria, Kelowna, Abbotsford-Mission -> BC 100,000-499,999; Sherbrooke and Gatineau -> Quebec 100,000-499,999. **Gatineau's mapping is an assumption** (StatCan lists only the Ontario part of Ottawa-Gatineau by name).

## Conventions

* Unit types: Studio = "Apartment - No bedroom"; 3 bedroom+ = "Apartment - 3 or more bedrooms"; houses and rooms not used.
* StatCan `E` -> `use_with_caution`; `..` -> null + `not_available`; CMHC `d` -> `use_with_caution`, `**` -> null + `suppressed`; every CMHC reliability code is kept in the observation note.
* `rent_asking_1br_change_1y` is computed by us (latest vs 4 quarters earlier) and always flagged `use_with_caution`: StatCan says the 2025-Q2 estimates (the comparison quarter) are modelled because one listing platform was missing.
* MBM metrics are annual dollars for the reference family of four (Nunavut: five). Square-root equivalence scale: cost for n persons = cost x sqrt(n/4). Verified against 11-10-0104-01 (Toronto 2025: 1 person 31,440 = 62,880 x 0.5; 2 persons 44,463; 3 persons 54,456; 5 persons 70,302 - all exact). Total = sum of components including `cost_mbm_communication` (its own component in the 2023-base MBM).
* CPI `cpi_rent_change_1y` uses the 'Rented accommodation' index for all geographies because city series exist only for that aggregate ('Rent' alone is Canada/provinces only). It is a price *change*, never a price level.

## Spot-checks against the original downloads

1. Toronto CMA, 1-bedroom apartment asking rent 2026-Q2: table 46-10-0092-01 row REF_DATE 2026-04, DGUID 2021S0503535 = 2090; observation `rent_asking_1br` = 2090.
2. Calgary CMA, CMHC 2-bedroom average rent Oct-25: workbook `rmr-calgary-2025-en.xlsx` Table 1.1.2 = 1,914 (a), identical to Canada workbook Table 1.0 row "Calgary CMA" (1,914); vacancy rate total 5.0 (a) in both Table 1.1.1 and 1.0.
3. Québec CMA vacancy 2.4 and 2-bedroom rent 1,277: both from the `Québec CMA` row of the Québec workbook, matching Table 1.0 of the Canada workbook (not the "Québec 10,000+" province row).
4. Toronto rented-accommodation CPI: index 163.5 (2025-09) and 166.4 (2026-09) -> +1.8% (`cpi_rent_change_1y`).
5. Toronto MBM total 62,880 (2025, 2023 base, current dollars) = components 3,064 + 1,464 + 14,988 + 9,103 + 26,791 + 7,469 (=62,879, rounding) and = "4 persons" in 11-10-0104-01.

## Limitations

* Asking rents are advertised prices from online platforms (experimental); not leases; CMAs only (Charlottetown, Brandon, Whitehorse, Yellowknife, Iqaluit have none). 2025-Q2/Q3 estimates are modelled by StatCan; early-2019 estimates come from a young series, so since-2019 percentages are indicative.
* CMHC covers purpose-built rental apartments in structures of 3+ units, October each year; Brandon, Whitehorse and Iqaluit are not in the data tables. The next survey release (Dec 2026) will supersede these values.
* CPI is published for only some cities; most other places carry provincial values; territorial capitals have no rented-accommodation series. Several 2025-2026 CPI sub-indexes may be revised.
* MBM regions are not CMAs; several places share a value; values are 2025 prices; the MBM is a modest-basket benchmark, not an individual's spending.
* Optional retail staples (18-10-0245-01) were not ingested in this version.
