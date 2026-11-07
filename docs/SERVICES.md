# Services directory

The application publishes a local, complete snapshot of
[Awesome Canada](https://awesome-canada.ca/), maintained by
[wra-sol and contributors](https://github.com/wra-sol/awesome-canada).
Browsing never calls their GitHub API or maintenance Worker.

## Verified initial coverage

Upstream `main` at `6ea942a7d3df9d4a0922015105b5263057fdb175` contains **1,908
records**, all imported, **35 categories**, **163 original jurisdiction labels**,
and **6 source levels**. The upstream README reports the same 1,908/35 totals.
There are no quarantined records or repeated destination URLs in this revision.
The older 2,768-record audit is not the current catalogue and is not used as a
target, cap, or basis for invented pre-import removals.

Level totals: Provincial 611, Municipal 588, Federal 496, Agency 112,
Regional 56, Crown Corp 45. All levels and jurisdictions are retained, including
municipalities outside Northward's city list. Among the 1,908 records, 508 have
an upstream `dateAdded`; this date is never represented as our verification date.
No separate EN/FR fields are supplied in this revision. Mixed-language original
names and destination URLs remain unchanged; no translation is generated.

The source snapshot was verified against GitHub's pinned blob SHA and byte
count before parsing. `meta.source.contentHash` records SHA-256 of the exact
download. Its source commit, actual retrieval date, byte count and Git blob SHA
remain inspectable in `public/data/services/catalogue.json`. The exact current
check and first-import timestamps are in that file; this document does not
replace machine-recorded run evidence.

## Refresh and validation

```sh
npm run services:refresh
npm run services:check
python3 -I pipeline/services/test_services.py
```

The local cloud image's Python dependencies are in
`/workspace/.venvs/to-canada/bin/python`; activate that environment or use its
Python executable locally. CI installs `pipeline/requirements.txt`.

The daily workflow is `.github/workflows/refresh-services.yml`, at 07:43 UTC,
and also supports manual dispatch. It joins `northward-data-publication` with
`cancel-in-progress: false` and publishes the validated commit through the
existing Pages process. A manual command can pin a known complete source:

```sh
python3 -I pipeline/services/run.py --commit <full-upstream-commit-sha>
```

The runner checks upstream `main` once, then reads catalogue metadata, catalogue
bytes and license at that immutable SHA. Unchanged pinned bytes use the shared
download cache. Network requests use `common.fetch`, two bounded attempts and
30–45 second request timeouts. Source failures never count as successful checks.

Empty arrays, top-level schema changes, malformed required fields, unsafe URL
schemes, Git blob/size mismatches and license validation failures retain the
last valid catalogue. Every invalid input record is recorded with zero-based
`recordIndex`, its original object and explicit reasons in `quarantine.json`.
Any such record blocks the entire candidate snapshot, including removals,
until its schema is understood. No input record is silently discarded.

A contraction larger than 20% or disappearance of any previously represented
category is quarantined as a coverage anomaly. After reviewing the *complete*
upstream revision, an operator can rerun with `--accept-large-removals`.
This flag never bypasses schema validation, checksums, URL or license validation.
The initial import is not compared to historical, unverified baseline counts.

The runner acquires `data/raw/.publication.lock` **before reading prior state**.
It validates and writes the whole Services directory into a sibling stage,
then exchanges directories atomically with the same Linux primitive as the
statistics publisher. If validation or exchange fails, the previous generation
remains. Failed checks publish only truthful status/history alongside unchanged
last-valid entries. The shared build and refresh paths separately preserve and
validate this standalone directory; it does not change the statistics clock.

## Identity and source fidelity

Every source record has a separate entry. Exact matches are paired first;
unambiguous URL/name/type/coverage matches then retain IDs across edits.
Description, category, tags and display-name changes do not recreate otherwise
unambiguous IDs. Same-URL records with different geographic coverage are never
merged. Even exact duplicate occurrences are retained with distinct IDs and
counted. Ambiguous unmatched records receive separate IDs rather than inventing
a legal-entity or service-coverage merge.

Original fields are exposed unchanged for display and preserved in full as
`sourceRecord`, including unfamiliar new fields. Unknown categories and
jurisdictions remain searchable and filterable. Coverage grouping is an
explicit editorial interpretation of `level`, not a replacement:

| Source classification | Coverage group |
| --- | --- |
| Federal + Canada | national |
| Provincial or Territorial | provincial_territorial |
| Regional | regional |
| Municipal | municipal |
| Agency or Crown Corp | agency |
| Other combinations | unmapped |

The original jurisdiction and level always accompany that group. Agency
classification does not establish a geographic service area. Municipal
services are not automatically assigned to every city in a metropolitan area.
No ownership, cost, language availability, eligibility or opening-status claim
is added. Imported descriptions are plain React text, never rendered as HTML.
HTTP(S) destination schemes are validated both during ingestion and display.

## Files and history contract

- `catalogue.json`: `{schemaVersion: 1, meta, entries}`. `meta` has source identity,
  SHA/hash/retrieval, attribution/license, sorted facets, counts and separate
  first-import, last-attempt, last-successful-check and last-content-update
  timestamps. Every entry has a permanent `id`, original display fields,
  `sourceRecord`, source commit/index, content hash, first-seen/content-change
  timestamps, `state: current|retired`, retirement date and coverage grouping.
- `history.json`: `{schemaVersion: 1, events, runs}`. Content events contain
  `initial_import` or `changes`, added/edited/retired/restored counts and affected
  stable IDs. Edits record changed field names and before/after values. Every
  attempted run has its actual time, source commit when known, result, error
  and operational Actions URL when supplied. Both arrays are persistent and
  are never silently truncated.
- `quarantine.json`: the latest attempt's acceptance/error and every quarantined
  input record. The catalogue's last valid counts stay separate from attempted
  input counts when a failed candidate is rejected.
- `LICENSE.txt`: full unmodified upstream MIT license, also preserved in
  `third_party/awesome-canada/LICENSE` and its notice file.

No-change checks create no content event and leave entry first-seen/content-change
times and `lastSuccessfulContentUpdateAt` untouched. Repeating the same check
timestamp/source/outcome does not duplicate its run. Retired entries retain
their content and last observed source provenance; restoring an unambiguous
entry reuses its ID. Initial import history starts here, not at upstream
`dateAdded`. The first attempted import's line-wrap validation bug is retained
as a corrected diagnostic in run history; the upstream MIT terms did not change.

## Link health and attribution

`docs/state/link-health.json`, `worker/src/health.js` and `worker/src/research.js`
were inspected to understand the source's maintenance. This implementation does
not import upstream health labels or perform destination probes, so it cannot
mistake those checks for independent Northward verification. No service is
hidden because a site returns 403/429, times out or fails temporarily. A
successful catalogue check says nothing about present eligibility or whether a
linked site's content is current.

The visible credit names Awesome Canada, wra-sol and contributors and links the
repository and public site. The upstream README specifies MIT but no additional
required attribution wording. Full notice: **Copyright (c) 2026 Awesome Canada**.
Linked sites and datasets retain their own terms. Sources & credits exposes the
complete license and this distinction.

## Reproducible checks

`test_services.py` covers complete accounting, source fidelity, duplicate
coverage, stable IDs, initial/add/edit/retire/restore history, same-input no-op,
new commits without content changes, schema/empty/network failure retention,
unknown classifications, suspicious contractions, unsafe schemes, Git blob
checksums and failed atomic publication. `check.validate_directory(Path)` is
the integration validator used by the shared publication paths. It checks
source indices cover the complete catalogue exactly and verifies source hashes,
counts, IDs, history references and the full license notice without network.
