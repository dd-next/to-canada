"""City of Vancouver's 22 permanent local areas, with the 2016 custom census.

Run directly to write only data/processed/neighbourhoods/vancouver.json.
Spatial calculations use original polygons in NAD83 / UTM zone 10N (EPSG:26910).
See docs/neighbourhoods/vancouver.md for geography, vintages and source checks.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import PROCESSED
from common.fetch import fetch, meta_for
from pyproj import Transformer
from shapely import make_valid, orient_polygons, transform
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

BASE = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets"
CENSUS_KEY = "census-local-area-profiles-2016"
CENSUS_URL = "https://webtransfer.vancouver.ca/opendata/csv/CensusLocalAreaProfiles2016.csv"
PROJECT = Transformer.from_crs(4326, 26910, always_xy=True).transform
UNPROJECT = Transformer.from_crs(26910, 4326, always_xy=True).transform
CENSUS_ID = f"vancouver-{CENSUS_KEY}"
BOUNDARY_ID = "vancouver-local-area-boundary"
PARK_ID = "vancouver-parks-polygon-representation"
RAIL_ID = "vancouver-rapid-transit-stations"
LIBRARY_ID = "vancouver-libraries"
CENTRE_ID = "vancouver-community-centres"

# These are the City's custom CSV row IDs, not Statistics Canada variable codes.
# Check their full labels as well as their IDs so an upstream schema change fails.
VARIABLES = {
    1: "Total - Age groups and average age of the population - 100% data",
    80: "0 to 14 years",
    150: "Total - Private households by household size - 100% data",
    151: "1 person",
    157: "Average household size",
    166: "Total - Occupied private dwellings by structural type of dwelling - 100% data",
    167: "Single-detached house",
    168: "Apartment in a building that has five or more storeys",
    172: "Apartment or flat in a duplex",
    173: "Apartment in a building that has fewer than five storeys",
    2192: "All occupations",
    2193: "0 Management occupations",
    2194: "1 Business, finance and administration occupations",
    2195: "2 Natural and applied sciences and related occupations",
    2196: "3 Health occupations",
    2197: "4 Occupations in education, law and social, community and government services",
    2198: "5 Occupations in art, culture, recreation and sport",
    2199: "6 Sales and service occupations",
    2200: "7 Trades, transport and equipment operators and related occupations",
    2201: "8 Natural resources, agriculture and related production occupations",
    2202: "9 Occupations in manufacturing and utilities",
    2313: "Total - Main mode of commuting for the employed labour force aged 15 years and over in private households with a usual place of work or no fixed workplace address - 25% sample data",
    2316: "Public transit",
    2317: "Walked",
    2318: "Bicycle",
    4018: "Total - Private households by tenure - 25% sample data",
    4020: "Renter",
    4106: "Median monthly shelter costs for rented dwellings ($)",
}

# Setting paragraphs are paraphrases of the linked official area pages, read on
# 2026-11-07. Their marketing claims about residents are deliberately not reused;
# household and occupation descriptions below come from the resident census.
SETTINGS = {
    "downtown": (
        "downtown", "Downtown",
        "Downtown occupies the central peninsula between Burrard Inlet and False Creek. "
        "The City's area guide identifies it as the main business district, with arts, entertainment and sports venues. "
        "The mapped local area brings together the waterfront and the Yaletown, Gastown and Chinatown surroundings, so individual blocks have different uses.",
    ),
    "fairview": (
        "fairview", "Fairview",
        "Fairview combines the south side of False Creek, Granville Island and the South Granville shopping district. "
        "The City's history describes apartment development south of Broadway and the later residential redevelopment of Fairview Slopes. "
        "That mix makes the waterfront, Broadway and the uphill residential streets useful places to compare separately.",
    ),
    "grandview-woodland": (
        "grandview-woodland", "Grandview-Woodland",
        "Commercial Drive is a central shopping and dining reference point in the City's guide to Grandview-Woodland. "
        "The local area sits in northeastern Vancouver between the older central neighbourhoods and Hastings-Sunrise. "
        "Britannia's community facilities provide another everyday destination away from the rail interchange at the southern edge.",
    ),
    "hastings-sunrise": (
        "hastings-sunrise", "Hastings-Sunrise",
        "Hastings-Sunrise reaches the Burnaby boundary at Boundary Road and the north-facing slopes above Burrard Inlet. "
        "The City highlights Hastings Park and the Pacific National Exhibition, with shops and services along Hastings Street's East Village. "
        "The residential streets and the large park and event grounds create different settings within this one local area.",
    ),
    "kensington-cedar-cottage": (
        "kensington-cedar-cottage", "Kensington-Cedar Cottage",
        "Kensington-Cedar Cottage lies in central east Vancouver, spanning higher ground and the Trout Lake park setting. "
        "The City's guide points to both Kensington and Trout Lake community facilities. "
        "Its size and varied terrain make the location of a particular home within the area relevant to everyday errands and trips.",
    ),
    "kitsilano": (
        "kitsilano", "Kitsilano",
        "Kitsilano runs along the south shore of English Bay. The City identifies West 4th Avenue and West Broadway as its main restaurant and retail corridors. "
        "The beach and waterfront parks are distinctive destinations, while the City's heritage account describes a mix of apartments and older houses converted into suites.",
    ),
    "marpole": (
        "marpole", "Marpole",
        "Marpole slopes south toward the Fraser River and forms a gateway to Vancouver through the river crossings and rapid transit. "
        "The City describes a mix of residential buildings, including low-rise apartments, and shopping along Granville Street. "
        "Homes near the Granville corridor and those near Marine Drive station can have quite different starting points for daily trips.",
    ),
    "mount-pleasant": (
        "mount-pleasant", "Mount Pleasant",
        "Mount Pleasant rises from False Creek toward the meeting of Main Street, Broadway and Kingsway. "
        "The City's guide highlights shops and heritage buildings, and its history records the area's combination of homes, industry and later redevelopment. "
        "The False Creek waterfront and the uphill commercial streets offer distinct everyday settings within the mapped area.",
    ),
    "renfrew-collingwood": (
        "renfrew", "Renfrew-Collingwood",
        "Renfrew-Collingwood follows Vancouver's eastern boundary with Burnaby. "
        "The City points to the Collingwood stretch of Kingsway for services and to Renfrew Ravine Park and the Still Creek watershed for a different outdoor setting. "
        "The area covers several station catchments, so the most relevant rail stop depends on the address.",
    ),
    "west-end": (
        "west-end", "West End",
        "The West End occupies the peninsula west of Downtown, beside English Bay, Coal Harbour and the edge of Stanley Park. "
        "The City's guide identifies Davie Village, Denman Street and Robson Street as shopping and restaurant corridors. "
        "Its history describes several waves of apartment construction, including the high-rise development that shaped the present streetscape.",
    ),
}


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def normalized(value):
    return " ".join(value.split())


def number(raw):
    if raw is None or str(raw).strip().casefold() in {"", "-", "..", "...", "x", "f", "n/a", "—", "**"}:
        return None
    value = float(str(raw).strip().replace(",", ""))
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid non-negative Vancouver measurement: {raw!r}")
    return value


def ratio(part, total):
    if part is None or total is None or total <= 0 or part > total:
        return None
    return round(100 * part / total, 1)


def sum_known(*values):
    return None if any(v is None for v in values) else sum(values)


def cell(value):
    return {"value": value, **({"missingReason": "The 2016 source cell or required denominator is missing, suppressed or invalid after random rounding."} if value is None else {})}


def parse_census(text):
    """Read the legacy CP1252 wide CSV; never import its CSD or CMA columns."""
    rows = list(csv.reader(io.StringIO(text)))
    headers = [i for i, r in enumerate(rows) if r[:2] == ["ID", "Variable"]]
    if len(headers) != 1:
        raise ValueError("Expected one Vancouver census header")
    pos = headers[0]
    header = [v.strip() for v in rows[pos]]
    if header[-2:] != ["Vancouver CSD", "Vancouver CMA"] or len(header) != 26:
        raise ValueError("Unexpected Vancouver census geography columns")
    areas = [slug(v) for v in header[2:-2]]
    if len(set(areas)) != 22:
        raise ValueError("Expected 22 distinct local areas")
    result = {area: {} for area in areas}
    seen = set()
    for row in rows[pos + 1:]:
        if not row or not row[0].strip().isdigit():
            continue
        code = int(row[0])
        if code in seen:
            raise ValueError(f"Duplicate census variable ID {code}")
        seen.add(code)
        if code not in VARIABLES:
            continue
        if len(row) != len(header) or normalized(row[1]) != VARIABLES[code]:
            raise ValueError(f"Changed census variable {code}: {row[1]!r}")
        for area, raw in zip(areas, row[2:-2]):
            result[area][code] = number(raw)
    if not set(VARIABLES) <= seen:
        raise ValueError(f"Missing census variables: {sorted(set(VARIABLES) - seen)}")
    return result


def census_values(values):
    g = values.get
    return {
        "population": g(1), "households": g(150), "children": g(80),
        "householdSize": g(157), "livingAlone": ratio(g(151), g(150)),
        "apartments": ratio(sum_known(g(168), g(173)), g(166)),
        "detached": ratio(g(167), g(166)), "duplex": ratio(g(172), g(166)),
        "renters": ratio(g(4020), g(4018)), "tenantShelter": g(4106),
        "transit": ratio(g(2316), g(2313)), "walkCycle": ratio(sum_known(g(2317), g(2318)), g(2313)),
    }


def source_record(key, metadata, paths, period=None, notes=()):
    meta = metadata["metas"]["default"]
    return {
        "id": f"vancouver-{key}", "title": meta["title"],
        "publisher": "City of Vancouver / Statistics Canada" if key == CENSUS_KEY else "City of Vancouver",
        "tableId": key, "url": f"https://opendata.vancouver.ca/explore/dataset/{key}/",
        "downloadUrl": CENSUS_URL if key == CENSUS_KEY else f"{BASE}/{key}/exports/json",
        "releaseDate": meta["modified"][:10],
        "retrievedAt": max(meta_for(p)["retrievedAt"] for p in paths),
        "referencePeriod": period or f"Dataset modified {meta['modified'][:10]}",
        "licence": "Statistics Canada Open Licence / Open Government Licence - Vancouver" if key == CENSUS_KEY else meta["license"],
        "attribution": "Adapted from Statistics Canada, 2016 Census of Population, custom order for City of Vancouver Local Areas. This does not constitute an endorsement by Statistics Canada of this product." if key == CENSUS_KEY else "Contains information licensed under the Open Government Licence – Vancouver. The City does not endorse this product.",
        "transformations": [],
        "notes": ["Manually refreshed snapshot. The retrieval date is not the data's observation period.", *notes],
        "status": "ok",
    }


def dataset(key, *, notes=()):
    print(f"Reading Vancouver/{key}", flush=True)
    meta_path = fetch(f"{BASE}/{key}", timeout=60)
    meta = json.loads(meta_path.read_text())
    path = fetch(f"{BASE}/{key}/exports/json", timeout=90)
    rows = json.loads(path.read_text())
    if not isinstance(rows, list) or not rows or len(rows) != meta["metas"]["default"]["records_count"]:
        raise ValueError(f"Incomplete Vancouver dataset: {key}")
    return rows, source_record(key, meta, [path], notes=notes), meta


def geometry(row):
    raw = row.get("geom")
    if not raw:
        raise ValueError("Missing published geometry; cannot count missing features as zero")
    return shape(raw["geometry"] if raw.get("type") == "Feature" else raw)


def projected(raw):
    return transform(make_valid(raw), PROJECT, interleaved=False)


def unique_stations(rows):
    stations = {}
    # Two interchanges have multiple published points. Retain one original point
    # per exact station name, deterministically westernmost then southernmost.
    for row in sorted(rows, key=lambda r: (r["station"], geometry(r).x, geometry(r).y)):
        name = row["station"].strip()
        pt = geometry(row)
        stations.setdefault(name, {"id": f"vancouver-{slug(name)}", "name": name, "lon": pt.x, "lat": pt.y})
    return list(stations.values())


def spatial_context(area, park_shapes, park_rows, stations, station_points):
    """Calculate on original projected polygons; all distances are to the area."""
    tree = STRtree(park_shapes)
    matches = [int(i) for i in tree.query(area, predicate="intersects") if area.intersection(park_shapes[int(i)]).area > 1]
    coverage = area.intersection(unary_union([park_shapes[i] for i in matches])).area if matches else 0
    parks = sorted(park_rows[i]["park_name"] or f"Unnamed park site at {park_rows[i]['address']}" for i in matches)
    near = [{**station, "distanceToBoundaryM": round(area.distance(point))}
            for station, point in zip(stations, station_points) if area.distance(point) <= 800]
    near.sort(key=lambda s: (s["distanceToBoundaryM"], s["name"]))
    return {"parkland": cell(round(100 * min(coverage, area.area) / area.area, 1)), "parks": cell(len(parks)), "rail": cell(len(near))}, parks, near


def definition(label, unit, source_id, note, period="2016", scope="City of Vancouver's permanent local planning areas; not Metro Vancouver"):
    return {"label": label, "unit": unit, "sourceId": source_id, "period": period, "note": note, "geographicScope": scope}


def definitions(sources):
    dates = {s["id"]: s.get("releaseDate") for s in sources}
    result = {
        "population": definition("Population", "persons", CENSUS_ID, "2016 Census total population in each local area; counts randomly rounded."),
        "households": definition("Private households", "count", CENSUS_ID, "2016 Census private households by household size; 100% data, rounded counts."),
        "children": definition("Children under 15", "percent", CENSUS_ID, "Published percentage aged 0–14 in the 2016 Census; 100% population data."),
        "householdSize": definition("Average household size", "persons", CENSUS_ID, "People per private household in the 2016 Census; collective dwellings excluded."),
        "livingAlone": definition("One-person households", "percent", CENSUS_ID, "One-person private households divided by all private households, 2016 Census; rounded 100% counts."),
        "apartments": definition("Homes in apartment buildings", "percent", CENSUS_ID, "Occupied dwellings in buildings with fewer than five or five-plus storeys divided by all occupied private dwellings, 2016. Duplexes excluded."),
        "detached": definition("Single-detached homes", "percent", CENSUS_ID, "Single-detached occupied dwellings divided by all occupied private dwellings, 2016 Census."),
        "duplex": definition("Apartments or flats in duplexes", "percent", CENSUS_ID, "Occupied apartments or flats in duplexes divided by all occupied private dwellings, 2016 Census. The City cautions that classification changes may affect comparisons with earlier censuses."),
        "renters": definition("Households renting", "percent", CENSUS_ID, "Renter households divided by all private households by tenure, including band housing in the denominator; 2016 Census 25% sample, rounded counts."),
        "tenantShelter": definition("Median tenant shelter cost", "CAD_month", CENSUS_ID, "2016 monthly shelter costs paid by existing tenants in non-farm, non-reserve dwellings, all sizes; includes utilities where applicable. 25% sample. Historical occupied-rental costs, not current asking rents."),
        "transit": definition("Commutes by public transit", "percent", CENSUS_ID, "Among employed residents aged 15+ in private households with a usual workplace or no fixed workplace, 2016 Census 25% sample. Excludes working at home."),
        "walkCycle": definition("Commutes on foot or by bike", "percent", CENSUS_ID, "Walked plus cycled among the same 2016 employed-resident commuting denominator; excludes working at home. 25% sample."),
    }
    result.update({
        "parkland": definition("Mapped parkland", "percent", PARK_ID, "Share of the local-area polygon covered by the union of City park polygons. Overlaps counted once; includes mapped plazas and park sites, not all green space or tree canopy.", dates[PARK_ID], "Original local-area and park polygons intersected in NAD83 / UTM zone 10N"),
        "parks": definition("Park sites overlapping the area", "count", PARK_ID, "Distinct published park-site polygons with more than 1 m² inside the local area. A site spanning areas appears in each; includes small plazas and unnamed sites.", dates[PARK_ID]),
        "rail": definition("Rail stations in or near the area", "count", RAIL_ID, "Distinct named stations inside or within 800 m of the boundary, using one representative published point per station. Straight-line proximity, not a walk from a home or a service-frequency measure. City-only 2023 inventory excludes later openings and stations beyond the municipality.", dates[RAIL_ID]),
        "libraries": definition("Mapped public library branches", "count", LIBRARY_ID, "City library records assigned by the publisher's local-area field; Outreach Services excluded. Dataset modified in 2020, with a legacy July 2009 currency note; branches may have moved or changed. Verify current details before visiting.", dates[LIBRARY_ID], "Publisher's geo_local_area, derived from coordinates or address"),
        "communityCentres": definition("Mapped community centres", "count", CENTRE_ID, "City community-centre inventory records assigned by the publisher's local-area field, including Carnegie and other listed community-service centres. Approximate locations; 2020 snapshot, not current opening or program availability.", dates[CENTRE_ID], "Publisher's geo_local_area, derived from coordinates or address"),
    })
    return result


def official_settings():
    sources = []
    for area, (path, name, _) in SETTINGS.items():
        url = f"https://vancouver.ca/news-calendar/{path}.aspx"
        downloaded = fetch(url, timeout=60)
        # Editorial summaries are reviewed text, not automatically refreshed prose.
        sources.append({
            "id": f"vancouver-area-guide-{area}", "title": f"{name} — City area guide", "publisher": "City of Vancouver",
            "url": url, "downloadUrl": url, "retrievedAt": meta_for(downloaded)["retrievedAt"],
            "referencePeriod": "Undated area guide; description reviewed 2026-11-07", "licence": "City of Vancouver website Terms of Use",
            "transformations": ["Paraphrased location, retail corridors, facilities and built-form history for the neighbourhood setting; resident demographics are taken from the census instead."],
            "notes": ["The website does not give an observation date for this descriptive text. The description review date is separate from the download time."], "status": "ok",
        })
    return sources


def readable_list(items):
    return ", ".join(items[:-1]) + " and " + items[-1] if len(items) > 1 else items[0]


def describe(record, census, sources):
    """Descriptions have measured evidence and a clearly labelled interpretation."""
    area = record["id"]
    # Preserve missing source cells rather than generating misleading prose.
    if any(record["metrics"][key]["value"] is None for key in census_values(census)):
        return None
    val = lambda key: record["metrics"][key]["value"]
    pct = lambda key: f"{val(key):.1f}%"
    section = lambda heading, text, kind, ids: {"heading": heading, "text": text, "kind": kind, "sourceIds": ids}
    sections = [section("Housing", f"In the 2016 Census, {pct('renters')} of {record['name']}'s households rented their home. "
                        f"Apartment buildings accounted for {pct('apartments')} of occupied homes, single-detached houses for {pct('detached')}, "
                        f"and apartments or flats in duplexes for {pct('duplex')}. These dwelling categories describe building form, not tenure or homes currently available.",
                        "measured", [CENSUS_ID])]
    occupations = [(code, ratio(census[code], census[2192])) for code in range(2193, 2203)]
    occupations = sorted((o for o in occupations if o[1] is not None), key=lambda item: (-item[1], item[0]))
    occupation_text = ""
    if len(occupations) >= 2:
        first, second = occupations[:2]
        title = lambda code: re.sub(r"^\d+ ", "", VARIABLES[code]).removeprefix("Occupations in ").lower()
        occupation_text = (f" Among residents aged 15+ in the labour force with an applicable occupation, the two largest broad groups were "
                           f"{title(first[0])} ({first[1]:.1f}%) and {title(second[0])} ({second[1]:.1f}%). "
                           "These are residents' occupations, not a count of jobs located here; occupation data use the 25% census sample.")
    sections.append(section("Households and residents", f"The 2016 profile counted {val('population'):,.0f} residents and {val('households'):,.0f} private households. "
                            f"Average household size was {val('householdSize'):.1f} people; {pct('livingAlone')} of households had one person, "
                            f"and {pct('children')} of residents were younger than 15." + occupation_text, "measured", [CENSUS_ID]))
    if area in SETTINGS:
        setting_sources = [f"vancouver-area-guide-{area}", BOUNDARY_ID]
        if area in {"grandview-woodland", "marpole", "renfrew-collingwood"}:
            setting_sources.append(RAIL_ID)
        sections.append(section("Everyday setting", SETTINGS[area][2], "editorial", setting_sources))
    park_examples = [name for name in record["parks"] if not name.startswith(("Park Site", "West End minipark", "Street End", "Unnamed"))][:3]
    amenities = [a["name"] for a in record["amenities"]][:3]
    dates = {s["id"]: s.get("releaseDate") for s in sources}
    context = (f"The park map dated {dates[PARK_ID]} places {val('parks'):.0f} park sites partly or wholly in this local area, "
               f"covering {pct('parkland')} of its mapped area")
    context += (f", including {readable_list(park_examples)}. " if park_examples else ". ")
    context += (f"The separate 2020 facility inventories list {readable_list(amenities)} here. " if amenities else "The separate 2020 inventories contain no library or community-centre record assigned to this area. ")
    context += "Facility records describe mapped locations; opening hours, programming and subsequent relocations need a current check."
    sections.append(section("Parks and everyday facilities", context, "measured", [PARK_ID, LIBRARY_ID, CENTRE_ID]))
    transport = (f"In 2016, {pct('transit')} of commuting residents travelled by public transit and {pct('walkCycle')} walked or cycled; "
                 "the denominator excludes people working at home. ")
    if record["stations"]:
        transport += (f"The City's {dates[RAIL_ID]} inventory places {val('rail'):.0f} distinct rail stations inside or within 800 m of this local area's boundary, "
                      f"including {readable_list([s['name'] for s in record['stations'][:3]])}. ")
    else:
        transport += f"The City's {dates[RAIL_ID]} inventory contains no rail station inside or within 800 m of this boundary. "
    transport += "That boundary measure does not describe the walk from any particular home, bus access or service frequency."
    sections.append(section("Getting around", transport, "measured", [CENSUS_ID, RAIL_ID]))
    if area in {"kitsilano", "fairview", "mount-pleasant"}:
        practical = "For a Broadway-area address, check current project and transit information alongside the City's dated rail inventory. The neighbourhood's 2016 travel patterns cannot establish today's service from an individual building. "
    elif area in {"west-end", "downtown"}:
        practical = "Compare the actual building and route to everyday destinations: the area-wide apartment share and boundary-based rail count cannot distinguish individual streets. "
    elif val("rail") == 0:
        practical = "Check the current bus route and travel time from the actual address; an empty rail list does not mean the area has no public transit. "
    else:
        practical = "Compare routes from the actual address to the station, shops and facilities you will use; a station near one edge may be a substantial trip from the other side. "
    practical += (f"The median tenant shelter cost of ${val('tenantShelter'):,.0f} per month is a 2016 measure of costs paid by existing tenants in non-farm, non-reserve dwellings, "
                  "including utilities where applicable and all dwelling sizes. Use current listings for a move-in budget.")
    practical_sources = [CENSUS_ID, RAIL_ID, BOUNDARY_ID]
    if area in {"kitsilano", "fairview", "mount-pleasant"}:
        practical_sources.append(f"vancouver-area-guide-{area}")
    sections.append(section("Practical considerations", practical, "editorial", practical_sources))
    return {"verifiedAt": "2026-11-07", "sections": sections}


def build():
    boundaries, boundary_source, boundary_meta = dataset("local-area-boundary", notes=[
        'Publisher data-currency statement: "These boundaries do not change." Local areas generally follow street centrelines.',
        "The 2016 census catalogue says its 22 census-block-defined local areas equal these local planning areas; name joins preserve that stated geography.",
    ])
    if len(boundaries) != 22 or "These boundaries do not change." not in boundary_meta["metas"]["default"]["description"]:
        raise ValueError("Vancouver permanent-boundary assertion changed; review census compatibility")
    census_meta_path = fetch(f"{BASE}/{CENSUS_KEY}", timeout=60)
    census_meta = json.loads(census_meta_path.read_text())
    census_path = fetch(CENSUS_URL, timeout=90)
    census = parse_census(census_path.read_text(encoding="cp1252"))
    if {slug(r["name"]) for r in boundaries} != set(census):
        raise ValueError("Census and boundary local areas do not join exactly")
    census_source = source_record(CENSUS_KEY, census_meta, [census_path], "2016", notes=[
        "Custom Statistics Canada 2016 profiles for 22 City local planning areas; mandatory long form sampled approximately 25% of the population.",
        "The publisher states that these local areas include Musqueam 2 reserve. Vancouver CSD excludes that reserve but includes Stanley Park. CSD and CMA columns are explicitly discarded.",
        "Counts are rounded for confidentiality. Household-size and tenure totals come from different census universes/samples and need not be identical.",
        "Shelter costs cover non-farm, non-reserve dwellings and existing tenants in 2016; they are not present-day advertised rents.",
    ])
    census_source["transformations"] = ["Decode the City's legacy CSV as CP1252; join by normalized local-area name (Arbutus-Ridge → Arbutus Ridge).", "Validate custom row IDs against full labels; retain suppressed and missing cells as null; discard Vancouver CSD and CMA columns.", "Compute shares from matching universe denominators; apartment buildings exclude duplexes. Resident occupation shares use applicable NOC 2016 occupations, not local workplaces."]
    parks, park_source, _ = dataset("parks-polygon-representation", notes=["The source includes small plazas, street-end sites and an unnamed park, as well as large parks. It is not a census of all green space."])
    if len({p["object_id"] for p in parks}) != len(parks):
        raise ValueError("Duplicate Vancouver park-site IDs")
    rail_rows, rail_source, _ = dataset("rapid-transit-stations", notes=["Publisher coverage is limited to stations within City of Vancouver; neighbouring municipalities' stations are absent.", "Snapshot modified 2023-02-22. Do not infer that proposed stations, later openings or operational service changes are reflected."])
    stations = unique_stations(rail_rows)
    rail_source["transformations"] = ["Deduplicate exact station names; keep the westernmost then southernmost published point for multi-point interchanges.", "Measure distance to the original local-area polygon in EPSG:26910; retain stations at most 800 m away (zero inside)."]
    libraries, library_source, _ = dataset("libraries", notes=["The source metadata gives a July 2009 currency note and a 2020-11-19 dataset modification date; no claim of present-day completeness or opening status."])
    centres, centre_source, _ = dataset("community-centres", notes=["The source calls locations approximate. Dataset modified 2020-11-19; later relocations, closures and program changes are not represented reliably."])
    library_source["transformations"] = ["Exclude the Outreach Services administrative/service record; count the other branch records by publisher geo_local_area, not by proximity."]
    centre_source["transformations"] = ["Count named community-centre records by publisher geo_local_area; include Carnegie and community-service centres present in the source."]
    park_source["transformations"] = ["Intersect original polygons in EPSG:26910; count publisher object IDs with more than 1 m² overlap and compute area from the union to avoid double counting."]
    boundary_source["transformations"] = ["Use original polygons for analysis; simplify to 10 m for display and convert to WGS84 with clockwise exterior rings for D3."]
    sources = [boundary_source, census_source, park_source, rail_source, library_source, centre_source, *official_settings()]
    amenities = {key: [] for key in census}
    for rows, source_id, category in [(libraries, LIBRARY_ID, "library"), (centres, CENTRE_ID, "communityCentre")]:
        seen = set()
        for row in rows:
            if source_id == LIBRARY_ID and row["name"] == "Outreach Services":
                continue
            area = slug(row["geo_local_area"])
            unique = (area, row["name"], row["address"])
            if area not in amenities or unique in seen:
                raise ValueError(f"Invalid or duplicate Vancouver amenity: {unique}")
            seen.add(unique)
            name = row["name"] + (" Library" if category == "library" else "" if re.search(r"cent(re|er)", row["name"], re.I) else " Community Centre")
            amenities[area].append({"name": name, "category": category, "sourceId": source_id})
    park_shapes = [projected(geometry(p)) for p in parks]
    station_points = [projected(Point(s["lon"], s["lat"])) for s in stations]
    records = []
    for boundary in boundaries:
        area_id = slug(boundary["name"])
        area = projected(geometry(boundary))
        if area.is_empty or area.area <= 0:
            raise ValueError(f"Empty Vancouver local area: {area_id}")
        metrics = {key: cell(value) for key, value in census_values(census[area_id]).items()}
        spatial, park_names, nearby_stations = spatial_context(area, park_shapes, parks, stations, station_points)
        metrics.update(spatial)
        metrics["libraries"] = cell(sum(a["category"] == "library" for a in amenities[area_id]))
        metrics["communityCentres"] = cell(sum(a["category"] == "communityCentre" for a in amenities[area_id]))
        display = orient_polygons(transform(area.simplify(10, preserve_topology=True), UNPROJECT, interleaved=False), exterior_cw=True)
        record = {"id": area_id, "name": boundary["name"], "geometry": json.loads(json.dumps(mapping(display))), "metrics": metrics,
                  "parks": park_names, "stations": nearby_stations, "amenities": sorted(amenities[area_id], key=lambda a: (a["category"], a["name"])),
                  "quality": {"census": "2016; confidentiality rounding; tenure, shelter costs, occupations and commuting use 25% sample data."}}
        description = describe(record, census[area_id], sources)
        if description:
            record["description"] = description
        records.append(record)
    return {
        "schemaVersion": 1, "placeId": "vancouver", "cityName": "Vancouver", "boundarySourceId": BOUNDARY_ID,
        "boundaryVintage": "Permanent local planning areas (2016 census geography)",
        "boundaryNote": "The City's 22 local planning areas, whose boundaries the publisher says do not change. The 2016 custom census uses these same areas and includes Musqueam 2 reserve. This is not Vancouver CSD or Metro Vancouver; Stanley Park is outside these mapped local-area polygons.",
        "coverageNote": "22 local planning areas in the City of Vancouver area, including the publisher's Musqueam 2 reserve coverage. Census measures are from 2016. Park polygons, rail and facility inventories have separate dated snapshots; libraries and community centres are older inventories, and later changes may be absent. Rail coverage stops at the municipal boundary. No CSD or CMA figures are substituted for neighbourhood data.",
        "transportLabel": "Rail stations", "definitions": definitions(sources), "sources": sources,
        "neighbourhoods": sorted(records, key=lambda r: r["name"]), "stations": stations,
        "links": {"hoodmaps": "https://hoodmaps.com/vancouver-neighborhood-map", "reddit": "https://www.reddit.com/r/vancouver/", "profiles": "https://vancouver.ca/news-calendar/areas-of-the-city.aspx"},
    }


def main():
    from neighbourhoods.check import validate
    bundle = build()
    validate(bundle)
    out = PROCESSED / "neighbourhoods" / "vancouver.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"Vancouver: {len(bundle['neighbourhoods'])} local areas; {out.stat().st_size // 1024} KiB; {out}")


if __name__ == "__main__":
    main()
