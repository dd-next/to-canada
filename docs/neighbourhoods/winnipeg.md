# Winnipeg neighbourhood evidence

Verified 2026-11-07. Adapter: `pipeline/neighbourhoods/winnipeg.py`.
Output: `data/processed/neighbourhoods/winnipeg.json` (schema version 1).

The bundle contains **194 neighbourhoods with matched 2016 census values and
2016 polygons**, 15 measures, named parks and civic amenities, and bus-stop
coverage counts.
It covers the City of Winnipeg's published 2016 census neighbourhoods, not
the Winnipeg CMA and not every present-day neighbourhood. It deliberately
keeps the older census period visible.

## Sources and dates

All data is downloaded through `common.fetch.fetch` into the ignored shared
`data/raw/` cache, including URL, SHA-256, response dates and actual retrieval
timestamps in its metadata sidecars. The bundle preserves source records;
the source registry and public-data publication are owned by the lead.

| Source | Geography / use | Observation or inventory period | Publisher update | Retrieval |
| --- | --- | --- | --- | --- |
| [Census Boundaries, re9d-6c9j](https://data.winnipeg.ca/d/re9d-6c9j) | 194 rows selected by `year=2016 AND boundary_type='Neighbourhood'` | 2016 census geography | 2021-03-16 | 2026-11-07 |
| [Census Values, ckim-fid6](https://data.winnipeg.ca/d/ckim-fid6) | 16 selected characteristics, same year and boundary codes, `sex='All'` | 2016 Census custom tabulation | 2020-12-07 | 2026-11-07 |
| [Parks and Open Space, tx3d-pfxq](https://data.winnipeg.ca/d/tx3d-pfxq) | 1,401 park/open-space polygons before ID deduplication | Inventory updated 2026-11-02 | 2026-11-02 | 2026-11-07 |
| [Library, bt47-pkkm](https://data.winnipeg.ca/d/bt47-pkkm) | 21 mapped library points | Inventory updated 2026-11-01 | 2026-11-01 | 2026-11-07 |
| [Recreation Complex, bmi4-vvs2](https://data.winnipeg.ca/d/bmi4-vvs2) | 181 complexes; community-centre, arena, pool and fitness flags | Inventory updated 2026-11-01 | 2026-11-01 | 2026-11-07 |
| [Winnipeg Transit GTFS](https://gtfs.winnipegtransit.com/google_transit.zip) | 3,888 boarding stops referenced by bus-route trips | 2026-09-06 to 2026-12-12, from `feed_info.txt` | HTTP Last-Modified 2026-09-07 | 2026-11-07 |

Municipal catalogue sources carry the Open Government Licence - Winnipeg.
Census transformations also attribute Statistics Canada and its Open Licence.
The GTFS ZIP includes a `LICENCE` file identifying Open Data Commons PDDL v1.0.
[Winnipeg Transit Open Data](https://winnipegtransit.com/en/open-data/about/)
is the human-readable transit source link.

## Census and geography correspondence

The two census datasets explicitly cross-reference one another in their
official metadata. `Census Boundaries` has `year`, `boundary_code`,
`boundary_type`, `boundary_name`, non-response information and `location`
geometry. `Census Values` has the same geography/year fields and characteristic
IDs and labels. The adapter checks:

- Exactly 194 distinct 2016 neighbourhood codes in the boundary release.
- Exact code sets and names between selected census records and boundaries.
- Year, type, `sex='All'`, characteristic descriptions and cell uniqueness.
- No current neighbourhood polygon replaces the census polygon.

The selected boundary rows are a census-profile subset. The City's
[geography explanation](https://www.winnipeg.ca/census/includes/Geographies.stm)
describes small industrial/undeveloped areas whose census data is suppressed.
Those missing polygons are not filled with zero-valued profiles or inferred
from today's neighbourhood inventory.

The City also publishes
[2021 neighbourhood profiles](https://www.winnipeg.ca/census/2021/) and an
[alphabetical listing](https://www.winnipeg.ca/census/2021/Alpha/default.asp).
The accessible census API, however, only contains 2011 and 2016 records, as
confirmed by grouping both datasets by year and boundary type. A matching
name in the separate 2021 listing does not prove polygon equivalence.
The general geography explanation says some neighbourhoods were added or
modified for development; it does not establish that every current or 2016
polygon matches 2021. The
[maps page](https://www.winnipeg.ca/census/includes/Maps.stm) did not supply
a verified 2021 polygon crosswalk. Consequently 2021 profile values are not
joined to 2016 or current polygons in this release. An upgrade needs a
verified 2021 polygon set or publisher correspondence for each affected area.

## Measures and denominators

This is the City's **2016 custom census tabulation**, not a current estimate.
Its official Agassiz workbook, linked by the boundary record, says a 25%
sample was used for the profile statistics and describes census rounding.
The population measure uses characteristic 1, explicitly the age total for
**people in private households**; it must not be labelled the entire city
population or include collective-dwelling residents.

| Measure | Publisher characteristic IDs and calculation |
| --- | --- |
| Population in private households | `1` |
| Private households | `1596` |
| Children under 15 | `2 / 1 × 100` |
| Estimated people per household | `1602 / 1596`, one decimal, from rounded counts |
| One-person households | `1597 / 1596 × 100` |
| Apartment share | `(1720 + 1725) / 1718 × 100`; duplexes excluded |
| Renter-household share | `1670 / 1668 × 100` |
| Median tenant shelter cost | `1766`, only with positive `1763` denominator and positive estimate |
| Public-transit commute share | `6172 / 6169 × 100` |
| Walking/cycling commute share | `(6173 + 6174) / 6169 × 100` |

The source API's household average characteristic is integer-valued, so the
bundle labels its own rounded-count ratio **Estimated people per household**.
It does not present the ratio as an exact publisher average. Commuting covers
employed people aged 15+ with a usual workplace or no fixed workplace address,
excludes working at home, and reflects 2016 travel.

Median tenant shelter cost describes occupied rentals across dwelling sizes,
including applicable utilities. It is not today's asking rent. The API
publishes zero cost amounts with both zero and positive tenant counts and
has no row-level suppression/status column to distinguish an absent estimate
from a literal zero. This adapter conservatively treats the ambiguous zero
as unavailable, not proof of free rent: **24 neighbourhoods retain an
unavailable tenant-cost value**. For example, Royalwood has 25 tenant
households (`1763`), a zero median (`1766`) and a positive $2,126 average
(`1767`). The official Royalwood workbook likewise reports 25 tenant
dwellings and $2,126 average gross rent. That average is not substituted for
the median. Those three raw API cells are preserved in
`fixtures/winnipeg/tenant-cost-ambiguity.json`; the adapter makes no claim
that it can recover a specific suppression flag missing from the feed.
Polo Park's rounded apartment components exceed its rounded occupied-dwelling
total; its apartment share remains unavailable rather than being clamped to
100%. Every missing value has `missingReason`; missing addends, zero
denominators, or invalid shares do not become valid zero percentages.

## Spatial attribution

All calculations use original, valid polygons in **NAD83 / UTM zone 14N
(EPSG:26914)**. Only the final map geometry is simplified by 12 metres,
converted to WGS84 and oriented with clockwise exterior rings for D3.

- Parks are unified by publisher `park_id`. Counts require more than 1 m²
  of overlap. Area uses the union of overlapping park/open-space polygons,
  so duplicate/overlapping polygons cannot inflate the share. This inventory
  includes open space and water within polygons, not just recreational lawns
  or all greenery. Boundary-crossing sites can appear in several areas.
- GTFS stop IDs are retained only when referenced by trips on bus routes
  (`route_type=3`). Opposite-direction stops remain separate. Their locations
  are used internally to compute the `busStops` coverage count. The bundle's
  rail-only `stations` lists remain empty, with no `rail` definition or
  `transportLabel`, so buses cannot appear as rail dots. Distances are from
  each stop point to the original polygon, zero inside and no more than 800 m
  outside. They are not walking distances from a home and do not measure
  frequency, daily service, accessibility or real-time operation. Individual
  bus stops are not serialized in the rail-station fields.
- Library complex IDs are deduplicated and their points must lie inside or
  on the polygon. Of the 21 source points, 20 fall in the released 194-area
  geography. One outside this subset is not forced into the nearest area.
- Recreation complexes are keyed by name and address (one source address is
  absent). Polygon overlap must exceed 1 m². Only
  `community_centre=true` sites count as community centres. Arena, indoor/
  outdoor pool and fitness/leisure flags supply additional named amenities.
  There are amenities in 92 neighbourhood profiles. An inventory presence
  does not establish opening hours or an operational branch: the library
  feed has no operational-status field.

The bundle does not cover groceries, schools, clinics, current asking rents,
bus frequency, walking routes or all local facilities. It has no resident
reviews or unsupported neighbourhood character claims. Cross-city park and
transit rankings would require harmonised inventory definitions.

## Representative source checks

| Neighbourhood | Private-household population | Households | Renters | Median tenant shelter | Public-transit commuters |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agassiz, `NE001001` | 365 | 155 | 0.0% | Unavailable | 12.9% |
| River-Osborne, `NE149149` | 4,750 | 2,995 | 87.6% | $844/month | 26.9% |
| Sage Creek, `NE159159` | 4,790 | 1,570 | 19.1% | $1,301/month | 4.9% |

These are **2016 census observations**. Their source rows are retained in
`pipeline/neighbourhoods/fixtures/winnipeg/census-2016.json`. Agassiz also
cross-checks against the official workbook URL in its boundary record:
[Agassiz 2016 profile](https://winnipeg.ca/Census/2016/Community%20Areas/Fort%20Garry%20Neighbourhood%20Cluster/Neighbourhoods/Fort%20Garry%20South/Fort%20Garry%20South%20Neighbourhoods/Agassiz/Agassiz.xlsx).

Current inventory examples, calculated separately: River-Osborne has 6
overlapping park/open-space sites, 6.7% mapped park/open-space coverage and
118 distinct bus boarding stops in or within 800 m of the boundary; its
named fitness amenity includes Mayfair Recreation Centre. Wolseley has
Robert A. Steen Memorial C.C. in the community-centre inventory. These
numbers describe proximity to an entire area, not to a specific residence.

## Reproduction and validation

```bash
/workspace/.venvs/to-canada/bin/python pipeline/neighbourhoods/winnipeg.py
/workspace/.venvs/to-canada/bin/python -I pipeline/neighbourhoods/test_winnipeg.py
```

The standalone adapter writes only the processed Winnipeg JSON. Refreshes
are cached unless `NORTHWARD_REFRESH=1` is deliberately set. The initial
snapshot passed **11 offline tests**, including independent source examples,
suppression/zero-cost handling, missing apartment components, wrong vintage,
duplicate cells, park unions and touch-only exclusions, stop-ID preservation,
800 m polygon distance, bus-only GTFS extraction and the 194-record snapshot's
geometry/source/metric contract. Lead integration supplies shared checks,
UI/browser checks, CI and publication after the earlier release stages.
