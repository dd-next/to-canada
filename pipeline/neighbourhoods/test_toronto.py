"""Offline source-value, missing-data and geography regressions for Toronto."""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from neighbourhoods import toronto
from neighbourhoods.check import validate
from shapely.geometry import box, mapping, shape

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).with_name("fixtures") / "toronto"


def profile_rows():
    raw = json.loads((FIXTURES / "profile_cells.json").read_text())["rows"]
    rows = [[None] * 6 for _ in range(max(map(int, raw)))]
    for row, values in raw.items():
        rows[int(row) - 1] = values
    return rows


class TorontoTests(unittest.TestCase):
    def test_published_sample_values_and_distinct_denominators(self):
        profiles = toronto.parse_profile_rows(profile_rows(), expected_count=5)
        values = {key: metric["value"] for key, metric in profiles["95"]["metrics"].items()}
        # Annex's household total is 16,330 but dwelling/tenure totals are 16,325.
        self.assertEqual(values["population"], 29300)
        self.assertEqual(values["households"], 16330)
        self.assertEqual(values["apartments"], 82.3)  # (4535 + 8895) / 16325
        self.assertEqual(values["livingAlone"], 49.4)  # 8065 / 16330
        self.assertEqual(values["renters"], 59.1)  # 9655 / 16325
        self.assertEqual(values["walkCycle"], 32.5)  # (1715 + 615) / 7175
        self.assertEqual(profiles["55"]["metrics"]["children"]["value"], 24.4)
        self.assertEqual(profiles["165"]["metrics"]["tenantShelter"]["value"], 2020)
        self.assertEqual(profiles["55"]["metrics"]["detached"]["value"], 0)
        leading = max(profiles["95"]["occupations"], key=lambda o: o["count"])
        self.assertEqual(leading["name"], "Business, finance and administration occupations")
        self.assertEqual(leading["share"], 24.9)  # 4555 / 18295 applicable occupations

    def test_suppression_propagates_but_observed_zero_survives(self):
        rows = profile_rows()
        rows[301][1] = "x"
        rows[221][2] = "..."
        rows[225][3] = 0
        profiles = toronto.parse_profile_rows(rows, expected_count=5)
        for code, metric in (("1", "renters"), ("55", "apartments"), ("87", "livingAlone")):
            self.assertIsNone(profiles[code]["metrics"][metric]["value"])
            self.assertTrue(profiles[code]["metrics"][metric]["missingReason"])
        self.assertEqual(toronto.number(0), 0)
        self.assertIsNone(toronto.number("F"))
        self.assertIsNone(toronto.ratio(2, 1))
        for value in (float("nan"), float("inf"), -1):
            with self.assertRaises(ValueError):
                toronto.number(value)

    def test_changed_rows_duplicate_codes_and_wrong_model_fail(self):
        rows = profile_rows()
        rows[216][0] = "A different dwelling denominator"
        with self.assertRaisesRegex(ValueError, "Profile row 217 changed"):
            toronto.parse_profile_rows(rows, expected_count=5)
        rows = profile_rows()
        rows[1][2] = rows[1][1]
        with self.assertRaisesRegex(ValueError, "unique 158-model"):
            toronto.parse_profile_rows(rows, expected_count=5)
        with self.assertRaisesRegex(ValueError, "unique 158-model"):
            toronto.parse_profile_rows(profile_rows())
        with self.assertRaisesRegex(ValueError, "boundaries.*do not match"):
            toronto.join_boundaries([], {})

    def test_boundary_name_and_geography_match_are_mandatory(self):
        features = [{"properties": {"AREA_SHORT_CODE": str(i).zfill(3), "AREA_NAME": f"Area {i}"},
                     "geometry": mapping(box(-79.4, 43.7, -79.39, 43.71))} for i in range(1, 159)]
        profiles = {str(i): {"name": f"Area {i}", "metrics": {}} for i in range(1, 159)}
        self.assertEqual(len(toronto.join_boundaries(features, profiles)), 158)
        features[0]["properties"]["AREA_NAME"] = "Old area name"
        with self.assertRaisesRegex(ValueError, "name/vintage mismatch"):
            toronto.join_boundaries(features, profiles)
        self.assertEqual(toronto.normalized_name("O`Connor Parkview"), toronto.normalized_name("O'Connor-Parkview"))

    def test_missing_platform_parent_requires_unique_nearby_exact_name(self):
        platform = {"stop_id": "13853", "stop_name": "Spadina Station - Northbound Platform", "parent_station": "", "stop_lon": "-79.405189", "stop_lat": "43.670249", "location_type": "0"}
        parent = {"stop_id": "43282", "stop_name": "Spadina", "parent_station": "", "stop_lon": "-79.403786", "stop_lat": "43.667149", "location_type": "1"}
        stops = {s["stop_id"]: s for s in (platform, parent)}
        self.assertEqual(toronto.station_parent(platform, stops)["stop_id"], "43282")
        wrong = copy.deepcopy(stops)
        wrong["43282"]["stop_name"] = "Other station"
        with self.assertRaisesRegex(ValueError, "unambiguous nearby"):
            toronto.station_parent(platform, wrong)
        far = copy.deepcopy(stops)
        far["43282"]["stop_lon"] = "-79.5"
        with self.assertRaisesRegex(ValueError, "unambiguous nearby"):
            toronto.station_parent(platform, far)
        duplicate = {**stops, "other": {**parent, "stop_id": "other"}}
        with self.assertRaisesRegex(ValueError, "unambiguous nearby"):
            toronto.station_parent(platform, duplicate)

    def test_parks_filter_other_spaces_and_dissolve_site_parts(self):
        features = [{"properties": {"AREA_CLASS": kind, "AREA_LONG_CODE": code, "AREA_NAME": name}, "geometry": mapping(geometry)}
                    for kind, code, name, geometry in [
                        ("Park", "1", "SAMPLE PARK", box(-79.4, 43.7, -79.39, 43.71)),
                        ("Park", "1", "SAMPLE PARK", box(-79.395, 43.7, -79.385, 43.71)),
                        ("OTHER_CITY", "2", "OTHER OPEN SPACE", box(-79.5, 43.7, -79.4, 43.8))]]
        parks = toronto.park_records(features)
        self.assertEqual(len(parks), 1)
        self.assertEqual(parks[0]["name"], "Sample Park")
        self.assertTrue(parks[0]["shape"].is_valid)
        single = toronto.park_records(features[:1])[0]["shape"].area
        self.assertGreater(parks[0]["shape"].area, single * 1.4)
        self.assertLess(parks[0]["shape"].area, single * 1.6)

    def test_committed_bundle_geography_sources_and_descriptions(self):
        bundle = json.loads((ROOT / "data/processed/neighbourhoods/toronto.json").read_text())
        self.assertEqual(validate(bundle), 158)
        self.assertEqual(sum("description" in row for row in bundle["neighbourhoods"]), 10)
        self.assertNotIn("14", {row["id"] for row in bundle["neighbourhoods"]})
        self.assertIn("159", {row["id"] for row in bundle["neighbourhoods"]})
        rounded = next(row for row in bundle["neighbourhoods"] if row["id"] == "170")
        self.assertIsNone(rounded["metrics"]["apartments"]["value"])
        self.assertIn("rounded component counts", rounded["metrics"]["apartments"]["missingReason"])
        station_names = [s["name"] for s in bundle["stations"]]
        self.assertEqual(station_names.count("Spadina"), 1)
        self.assertNotIn("Vaughan Metropolitan Centre", station_names)
        self.assertNotIn("Highway 407", station_names)
        for row in bundle["neighbourhoods"]:
            geometry = shape(row["geometry"])
            polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
            self.assertTrue(geometry.is_valid)
            self.assertTrue(all(not polygon.exterior.is_ccw for polygon in polygons))
            self.assertTrue(all(ring.is_ccw for polygon in polygons for ring in polygon.interiors))
            if row.get("description"):
                self.assertEqual(len(row["description"]["sections"]), 7)
                self.assertEqual(row["description"]["sections"][0]["heading"], "Everyday setting")
        self.assertIn("not current asking rent", bundle["definitions"]["tenantShelter"]["note"])


if __name__ == "__main__":
    unittest.main()
