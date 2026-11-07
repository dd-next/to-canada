# Vancouver local-area snapshot

Implemented in `pipeline/neighbourhoods/vancouver.py`; output is
`data/processed/neighbourhoods/vancouver.json`. This adapter covers 22 local
planning areas with 17 metrics, 20 distinct named rail stations and 22 substantive
descriptions. Ten descriptions also include a separately sourced, individually
written setting paragraph. Each description has housing, resident households and
occupations, parks/facilities, transport and practical considerations. Measured
evidence and editorial interpretation are marked separately and cite source IDs.

## Geography and census vintage

The [City boundary catalogue](https://opendata.vancouver.ca/explore/dataset/local-area-boundary/)
explicitly states **“These boundaries do not change.”** It describes the City's
22 local areas and says boundaries generally follow street centrelines. The
dataset modification date is 2023-06-24; that is not a new census geography.

The [2016 custom census catalogue](https://opendata.vancouver.ca/explore/dataset/census-local-area-profiles-2016/)
states that its census-block-defined 22 local areas are equal to those local
planning areas. It also explicitly distinguishes their coverage:

- The local areas **include Musqueam 2 reserve**.
- Vancouver CSD excludes that reserve and includes Stanley Park.
- Vancouver CMA covers the wider metropolitan area.

The adapter joins only the 22 local-area columns to their permanent boundaries.
The `Vancouver CSD` and `Vancouver CMA` columns are explicitly excluded. Stable
IDs normalize spaces and hyphens, resolving census `Arbutus-Ridge` to boundary
`Arbutus Ridge`. Both sets must match exactly; duplicates or unmatched names fail.
The publisher's permanent-boundary assertion is also checked during builds. There
is no statistical interpolation or area allocation of census observations.

The boundary/coverage notes shown in the application repeat the reserve/CSD
distinction. **Stanley Park is outside these mapped local-area polygons.** Its
neighbouring park context must not be read as a population assignment to the West
End. A regression check confirms that the Stanley Park centre at approximately
(-123.1443, 49.3005) is outside the polygon union.

2016 is the latest machine-readable local-area census custom profile found in
the City's catalogue during this work. The catalogue search also returned 2001,
2006 and 2011. All demographic, housing, occupation and commuting text therefore
says **2016**; no 2021 or current-population claim is made. The 22 source population
counts sum to 633,135, versus 631,485 in the unused Vancouver CSD column. These
are rounded custom-geography counts and are not reconciled to a municipal total.

## Downloaded sources

All downloads use `common.fetch.fetch` with the shared ignored `data/raw/` cache.
Source records use the actual cached response's `retrievedAt`, not the build time.
The initial downloads were made on 2026-11-07. The exact timestamps remain in the
bundle and raw `.meta.json` files. Retrieval time and dataset modification date
are distinct from the observation period.

| Dataset | Observation / publisher modification | Method and scope |
| --- | --- | --- |
| [Local area boundary](https://opendata.vancouver.ca/explore/dataset/local-area-boundary/) | Permanent boundaries; dataset modified 2023-06-24 | 22 polygons, exact name join to the 2016 custom census |
| [Census local area profiles 2016](https://opendata.vancouver.ca/explore/dataset/census-local-area-profiles-2016/) | May 2016 census; catalogue modified 2018-04-10 | [Legacy CSV](https://webtransfer.vancouver.ca/opendata/csv/CensusLocalAreaProfiles2016.csv), decoded as CP1252; 5,493 custom row IDs |
| [Parks — polygon representation](https://opendata.vancouver.ca/explore/dataset/parks-polygon-representation/) | Dataset modified 2026-09-28 | 254 original park/site polygons; one unnamed site retained with its source address |
| [Rapid transit stations](https://opendata.vancouver.ca/explore/dataset/rapid-transit-stations/) | Dataset modified 2023-02-22 | 22 points → 20 distinct exact station names; City of Vancouver stations only |
| [Libraries](https://opendata.vancouver.ca/explore/dataset/libraries/) | Dataset modified 2020-11-19; metadata also says data updated July 2009 | 22 source records → 21 branch records after excluding `Outreach Services`; publisher's `geo_local_area` assignment |
| [Community centres](https://opendata.vancouver.ca/explore/dataset/community-centres/) | Dataset modified 2020-11-19 | 27 named facility records, including Carnegie and community-service centres; publisher's `geo_local_area` assignment |

The catalogue API is
`https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/{dataset}`.
Complete spatial/facility exports use the same path plus `/exports/json`. Export
counts must match the metadata record count. Empty datasets, absent geometry,
duplicate parks or facilities and unknown facility local areas fail the build
instead of producing false zeroes.

Library and community-centre counts are explicitly **mapped historical inventory
records**, not promises of current public access. Oakridge Library and other
facilities may have moved, closed temporarily or changed since the snapshot.
The library source's old July 2009 currency statement is retained, even though its
dataset modification timestamp is 2020. Facility paragraphs advise checking
current locations, opening hours and programs. This avoids claiming that a fresh
download makes a legacy inventory current.

The rail dataset omits stations outside Vancouver and later network changes. In
particular, it must not imply that subsequent Broadway network changes have been
included. Zero rail means no station in this **dated, City-only inventory** falls
within the stated proximity threshold, not that an area lacks bus service.

## Census calculations

The adapter validates full variable labels alongside the custom row IDs. The IDs
are publisher-specific sorting identifiers, not Statistics Canada standard codes.
Source counts are randomly rounded; long-form measures use the mandatory 25%
sample. Missing/suppressed tokens remain `null` with a `missingReason`, and a
missing component makes a derived sum/share missing. Zero counts remain zero.

| Metric | Source row IDs / formula | Universe |
| --- | --- | --- |
| Population | 1 | Total local-area population, 100% census data |
| Private households | 150 | Household-size table, 100% census data |
| Children under 15 | 80, published percentage | Total population |
| Average household size | 157 | Private households |
| One-person households | 151 / 150 × 100 | Private households by size |
| Homes in apartment buildings | (168 + 173) / 166 × 100 | Occupied private dwellings; **duplexes excluded** |
| Single-detached homes | 167 / 166 × 100 | Occupied private dwellings |
| Apartments/flats in duplexes | 172 / 166 × 100 | Occupied private dwellings |
| Households renting | 4020 / 4018 × 100 | Private households by tenure, including band housing in the denominator; 25% sample |
| Median tenant shelter cost | 4106 | Non-farm, non-reserve rented dwellings; 2016 CAD/month; 25% sample |
| Public-transit commute share | 2316 / 2313 × 100 | Employed residents 15+ in private households with usual workplace or no fixed workplace; excludes working at home |
| Walk/cycle commute share | (2317 + 2318) / 2313 × 100 | Same commuting universe |
| Resident occupations in prose | Each of 2193…2202 / 2192 × 100 | Resident labour force 15+ with applicable NOC 2016 occupation; 25% sample; top two broad groups |

Tenure totals are **not** replaced with household-size totals: they arise from
different census tables/samples. Shelter costs combine all dwelling sizes and
include utilities where applicable. They describe costs paid by existing tenants
in **2016**, never today's advertised or available rental prices. These shelter
costs exclude reserve dwellings even though the local-area census coverage
includes Musqueam 2; the definition and prose preserve that scope.

The City also cautions that changes in classifying single-detached homes and
duplexes may affect comparisons with previous censuses. No trend claim is made.
Resident occupation text says explicitly that it is not a count of jobs located
in the neighbourhood. Household descriptions use the measured census counts, not
demographic assumptions from retail, offices or the City's promotional prose.

Representative checks against the CSV:

| Area | Source values | Result |
| --- | --- | --- |
| Downtown | Population 62,030; households by size 35,050; one-person 18,055 | 51.5% one-person households |
| Downtown | Renter 20,070 / tenure total 35,100 | 57.2% renting; using 35,050 would incorrectly give 57.3% |
| Downtown | Apartments 32,910 + 1,210 / occupied dwellings 35,045 | 97.4% apartment buildings |
| Downtown | Transit 7,010; walked 13,655; bike 1,020; commuter total 32,995 | 21.2% transit; 44.5% walk/cycle |
| West End | Renters 24,685 / tenure total 30,815; apartments 24,035 + 6,595 / 30,875 | 80.1% renting; 99.2% apartment buildings |
| Dunbar-Southlands | High-rise apartments 0; low-rise apartments 700; duplex flats 2,045; occupied dwellings 7,565 | 9.3% apartment buildings; 27.0% duplex flats; genuine zero retained |
| Marpole | Median monthly tenant shelter cost 964; renters 6,410 / tenure total 10,905 | CAD 964/month in **2016**; 58.8% renting |

## Spatial method

1. Validate/repair the original source geometries, then project them to
   **NAD83 / UTM zone 10N (EPSG:26910)**.
2. Count park-site publisher IDs with more than 1 m² intersection. Touching-only
   features do not count. Calculate covered area from the intersection with the
   **union** of overlapping park polygons, so overlap is not counted twice.
   A site crossing local-area borders can appear in both. Small plazas, street-end
   sites and unnamed parks remain in scope. Green space outside the source's
   polygons is not inferred.
3. Deduplicate exact rail station names. Waterfront and Commercial–Broadway each
   have two published points. Keep the westernmost, then southernmost published
   point, making the representative point deterministic and traceable. Do not
   average points into a newly invented location.
4. Measure the station point's shortest straight-line distance to each original
   polygon; an inside point has distance zero. Include distances **≤800 m** before
   rounding to the displayed metre. These are not walking distances and do not
   imply accessibility from every address in an area.
5. Facility records use the publisher's `geo_local_area`, which is derived from
   coordinates or source address. They are not proximity counts. This distinction
   is in `geographicScope` and the metric notes.
6. Only after calculations, simplify local-area polygons by 10 m, convert them
   to WGS84 and orient exterior rings clockwise for D3. The display simplification
   never affects source metrics or station distances.

The current snapshot has 21 mapped library branches and 27 community-centre
records across all local areas. Downtown has two library branches after
excluding Outreach Services. Counts can legitimately be zero when the complete
dated inventory contains no record assigned to an area.

## Descriptions and source review

Each of the 22 descriptions has five substantial sections drawn from census,
park and facility records. These ten also have an individually written setting
section, paraphrased from the following City guides and reviewed 2026-11-07:

| Area | Setting source |
| --- | --- |
| Downtown | [City area guide](https://vancouver.ca/news-calendar/downtown.aspx) |
| Fairview | [City area guide](https://vancouver.ca/news-calendar/fairview.aspx) |
| Grandview-Woodland | [City area guide](https://vancouver.ca/news-calendar/grandview-woodland.aspx) |
| Hastings-Sunrise | [City area guide](https://vancouver.ca/news-calendar/hastings-sunrise.aspx) |
| Kensington-Cedar Cottage | [City area guide](https://vancouver.ca/news-calendar/kensington-cedar-cottage.aspx) |
| Kitsilano | [City area guide](https://vancouver.ca/news-calendar/kitsilano.aspx) |
| Marpole | [City area guide](https://vancouver.ca/news-calendar/marpole.aspx) |
| Mount Pleasant | [City area guide](https://vancouver.ca/news-calendar/mount-pleasant.aspx) |
| Renfrew-Collingwood | [City area guide](https://vancouver.ca/news-calendar/renfrew.aspx) |
| West End | [City area guide](https://vancouver.ca/news-calendar/west-end.aspx) |

The guides are undated, so the bundle labels them as undated descriptive sources
and records their actual download time separately. They are not used as census
evidence. Some describe broad neighbourhood surroundings rather than exact local
area boundaries; the adapter avoids, for example, assigning Trout Lake to
Grandview-Woodland or Science World to Fairview from that prose. Planning/project
status and claims about who lives in an area are not copied as current facts.

Setting and practical sections are labelled editorial; the latter translate the
data's limitations into address-level checks without ranking neighbourhoods or
inventing safety, school, income or resident stereotypes. All factual numerical
claims carry a reference year in the prose.

## Reproduction and checks

From the repository root:

```sh
/workspace/.venvs/to-canada/bin/python pipeline/neighbourhoods/vancouver.py
/workspace/.venvs/to-canada/bin/python -m unittest discover -s pipeline/neighbourhoods -p test_vancouver.py -v
```

The adapter exports `build()` for the shared pipeline. Direct execution runs the
shared validator before writing only `data/processed/neighbourhoods/vancouver.json`.
The lead owns registration, app-data copying and shared manifests.

Eleven offline tests cover the source key values, exclusion of CSD/CMA columns,
proper census denominators, duplex separation, missing/suppressed values,
schema drift, duplicate rows, park union arithmetic, touching polygons, the exact
800 m distance threshold, duplicate interchange points, local projected units,
all 22 saved geometries and every saved census metric. The complete bundle also
passes the shared schema/source/description/count validator.

`pipeline/neighbourhoods/fixtures/vancouver/census-2016-selected.csv` retains the
original labels and all 26 columns for the 28 variables used. The companion
`provenance.json` records the original download URL, retrieval time and SHA-256.
The fixture is UTF-8 after decoding the original CP1252 file. Tests are offline;
normal repeated builds reuse immutable cached response bytes and timestamps.
