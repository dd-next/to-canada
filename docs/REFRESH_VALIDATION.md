# Refresh and validation record — 2026-11-05

This record describes work performed for the data refresh / IRCC Updates change.
It does not claim that every official source was downloaded or every program's
current eligibility rules were independently reviewed.

## Real source ingestion

| Source | Observation period loaded | Notes |
|---|---|---|
| StatCan asking rents | 2026 Q2 | Toronto one-bedroom value re-read from the raw archive |
| CMHC Rental Market Survey | October 2025 | Official annual catalog and workbooks; release 2025-12-11 |
| StatCan CPI and LFS | September 2026 | Kelowna unemployment re-read from raw data |
| StatCan MBM | 2025, 2023 base | Reference household 4; Nunavut 5 |
| Job Bank | 2025 edition, released 2025-11-19 | 17,231 cells; individual periods 2021, 2023–2024 and 2024; Calgary RN value and method/period verified against raw CSV |
| StatCan population estimates | July 1, 2025 | 30 available places; Iqaluit unavailable |
| IRCC permanent-resident admissions | January 2015–August 2026 | Latest complete year 2025; publisher update 2026-10-20 |

The housing/work transaction completed successfully. Publisher checks reported
13 current sources, 12 fixed references and 30 sources requiring manual review,
with zero unknown checks in the final report. Earlier CKAN timeouts were resolved
using the same publisher's official HTML catalog metadata.

Large immigrant taxfiler income/retention archives (approximately 16/20 GB
uncompressed) were not downloaded again. Existing 2023 values retain their
original source/retrieval dates. Census 2021 and climate normals 1991–2020 remain
fixed references. “Manual review required” is not a freshness guarantee.

## IRCC publication coverage

All three official source checks succeeded, producing 914 records:

| Source | Records | Captured publication dates |
|---|---:|---|
| IRCC newsroom | 50 | 2026-04-20 to 2026-11-03 |
| Program delivery updates | 410 | 2024-01-04 to 2026-11-03 |
| Express Entry draws | 454 | 2015-01-31 to 2026-10-28 |

Repeated real ingestion preserved IDs and first-seen times without duplicates.
Separate publications with identical titles retain distinct official URLs and
publisher subtypes. The first run cannot recover news outside the latest-50
listing. Changes confined to article body text, absent from ingested feed/index
fields, are not detected. No inferred summaries, effective dates or eligibility
recommendations are added.

## Focused checks actually executed

- Production TypeScript/Vite build with `BASE_PATH=/to-canada/`; 46 static route entries plus the SPA fallback.
- Existing model checks: 8 passed; scenario/comparability regressions: 7 passed.
- Snapshot validation: 10 passed; raw-source integration verification: 17 passed.
- Cache/refresh/rollback regressions: 8 passed; annual edition/provenance: 3 passed; immigration periods: 4 passed; malformed freshness metadata: 4 passed.
- IRCC parsers, deduplication, failure retention and interprocess publication locking: 14 passed; saved feed contract validation passed.
- Chromium desktop/mobile: complete and legacy scenario links with dirty recipient storage, Explore → Compare → Budget context, Toronto profile, IRCC search/type/topic filters, draw details, empty results and retained entries after a simulated source failure.
- Header layouts checked from 390 to 1440 pixels; the intermediate-width navigation overlap was corrected. Long update titles wrap without horizontal overflow.

Live access errors are preserved in pipeline reports; mock failures in regression
tests are intentional test cases, not claims of live-source success. No production
deployment was performed as part of this validation.
