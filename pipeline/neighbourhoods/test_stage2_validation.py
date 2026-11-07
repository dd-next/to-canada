"""Independent source reconciliation for Halifax and Victoria snapshots.

The fixture comes from raw official source tables, not adapter return values.
It preserves the whole-tract selection and Victoria comparison-area components.
"""
import json
import unittest
from pathlib import Path

from pyproj import Transformer
from shapely import transform
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).with_name("fixtures") / "validation" / "stage2-oracle.json"


def share(part, whole):
    return None if part is None or whole is None or whole <= 0 or part > whole else part / whole * 100


class StageTwoSourceReconciliation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oracle = json.loads(FIXTURE.read_text())["cities"]
        cls.bundles = {
            city: json.loads((ROOT / "data" / "processed" / "neighbourhoods" / f"{city}.json").read_text())
            for city in cls.oracle
        }
        cls.rows = {
            city: {(row["quality"]["censusDguid"].removeprefix("2021S0507") if city == "halifax" else row["id"]): row
                   for row in bundle["neighbourhoods"]}
            for city, bundle in cls.bundles.items()
        }

    def test_census_counts_and_ratios_against_source(self):
        for city, expected in self.oracle.items():
            self.assertEqual(set(self.rows[city]), set(expected["rows"]))
            for code, original in expected["rows"].items():
                with self.subTest(city=city, area=code):
                    row = self.rows[city][code]
                    cells = dict(zip(expected["columns"], original["cells"]))
                    values = {key: cells[key] for key in ("population", "households", "tenantShelter")}
                    values.update({
                        "children": share(cells["children"], cells["age_total"] if city == "halifax" else cells["population"]),
                        "livingAlone": share(cells["one_person"], cells["households"]),
                        "apartments": share(cells["low"] + cells["high"], cells["dwellings"]),
                        "renters": share(cells["renters"], cells["tenure"]),
                        "transit": share(cells["transit"], cells["commuters"]),
                        "walkCycle": share(cells["walk"] + cells["bike"], cells["commuters"]),
                        "householdSize": cells["householdSize"] if city == "halifax" else cells["private_people"] / cells["households"],
                    })
                    if city == "victoria" and len(expected["components"][code]) > 1:
                        values["tenantShelter"] = None
                    for key, value in values.items():
                        actual = row["metrics"][key]["value"]
                        self.assertEqual(self.bundles[city]["definitions"][key]["period"], "2021")
                        if value is None or key in {"population", "households", "tenantShelter"}:
                            self.assertEqual(actual, value, key)
                        else:
                            precision = 0.005000001 if key == "householdSize" and city == "victoria" else 0.050000001
                            self.assertIsNotNone(actual, key)
                            self.assertAlmostEqual(actual, value, delta=precision, msg=key)

    def test_halifax_coverage_and_victoria_unrecoverable_medians(self):
        halifax = self.rows["halifax"]
        self.assertEqual(len(halifax), 99)
        self.assertEqual(sum(row["metrics"]["population"]["value"] for row in halifax.values()),
                         self.oracle["halifax"]["municipalPopulation"])
        self.assertFalse(set(halifax) & set(self.oracle["halifax"]["excluded"]))
        for code in ("downtown-fairfield", "oaklands-jubilee"):
            metric = self.rows["victoria"][code]["metrics"]["tenantShelter"]
            self.assertIsNone(metric["value"])
            self.assertTrue(metric.get("missingReason"))
        for bundle in self.bundles.values():
            self.assertEqual(bundle["stations"], [])
            self.assertNotIn("rail", bundle["definitions"], "Bus stop counts must not masquerade as rail coverage")
            self.assertTrue(all(row["stations"] == [] for row in bundle["neighbourhoods"]))

    def test_original_boundary_coverage_and_d3_orientation(self):
        for city, expected in self.oracle.items():
            project = Transformer.from_crs(4326, expected["crs"], always_xy=True).transform
            for code, row in self.rows[city].items():
                with self.subTest(city=city, area=code):
                    geometry = shape(row["geometry"])
                    self.assertTrue(geometry.is_valid)
                    self.assertFalse(geometry.is_empty)
                    for polygon in ([geometry] if geometry.geom_type == "Polygon" else geometry.geoms):
                        self.assertFalse(polygon.exterior.is_ccw)
                        self.assertTrue(all(ring.is_ccw for ring in polygon.interiors))
                    projected = transform(geometry, project, interleaved=False)
                    original = expected["rows"][code]
                    self.assertLess(abs(projected.area / original["originalAreaM2"] - 1), 0.01)
                    for actual, source in zip(projected.bounds, original["originalBounds"]):
                        self.assertLess(abs(actual - source), 10)


if __name__ == "__main__":
    unittest.main()
