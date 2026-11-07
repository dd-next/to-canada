# Additional city neighbourhood-source inventory

Inspected 2026-11-07 for the third expansion stage. The first two stages cover
Toronto/Vancouver and Halifax/Victoria. This inventory records every remaining
user-requested candidate, including work that is not yet publication-ready.
Source availability is distinct from a verified neighbourhood join: a census
year in a file title does not establish that current polygons match it.

| Candidate | Decision for this stage | Verified source fit and outstanding work |
| --- | --- | --- |
| **Winnipeg** | **Included in stage three.** | Exact 2016 census/boundary pair; 194 neighbourhoods. Population/household/housing/commuting measures plus separately dated parks, bus stops and civic amenities. Separate 2021 tables cannot yet be tied to a verified polygon release. |
| **Québec City** | **Included in stage three.** | All 35 October-2026 quartier profiles provide 2021 observations for June-2020 administrative definitions. Official IDs, names, profile maps and legal boundary descriptions establish the correspondence. Licensed civic inventories and RTC stops retain their own dates. |
| **Montréal** | Suitable borough-level candidate; not implemented in this release. | Official 2021 housing profiles cover the agglomeration, city and arrondissements. Current polygons include both arrondissements and linked municipalities; they are explicitly subject to modification. Boroughs are broader than familiar neighbourhoods. Needs a declared borough scope, a 2021 geometry check and a tested parser. |
| **Ottawa** | Useful official boundaries; census join unresolved. | City publishes ONS Gen 2 historical and Gen 3 boundaries. Gen 3 feature fields contain no population/household measures. City's 2021 census CSVs found here are wards/subareas; NEI uses another geography. Need statistics explicitly for the chosen ONS generation. |
| **Hamilton** | Useful official neighbourhood polygons; census join unresolved. | The inspected current population/age/gender service explicitly reports wards and Hamilton totals; 2016 census-profile services use census tracts. Neither is an exact named-neighbourhood join. Requires a publisher neighbourhood tabulation or validated correspondence. |
| **Kitchener–Waterloo** | Regional/city geography choice and join unresolved. | Separate city neighbourhood-association boundaries and a regional 2016 planning-district housing-profile service exist. Association areas, planning districts, the two cities and the CMA are not interchangeable. Need aligned statistics and polygons plus explicit municipal coverage. |
| **London** | Official districts and profile links found; linked source unavailable. | City says its planning districts are used for neighbourhood profiling and embeds PDF links. The tested Uplands PDF link returns 404. Need restored or archived profiles, their census year, and correspondence to the current district polygons. |

## Winnipeg: implemented with an explicit historical census period

- [Census Boundaries](https://data.winnipeg.ca/d/re9d-6c9j) and
  [Census Values](https://data.winnipeg.ca/d/ckim-fid6) cross-reference one
  another in their official metadata. Grouping each API by year and geography
  confirms 2011 and 2016, with 194 `Neighbourhood` boundaries in 2016.
  Selected census values match every code and name in that 2016 set.
- [2021 profiles](https://www.winnipeg.ca/census/2021/) and the
  [2021 alphabetical list](https://www.winnipeg.ca/census/2021/Alpha/default.asp)
  are available separately. The
  [geography explanation](https://www.winnipeg.ca/census/includes/Geographies.stm)
  acknowledges neighbourhood additions/modifications. The
  [maps page](https://www.winnipeg.ca/census/includes/Maps.stm) did not establish
  an exact 2021 polygon release or complete crosswalk.
- Current official [parks/open space](https://data.winnipeg.ca/d/tx3d-pfxq),
  [libraries](https://data.winnipeg.ca/d/bt47-pkkm),
  [recreation complexes](https://data.winnipeg.ca/d/bmi4-vvs2) and
  [bus GTFS](https://gtfs.winnipegtransit.com/google_transit.zip) add useful
  local detail without changing the historical census geography.

See [Winnipeg evidence](winnipeg.md) for source dates, private-household
population scope, all formulas, unknown-cost handling, spatial rules, fixtures
and checks. This is City of Winnipeg coverage, not the wider CMA; areas absent
from the 2016 boundary release are not fabricated.

## Québec City: implemented with verified neighbourhood correspondence

The official
[Portrait – Quartiers](https://www.ville.quebec.qc.ca/apropos/portrait/quelques_chiffres/quartiers/index.aspx)
page names **35 quartiers** across six boroughs and says its statistical
profiles were produced for 2021. Its current links point to October-2026
PDFs, for example
[Saint-Roch](https://www.ville.quebec.qc.ca/apropos/portrait/quelques_chiffres/docs/1-2_Saint_Roch_Portrait_Octobre_2026.pdf).
The release/update date must be kept separate from the census observation
year inside each profile.

The official [Quartiers open dataset](https://www.donneesquebec.ca/recherche/dataset/vque_9)
offers CSV/WKT, GeoJSON and SHP with `ID`, `NOM`, area and perimeter. The
[machine-readable metadata](https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=vque_9)
reports a 2026-11-01 update and CC BY 4.0. The
[GeoJSON download](https://www.donneesquebec.ca/recherche/dataset/5b1ae6f2-6719-46df-bd2f-e57a7034c917/resource/436c85aa-88d9-4e57-9095-b72b776a71a0/download/vdq-quartier.geojson)
has been matched to all 35 profile codes and names. Original polygons are
projected to NAD83 MTM zone 7 (EPSG:32187) for spatial calculations.

All profiles state June 2020 neighbourhood definitions. The 2026 naming
amendment retains all 35 boundary-description bodies; two swapped appendix
headings are checked against Article 1 and the profile maps. The current
polygon snapshot is dated explicitly, without claiming archived vertex
identity. Every one of the 315 census values has been independently checked.
Coverage excludes the separate municipalities of L'Ancienne-Lorette,
Saint-Augustin-de-Desmaures and Wendake and the wider CMA.

The bundle includes household and housing measures, RTC bus-stop counts,
mapped library/community-centre sites, and a limited licensed inventory of
school, dog and linear parks. It does not claim all-park coverage or parkland
area. See [Québec City evidence](quebec-city.md) and the
[independent validation report](validation-stage3.md) for details.

## Montréal: borough coverage is feasible, smaller neighbourhoods need more work

Official sources inspected:

- [2021 household and housing profiles](https://donnees.montreal.ca/dataset/profils-menages-logements):
  profiles for the agglomeration, municipality and each arrondissement, with
  household composition, dwelling structure, tenure and housing-cost topics.
  Current resources are standalone HTML; their publication/update dates are
  later than the 2021 observations.
- [2021 custom housing tabulation](https://donnees.montreal.ca/dataset/commande-sh-recensement-2021),
  linked from those profiles, is the underlying table candidate.
- [2021 custom social tabulation](https://donnees.montreal.ca/dataset/commande-personnalisee-recensement-2021):
  resource metadata includes IVT files at dissemination-area, census-tract
  and arrondissement scales. The small-area files are not already named
  neighbourhood aggregates. The dataset's own note calls for Statistics
  Canada attribution and identifies the Montréal custom order.
- [Administrative boundaries](https://donnees.montreal.ca/dataset/limites-administratives-agglomeration):
  current downloadable NAD83 MTM zone 8 and WGS84 files, updated 2026-11-01.
  The description includes the municipality, its boroughs and linked cities
  and explicitly says the informational boundaries are subject to modification.

The safe next deliverable is an explicitly labelled **19-arrondissement,
City-of-Montréal** product after confirming the boundary vintage and testing
the 2021 profile extraction. Linked municipalities must be excluded unless
the bundle clearly expands its municipal scope. Borough statistics cannot be
relabeled as Mile End, Plateau sub-neighbourhoods, or other informal areas.
An arrondissement name match alone is insufficient evidence that a current
polygon is identical to the statistical geography. Smaller neighbourhoods
need a publisher-defined geography and custom tabulation/crosswalk; no areal
proration of population or household medians is proposed.

## Ottawa: ONS generations, NEI and wards must remain distinct

The City's catalogue identifies the following official sources:

- [ONS Gen 3 boundary item](https://www.arcgis.com/home/item.html?id=439875b741f34985a7001a1491c2d79b)
  and [feature layer](https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/GEN3_OTT_1_3_3/FeatureServer/0).
  Inspected fields are `FID`, `ONS_ID`, `ONS_Name`, `ONS_Region` and geometry
  measurements. Population and households are absent. Metadata says boundaries
  are generalized, subject to a minimum population, and reviewed periodically.
- [ONS Gen 2 historical boundary item](https://www.arcgis.com/home/item.html?id=32fe76b71c5e424fab19fec1f180ec18).
  It is a distinct historical release, not an alias for Gen 3.
- [2021 short-form ward CSV](https://www.arcgis.com/home/item.html?id=8f75667abca94de8a7d4c467c3bc6f81)
  and [2021 short-form subarea CSV](https://www.arcgis.com/home/item.html?id=d4e5098fd89740e6a8893d58804e37df),
  plus [2021 long-form subarea CSV](https://www.arcgis.com/home/item.html?id=83170bd7a02a4fc4b98c0124ae952b96).
  These labels establish different geographic products, not ONS profiles.
- [NEI 2024 item](https://www.arcgis.com/home/item.html?id=82902692e11a4922b110199efcb32341)
  and the City-linked [Ottawa Neighbourhood Study](https://www.neighbourhoodstudy.ca/)
  provide the next path to seek a dated ONS-specific data export or crosswalk.

Next: obtain a population/household/housing export explicitly keyed to the
selected `ONS_ID` generation and confirm its terms, dates and suppressed
values. Then attribute Ottawa's official civic and transit layers spatially.
Ottawa municipal coverage must not absorb Gatineau merely because the
application's broader statistics use the Ottawa–Gatineau CMA. Neither a ward
total nor a NEI census-tract statistic can simply be assigned to each ONS
neighbourhood it intersects.

## Hamilton: official data exists, but the inspected census units differ

- [Official neighbourhood polygons](https://www.arcgis.com/home/item.html?id=30e74cacb3b641d799629ebccad9d615)
  expose the [Neighbourhoods service](https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Neighborhoods/FeatureServer).
- [Population, age and gender service](https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Census_Population_Age_and_Gender/FeatureServer)
  explicitly states **“Population by age and gender for each ward and total
  for Hamilton.”** Its description discusses the 2021 Census custom tabulation.
  That is concrete evidence against treating these records as neighbourhood
  values.
- [2021 dwelling service](https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Census_Dwellings_2021/FeatureServer)
  is a housing candidate, but must be checked for its exact geography rather
  than assumed to match neighbourhood names.
- [2016 census profile by census tract](https://www.arcgis.com/home/item.html?id=9b21037061ba4e1791d8ff7376df364b)
  is explicitly a tract product. It does not solve the named-neighbourhood
  match without further correspondence work.
- Useful enrichment is already published as official
  [parks](https://www.arcgis.com/home/item.html?id=98c01721338342bf82b0833ae05e7acb),
  [HSR bus stops](https://www.arcgis.com/home/item.html?id=0b0230d8ea954a19baa8e7704f9ccd14)
  and [libraries](https://www.arcgis.com/home/item.html?id=6a731296567441b28d85d8c9c2713421).

Next: obtain a City-approved neighbourhood census tabulation or establish
nesting/correspondence using the relevant census vintage. Named current
polygons plus ward data are insufficient. Where a source provides only
tracts or wards, present that scale explicitly in a separate product rather
than generate neighbourhood profiles with duplicated totals.

## Kitchener–Waterloo: choose a coherent geographic product first

- [Kitchener neighbourhood-association boundaries](https://www.arcgis.com/home/item.html?id=bf196fa45fa4485da3e61f4babbb4108)
  and [Waterloo neighbourhood associations](https://www.arcgis.com/home/item.html?id=50193e4f74d949479b048cf445d6dd82)
  are separate city services. Association areas do not establish census
  neighbourhood geography or an exhaustive combined urban footprint.
- The Region of Waterloo publishes an item titled
  [_Census16PlanningDistrictsHousingProfiles](https://www.arcgis.com/home/item.html?id=25ef0e0e4e814d8d8b52653cea5ce322).
  Its metadata identifies a 2016 planning-district housing map service,
  modified 2022-08-31, with no licence/description supplied at the item level.
  The service layer metadata and usage terms therefore need inspection
  before importing its observations.
- [City of Waterloo district plans](https://www.arcgis.com/home/item.html?id=2fb4cc862830455eb02a8fdd2f03d2b8)
  are another geographic definition, not an automatic match to those regional
  census planning districts.

Next: verify the regional housing service's original 2016 district geometry
and population/household fields, then decide whether to cover Kitchener and
Waterloo municipalities together or name one municipality's coverage. The
application's Kitchener–Cambridge–Waterloo CMA statistics cannot be copied
into neighbourhoods in the two named cities. A separate census-aligned
district product could be useful even if association-area joins remain
unsupported.

## London: useful official district definitions, stale profile links

The [Planning Districts item](https://www.arcgis.com/home/item.html?id=5e086120a5c54832b7aa358887f388a8)
states that the City uses these districts for neighbourhood profiling and
that profile links are in its attributes. The
[official layer](https://maps.london.ca/server/rest/services/OpenData/OpenData_Community/MapServer/18)
has `GIS_ID`, `GIS_FeatureKey` (district name) and
`NeighbourhoodInformation`, with current polygons. The feature query returned
Uplands, Sunningdale and Fox Hollow with links under `/sites/default/files/2021-08/`.
That path is an upload date, not proof of 2021 Census observations.

The exact published
[Uplands profile URL](https://london.ca/sites/default/files/2021-08/Uplands%20-%20aodo.pdf)
returned HTTP 404 during this inspection. No PDF contents or census vintage
were inferred from its filename. The catalogue also has a
[2016 population-by-ward item](https://www.arcgis.com/home/item.html?id=ec65f946fa7d4c36b7d8ac405d6365a9),
which is not a planning-district substitute.

Next: locate replacement official district profiles or an archived supported
release, verify their census period and boundary correspondence, and test
their population/household/housing parser. Until then, the polygons alone
would yield the thin map-only profiles this expansion is intended to avoid.

## Scope of these decisions

These findings describe the official resources actually inspected; they are
not claims that the deferred cities have no usable neighbourhood data.
Winnipeg and Québec City are included; borough-level Montréal remains a
promising candidate. The remaining gates are concrete: source delivery, exact geographic unit,
boundary/census vintage, and preservation of suppressed/missing observations.
All future adapters must carry their own population universe, inventory
dates, attribution and municipal coverage. Median housing costs must never
be averaged across polygons, and missing parks/transit feeds must not be
rendered as zero coverage.
