# IRCC Updates

Run from the repository root with the existing Python requirements installed:

```sh
python3 -I pipeline/updates/run.py
python3 -I pipeline/updates/check.py
python3 -I pipeline/updates/test_updates.py
```

`run.py` checks only the official IRCC publication sources and atomically replaces
`public/data/updates.json` after validation. It does not download statistical
tables, regenerate city data or call an LLM. Exit `0` means every source check
succeeded; `2` means at least one source failed. Existing records from a failed
source remain byte-for-byte equivalent, including their last successful record
check time. The source status records the unsuccessful attempt and its error.

## Sources and coverage

- [IRCC RSS directory](https://www.canada.ca/en/immigration-refugees-citizenship/news/rss.html):
  discover the official `api.io.canada.ca` newsroom endpoint. Its JSON format
  exposes `publishedDate`; Atom exposes only `updated`, which must not be
  presented as a verified publication date. Ingest the publisher's most recent
  50 records and original teasers. News releases, backgrounders, statements and
  media advisories may be separate publications with similar titles. Read the
  same endpoint's Atom category to preserve those official subtypes explicitly.
- [Program delivery updates](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals/updates.html):
  read only the update table, including its publication dates and documented
  topic codes. Initial ingestion covers the current year and two prior years,
  matching the archive policy stated on that page. Unknown/typo category codes
  are not expanded into invented topics. The original title and direct source
  link stand alone where the index provides no summary.
- [Express Entry rounds](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html):
  discover the official English JSON endpoint from the table's configuration.
  Retain all available draws with their category, date, invitation count, CRS
  cutoff and tie-breaking rule. IDs such as `91a` and `91b` remain distinct.

On 2026-11-05 all three source checks succeeded. The saved snapshot contains 914
publications: 50 newsroom entries (2026-04-20 through 2026-11-03), 410 program
delivery updates (2024-01-04 through 2026-11-03), and 454 draws (2015-01-31 through
2026-10-28). These ranges describe actual captured records, not a promise of
complete news coverage. Publications that later leave a rolling source listing
remain in the retained snapshot. The very first run cannot recover publications
already absent from the newsroom's latest-50 window.

## Identity, updates and dates

News/PDU identity is derived from the canonical official URL; draw identity uses
the official round number. The hash covers meaningful ingested fields, not the
HTML header/footer, a check timestamp or unrelated pool-distribution fields.
Repeated processing preserves `firstSeenAt`; changed fields update the existing
record. `contentChangedAt` is the time this pipeline observed a changed record,
distinct from an optional publisher-supplied `updatedAt`. Publication dates,
first discovery, record checks and source checks are kept separately.

Only fields present in the official feed/index/structured draw record are
ingested. Full article-body revisions that do not change those fields are not
detected; readers should follow the official link. No effective date, affected
audience, personalized recommendation or legal implication is inferred from a
headline. Program links require an explicit program name. PDU audience comes
from the source's description of the index as guidance for IRCC staff and
stakeholders. Draw categories remain separate; there is no combined cutoff trend.

## Scheduling and recovery

`.github/workflows/refresh-ircc-updates.yml` runs at minute 17 every six hours UTC
and supports a manual trigger. It shares the `northward-data-publication`
concurrency group with the weekly statistical refresh. It commits the validated
feed/source-status file and passes that exact commit SHA to the existing Pages
workflow. A source failure is published as status with retained records, then
reported as a failed workflow job so it is not mistaken for “no changes.”

Local runs also share `data/raw/.publication.lock` with statistical publication
and standalone app-data builds. IRCC acquires it before reading the previous feed
and keeps it through the final write, so a simultaneous directory exchange or
another feed refresh cannot overwrite newly published records.

Inspect the source error in `public/data/updates.json` and the workflow log. Fix
access or a changed source parser, rerun the focused parser tests, then manually
rerun the workflow. Do not erase existing entries or advance the last successful
check timestamp to recover from an error. The interface marks failed sources and
checks older than 24 hours, and exposes actual coverage and last-success times.
