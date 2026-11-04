# Work domain: employment and earnings

Rebuild everything (from the raw cache in `data/raw/`; `NORTHWARD_REFRESH=1` re-downloads):

    python3 -I pipeline/work/run.py

Outputs in `data/processed/work/`: `sources`, `metrics`, `observations`, `series`, `insights`, `occupations`, `wages` (compact JSON, ~0.46 MB), `job_search`.

## Sources

| id | what | period / release |
|---|---|---|
| `jobbank-wages-2025` | ESDC Job Bank Wages (open.canada.ca dataset adad580f-76b0-4502-bd05-20c125de9116), 2025 edition CSV, OGL-Canada | wages mostly 2023-2024 (LFS/EI), 2024 (Small Area Estimation), 2021 Census for 356 kept cells; revision date 2025-11-19. A 2026 edition has not been published yet; add its URL in `wages.py` (`WAGE_URL`) when it appears (editions appear each Nov/Dec). |
| `statcan-noc-2021-v1.0` | NOC 2021 V1.0 classification structure and elements (titles, TEER = 2nd digit, broad category, 6 illustrative examples) | n/a |
| `statcan-14-10-0459-01` | LFS by CMA, **three-month moving average, seasonally adjusted** | monthly to 2026-09, released 2026-10-09 |
| `statcan-14-10-0292-01` | LFS by territory, 3MMA, SA series, total gender, 15+ | to 2026-09 |
| `statcan-14-10-0462-01` | LFS by economic region, 3MMA, **unadjusted** (used only for Brandon = Southwest MB) | to 2026-09 |

14-10-0380-01 (the older CMA table) is inactive (ends 2024-12) and was not used. 14-10-0460-01 (Montréal/Toronto/Vancouver, monthly not averaged) was not used so that all places are on the same 3MMA basis.

## Method notes

* LFS metrics: `lfs_unemployment_rate`, `lfs_employment_rate`, `lfs_participation_rate` (map layers), `lfs_unemployment_rate_change_1y` (percentage points, calculated, SE of the change in the note). Period `2026-09` means the three months July to September 2026. Monthly series since 2019-01 for unemployment and employment rates (62 series).
* Ottawa / Gatineau: LFS Ontario part / Quebec part of CMA 505 (geo level `cma_part`, not `cma_wide`).
* Charlottetown: Prince Edward Island (province-wide, same table, flagged `provincial_value`). Whitehorse, Yellowknife, Iqaluit: territory-wide, flagged `provincial_value`. Brandon: Southwest economic region, **unadjusted** 3MMA, flagged `regional_value` (series carries `seasonalAdjustment: unadjusted`); not strictly comparable with SA values.
* Wages: kept NOC 2021 unit groups, the places' economic regions (primary + overlapping), provinces and Canada. Cells with no published value are omitted (never zero-filled, never back-filled with provincial values); the UI falls back to the province and must flag `provincial_value`. `[low, median, high, isAnnual]` as published; Job Bank states some occupations (e.g. physicians, self-employed groups) at annual rate.
* Job Bank ER names differ from the place list for ER 5920 ("Lower Mainland" vs "Lower Mainland--Southwest") and ER 6010 ("Yukon Territory" vs "Yukon"); codes match everywhere.

## Spot checks (original file vs output)

1. Job Bank CSV row `NOC_31301, ER4830 Calgary`: 34.57 / 48.01 / 55 -> `wages.json byNoc["31301"]["4830"] = [34.57, 48.01, 55.0, 0]`.
2. 14-10-0459-01, Toronto, 2026-09, Unemployment rate, SA estimate 6.9; 2025-09 was 8.8 -> observation 6.9, change -1.9 pp.
3. 14-10-0292-01, Nunavut, 2026-09, unemployment rate, SA, total gender 15+: 11.0 -> Iqaluit observation 11.0 (`provincial_value`).
4. NOC structure row 21232 "Software developers and programmers" -> occupation TEER 1, broad category 2 (Natural and applied sciences).
5. Insight `wage-rn-regional`: RN median Calgary ER 48.01 (checked as 1).

## Job search

`job_search.json` has URL templates for Job Bank verified on 2026-11-04 (see `feedStatus` and notes). Job Bank ignores a plain `locationstring`; the location is applied only when `locationparam` holds Job Bank's own city id, so `placeLocations` maps every place to its id (looked up once from Job Bank's public location type-ahead). No postings are fetched or stored.

## Limitations

* Wages are for employed workers, nominal hourly dollars, by economic region (not city) and mostly 2023-2024; the low value often looks like a minimum-wage floor.
* LFS values for small CMAs have large sampling error; 3MMA smoothing overlaps consecutive months. Territory and PEI values are not city values. Nunavut SA equals unadjusted in all months since 2019.
* Job Bank's terms of use for job seekers prohibit automated query programs; there is no permitted feed of current postings, so the app links out. The monthly postings open-data CSV (dataset ea639e28-c0fc-48bf-b5dd-b8899bd43072) is historical only and was not ingested in this version.
