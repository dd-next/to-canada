"""Québec City's 35 administrative neighbourhoods and official 2021 profiles.

Run directly to write only data/processed/neighbourhoods/quebec-city.json.
Requires pdftotext; all downloads use the shared immutable-by-default raw cache.
See docs/neighbourhoods/quebec-city.md for geography and coverage limitations.
"""
from __future__ import annotations

import csv
import html
import io
import json
import math
import re
import subprocess
import sys
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import PROCESSED
from common.fetch import fetch, meta_for
from pyproj import Transformer
from shapely import orient_polygons, transform
from shapely.geometry import Point, mapping, shape

INDEX_URL = "https://www.ville.quebec.qc.ca/apropos/portrait/quelques_chiffres/quartiers/index.aspx"
CKAN = "https://www.donneesquebec.ca/recherche/api/3/action/package_show"
BOUNDARY_URL = "https://www.donneesquebec.ca/recherche/dataset/5b1ae6f2-6719-46df-bd2f-e57a7034c917/resource/436c85aa-88d9-4e57-9095-b72b776a71a0/download/vdq-quartier.geojson"
FACILITY_URL = "https://www.donneesquebec.ca/recherche/dataset/daa10606-5fdd-4c9b-b5ef-235081690b6e/resource/8902c982-bbb6-4e84-814a-550d094c0bae/download/vdq-lieupublic.geojson"
GTFS_URL = "https://cdn.rtcquebec.ca/Site_Internet/DonneesOuvertes/googletransit.zip"
LAW_URL = "https://reglements.ville.quebec.qc.ca/fr/document/rc/R.R.V.Q.chapitreD-8"
LAW_2020 = "https://reglements.ville.quebec.qc.ca/fr/document/an/R.V.Q.2301/"
LAW_2026 = "https://reglements.ville.quebec.qc.ca/fr/document/an/R.V.Q.3519/"
ANNEX_2020 = "https://reglements.ville.quebec.qc.ca/fr/ressource/ra/R.V.Q.2301_FR_001_0001.pdf"
ANNEX_2026 = "https://reglements.ville.quebec.qc.ca/fr/ressource/ra/R.V.Q.3519_FR_001_0001.pdf"
BOUNDARY_ID = "quebec-city-quartiers"
CENSUS_ID = "quebec-city-profiles-2021"
PARK_ID = "quebec-city-selected-park-sites"
FACILITY_ID = "quebec-city-lieux-publics"
BUS_ID = "quebec-city-rtc-gtfs"
PROJECT = Transformer.from_crs(4326, 32187, always_xy=True).transform
UNPROJECT = Transformer.from_crs(32187, 4326, always_xy=True).transform

# Explicit publisher-ID crosswalk, checked against names as well as PDF codes.
# The generic Quartier names remain the publisher's official map labels.
AREAS = {
    1: ("1-3", "Saint-Jean-Baptiste"),
    2: ("3-7", "Cap-Rouge"),
    3: ("3-2", "Cité-Universitaire"),
    4: ("1-1", "Vieux-Québec—Cap-Blanc—Colline parlementaire"),
    5: ("6-4", "Des Châtels"),
    6: ("2-2", "Duberger—Les Saules"),
    7: ("3-6", "L'Aéroport"),
    8: ("6-1", "Lac-Saint-Charles"),
    9: ("1-7", "Lairet"),
    10: ("1-9", "Vieux-Limoilou"),
    11: ("6-3", "Loretteville"),
    12: ("1-8", "Maizerets"),
    13: ("1-4", "Montcalm"),
    14: ("2-1", "Neufchatel Est—Lebourgneuf"),
    15: ("4-1", "Notre-Dame-des-Laurentides"),
    16: ("3-4", "Plateau"),
    17: ("3-3", "Saint-Louis"),
    18: ("3-5", "Pointe-de-Sainte-Foy"),
    19: ("4-2", "Orsainville"),
    20: ("4-3", "Quartier 4-3"),
    21: ("4-4", "Jésuites"),
    22: ("4-5", "Quartier 4-5"),
    23: ("4-6", "Quartier 4-6"),
    24: ("5-1", "Sainte-Thérèse-de-Lisieux"),
    25: ("5-2", "Saint-Michel"),
    26: ("5-3", "Chutes-Montmorency"),
    27: ("5-4", "Vieux-Bourg"),
    28: ("6-2", "Saint-Émile"),
    29: ("1-6", "Saint-Sacrement"),
    30: ("1-2", "Saint-Roch"),
    31: ("1-5", "Saint-Sauveur"),
    32: ("3-1", "Sillery"),
    33: ("6-5", "Val-Bélair"),
    34: ("2-3", "Vanier"),
    35: ("5-5", "Vieux-Moulin"),
}
PARK_TYPES = {"Parcs écoles", "Parc canin", "Parcs linéaires"}
NUMBER = r"(?:\d[\d ]*(?:,\d+)?|[xXFf]|\.{2,3}|[—–-]|\*\*)"


def normalized(text):
    return " ".join(unicodedata.normalize("NFC", text).replace("’", "'").split())


def number(raw):
    value = normalized(str(raw)) if raw is not None else ""
    if value.casefold() in {"", "x", "f", "..", "...", "-", "—", "–", "**"}:
        return None
    parsed = float(value.replace(" ", "").replace(",", "."))
    if not math.isfinite(parsed) or parsed < 0:
        raise ValueError(f"Invalid non-negative source value: {raw!r}")
    return int(parsed) if parsed.is_integer() else parsed


def cell(value):
    return {"value": value, **({"missingReason": "The official profile marks this observation as missing or suppressed."} if value is None else {})}


def profile_links(html):
    result = {}
    for href in re.findall(r"href=[\"']([^\"']+)[\"']", html):
        match = re.search(r"/(\d-\d)_[^/]+_Portrait_Octobre_2026\.pdf$", href)
        if match:
            code = match.group(1)
            if code in result:
                raise ValueError(f"Duplicate neighbourhood profile {code}")
            result[code] = urljoin(INDEX_URL, href)
    if set(result) != {code for code, _ in AREAS.values()}:
        raise ValueError("Expected exactly the 35 October 2026 neighbourhood profiles")
    return result


def extract_pdf(path):
    return subprocess.run(
        ["pdftotext", "-layout", "-f", "1", "-l", "7", str(path), "-"],
        check=True, capture_output=True, text=True,
    ).stdout


def parse_profile(text, code):
    """Parse only the profile's own highlights, never comparative table columns.

    Anchored French labels and the year/universe are part of the contract. An
    altered label fails closed; explicit suppression symbols remain null.
    """
    text = normalized(text)
    identity = re.search(r"Ce portrait sociodémographique du quartier (.*?) (?:est issu|fait partie) d'un projet", text)
    # Saint-Michel's foreword omits its numeric code; its exact name plus the
    # code in the official index link establishes this one explicit exception.
    identity_ok = identity and (re.search(rf"\b{re.escape(code)}\b", identity.group(1)) or (code == "5-2" and identity.group(1) == "Saint-Michel"))
    if not identity_ok:
        raise ValueError(f"Wrong or absent profile identity: {code}")
    if "tel que défini depuis le mois de juin 2020" not in text:
        raise ValueError(f"Changed or missing neighbourhood geography statement: {code}")
    if text.count("FAITS SAILLANTS") != 1:
        raise ValueError(f"Expected one own-profile highlights section: {code}")
    highlights = text.split("FAITS SAILLANTS", 1)[1]
    n = f"({NUMBER})"

    def values(label, pattern):
        matches = list(re.finditer(pattern, highlights))
        if len(matches) != 1:
            raise ValueError(f"{code}: expected exactly one {label} source statement, got {len(matches)}")
        return [number(v) for v in matches[0].groups()]

    population = values("2021 population", rf"La population résidante du quartier [^.]*?entre les années 2001 et 2021, passant de {NUMBER} à {n} habitants\.")[0]
    households = values("2021 households", rf"Le nombre de ménages [^.]*?entre les années 2001 et 2021, passant de {NUMBER} à {n} ménages\.")[0]
    alone = values("one-person private households", rf"En 2021, {n} % des ménages du quartier sont constitués d'une seule personne")[0]
    size = values("average private household size", rf"En 2021, la taille moyenne des ménages du quartier est de {n} personnes? par ménage")[0]
    detached, occupied, apartments = values("occupied private dwellings by structural type", rf"En 2021, (?:seulement )?{n} % des {n} logements du quartier sont des maisons individuelles et {n} % des appartements dans un immeuble de moins de 5 étages\.")
    owner, renters = values("private household tenure", rf"En 2021, {n} % des ménages du quartier sont propriétaires et {n} % sont locataires\.")
    repairs = values("major repairs", rf"En 2021, {n} % des logements du quartier nécessitent des réparations majeures")[0]
    result = {
        "population": population, "households": households, "householdSize": size,
        "livingAlone": alone, "occupiedDwellings": occupied, "detached": detached,
        "lowRiseApartments": apartments, "renters": renters, "majorRepairs": repairs,
    }
    for key in ("livingAlone", "detached", "lowRiseApartments", "renters", "majorRepairs"):
        if result[key] is not None and result[key] > 100:
            raise ValueError(f"Invalid percentage: {code} {key}")
    if owner is not None and renters is not None and abs(owner + renters - 100) > 0.2:
        raise ValueError(f"Inconsistent tenure percentages: {code}")
    return result


def projected(geometry):
    return transform(geometry, PROJECT, interleaved=False)


def read_areas(features):
    areas = {}
    seen = set()
    for feature in features:
        props = feature["properties"]
        source_id = int(props["ID"])
        if source_id not in AREAS or source_id in seen:
            raise ValueError("Unexpected or duplicate boundary ID")
        seen.add(source_id)
        code, expected_name = AREAS[source_id]
        if normalized(props["NOM"]) != normalized(expected_name):
            raise ValueError(f"Changed neighbourhood name: {source_id} {props['NOM']!r}")
        geometry = shape(feature["geometry"])
        if geometry.is_empty or not geometry.is_valid or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            raise ValueError(f"Invalid neighbourhood polygon: {code}")
        areas[code] = {"name": props["NOM"], "geometry": projected(geometry), "sourceId": source_id}
    if seen != set(AREAS):
        raise ValueError("Incomplete neighbourhood boundaries")
    return areas


def assign_points(areas, records):
    """Assign a point to one original polygon; shared-edge ties use stable code.

    Coordinates are projected before membership checks. Outside points are
    omitted, never snapped from a neighbouring municipality.
    """
    assigned = {code: [] for code in areas}
    outside = []
    identifiers = set()
    for record in records:
        if record["id"] in identifiers:
            raise ValueError(f"Duplicate point ID {record['id']}")
        identifiers.add(record["id"])
        point = projected(Point(record["lon"], record["lat"]))
        candidates = sorted(code for code, area in areas.items() if area["geometry"].covers(point))
        if candidates:
            assigned[candidates[0]].append(record)
        else:
            outside.append(record)
    return assigned, outside


def point_record(feature, id_field, name_field):
    geometry = shape(feature["geometry"])
    props = feature["properties"]
    if geometry.geom_type != "Point" or geometry.is_empty or not props.get(name_field):
        raise ValueError("Missing or invalid named point geometry")
    if not (-72 < geometry.x < -70 and 46 < geometry.y < 48):
        raise ValueError("Point is outside the expected Québec region; verify CRS")
    return {"id": str(props[id_field]), "name": props[name_field].strip(), "lon": geometry.x, "lat": geometry.y}


def unique_libraries(records):
    """Coalesce nearby records for the same named library, not nearby branches."""
    selected = []
    for record in sorted(records, key=lambda r: r["id"]):
        key = normalized(record["name"]).casefold().removeprefix("bibliothèque ")
        point = projected(Point(record["lon"], record["lat"]))
        duplicate = any(
            key == normalized(prior["name"]).casefold().removeprefix("bibliothèque ")
            and point.distance(projected(Point(prior["lon"], prior["lat"]))) < 100
            for prior in selected
        )
        if not duplicate:
            selected.append(record)
    return selected


def legal_text(raw):
    return normalized(html.unescape(re.sub(r"<[^>]+>", " ", raw)))


def check_legal_geography(current, amendment_2020, amendment_2026):
    """New bylaw amendments require review before reusing 2021 observations."""
    laws = {int(v) for v in re.findall(r"R\.V\.Q\.\s*(\d+)", current)}
    if laws != {203, 1106, 2301, 3519} or "en 35 quartiers" not in current:
        raise ValueError("Neighbourhood bylaw has changed; review the census geography join")
    if "En vigueur le 2 juin 2020" not in amendment_2020:
        raise ValueError("Missing June 2020 boundary-law evidence")
    if "afin de modifier le nom de certains quartiers" not in amendment_2026 or "En vigueur le 22 avril 2026" not in amendment_2026:
        raise ValueError("Missing 2026 naming-only amendment evidence")
    for name in ("Orsainville", "Sainte-Thérèse-de-Lisieux", "Vieux-Bourg"):
        if name not in amendment_2026:
            raise ValueError(f"Changed 2026 neighbourhood naming amendment: {name}")


def read_gtfs(path):
    with zipfile.ZipFile(path) as archive:
        def rows(name):
            return list(csv.DictReader(io.TextIOWrapper(archive.open(name), encoding="utf-8-sig", newline="")))
        feed = rows("feed_info.txt")
        if len(feed) != 1:
            raise ValueError("Expected one RTC feed metadata record")
        start = datetime.strptime(feed[0]["feed_start_date"], "%Y%m%d").date().isoformat()
        end = datetime.strptime(feed[0]["feed_end_date"], "%Y%m%d").date().isoformat()
        stops = []
        for stop in rows("stops.txt"):
            if stop.get("location_type", "") not in {"", "0"}:
                continue
            lon, lat = float(stop["stop_lon"]), float(stop["stop_lat"])
            if not (-72 < lon < -70 and 46 < lat < 48):
                raise ValueError("Invalid RTC stop location")
            stops.append({"id": stop["stop_id"], "name": stop["stop_name"], "lon": lon, "lat": lat})
        return stops, f"{start} to {end}"


def source(identifier, title, publisher, url, paths, period, licence, **extra):
    return {
        "id": identifier, "title": title, "publisher": publisher, "url": url,
        "retrievedAt": max(meta_for(p)["retrievedAt"] for p in paths),
        "referencePeriod": period, "licence": licence, **extra,
    }


def ckan_resource(key, resource_url):
    path = fetch(CKAN, params={"id": key})
    package = json.loads(path.read_text())["result"]
    matches = [r for r in package["resources"] if r["url"] == resource_url]
    if len(matches) != 1:
        raise ValueError(f"Missing expected CKAN resource for {key}")
    return path, package, matches[0]


def definitions(boundary_date, facility_date, bus_period):
    scope = "The City's 35 administrative neighbourhoods defined in June 2020; no CMA or agglomeration observations."
    result = {}
    for key, label, unit, note in (
        ("population", "Residents", "persons", "Published 2021 resident population, including people outside private households."),
        ("households", "Private households", "count", "Published 2021 private-household count in the profile's population and household highlights. Rounded independently of the housing table."),
        ("householdSize", "Average household size", "persons", "Published average persons per private household; not total population divided by households."),
        ("livingAlone", "One-person households", "percent", "Published share of private households with one person; not the share of residents living alone."),
        ("occupiedDwellings", "Occupied private dwellings", "count", "Published housing-table count of occupied private dwellings. The rounded count can differ from the private-household count."),
        ("detached", "Detached homes", "percent", "Published share of occupied private dwellings that are single-detached houses (maisons individuelles)."),
        ("lowRiseApartments", "Apartments under five storeys", "percent", "Published share of occupied private dwellings in apartment buildings with fewer than five storeys. Excludes taller apartment buildings and duplexes; it is not the total apartment share."),
        ("renters", "Renter households", "percent", "Published share of private households that rent their dwelling. Census tenure is not current rental availability."),
        ("majorRepairs", "Homes needing major repairs", "percent", "Published share of occupied private dwellings reported as needing major repairs at the 2021 census; not a current inspection."),
    ):
        result[key] = {"label": label, "unit": unit, "sourceId": CENSUS_ID, "period": "2021", "note": note + " Read from the neighbourhood's own highlights, printed page 5 of its October 2026 profile; source rounding is retained.", "geographicScope": scope}
    point_scope = f"Point-in-polygon assignment to original {boundary_date} neighbourhood polygons in NAD83 / MTM zone 7 (EPSG:32187). Shared-edge ties go to the lowest neighbourhood code; outside points are excluded."
    for key, label, source_id, period, note in (
        ("parks", "School, dog and linear park sites", PARK_ID, facility_date, "Distinct names from Lieux publics points classified Parcs écoles, Parc canin or Parcs linéaires. The dataset contains only these limited park categories; ordinary neighbourhood parks are not covered. Multiple points for the same name inside one neighbourhood count once. These are mapped locations, not park footprints, all parks, parkland area or walking access. A zero means no selected site, not no parks."),
        ("busStops", "RTC bus-stop locations", BUS_ID, bus_period, "Distinct GTFS stop IDs inside each neighbourhood in the RTC feed valid for these dates. Opposite-direction stops count separately. The feed inventory does not measure frequency or confirm that every listed stop is served on a particular day; rail and a proposed tramway are not counted."),
        ("libraries", "Mapped library sites", FACILITY_ID, facility_date, "Lieux publics sites classified Bibliothèques; same-name records less than 100 metres apart are merged. The inventory includes institutional libraries, including Université Laval and Collège des Jésuites; counts do not imply unrestricted public access or opening hours."),
        ("communityCentres", "Mapped community centres", FACILITY_ID, facility_date, "Distinct Lieux publics points classified Centres communautaires. Other source classes, including Centres de loisirs, Centres récréatifs and Patros, are excluded. Counts do not measure capacity or opening hours."),
    ):
        result[key] = {"label": label, "unit": "count", "sourceId": source_id, "period": period, "note": note, "geographicScope": point_scope}
    return result


def build():
    boundary_meta, boundary_package, boundary_resource = ckan_resource("vque_9", BOUNDARY_URL)
    boundary_path = fetch(BOUNDARY_URL)
    areas = read_areas(json.loads(boundary_path.read_text())["features"])
    boundary_date = boundary_resource["last_modified"][:10]
    index_path = fetch(INDEX_URL)
    links = profile_links(index_path.read_text(errors="replace"))
    profiles, pdf_paths = {}, {}
    for code, url in sorted(links.items()):
        pdf_paths[code] = fetch(url)
        profiles[code] = parse_profile(extract_pdf(pdf_paths[code]), code)

    law_paths = [fetch(url) for url in (LAW_URL, LAW_2020, LAW_2026)]
    check_legal_geography(*(legal_text(path.read_text(errors="replace")) for path in law_paths))
    law_paths.extend(fetch(url) for url in (ANNEX_2020, ANNEX_2026))
    facility_meta, facility_package, facility_resource = ckan_resource("vque_14", FACILITY_URL)
    facility_path = fetch(FACILITY_URL)
    facility_date = facility_resource["last_modified"][:10]
    facilities = {"parks": [], "libraries": [], "communityCentres": []}
    categories = {"Bibliothèques": "libraries", "Centres communautaires": "communityCentres"}
    categories.update({category: "parks" for category in PARK_TYPES})
    for feature in json.loads(facility_path.read_text())["features"]:
        category = categories.get(feature["properties"]["DESCRIPTION"])
        if category:
            facilities[category].append(point_record(feature, "ID", "NOM_TOPOGRAPHIE"))
    facilities["libraries"] = unique_libraries(facilities["libraries"])
    bus_meta, bus_package, _ = ckan_resource("rtc-gtfs-arrets-et-les-parcours", GTFS_URL)
    gtfs_path = fetch(GTFS_URL)
    bus_records, bus_period = read_gtfs(gtfs_path)
    inventories = {"busStops": bus_records, **facilities}
    assigned, excluded = {}, {}
    for key, records in inventories.items():
        assigned[key], excluded[key] = assign_points(areas, records)

    sources = [
        source(BOUNDARY_ID, "Quartiers — official neighbourhood boundaries", "Ville de Québec", "https://www.donneesquebec.ca/recherche/dataset/vque_9", [boundary_meta, boundary_path], f"Polygon extract {boundary_date}; June 2020 administrative definitions", boundary_package["license_title"], downloadUrl=BOUNDARY_URL, releaseDate=boundary_date, transformations=["Explicit 35-ID/profile-code crosswalk checked against publisher names.", "Original polygons used for spatial joins in EPSG:32187; display simplified by 8 metres and oriented clockwise."], notes=["All October 2026 profiles explicitly say their neighbourhood is defined since June 2020. R.V.Q.2301 took effect on 2 June 2020. The current D-8 bylaw records R.V.Q.3519, effective 22 April 2026, as a naming amendment: Orsainville, Sainte-Thérèse-de-Lisieux and Vieux-Bourg.", "The current map extract is not represented as an archived 2021 vertex dataset. The administrative-definition evidence supports the join; source geometry can receive cartographic corrections."]),
        source(CENSUS_ID, "Portraits sociodémographiques des 35 quartiers — October 2026 editions", "Ville de Québec / Statistics Canada", INDEX_URL, [index_path, *pdf_paths.values()], "2021 Census; published October 2026", "Statistics Canada Open Licence for census observations; municipal profile documents retain publisher rights.", releaseDate="2026-10", transformations=["pdftotext extracts physical pages 1–7; parse only the neighbourhood's own FAITS SAILLANTS statements on printed page 5.", "French decimal commas and thousands spaces normalized; rounded published percentages are retained without recomputing denominators."], notes=["Each row identifies its individual PDF source. All 35 profiles explicitly describe June 2020 neighbourhood definitions.", "Later comparative chart sections are not used: some PDFs contain unrelated neighbourhood headers and some charts are embedded images.", "Missing/suppressed values remain null. A changed label, geography assertion or profile identity stops the build. No current rent, all-apartment share or CMA figure is inferred."]),
        source("quebec-city-boundary-bylaws", "R.R.V.Q. D-8 neighbourhood boundaries and amendments R.V.Q.2301 / R.V.Q.3519", "Ville de Québec", LAW_URL, law_paths, "June 2020 definitions; April 2026 naming amendment", "Official municipal legal documents; no separate reuse licence stated.", notes=[f"2020 amendment: {LAW_2020}", f"2026 amendment: {LAW_2026}", f"2020 annex: {ANNEX_2020}", f"2026 annex: {ANNEX_2026}", "The April 2026 explanatory note states that three neighbourhood designations change. Independent comparison found all 35 boundary-description bodies unchanged after whitespace normalization between the 2020 and 2026 annexes; this is textual-boundary evidence, not historical GIS vertex identity.", "Publisher anomaly: the 2026 annex transposes the Sainte-Thérèse-de-Lisieux and Vieux-Bourg description headings. Article 1 correctly assigns 5-1 to Sainte-Thérèse-de-Lisieux and 5-4 to Vieux-Bourg. Both October 2026 profile maps and current municipal GIS support that mapping; the erroneous annex headings are not used for the join."]),
        source(PARK_ID, "Lieux publics — school, dog and linear park sites only", "Ville de Québec", "https://www.donneesquebec.ca/recherche/dataset/vque_14", [facility_meta, facility_path], facility_date, facility_package["license_title"], downloadUrl=FACILITY_URL, releaseDate=facility_date, transformations=["Select only exact DESCRIPTION classes Parcs écoles, Parc canin and Parcs linéaires.", "Count distinct park names per neighbourhood after original-point assignment."], notes=[f"{len(facilities['parks'])} selected park point records; {len(excluded['parks'])} outside neighbourhood polygons excluded.", "The snapshot has 85 school-park, 2 dog-park and 2 linear-park point records. Repeated names within a neighbourhood count once; the locations do not represent park footprints.", "Ordinary neighbourhood parks and parkland area are not covered by these source categories. The separate municipal ArcGIS recreation-map inventory was not imported because its metadata did not state a reuse licence."]),
        source(FACILITY_ID, "Lieux publics — library and community-centre points", "Ville de Québec", "https://www.donneesquebec.ca/recherche/dataset/vque_14", [facility_meta, facility_path], facility_date, facility_package["license_title"], downloadUrl=FACILITY_URL, releaseDate=facility_date, transformations=["Select exact DESCRIPTION classes Bibliothèques and Centres communautaires; assign original points to neighbourhood polygons.", "Library names are normalized by removing the Bibliothèque prefix; same-name locations less than 100 metres apart are merged, retaining the lowest source ID."], notes=["The municipal inventory includes municipal facilities and some private institutions. Library sites are not restricted to public-library network branches.", "The snapshot has two nearby records for Maison de la Littérature: IDs 102399 and 202454, on adjacent streets. They count as one site (ID 102399). This reduces 28 library records to 27 sites.", f"Outside polygons excluded: {len(excluded['libraries'])} library and {len(excluded['communityCentres'])} community-centre points."]),
        source(BUS_ID, "RTC GTFS — bus-stop inventory", "Réseau de transport de la Capitale", "https://www.rtcquebec.ca/donnees-ouvertes", [bus_meta, gtfs_path], bus_period, bus_package["license_title"], downloadUrl=GTFS_URL, transformations=["Read stops.txt and feed_info.txt from the GTFS archive; unique location_type 0 or blank stop IDs assigned to neighbourhood polygons."], notes=[f"{len(bus_records)} stops in the regional feed; {len(excluded['busStops'])} points outside Québec City neighbourhood polygons excluded.", "Inventory only: no calculation of active service, route frequency, walking distances or day-specific accessibility. Rail and proposed tram infrastructure are not included."]),
    ]
    for code, url in sorted(links.items()):
        sources.append(source(f"quebec-city-profile-{code}", f"Quartier {code} — portrait sociodémographique, October 2026", "Ville de Québec / Statistics Canada", url, [pdf_paths[code]], "2021 Census; June 2020 neighbourhood definition", "Statistics Canada Open Licence for census observations; municipal profile document retains publisher rights.", releaseDate="2026-10", notes=["Source figures: FAITS SAILLANTS, printed page 5. Geography statement: printed page 4. Main bundle census source documents parsing and limitations."]))

    rows = []
    for code, area in sorted(areas.items()):
        display = orient_polygons(transform(area["geometry"].simplify(8, preserve_topology=True), UNPROJECT, interleaved=False), exterior_cw=True)
        park_names = sorted({p["name"] for p in assigned["parks"][code]})
        metrics = {key: cell(value) for key, value in profiles[code].items()}
        metrics.update({key: cell(len(assigned[key][code])) for key in ("busStops", "libraries", "communityCentres")})
        metrics["parks"] = cell(len(park_names))
        amenities = [{"name": point["name"], "category": category, "sourceId": FACILITY_ID} for key, category in (("libraries", "library"), ("communityCentres", "communityCentre")) for point in sorted(assigned[key][code], key=lambda p: (p["name"], p["id"]))]
        rows.append({"id": code, "name": area["name"], "geometry": mapping(display), "metrics": metrics, "parks": park_names, "stations": [], "amenities": amenities, "quality": {"profileSourceId": f"quebec-city-profile-{code}", "municipalBoundaryId": str(area["sourceId"]), "censusGeography": "June 2020 administrative definition; 2021 census", "parkCoverage": "School, dog and linear park locations only; ordinary parks not covered"}})
    return {
        "schemaVersion": 1, "placeId": "quebec-city", "cityName": "Québec City",
        "boundarySourceId": BOUNDARY_ID,
        "boundaryVintage": f"June 2020 definitions; polygon extract {boundary_date}",
        "boundaryNote": f"The City's 35 administrative neighbourhoods are matched by official codes to its October 2026 profiles of the 2021 Census. Every profile identifies neighbourhood definitions from June 2020. The 2026 boundary-bylaw amendment changes three names. Its annex swaps two description headings; Article 1 and the profile maps confirm 5-1 as Sainte-Thérèse-de-Lisieux and 5-4 as Vieux-Bourg. Display polygons come from the {boundary_date} municipal extract; exact historical vertex identity is not asserted. Coverage is the City of Québec. The neighbouring municipalities of L'Ancienne-Lorette and Saint-Augustin-de-Desmaures, and the Wendake reserve, are outside these polygons; wider agglomeration and metropolitan observations are not used.",
        "coverageNote": "Population and housing describe 2021. Apartments under five storeys are a specific dwelling category, not all apartments. Park figures cover school, dog and linear park locations only; ordinary neighbourhood parks are not covered. Library sites include institutional libraries. Current facility and RTC stop inventories have their own dates. Parkland area, rail, tram, commuting shares, occupations and current rents are not collected in this bundle.",
        "definitions": definitions(boundary_date, facility_date, bus_period),
        "sources": sources, "neighbourhoods": rows, "stations": [],
        "links": {"hoodmaps": "https://hoodmaps.com/quebec-city-neighborhood-map", "reddit": "https://www.reddit.com/r/Quebec/", "profiles": INDEX_URL},
    }


if __name__ == "__main__":
    bundle = build()
    from neighbourhoods.check import validate
    validate(bundle)
    path = PROCESSED / "neighbourhoods" / "quebec-city.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {path}: {len(bundle['neighbourhoods'])} neighbourhoods")
