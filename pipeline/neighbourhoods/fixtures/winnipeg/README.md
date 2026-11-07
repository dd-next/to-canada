# Winnipeg census fixture

`census-2016.json` contains the 16 selected source cells for Agassiz,
River-Osborne and Sage Creek from the City of Winnipeg's official
[Census Values](https://data.winnipeg.ca/d/ckim-fid6) API, downloaded
2026-11-07. Values, publisher descriptions, boundary codes, sex and year are
retained verbatim. The query selects `year=2016`,
`boundary_type='Neighbourhood'`, `sex='All'` and the characteristic IDs in
`winnipeg.CENSUS_LABELS`. The complete original download and HTTP metadata
remain in the ignored shared raw cache.

The fixture provides contrasting counts and denominator cases. Agassiz has
365 people in private households, 155 households, 25 one-person households,
and no positive tenant-cost estimate. River-Osborne has 4,750 people,
2,995 households and a $844 median tenant shelter cost. Sage Creek has
4,790 people and 1,570 households. All are 2016 observations.

`tenant-cost-ambiguity.json` preserves Royalwood's three cost-related cells
from the same official API: 25 tenant households, a median of 0, and an
average of $2,126. No suppression/status field accompanies the zero median.
The adapter conservatively leaves that ambiguous zero unavailable and does
not substitute the average. The official Royalwood profile workbook also
reports 25 tenant dwellings and $2,126 average gross rent.

Contains information licensed under the Open Government Licence - Winnipeg.
Adapted from Statistics Canada, 2016 Census of Population, custom tabulation
supplied to the City of Winnipeg. This does not constitute an endorsement by
Statistics Canada of this product.
