# Validation evidence

Validated on 7 November 2026 UTC, including Toronto/Vancouver neighbourhood
release `158c084` and the `/to-canada/` deployment base path.

## Reproduce

Install the repository's Node and Python dependencies, then run the commands
in `.github/workflows/validate.yml`. For a browser pass:

```sh
BASE_PATH=/to-canada/ npm run build
BASE_PATH=/to-canada/ npm run preview -- --host 127.0.0.1 --port 4174
# In another terminal, with Playwright installed and Chromium available:
NORTHWARD_BROWSER_BASE=http://127.0.0.1:4174/to-canada node scripts/check-hubs-browser.cjs
```

`CHROMIUM_PATH` can select another installed Chromium. For a managed proxy that
uses its own CA, `NORTHWARD_BROWSER_CA_CERT` can point at the supplied certificate:
the browser pins its public key for that process, without changing a persistent
trust store. No blanket TLS-error bypass is used.

## Checks performed

- Model and scenario checks, unchanged CRS suite (including 89 official-case
  comparisons, language bands, maxima and privacy-related inactive-answer cases).
- Application, IRCC and all four published neighbourhood snapshot validators;
  existing ingestion/failure/freshness tests; Toronto/Vancouver geographic tests.
- 16 Services lifecycle tests: complete coverage, stable IDs including duplicate
  multiplicity changes, meaningful edits, retirements/restoration, no-op inputs,
  schema and source failures, incomplete snapshots and retained publication.
- 18 LMIA tests: historical formats, missing counts, grouped cells, NOC versions,
  bilingual/revised-resource selection, overlap and partial-failure retention.
- Pure UI tests cover all Services categories/jurisdictions, every program's
  group, URL isolation, safe links, full-dataset filters and LMIA totals.
- Three combined publication tests replay a real app rebuild and atomic
  promotion with the current Services, LMIA, IRCC and neighbourhood data.
  Every independent-feed byte and neighbourhood value survives. Feed checks
  do not change the statistical content fingerprint.
- Production build succeeds with 954 static route entries. New code and datasets
  are lazy-loaded; Services never requests LMIA partitions.
- Real Chromium tests exercise seven new/canonical pages at 1440, 768 and 375 px,
  active navigation, page overflow, search/filter/reset, pagination/back, stable
  record links, update history, aliases with query/hash, source failure, keyboard
  and mobile navigation, calculator URL/storage privacy and existing pages.

Browser results and screenshots are in
[`dev/validation/services-immigration`](../../dev/validation/services-immigration).
The source audit script in that directory independently reads every row of the
two real LMIA workbooks without importing the ingestion parser. It requires the
original downloads and fails explicitly when they are absent.

## Source evidence and limits

The entire Awesome Canada source was compared with all 1,908 imported original
records. Its MIT license matches the repository and published notices byte for
byte. A live no-change refresh advanced the successful-check clock while keeping
the content timestamp and content events unchanged.

All 12,823 delivered LMIA rows match the official workbooks, including 35,006
approved positions, missing approved-LMIA counts, NOC 2011 and the publisher's
outside-Canada category. Current official catalogue completeness and the other
38 discovered periods could not be verified because the source host returned
HTTP 503 timeouts. Partial coverage is explicit throughout the UI and metadata.

The standard statistical snapshot check deliberately skips raw-source
integration when those cached downloads are unavailable. It does not claim
fresh verification of unchanged statistical sources. New Services and delivered
LMIA records received the direct source checks described above.
