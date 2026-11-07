# Historical positive LMIA employer data

The LMIA History page uses local, validated releases from Employment and Social
Development Canada (ESDC), under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).
Official catalogue: [Temporary Foreign Worker Program: Positive LMIA Employers List](https://open.canada.ca/data/en/dataset/90fed587-1364-4f33-a9ee-208181dc0b97).

## Current catalogue and verification

The official catalogue recovered on 7 November 2026 UTC. It lists 80 resources
(including language alternatives), from which the pipeline selects 40
non-overlapping reporting periods covering 20 June 2014–30 June 2026.
The current published counts, coverage gaps and check result are always in
`public/data/lmia/metadata.json`; a catalogue listing alone does not establish
that every source file has been parsed successfully.

The first recovered canonical refresh validated 261,651 records across 28
periods. The remaining releases exposed French `Remarques:` footers, undefined
legacy Windows-1252 bytes and explicit `(blank)` employer markers. The parser
keeps the notes, preserves undefined bytes reversibly with an encoding audit,
and includes unnamed rows and their approval counts without inferring an
employer identity. The UI shows unresolved characters as visible hexadecimal
escapes and separates unnamed records from known name/location totals.
Exact French publisher labels for the Northwest Territories and head offices
outside Canada retain their original text and mapped geography. Unrecognised
future labels remain distinct from missing geography. Shortened occupation
codes are padded only when an explicit NOC edition establishes their width.

For an independent check of the current sources before publication, dispatch
the **Validate application and data contracts** workflow on the selected ref
with `check_lmia_sources=true`. This optional job uses read-only repository
permissions, refreshes only its isolated checkout, and retains source bytes and
validation evidence as a seven-day Actions artifact. It never commits or
deploys. Ordinary pull-request checks continue to use offline fixtures.

## Initial coverage and source outage

The initial snapshot is **partial**: 12,823 published rows covering
**1 April–30 September 2021**, split into two non-overlapping releases:

| Period | Rows | Known approved positions | NOC version | Official source |
| --- | ---: | ---: | --- | --- |
| 2021 Q2 | 8,168 | 21,813 | 2011 | [ESDC workbook](https://www.esdc.gc.ca/ouvert-open/bca-seb/imt-lmi/TFWP_2021Q2_Positive_EN.xlsx) |
| 2021 Q3 | 4,655 | 13,193 | 2011 | [ESDC workbook](https://www.esdc.gc.ca/ouvert-open/bca-seb/ae-ei/TFWP_2021Q3_Positive_EN.xlsx) |

These workbooks publish approved **positions**, not approved LMIA counts; the
latter stay unknown. All provinces and territories and the publisher's separate
head-office-outside-Canada category occur in these files. Names and addresses
are preserved with whitespace cleanup; we do not infer current vacancies or
combine similarly named legal entities.

On 7 November 2026 UTC, the official catalogue/API, its JSON/XML alternatives
and `open.canada.ca` resource downloads returned HTTP 503 connection timeouts.
An independent web fetch also timed out. The two workbooks above remained
accessible on ESDC's official host. Their headings, row counts, content hashes,
notes and reporting periods were verified against the downloaded bytes.

[LMIA Watch's resource manifest](https://lmiawatch.ca/downloads/esdc_resources.csv)
was used **only to discover official download URLs and catalogue identifiers**.
None of its employer data or aggregates are imported. Its list contains 40
positive-release references spanning 20 June 2014–30 June 2026, of which 38
remain unavailable in this snapshot. That secondary list does **not** establish
the current official catalogue's completeness. The page shows this limitation,
missing intervals, failed resources and the separate discovery attribution.
`lastSuccessfulCheckAt` for the complete series remains `null`; successful
official per-resource retrieval dates remain real.

`pipeline/lmia/SOURCE_ACCESS.json` records endpoint failures, exact official
URLs, initial retrieval timestamps, workbook headings and SHA-256 values.
The bounded URL-discovery fallback is `pipeline/lmia/discovery-bootstrap.json`.
It is only used while the official catalogue is unavailable and no previously
verified full catalogue has been published. A recovered official catalogue
automatically replaces this discovery-only basis on the next refresh. Missing
or substantially reduced historical coverage requires review rather than
erasing previous releases.

## Refresh and recovery

```bash
python3 -I pipeline/lmia/run.py
python3 -I pipeline/lmia/run.py --force  # re-download known selected resources
python3 -I pipeline/lmia/check.py
python3 -I pipeline/lmia/test_lmia.py
node scripts/check-lmia.mjs --snapshot
```

Install `pipeline/requirements.txt` first (`requests`, `openpyxl` and `xlrd` are
used here). The repository's weekly/manual LMIA workflow runs this same path.
`NORTHWARD_RUN_URL` links metadata to the operational Actions run.

The runner acquires `data/raw/.publication.lock` **before** reading prior
published data. Metadata is checked on each run. A resource is re-downloaded
when its publisher revision changes; unchanged resources reuse validated local
partitions. Parser-version changes can reprocess cached bytes without claiming
a fresh source retrieval. `--force` explicitly rechecks bytes. Downloads use
the shared fetch cache, verified TLS, two bounded attempts, and serial requests.
A host circuit breaker stops subsequent downloads after repeated connection
failures; unattempted resources are labelled accordingly, not reported as
successful checks.

Complete output is staged and validated, then atomically exchanged with the
previous directory. A failed resource retains its prior valid rows and actual
source revision/hash/retrieval time. Other resources can update independently.
The last verified canonical catalogue is retained in `catalogue.json` with its
original retrieval provenance and package digest. During an API outage the
pipeline can continue processing that verified release list. It reports cached
catalogue status, preserves the actual catalogue check date and complete-check
clock, and warns that newer or revised releases may be missing. A malformed or
corrupt cache is rejected; secondary discovery lists cannot become verified
catalogue caches. Recovery replaces the cache only after validation under the
publication lock.
An annual-to-quarterly replacement is all-or-nothing when any replacement
fails, preventing an annual file from overlapping newly loaded quarters. An
empty, malformed or suspiciously incomplete catalogue cannot remove historical
coverage; a resource losing more than 25% of previous rows is retained for
review. This conservative threshold is a safety stop, not evidence of completeness.

Exit 0 means a complete successful check; exit 2 means a source failure or
partial coverage was recorded. A partial check can publish real newly verified
resources without claiming complete history. A no-change refresh advances only
appropriate check/attempt times. Content-update time changes only when a
published partition's content changes.

## Selection and normalization

- All catalogue CSV/XLS/XLSX resources with recognised reporting periods are
  considered. Documentation, unknown layouts and unknown periods are explicitly
  excluded or failed, with reasons. The previous valid snapshot is retained.
- Same-period English/French copies and alternative formats are deduplicated.
  An explicitly newer `last_modified` revision wins; English, then CSV/XLSX/XLS,
  break ties. Creation time alone is not interpreted as a content revision.
- A weighted interval selection maximises covered days, then finer periods.
  A full annual release is retained when only one overlapping quarter exists;
  four complete quarters can replace the annual release. Selected periods
  never overlap. Publisher revisions and excluded alternatives remain visible.
- CSV decoding supports UTF-8, UTF-16 and Windows-1252. XLS and XLSX readers use
  the file signature, not an assumed extension. A workbook containing multiple
  employer tables fails for explicit review rather than double counting them.
- Province section headers, repeated table headers and grouped blank cells are
  recognised. A new employer/province/stream cannot inherit an unrelated prior
  address. Missing employer identity or unknown data rows fail the resource.
- Unknown province labels are preserved verbatim with a null mapped code.
  Head offices outside Canada are a distinct publisher category, never assigned
  to a Canadian province using an address guess.
- Notes and aggregate Total/Other employers rows are retained in per-resource
  audits. They are excluded from named-employer rows to avoid double counting.
  Suppressed/missing numeric cells stay `null`, never zero. Columns explicitly
  labelled *requested* counts are retained in audits and are not relabelled as
  approved counts.
- Occupation codes keep leading zeroes. NOC versions stated in headings are
  preserved, including `(NOC) 2011`; five-digit codes identify NOC 2021.
  Unspecified four-digit versions remain explicitly unspecified. Combined
  occupation code/title and separate code/title layouts are supported.
- Employer/location keys hash the exact cleaned name, address and publisher
  province label. They support exact-spelling history only. Search normalization
  never proves that different names or locations are one legal entity.

ESDC's source notes state that personal names are excluded, employers' names
can have entry/spelling errors, and approved positions do not equal work
permits or actual arrivals. PR-only LMIA reporting changed in February 2018.
These limitations remain in the source audits and are not corrected by inference.

## Local data contract

`public/data/lmia/metadata.json` contains dataset/licence attribution, successful
and failed check times, coverage/gaps, non-overlapping periods, resource
provenance/status, excluded alternatives, filters and optional catalogue
discovery status. A period's `indexPath` points to a local
`lmia/periods/<period-id>.json` partition.

Each partition is `{schemaVersion,resourceId,periodId,columns,rows}`. The fixed
column sequence is:

```text
id, employer, address, province, provinceLabel, stream, occupationCode,
occupationTitle, nocVersion, approvedLmias, approvedPositions,
employerLocationId, incorporation
```

Rows are tuples to avoid repeating property names in large payloads. Partitions
contain all data needed for complete selected-period filters and totals; no
server pagination is used. The UI defaults to the latest available period and
loads every selected partition before reporting all-period totals or location
history. Other pages never load LMIA history. Audit files preserve source notes,
aggregate rows, parsing counts, declared NOC version and any requested counts.

`validate_directory(Path)` checks partition shape, IDs, source provenance,
nonnegative/unknown counts, NOC/code compatibility, period non-overlap and
coverage totals. The lead integration registers `lmia/` as a standalone feed in
both statistical build and promotion paths.

## Validation evidence

The offline regression suite covers annual/half-year/quarterly periods;
bilingual, format and revision deduplication; overlap selection; CSV/XLS/XLSX;
province sections; grouped cells; source notes/totals; missing/suppressed and
requested counts; separate occupation fields; parenthesized NOC headings;
initial import, no-change check, revisions, suspicious truncation, catalogue
failure and partial-resource retention; conservative identities; and the
discovery fallback's explicitly unsuccessful catalogue check.

The initial two real workbooks were independently checked against their
published rows: Q2 has 8,168 records and 21,813 positions; Q3 has 4,655 records
and 13,193 positions. The committed UI contract validator checks all 12,823
records across both initial partitions. The recovered catalogue and additional
historical files are checked by the optional live-source validation job; a
complete check requires all selected releases to pass, not only the original
two workbooks. The UI contract validator checks every published row.

The CanQuery project was inspected as an implementation reference. No code
was reused, so no CanQuery code is incorporated or presented as a data source.
