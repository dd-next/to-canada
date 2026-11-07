"""Toronto's 2021 158-neighbourhood profiles and dated municipal inventories.

Run: PYTHONPATH=pipeline python pipeline/neighbourhoods/toronto.py
Only writes data/processed/neighbourhoods/toronto.json. Raw inputs are cached.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

import openpyxl
from pyproj import Transformer
from shapely import make_valid, orient_polygons, transform
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import PROCESSED
from common.fetch import fetch, meta_for

HOST = "https://ckan0.cf.opendata.inter.prod-toronto.ca"
PROJECT = Transformer.from_crs(4326, 2952, always_xy=True).transform
UNPROJECT = Transformer.from_crs(2952, 4326, always_xy=True).transform
PROFILE_ID = "toronto-2021-neighbourhood-profiles"
BOUNDARY_ID = "toronto-158-neighbourhoods"
PARK_ID = "toronto-green-spaces"
TRANSPORT_ID = "toronto-ttc-merged-gtfs"
LIBRARY_ID = "toronto-library-branches"
RECREATION_ID = "toronto-recreation-facilities"

# Excel row numbers are intentional: repeated labels such as '0 to 14 years'
# occur in both count and percentage sections. Check the exact label as well.
CELLS = {
    "population": (37, "Total - Persons in private households - 25% sample data"),
    "children_count": (5, "  0 to 14 years"),
    "age_total": (4, "Total - Age groups of the population - 25% sample data"),
    "dwellings": (217, "Total - Occupied private dwellings by structural type of dwelling - 25% sample data"),
    "detached_count": (218, "  Single-detached house"),
    "low_apartments": (222, "  Apartment in a building that has fewer than five storeys"),
    "high_apartments": (223, "  Apartment in a building that has five or more storeys"),
    "households": (226, "Total - Private households by household size - 25% sample data"),
    "one_person": (227, "  1 person"),
    "householdSize": (232, "Average household size"),
    "tenure_total": (300, "Total - Private households by tenure - 25% sample data"),
    "renter_count": (302, "  Renter"),
    "tenantShelter": (380, "  Median monthly shelter costs for rented dwellings ($)"),
    "commuters": (2576, "Total - Main mode of commuting for the employed labour force aged 15 years and over with a usual place of work or no fixed workplace address - 25% sample data"),
    "transit_count": (2580, "  Public transit"),
    "walking_count": (2581, "  Walked"),
    "cycling_count": (2582, "  Bicycle"),
    "occupation_total": (2221, "  All occupations"),
}
OCCUPATION_LABELS = (
    "Legislative and senior management occupations",
    "Business, finance and administration occupations",
    "Natural and applied sciences and related occupations",
    "Health occupations",
    "Occupations in education, law and social, community and government services",
    "Occupations in art, culture, recreation and sport",
    "Sales and service occupations",
    "Trades, transport and equipment operators and related occupations",
    "Natural resources, agriculture and related production occupations",
    "Occupations in manufacturing and utilities",
)
for _code, _label in enumerate(OCCUPATION_LABELS):
    CELLS[f"occupation_{_code}"] = (2222 + _code, f"    {_code} {_label}")


def number(value):
    if value is None or str(value).strip().lower() in {"", "x", "f", "..", "...", "**", "-"}:
        return None
    result = float(str(value).replace(",", ""))
    if not math.isfinite(result) or result < 0:
        raise ValueError(f"Invalid nonnegative census value: {value!r}")
    return int(result) if result.is_integer() else result


def ratio(part, total):
    return None if part is None or total is None or total <= 0 or part > total else round(100 * part / total, 1)


def sum_known(*values):
    return None if any(v is None for v in values) else sum(values)


def cell(value):
    return {"value": value, **({"missingReason": "Not published or suppressed, or derived share unavailable: an input is missing, the denominator is zero, or rounded component counts exceed the published total."} if value is None else {})}


def normalized_name(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def parse_profile_rows(rows, expected_count=158):
    if rows[0][0] != "Neighbourhood Name" or rows[1][0] != "Neighbourhood Number":
        raise ValueError("Unexpected Toronto profile headers")
    codes = [str(int(v)) for v in rows[1][1:]]
    if len(codes) != expected_count or len(set(codes)) != len(codes):
        raise ValueError("Expected unique 158-model neighbourhood columns")
    for row_number, label in CELLS.values():
        if rows[row_number - 1][0] != label:
            raise ValueError(f"Profile row {row_number} changed: expected {label!r}")
        if len(rows[row_number - 1]) != len(codes) + 1:
            raise ValueError(f"Incomplete profile row {row_number}")
    profiles = {}
    for column, code in enumerate(codes, 1):
        v = {key: number(rows[row - 1][column]) for key, (row, _) in CELLS.items()}
        metrics = {key: v[key] for key in ("population", "households", "householdSize", "tenantShelter")}
        metrics.update(children=ratio(v["children_count"], v["age_total"]),
                       livingAlone=ratio(v["one_person"], v["households"]),
                       apartments=ratio(sum_known(v["low_apartments"], v["high_apartments"]), v["dwellings"]),
                       detached=ratio(v["detached_count"], v["dwellings"]),
                       renters=ratio(v["renter_count"], v["tenure_total"]),
                       transit=ratio(v["transit_count"], v["commuters"]),
                       walkCycle=ratio(sum_known(v["walking_count"], v["cycling_count"]), v["commuters"]))
        occupations = [{"name": label, "count": v[f"occupation_{i}"], "share": ratio(v[f"occupation_{i}"], v["occupation_total"])} for i, label in enumerate(OCCUPATION_LABELS)]
        profiles[code] = {"name": rows[0][column], "metrics": {k: cell(value) for k, value in metrics.items()}, "occupations": occupations}
    return profiles


def join_boundaries(features, profiles):
    result = []
    codes = [str(int(f["properties"]["AREA_SHORT_CODE"])) for f in features]
    if len(codes) != 158 or len(set(codes)) != 158 or set(codes) != set(profiles):
        raise ValueError("Toronto boundaries and 2021 158-model profile codes do not match")
    for feature, code in zip(features, codes):
        name = feature["properties"]["AREA_NAME"]
        if normalized_name(name) != normalized_name(profiles[code]["name"]):
            raise ValueError(f"Neighbourhood name/vintage mismatch: {code}: {name}")
        result.append({"id": code, "name": name, "geometry": feature["geometry"], "metrics": profiles[code]["metrics"],
                       "quality": {"censusBasis": "2021 Census 25% sample; private households; randomly rounded counts."}})
    return result


def resource(package, resource_name, source_id, *, period=None, notes=(), transformations=(), publisher="City of Toronto"):
    print(f"Reading Toronto/{package}", flush=True)
    metadata_path = fetch(HOST + "/api/3/action/package_show", params={"id": package})
    metadata = json.loads(metadata_path.read_text())["result"]
    matches = [r for r in metadata["resources"] if r["name"] == resource_name]
    if len(matches) != 1:
        raise ValueError(f"Expected one resource: {package}/{resource_name}")
    r = matches[0]
    path = fetch(r["url"])
    release = (r.get("last_modified") or "")[:10]
    source = {"id": source_id, "title": metadata["title"] + " — " + resource_name,
              "publisher": publisher, "tableId": r["id"], "url": f"https://open.toronto.ca/dataset/{package}/",
              "downloadUrl": r["url"], "retrievedAt": meta_for(path)["retrievedAt"],
              "referencePeriod": period or f"Inventory updated {release}",
              "licence": "Open Government Licence – Toronto",
              "attribution": "Contains information licensed under the Open Government Licence – Toronto.",
              "transformations": list(transformations), "notes": ["Retrieval date is not the observation period.", *notes], "status": "ok"}
    if release:
        source["releaseDate"] = release
    return path, source


def station_parent(stop, stops):
    parent = stops.get(stop.get("parent_station"))
    if parent is not None and parent["location_type"] == "1":
        return parent
    # The published feed omits parent_station on Spadina's Line 1 platforms.
    # Recover only an unambiguous named parent nearby; never promote a platform
    # to an additional station or accept an arbitrary nearest station.
    match = re.fullmatch(r"(.+) Station - (?:Northbound|Southbound|Eastbound|Westbound) Platform", stop["stop_name"])
    if match:
        candidates = [s for s in stops.values() if s["location_type"] == "1" and s["stop_name"] == match[1]]
        point = transform(Point(float(stop["stop_lon"]), float(stop["stop_lat"])), PROJECT, interleaved=False)
        if len(candidates) == 1:
            candidate = candidates[0]
            parent_point = transform(Point(float(candidate["stop_lon"]), float(candidate["stop_lat"])), PROJECT, interleaved=False)
            if point.distance(parent_point) <= 500:
                return candidate
    raise ValueError(f"Scheduled subway platform without an unambiguous nearby station: {stop['stop_id']}")


def parse_gtfs(path):
    """Use scheduled trips to distinguish subway platforms from surface stops."""
    with zipfile.ZipFile(path) as archive:
        def rows(name):
            return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding="utf-8-sig"))
        route_modes = {r["route_id"]: r["route_type"] for r in rows("routes.txt")}
        trip_modes = {r["trip_id"]: route_modes[r["route_id"]] for r in rows("trips.txt")}
        used = {mode: set() for mode in ("0", "1", "3")}
        for r in rows("stop_times.txt"):
            mode = trip_modes[r["trip_id"]]
            if mode in used:
                used[mode].add(r["stop_id"])
        stops = {r["stop_id"]: r for r in rows("stops.txt")}
        subway = {}
        for stop_id in sorted(used["1"]):
            stop = stops[stop_id]
            parent = station_parent(stop, stops)
            subway[parent["stop_id"]] = {"id": parent["stop_id"], "name": parent["stop_name"],
                                         "lon": float(parent["stop_lon"]), "lat": float(parent["stop_lat"])}
        surface = {mode: [(sid, Point(float(stops[sid]["stop_lon"]), float(stops[sid]["stop_lat"])))
                          for sid in sorted(used[mode])] for mode in ("0", "3")}
        info = list(rows("feed_info.txt"))[0]
        start = date.fromisoformat(info["feed_start_date"])
        end = date.fromisoformat(info["feed_end_date"])
        period = f"{start.isoformat()} to {end.isoformat()}"
        if not subway:
            raise ValueError("No scheduled subway stations found")
        return sorted(subway.values(), key=lambda s: s["name"]), surface, period


def park_records(features):
    grouped = defaultdict(list)
    names = {}
    for f in features:
        p = f["properties"]
        if p["AREA_CLASS"] != "Park":
            continue
        key = str(p["AREA_LONG_CODE"])
        if key in {"", "None", "null"}:
            raise ValueError("Toronto park has no publisher site identifier")
        grouped[key].append(transform(make_valid(shape(f["geometry"])), PROJECT, interleaved=False))
        name = p["AREA_NAME"].title()
        if key in names and names[key] != name:
            raise ValueError(f"Conflicting park names for site {key}")
        names[key] = name
    if not grouped:
        raise ValueError("No City Park polygons in green-spaces inventory")
    return [{"id": key, "name": names[key], "shape": unary_union(parts)} for key, parts in sorted(grouped.items())]


def point_inventory(features, kind):
    result = {}
    for feature in features:
        p = feature["properties"]
        if kind == "library":
            if p["PhysicalBranch"] != 1:
                continue
            key = str(p["BranchCode"])
            name = p["BranchName"] if p["BranchName"].endswith("Library") else p["BranchName"] + " Library"
        else:
            if p["TYPE"] != "Community Centre":
                continue
            key, name = str(p["LOCATIONID"]), p["ASSET_NAME"].title()
        geometry = shape(feature["geometry"])
        if geometry.geom_type == "MultiPoint" and len(geometry.geoms) == 1:
            geometry = geometry.geoms[0]
        if geometry.geom_type != "Point":
            raise ValueError(f"Expected one location for {kind}/{key}")
        record = {"id": key, "name": name, "address": p.get("Address", p.get("ADDRESS")), "shape": transform(geometry, PROJECT, interleaved=False)}
        if key in result and not result[key]["shape"].equals(record["shape"]):
            raise ValueError(f"Conflicting location for {kind}/{key}")
        result[key] = record
    if not result:
        raise ValueError(f"Empty Toronto {kind} inventory")
    return list(result.values())


def definition(label, unit, source_id, period, note, scope="City of Toronto 158 social planning neighbourhood model introduced in April 2021; spatial inventories use the dated current polygon snapshot"):
    return {"label": label, "unit": unit, "sourceId": source_id, "period": period, "note": note, "geographicScope": scope}


def build():
    boundary_path, boundary_source = resource("neighbourhoods", "Neighbourhoods - 4326.geojson", BOUNDARY_ID,
        period="158-neighbourhood model introduced April 2021",
        transformations=["Exact code and normalized-name join to all 158 columns of the 2021 profile. Historical 140-model resources excluded.", "Original WGS84 geometry projected to EPSG:2952 for calculations; simplified at 12 m for display; clockwise exterior rings."],
        notes=["Social planning areas do not necessarily match colloquial or real-estate neighbourhood names. Dataset update is not the boundary model's vintage.", "The profile publisher states that neighbourhood boundaries are consistent over time. Exact IDs/names establish the same 158-area model; historical polygon vertex identity has not been independently verified. Spatial calculations and map display use this resource's dated published polygon snapshot."])
    profile_path, profile_source = resource("neighbourhood-profiles", "neighbourhood-profiles-2021-158-model", PROFILE_ID, period="2021",
        publisher="City of Toronto / Statistics Canada",
        transformations=["Selected rows from hd2021_census_profile; exact row labels checked to distinguish repeated count/percentage labels.", "Shares calculated from published rounded counts; blank/suppression markers remain null."],
        notes=["This workbook is a 25% sample profile for private households; population excludes collective dwellings.", "Shelter costs are 2021 costs for occupied rented dwellings, not current asking rents.", "Description occupation shares use resident labour force aged 15+ with applicable occupations, not jobs located in the area; NOC 2021 broad groups, workbook rows 2221–2231.", "Adapted from Statistics Canada, 2021 Census of Population. This does not constitute an endorsement by Statistics Canada of this product."])
    workbook = openpyxl.load_workbook(profile_path, read_only=True, data_only=True)
    try:
        profiles = parse_profile_rows(list(workbook["hd2021_census_profile"].values))
    finally:
        workbook.close()
    records = join_boundaries(json.loads(boundary_path.read_text())["features"], profiles)
    park_path, park_source = resource("green-spaces", "Green Spaces - 4326.geojson", PARK_ID,
        transformations=["Keep AREA_CLASS=Park only; dissolve polygon parts by AREA_LONG_CODE; intersect originals in EPSG:2952.", "Park area uses the union of intersecting polygons, so overlapping polygons are not double-counted."],
        notes=["This is a generalized inventory, not every park, ravine or accessible green space. Other green-space classes, golf courses, cemeteries and private lands excluded."])
    library_path, library_source = resource("library-branch-general-information", "tpl-branch-general-information - 4326.geojson", LIBRARY_ID,
        publisher="Toronto Public Library / City of Toronto", transformations=["PhysicalBranch=1 only; deduplicate by BranchCode; spatial point-in-polygon on the 158 boundaries, not legacy NBHDNo fields."],
        notes=["Branch location is not evidence of current hours or uninterrupted service."])
    recreation_path, recreation_source = resource("parks-and-recreation-facilities", "Parks and Recreation Facilities - 4326.geojson", RECREATION_ID,
        transformations=["TYPE=Community Centre only; deduplicate by LOCATIONID; spatial point-in-polygon."],
        notes=["Inventory category includes schools used for recreation, arenas and other recreation buildings; not a count of distinct programs or a live operational status."])
    gtfs_path, transport_source = resource("merged-gtfs-ttc-routes-and-schedules", "Complete GTFS", TRANSPORT_ID,
        publisher="Toronto Transit Commission / City of Toronto",
        transformations=["Join routes to trips and stop_times. Subway route_type=1 platforms collapse to their parent station; bus route_type=3 and tram/light-rail route_type=0 use unique stop IDs.", "Missing subway parent IDs resolve only to a unique exact station-name match within 500 m (Spadina Line 1 platforms in this snapshot).", "Subway stations restricted to Toronto municipal neighbourhood polygons; nearby count is straight-line distance to original boundary, up to 800 m. Surface stops are inside the area."],
        notes=["Subway station count excludes GO, UP Express, streetcar and light-rail stops; those TTC tram/light-rail points have a separate measure. Scheduled locations are not service frequency, journey time, walking distance, or real-time availability."])
    stations, surface, service_period = parse_gtfs(gtfs_path)
    transport_source["referencePeriod"] = service_period
    sources = [boundary_source, profile_source, park_source, library_source, recreation_source, transport_source]
    defs = {}
    census_definitions = {
        "population": ("Population in private households", "persons", "2021 Census 25% sample; excludes collective dwellings. Published counts are randomly rounded."),
        "households": ("Private households", "count", "Total private households by household size; 2021 Census 25% sample, rounded counts."),
        "children": ("Children under 15", "percent", "Share of the population in private households aged 0–14; 2021 Census 25% sample, rounded counts."),
        "householdSize": ("Average household size", "persons", "People per private household; 2021 Census 25% sample."),
        "livingAlone": ("One-person households", "percent", "One-person households divided by all private households; 2021 Census 25% sample, rounded counts."),
        "apartments": ("Homes in apartment buildings", "percent", "Occupied dwellings in buildings below five or five-plus storeys divided by all occupied private dwellings. Duplexes excluded. 2021 Census 25% sample."),
        "detached": ("Single-detached homes", "percent", "Single-detached occupied private dwellings divided by all occupied private dwellings; 2021 Census 25% sample."),
        "renters": ("Households renting", "percent", "Renter households divided by private households by tenure; 2021 Census 25% sample, rounded counts."),
        "tenantShelter": ("Median tenant shelter cost", "CAD_month", "2021 monthly shelter cost for occupied rented dwellings, including utilities where applicable; non-farm, non-reserve tenant households, all dwelling sizes. 25% sample; not current asking rent."),
        "transit": ("Commutes by public transit", "percent", "Among employed people aged 15+ with a usual workplace or no fixed workplace; excludes working at home. 2021 Census 25% sample; pandemic-era travel."),
        "walkCycle": ("Commutes on foot or by bike", "percent", "Same commuting denominator: employed people aged 15+ with a usual workplace or no fixed workplace; excludes working at home. 2021 Census 25% sample; pandemic-era travel."),
    }
    for key, (label, unit, note) in census_definitions.items():
        defs[key] = definition(label, unit, PROFILE_ID, "2021", note)
    defs["parkland"] = definition("Mapped City parkland", "percent", PARK_ID, park_source["releaseDate"], "Share of the neighbourhood covered by the union of Green Spaces polygons classified Park. Excludes other green-space classes; not a measure of tree canopy or every accessible green space.")
    defs["parks"] = definition("City park sites overlapping the area", "count", PARK_ID, park_source["releaseDate"], "Unique AREA_LONG_CODE park sites with more than 1 m² inside the boundary; a park crossing a boundary can appear in both areas.")
    defs["rail"] = definition("TTC subway stations in or near the area", "count", TRANSPORT_ID, service_period, "Scheduled TTC subway parent stations inside Toronto and within 800 m of the neighbourhood polygon, straight-line distance. Excludes GO, UP Express and TTC streetcar/light rail; not walking distance or service frequency.")
    defs["busStops"] = definition("Scheduled TTC bus stops in the area", "count", TRANSPORT_ID, service_period, "Distinct GTFS stop IDs served by bus routes during the published feed period, located within the neighbourhood. Opposite directions can have separate stops; not routes, frequency or service availability at a given hour.")
    defs["tramStops"] = definition("TTC streetcar/light-rail stops in the area", "count", TRANSPORT_ID, service_period, "Distinct GTFS stop IDs served by route_type=0 (tram/light rail), located within the neighbourhood. Opposite directions/platforms can be separate; not a subway station or service-frequency count.")
    defs["libraries"] = definition("Library branches in the area", "count", LIBRARY_ID, library_source["releaseDate"], "Physical Toronto Public Library branches with a mapped point inside or on the boundary. Locations do not establish opening hours or current availability.")
    defs["communityCentres"] = definition("Community/recreation centre sites", "count", RECREATION_ID, recreation_source["releaseDate"], "City inventory points classified Community Centre inside or on the boundary; includes some schools, arenas and recreation buildings. Not a live closure or program inventory.")
    parks = park_records(json.loads(park_path.read_text())["features"])
    park_shapes = [p["shape"] for p in parks]
    park_tree = STRtree(park_shapes)
    libraries = point_inventory(json.loads(library_path.read_text())["features"], "library")
    recreation = point_inventory(json.loads(recreation_path.read_text())["features"], "recreation")
    geometries = [transform(make_valid(shape(r["geometry"])), PROJECT, interleaved=False) for r in records]
    city_geometry = unary_union(geometries)
    stations = [s for s in stations if city_geometry.covers(transform(Point(s["lon"], s["lat"]), PROJECT, interleaved=False))]
    station_points = [transform(Point(s["lon"], s["lat"]), PROJECT, interleaved=False) for s in stations]
    surface_trees = {mode: STRtree([transform(pt, PROJECT, interleaved=False) for _, pt in items]) for mode, items in surface.items()}
    for record, geometry in zip(records, geometries):
        if geometry.area <= 0 or not geometry.is_valid:
            raise ValueError(f"Invalid neighbourhood geometry: {record['id']}")
        selected = [int(i) for i in park_tree.query(geometry, predicate="intersects") if geometry.intersection(park_shapes[int(i)]).area > 1]
        park_area = geometry.intersection(unary_union([park_shapes[i] for i in selected])).area if selected else 0
        record["parks"] = sorted(parks[i]["name"] for i in selected)
        record["stations"] = sorted([{**s, "distanceToBoundaryM": round(geometry.distance(pt))} for s, pt in zip(stations, station_points) if geometry.distance(pt) <= 800], key=lambda s: (s["distanceToBoundaryM"], s["name"]))
        local_libraries = [p for p in libraries if geometry.covers(p["shape"])]
        local_recreation = [p for p in recreation if geometry.covers(p["shape"])]
        record["amenities"] = sorted([{"name": p["name"], "category": "Library", "sourceId": LIBRARY_ID} for p in local_libraries] + [{"name": p["name"], "category": "Community/recreation centre", "sourceId": RECREATION_ID} for p in local_recreation], key=lambda p: (p["category"], p["name"]))
        record["metrics"].update(parkland=cell(round(min(100, 100 * park_area / geometry.area), 1)), parks=cell(len(selected)),
                                 rail=cell(len(record["stations"])), libraries=cell(len(local_libraries)), communityCentres=cell(len(local_recreation)),
                                 busStops=cell(len(surface_trees["3"].query(geometry, predicate="covers"))), tramStops=cell(len(surface_trees["0"].query(geometry, predicate="covers"))))
        record["geometry"] = json.loads(json.dumps(mapping(orient_polygons(transform(geometry.simplify(12, preserve_topology=True), UNPROJECT, interleaved=False), exterior_cw=True))))
    add_descriptions(records, sources, profiles, libraries + recreation)
    return {"schemaVersion": 1, "placeId": "toronto", "cityName": "Toronto", "boundarySourceId": BOUNDARY_ID,
            "boundaryVintage": "158-area model (April 2021); polygon snapshot " + boundary_source["releaseDate"], "boundaryNote": "City of Toronto's 158 social planning neighbourhood model introduced in April 2021, joined by code and name to the 2021 158-model census profile. The publisher describes these boundaries as consistent over time. Calculations and display use the published polygon snapshot updated " + boundary_source["releaseDate"] + "; exact historical vertex identity has not been independently verified. These are municipal planning areas, not the Toronto CMA or colloquial real-estate districts.",
            "coverageNote": "City of Toronto only; excludes Mississauga, Brampton, Vaughan and other GTA municipalities. Census covers private households in 2021 (25% sample). Parks, amenities and scheduled transport are separately dated inventories. Subway count excludes GO/UP Express; TTC streetcar/light-rail and bus stops have separate measures. No current neighbourhood asking-rent or safety ranking is supplied.",
            "transportLabel": "TTC subway stations", "definitions": defs, "sources": sources,
            "neighbourhoods": sorted(records, key=lambda r: r["name"]), "stations": stations,
            "links": {"hoodmaps": "https://hoodmaps.com/toronto-neighborhood-map", "reddit": "https://www.reddit.com/r/toronto/", "profiles": "https://www.toronto.ca/city-government/data-research-maps/neighbourhoods-communities/neighbourhood-profiles/"}}


def add_descriptions(records, sources, profiles, locations):
    """Ten curated areas; numerical prose is regenerated from the measured bundle."""
    config_path = Path(__file__).with_name("fixtures") / "toronto" / "descriptions.json"
    if not config_path.exists():
        raise ValueError("Toronto's reviewed description source is missing")
    configurations = json.loads(config_path.read_text())
    source_map = {s["id"]: s for s in sources}
    verified = max(s["retrievedAt"] for s in sources)[:10]
    by_id = {r["id"]: r for r in records}
    addresses = {location["name"]: location["address"] for location in locations}
    for code, config in configurations.items():
        r = by_id[code]
        if r["name"] != config["name"]:
            raise ValueError(f"Description geography changed: {code}")
        for name, expected_address in config["addresses"].items():
            if addresses.get(name) != expected_address:
                raise ValueError(f"Description source address changed: {name}")
        v = {k: c["value"] for k, c in r["metrics"].items()}
        if any(v[k] is None for k in ("apartments", "renters", "tenantShelter", "population", "households", "householdSize", "livingAlone", "children", "transit", "walkCycle")):
            raise ValueError(f"Description requires unavailable census inputs: {code}")
        park_names = config["parks"]
        if not set(park_names) <= set(r["parks"]):
            raise ValueError(f"Description park is outside {r['name']}: {park_names}")
        names = "; ".join(park_names)
        amenity_names = config["amenities"]
        if not set(amenity_names) <= {a["name"] for a in r["amenities"]}:
            raise ValueError(f"Description amenity is outside {r['name']}: {amenity_names}")
        station_names = ", ".join(s["name"] for s in r["stations"][:4])
        rail_text = (f"The scheduled subway inventory places {v['rail']} stations inside or within 800 m of this area's boundary, including {station_names}." if station_names else "No scheduled TTC subway station is inside or within 800 m of this area's boundary in this inventory.")
        amenity_text = ("Mapped public amenities inside the planning area include " + "; ".join(amenity_names) + "." if amenity_names else "The inventory does not place a physical library or community/recreation centre point inside this planning area; nearby services across its boundary are not counted.")
        occupations = profiles[code]["occupations"]
        if any(o["share"] is None for o in occupations):
            raise ValueError(f"Description cannot rank incomplete occupation groups: {code}")
        leading = sorted(occupations, key=lambda o: (-o["count"], o["name"]))[:3]
        occupation_text = "; ".join(f"{o['name'].lower()} ({o['share']:.1f}%)" for o in leading)
        r["description"] = {"verifiedAt": verified, "sections": [
            {"heading": "Everyday setting", "kind": "editorial", "sourceIds": [BOUNDARY_ID, PROFILE_ID, PARK_ID, LIBRARY_ID, RECREATION_ID], "text": config["everyday"]},
            {"heading": "Housing and renting", "kind": "measured", "sourceIds": [PROFILE_ID],
             "text": f"In the 2021 Census sample for {r['name']}, {v['apartments']:.1f}% of occupied homes were in apartment buildings (excluding duplexes) and {v['renters']:.1f}% of households rented. The median monthly shelter cost for occupied rented dwellings was ${v['tenantShelter']:,.0f}, including utilities where applicable. This is a historical cost across dwelling sizes, not a budget for a new rental today."},
            {"heading": "Households and residents", "kind": "measured", "sourceIds": [PROFILE_ID],
             "text": f"The profile counted about {v['population']:,.0f} people in private households and {v['households']:,.0f} households, averaging {v['householdSize']:.1f} people each. One-person households made up {v['livingAlone']:.1f}% of households; children under 15 accounted for {v['children']:.1f}% of residents in private households. These describe the area's residents, not its daytime visitors or a claim that every street has the same household mix."},
            {"heading": "Resident work profile", "kind": "measured", "sourceIds": [PROFILE_ID],
             "text": f"The three largest broad occupation groups among residents in the 2021 labour force with an applicable occupation were {occupation_text}. These shares use the census's All occupations total for residents aged 15 and over (25% sample), excluding the Occupation — not applicable category. They describe residents' occupations, not employers, job vacancies or the industries located in {r['name']}; these figures do not identify where residents work."},
            {"heading": "Parks and public amenities", "kind": "measured", "sourceIds": [PARK_ID, LIBRARY_ID, RECREATION_ID],
             "text": f"City park polygons overlapping this area include {names}. The mapped Park class covers {v['parkland']:.1f}% of the planning area's polygon; ravines and other green-space classes can be excluded from that measure. {amenity_text} Park, library and recreation snapshots were last updated {source_map[PARK_ID]['releaseDate']}, {source_map[LIBRARY_ID]['releaseDate']} and {source_map[RECREATION_ID]['releaseDate']}, respectively; check the facility's own listing for hours and programs."},
            {"heading": "Getting around", "kind": "measured", "sourceIds": [TRANSPORT_ID, PROFILE_ID],
             "text": f"{rail_text} The feed period is {source_map[TRANSPORT_ID]['referencePeriod']}. It also locates {v['busStops']} TTC bus stop IDs and {v['tramStops']} streetcar/light-rail stop IDs inside the area; opposite directions can be counted separately. In the pandemic-era 2021 Census, {v['transit']:.1f}% of commuting residents used public transit and {v['walkCycle']:.1f}% walked or cycled, excluding people working at home."},
            {"heading": "Practical considerations", "kind": "editorial", "sourceIds": [BOUNDARY_ID, PROFILE_ID, PARK_ID, TRANSPORT_ID],
             "text": config["practical"] + " Treat the 800 m station measure as a distance to the neighbourhood boundary, not a walk from a particular home. Compare the actual address, current rental listings and a trip at the time you would travel before deciding."},
        ]}


def main():
    bundle = build()
    out = PROCESSED / "neighbourhoods" / "toronto.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Toronto: {len(bundle['neighbourhoods'])} neighbourhoods; {out.stat().st_size // 1024} KiB")


if __name__ == "__main__":
    main()
