# Northward

An English-language explorer of Canadian cities for people deciding where to
move, what work to pursue and what life they could afford — built entirely on
official open data (Statistics Canada, CMHC, ESDC Job Bank, IRCC, ECCC and
provincial/community program pages). "Northward" is a working name; set
`VITE_PRODUCT_NAME` to change it.

Independent project. Not affiliated with the Government of Canada or any
organisation whose data it uses.

## What's in it

* **Explore** (`/`) — an interactive SVG map of Canada (StatCan 2021 boundaries,
  Statistics Canada Lambert projection) with 31 places, metric layers (rents,
  vacancy, CPI rent, MBM, unemployment, wages by occupation, rent as a share of
  gross pay, PR admissions, census language/commuting, monthly climate normals),
  a profession lens over 516 NOC 2021 occupations, housing-type and month
  switches, region/province filters, city search (including municipalities
  inside a CMA), a synchronised ranked list, question presets, and a detail
  drawer / mobile sheet that keeps the map in view.
* **City profiles** (`/place/:id`) — key facts, computed tradeoffs, wages for the
  chosen occupation (economic region vs province vs Canada), labour-market
  trend, rents (asking vs CMHC vs paid), MBM basket, climate, language and
  commuting, immigration context and programs, job-search links, sources.
* **Compare** (`/compare?compare=a,b,c`) — up to three places under the same
  profession, housing type and budget scenario; dot strips on stable scales and
  a provenance-aware table.
* **Budget** (`/budget`) — arrival budget: take-home income, savings, household
  size, housing choice, sourced asking rent as an editable start, MBM-based
  estimates, user lines, one-time arrival costs, runway with and without income.
  Inputs stay in the browser (localStorage) unless you explicitly share a complete
  scenario link or use Compare's "Edit on Budget" action to pass that scenario.
* **Insights** (`/insights`) — eight data explorations (housing, arrival budget,
  wages, labour markets, immigrant income, settlement, language and daily life,
  climate) with computed findings that jump to the map.
* **Immigration** (`/immigration`) — a searchable reference directory of 67
  federal, provincial, Quebec and community program records from official pages
  (status shown only where the page states it), plus newcomer support links.
  Reference only: no eligibility scoring.
* **IRCC Updates** (`/updates`) — searchable official news, program delivery
  updates and Express Entry rounds. Filter by type and topic; follow each item
  to its official publication. Source coverage and failed checks remain visible.
* **EE Calculator** (`/express-entry`) — Express Entry CRS estimate under the
  November 3, 2026 rules, including the labour market integration factor and
  a 1,270-point maximum. Five approved language tests, accompanying-partner
  factors and a complete points breakdown. Uses published IRCC criteria and
  flags known differences from IRCC’s web calculator. This is ranking, not an
  eligibility assessment. Answers are held only in page memory.
* **Sources & methods** (`/sources`) — the source registry, a coverage matrix and
  methodology notes.

## Run it

Requires Node 20+ (tested with Node 22). No keys or live upstream calls are
needed: the app runs from the committed snapshot in `public/data/`.

```bash
npm ci --ignore-scripts
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ on http://localhost:4173
```

Serve `dist/` from any static host (a `404.html` SPA fallback is generated; set
`BASE_PATH=/sub/path/` at build time for a sub-path deployment).

### GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes the site on every push
to `main` (or manually via *Actions → Deploy to GitHub Pages → Run workflow*).
One-time repository setup: *Settings → Pages → Source: GitHub Actions*, and keep
`main` as the default branch (the `github-pages` environment only accepts
deployments from it by default). The project site is served at
`https://<owner>.github.io/<repo>/`; the base path is taken from the Pages
configuration automatically.

## Data

```bash
pip install -r pipeline/requirements.txt
npm run data:refresh   # re-run every pipeline (uses cached downloads in data/raw/), then rebuild public/data
NORTHWARD_REFRESH=1 npm run data:refresh   # force re-download from the official sources
npm run data:build     # only rebuild public/data from data/processed/
npm run data:check     # self-contained validation of the committed app snapshot
npm run data:check -- --sources # strict integration verification against raw source files
npm run data:freshness # compare every source with the publisher's latest release (add -- --strict to exit 1 when newer data exists)
node scripts/check-model.mjs   # budget and pay arithmetic checks
npm run check:crs      # offline IRCC reference cases, score bands and CRS limits
npm run updates:refresh # lightweight IRCC-only refresh, independent of statistical downloads
npm run updates:check   # validate the saved IRCC feed
```

**Freshness.** Publisher checks distinguish `current`, `newer_available`,
`static`, `unknown` and `manual_update_required`. An inaccessible or changed
source cannot be reported as current. `data/processed/freshness.json` and
`public/data/freshness-checks.json` record check results independently from
observation periods, publisher release dates and actual retrieval times.
The Sources page shows both snapshot dates and publisher/check failures.
`data:freshness` exits 2 for failed checks; `--strict` also exits 1 when a newer
edition is available. Manual-only sources are explicitly labelled.

**Weekly statistics.** `.github/workflows/refresh-data.yml` runs Mondays at
10:23 UTC and on manual dispatch. It stages housing, work, immigration and
population outputs with `NORTHWARD_REFRESH=1`, validates the complete result,
then promotes it as one app generation. Census/boundaries/climate are fixed
references; use `--full-geo` for their expensive refresh. For a scoped update:
`NORTHWARD_REFRESH=1 npm run data:refresh -- --domains geo`.

Source downloads have per-URL locks and checksums. A forced download is reused
within one refresh run. Derived CSV caches are invalidated when source bytes or
the transformation version changes. Wage editions come from the official
catalog; CMHC workbook candidates come from the official download page. A
source that cannot be discovered requires manual attention, not a guessed URL.

Failures retain the last valid statistics and write a separate
`public/data/refresh-status.json` report. Staged output is never published after
a failed domain or validation step. Promotion uses Linux atomic directory
exchange, with rollback if the app swap fails. The GitHub Pages deployment uses
a complete built artifact. Both scheduled jobs share a concurrency group and
pass the exact post-refresh commit to the existing Pages workflow.

**IRCC publications.** `.github/workflows/refresh-ircc-updates.yml` checks the
official newsroom, program delivery updates and Express Entry draw data every
six hours (minute 17 UTC), with a manual trigger. It only updates `updates.json`;
it does not redownload statistical tables. Failed sources retain their entries
and last successful check time. See [IRCC ingestion documentation](pipeline/updates/README.md)
for endpoints, coverage, identity rules and parser tests.

**Recovery.** Inspect Sources → publisher checks, the refresh status JSON and
the failed Actions log. Correct access, a parser or an edition mapping, run the
focused checks below, and rerun the relevant workflow. Do not erase the old
snapshot or change retrieval timestamps to hide failure. Missing ignored raw
files cause strict `--sources` verification to fail explicitly; the default
snapshot check reports those integration checks as skipped.

```bash
npm run check:model
npm run data:check
python3 -I pipeline/test_pipeline.py
python3 -I pipeline/tests/test_wage_editions.py
python3 -I pipeline/tests/test_freshness.py
python3 -I pipeline/immigration/test_periods.py
npm run updates:check
python3 -I pipeline/updates/test_updates.py
npm run build
```

These self-contained checks run on pull requests in `validate.yml`; live source
downloads are kept out of PR validation. See `docs/DATA_CONTRACT.md` and each
pipeline directory's README for field meanings and coverage limitations.
The CRS checks are included in `check:model`. See
[CRS calculation and verification](docs/CRS_CALCULATOR.md) for the rules version,
source provenance and the two disclosed IRCC calculator discrepancies.

### Sources actually ingested (snapshot of 2026-11-05)

* **Statistics Canada** (Web Data Service full-table CSVs): asking and paid rents
  46-10-0092-01 (to 2026-Q2); CPI 18-10-0004-01 (to 2026-09); MBM thresholds
  11-10-0066-01 (2025, 2023 base) and 11-10-0104-01; LFS by CMA 14-10-0459-01
  (3-month moving average, seasonally adjusted, to 2026-09), territories
  14-10-0292-01, economic regions 14-10-0462-01; immigrant income 43-10-0030-01
  and retention 43-10-0022-01 (tax years to 2023, 2023 constant dollars);
  population estimates 17-10-0148-01; 2021 Census tables 98-10-0002/-0003/-0005/
  -0030/-0038/-0175/-0227/-0308/-0457; NOC 2021 V1.0; 2021 cartographic boundary
  files via geo.statcan.gc.ca.
* **CMHC** Rental Market Survey, October 2025 (average rent by bedroom type,
  vacancy).
* **ESDC Job Bank** wages, 2025 edition (revised 2025-11-19), by NOC and
  economic region; verified Job Bank search URLs.
* **IRCC** permanent residents by province/territory and CMA of intended
  destination, Jan 2015 – Aug 2026 (open.canada.ca); program pages on canada.ca.
* **ECCC** Canadian Climate Normals 1991–2020 (station pages), one reference
  station per place.
* **Provincial and community program pages** (BC, AB, SK, MB, ON, QC, NB, NS,
  NL, NT and RCIP/FCIP community pages) — see the directory's links.

### Coverage

31 places: 26 CMAs (Ottawa and Gatineau as the Ontario and Quebec parts of
Ottawa–Gatineau), 4 census agglomerations (Charlottetown, Brandon, Whitehorse,
Yellowknife) and Iqaluit (city). 28 places have at least five of six headline
measures. Gaps stay visible: StatCan asking rents exist for the 26 CMAs only;
CMHC has no Brandon, Whitehorse or Iqaluit centre; LFS values for
Charlottetown, Brandon and the territories are provincial/regional (flagged);
several climate stations publish no snowfall; Iqaluit has population and
climate only among census/immigration measures.

## Key rules the product follows

* Statistics are shown for the geography they were measured for: Toronto-CMA
  values are never presented as Mississauga or Brampton values; economic-region
  wages and provincial values are labelled.
* Missing stays missing (with a reason); only comparable observations are ranked.
* Wages are gross wages of employed workers (Job Bank), not advertised pay and not
  take-home; the 37.5 h/week conversion is shown wherever used.
* CPI is used for price change, never as a price-level ranking; MBM is a labelled
  basket benchmark, and its shelter component is excluded from budgets.
* Immigration statistics are historical context, not eligibility or success predictions.

## Limitations (v1)

* No live job postings: Job Bank's terms prohibit automated querying and no
  permitted feed exists, so the product links to verified Job Bank searches.
  `src/adapters/jobs.ts` is the boundary for adding other boards later.
* No gross-to-net tax calculator yet (budget asks for take-home income).
* Asking rents are StatCan's experimental listing-based series; CMHC covers
  purpose-built rentals only; census commuting reflects May 2021 conditions.
* Some program pages could not be read (bot checks / JavaScript-rendered pages);
  those records are minimal and marked in `pipeline/immigration/README.md`.
* Climate values are station proxies (station, distance and normals code shown).

## Layout

```
src/            React app (pages, components, charts, model, adapters, data loaders)
src/types/contract.ts   shared data contract
src/model/      budget and pay arithmetic (pure functions)
pipeline/       Python ingestion per domain + build/check scripts
data/processed/ contract-shaped outputs per domain (committed)
public/data/    app snapshot (generated by npm run data:build)
docs/           data contract, workstream briefs
```
