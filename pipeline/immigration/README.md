# Immigration pipeline (workstream C)

Rebuild everything: `python3 -I pipeline/immigration/run.py` (from the repo root; uses the raw cache). Refresh from the network:
`NORTHWARD_REFRESH=1 python3 -I pipeline/immigration/run.py`. Outputs in `data/processed/immigration/`:
`sources, metrics, observations, series, insights, programs` (`.json`).

Modules: `ircc.py` (PR admissions), `pop.py` (population denominators), `taxfilers.py` + `income.py` (43-10-0030-01),
`mobility.py` + `retention.py` (43-10-0022-01), `programs.py` (directory; each fact paraphrased from the cited page, read 2026-11-04),
`insights.py`, `common_i.py` (place-to-source geography mappings), `run.py`.

## Sources
| id | what | period / release |
|---|---|---|
| `ircc-pr-cma` | IRCC PR admissions by province/territory and CMA of intended destination (XLSX; open.canada.ca dataset f7e5498e-...) | Jan 2015 - Aug 2026, released 2026-10-20; latest complete year 2025, YTD Jan-Aug 2026 |
| `statcan-17-10-0148-01` | Population estimates, July 1, CMA/CA, 2021 boundaries (denominator for per-1,000) | 2001-2025, released 2026-01-14 |
| `statcan-43-10-0030-01` | Immigrant taxfilers by economic outcomes, 2023 constant dollars (IMDB) | tax years 2009-2023, released 2025-12-08 |
| `statcan-43-10-0022-01` | Mobility of immigrant taxfilers (retention in intended province/CMA) | tax years 2007-2023, released 2025-12-19 |
| `ircc-*`, `prog-*`, `comm-*` | Official program pages (see `sources.json`) | read 2026-11-04 |

## Key definitions (kept in MetricDefs)
* **IRCC admissions** = permanent resident status granted, by CMA/CA of *intended destination at landing* (not residence). IRCC rounds every value to the nearest 5 and shows 0-5 as `--`; we keep `--` as `null` + `suppressed` and flag all values `rounded`. We used the XLSX, not IRCC's CSV (labelled "rounded - not for calculations"). Ottawa and Gatineau use IRCC's published Ontario/Quebec parts (geo level `cma_part`).
* **Per 1,000** = admissions / StatCan July 1 population estimate (17-10-0148-01) of the same year and geography x 1000 (unit `ratio`, persons per 1,000 residents).
* **43-10-0030-01**: immigrant taxfilers aged 15+ residing in Canada (IRCC landing records linked to tax files); geography = postal code on the return (residence, not intended destination); 2023 constant dollars; zero/one dollar values excluded from medians; years since admission = tax year - admission year (the table has no such field). Series use *Median employment income*; `imm_median_wages_5y` uses *Median wages, salaries and commissions* for the 2018 cohort in tax year 2023 (5 years after admission). Only up to 10 years since admission is published.
* **43-10-0022-01**: "Retention rate" = stayed / (stayed + out-migrated) in the province or CMA of intended destination, by admission year and tax year; in-migration is not counted. `imm_retention_5y` = provincial value (flagged `provincial_value` on every place in the province); `imm_retention_cma_5y` = CMA value (extra metric).

## Spot-checks
1. IRCC XLSX Toronto 2025 total `97,690` -> `imm_pr_admissions` toronto = 97690; Moncton `4,575`; Canada `393,780` vs `483,655` in 2024 (-18.6%).
2. Toronto per 1,000: 97,690 / July 1 2025 Toronto CMA population x 1000 = 13.74 (see observation note).
3. StatCan WDS API (vector v1289687431): Canada, admission 2018, economic principal applicants, median employment income, 2023 = 70,300; matches our series and finding.
4. StatCan WDS API (vector v1264313931): Prince Edward Island retention rate, 2018 cohort, 2023 = 34.4 (2022: 38.0); matches `imm_retention_5y`. Internal check: Ontario 91,980 / (91,980 + 9,295) = 90.8%.
5. Program statuses were read as stated (e.g. IRCC RCIP/FCIP/AIP pages show "Status Open"; Agri-Food Pilot "ended on May 14, 2025"; BC PNP invitations page last updated 2026-10-29).

## Disk note
The full 43-10-0030-01 CSV is ~16 GB and 43-10-0022-01 ~20 GB uncompressed. The pipeline never extracts them: it streams the cached zip in chunks and writes
`data/raw/statcan_tables/43100030|43100022/filtered_northward.csv` (~60/100 MB), which `run.py` re-reads. Delete the extracts to force a re-stream.

## Coverage gaps
* **Iqaluit**: IRCC lists Nunavut only as "Other - Nunavut" (no admission values); 43-10-0030/0022 have no territories. Whitehorse and Yellowknife have admissions (CAs in IRCC) but no taxfiler values.
* Charlottetown and Brandon (CAs): admissions yes; `imm_median_wages_5y` and `imm_retention_5y` are provincial values (flagged); no CMA retention.
* Fredericton: no CMA retention (new 2021 CMA; no immigrants with that intended destination in the 2018 cohort data).
* No per-category or province-level IRCC detail beyond what the CMA table carries.

## Program directory (`programs.json`, 68 records)
Federal (Express Entry + 3 programs, PNP overview, AIP, RCIP, FCIP, physicians pathways, closed/paused programs), Quebec (PSTQ, closed PRTQ and food-processing pilot, other pilots), provincial nominee programs and major streams for AB, BC, MB, SK, ON, NB, NS, PE, NL, YT, NT, RCIP (14) and FCIP (6) communities (placeIds for Sudbury, Thunder Bay, Brandon, Kelowna), and IRCC pre-arrival/settlement links. `status` is set only where a page stated it (see `status.note`).

**Pages that could not be read or were thin** (records are minimal and say so):
* princeedwardisland.ca (HTTP 403, also for the alternative program page tried 2026-11-05) -> PEI PNP record has URL only; yukon.ca (HTTP 403, also for the alternative nominee-program URL tried 2026-11-05) -> Yukon record URL only. Not retried further.
* novascotiaimmigration.com now redirects to liveinnovascotia.com (re-read 2026-11-05): the NSNP landing page, fee update and 2026-priorities news items are recorded; individual stream pages were not read, so stream conditions are not recorded.
* gotothunderbay.ca returned a bot-verification page (alternative city URL tried 2026-11-05 returned 404; not bypassed). economicdevelopmentbrandon.com (also www.) fails TLS certificate verification from our fetcher (certificate chain not verifiable; not bypassed) -> Thunder Bay and Brandon records use IRCC's pilot-wide conditions and link to the community URLs listed by IRCC. Other community sites (e.g. nbrcip.ca) were not read; their records carry pilot-wide conditions only.
* Quebec PEQ: no English quebec.ca page exists (HTTP 410/404); the French page and its selection-conditions page were read 2026-11-05 (`qc-peq`, status closed as stated); the stream-specific condition pages were not read. The PSTQ's four stream definitions were not read; SK program categories and NL categories are listed from overview pages without per-category conditions; Alberta/BC entrepreneur streams and Quebec orderlies/AI pilots are mentioned only briefly.
* The NWT page states "has closed its 2025 intake"; re-read 2026-11-05, wording unchanged; recorded as read, with that caveat in the note.

## Limitations
* Admissions are intended destination, rounded to 5; year-over-year changes for small places are imprecise.
* Taxfiler medians are historical group statistics of filers with income, in constant 2023 dollars; composition differs by place and category. Not forecasts.
* Retention does not count in-migrants and says nothing about why people moved.
* Program facts are paraphrased from pages read on 2026-11-04; programs change often, so re-check the official page.
