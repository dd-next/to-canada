# Data workstreams (A–D)

Briefs for the four data workstreams. Each runs independently against the
contract in `src/types/contract.ts` and `docs/DATA_CONTRACT.md`.

## Common rules (all data workstreams)

* **Read first:** `src/types/contract.ts`, `docs/DATA_CONTRACT.md`,
  `pipeline/common/*.py`, `pipeline/places_seed.json` (31 places; ids are permanent).
* **Network:** HTTPS goes through a proxy; `pipeline/common/fetch.py` already
  trusts its CA bundle. Use `fetch()/fetch_json()` (cache in `data/raw/`, per-URL
  lock, bounded retries) for every download so work is never duplicated. Keep at
  most two large downloads in flight. Prefer WDS/CSV/XLSX/JSON APIs over HTML.
* **Verify before ingesting.** Table ids below are starting points: read the
  cube metadata / dataset page, confirm the title, dimensions, geography,
  reference periods and replacements, then ingest what actually exists.
* **Deliverables in your own paths only** (see ownership table):
  `pipeline/<domain>/run.py` (+ modules) that rebuilds everything from cache or
  network; `data/processed/<domain>/{sources,metrics,observations,series,insights}.json`
  (+ domain extras); `pipeline/<domain>/README.md` (what, how to refresh, limitations).
  Validate with `write_processed()` (it rejects unknown units/flags and duplicates).
* **Facts:** preserve units, scalar factors, periods, seasonal adjustment, price
  basis, population definitions, suppression/quality flags and rounding. Missing
  stays `null` with a flag. Label economic-region/provincial values. Never invent
  or back-fill values.
* **Insights:** contribute 3–5 substantive findings across 1–2 `Insight`
  records, each with 1–3 `ChartSpec`s, practical interpretation, methodology,
  limitations and `calc` strings. Derive headlines from the data after looking at
  it. No causal claims the data can't support.
* **Run:** `python3 -I pipeline/<domain>/run.py` from the repo root, then
  `python3 -I pipeline/build_app_data.py` to check the merged snapshot builds.
* **First slice fast:** produce a first valid `observations.json` for the
  headline metric within your first ~20 minutes, then deepen.
* **Spot-check** 3–5 values against the original download and note them in the README.
* Be efficient: this is a bounded first version, not an exhaustive survey.

### Metric ids the interface expects (use these where the data exists)

| domain | ids |
|---|---|
| housing (A) | `rent_asking_studio`, `rent_asking_1br`, `rent_asking_2br`, `rent_asking_3br` (family `rent_asking`); `rent_cmhc_avg_studio` … `rent_cmhc_avg_3br` (family `rent_cmhc_avg`); `rent_paid_1br`, `rent_paid_2br`; `rent_vacancy_rate`; `rent_asking_1br_change_1y`; `cpi_rent_change_1y`, `cpi_all_items_change_1y` |
| cost (A) | `cost_mbm_food`, `cost_mbm_clothing`, `cost_mbm_transport`, `cost_mbm_communication`, `cost_mbm_other`, `cost_mbm_shelter`, `cost_mbm_total` (annual, reference family of four, as published) |
| work (B) | `lfs_unemployment_rate`, `lfs_employment_rate`, `lfs_participation_rate`, `lfs_unemployment_rate_change_1y` |
| immigration (C) | `imm_pr_admissions`, `imm_pr_admissions_per_1000`, `imm_pr_admissions_change`, `imm_retention_5y`, `imm_median_wages_5y` |
| people (D) | `pop_2021`, `pop_change_2016_2021`, `pop_immigrant_share`, `pop_recent_immigrant_share`, `lang_french_knowledge`, `lang_bilingual`, `lang_nonofficial_home`, `commute_transit_share`, `commute_car_share`, `commute_active_share`, `commute_45min_share`, `hh_avg_size` |
| climate (D) | `clim_jan_mean_temp`, `clim_jul_mean_temp`, `clim_jan_min_temp`, `clim_jul_max_temp`, `clim_annual_precip`, `clim_annual_snow`, `clim_days_below_minus20`, `clim_days_above_30` |

Insight ids: `housing-rents`, `arrival-budget` (A); `work-wages`, `work-labour`
(B); `immigrant-income`, `settlement` (C); `language-life`, `climate` (D).

---

## A — Housing and household costs (`pipeline/housing/`, `data/processed/housing/` and `data/processed/cost/`)

Sources to verify and ingest:
1. **StatCan 46-10-0092-01** (asking rents; check whether it also carries paid
   rents or what replaced it). Latest quarter per place and unit type (Studio,
   1 bedroom, 2 bedroom, 3 bedroom+), plus quarterly history series for 1 and
   2 bedroom. Record coverage gaps per CMA.
2. **CMHC Rental Market Survey** (October survey, purpose-built rentals): average
   rent by bedroom type and vacancy rate for each place's CMA/CA (CMHC covers
   centres of 10,000+, so CAs such as Charlottetown, Brandon, Whitehorse,
   Yellowknife should exist). Keep CMHC reliability codes as flags. This is the
   "paid rent by sitting tenants" comparison to asking rent — explain the
   methodological differences (survey vs listings, stock vs new leases).
3. **CPI** (18-10-0004-01 or current replacement): rent index and all-items
   12-month change for the geographies CPI publishes (provinces, selected CMAs,
   territorial capitals). Use for price *change*, never as a city price-level ranking.
4. **Market Basket Measure thresholds** (verify 11-10-0066-01 vs 11-10-0104-01
   and the current base): components (food, clothing, transportation, other,
   shelter, total) for the reference family of four by MBM region, latest year.
   Map each place to its MBM region (record the mapping on observations' `geo`).
   These feed the budget calculator as *labelled basket benchmarks*; the
   calculator excludes the shelter component (rent is entered separately) to
   avoid double counting. Document the square-root equivalence scale for other
   household sizes.
5. Optional: **Selected retail prices 18-10-0245-01** (monthly, by province)
   for a handful of staples, as context.

Insights: `housing-rents` (where asking rents are lower; how they changed; asking
vs paid gap, with coverage/method caveats) and `arrival-budget` (scenario: months
a stated savings buffer lasts with no income, for stated household types, using
sourced asking rent + MBM non-shelter components; every assumption explicit and
labelled as a scenario).

## B — Employment and earnings (`pipeline/work/`, `data/processed/work/`)

Sources to verify and ingest:
1. **LFS by CMA** (start from 14-10-0459-01; confirm its definition — monthly vs
   three-month moving average, seasonal adjustment — and alternatives such as
   14-10-0380-01). Latest values + monthly history since 2019 for unemployment,
   employment and participation rates. Use Ottawa/Gatineau CMA parts if
   published, else CMA-wide flagged `cma_wide`. For CAs/territories not in the
   CMA table, use economic-region or territorial LFS tables, flagged
   `regional_value`, or leave missing.
2. **Job Bank wages** (open.canada.ca dataset; find the current "Wages" CSV):
   low/median/high wages by NOC 2021 and economic region / province / Canada,
   hourly vs annual flag, reference period, revision date. Output
   `occupations.json` (`Occupation[]`, NOC 2021 five-digit unit groups with TEER,
   broad category and a few example titles from the official NOC 2021 structure
   / element files) and `wages.json` (`WageTable`; keep only geographies used by
   the places' economic regions, their provinces and Canada). Verify ER codes in
   `places_seed.json` against Job Bank's ER names and report mismatches.
3. **Job search links:** verify Job Bank URLs and search parameters by fetching
   them: the foreign-candidates page (https://www.jobbank.gc.ca/findajob/foreign-candidates)
   and keyword+location search. Write `data/processed/work/job_search.json`
   matching `JobSearchConfig` in `src/adapters/jobs.ts`. Check whether a
   *permitted* structured feed of current postings exists; if not, say so. The
   monthly Job Bank postings dataset (open.canada.ca
   ea639e28-c0fc-48bf-b5dd-b8899bd43072) may support historical posting counts —
   label it historical, never "currently open".

Insights: `work-wages` (occupational wage ranges and regional differences for
~10 common newcomer occupations; employed-worker wages, not advertised pay) and
`work-labour` (regional labour conditions and recent trends).

## C — Immigration outcomes and reference (`pipeline/immigration/`, `data/processed/immigration/`)

Sources to verify and ingest:
1. **IRCC permanent residents** (open.canada.ca f7e5498e-0ad8-4417-85c9-9b8aff9b9eda):
   admissions by province/territory and CMA of intended destination (annual
   totals and latest year-to-date with its months). Keep IRCC's rounding /
   suppression conventions. Admissions = intended destination at landing, not
   current residence.
2. **StatCan 43-10-0030-01** (immigrant taxfiler income) and **43-10-0022-01**
   (immigrant mobility/retention): verify definitions, population (taxfilers),
   price basis (constant dollars base year), geography. Build outcome series by
   admission category and years since admission, and retention by province.
3. **Program directory** (`programs.json`, `ProgramRecord[]`): federal economic
   programs (Express Entry and its programs, PNP overview, Atlantic Immigration
   Program, Rural Community Immigration Pilot, Francophone Community Immigration
   Pilot, other current federal pathways relevant to workers), every province's
   and territory's nominee program (major streams only), Quebec's separate
   selection system, and the participating RCIP/FCIP communities linked to
   `placeIds` where they match. Start from
   https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/provincial-nominees.html
   and .../rural-franco-pilots.html, then the owning provincial/community pages.
   Fill purpose, audience, geography, major conditions, job-offer requirement,
   official URL, `lastChecked` (today). Set `status` only when the official page
   states it. Add a few verified newcomer/pre-arrival support links
   (category `pre_arrival` / `settlement_support`). Reference only — no
   eligibility scoring.

Insights: `immigrant-income` (historical outcomes by cohort/category and years
since admission; not a forecast) and `settlement` (intended destinations of new
PRs and later retention/mobility, kept distinct).

## D — Geography and everyday life (`pipeline/geo/`, `data/processed/geo/`)

1. **Boundaries:** StatCan 2021 cartographic boundary files for provinces/
   territories and CMAs/CAs. Reproject to WGS84 and simplify with
   `npx mapshaper` (installed) into `canada.topo.json` (≤ ~600 KB) with objects
   `provinces` (`code`, `pruid`, `name`) and `cmas` (only our places;
   `placeId`, `cmaId`, `name`, `level`).
2. **Verified places** (`places.json`, `Place[]`): confirm CMA/CA codes, DGUIDs,
   official names, Ottawa–Gatineau parts, overlapping economic regions (primary
   first), principal CSD, marker coordinates (official representative point or
   a documented computation), notable municipalities (top CSDs by population —
   search aliases only), 2021 population. Use the 2021 Geographic Attribute File
   or official correspondence files.
3. **Census 2021** for each place's CMA/CA/part (Iqaluit: CSD): population and
   change 2016–2021, immigrant and recent-immigrant shares, knowledge of
   official languages, language spoken most often at home, household size,
   commuting main mode and duration. Use the Census Profile download/API that is
   most efficient; keep the 25%-sample/100% basis and age scope in metric notes.
4. **Climate normals 1991–2020** (ECCC): choose one station per place
   (principal airport or long-record station with complete normals), record
   station name/ID/coordinates/distance on the place (`climateStation`), and
   produce monthly normals series plus the climate metrics. Make the
   station-to-place mapping transparent.

Insights: `language-life` (official-language knowledge/use, commuting,
household structure; census age/geographic scope explained) and `climate`
(monthly temperature/precipitation, winter severity, with station mapping).
