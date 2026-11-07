# Independent neighbourhood expansion validation

Reviewed 2026-11-07 against cached official responses, independently of the city
adapters. This review covers Toronto and Vancouver data, source scope, geometry
and descriptions. The lead owns application/browser checks, CI, merge and public
deployment verification; those outcomes are not asserted by this report.

**Verdict:** no remaining release-blocking data or description issue found in
the reviewed stage-one bundles. Three independent offline reconciliation tests
pass. Corrections identified during review are recorded below.

Reviewed processed-file SHA-256 values:

| Bundle | SHA-256 |
| --- | --- |
| Toronto | `29c330cc79620ad132d9ab5bcb4085eaf18bfba718a19683c811304fa76eeaf5` |
| Vancouver | `ab9fafac0b317eb20ceb676e68b0ea73b44f9ea7e2d4d26b3a2ecda2779d03e1` |

## Independent method and coverage

No duplicate source downloads were made. Raw source files already in the shared
cache were read directly. Census rows were selected by their source labels
(Toronto) or audited custom variable IDs (Vancouver), without importing either
adapter's parser, formula helpers or constants. Original source geometry was
projected directly with PyProj and independently intersected with Shapely.

The review reconciled all 158 Toronto and 22 Vancouver area identifiers, names,
census metrics, original-boundary park counts, park names, union-covered area,
nearby station sets and displayed station distances. It also reconstructed
Toronto transport mode membership from GTFS routes/trips/stop_times, checked all
bus/tram stop and facility counts, and checked Vancouver facility assignments and
the deduplicated station inventory against raw records. These checks went beyond
running adapter tests or comparing one generated file to another.

`pipeline/neighbourhoods/fixtures/validation/census-and-boundary-oracle.json`
retains independently extracted original census cells and original projected
boundary areas/bounds for all 180 areas, with source URLs and raw census hashes.
The 41 KB fixture does not depend on ignored raw downloads or network access.
`pipeline/neighbourhoods/test_expansion_validation.py` verifies every saved census
metric, observation period and area identity, D3 winding, valid nonempty geometry,
coverage after simplification, and a real rounded-count conflict versus real
zeroes. Derived shares allow only the half-tenth rounding interval, avoiding a
false failure caused by binary arithmetic at an exact decimal rounding tie.

Command, successful on the final reviewed bundles:

```sh
/workspace/.venvs/to-canada/bin/python -I pipeline/neighbourhoods/test_expansion_validation.py
```

## Geography and denominators

Toronto's cached `neighbourhood-profiles` catalogue states that its boundaries
are “consistent over time” and distinguishes the 158-area model from the 140
areas used before April 2021. The current 158 boundary codes and normalized names
match all 158 columns of `hd2021_census_profile`; the historical 140-area resource
is separate and unused. This establishes the publisher's model compatibility,
**not independently verified historical polygon vertices**. The final bundle
explicitly dates its polygon snapshot 2026-02-20 and states that limitation.
Its census population is the 25% sample count of people in private households,
not total municipal/CMA population. All shares use their matching source totals.

Vancouver's boundary catalogue explicitly says “These boundaries do not change.”
The 2016 census catalogue says its custom 22 local areas equal the 22 planning
areas, include Musqueam 2 reserve, and differ from Vancouver CSD, which excludes
the reserve and includes Stanley Park. Both aggregate CSD/CMA columns are unused.
The original polygon union contains the Musqueam cultural-centre vicinity and
excludes Stanley Park's centre (-123.1443, 49.3005). The final coverage note says
Stanley Park is outside the mapped polygons. The source's row 80 is correctly the
total-population child percentage: row 79 starts “Distribution (%) … 100% data”;
the male percentage starts in rows 84–85 and is not used.

Both cities use the household-size table for one-person-household shares and the
tenure table for renting shares. They exclude duplexes from apartment-building
shares, use employed residents with usual/no-fixed workplaces for commuting
shares, and date tenant shelter costs to the census rather than current asking
rents. Vancouver's reserve coverage does not silently extend its non-farm,
non-reserve tenant-shelter-cost measure.

Representative independently checked values:

| Area | Source calculation or fact | Released result |
| --- | --- | --- |
| Toronto Annex | 2021 private-household population 29,300; 16,330 households | Population/households retained; 82.3% apartment buildings, 59.1% renting |
| Toronto Yonge-Bay Corridor (170) | Rounded low/high apartment components exceed the rounded occupied-dwelling total | Apartment share remains null with a rounding explanation; no >100% or invented zero |
| Toronto Harbourfront-CityPlace | Single-detached count zero; no scheduled bus stop point inside the polygon | Genuine zeroes retained; bus measure distinguished from streetcar stops |
| Vancouver Downtown | Renters 20,070 / tenure total 35,100 | 57.2%; household-size total 35,050 is not substituted |
| Vancouver Downtown | (32,910 high-rise + 1,210 low-rise) / 35,045 occupied dwellings | 97.4% apartment buildings |
| Vancouver Downtown | (13,655 walked + 1,020 cycled) / 32,995 commuters | 44.5% walking/cycling |
| Vancouver West End | Renters 24,685 / tenure total 30,815 | 80.1% renting |
| Vancouver Dunbar-Southlands | High-rise count 0; low-rise 700; occupied dwellings 7,565 | 9.3% apartment buildings; duplex flats are a separate category |

## Spatial and transport evidence

All calculations were checked against original polygons before display
simplification, in EPSG:2952 for Toronto and EPSG:26910 for Vancouver. Every
released exterior ring is clockwise, every interior ring counterclockwise, and
every released geometry is valid and nonempty.

| Check | Toronto | Vancouver |
| --- | --- | --- |
| Original total polygon area | 642.707430 km² | 118.773141 km² |
| Display total polygon area | 642.674708 km² | 118.764597 km² |
| Maximum area change for one simplified polygon | 1.659% | 0.281% |
| Maximum source/display Hausdorff deviation | 15.512 m | 9.874 m |
| Original polygon overlap | about 2.8 m² | about 14,291 m² |

The small pre-existing Vancouver overlaps belong to the publisher geometry;
no independent reallocation of population was performed. Area totals above are
polygon areas, not a claim about municipal land area. Park coverage uses a union
to avoid double counting overlapping park geometry, and parks only touching an
area do not count. Toronto's 1,629 Park-class records dissolve to 1,628 publisher
site IDs; Vancouver's source has 254 distinct site IDs. Missing source layers
fail extraction rather than yielding false zeroes.

Toronto GTFS feed `S1000544` covers 2026-11-01 through 2026-12-19. Independent
route/trip/stop-time reconstruction found 70 subway parent stations, with 68
inside Toronto; Highway 407 and Vaughan Metropolitan Centre are outside and
excluded. The two source Spadina platform records without parent IDs are:

| Platform | Source name | Unique station parent | Projected separation |
| --- | --- | --- | --- |
| 13853 | Spadina Station - Northbound Platform | 43282 / Spadina | 362.5 m |
| 13854 | Spadina Station - Southbound Platform | 43282 / Spadina | 226.0 m |

Both satisfy the adapter's exact-name and 500 m safeguards. They do not create
extra stations. The raw feed contains 8,617 distinct scheduled bus stop IDs and
724 tram/light-rail stop IDs before municipal/area filtering. All 158 released
inside-polygon counts agree with independent point tests. GO/UP Express are
explicitly outside this measure. Every nearby station count and distance agrees
with the original polygon, with the 800 m threshold applied before rounding.

Vancouver's 22 raw rail points become 20 named stations because Waterfront and
Commercial–Broadway each have two points. The retained westernmost/southernmost
representative is an original point, not an invented average. All 22 area
station sets/distances match the documented method. The 2023 city-only inventory
does not claim current network completeness. The 2020 facility counts match the
publisher's local-area assignments: 21 library branches after excluding Outreach
Services and 27 community-centre records. The legacy library currency warning is
preserved. Toronto's facility checks use spatial positions rather than legacy
neighbourhood-code fields, with 100 physical library records and 277 inventory
records classified Community Centre before per-area attribution.

## Description evidence review

All ten Toronto descriptions have seven substantive sections. Each was checked
against its source census cells, intersecting parks, nearby transport and raw
facility addresses, including the independently verified address anchors below.
The practical text interprets the cited data and avoids promises about current
availability, schools, safety, building condition or whole-area walking access.

| Toronto description | Independently checked concrete anchors |
| --- | --- |
| Annex | Spadina Road Library, 10 Spadina Road; Yorkville Library, 22 Yorkville Avenue; named park squares; 13 nearby subway stations |
| High Park-Swansea | High Park, Humber Marshes, Rennie Park; libraries at 228 Roncesvalles and 95 Lavinia; centre at 15 Waller; all listed subway points outside but near boundary |
| The Beaches | Woodbine Beach Park, Kew Gardens, Glen Stewart Park; library at 2161 Queen Street East and recreation centre at 6 Williamson; no qualifying subway station |
| Weston | Library at 2 King Street and arena at 2125 Lawrence Avenue West; apartment/renter majority; zero TTC subway correctly distinguished from omitted regional rail |
| Thorncliffe Park | Library and Jenner Jean-Marie centre both at 48 Thorncliffe Park Drive; 98.7% apartments, 85.9% renting, 24.4% children |
| Flemingdon Park | Library and Dennis R. Timbrell centre both at 29 St. Dennis Drive; 90.9% apartments and 30.3% mapped park coverage; tram stops separated from subway |
| Agincourt North | Woodside Square Mall library, 1571 Sandhurst Circle; Commander centre, 140 Commander Boulevard; household size 3.0 and mixed dwelling types |
| Willowdale West | North York Central Library, 5120 Yonge; aquatic centre, 5100 Yonge; Edithvale centre, 131 Finch West; inside and outside nearby station points |
| Harbourfront-CityPlace | Fort York Library, 190 Fort York Boulevard; Canoe Landing centre, 45 Fort York Boulevard; 99.6% apartments and genuine zero inside bus stops |
| Etobicoke City Centre | Islington Community School, 44 Cordova Avenue; no physical library point inside; 50.0% renting; Islington/Kipling inside the large planning polygon |

The ten curated Vancouver setting paragraphs were read against their cached City
area guides: Downtown, Fairview, Grandview-Woodland, Hastings-Sunrise,
Kensington-Cedar Cottage, Kitsilano, Marpole, Mount Pleasant,
Renfrew-Collingwood and West End. Their geographic, retail-corridor, heritage and
facility claims are supported. The descriptions avoid copying promotional
resident stereotypes or misleading broad-page extents, including assigning
Science World to Fairview or Trout Lake to Grandview-Woodland. Guide source IDs
and rail source IDs support the corresponding prose. Historical facility and
rail periods, 2016 rents and the distinction between boundary distance and a
home's walking route remain explicit.

Every occupation ranking/percentage was also independently recalculated: ten
Toronto top-three groups from the source's NOC 2021 All occupations denominator,
and 22 Vancouver top-two groups from the source's NOC 2016 All occupations
denominator. All match the released prose. These tables concern residents in the
labour force, not jobs or industries located in the neighbourhood. Toronto's
unsupported additional statement that “many residents work elsewhere” was removed.

## Issues found and resolved

- Shared UI initially interpreted ordinary `quality.censusBasis` text as a
  publisher warning. The lead restricted the banner to explicit quality flags.
- Toronto's tram/light-rail metric was absent from the shared cards and map
  selector, despite the coverage note promising a separate measure. The lead
  exposed it, along with dwelling-type cards.
- Vancouver's phrase “Stanley Park is not a separate mapped local area” was
  ambiguous. The worker now explicitly says it is outside the mapped polygons.
- Toronto's generic missing reason did not explain the real rounded apartment
  count conflict in area 170. It now does.
- Toronto's boundary vintage now separates the April 2021 model from the
  2026-02-20 polygon snapshot, without claiming verified historical vertex identity.
- Toronto's resident-occupation prose no longer makes an unsupported claim about
  the locations where residents work.

Remaining source limitations are visible in the bundles: historical census
years, rounded sample estimates, Toronto model-versus-vertex evidence, dated
inventories, municipal rather than metropolitan scope, approximate facility
points and representative interchange locations. No current asking-rent,
service-frequency, school-capacity or safety inference was validated or supplied.
