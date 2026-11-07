# Victoria comparison-area evidence

Adapter: `pipeline/neighbourhoods/victoria.py`; output:
`data/processed/neighbourhoods/victoria.json`. Export: `build()` returns v1.
Checked and built 2026-11-07. This bundle covers **the City of Victoria**, not
Greater Victoria, the Victoria CMA, Saanich, Oak Bay, Esquimalt or the West Shore.

## Why there are ten comparison areas

The City publishes 2021 short- and long-form census CSVs for twelve named areas.
Their catalogue descriptions explicitly say that Harris Green is included in
Downtown, and North and South Jubilee are together. These are special
Statistics Canada tabulations prepared with the Capital Regional District,
published in the catalogue on 2023-11-29.

The City's [boundary decision record](https://engage.victoria.ca/neighbourhood-boundaries)
identifies changes effective **2022-06-09**, with administrative maps updated in
2023:

- The east side of Shelbourne Street, blocks 2700–3000, moved from Jubilee to
  Oaklands.
- The block between Fort Street and Academy Close, and between Blanshard and
  Quadra Streets, moved from Fairfield to Downtown.
- Harris Green became part of Downtown.

The current boundary API has twelve polygons, while the census is an earlier
observation period. No official historical machine-readable neighbourhood
boundary archive was located. A direct join solely on matching names would
hide the transferred blocks. The adapter therefore combines both sides of
each transfer. The transferred blocks are internal to the resulting union, so
the comparison area's external perimeter and combined census population are
unaffected by the transfer. The page's other boundary ideas were proposals;
the adapter follows the final June 2022 decisions rather than the proposals.

| Output area | Census columns summed | Current boundary polygons united |
| --- | --- | --- |
| Downtown / Fairfield (combined area) | Downtown; Fairfield | Downtown; Fairfield |
| Oaklands / Jubilee (combined area) | Oaklands; Jubilee | Oaklands; Jubilee |
| Burnside/Gorge | Burnside/Gorge | Burnside |
| Fernwood, Gonzales, Hillside/Quadra, James Bay, North Park, Rockland, Victoria West | Same-named individual column | Same-named polygon |

This produces eight single neighbourhoods and two combined comparison areas.
Names and geometry sets must match the complete explicit crosswalk or the
adapter fails. The `boundaryVintage`, `boundaryNote`, `coverageNote`, quality
fields and description text disclose the treatment. These are not ten newly
declared official neighbourhoods.

The map is the current municipal representation of those external areas, not a
recovered 2021 boundary file. Historical vertex-by-vertex identity cannot be
established from this service: the unions address the documented transfers,
while the bundle labels geometry as a municipal snapshot. Reassess the
crosswalk if the City publishes further boundary changes. `areaType` is
`comparison area` so the UI names this scope explicitly.

## Official sources

Every raw download uses `common.fetch.fetch`; source `retrievedAt` values come
from its sidecars. Metadata and downloads are in ignored `data/raw/`. The
sources below are embedded in the output bundle.

| Source ID | Landing page / download | Period and scope |
| --- | --- | --- |
| `victoria-census-2021-short` | [City catalogue](https://www.arcgis.com/home/item.html?id=804bf4a2fd1346da92e631e43f2288c2), [CSV](https://www.arcgis.com/sharing/rest/content/items/804bf4a2fd1346da92e631e43f2288c2/data) | 2021; 100% census data, twelve city columns; catalogue publication 2023-11-29 |
| `victoria-census-2021-long` | [City catalogue](https://www.arcgis.com/home/item.html?id=5eaa36372a7646d2945abfb4c3ea7828), [CSV](https://www.arcgis.com/sharing/rest/content/items/5eaa36372a7646d2945abfb4c3ea7828/data) | 2021; 25% sample, same twelve city columns; catalogue publication 2023-11-29 |
| `victoria-neighbourhood-boundaries` | [City catalogue](https://www.arcgis.com/home/item.html?id=6aede472420644c98a80f1f8e2ebfce9), [MapServer layer 4](https://maps.victoria.ca/server/rest/services/OpenData/OpenData_Land/MapServer/4) | Twelve current polygons, snapshot retrieved 2026-11-07; no actual data-update date published |
| `victoria-boundary-decisions-2022` | [City's final boundary decisions](https://engage.victoria.ca/neighbourhood-boundaries) | Changes effective 2022-06-09; source page says maps updated in 2023 |
| `victoria-parks-open-spaces` | [City catalogue](https://www.arcgis.com/home/item.html?id=6aa80a4df66144cf839447040f519de4), [MapServer layer 50](https://maps.victoria.ca/server/rest/services/OpenData/OpenData_Parks/MapServer/50) | Snapshot retrieved 2026-11-07; 172 records after excluding school and cemetery classes |
| `victoria-community-facilities` | [City catalogue](https://www.arcgis.com/home/item.html?id=36ce9ffd00124fd495bb6710b83451b5), [MapServer layer 7](https://maps.victoria.ca/server/rest/services/OpenData/OpenData_Facilities/MapServer/7) | Snapshot retrieved 2026-11-07; seventeen civic/community facility points |
| `victoria-bc-transit-stops` | [BC Transit open data](https://www.bctransit.com/open-data/), [official static GTFS](https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48) | Feed validity 2026-11-05 through 2027-01-03; retrieved 2026-11-07; version `202611070/20261106 21:00:00/20261107 04:00:00` |

The municipal catalogue explicitly warns that its item "Last Updated" date can
reflect schema/description edits while scripted data updates do not change it.
Accordingly, those dates are **not** used as source-data release dates. Dynamic
municipal layers have an explicit retrieval-snapshot period and no fabricated
release date. Census release dates are identified as catalogue publication
dates, separate from the 2021 observation period.

The original BC Transit stops CSV linked from its open-data page was inaccessible
from this environment (proxy CONNECT 403). The official static GTFS link on the
same page succeeded and supplies the stop inventory; no third-party transit
copy was substituted.

## Calculation and missingness

The CSVs are Windows-1252, not UTF-8. Trim column-name whitespace (`Fairfield `)
and retain repeated characteristic labels by occurrence. For example, the
short form contains both a count and a later percentage row called "0 to 14
years"; use the count. Duplicate area columns and unexpected row widths fail.

- Population: total age-group population in the 100% table; randomly rounded.
- Households: private households by household size, 100% table.
- Children and one-person households: component counts / matching totals.
- Household size: people in private households / private households. The
  source's average row is rounded to whole persons; calculate a two-decimal
  average from the published counts rather than implying false source precision.
- Apartments: fewer-than-five plus five-or-more-storey building counts divided
  by occupied private dwellings. Duplexes are excluded.
- Renting: renters / private households by tenure in the 25% sample.
- Tenant shelter: the published neighbourhood median for 2021 occupied rental
  dwellings, including utilities where applicable, all sizes; not current
  asking rent. **Both combined-area medians are null** with a reason. Medians
  cannot be added or household-weighted to obtain a combined median.
- Commuting: public transit, or walking plus bicycle, divided by employed
  people aged 15+ with a usual workplace or no fixed workplace. This excludes
  working at home and reflects May 2021 pandemic conditions.
- Combined-area counts are summed before calculating rates. Any missing
  component remains missing; invalid or zero denominators do not become zero.

Spatial calculations use the **original** polygons projected to EPSG:3157
(NAD83(CSRS) / UTM zone 10N). Display polygons alone are simplified by 5 m,
converted to WGS84 and oriented clockwise for D3.

Park classes SC, SCH and CE are excluded. The remaining inventory includes
parks, beaches, docks, squares, pathways and greenspace: its measure is labelled
"park and open-space area", not tree canopy or unrestricted public parkland.
Records sharing a published park name are unioned. A named site counts if more
than 1 m² intersects an area; intersected polygons are unioned before computing
the area share so overlap is counted once.

BC Transit boarding stops are distinct `stop_id` values in `stops.txt`.
`busStops` counts those inside or within 800 m of the original comparison-area
polygon in a straight line. This is neither walking distance from a home nor
frequency. A stop can count in several neighbouring areas. **The rail-only
`stations` arrays remain empty and no rail metric is invented.**

Facility points inside the polygon appear in `amenities`, with their source ID
and category. `communityCentres` counts only the source's Community Centre
category. A zero means no matching record in this inventory, not no amenities
in reality. The dataset does not establish opening hours or admission, and no
unsupported library count is added.

## Representative source checks

| Area | Raw source observations | Output |
| --- | --- | --- |
| Burnside/Gorge | Population 6,875; private households 3,255; people in private households 5,645; sample renters 2,140 / tenure total 3,245; median tenant shelter $1,190 | Population 6,875; household size 1.73; renters 65.9%; shelter $1,190/month |
| Downtown + Fairfield | Population 9,120 + 11,740; households 5,720 + 6,685; renters 3,870 + 3,675; tenure denominators 5,665 + 6,705 | Population 20,860; households 12,405; renters 61.0%; shelter median missing |
| James Bay | Population 13,055; households 7,645; median tenant shelter $1,370 | Matching source observations; 27 mapped park/open-space names; 105 bus-stop IDs within 800 m on this snapshot |

All twelve census columns sum to 91,855 residents and 49,225 households.
The small difference from the City's unrounded headline census totals is
expected from the component table's random rounding; do not rescale cells to
force a municipal total.

Output: ten areas, fourteen metric definitions, seven sources, and four
source-cited measured description sections per area. The only missing cells
are the two intentionally unavailable combined-area shelter medians.

## Reproduction and validation

```bash
/workspace/.venvs/to-canada/bin/python pipeline/neighbourhoods/victoria.py
/workspace/.venvs/to-canada/bin/python -m unittest pipeline/neighbourhoods/test_victoria.py -v
```

Six tests check representative official values, count-weighted unions, missing
components, repeated labels, the explicit boundary crosswalk, polygon-distance
bus attribution and overlapping park area. `fixtures/victoria/*_excerpt.csv`
contains verbatim selected rows from the above official CSVs, encoded UTF-8 for
tests. The complete original bytes and source retrieval metadata stay cached.

The built bundle passed the shared `neighbourhoods.check.validate` function,
finite/percentage bounds, unique IDs and source references, valid nonempty
WGS84 polygons, clockwise exteriors and empty rail-only lists. UI/browser and
release integration are owned by the lead; this adapter does not write shared
manifests, the source registry or `public/data`.
