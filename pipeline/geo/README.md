# Geography and everyday life (workstream D)

Outputs in `data/processed/geo/`: `places.json` (verified `Place[]`), `canada.topo.json` (provinces + place CMAs/CAs, WGS84 TopoJSON, ~290 KB), `sources.json`, `metrics.json`, `observations.json`, `series.json` (monthly climate normals), `insights.json` (`language-life`, `climate`).

## Refresh

```
python3 -I pipeline/geo/run.py                # everything (boundaries take a few minutes; downloads are cached in data/raw/)
python3 -I pipeline/geo/run.py --skip-places  # reuse places.json/topology, rebuild census, climate, insights
NORTHWARD_REFRESH=1 python3 -I pipeline/geo/run.py   # force re-download
```
Needs `shapely` and `pyproj` (pip) besides pandas/requests, and `npx mapshaper` (devDependency). Modules: `places.py`, `census.py`, `climate.py`, `insights.py`.

## Sources
* `statcan-cbf-2021` 2021 Census cartographic boundary files, read from the official StatCan GIS REST service (`geo.statcan.gc.ca/.../2021/Cartographic_boundary_files/MapServer`; layers PR, ER, CMA, PC, CSD) because `www12.statcan.gc.ca` file downloads return 403 to non-browser clients.
* `statcan-98-10-0003-01` (CMA/CA -> CSD hierarchy, CSD populations), `-0005-01` (CMA/CA population 2021/2016), `-0030-01` (Ottawa–Gatineau provincial parts), `-0002-01` (Iqaluit CSD), `-0038-01` (household size), `-0308-01` (immigrant status), `-0175-01` (knowledge of official languages), `-0227-01` (language at home), `-0457-01` (commuting). Census of Population 2021, released 2022; long-form tables are 25% sample data.
* `eccc-climate-normals-1991-2020`: ECCC Canadian Climate Normals 1991–2020 station pages and composite station inventory. The GeoMet API (`climate-normals`) and the datamart hold only 1981–2010, so the station pages (`results_1991_2020_e.html?stnID=&climate_id=…&autofwd=1`) are parsed.

## Method notes
* **Places:** CMA/CA codes and DGUIDs were checked against the boundary and census tables (all 30 seed codes confirmed; CMA = `2021S0503`+id, CA = `2021S0504`+id, provincial parts `2021S0505`+PR+id). Principal CSD = the CSD named like the place, else the most populous (Victoria is the city, not larger Saanich). Municipalities = the ten most populous non-reserve CSDs of the CMA/CA (or of the provincial part). Marker = centroid of the part of the principal CSD's largest population centre (computation, not an official point). Economic regions: CSD representative points assigned to ER polygons, ERs with ≥3% of CMA population kept, principal CSD's ER first (adds Winnipeg 4610/4660 and Halifax 1230; drops seed ERs 2445 etc. only if below 3% — Montréal keeps 2440, 2435, 2445, 2455, 2450).
* **Census metrics** are computed from counts; universes and basis are in each `MetricDef`. Long-form counts carry random rounding (flag `rounded`). Iqaluit (CSD) has population only; CSD-level census tables were not ingested.
* **Climate station rule:** composite stations (1991–2020 inventory) within 30 km of the marker that are airports with normals code A–D (best code, then nearest); else nearest A–D within 30 km; else any code; else up to 60 km. Requires complete monthly temperature normals; precipitation/snowfall left empty (`not_available`) if the station does not publish them. Gatineau uses the Ottawa airport station. ECCC quality codes (A: WMO 3-and-5 rule; B ≥25 y; C ≥20 y; D ≥15 y; E–G fewer, flagged `use_with_caution`) are in observation notes and series `dims.normalsCode`. All climate values carry `station_proxy`.
* **Topology:** provinces fetched with identical minimal server generalization, snapped/cleaned/simplified topologically (weighted Visvalingam, keep-shapes) and densified to 0.25° so shared borders are shared arcs and parallels curve in a conic projection.

## Spot-checks against original files
* Toronto CMA population 6,202,225 equals 98-10-0005-01/98-10-0003-01 value; Ottawa–Gatineau CMA 1,488,307 vs parts 1,135,010 + 353,295 (2 persons lost to rounding of the parts table).
* Toronto immigrant share 46.6% = 2,862,855 / 6,142,880 counts in 98-10-0308-01 (matches the published 46.6%).
* Toronto Pearson January mean −5.0 °C, annual precipitation 806.8 mm, days < −20 °C 2.7: identical to the ECCC station page.
* Montréal French knowledge 90.2% = (1,434,620 + 2,396,535) / 4,246,060 from 98-10-0175-01.

## Limitations
Area-wide (CMA/CA) shares, not city-proper; commuting reflects May 2021 pandemic conditions; station proxies; marker is a computed point; boundary geometry is simplified for display; gaps: Iqaluit census metrics other than population; precipitation/snowfall normals missing for Kelowna and Thunder Bay stations, annual snowfall missing for Québec City, Hamilton, Kitchener–Waterloo, London and Sherbrooke; Thunder Bay days above 30 °C missing.
