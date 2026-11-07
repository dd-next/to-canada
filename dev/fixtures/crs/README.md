# IRCC CRS reference fixtures

`official-calculator.json` is a capture of the November 3, 2026 scoring version
from the official page, retrieved November 7, 2026 UTC (November 8 in Bangkok).
Its metadata includes the original HTML, extracted scoring-script and criteria
page SHA-256 hashes, plus the calculator page’s publication date.

Each case overlays `overrides` on `base`. `official` contains the actual public
calculator output, including known defects. Do not alter those expected values
to make the application pass. Reviewed departures from this output are explicit
in `scripts/check-crs.mjs` and explained in `docs/CRS_CALCULATOR.md`.

Tables are verbatim arrays from the official inline script. Range punctuation
and insignificant whitespace are normalized only during comparisons; point
values and raw score thresholds are not normalized.

To reproduce a capture, load the official script with a minimal DOM/jQuery
adapter, map profile answers to the official dropdown codes, set `with_spouse`
and `fol_lang` as the form does, submit `#crs-form`, then read `core_factors`,
`spouse_factors`, `skill_factors`, and `totals`. Non-applicable partner and test
fields must be empty, as in a fresh official form. Keep the fetched source files
and compare their SHA-256 hashes to this manifest when auditing a result.

The fixture is development data and is never loaded into the shipped page.
