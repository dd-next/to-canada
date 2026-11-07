"""Independent source reconciliation for the third neighbourhood release."""
import json
import unittest
from pathlib import Path
from urllib.parse import unquote

from pyproj import Transformer
from shapely import transform
from shapely.geometry import Point, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).with_name("fixtures") / "validation" / "stage3-oracle.json"


def percentage(part, whole):
    return None if part is None or whole is None or whole <= 0 or part > whole else 100 * part / whole


class WinnipegSourceReconciliation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oracle = json.loads(FIXTURE.read_text())["cities"]["winnipeg"]
        cls.bundle = json.loads((ROOT / "data" / "processed" / "neighbourhoods" / "winnipeg.json").read_text())
        cls.rows = {row["id"]: row for row in cls.bundle["neighbourhoods"]}

    def test_all_census_metrics_match_original_2016_cells(self):
        self.assertEqual(set(self.rows), set(self.oracle["rows"]))
        self.assertEqual(len(self.rows), 194)
        for code, source in self.oracle["rows"].items():
            with self.subTest(area=code):
                row = self.rows[code]
                self.assertEqual(row["name"], source["name"])
                cells = dict(zip(self.oracle["columns"], source["cells"]))
                values = {key: cells[key] for key in ("population", "households")}
                values.update({
                    "children": percentage(cells["children"], cells["population"]),
                    "householdSize": cells["private_people"] / cells["households"],
                    "livingAlone": percentage(cells["one_person"], cells["households"]),
                    "apartments": percentage(cells["low"] + cells["high"], cells["dwellings"]),
                    "renters": percentage(cells["renters"], cells["tenure"]),
                    "tenantShelter": cells["tenantShelter"] if cells["tenant_total"] > 0 and cells["tenantShelter"] > 0 else None,
                    "transit": percentage(cells["transit"], cells["commuters"]),
                    "walkCycle": percentage(cells["walk"] + cells["bike"], cells["commuters"]),
                })
                for key, value in values.items():
                    actual = row["metrics"][key]["value"]
                    self.assertEqual(self.bundle["definitions"][key]["period"], "2016")
                    if value is None or key in {"population", "households", "tenantShelter"}:
                        self.assertEqual(actual, value, key)
                    else:
                        self.assertIsNotNone(actual, key)
                        self.assertAlmostEqual(actual, value, delta=0.050000001, msg=key)
                    if value is None:
                        self.assertTrue(row["metrics"][key].get("missingReason"), key)

    def test_ambiguous_costs_and_rounding_do_not_become_false_zeroes(self):
        self.assertEqual(self.oracle["royalwoodCostCells"], {"1763": 25, "1766": 0, "1767": 2126})
        # A positive average does not reveal why the source median is zero.
        # The release intentionally withholds that ambiguous estimate.
        self.assertIsNone(self.rows["ne158158"]["metrics"]["tenantShelter"]["value"])
        missing = {code for code, row in self.rows.items() if row["metrics"]["tenantShelter"]["value"] is None}
        self.assertEqual(missing, set(self.oracle["missingTenantCosts"]))
        self.assertEqual(len(missing), 24)
        self.assertIsNone(self.rows["ne134134"]["metrics"]["apartments"]["value"])
        self.assertEqual(self.rows["ne001001"]["metrics"]["renters"]["value"], 0)
        self.assertEqual(self.bundle["stations"], [])
        self.assertNotIn("rail", self.bundle["definitions"])
        self.assertTrue(all(row["stations"] == [] for row in self.rows.values()))

    def test_display_geometry_preserves_2016_coverage_and_winding(self):
        project = Transformer.from_crs(4326, self.oracle["crs"], always_xy=True).transform
        for code, row in self.rows.items():
            with self.subTest(area=code):
                source = self.oracle["rows"][code]
                geometry = shape(row["geometry"])
                self.assertTrue(geometry.is_valid)
                self.assertFalse(geometry.is_empty)
                for polygon in ([geometry] if geometry.geom_type == "Polygon" else geometry.geoms):
                    self.assertFalse(polygon.exterior.is_ccw)
                    self.assertTrue(all(ring.is_ccw for ring in polygon.interiors))
                projected = transform(geometry, project, interleaved=False)
                self.assertLess(abs(projected.area / source["originalAreaM2"] - 1), 0.02)
                for actual, original in zip(projected.bounds, source["originalBounds"]):
                    self.assertLess(abs(actual - original), 20)


class QuebecSourceReconciliation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oracle = json.loads(FIXTURE.read_text())["cities"]["quebec-city"]
        cls.bundle = json.loads((ROOT / "data" / "processed" / "neighbourhoods" / "quebec-city.json").read_text())
        cls.rows = {row["id"]: row for row in cls.bundle["neighbourhoods"]}

    def test_all_315_observations_match_own_profile_highlights(self):
        self.assertEqual(set(self.rows), set(self.oracle["rows"]))
        self.assertEqual(len(self.rows), 35)
        sources = {source["id"]: source for source in self.bundle["sources"]}
        for code, source in self.oracle["rows"].items():
            with self.subTest(area=code):
                row = self.rows[code]
                self.assertEqual(row["name"], source["name"])
                self.assertEqual(row["quality"]["municipalBoundaryId"], str(source["boundaryId"]))
                profile = sources[row["quality"]["profileSourceId"]]
                self.assertEqual(unquote(profile["url"]), unquote(source["profileUrl"]))
                for key, value in zip(self.oracle["columns"], source["cells"]):
                    self.assertEqual(row["metrics"][key]["value"], value, key)
                    self.assertEqual(self.bundle["definitions"][key]["period"], "2021", key)
        # Published private-household and dwelling counts use distinct rounded
        # source observations. Do not force them to agree or recompute size.
        saint_roch = self.rows["1-2"]["metrics"]
        self.assertEqual(saint_roch["households"]["value"], 5320)
        self.assertEqual(saint_roch["occupiedDwellings"]["value"], 5310)
        self.assertEqual(saint_roch["householdSize"]["value"], 1.6)
        self.assertEqual(saint_roch["lowRiseApartments"]["value"], 70.8)
        self.assertNotIn("apartments", self.bundle["definitions"])

    def test_inventory_counts_keep_partial_coverage_and_distinct_sites(self):
        for code, source in self.oracle["rows"].items():
            with self.subTest(area=code):
                row = self.rows[code]
                for key, expected in source["inventoryCounts"].items():
                    self.assertEqual(row["metrics"][key]["value"], expected, key)
                self.assertEqual(len(set(row["parks"])), source["inventoryCounts"]["parks"])
                self.assertEqual(row["stations"], [])
        self.assertEqual(sum(r["metrics"]["libraries"]["value"] for r in self.rows.values()), 27)
        # Maison de la Littérature appears twice in the source, 21.094 m apart.
        self.assertEqual(self.rows["1-1"]["metrics"]["libraries"]["value"], 1)
        self.assertEqual(sum(r["metrics"]["busStops"]["value"] for r in self.rows.values()), 4042)
        self.assertEqual(self.oracle["inventoryCounts"]["busStops"]["outside"], 276)
        self.assertIn("School, dog and linear", self.bundle["definitions"]["parks"]["label"])
        self.assertNotIn("parkland", self.bundle["definitions"])
        self.assertNotIn("rail", self.bundle["definitions"])
        self.assertEqual(self.bundle["stations"], [])

    def test_municipal_geometry_and_current_names_match_profile_codes(self):
        project = Transformer.from_crs(4326, self.oracle["crs"], always_xy=True).transform
        geometries = []
        for code, row in self.rows.items():
            with self.subTest(area=code):
                source = self.oracle["rows"][code]
                geometry = shape(row["geometry"])
                self.assertTrue(geometry.is_valid)
                self.assertFalse(geometry.is_empty)
                for polygon in ([geometry] if geometry.geom_type == "Polygon" else geometry.geoms):
                    self.assertFalse(polygon.exterior.is_ccw)
                    self.assertTrue(all(ring.is_ccw for ring in polygon.interiors))
                projected = transform(geometry, project, interleaved=False)
                geometries.append(projected)
                self.assertLess(abs(projected.area / source["originalAreaM2"] - 1), 0.003)
                for actual, original in zip(projected.bounds, source["originalBounds"]):
                    self.assertLess(abs(actual - original), 15)
        municipal_coverage = unary_union(geometries)
        for name, coordinates in self.oracle["municipalExclusionPoints"].items():
            point = transform(Point(*coordinates), project, interleaved=False)
            self.assertFalse(municipal_coverage.covers(point), name)
        # The 2026 annex has two swapped headings. Article 1, the profile maps,
        # current boundary names and independent title matching agree here.
        self.assertEqual(self.rows["5-1"]["name"], "Sainte-Thérèse-de-Lisieux")
        self.assertEqual(self.rows["5-4"]["name"], "Vieux-Bourg")
        self.assertEqual(self.rows["5-1"]["quality"]["municipalBoundaryId"], "24")
        self.assertEqual(self.rows["5-4"]["quality"]["municipalBoundaryId"], "27")


if __name__ == "__main__":
    unittest.main()
