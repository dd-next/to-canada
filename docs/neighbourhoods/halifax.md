# Halifax census-tract evidence

Adapter: `pipeline/neighbourhoods/halifax.py`; output:
`data/processed/neighbourhoods/halifax.json`. Export: `build()` returns v1.
Checked and built 2026-11-07.

The bundle contains **99 inhabited 2021 census tracts wholly inside Halifax
Regional Municipality**, identified by Statistics Canada CSD `1209034`.
These are statistical comparison areas, **not official named urban
neighbourhoods**. Each display name starts `2021 census tract <CTUID>`.
Current municipal E911 community names are optional geographic locator context
after the tract identifier; those names never define the census geography.
The bundle's `areaType` is `census tract` so headings and search use that name.

## Source and geography investigation

The municipal [Community Boundaries catalogue](https://www.arcgis.com/home/item.html?id=b4088a068b794436bdb4e5c31df76fe2)
describes E911/community-consultation boundaries, including some still awaiting
final consultation. It does not establish a 2021 census crosswalk. The current
layer has 200 communities and includes large areas named HALIFAX, DARTMOUTH and
BEDFORD, which are not the same thing as colloquial urban neighbourhoods.

Municipal [Suburban Plan profiles](https://engagehalifax.ca/suburban-plan/suburban-area)
provide named planning-area PDFs with selected 2021 census measures and separate
Environics 2024 estimates. They were investigated, but an exact machine-readable
profile-boundary crosswalk was not found. The [official study-area layer](https://www.arcgis.com/home/item.html?id=3d42542d0d894ba2bca05975119a3d98)
is the broader regional-centre/suburban study area, not a proven boundary for
every profile PDF. The adapter does not treat those estimates or broad planning
areas as neighbourhood census values.

Instead, it uses the City's official **2021 census tract layer**, joins Census
Profile rows by exact 2021 `CTUID` / `2021S0507<CTUID>`, and selects whole tracts
against the official **2021 census subdivision geometry**. No proportional
area allocation, centroid assignment of residents, or modern-community census
join is used.

The municipal tract layer contains 104 polygons. The CSD layer contains Halifax
and four reserve census subdivisions. All 100 Halifax-CSD tracts are wholly
inside its polygon (area inclusion at least 99.99%; a partly crossing tract
would fail the build, not be clipped). Four tract polygons have zero municipal
overlap and are excluded:

| Excluded tract | Separate 2021 CSD | Source population |
| --- | --- | --- |
| `2050121.09` | `1209019` Cole Harbour 30 | 208 |
| `2050154.01` | `1209037` Beaver Lake 17 | 20 |
| `2050154.03` | `1209038` Sheet Harbour 36 | 10 |
| `2050132.09` | `1209800` Wallace Hills 14A | 15 |

These reserve areas are separate jurisdictions; excluding them defines the
municipal scope and is not an assertion that their residents are outside the
wider Halifax region. East Hants and other Halifax CMA areas are also excluded.
The Canada-wide Census Profile download contains additional CMA tracts, which
are not used merely because their code starts with the Halifax CMA prefix.

One wholly municipal tract, `2050155.00`, has population **0**, source data
quality flag `09999`, no published household/housing/commuting profile and no
selected mapped services. It is omitted to avoid an empty residential profile.
The omission is explicit in the bundle's coverage note. The remaining **99
inhabited tracts have all fifteen measures populated** on this snapshot.

## Official sources

Every raw download uses `common.fetch.fetch`, including source metadata.
`retrievedAt` is copied from its actual cache sidecars. Source metadata is
embedded in the bundle, while downloaded bytes remain in ignored `data/raw/`.

| Source ID | Landing page / service | Period and scope |
| --- | --- | --- |
| `halifax-census-tracts-2021` | [Municipal catalogue](https://www.arcgis.com/home/item.html?id=89aeb7e05c0047ebaf511e72bd66620c), [tract layer](https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Census_2021_Census_Tracts/FeatureServer/0) | 2021 geometry and population; 104 municipal-catalogue features; service data edit 2022-06-24 |
| `halifax-municipal-boundary-2021` | [Municipal catalogue](https://www.arcgis.com/home/item.html?id=4b247c1b8cfe4cc5bd0d338d19040b0b), [CSD layer](https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Census_2021_Census_Subdivisions/FeatureServer/0) | 2021 geometry; five CSDs; service data edit 2025-05-07 is not the census period |
| `halifax-census-2021-profile` | [Statistics Canada catalogue 98-401-X2021007](https://www150.statcan.gc.ca/n1/en/catalogue/98-401-X2021007), [official CSV ZIP](https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=007) | 2021; tract rows only; retrieved 2026-11-07 |
| `halifax-community-locators` | [Municipal catalogue](https://www.arcgis.com/home/item.html?id=b4088a068b794436bdb4e5c31df76fe2), [E911 community layer](https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/GSA/FeatureServer/0) | Service data updated 2026-11-01; 200 areas; locator context only |
| `halifax-parks` | [Municipal catalogue](https://www.arcgis.com/home/item.html?id=3df29a3d088a42d890f11d027ea1c0be), [parks layer](https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/HRM_Parks_2/FeatureServer/0) | Service data updated 2026-11-01; 921 records after excluding cemeteries |
| `halifax-bus-stops` | [Municipal catalogue](https://www.arcgis.com/home/item.html?id=29de9d04a3454e11a1e0a1f78a27bc07), [bus-stop layer](https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/Bus_Stops_2/FeatureServer/0) | Service data updated 2026-11-01; 2,338 In Service records |
| `halifax-community-facilities` | [Municipal catalogue](https://www.arcgis.com/home/item.html?id=4d44051e006b457580ab4d86fa30c949), [building-symbol layer](https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/BuildingSymbol/FeatureServer/0) | Service data updated 2026-11-01; 200 selected library, community, recreation, museum, gallery, theatre and ferry-terminal points |

Service update dates use `editingInfo.dataLastEditDate`; ArcGIS catalogue item
modified dates are not used as data release dates. Census metric definitions
remain explicitly **2021**, regardless of a later service edit or retrieval.

The official comprehensive ZIP is 249,720,408 bytes, SHA-256
`5d29811e5c3171cb16c9564bfbce0a08da45d1584810be2bd74764cbd2329ffc`.
The successful endpoint is the `GetFile.cfm` link above, discovered from the
official download page. A guessed direct ZIP path and some generic page query
variants returned an HTML "File not found" document with HTTP 200. The adapter
checks that the response is a ZIP and does not mistake those responses for data.

## Census parsing and measures

The ZIP's `98-401-X2021007_English_CSV_data.csv` is Windows-1252. Its
`98-401-X2021007_Geo_starting_row.CSV` bounds the stream scan to the Halifax
group, without extracting the 2.6 GB table. The selected-cell cache in
`data/raw/` is fingerprinted against the source SHA-256, selected tracts,
characteristics and transformation version using `common.derived_cache`.

The main table has **several columns called `SYMBOL`**. The adapter uses
`C1_COUNT_TOTAL` and the symbol immediately following it. A naive `DictReader`
would overwrite the first `SYMBOL` with the final column and could mishandle
suppression. Symbols `x`, `X`, `F`, `..`, `...` remain null. Duplicate cells,
unexpected labels, incomplete profiles, non-2021 geographies and non-tract
geographies fail. The source nonresponse percentages and data-quality flag
remain in every row's `quality`.

| Metric | Census characteristic IDs and calculation |
| --- | --- |
| Population | `1` (unrounded headline population) |
| Private households | `50`, rounded 100% census count |
| Children under 15 | `9 / 8 * 100` (matching age-group denominator) |
| Average household size | Published `57` |
| One-person households | `51 / 50 * 100` |
| Homes in apartment buildings | `(46 + 47) / 41 * 100`; excludes duplexes |
| Renter households | `1416 / 1414 * 100`; 25% sample |
| Median tenant shelter | `1494`; 2021 occupied rentals of all sizes, utilities where applicable; not asking rent |
| Public-transit commute | `2607 / 2603 * 100` |
| Walk/cycle commute | `(2608 + 2609) / 2603 * 100` |

The commuting denominator covers employed people 15+ with a usual workplace or
no fixed workplace, excluding those working at home. It reflects May 2021
pandemic conditions. Missing components, zero denominators or a rounded
numerator exceeding its denominator produce null rather than an invented zero.

Every retained tract's Census Profile population is checked against the
municipality's 2021 tract layer. They agree exactly. The 99 populated tracts
sum to **439,819 residents**, exactly the CSD layer's current published 2021
population. Rounded household counts sum to **190,495**; do not rescale them to
the unrounded CSD occupied-dwelling count of 190,512.

## Spatial measures and limits

Calculations use original geometry projected to **EPSG:26920**, NAD83 / UTM
zone 20N. Display geometry alone is simplified by 5 m after the calculations,
transformed to WGS84 and oriented clockwise for D3.

- Parks use `PARK_ID`, unioning multipart records. Cemetery class is excluded.
  A site counts if more than 1 m² is inside the tract; union the intersections
  before calculating area share. The municipal description says that the
  parcel-based boundaries are approximate and include parks owned by or of
  interest to HRM. Undeveloped land remains included; the result does not
  establish public access, tree canopy, or all green space.
- Bus stops select `BUSSTATUS = 'INS'` and deduplicate `BUSSTOPID`. A stop counts
  in `busStops` if it lies inside or within 800 m of the original tract polygon.
  Distances are straight-line to the area, not walking distance from a home,
  and there is no frequency score. Large rural tracts require particular care:
  a stop near one edge need not be near most homes. **Rail-only `stations`
  arrays are empty; no rail metric is fabricated.**
- Facilities select source codes `BLISLB`, `BLRCCC`, `BLRCRF`, `BLRCMU`,
  `BLRCAG`, `BLRCTR`, `BLTRFT`. Points inside the tract appear as named,
  source-cited amenities. `libraries` counts all mapped Library points, which
  can include institutional libraries, not just public-library branches.
  `communityCentres` uses only the Community Centre code. Opening hours,
  public admission and inventory completeness are not asserted.
- A zero for a spatial inventory metric means no matching inventory record
  intersected that tract; unavailable datasets are not represented as zero.
  If a required source cannot be fetched or passes an incomplete page, the
  build fails rather than generating empty replacement measures.

Current community locators are selected by polygon overlap, retaining up to
three names whose polygons cover at least 5% of the tract, with the largest
overlap as a fallback. The locator is never used to allocate population.

## Representative checks

| 2021 tract | Source observations / output |
| --- | --- |
| `2050001.00` | Population 4,123; private households 1,635; household size 2.5; renter share 42.3%; tenant shelter $760/month; transit 12.5%; walk/cycle 3.9%; 9 park sites; 81 nearby in-service bus IDs; 2 mapped community centres; 1 mapped library |
| `2050002.00` | Population 8,358; households 3,435; renters 41.7%; tenant shelter $880/month; 21 park sites; 150 nearby in-service bus IDs |
| `2050003.00` | Population 2,885; households 1,265; Point Pleasant Park is the one overlapping park site; its mapped share is 32.2% |

All 99 profiles include four source-cited measured sections on the statistical
area/residents, households/housing, parks/facilities, and transport. They do not
invent resident occupations, safety ratings or subjective neighbourhood traits.

## Reproduction and validation

```bash
/workspace/.venvs/to-canada/bin/python pipeline/neighbourhoods/halifax.py
/workspace/.venvs/to-canada/bin/python -m unittest pipeline/neighbourhoods/test_halifax.py -v
```

Five tests check representative source values, the correct first `SYMBOL`,
duplicates/incomplete cells/changed labels, rejection of CMA rows, and rejection
of partial municipal overlaps. `fixtures/halifax/profile_excerpt.csv` contains
32 verbatim selected rows for the first two tracts from the official CSV,
re-encoded UTF-8 for tests. Full source bytes remain cached.

The adapter reuses the ArcGIS, missing-value and spatial helpers in
`neighbourhoods.victoria`; both adapters are owned and delivered together. The
Victoria spatial test additionally verifies overlapping parks, polygon rather
than centroid distance, and that bus counts never fill rail-only arrays.

The bundle passed shared `neighbourhoods.check.validate`, finite/percentage
bounds, exact source-ID references, unique tract IDs, valid nonempty WGS84
polygons, clockwise exteriors and empty rail lists. UI/browser checks, manifest
integration and release are owned by the lead. No shared registry, manifest,
`public/data`, commit or deployment is changed by the adapter.
