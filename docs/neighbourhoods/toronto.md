# Toronto neighbourhood adapter

`pipeline/neighbourhoods/toronto.py` exports `build()` and writes only
`data/processed/neighbourhoods/toronto.json` when run as a script. The bundle has
158 areas, 18 measured fields, six sources, 68 TTC subway parent stations inside
Toronto, and ten reviewed descriptions with seven sections each. The description
areas are Annex, High Park-Swansea, The Beaches, Weston, Thorncliffe Park,
Flemingdon Park, Agincourt North, Willowdale West, Harbourfront-CityPlace and
Etobicoke City Centre. This is City of Toronto coverage, not the Toronto CMA or
the wider GTA.

## Official sources and dates

All downloads use `common.fetch.fetch`; raw bytes and URL/retrieval/SHA-256
sidecars remain in the shared ignored `data/raw/` cache. Cached downloads are
reused indefinitely unless the user invokes a refresh. Inventory update dates
below come from the selected resource's `last_modified`, not the catalogue's
general metadata update. Actual retrieval dates are preserved in each bundle
source; this build retrieved the inputs on 2026-11-07 between 18:15:54 and
18:17:36 UTC.

| Source | Selected official resource | Period / resource update |
| --- | --- | --- |
| [Neighbourhoods](https://open.toronto.ca/dataset/neighbourhoods/) | `0719053b-28b7-48ea-b863-068823a93aaa`, `Neighbourhoods - 4326.geojson` | April 2021 158-area model; inventory updated 2026-02-20 |
| [Neighbourhood Profiles](https://open.toronto.ca/dataset/neighbourhood-profiles/) | `19d4a806-7385-4889-acf2-256f1e079060`, `neighbourhood-profiles-2021-158-model` | 2021 Census; workbook published/modified 2023-10-06 |
| [Green Spaces](https://open.toronto.ca/dataset/green-spaces/) | `7a26629c-b642-4093-b33c-a5a21e4f3d22`, `Green Spaces - 4326.geojson` | Inventory updated 2026-11-03 |
| [Library Branch General Information](https://open.toronto.ca/dataset/library-branch-general-information/) | `5f4950b4-c727-4e54-8d0d-972e198268d6`, `tpl-branch-general-information - 4326.geojson` | Inventory updated 2026-09-22 |
| [Parks and Recreation Facilities](https://open.toronto.ca/dataset/parks-and-recreation-facilities/) | `f6cdcd50-da7b-4ede-8e60-c3cdba70b559`, `Parks and Recreation Facilities - 4326.geojson` | Inventory updated 2026-11-01 |
| [Merged GTFS – TTC Routes and Schedules](https://open.toronto.ca/dataset/merged-gtfs-ttc-routes-and-schedules/) | `c920e221-7a1c-488b-8c5b-6d8cd4e85eaf`, `Complete GTFS` | Feed 2026-11-01 through 2026-12-19; resource updated 2026-11-04 |

Package metadata is obtained from
`https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=<package>`;
the resource URLs returned there are also retained as `downloadUrl` in the
bundle. The Open Government Licence – Toronto is attributed. Census source
notes additionally carry Statistics Canada's adaptation/no-endorsement notice.
No descriptions are derived from real-estate marketing or scraped reviews.

The old [Parks](https://open.toronto.ca/dataset/parks/) dataset explicitly states
that it is no longer accurate and directs users to Green Spaces; it is not used.
The old library location dataset is likewise retired. The 2019 TTC subway
shapefiles describe a historical four-line system and are not used.

## Matching census geography

The City states that the profile data uses the 158 social planning areas, or 140
areas before April 2021. This adapter selects only the explicitly named 2021
158-model workbook and the current 158-model GeoJSON. It never selects a
historical 140 resource. `AREA_SHORT_CODE` is converted from a zero-padded string
to the workbook's integer neighbourhood number. Both sources must contain the
same 158 unique IDs. Every name must match after removing punctuation, spaces
and case (for example, the workbook's `O\`Connor Parkview` and the map's
`O'Connor-Parkview`). Missing, duplicate, changed or differently named areas stop
the build rather than being silently dropped. IDs such as the new area 159 are
preserved; superseded area 14 is absent.

The publisher's 2026 resource date is a download/inventory revision date, not a
new census geography vintage. The selected boundary-model vintage is 2021. The
profile metadata explicitly states that the boundaries "are consistent over
time, allowing for comparison between Census years." This supports use of the
same publisher model, together with the exact ID/name match, but does not prove
that every polygon vertex is identical to an immutable 2021 archive. The bundle
therefore labels its boundary vintage **158-area model (April 2021); polygon
snapshot 2026-02-20** and states that calculations and display use that dated
published snapshot; exact historical vertex identity was not independently
verified. The library file has neighbourhood-code
columns, but these are deliberately not joined: its physical locations are
spatially assigned to the selected 158 polygons.

## Census calculations and limitations

All selected workbook data is **2021, 25% sample, private households**, including
the age and population counts. Population excludes collective dwellings; it is
not presented as a full-population 100% Census count. Counts are randomly
rounded and different tabulations can have slightly different totals.

The adapter validates the exact worksheet row labels before reading values from
`hd2021_census_profile`. Excel row numbers are intentional because some labels
repeat in count and percentage sections:

| Metric | Workbook row(s), one-based | Calculation |
| --- | --- | --- |
| Population in private households | 37 | Published count |
| Private households | 226 | Published household-size total |
| Children under 15 | 5 / 4 | Age count / age total |
| Average household size | 232 | Published average |
| One-person households | 227 / 226 | Household counts |
| Apartments | (222 + 223) / 217 | Fewer-than-five plus five-or-more-storey buildings / dwelling-structure total; duplexes excluded |
| Single-detached homes | 218 / 217 | Single-detached count / dwelling-structure total |
| Renting households | 302 / 300 | Renter count / tenure total |
| Median tenant shelter cost | 380 | Published monthly CAD; non-farm, non-reserve occupied rented dwellings, all sizes |
| Public-transit commutes | 2580 / 2576 | Employed residents 15+ with usual/no-fixed workplace; working at home excluded |
| Walk/cycle commutes | (2581 + 2582) / 2576 | Same commuter denominator |
| Description occupation shares | 2222–2231 / 2221 | NOC 2021 broad groups / All occupations, resident labour force aged 15+ with applicable occupations |

Shares are multiplied by 100 and rounded to one decimal. Income and shelter
cost concepts are not mixed: tenant shelter costs are **2021 occupied-rental
costs, not current asking rents**. Commute patterns are pandemic-era observations.
Occupation descriptions rank all ten published broad groups and report the top
three; they describe resident workers/labour-force participants, not businesses,
vacancies or workplace jobs within the area. The non-applicable occupation
category is excluded from the denominator.

Blank and suppression markers remain null. A derived share remains null if an
input is unavailable, its denominator is zero, or rounded components exceed the
denominator; counts are never clipped to fabricate a percentage. In area 170
(Yonge-Bay Corridor), apartment components exceed the rounded dwelling total,
so its apartment share is null with an explicit rounding/derived-input reason.
Other numerical zeroes, such as Thorncliffe Park's detached-house count, remain
zero. Unknown future negative or non-finite inputs fail validation.

Representative source values retained in
`pipeline/neighbourhoods/fixtures/toronto/profile_cells.json`:

| Area | Published source values | Bundle values |
| --- | --- | --- |
| Annex (95) | 29,300 people; 16,330 households; 16,325 dwellings; 4,535 low-rise and 8,895 high-rise apartments; 9,655 renters / 16,325 tenure households | 82.3% apartments; 59.1% renters; 49.4% one-person households |
| Thorncliffe Park (55) | 4,975 under-15 / 20,400 age total; 0 detached dwellings; 6,070 renter / 7,065 tenure households | 24.4% children; 0.0% detached; 85.9% renting |
| Harbourfront-CityPlace (165) | 28,135 people; 16,550 households; median tenant shelter cost $2,020/month | Same published values, explicitly 2021 |
| Annex resident occupations | 4,555 business/finance/administration / 18,295 All occupations | 24.9%; not a local employment count |

## Parks, facilities and transport

All calculations use original geometries in **EPSG:2952 (NAD83(CSRS) / MTM zone
10)**. Display polygons are simplified by 12 metres only afterwards, transformed
back to WGS84, and oriented with clockwise exterior rings for D3. No spatial
count is computed on a simplified display polygon.

Green Spaces contains 3,382 records spanning public and private classes. The
adapter keeps only `AREA_CLASS=Park`: 1,629 records dissolve to 1,628 unique
`AREA_LONG_CODE` sites. A site counts if its overlap exceeds one square metre.
Parkland share uses the union of its overlapping polygons, with overlap counted
once. Parks crossing a neighbourhood boundary can appear in both lists. This is
the publisher's generalized Park classification, not every accessible green
space, all ravine land, tree canopy, or a guarantee of public access at every
point. The denominator is the neighbourhood polygon area, not a separately
measured land-only area. Park names are display-title-cased from the municipal
inventory.

Physical library branches (`PhysicalBranch=1`) are deduplicated by BranchCode;
other library services are excluded. There are 100 physical branches in the
snapshot, all spatially assigned. Recreation sites are filtered to the
publisher's `TYPE=Community Centre` and deduplicated by LOCATIONID. All 277 are
assigned; this category includes **schools used for recreation, arenas, pools
and other facilities**, not only dedicated community-centre buildings. Counts
and descriptions explicitly disclose that scope. Facility points are inside or
on the boundary. Counts are not live operational statuses or program capacity.

The complete TTC GTFS is used because the publisher explicitly says it contains
all modes. Routes join trips and stop_times to identify scheduled locations;
unused parent nodes and entrances do not count. `route_type=1` platforms collapse
to their parent station, with one parent per subway station. Bus (`3`) and
tram/light-rail (`0`) stop IDs are separate point-in-polygon measures; opposite
directions and platforms can be separate stops. Neither stop count represents
route frequency. Feed dates come from `feed_info.txt`; all trips in that published
feed are considered, not a promise of service at a specific time or date.

The source omits `parent_station` for Spadina's Line 1 platforms 13853 and 13854.
The adapter allows a repair only when the platform's exact station name has one
`location_type=1` parent within 500 m in EPSG:2952. Both resolve to Spadina 43282,
which is also the parent of its Line 2 platforms; Spadina counts once. Any
ambiguous, differently named or distant missing-parent case fails. This repair
is documented in the source transformations and tested.

Subway parent points outside Toronto's neighbourhood union are excluded, so the
bundle has 68 City of Toronto subway stations and does not incorporate Vaughan
Metropolitan Centre or Highway 407. Each area's station list uses straight-line
distance to the **whole original polygon**, zero for an inside point, at most
800 m. It is not a home-to-station walk. GO, UP Express and subway construction
projects are not included. TTC streetcar and light-rail stops remain in the
separate measure and are not relabelled as subway stations.

## Description evidence

The fixture `descriptions.json` is reviewed editorial input, with ten specific
areas, named mapped parks and facilities, exact source addresses and practical
considerations. Build-time guards verify each selected park and amenity belongs
to the area and every quoted address still matches the downloaded inventory.
The everyday-setting sections describe the mapped public spaces, actual street
addresses and census housing fabric; they do not infer reputation, safety,
noise, affordability today, resident attitudes or a guaranteed walking time.
Measured housing, households, resident occupations, parks and transport sections
are regenerated from the source calculations. Every section cites source IDs.

For example, Thorncliffe Library and Jenner Jean-Marie Community Recreation
Centre both give 48 Thorncliffe Park Drive. North York Central Library gives
5120 Yonge Street, Douglas Snow Aquatic Centre 5100 Yonge Street, and Edithvale
Community Centre 131 Finch Avenue West. High Park Library gives 228 Roncesvalles
Avenue, while Swansea Memorial Library gives 95 Lavinia Avenue. These are
inspectable source-backed setting details, not assumptions about the people in
those streets.

## Reproduce and verify

```bash
/workspace/.venvs/to-canada/bin/python pipeline/neighbourhoods/toronto.py
/workspace/.venvs/to-canada/bin/python -m unittest discover -s pipeline/neighbourhoods -p test_toronto.py -v
PYTHONPATH=pipeline /workspace/.venvs/to-canada/bin/python -c 'import json; from neighbourhoods.check import validate; print(validate(json.load(open("data/processed/neighbourhoods/toronto.json"))))'
```

The seven offline regression tests cover representative published values and
their distinct denominators; suppression and observed zero; changed source
rows, duplicate codes and wrong geography; mandatory boundary-name matches;
guarded Spadina parent recovery; Park filtering/site union; bundle provenance,
clockwise valid geometry, null reasons and all ten seven-section descriptions.
The build itself checks exact source address/park/amenity evidence. Source and
geometry validation is separate from the lead's application build and browser
checks. The adapter never writes shared source registries, application data,
manifests or CI configuration.
