"""City of Victoria comparison areas, with census-safe boundary unions.

The 2022 Downtown/Fairfield and Oaklands/Jubilee transfers make a name-only
join to the 2021 census unsafe. Combine each affected pair, retaining the
unchanged external perimeter. See docs/neighbourhoods/victoria.md.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import PROCESSED
from common.fetch import fetch, meta_for
from pyproj import Transformer
from shapely import make_valid, orient_polygons, transform
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ITEM = "https://www.arcgis.com/sharing/rest/content/items/"
LAND = "https://maps.victoria.ca/server/rest/services/OpenData/OpenData_Land/MapServer/4"
PARKS = "https://maps.victoria.ca/server/rest/services/OpenData/OpenData_Parks/MapServer/50"
FACILITIES = "https://maps.victoria.ca/server/rest/services/OpenData/OpenData_Facilities/MapServer/7"
GTFS = "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48"
CHANGES = "https://engage.victoria.ca/neighbourhood-boundaries"
GROUPS = {
    "Burnside/Gorge": ("Burnside/Gorge",),
    "Downtown / Fairfield": ("Downtown", "Fairfield"),
    "Fernwood": ("Fernwood",),
    "Gonzales": ("Gonzales",),
    "Hillside/Quadra": ("Hillside/Quadra",),
    "James Bay": ("James Bay",),
    "Oaklands / Jubilee": ("Oaklands", "Jubilee"),
    "North Park": ("North Park",),
    "Rockland": ("Rockland",),
    "Victoria West": ("Victoria West",),
}


def number(raw):
    if raw is None or str(raw).strip() in {"", "-", "..", "...", "x", "X", "F"}:
        return None
    value = float(str(raw).replace(",", "").strip())
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid non-negative measurement: {raw!r}")
    return value


def total(values):
    values = list(values)
    return None if any(v is None for v in values) else sum(values)


def ratio(part, denominator, factor=100, decimals=1):
    if part is None or denominator is None or denominator <= 0 or (factor == 100 and part > denominator):
        return None
    return round(factor * part / denominator, decimals)


def cell(value, reason="Not published, suppressed, or not comparable for this area."):
    return {"value": value, **({"missingReason": reason} if value is None else {})}


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def shown(value, spec=',.0f'):
    return format(value, spec) if value is not None else 'not published'


def date_ms(value):
    return datetime.fromtimestamp(value / 1000, timezone.utc).date().isoformat()


def source_record(sid, title, publisher, url, download, paths, period, *, release=None, notes=(), transformations=(), licence=None):
    return {
        "id": sid, "title": title, "publisher": publisher, "url": url,
        "downloadUrl": download,
        **({"releaseDate": release} if release else {}),
        "retrievedAt": max(meta_for(p)["retrievedAt"] for p in paths),
        "referencePeriod": period,
        "licence": licence or f"{publisher} Open Data Licence",
        "attribution": ("Adapted from Statistics Canada, 2021 Census of Population. This does not constitute an endorsement by Statistics Canada of this product."
                        if "Statistics Canada" in publisher else f"Contains information published by {publisher}; the publisher does not endorse this product."),
        "transformations": list(transformations),
        "notes": ["Retrieval date is not the observation period.", *notes], "status": "ok",
    }


def arcgis_layer(url, item_id, sid, publisher, *, where="1=1", period=None, notes=()):
    """Count-checked pagination; retain source dates instead of catalog edit dates."""
    item_path = fetch(ITEM + item_id, params={"f": "json"}, timeout=60)
    item = json.loads(item_path.read_text())
    layer_path = fetch(url, params={"f": "json"}, timeout=60)
    layer = json.loads(layer_path.read_text())
    if "error" in layer:
        raise ValueError(f"ArcGIS layer error: {url}: {layer['error']}")
    count_path = fetch(url + "/query", params={"f": "json", "where": where, "returnCountOnly": "true"}, timeout=60)
    count = json.loads(count_path.read_text())["count"]
    if not 0 < count <= 100000:
        raise ValueError(f"Unexpected record count {count}: {url}")
    oid = next(f["name"] for f in layer["fields"] if f["type"] == "esriFieldTypeOID")
    rows, paths = [], [item_path, layer_path, count_path]
    while len(rows) < count:
        path = fetch(url + "/query", params={"f": "geojson", "where": where, "outFields": "*", "outSR": 4326,
                                             "orderByFields": oid, "resultOffset": len(rows), "resultRecordCount": 1000}, timeout=90)
        page = json.loads(path.read_text()).get("features", [])
        if not page:
            raise ValueError(f"Incomplete ArcGIS download {len(rows)}/{count}: {url}")
        rows.extend(page)
        paths.append(path)
    if len(rows) != count or len({r['properties'][oid] for r in rows}) != count:
        raise ValueError(f"Duplicate or changed ArcGIS records: {url}")
    last_edit = layer.get("editingInfo", {}).get("dataLastEditDate")
    release = date_ms(last_edit) if last_edit else None
    snapshot = f"Snapshot retrieved {max(meta_for(p)['retrievedAt'] for p in paths)[:10]}"
    source = source_record(sid, item["title"], publisher, f"https://www.arcgis.com/home/item.html?id={item_id}", url + "/query",
                           paths, period or (f"Dataset updated {release}" if release else snapshot), release=release,
                           notes=[*notes, "Catalogue item modified dates are not treated as data update dates."],
                           transformations=[f"Select {where}; download all {count} features; retain original geometry for calculations."])
    return rows, source


def read_census(text):
    rows = list(csv.reader(io.StringIO(text)))
    names = [n.strip() for n in rows[0][1:]]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate neighbourhood census columns")
    result = {name: {} for name in names}
    occurrences = {}
    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        if len(row) != len(names) + 1:
            raise ValueError(f"Unexpected census row width: {row[0]}")
        label = row[0].strip()
        occurrence = occurrences.get(label, 0)
        occurrences[label] = occurrence + 1
        for name, raw in zip(names, row[1:]):
            result[name][(label, occurrence)] = number(raw)
    return result


def census_source(item_id, sid):
    metadata_path = fetch(ITEM + item_id, params={"f": "json"}, timeout=60)
    metadata = json.loads(metadata_path.read_text())
    path = fetch(ITEM + item_id + "/data", timeout=90)
    data = read_census(path.read_text(encoding="cp1252"))
    source = source_record(sid, metadata["title"], "City of Victoria / Statistics Canada", f"https://www.arcgis.com/home/item.html?id={item_id}",
                           ITEM + item_id + "/data", [path, metadata_path], "2021", release=date_ms(metadata["created"]),
                           notes=["Special census tabulation prepared with the Capital Regional District. The publisher includes Harris Green in Downtown and combines North and South Jubilee.",
                                  "Release date is the catalogue publication date. Counts are randomly rounded; the 25% sample carries sampling uncertainty."],
                           transformations=["Parse the publisher's named columns; sum counts for boundary-safe comparison areas. Recompute proportions from counts; do not average medians."],
                           licence="Statistics Canada Open Licence; City of Victoria Open Data Licence")
    return data, source


def comparison_metrics(short, long, members):
    def get(data, label):
        return total(data[name][(label, 0)] for name in members)
    households = get(short, "Total - Private households by household size - 100% data")
    population = get(short, "Total - Age groups of the population - 100% data")
    commute = get(long, "Total - Main mode of commuting for the employed labour force aged 15 years and over with a usual place of work or no fixed workplace address - 25% sample data")
    values = {
        "population": population, "households": households,
        "children": ratio(get(short, "0 to 14 years"), population),
        "householdSize": ratio(get(short, "Number of persons in private households"), households, 1, 2),
        "livingAlone": ratio(get(short, "1 person"), households),
        "apartments": ratio(total([get(short, "Apartment in a building that has fewer than five storeys"), get(short, "Apartment in a building that has five or more storeys")]), get(short, "Total - Occupied private dwellings by structural type of dwelling - 100% data")),
        "renters": ratio(get(long, "Renter"), get(long, "Total - Private households by tenure - 25% sample data")),
        "tenantShelter": get(long, "Median monthly shelter costs for rented dwellings ($)") if len(members) == 1 else None,
        "transit": ratio(get(long, "Public transit"), commute),
        "walkCycle": ratio(total([get(long, "Walked"), get(long, "Bicycle")]), commute),
    }
    result = {k: cell(v) for k, v in values.items()}
    if len(members) > 1:
        result["tenantShelter"] = cell(None, "A median for this combined area cannot be calculated from the published neighbourhood medians.")
    return result


def read_gtfs(path):
    with zipfile.ZipFile(path) as z:
        stops = list(csv.DictReader(io.TextIOWrapper(z.open("stops.txt"), encoding="utf-8-sig")))
        info = next(csv.DictReader(io.TextIOWrapper(z.open("feed_info.txt"), encoding="utf-8-sig")))
    unique = {}
    for r in stops:
        if r.get("location_type", "") not in {"", "0"}:
            continue
        sid = r["stop_id"]
        if sid in unique:
            raise ValueError(f"Duplicate bus stop ID {sid}")
        unique[sid] = {"id": sid, "name": r["stop_name"], "lon": float(r["stop_lon"]), "lat": float(r["stop_lat"])}
    return list(unique.values()), info


def spatial_metrics(records, parks, stops, amenities, *, crs, park_source, stop_source, amenity_source):
    project = Transformer.from_crs(4326, crs, always_xy=True).transform
    unproject = Transformer.from_crs(crs, 4326, always_xy=True).transform
    projected = lambda geometry: transform(make_valid(shape(geometry)), project, interleaved=False)
    park_shapes = [projected(p["geometry"]) for p in parks]
    tree = STRtree(park_shapes)
    stop_points = [transform(Point(s["lon"], s["lat"]), project, interleaved=False) for s in stops]
    amenity_points = [projected(a["geometry"]) for a in amenities]
    for record in records:
        geometry = projected(record["geometry"])
        if geometry.area <= 0:
            raise ValueError(f"Empty comparison area {record['id']}")
        nearby = [int(i) for i in tree.query(geometry, predicate="intersects") if geometry.intersection(park_shapes[int(i)]).area > 1]
        area = geometry.intersection(unary_union([park_shapes[i] for i in nearby])).area if nearby else 0
        names = {parks[i]["id"]: parks[i]["name"] for i in nearby}
        stations = []
        for stop, point in zip(stops, stop_points):
            distance = geometry.distance(point)
            if distance <= 800:
                stations.append({**stop, "distanceToBoundaryM": round(distance)})
        selected = [a for a, pt in zip(amenities, amenity_points) if geometry.covers(pt)]
        record["metrics"].update(parkland=cell(round(100 * min(area, geometry.area) / geometry.area, 1)), parks=cell(len(names)), busStops=cell(len(stations)),
                                 communityCentres=cell(sum(a["category"] == "Community centre" for a in selected)))
        record["parks"] = sorted(names.values())
        # The v1 stations lists are reserved for rail. Bus access is a separately
        # sourced metric; do not silently relabel bus stops as rail stations.
        record["stations"] = []
        record["amenities"] = sorted(({"name": a["name"], "category": a["category"], "sourceId": amenity_source} for a in selected), key=lambda a: (a['category'], a['name']))
        record["geometry"] = mapping(orient_polygons(transform(geometry.simplify(5, preserve_topology=True), unproject, interleaved=False), exterior_cw=True))
    return []


def definition(label, unit, source, note, scope, period="2021"):
    return {"label": label, "unit": unit, "sourceId": source, "period": period, "note": note, "geographicScope": scope}


def build():
    short, ss = census_source("804bf4a2fd1346da92e631e43f2288c2", "victoria-census-2021-short")
    long, ls = census_source("5eaa36372a7646d2945abfb4c3ea7828", "victoria-census-2021-long")
    members = {name for names in GROUPS.values() for name in names}
    if set(short) != members or set(long) != members:
        raise ValueError("Victoria census geography changed; reassess the comparison-area crosswalk")
    bounds, bs = arcgis_layer(LAND, "6aede472420644c98a80f1f8e2ebfce9", "victoria-neighbourhood-boundaries", "City of Victoria")
    bs['notes'].append("Geometry is a current municipal snapshot, not an archived 2021 vertex file. Comparison-area unions address the documented 2022 transfers; historical vertex identity has not been independently verified.")
    boundaries = {("Burnside/Gorge" if f["properties"]["Neighbourhood"] == "Burnside" else f["properties"]["Neighbourhood"]): shape(f["geometry"]) for f in bounds}
    if set(boundaries) != members:
        raise ValueError("Victoria boundary names changed; reassess the comparison-area crosswalk")
    change_path = fetch(CHANGES, timeout=60)
    changes = source_record("victoria-boundary-decisions-2022", "Neighbourhood Boundaries: Council decisions effective June 9, 2022", "City of Victoria", CHANGES, CHANGES,
                             [change_path], "2022-06-09", notes=["Downtown absorbed Harris Green and one Fairfield block; the east side of Shelbourne Street (2700–3000 blocks) moved from Jubilee to Oaklands."],
                             transformations=["Combine Downtown with Fairfield and Oaklands with Jubilee so the transferred blocks remain inside their comparison area."])
    scope = "City of Victoria only: eight neighbourhoods and two explicitly combined comparison areas; excludes other Greater Victoria municipalities."
    defs = {
        "population": definition("Population", "persons", ss['id'], "2021 total population from the city's special census tabulation; rounded counts summed for combined areas.", scope),
        "households": definition("Private households", "count", ss['id'], "2021 private households; rounded counts summed for combined areas.", scope),
        "children": definition("Children under 15", "percent", ss['id'], "People aged 0–14 divided by total population; calculated from 100% census counts.", scope),
        "householdSize": definition("Average household size", "persons", ss['id'], "People in private households divided by private households. Calculated from counts because the city's published averages are rounded to whole persons.", scope),
        "livingAlone": definition("One-person households", "percent", ss['id'], "One-person households divided by all private households; 100% census counts.", scope),
        "apartments": definition("Homes in apartment buildings", "percent", ss['id'], "Occupied dwellings in buildings with fewer than five or five-plus storeys divided by all occupied dwellings; duplexes excluded.", scope),
        "renters": definition("Households renting", "percent", ls['id'], "Renter households divided by private households by tenure; 25% census sample, rounded counts.", scope),
        "tenantShelter": definition("Median tenant shelter cost", "CAD_month", ls['id'], "2021 monthly costs of occupied rentals, including utilities where applicable; all sizes, 25% sample. Not current asking rents. Combined-area medians are unavailable.", scope),
        "transit": definition("Commutes by public transit", "percent", ls['id'], "Employed people 15+ with a usual workplace or no fixed workplace; excludes working at home. 25% sample; May 2021 pandemic conditions.", scope),
        "walkCycle": definition("Commutes on foot or by bike", "percent", ls['id'], "Walking plus cycling among the same commuting population; excludes working at home. 25% sample; pandemic-era travel.", scope),
    }
    parks_raw, ps = arcgis_layer(PARKS, "6aa80a4df66144cf839447040f519de4", "victoria-parks-open-spaces", "City of Victoria", where="ParkClassCode NOT IN ('SC','SCH','CE')",
                                notes=["Inventory includes parks, beaches, docks, squares, pathways and green spaces. Schools and cemeteries are excluded. Not all green space or tree canopy."])
    park_groups = {}
    for feature in parks_raw:
        p = feature['properties']
        name = p.get('Park_Name') or p.get('Alias_Name') or f"Unnamed open space {p['OBJECTID']}"
        park_groups.setdefault(name, []).append(shape(feature['geometry']))
    parks = [{"id": name, "name": name, "geometry": mapping(unary_union(geoms))} for name, geoms in park_groups.items()]
    facilities, fs = arcgis_layer(FACILITIES, "36ce9ffd00124fd495bb6710b83451b5", "victoria-community-facilities", "City of Victoria")
    amenities = [{"name": f['properties']['FacilityName'], "category": "Community centre" if f['properties']['Type'] == 'Community Centre' else f['properties']['Type'], "geometry": f['geometry']} for f in facilities]
    gtfs_path = fetch(GTFS, timeout=120)
    stops, feed = read_gtfs(gtfs_path)
    period = f"Feed {feed['feed_start_date'][:4]}-{feed['feed_start_date'][4:6]}-{feed['feed_start_date'][6:]} to {feed['feed_end_date'][:4]}-{feed['feed_end_date'][4:6]}-{feed['feed_end_date'][6:]}"
    ts = source_record("victoria-bc-transit-stops", "Victoria Regional Transit System static GTFS: bus stops", "BC Transit", "https://www.bctransit.com/open-data/", GTFS,
                       [gtfs_path], period, licence="BC Transit Open Data Terms of Use", notes=[f"Feed version: {feed['feed_version']}. Stops are inventory locations, not a frequency or accessibility score."],
                       transformations=["Read boarding stops from stops.txt; deduplicate by stop_id. Count stops within 800 m of City of Victoria comparison-area polygons; rail-only station lists remain empty."])
    defs.update({
        "parkland": definition("Mapped park and open-space area", "percent", ps['id'], "Union of included park/open-space polygons intersecting the area, divided by total polygon area; overlaps counted once. Schools and cemeteries excluded.", scope, ps['referencePeriod']),
        "parks": definition("Parks and open-space sites", "count", ps['id'], "Distinct published park names with more than 1 m² inside the boundary; multipart records with the same name are combined. A site spanning areas can appear in both.", scope, ps['referencePeriod']),
        "busStops": definition("Bus stops in or near the area", "count", ts['id'], "Distinct stop IDs inside or within 800 m of the polygon. Straight-line distance to the area, not a walking distance from a home or service frequency.", scope, period),
        "communityCentres": definition("Mapped community centres", "count", fs['id'], "City inventory points classified Community Centre inside the area; boundary points may appear in both adjacent areas. Other mapped civic facilities appear in the amenities list.", scope, fs['referencePeriod']),
    })
    records = [{"id": slug(name), "name": name + (" (combined area)" if len(names) > 1 else ""), "geometry": mapping(unary_union([boundaries[n] for n in names])),
                "metrics": comparison_metrics(short, long, names), "quality": {"censusGeography": " + ".join(names), "boundaryAlignment": "Combined across the 2022 internal boundary transfer" if len(names) > 1 else "Unaffected by the documented 2022 boundary transfers"}} for name, names in GROUPS.items()]
    map_stops = spatial_metrics(records, parks, stops, amenities, crs=3157, park_source=ps['id'], stop_source=ts['id'], amenity_source=fs['id'])
    sources = [bs, ss, ls, changes, ps, fs, ts]
    for r in records:
        v = {key: metric['value'] for key, metric in r['metrics'].items()}
        housing = f"In 2021, this area had {shown(v['households'])} private households. The share of occupied homes in apartment buildings, excluding duplexes, was {shown(v['apartments'], '.1f')}%; the share of households renting was {shown(v['renters'], '.1f')}%."
        housing += f" Median tenant shelter cost was ${v['tenantShelter']:,.0f} a month for occupied rentals, not today's asking rent." if v['tenantShelter'] is not None else " A combined median tenant shelter cost cannot be recovered from the component neighbourhood medians."
        park_examples = ", ".join(r['parks'][:4])
        facility_examples = ", ".join(a['name'] for a in r['amenities'][:4])
        r['description'] = {"verifiedAt": max(s['retrievedAt'] for s in sources)[:10], "sections": [
            {"heading": "People and households", "kind": "measured", "sourceIds": [ss['id']], "text": f"The 2021 census counted {shown(v['population'])} people in this comparison area. The share of residents under 15 was {shown(v['children'], '.1f')}%; the share of one-person households was {shown(v['livingAlone'], '.1f')}%. The calculated average was {shown(v['householdSize'], '.2f')} people per household."},
            {"heading": "Housing", "kind": "measured", "sourceIds": [ss['id'], ls['id']], "text": housing},
            {"heading": "Parks and everyday facilities", "kind": "measured", "sourceIds": [ps['id'], fs['id']], "text": f"The municipal inventory maps {v['parks']:.0f} park and open-space sites overlapping the area, covering {v['parkland']:.1f}% of its polygon." + (f" Examples include {park_examples}." if park_examples else "") + (f" Mapped civic facilities inside the area include {facility_examples}." if facility_examples else " The city's facilities layer has no listed civic facility point inside this area; this is an inventory result, not a claim that all amenities are absent.")},
            {"heading": "Getting around and interpreting the area", "kind": "measured", "sourceIds": [ls['id'], ts['id'], bs['id'], changes['id']], "text": f"In the 2021 commuting sample, the public-transit share was {shown(v['transit'], '.1f')}% and the walking/cycling share was {shown(v['walkCycle'], '.1f')}%; people working at home are excluded. The current GTFS snapshot lists {v['busStops']:.0f} bus-stop IDs inside or within 800 m of the boundary, which does not measure frequency or walking access from a particular home. " + ("This comparison area combines adjacent neighbourhoods to keep the census counts aligned across the 2022 internal boundary change." if 'combined area' in r['name'] else "This is a City of Victoria neighbourhood; the profile does not cover similarly named areas elsewhere in Greater Victoria.")},
        ]}
    return {"schemaVersion": 1, "placeId": "victoria", "cityName": "Victoria", "areaType": "comparison area", "boundarySourceId": bs['id'],
            "boundaryVintage": "Municipal snapshot; 2022 boundary transfers neutralized by comparison-area unions",
            "boundaryNote": "City of Victoria only. Eight individual neighbourhoods plus Downtown/Fairfield and Oaklands/Jubilee combined areas. Harris Green is included in Downtown; North and South Jubilee are together. Current municipal geometry is used: the unions address the documented June 2022 transfers, but this is not an archived 2021 vertex file and historical vertex identity has not been independently verified.",
            "coverageNote": "Ten comparison areas cover the City's twelve current neighbourhoods. This is not Greater Victoria. 2021 census measures are historical; parks, facilities and bus stops use separately dated snapshots. Combined-area median shelter costs remain missing.",
            "definitions": defs, "sources": sources,
            "neighbourhoods": sorted(records, key=lambda n: n['name']), "stations": map_stops,
            "links": {"hoodmaps": "https://hoodmaps.com/victoria-neighborhood-map", "reddit": "https://www.reddit.com/r/VictoriaBC/", "profiles": "https://www.victoria.ca/community-culture/neighbourhoods"}}


if __name__ == "__main__":
    bundle = build()
    out = PROCESSED / "neighbourhoods" / "victoria.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Victoria: {len(bundle['neighbourhoods'])} comparison areas; {out.stat().st_size // 1024} KiB")
