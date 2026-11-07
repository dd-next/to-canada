# Québec City neighbourhood evidence

The adapter publishes all 35 City of Québec administrative neighbourhoods as
`quebec-city`, using the city's neighbourhood codes such as `1-2` as stable row
IDs. It covers the municipality, not the Québec metropolitan area or the wider
agglomeration. L'Ancienne-Lorette, Saint-Augustin-de-Desmaures and Wendake are
outside the mapped neighbourhoods.

The snapshot contains nine 2021 census measures for every neighbourhood and
current, separately dated inventories of RTC bus stops, selected park categories,
libraries and community centres. Raw downloads and response metadata remain in
the ignored shared `data/raw/` cache. No public-data copies or shared source
registry files are written by this adapter.

## Census source and parsing

- [Official neighbourhood profile index](https://www.ville.quebec.qc.ca/apropos/portrait/quelques_chiffres/quartiers/index.aspx)
- [Saint-Roch, October 2026 PDF](https://www.ville.quebec.qc.ca/apropos/portrait/quelques_chiffres/docs/1-2_Saint_Roch_Portrait_Octobre_2026.pdf)
- [Cap-Rouge, October 2026 PDF](https://www.ville.quebec.qc.ca/apropos/portrait/quelques_chiffres/docs/3-7_Cap_Rouge_Portrait_Octobre_2026.pdf)

All 35 October 2026 PDFs are discovered from the official index. The profile
code in the filename must match the explicit boundary crosswalk. `pdftotext
-layout -f 1 -l 7` extracts the opening physical pages. The parser checks the
profile's own identity, its June 2020 geography assertion, and exactly one
`FAITS SAILLANTS` section. Only its own highlights on printed page 5, physical
page 6, supply observations. The complete census extraction has 315 cells.

French source labels and their universes are part of the parser contract:

| Metric | Source statement / meaning |
| --- | --- |
| `population` | Population résidante, the final 2021 count in the 2001–2021 change statement |
| `households` | Nombre de ménages, the final 2021 private-household count |
| `householdSize` | Taille moyenne des ménages; published persons per private household |
| `livingAlone` | Ménages constitués d'une seule personne; percentage of households |
| `occupiedDwellings` | Logements privés occupés; housing-table total |
| `detached` | Maisons individuelles; percentage of occupied private dwellings |
| `lowRiseApartments` | Appartements dans un immeuble de moins de 5 étages |
| `renters` | Ménages locataires; published tenure percentage |
| `majorRepairs` | Logements nécessitant des réparations majeures |

The low-rise category excludes apartment buildings of five or more storeys and
duplexes; it is **not** total apartment share. The profile's rounded percentages
are retained, not reverse-engineered into counts or recomputed using a different
denominator. Population includes residents outside private households, so it is
not divided by household count to calculate household size. Household and
housing-table totals can differ because of their published rounding/universes.
No income, shelter-cost amount or current asking rent is inferred.

Two explicit identity variants are supported: the `1-1` foreword says `fait
partie` instead of `est issu`; the Saint-Michel (`5-2`) foreword omits its numeric
code, so the exact Saint-Michel name plus the official index filename establish
its identity. Generic names `Quartier 4-3`, `Quartier 4-5` and `Quartier 4-6` are
kept as the municipal GIS labels.

Some later comparison pages contain unrelated neighbourhood headers, and some
charts are embedded images. Those pages are not used. The index and the PDFs
are cited individually in the bundle, and each row's `quality.profileSourceId`
identifies its own PDF. Source missing/suppression symbols remain null with a
reason. Changed labels, an absent geography statement, a different year or an
unexpected profile identity stop the build instead of importing a nearby value.

The census observations originate with Statistics Canada and are attributed
under its Open Licence. The municipal PDF documents retain their publisher
rights; the bundle redistributes the attributed factual observations, not the
full PDFs or their maps.

## Geography compatibility and publisher anomaly

- [Quartiers metadata, CC-BY 4.0](https://www.donneesquebec.ca/recherche/dataset/vque_9)
- [Boundary GeoJSON](https://www.donneesquebec.ca/recherche/dataset/5b1ae6f2-6719-46df-bd2f-e57a7034c917/resource/436c85aa-88d9-4e57-9095-b72b776a71a0/download/vdq-quartier.geojson)
- [Current neighbourhood bylaw, R.R.V.Q. D-8](https://reglements.ville.quebec.qc.ca/fr/document/rc/R.R.V.Q.chapitreD-8)
- [June 2020 amendment R.V.Q.2301](https://reglements.ville.quebec.qc.ca/fr/document/an/R.V.Q.2301/)
- [2020 annex](https://reglements.ville.quebec.qc.ca/fr/ressource/ra/R.V.Q.2301_FR_001_0001.pdf)
- [April 2026 amendment R.V.Q.3519](https://reglements.ville.quebec.qc.ca/fr/document/an/R.V.Q.3519/)
- [2026 annex](https://reglements.ville.quebec.qc.ca/fr/ressource/ra/R.V.Q.3519_FR_001_0001.pdf)

Every October 2026 profile states on printed page 4: “La carte suivante montre
précisément le quartier tel que défini depuis le mois de juin 2020.” R.V.Q.2301
became effective on 2 June 2020. The current bylaw lists subsequent amendment
R.V.Q.3519, effective 22 April 2026, whose explanatory note says it changes
neighbourhood names. Article 1 assigns `4-2` to Orsainville, `5-1` to
Sainte-Thérèse-de-Lisieux and `5-4` to Vieux-Bourg.

Independent validation compared all 35 written boundary-description bodies in
the 2020 and 2026 annexes: the bodies match after whitespace normalization.
However, **the 2026 annex transposes the headings of the Sainte-Thérèse-de-Lisieux
and Vieux-Bourg descriptions**. The former `5-1` description appears under
Vieux-Bourg and the former `5-4` description appears under Sainte-Thérèse. The
adapter does not use those erroneous headings as a crosswalk. Article 1, both
October 2026 profile maps and the current municipal GIS agree on the correct
code/name mapping. This anomaly is also disclosed in the bundle's boundary note
and bylaw source record.

The GeoJSON resource was last modified on **2026-11-01**. This is a current
municipal polygon extract for the administratively matching definitions; it is
not represented as an archived 2021 vertex dataset. Cartographic corrections
remain possible. The parser checks all 35 numeric GIS IDs and their expected
names, then joins them to the profile codes with an explicit crosswalk. A new
amendment in the current bylaw fails the automated geography guard and requires
review before historical census values can be reused.

Spatial work uses the original polygons in **NAD83 / MTM zone 7, EPSG:32187**.
Only display geometry is simplified by 8 metres, transformed to WGS84 and
oriented with clockwise exterior rings for D3. Points outside the polygons are
excluded without snapping. A point covered by multiple boundary polygons is
assigned once, to the lowest stable neighbourhood code.

## Parks and other facilities

- [Lieux publics metadata, CC-BY 4.0](https://www.donneesquebec.ca/recherche/dataset/vque_14)
- [Lieux publics GeoJSON](https://www.donneesquebec.ca/recherche/dataset/daa10606-5fdd-4c9b-b5ef-235081690b6e/resource/8902c982-bbb6-4e84-814a-550d094c0bae/download/vdq-lieupublic.geojson)

The resource was last modified on **2026-11-06**. Its geometries are points.
Its description includes municipally administered infrastructure and some
private institutions. Only explicit `DESCRIPTION` categories are selected:

| Displayed metric | Exact source categories | Snapshot result |
| --- | --- | --- |
| School, dog and linear park sites | `Parcs écoles`, `Parc canin`, `Parcs linéaires` | 85 + 2 + 2 points, 89 neighbourhood assignments |
| Mapped library sites | `Bibliothèques` | 28 records, 27 sites after duplicate removal |
| Mapped community centres | `Centres communautaires` | 49 sites |

The park metric covers **only school, dog and linear park locations**. It does
not cover ordinary neighbourhood parks or total parkland. A zero means no
selected point category, not that a neighbourhood has no parks. Names are
deduplicated within a neighbourhood; the two Rivière-des-Roches linear-park
points fall in different neighbourhoods (`4-1` and `4-2`), so that name appears
once in each. Counts describe point locations, not full park footprints,
entrances, walking access or park area. The separate ArcGIS recreation-map
inventory was investigated but is **not imported or redistributed**, because
its public layer/item metadata did not state a reuse licence. No bulk fixture
from that map is tracked.

The library inventory includes Université Laval and Collège des Jésuites, so it
must not be described as a count of public-library network branches. Two source
records describe Maison de la Littérature, at nearby addresses on Rue
Sainte-Angèle and Rue Saint-Stanislas. IDs `102399` and `202454` are 21.094 metres
apart. The adapter removes a leading `Bibliothèque` from names for comparison
and merges same-name records less than 100 metres apart, retaining the lowest
source ID (`102399`). Differently named nearby libraries remain separate.
The city total is therefore 27 mapped library sites. Named library and community
centre amenities link to the same licensed source.

Other source classes such as `Centres de loisirs`, `Centres récréatifs` and
`Patros` are not included in community-centre counts. Facility counts do not
establish opening hours, capacity or unrestricted public access.

## RTC transport

- [RTC open-data page](https://www.rtcquebec.ca/donnees-ouvertes)
- [GTFS metadata, CC-BY 4.0](https://www.donneesquebec.ca/recherche/dataset/rtc-gtfs-arrets-et-les-parcours)
- [Official GTFS ZIP](https://cdn.rtcquebec.ca/Site_Internet/DonneesOuvertes/googletransit.zip)

`feed_info.txt` gives validity **2026-11-06 to 2027-03-19**. The adapter reads
`stops.txt` and counts distinct stop IDs whose `location_type` is zero or blank.
Of 4,318 feed records, 4,042 are inside the City of Québec neighbourhood polygons;
276 outside points are excluded. Opposite-direction stops count separately.

This is a feed inventory, not the number of stops active on any particular day,
a route-frequency calculation, an accessibility score or a walking-distance
measure. No rail, proposed tramway or other municipality's points are substituted.
The metric is `busStops`; `rail` is absent and all station arrays are empty.

## Representative source checks

All figures below are from the neighbourhood's own 2021 highlights, not an
arrondissement or city comparison column.

| Code / neighbourhood | Population | Private households | Occupied dwellings | Mean household size | One-person households | Detached | Apartments <5 storeys | Renters | Major repairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1-2 Saint-Roch | 8,380 | 5,320 | 5,310 | 1.6 | 63.9% | 0.6% | 70.8% | 76.2% | 6.8% |
| 3-7 Cap-Rouge | 17,290 | 7,050 | 7,040 | 2.4 | 22.8% | 66.9% | 15.8% | 14.1% | 3.0% |
| 4-3 Quartier 4-3 | 13,820 | 6,220 | 6,215 | 2.2 | 34.7% | 41.4% | 36.8% | 27.7% | 1.8% |
| 5-2 Saint-Michel | 17,675 | 7,390 | 7,385 | 2.4 | 24.2% | 60.1% | 23.3% | 17.5% | 2.4% |

The 35 published population values sum to 549,380; households sum to 265,730;
occupied dwellings sum to 265,705. These are sums of independently published,
rounded neighbourhood observations, not a substituted census subdivision total.
Saint-Roch has 53 RTC stop locations, two selected park sites, Bibliothèque
Gabrielle-Roy and the YMCA-Saint-Roch community centre. Cap-Rouge has 152 RTC
stops, three selected school-park sites, one library and two community centres.

## Reproduction and tests

From the repository root, with `pdftotext` on PATH:

```sh
/workspace/.venvs/to-canada/bin/python pipeline/neighbourhoods/quebec_city.py
/workspace/.venvs/to-canada/bin/python -m unittest discover -s pipeline/neighbourhoods -p 'test_quebec_city.py' -v
```

`build()` returns the schema-v1 bundle, and direct execution runs the shared
validator before writing only `data/processed/neighbourhoods/quebec-city.json`.
All downloads use `common.fetch`, which preserves retrieval times, URL and SHA256
in sidecars. Ordinary reruns use the same cached snapshot. A deliberate source
refresh uses the shared pipeline's `NORTHWARD_REFRESH=1` convention; the profile
index/version and law guard must still pass before publication.

The offline fixtures preserve the 35 factual profile excerpts with exact source
URLs, PDF hashes and retrieval times; rendered bylaw text with provenance; and
the selected licensed library/community-centre points. Tests cover known values,
French decimal and grouping conventions, suppression, distinct household and
dwelling counts, low-rise category labels, changed geography/year/identity,
legal-amendment drift, local metre projection, point assignment, real library
deduplication, municipality exclusions, geometry validity/orientation and all
saved census cells. Shared validation checks schema, source references, metric
bounds and count/list consistency.

Uncollected categories remain absent: ordinary-park coverage and parkland area,
rail, tram, commuting mode shares, occupation breakdowns, current rents and
current building conditions. No missing category is represented as a complete
zero inventory.
