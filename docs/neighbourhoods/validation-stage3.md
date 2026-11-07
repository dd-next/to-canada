# Independent validation: stage three

Reviewed 2026-11-07. This report covers Winnipeg and Québec City.
The lead separately owns browser, CI and production-release verification.

Reviewed bundle SHA-256 values:

- Winnipeg: `d5a538a722de47e8d0e90c547d23fe137f8e72b7036f9df02586aa310680a904`
- Québec City: `2640c3b91ec3c0b4741aca6b21cf385b00c330087f6bf9a847c2afa95807e353`

## Winnipeg verdict

**No remaining release-blocking data issue found.** All 194 areas reconcile to
the original 2016 census/boundary responses and separately dated inventories.
The raw-source review made 13,582 assertions without an unresolved discrepancy.
Three independent offline regression tests pass.

The review read cached official responses directly, without importing the
adapter's source-selection, arithmetic, spatial or GTFS helpers. It checked:

- Every census source cell's year, geography, sex, uniqueness and area name,
  followed by all ten census metrics for all 194 areas.
- Exact 194-area correspondence with the publisher's 2016 polygon release;
  no 2021 or current geometry was substituted.
- Every park count, park name list and union-covered area using original
  polygons projected to EPSG:26914.
- Every bus count using reconstructed bus-route/trip/stop-time membership and
  straight-line distance of at most 800 m to original area polygons.
- Every library count, community-centre count and named facility/category
  attribution using the original point or polygon inventory.
- Valid, nonempty display geometry, clockwise exteriors, counterclockwise
  holes and retention of the original geographical coverage.

## Census scope and missing values

The Census Boundaries and Census Values metadata explicitly cross-reference one
another. Both source selections are for 2016 neighbourhoods; census records use
`sex=All`. The geographical codes and names agree exactly. The source subset has
194 neighbourhoods, with industrial/undeveloped and other missing census areas
explicitly outside coverage. Modern or 2021 neighbourhood correspondence is not
assumed. The final UI definitions retain the 2016 period.

The original Agassiz workbook confirms that this custom profile uses a 25%
sample. Characteristic 1 is specifically people in private households; it is
not an entire-CMA population or a count including collective residences.
Household size is explicitly an estimate calculated from rounded private-person
and household counts. Renting uses the tenure denominator; apartment-building
shares exclude duplexes; commuting uses residents with usual/no-fixed workplaces
and excludes home workers.

Royalwood's original API cells are:

| Characteristic | Raw source value |
| --- | ---: |
| 1763: Tenant households in non-farm, non-reserve dwellings | 25 |
| 1766: Median monthly shelter cost | 0 |
| 1767: Average monthly shelter cost | 2,126 |

The separately cached official Royalwood workbook also shows 25 tenant
dwellings and average gross rent CAD 2,126. This **does not establish why the
API median is zero**. The API has no row-level suppression/status field, and a
positive average cannot identify a suppressed median or recover its value.
The release conservatively leaves the median unavailable and discloses that
treatment. It neither presents CAD 0 as reliable rent nor substitutes the mean.

There are 24 unavailable tenant-cost estimates under the disclosed positive-cost
and positive-denominator rule. The independent fixture keeps the raw zeroes,
the exact missing-area set and Royalwood's three evidence cells. Genuine zeroes
remain intact elsewhere, including Agassiz's 0% renter share.

Polo Park has 180 high-rise apartment dwellings plus zero low-rise dwellings
against a rounded total of 175 occupied dwellings. Its mathematically invalid
share remains unavailable; it is not clipped to 100% or replaced with zero.
This is the only additional missing metric, for 25 missing cells overall.

Representative checks included Agassiz (population 365; households 155),
River-Osborne (population 4,750; households 2,995; renters 87.6%; tenant median
CAD 844; transit 26.9%) and Sage Creek (population 4,790; households 1,570;
renters 19.1%; tenant median CAD 1,301; transit 4.9%). All are explicitly 2016
observations, not estimates of current rents or residents.

## Inventories and geometry

The original inventories contain 1,401 park/open-space records with 1,401
distinct IDs, 21 library points, and 181 recreation complexes. All released
area intersections and point attributions agree with the independent spatial
review. Twenty library points fall in the released 194-area geography; the
other point is not assigned to an arbitrary nearby area. Recreation flags
correctly separate community centres from arenas, pools and fitness facilities.

The GTFS feed covers **2026-09-06 to 2026-12-12**. Every route has type 3 (bus).
Independent route/trip/stop-time reconstruction gives 3,888 referenced boarding
stop IDs, exactly the inventory used for nearby counts. Opposite-direction IDs
remain separate. Stops are measured against the whole original polygon and do
not imply a walking route, daily service, frequency or real-time operation.
Both station-list levels are empty and there is no rail definition, so bus
stops cannot appear as rail stations.

The 194 original polygons total approximately **368.1648 km²**. This is the
published census-profile subset, not a claimed complete municipal land total.
The maximum area change for one display polygon is 1.427%; maximum
source/display Hausdorff deviation is 14.679 m. All output polygons remain valid
with the winding needed by D3. The small simplification does not affect census,
park, stop or facility calculations.

## Offline regression evidence

`pipeline/neighbourhoods/fixtures/validation/stage3-oracle.json` retains
independently extracted raw census cells, area identities, original projected
areas/bounds, Royalwood ambiguity evidence and the missing-estimate set. The
underlying selected census response SHA-256 is:
`3954c2c1198fc1b95e7b02bef2910050121f4503a6dae9fc8d1b557d82b7ffce`.

`pipeline/neighbourhoods/test_stage3_validation.py` compares the saved bundle
against this source oracle, checks every historical metric and geography,
guards against ambiguous costs becoming false zeroes, retains the genuine
zero renter observation, and checks coverage/winding and bus/rail separation.
Tests do not require network access or ignored raw cache files.

```sh
/workspace/.venvs/to-canada/bin/python -I pipeline/neighbourhoods/test_stage3_validation.py
```

The independent review found no new Winnipeg correction necessary. Source
limitations remain explicit: 2016 observations, census subset coverage, rounded
sample data, ambiguous zero cost estimates, and inventories that do not certify
current public access, opening hours or complete neighbourhood amenities.

## Québec City verdict

**No remaining release-blocking data issue found.** All 315 census observations
(nine measures for 35 areas), four inventory counts per area, park names,
facility attribution and original/display geometry reconcile independently.
The final raw-source pass made 6,320 assertions without an unresolved
discrepancy. Three additional offline regression tests cover Québec City.

The census oracle was created directly from cached official PDFs using
`pdftotext`, without importing the adapter or copying its extraction patterns.
It selected each highlights bullet by its subject and independently read its
number sequence. It matched the PDF title to original boundary names and
obtained the profile code from the official PDF filename. The full set of 35
boundary IDs is used exactly once. All individual PDF URLs agree with the
bundle after equivalent URL escaping is normalized.

### Census observations and scope

Every profile is an **October 2026 publication containing 2021 observations**.
The independent extraction uses physical page 6 / printed page 5, headed
`FAITS SAILLANTS`. It does not use later comparative tables, where some PDFs
have unrelated neighbourhood headers. Every profile's introduction identifies
2001, 2011 and 2021 census sources; each selected observation explicitly refers
to 2021. All 35 maps state that their neighbourhood has been defined since
June 2020.

The published percentages and household sizes are retained, rather than
recomputed from separately rounded counts. Saint-Roch illustrates why: its
private-household count is 5,320, occupied-dwelling count is 5,310, and published
mean household size is 1.6. Those are separate source observations. Its
population is 8,380; 63.9% of households contain one person, 76.2% rent,
70.8% of occupied dwellings are apartments under five storeys, and 6.8% need
major repairs.

The apartment measure remains explicitly **under five storeys**, excluding
high-rise apartments and duplexes. It is not labelled or stored as a total
apartment share. Household composition describes households, not the fraction
of residents living alone. Total population includes people outside private
households and is not used to recompute household size. No current rent,
commuting rate, occupation distribution or CMA observation is inferred.

Additional samples cover L'Aéroport (13,375 residents; 5,930 households;
5,950 occupied dwellings), Saint-Michel (17,675 residents; 17.5% renter
households), Sainte-Thérèse-de-Lisieux (17,030 residents; 13.5% renter
households) and Vieux-Bourg (15,395 residents; 47.2% renter households).
All 315 selected observations are numeric in these source editions; there
are no invented replacements for missing source cells.

### Geography and a publisher legal-annex inconsistency

The [current D-8 bylaw](https://reglements.ville.quebec.qc.ca/fr/document/rc/R.R.V.Q.chapitreD-8)
records the June 2020 boundary amendment and April 2026 naming amendment.
The [2026 amendment, article 1](https://reglements.ville.quebec.qc.ca/fr/document/an/R.V.Q.3519/)
explicitly names 4-2 Orsainville, 5-1 Sainte-Thérèse-de-Lisieux and 5-4
Vieux-Bourg. Its explanatory note describes a naming change.

Independent comparison of all 35 textual boundary descriptions in the
[2020 annex](https://reglements.ville.quebec.qc.ca/fr/ressource/ra/R.V.Q.2301_FR_001_0001.pdf)
and [2026 annex](https://reglements.ville.quebec.qc.ca/fr/ressource/ra/R.V.Q.3519_FR_001_0001.pdf)
found the **same 35 description bodies**, after normalizing whitespace and
separating headings. The documents reorder some areas and change three
headings. However, two new headings are swapped in the 2026 annex: the former
5-1 description is headed Vieux-Bourg, and the former 5-4 description is headed
Sainte-Thérèse-de-Lisieux. This contradicts article 1's explicit replacements.

The bundle correctly follows article 1, the individual profile titles/codes
and maps, and the current municipal boundary names: 5-1 is
Sainte-Thérèse-de-Lisieux / boundary ID 24; 5-4 is Vieux-Bourg / boundary ID 27.
Visual inspection of both profile maps confirms the large northern
Sainte-Thérèse geography and southern riverfront Vieux-Bourg geography. The
annex headings alone were not used to establish the join. The discrepancy was
reported to the adapter owner and lead; the independent fixture guards these
two mappings.

The displayed geometry is the **2026-11-01 municipal extract**, not an archived
2021 vertex file. The common administrative definition, unchanged textual
boundary descriptions and matching profile/current-map identities support the
join; they do not establish historical equality of every vertex. The bundle
states that limitation. No census value is clipped or apportioned to a modern
polygon. Test points inside L'Ancienne-Lorette, Saint-Augustin-de-Desmaures and
Wendake are outside the city geometry.

Original polygons total approximately 467.6735 km², including their mapped
water extent. Projected areas agree with the publisher's `SUPERFICIE` fields
within 0.01%, supporting the CRS/coordinate-order check. Every display polygon
is valid and nonempty with clockwise exteriors and counterclockwise holes.
Maximum display-area change is 0.247%; maximum source/display Hausdorff
deviation is 11.504 m. Inventory joins use original polygons in EPSG:32187.

### Dated inventories and partial park coverage

The final park source is the licensed **Lieux publics** inventory dated
2026-11-06. Its selected classes contain 85 school-park, two dog-park and two
linear-park records. All 89 points fall inside the mapped city. Names are
deduplicated within each area; the repeated linear-park name occurs in two
different areas, so the per-area total remains 89. Ordinary neighbourhood
parks are outside these selected classes. Four areas have zero selected
sites; this does not mean they have no parks. The metric, coverage note and
source metadata disclose this limitation, and no parkland area is calculated.
The separate ArcGIS park-map inventory was reviewed initially but is absent
from the final bundle and regression oracle following the lead's licence
decision.

The same municipal inventory has 28 library records and 49 exact
`Centres communautaires` records. Two library points are the same Maison de la
Littérature site: IDs 102399 and 202454, at adjacent street addresses and
21.094 m apart. Keeping the lower ID produces **27 library sites**, including
one in area 1-1. The independent attribution agrees for every library and
community-centre name and count. Institutional libraries remain explicitly
included; neither category certifies public access, hours or capacity.

The RTC GTFS feed covers **2026-11-06 to 2027-03-19**. All source routes have
bus type 3. There are 4,318 boarding-stop records in the regional inventory:
4,042 fall inside the 35 areas and 276 fall outside. Every per-area count
reconciles. These are inventory points, not proof of service on a specific
day, route frequency or walking access. Opposite-direction IDs remain
separate. Rail station lists are empty at both levels and no rail measure or
proposed tramway is represented as operating transit.

### Québec regression evidence

The same `fixtures/validation/stage3-oracle.json` now includes a separate
`quebec-city` entry with independently read source cells, names/IDs, each
profile's exact URL and SHA-256, original projected areas/bounds, municipal
exclusion points and all expected inventory counts. Its park counts use only
the final licensed source selection. The Saint-Roch PDF SHA-256 is
`4d7f88803b7913bf47a6927488eda49c4b17ea3fdf6a172b6d5337764aa9c417`.

`test_stage3_validation.py` now contains six independent offline tests in
total, three for each city. They run against committed bundles and the
source oracle without network access or ignored raw files. The raw-source
scripts were separate from adapter tests; browser, CI and production checks
remain the lead's responsibility.
