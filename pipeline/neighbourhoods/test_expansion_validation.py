"""Independent offline reconciliation of released city bundles to source cells.

The fixture was extracted directly from the official cached workbook/CSV and
original boundaries, without importing the adapters under test. Census rows
must be deliberately re-reviewed if the observation period or geography changes.
Live inventory checks are documented in docs/neighbourhoods/validation.md.
"""
import json
import unittest
from pathlib import Path

from pyproj import Transformer
from shapely import transform
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).with_name("fixtures") / "validation" / "census-and-boundary-oracle.json"


def percentage(numerator, denominator):
    if numerator is None or denominator is None or denominator <= 0 or numerator > denominator:
        return None
    return numerator / denominator * 100


class ExpansionSourceReconciliation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oracle = json.loads(FIXTURE.read_text())["cities"]
        cls.bundles = {
            city: json.loads((ROOT / "data" / "processed" / "neighbourhoods" / f"{city}.json").read_text())
            for city in cls.oracle
        }

    def test_all_census_values_against_independent_source_cells(self):
        for city, expected in self.oracle.items():
            bundle = self.bundles[city]
            actual = {row["id"]: row for row in bundle["neighbourhoods"]}
            self.assertEqual(set(actual), set(expected["rows"]), city)
            for code, original in expected["rows"].items():
                with self.subTest(city=city, area=code):
                    row = actual[code]
                    self.assertEqual(row["name"], original["name"])
                    cells = dict(zip(expected["columns"], original["cells"]))
                    values = {key: cells[key] for key in ("population", "households", "householdSize", "tenantShelter")}
                    values.update({
                        "children": percentage(cells["children"], cells["age_total"]) if city == "toronto" else cells["children"],
                        "livingAlone": percentage(cells["one_person"], cells["households"]),
                        "apartments": percentage(cells["low"] + cells["high"], cells["dwellings"]),
                        "detached": percentage(cells["detached"], cells["dwellings"]),
                        "renters": percentage(cells["renters"], cells["tenure"]),
                        "transit": percentage(cells["transit"], cells["commuters"]),
                        "walkCycle": percentage(cells["walk"] + cells["bike"], cells["commuters"]),
                    })
                    if city == "vancouver":
                        values["duplex"] = percentage(cells["duplex"], cells["dwellings"])
                    for key, value in values.items():
                        actual_value = row["metrics"][key]["value"]
                        if value is None or key in {"population", "households", "householdSize", "tenantShelter"}:
                            self.assertEqual(actual_value, value, key)
                        else:
                            # Either rounding direction is valid at an exact
                            # half-tenth; binary arithmetic can straddle that tie.
                            self.assertIsNotNone(actual_value, key)
                            self.assertAlmostEqual(actual_value, value, delta=0.050000001, msg=key)
                        self.assertEqual(bundle["definitions"][key]["period"], expected["censusPeriod"], key)
                        if value is None:
                            self.assertTrue(row["metrics"][key].get("missingReason"), key)

    def test_display_geometry_keeps_original_local_area_coverage(self):
        for city, expected in self.oracle.items():
            project = Transformer.from_crs(4326, expected["crs"], always_xy=True).transform
            for row in self.bundles[city]["neighbourhoods"]:
                with self.subTest(city=city, area=row["id"]):
                    original = expected["rows"][row["id"]]
                    geometry = shape(row["geometry"])
                    self.assertFalse(geometry.is_empty)
                    self.assertTrue(geometry.is_valid)
                    polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
                    for polygon in polygons:
                        self.assertFalse(polygon.exterior.is_ccw, "D3 needs clockwise exterior rings")
                        self.assertTrue(all(ring.is_ccw for ring in polygon.interiors))
                    projected = transform(geometry, project, interleaved=False)
                    # Small display simplification is allowed, not lost islands,
                    # whole-globe inversions, or a different neighbourhood polygon.
                    self.assertLess(abs(projected.area / original["originalAreaM2"] - 1), 0.02)
                    for current, source in zip(projected.bounds, original["originalBounds"]):
                        self.assertLess(abs(current - source), 20)

    def test_rounding_conflict_is_unavailable_and_real_zeros_remain_zero(self):
        toronto = {row["id"]: row for row in self.bundles["toronto"]["neighbourhoods"]}
        cells = dict(zip(self.oracle["toronto"]["columns"], self.oracle["toronto"]["rows"]["170"]["cells"]))
        self.assertGreater(cells["low"] + cells["high"], cells["dwellings"])
        self.assertIsNone(toronto["170"]["metrics"]["apartments"]["value"])
        self.assertEqual(toronto["165"]["metrics"]["detached"]["value"], 0)
        self.assertEqual(toronto["44"]["metrics"]["detached"]["value"], 0)


if __name__ == "__main__":
    unittest.main()
