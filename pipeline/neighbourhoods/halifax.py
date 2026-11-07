"""2021 census-tract profiles inside Halifax Regional Municipality.

These are explicitly labelled statistical areas, not invented neighbourhood
boundaries. Current E911 community names are locator context only. The census
geometry and measurements both use 2021 CTUIDs. See docs/neighbourhoods/halifax.md.
"""
from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.contract import PROCESSED
from common import derived_cache
from common.fetch import fetch, meta_for
from pyproj import Transformer
from shapely import make_valid, transform
from shapely.geometry import shape, Point
from shapely.strtree import STRtree
# Local helper reuse keeps the two independently runnable adapters consistent.
from neighbourhoods.victoria import arcgis_layer, cell, definition, number, ratio, source_record, spatial_metrics, total

ROOT = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/"
CENSUS_URL = "https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm"
CENSUS_PARAMS = {"Lang": "E", "FILETYPE": "CSV", "GEONO": "007"}
FIELDS = {
    1: "Population, 2021",
    8: "Total - Age groups of the population - 100% data",
    9: "0 to 14 years",
    41: "Total - Occupied private dwellings by structural type of dwelling - 100% data",
    46: "Apartment in a building that has fewer than five storeys",
    47: "Apartment in a building that has five or more storeys",
    50: "Total - Private households by household size - 100% data",
    51: "1 person",
    57: "Average household size",
    1414: "Total - Private households by tenure - 25% sample data",
    1416: "Renter",
    1494: "Median monthly shelter costs for rented dwellings ($)",
    2603: "Total - Main mode of commuting for the employed labour force aged 15 years and over with a usual place of work or no fixed workplace address - 25% sample data",
    2607: "Public transit",
    2608: "Walked",
    2609: "Bicycle",
}


def parse_profile_rows(rows, keep):
    """The CSV has repeated SYMBOL headers; the first belongs to total counts."""
    header = next(rows)
    indexes = {name: header.index(name) for name in ("CENSUS_YEAR", "DGUID", "ALT_GEO_CODE", "GEO_LEVEL", "CHARACTERISTIC_ID", "CHARACTERISTIC_NAME", "C1_COUNT_TOTAL", "TNR_SF", "TNR_LF", "DATA_QUALITY_FLAG")}
    value_col = indexes['C1_COUNT_TOTAL']
    if header[value_col + 1] != "SYMBOL":
        raise ValueError("Census count-symbol column moved")
    data = {code: {"values": {}, "quality": {}} for code in keep}
    wanted = {"2021S0507" + code for code in keep}
    for row in rows:
        if len(row) != len(header):
            raise ValueError("Unexpected Census Profile row width")
        if row[indexes['DGUID']] not in wanted:
            continue
        code = row[indexes['ALT_GEO_CODE']]
        if code not in keep or row[indexes['CENSUS_YEAR']] != '2021' or row[indexes['GEO_LEVEL']] != 'Census tract':
            raise ValueError("Census geography/year mismatch")
        char = int(row[indexes['CHARACTERISTIC_ID']])
        if char not in FIELDS:
            continue
        if row[indexes['CHARACTERISTIC_NAME']].strip() != FIELDS[char]:
            raise ValueError(f"Census characteristic changed: {char}")
        if str(char) in data[code]['values']:
            raise ValueError(f"Duplicate census cell: {code}/{char}")
        symbol = row[value_col + 1].strip()
        value = None if symbol in {'x', 'X', 'F', '..', '...'} else number(row[value_col])
        data[code]['values'][str(char)] = value
        data[code]['quality'] = {"shortFormNonResponsePercent": row[indexes['TNR_SF']] or None,
                                 "longFormNonResponsePercent": row[indexes['TNR_LF']] or None,
                                 "dataQualityFlag": row[indexes['DATA_QUALITY_FLAG']] or None}
    for code in keep:
        if set(data[code]['values']) != {str(c) for c in FIELDS}:
            raise ValueError(f"Incomplete Census Profile for {code}")
    return data


def census_profiles(keep):
    path = fetch(CENSUS_URL, params=CENSUS_PARAMS, timeout=180)
    if not zipfile.is_zipfile(path):
        raise ValueError("Statistics Canada returned a non-ZIP response for the Census Profile download")
    cache = path.with_name(path.name + '.halifax-selected.json')
    signature = derived_cache.signature(path, {"adapter": "halifax-2021-v1", "tracts": sorted(keep), "fields": {str(k): v for k, v in FIELDS.items()}})
    if derived_cache.current(cache, signature):
        data = json.loads(cache.read_text())
    else:
        with zipfile.ZipFile(path) as z:
            # The supplied starting-row index bounds the scan to Halifax's group.
            geo = list(csv.DictReader(io.TextIOWrapper(z.open('98-401-X2021007_Geo_starting_row.CSV'), encoding='cp1252')))
            wanted = {'2021S0507' + code for code in keep}
            selected = [i for i, row in enumerate(geo) if row['Geo Code'] in wanted]
            if len(selected) != len(keep):
                raise ValueError("Census starting-row index is missing a Halifax tract")
            end = int(geo[max(selected) + 1]['Line Number']) if max(selected) + 1 < len(geo) else None
            with io.TextIOWrapper(z.open('98-401-X2021007_English_CSV_data.csv'), encoding='cp1252', newline='') as stream:
                def selected_rows():
                    reader = csv.reader(stream)
                    yield next(reader)
                    for line, row in enumerate(reader, 2):
                        if end is not None and line >= end:
                            break
                        if row[1] in wanted:
                            yield row
                data = parse_profile_rows(iter(selected_rows()), keep)
        cache.write_text(json.dumps(data, sort_keys=True))
        derived_cache.mark(cache, signature)
    source = source_record("halifax-census-2021-profile", "Census Profile, 2021: Census Metropolitan Areas, Tracted Census Agglomerations and Census Tracts", "Statistics Canada",
                           "https://www150.statcan.gc.ca/n1/en/catalogue/98-401-X2021007", meta_for(path)['url'], [path], "2021",
                           licence="Statistics Canada Open Licence", notes=["Only 2021 census tract rows for areas wholly inside Halifax regional municipality (CSD 1209034) are retained. No CMA totals are assigned to tracts.",
                                "Counts other than the population and dwelling headline totals are randomly rounded. Long-form measures use the 25% sample. Commuting reflects May 2021 pandemic conditions."],
                           transformations=["Join exactly by 2021 CTUID/DGUID. Use C1_COUNT_TOTAL and its immediately following SYMBOL field; retain suppressed cells as null.",
                                "Calculate shares from matched numerator and denominator counts. Preserve published household-size averages and tract-level median tenant shelter costs."])
    source['tableId'] = '98-401-X2021007'
    return data, source


def census_metrics(profile):
    get = lambda key: profile['values'].get(str(key))
    return {key: cell(value) for key, value in {
        'population': get(1), 'households': get(50), 'children': ratio(get(9), get(8)),
        'householdSize': get(57), 'livingAlone': ratio(get(51), get(50)),
        'apartments': ratio(total([get(46), get(47)]), get(41)),
        'renters': ratio(get(1416), get(1414)), 'tenantShelter': get(1494),
        'transit': ratio(get(2607), get(2603)), 'walkCycle': ratio(total([get(2608), get(2609)]), get(2603)),
    }.items()}


def within_municipality(tract, municipality):
    fraction = tract.intersection(municipality).area / tract.area
    if 0.0001 < fraction < 0.9999:
        raise ValueError(f"A 2021 tract crosses the intended municipal boundary ({fraction:.6f}); do not clip its census counts")
    return fraction >= 0.9999


def shown(value, spec=',.0f'):
    return format(value, spec) if value is not None else 'not published'


def build():
    tracts, bs = arcgis_layer(ROOT + 'Census_2021_Census_Tracts/FeatureServer/0', '89aeb7e05c0047ebaf511e72bd66620c', 'halifax-census-tracts-2021', 'Halifax Regional Municipality / Statistics Canada', period='2021')
    municipalities, ms = arcgis_layer(ROOT + 'Census_2021_Census_Subdivisions/FeatureServer/0', '4b247c1b8cfe4cc5bd0d338d19040b0b', 'halifax-municipal-boundary-2021', 'Halifax Regional Municipality / Statistics Canada', period='2021')
    project = Transformer.from_crs(4326, 26920, always_xy=True).transform
    project_geometry = lambda geom: transform(make_valid(shape(geom)), project, interleaved=False)
    municipal = [f for f in municipalities if f['properties']['CSDUID'] == '1209034']
    if len(municipal) != 1:
        raise ValueError('Missing or duplicate Halifax municipality')
    boundary = project_geometry(municipal[0]['geometry'])
    kept = [f for f in tracts if within_municipality(project_geometry(f['geometry']), boundary)]
    keep = {f['properties']['CTUID'] for f in kept}
    if len(keep) != len(kept) or not 90 <= len(kept) <= 120:
        raise ValueError('Unexpected Halifax census tract coverage')
    data, cs = census_profiles(keep)
    communities, gs = arcgis_layer(ROOT + 'GSA/FeatureServer/0', 'b4088a068b794436bdb4e5c31df76fe2', 'halifax-community-locators', 'Halifax Regional Municipality',
                                   notes=['E911 community names provide locator context only; census counts are never attributed to these current community polygons.'])
    community_geoms = [project_geometry(f['geometry']) for f in communities]
    community_tree = STRtree(community_geoms)
    scope = '2021 census tracts wholly inside Halifax Regional Municipality (CSD 1209034); these statistical areas are not official named neighbourhoods.'
    defs = {
        'population': definition('Population', 'persons', cs['id'], 'Total population of the 2021 census tract, including people in collective dwellings.', scope),
        'households': definition('Private households', 'count', cs['id'], 'Private households by household size, 100% census data; rounded counts.', scope),
        'children': definition('Children under 15', 'percent', cs['id'], 'People aged 0–14 divided by the total age-group population; 100% census data.', scope),
        'householdSize': definition('Average household size', 'persons', cs['id'], 'Published average number of people per private household; 100% census data.', scope),
        'livingAlone': definition('One-person households', 'percent', cs['id'], 'One-person households divided by all private households; 100% census data.', scope),
        'apartments': definition('Homes in apartment buildings', 'percent', cs['id'], 'Occupied dwellings in buildings with fewer than five or five-plus storeys divided by all occupied dwellings. Duplexes excluded.', scope),
        'renters': definition('Households renting', 'percent', cs['id'], 'Renter households divided by all private households by tenure; 25% census sample.', scope),
        'tenantShelter': definition('Median tenant shelter cost', 'CAD_month', cs['id'], '2021 occupied rentals of all sizes, including utilities where applicable; 25% sample. Not current asking rents.', scope),
        'transit': definition('Commutes by public transit', 'percent', cs['id'], 'Employed people 15+ with a usual workplace or no fixed workplace; excludes working at home. 25% sample, May 2021 pandemic travel.', scope),
        'walkCycle': definition('Commutes on foot or by bike', 'percent', cs['id'], 'Walking plus cycling divided by the same commuting population; excludes working at home. 25% sample, May 2021.', scope),
    }
    records = []
    for f in kept:
        code = f['properties']['CTUID']
        # A zero-population offshore tract has no resident profile or mapped
        # services. Preserve this coverage omission instead of making a page
        # of suppressed household cells look like a residential neighbourhood.
        if data[code]['values']['1'] == 0:
            continue
        polygon = project_geometry(f['geometry'])
        intersections = [(polygon.intersection(community_geoms[int(i)]).area, communities[int(i)]['properties']['GSA_NAME']) for i in community_tree.query(polygon, predicate='intersects')]
        # Locator is explicitly contextual; do not rename the statistical unit.
        names = [name for area, name in sorted(intersections, reverse=True) if area / polygon.area >= .05]
        if not names and intersections:
            names = [max(intersections)[1]]
        context = ' / '.join(names[:3])
        metrics = census_metrics(data[code])
        if metrics['population']['value'] != f['properties']['CTPOP2021']:
            raise ValueError(f"Census population disagrees with the municipal 2021 tract layer: {code}")
        records.append({'id': 'ct-' + code.replace('.', '-'), 'name': '2021 census tract ' + code + (f' — {context}' if context else ''),
                        'geometry': f['geometry'], 'metrics': metrics,
                        'quality': {**data[code]['quality'], 'censusDguid': '2021S0507' + code, 'locatorCommunities': context or None,
                                    'geography': 'Whole 2021 census tract; community names are current geographic context only'}})
    parks_raw, ps = arcgis_layer(ROOT + 'HRM_Parks_2/FeatureServer/0', '3df29a3d088a42d890f11d027ea1c0be', 'halifax-parks', 'Halifax Regional Municipality',
                                where="PARK_TYPE <> 'CEMETERY' OR PARK_TYPE IS NULL", notes=['Parks owned by or of interest to HRM. Parcel-based polygons are approximate. The inventory includes undeveloped land and does not establish public access. Cemeteries are excluded.'])
    park_groups = {}
    for f in parks_raw:
        p = f['properties']
        pid = str(p['PARK_ID'])
        if pid not in park_groups:
            park_groups[pid] = {'id': pid, 'name': p.get('PARK_NAME') or 'Unnamed park ' + pid, 'geoms': []}
        park_groups[pid]['geoms'].append(shape(f['geometry']))
    from shapely.geometry import mapping
    from shapely.ops import unary_union
    parks = [{'id': p['id'], 'name': p['name'], 'geometry': mapping(unary_union(p['geoms']))} for p in park_groups.values()]
    raw_stops, ts = arcgis_layer(ROOT + 'Bus_Stops_2/FeatureServer/0', '29de9d04a3454e11a1e0a1f78a27bc07', 'halifax-bus-stops', 'Halifax Regional Municipality',
                                 where="BUSSTATUS = 'INS'", notes=['Only stops labelled In Service in the municipal inventory. Not a timetable or service-frequency measure.'])
    stops_by_id = {}
    for f in raw_stops:
        p = f['properties']; sid = str(p['BUSSTOPID'])
        if sid in stops_by_id:
            raise ValueError(f'Duplicate Halifax bus stop ID: {sid}')
        lon, lat = f['geometry']['coordinates'][:2]
        stops_by_id[sid] = {'id': sid, 'name': p.get('LOCATION') or 'Bus stop ' + str(p['STOPNUMBER']), 'lon': lon, 'lat': lat}
    facilities, fs = arcgis_layer(ROOT + 'BuildingSymbol/FeatureServer/0', '4d44051e006b457580ab4d86fa30c949', 'halifax-community-facilities', 'Halifax Regional Municipality',
                                  where="FCODE IN ('BLISLB','BLRCCC','BLRCRF','BLRCMU','BLRCAG','BLRCTR','BLTRFT')", notes=['Mapped library, community centre, recreation, museum, gallery, theatre and ferry-terminal symbols. Inventory presence does not establish opening hours, admission or service availability.'])
    categories = {'BLISLB': 'Library', 'BLRCCC': 'Community centre', 'BLRCRF': 'Recreation facility', 'BLRCMU': 'Museum', 'BLRCAG': 'Art gallery', 'BLRCTR': 'Theatre', 'BLTRFT': 'Ferry terminal'}
    amenities = [{'name': f['properties'].get('LABEL') or categories[f['properties']['FCODE']], 'category': categories[f['properties']['FCODE']], 'geometry': f['geometry']} for f in facilities]
    defs.update({
        'parkland': definition('Mapped park area', 'percent', ps['id'], 'Share of the tract polygon covered by the union of HRM park inventory polygons, excluding cemeteries; overlaps counted once. Includes undeveloped land and does not establish public access.', scope, ps['referencePeriod']),
        'parks': definition('Park sites overlapping the tract', 'count', ps['id'], 'Distinct PARK_IDs with more than 1 m² inside the tract. A site spanning several tracts may appear in each; parcel boundaries are approximate.', scope, ps['referencePeriod']),
        'busStops': definition('Bus stops in or near the tract', 'count', ts['id'], 'Distinct in-service BUSSTOPIDs inside or within 800 m of the whole tract polygon. Straight-line distance; not walking access from a home or service frequency.', scope, ts['referencePeriod']),
        'communityCentres': definition('Mapped community centres', 'count', fs['id'], 'Building-symbol points classified Community Centre inside the tract. Boundary points can appear in both adjacent tracts.', scope, fs['referencePeriod']),
        'libraries': definition('Mapped libraries', 'count', fs['id'], 'Building-symbol points classified Library inside the tract. Inventory count, not a comprehensive audit of available public services.', scope, fs['referencePeriod']),
    })
    map_stops = spatial_metrics(records, parks, list(stops_by_id.values()), amenities, crs=26920, park_source=ps['id'], stop_source=ts['id'], amenity_source=fs['id'])
    sources = [bs, ms, gs, cs, ps, ts, fs]
    for r in records:
        r['metrics']['libraries'] = cell(sum(a['category'] == 'Library' for a in r['amenities']))
        v = {k: metric['value'] for k, metric in r['metrics'].items()}
        park_names = ', '.join(r['parks'][:4])
        facility_names = ', '.join(a['name'] for a in r['amenities'][:4])
        r['description'] = {'verifiedAt': max(s['retrievedAt'] for s in sources)[:10], 'sections': [
            {'heading': 'Statistical area and residents', 'kind': 'measured', 'sourceIds': [bs['id'], ms['id'], gs['id'], cs['id']],
             'text': f"This is a whole 2021 census tract inside Halifax Regional Municipality. The locator name ({r['quality']['locatorCommunities'] or 'not available'}) comes from current municipal E911 community boundaries and does not define the census area. The census population was {shown(v['population'])}; children under 15 accounted for {shown(v['children'], '.1f')}%."},
            {'heading': 'Households and housing', 'kind': 'measured', 'sourceIds': [cs['id']],
             'text': f"The 2021 profile reports {shown(v['households'])} private households, with an average of {shown(v['householdSize'], '.1f')} people per household. One-person households accounted for {shown(v['livingAlone'], '.1f')}%, apartments in buildings for {shown(v['apartments'], '.1f')}% of occupied homes, and renter households for {shown(v['renters'], '.1f')}%. " + (f"Median tenant shelter cost was ${shown(v['tenantShelter'])} a month for occupied rentals of all sizes, not current asking rent." if v['tenantShelter'] is not None else 'Median tenant shelter cost was not published or was suppressed for this tract.')},
            {'heading': 'Parks and local facilities', 'kind': 'measured', 'sourceIds': [ps['id'], fs['id']],
             'text': f"The municipal inventory maps {shown(v['parks'])} park sites overlapping the tract, occupying {shown(v['parkland'], '.1f')}% of its polygon." + (f" Listed sites include {park_names}." if park_names else '') + (f" Mapped facilities inside the tract include {facility_names}." if facility_names else ' There are no selected facility points inside the tract in this inventory; this does not establish that all local amenities are absent.') + ' Park polygons can include undeveloped land; public access and opening hours require a separate check.'},
            {'heading': 'Getting around', 'kind': 'measured', 'sourceIds': [cs['id'], ts['id']],
             'text': f"The 2021 commuting sample reports {shown(v['transit'], '.1f')}% using public transit and {shown(v['walkCycle'], '.1f')}% walking or cycling, excluding people working at home. The separately dated bus inventory lists {shown(v['busStops'])} in-service stop IDs inside or within 800 m of the tract. This distance is to the whole polygon, so a large rural tract can include stops far from a particular home; it is not a service-frequency or walkability score."},
        ]}
    return {'schemaVersion': 1, 'placeId': 'halifax', 'cityName': 'Halifax', 'areaType': 'census tract', 'boundarySourceId': bs['id'], 'boundaryVintage': '2021',
            'boundaryNote': 'Whole 2021 census tracts wholly inside Halifax Regional Municipality (2021 CSD 1209034). These are statistical areas, not official neighbourhoods. Current E911 community names are locator context only; no census values are assigned to those community boundaries.',
            'coverageNote': f"{len(records)} inhabited census tracts within the 2021 Halifax regional municipality. The zero-population tract 2050155.00 is omitted. Four reserve census subdivisions in the municipal source layer are separate jurisdictions and are excluded; East Hants and other Halifax CMA areas are not included. Large rural tracts are less local than urban tracts. Census observations are from 2021; services use separately dated snapshots.",
            'definitions': defs, 'sources': sources, 'neighbourhoods': sorted(records, key=lambda r: r['id']), 'stations': map_stops,
            'links': {'hoodmaps': 'https://hoodmaps.com/halifax-neighborhood-map', 'reddit': 'https://www.reddit.com/r/halifax/', 'profiles': 'https://data-hrm.hub.arcgis.com/'}}


if __name__ == '__main__':
    bundle = build()
    out = PROCESSED / 'neighbourhoods' / 'halifax.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    print(f"Halifax: {len(bundle['neighbourhoods'])} census tracts; {out.stat().st_size // 1024} KiB")
