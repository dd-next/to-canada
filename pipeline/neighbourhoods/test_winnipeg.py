"""Offline checks for Winnipeg source parsing, denominator rules and attribution."""
import copy
import io
import json
import sys
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from neighbourhoods.winnipeg import (
    census_index, census_metrics, gtfs_stops, nearby_stops, number,
    park_inventory, park_overlap, share,
)
from shapely.geometry import Point, box, shape, mapping
from shapely.strtree import STRtree

FIXTURE = Path(__file__).parent / "fixtures" / "winnipeg" / "census-2016.json"


class CensusTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = json.loads(FIXTURE.read_text())
        cls.index = census_index(cls.rows)

    def test_official_profile_examples(self):
        agassiz = census_metrics(self.index, "NE001001")
        self.assertEqual(agassiz["population"]["value"], 365)
        self.assertEqual(agassiz["households"]["value"], 155)
        self.assertEqual(agassiz["householdSize"]["value"], 2.3)
        self.assertEqual(agassiz["livingAlone"]["value"], 16.1)
        self.assertEqual(agassiz["renters"]["value"], 0)
        self.assertIsNone(agassiz["tenantShelter"]["value"])
        osborne = census_metrics(self.index, "NE149149")
        self.assertEqual(osborne["population"]["value"], 4750)
        self.assertEqual(osborne["households"]["value"], 2995)
        self.assertEqual(osborne["apartments"]["value"], 95.7)
        self.assertEqual(osborne["tenantShelter"]["value"], 844)
        self.assertEqual(osborne["transit"]["value"], 26.9)
        self.assertEqual(osborne["walkCycle"]["value"], 25.0)
        sage = census_metrics(self.index, "NE159159")
        self.assertEqual(sage["population"]["value"], 4790)
        self.assertEqual(sage["households"]["value"], 1570)
        self.assertEqual(sage["renters"]["value"], 19.1)

    def test_suppression_and_missing_are_not_zero(self):
        for raw in [None, "", "x", "F", "..", "..."]:
            self.assertIsNone(number(raw))
        self.assertEqual(number("0"), 0)
        missing = census_metrics({}, "absent")
        self.assertTrue(all(m["value"] is None and m["missingReason"] for m in missing.values()))

    def test_partial_apartment_numerator_and_invalid_denominator(self):
        index = copy.deepcopy(self.index)
        index[("NE149149", 1725)].pop("value")
        self.assertIsNone(census_metrics(index, "NE149149")["apartments"]["value"])
        self.assertIsNone(share(105, 100))
        self.assertIsNone(share(0, 0))
        self.assertIsNone(share(None, 100))

    def test_zero_cost_with_tenants_is_unknown(self):
        index = copy.deepcopy(self.index)
        index[("NE149149", 1766)]["value"] = "0"
        cost = census_metrics(index, "NE149149")["tenantShelter"]
        self.assertIsNone(cost["value"])
        self.assertIn("not treated as $0", cost["missingReason"])

    def test_real_zero_median_has_no_zero_rent_inference(self):
        rows = json.loads((FIXTURE.parent / "tenant-cost-ambiguity.json").read_text())
        values = {int(r["description_id"]): number(r["value"]) for r in rows}
        self.assertEqual(values, {1763: 25, 1766: 0, 1767: 2126})
        index = census_index([r for r in rows if int(r["description_id"]) != 1767])
        self.assertIsNone(census_metrics(index, "NE158158")["tenantShelter"]["value"])

    def test_reject_duplicate_wrong_vintage_or_changed_characteristic(self):
        with self.assertRaisesRegex(ValueError, "Duplicate census cell"):
            census_index(self.rows + self.rows[:1])
        for key, value in [("year", "2021"), ("boundary_type", "Ward"), ("sex", "Female"), ("description", "Total population")]:
            row = {**self.rows[0], key: value}
            with self.assertRaises(ValueError):
                census_index([row])


class SpatialTest(unittest.TestCase):
    def test_union_area_and_touching_sites(self):
        area = box(0, 0, 100, 100)
        parks = [
            {"id": "a", "name": "A", "geometry": box(0, 0, 20, 100)},
            {"id": "b", "name": "B", "geometry": box(10, 0, 30, 100)},
            {"id": "c", "name": "Touching only", "geometry": box(100, 0, 200, 100)},
        ]
        proportion, names = park_overlap(area, parks, STRtree([p["geometry"] for p in parks]))
        self.assertEqual(proportion, 30)
        self.assertEqual(names, ["A", "B"])

    def test_park_ids_are_deduplicated_before_counting(self):
        polygon = mapping(box(-97.2, 49.8, -97.19, 49.81))
        rows = [{"park_id": "1", "park_name": "One site", "polygon": polygon}] * 2
        parks = park_inventory(rows)
        self.assertEqual(len(parks), 1)
        self.assertGreater(parks[0]["geometry"].area, 0)

    def test_bus_distances_are_to_polygon_and_stop_ids_remain_distinct(self):
        polygon = box(0, 0, 100, 100)
        points = [Point(50, 50), Point(900, 50), Point(901, 50)]
        stations = [{"id": str(i), "name": "Same stop name", "lon": -97.1, "lat": 49.9} for i in range(3)]
        result = nearby_stops(polygon, stations, points, STRtree(points))
        self.assertEqual([s["id"] for s in result], ["0", "1"])
        self.assertEqual([s["distanceToBoundaryM"] for s in result], [0, 800])


class TransitTest(unittest.TestCase):
    def test_only_scheduled_bus_boarding_stops(self):
        files = {
            "feed_info.txt": "feed_start_date,feed_end_date\n20260906,20261212\n",
            "routes.txt": "route_id,route_type\nbus,3\nrail,2\n",
            "trips.txt": "trip_id,route_id\nbus-trip,bus\nrail-trip,rail\n",
            "stop_times.txt": "trip_id,stop_id\nbus-trip,a\nrail-trip,b\n",
            "stops.txt": "stop_id,stop_name,stop_lat,stop_lon,location_type\na,Bus,49.9,-97.1,0\nb,Rail,49.9,-97.2,0\nc,Unused,49.9,-97.3,0\n",
        }
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            for filename, contents in files.items():
                archive.writestr(filename, contents)
        stream.seek(0)
        stops, start, end = gtfs_stops(stream)
        self.assertEqual([s["id"] for s in stops], ["a"])
        self.assertEqual((start, end), ("2026-09-06", "2026-12-12"))


class SnapshotTest(unittest.TestCase):
    def test_published_bundle_contract_and_vintage(self):
        path = Path(__file__).resolve().parents[2] / "data" / "processed" / "neighbourhoods" / "winnipeg.json"
        bundle = json.loads(path.read_text())
        self.assertEqual(bundle["boundaryVintage"], "2016")
        self.assertEqual(len(bundle["neighbourhoods"]), 194)
        self.assertNotIn("transportLabel", bundle)
        self.assertEqual(bundle["stations"], [])
        self.assertNotIn("rail", bundle["definitions"])
        self.assertEqual(bundle["definitions"]["population"]["period"], "2016")
        source_ids = {s["id"] for s in bundle["sources"]}
        for row in bundle["neighbourhoods"]:
            self.assertEqual(set(row["metrics"]), set(bundle["definitions"]))
            self.assertGreater(row["metrics"]["population"]["value"], 0)
            self.assertGreater(row["metrics"]["households"]["value"], 0)
            self.assertEqual(row["stations"], [])
            self.assertGreaterEqual(row["metrics"]["busStops"]["value"], 0)
            self.assertEqual(row["metrics"]["parks"]["value"], len(row["parks"]))
            self.assertTrue(all(a["sourceId"] in source_ids for a in row["amenities"]))
            self.assertTrue(all(0 <= s["distanceToBoundaryM"] <= 800 for s in row["stations"]))
            geometry = shape(row["geometry"])
            self.assertTrue(geometry.is_valid)
            polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
            self.assertTrue(all(not polygon.exterior.is_ccw for polygon in polygons))
            for key, metric in row["metrics"].items():
                if metric["value"] is None:
                    self.assertTrue(metric["missingReason"])
                elif bundle["definitions"][key]["unit"] == "percent":
                    self.assertLessEqual(metric["value"], 100)


if __name__ == "__main__":
    unittest.main()
