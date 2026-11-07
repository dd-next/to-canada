# Independent validation: Halifax and Victoria

Reviewed 2026-11-07. **No remaining release-blocking data issue found.** This
report concerns sources, measurements, geography, descriptions and shared data
presentation. Browser, CI and production-release outcomes belong to the lead's
separate verification.

## Independent evidence

The review read the existing cached official sources directly; no duplicate
downloads were made. It did not import either city's parser or calculation
helpers. Halifax's source cells were streamed from the original Statistics
Canada ZIP, rather than the adapter's derived selected-cell cache. Victoria's
two original census CSVs and the City's final June 2022 decision text were read
independently.

All census metrics and geographical selections were reconciled: 99 Halifax
tracts and ten Victoria comparison areas. Independently projected original
polygons were checked against every park intersection/union, nearby bus count
and facility assignment. There were 4,025 census/geography assertions and 4,296
inventory assertions in the raw-source review, with no unresolved discrepancy.
All 109 released geometries are valid, nonempty and correctly wound for D3.

The offline fixture `pipeline/neighbourhoods/fixtures/validation/stage2-oracle.json`
retains independently extracted census cells, original projected area/bounds,
source hashes, Victoria components and Halifax exclusions. It keeps component
medians separate and represents combined-area medians as unavailable.
`pipeline/neighbourhoods/test_stage2_validation.py` has three passing tests
covering all saved census values, denominator/period correctness, whole-tract
coverage, combined-median missingness, bus-versus-rail separation and geometry
coverage/orientation. No network or ignored raw data is needed in CI.

```sh
/workspace/.venvs/to-canada/bin/python -I pipeline/neighbourhoods/test_stage2_validation.py
```

## Halifax

The original 2021 municipal tract layer contains 104 polygons. Independent
intersection with the 2021 Halifax CSD `1209034` identifies 100 whole municipal
tracts and four entirely outside polygons. No partly municipal tract is clipped
or assigned a partial share of census counts.

| Excluded tract | Reason | Population |
| --- | --- | --- |
| 2050121.09 | Separate Cole Harbour 30 reserve CSD; zero municipal overlap | 208 |
| 2050154.01 | Separate Beaver Lake 17 reserve CSD; zero municipal overlap | 20 |
| 2050154.03 | Separate Sheet Harbour 36 reserve CSD; zero municipal overlap | 10 |
| 2050132.09 | Separate Wallace Hills 14A reserve CSD; zero municipal overlap | 15 |
| 2050155.00 | Inside municipality, but zero population | 0 |

The 99 retained populations sum to **439,819**, exactly the source Halifax CSD
population. Additional Halifax CMA tracts are not imported. Current E911 names
are explicitly locator context; the tract IDs and 2021 geometries define the
statistical units. The bundle's `areaType` is `census tract`.

The ZIP checksum independently agrees with the worker's evidence:
`5d29811e5c3171cb16c9564bfbce0a08da45d1584810be2bd74764cbd2329ffc`.
The total-count `SYMBOL` immediately after `C1_COUNT_TOTAL` is the relevant
suppression field; later identically named columns are not substituted. All
retained metrics happen to be populated in this snapshot, without imputing the
omitted empty tract or reserve data.

For example, tract 2050001.00 has population 4,123, age-group denominator 4,120,
households 1,635, renters 675 / tenure total 1,595 = 42.3%, transit 160 / 1,285 =
12.5%, and walk/cycle (50 + 0) / 1,285 = 3.9%. Its tenant median is CAD 760 in
2021. The use of a rounded age total distinct from the unrounded headline
population is correct. Every other included tract was likewise checked.

All 921 selected park records, 2,338 in-service bus-stop records and 200 selected
facility symbols match the published area attribution. Bus counts use distance
to the original tract polygon, not centroid or display geometry. Rail-only
arrays stay empty and there is no invented rail metric. Institutional library
symbols, undeveloped/of-interest park land, dated inventories and access limits
are disclosed; no public-access or opening-hours inference was supplied.

The source tract polygon area totals 5,893.129 km² including mapped water. This
is not asserted to be municipal land area. The maximum relative display-area
change is 0.437%; no populated tract is lost during simplification. All profile
sections retain the 2021 census scope and distinguish nearby bus inventory from
home-level walking access, particularly for the large rural tracts.

## Victoria

The City's final decision page specifies three adopted changes effective
2022-06-09: the Shelbourne blocks from Jubilee to Oaklands, one Fairfield block
to Downtown, and Harris Green's inclusion in Downtown. The other boundary ideas
on that page are proposals, not adopted changes. The source census metadata
already includes Harris Green with Downtown and North/South Jubilee together.

The explicit crosswalk uses all twelve census columns and all twelve current
boundary polygons exactly once. Combining Downtown + Fairfield and Oaklands +
Jubilee keeps the transferred blocks inside the corresponding external area.
The union of the ten output areas equals the union of all source components;
the remaining eight components are individually represented. This method
addresses the documented transfers without inventing a population allocation.

The current service is **not an archived 2021 polygon file**. Historical vertex
identity is unverified. The final visible boundary note and source notes state
this limitation, describe a current municipal snapshot and avoid the earlier
broad claim that the eight individual neighbourhoods are simply “unchanged.”
The publisher warns that catalogue edit dates do not reliably identify data
updates, so the dynamic sources correctly use a retrieval-snapshot period.

All ten census outputs agree with the original short/long CSVs. Combined counts
are summed before calculating shares; averages use people in private households
over household counts. Medians are never summed or averaged for publication.

| Comparison area | Independently verified output |
| --- | --- |
| Burnside/Gorge | Population 6,875; households 3,255; calculated size 1.73; renters 65.9%; tenant median CAD 1,190 |
| Downtown / Fairfield | Population 20,860; households 12,405; renters 61.0%; household size 1.61; tenant median unavailable |
| Oaklands / Jubilee | Population 12,875; renters 54.3%; household size 2.00; tenant median unavailable |
| James Bay | Population 13,055; renters 67.8%; tenant median CAD 1,370 |

All source columns sum to **91,855 residents**. No attempt is made to rescale
rounded counts to the unrounded municipal headline. All census periods remain
2021; tenant costs are occupied-rental history rather than today's asking rent.

The spatial review checked 172 selected park/open-space records dissolved into
168 names, 17 facility points, and all 2,360 BC Transit boarding-stop records.
The GTFS route types are exclusively `3` (bus), and its feed period is
2026-11-05 to 2027-01-03. All ten nearby-stop counts use the 800 m threshold on
original polygons. The rail-only lists remain empty. Park/open-space shares use
a union, exclude school/cemetery classes, and do not claim all land is publicly
accessible. The ten descriptions accurately repeat the validated metrics and
source examples without inventing current service or facility availability.

The total source comparison-polygon area is about 19.42564 km². Display-area
change is at most 0.266%; the source-to-display boundary deviation for the
original combined polygons is at most 4.990 m. Correct winding and coverage
remain intact after display simplification.

## Issues found and resolved

The shared census-quality banner originally ignored Halifax's camel-case
`dataQualityFlag`, hiding source flag `00010` for tracts 2050006.00, 2050008.00
and 2050154.04. The lead added that explicit flag key; the other 96 tracts have
`00000`. Generic source-basis text still does not trigger a false warning.

The worker added the Victoria current-snapshot/historical-vertex qualification
to the visible boundary note and embedded source notes. These changes do not
alter any validated census or spatial value. No unresolved data correction is
required by this review.
