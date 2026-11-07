# LMIA parser fixtures

`sectioned-2015.xls` is a small, synthetic BIFF8 workbook authored for the parser
test. Its fictional employers are never shipped as product data. It exercises
the legacy province-section layout, repeated headers and aggregate totals.
Other CSV/XLSX layouts are generated in temporary directories by `test_lmia.py`.

The delivered dataset comes only from successfully retrieved official ESDC
files, with URL, retrieval date and SHA-256 recorded per resource.
