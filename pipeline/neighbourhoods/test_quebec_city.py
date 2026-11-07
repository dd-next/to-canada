"""Offline checks of Québec City's PDF labels, geography and point inventories."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from neighbourhoods import quebec_city as qc
from neighbourhoods.check import validate
from shapely.geometry import Point, box, shape
from shapely.ops import unary_union

FIXTURES = Path(__file__).parent / "fixtures" / "quebec-city"
ROOT = Path(__file__).resolve().parents[2]


class QuebecCensusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profiles = json.loads((FIXTURES / "profiles-2021-excerpts.json").read_text())
        cls.census = {code: qc.parse_profile(row["excerpt"], code) for code, row in cls.profiles.items()}

    def test_all_35_profile_codes_and_2021_observations(self):
        self.assertEqual(set(self.census), {code for code, _ in qc.AREAS.values()})
        self.assertEqual(sum(row["population"] for row in self.census.values()), 549380)
        self.assertEqual(sum(row["households"] for row in self.census.values()), 265730)
        for code, record in self.profiles.items():
            self.assertIn(f"/{code}_", record["url"])
            self.assertEqual(len(record["sha256"]), 64)
            self.assertIn("juin 2020", record["excerpt"])

    def test_saint_roch_source_values_and_distinct_household_universes(self):
        self.assertEqual(self.census["1-2"], {
            "population": 8380, "households": 5320, "householdSize": 1.6,
            "livingAlone": 63.9, "occupiedDwellings": 5310, "detached": 0.6,
            "lowRiseApartments": 70.8, "renters": 76.2, "majorRepairs": 6.8,
        })
        # Do not silently replace independently published counts or percentages.
        self.assertNotEqual(self.census["1-2"]["households"], self.census["1-2"]["occupiedDwellings"])
        self.assertNotIn("apartments", self.census["1-2"])

    def test_suburban_and_generic_named_profiles(self):
        self.assertEqual(self.census["3-7"], {
            "population": 17290, "households": 7050, "householdSize": 2.4,
            "livingAlone": 22.8, "occupiedDwellings": 7040, "detached": 66.9,
            "lowRiseApartments": 15.8, "renters": 14.1, "majorRepairs": 3,
        })
        self.assertEqual(self.census["4-3"]["population"], 13820)
        self.assertEqual(self.census["4-3"]["households"], 6220)
        self.assertEqual(self.census["4-3"]["occupiedDwellings"], 6215)
        self.assertEqual(self.census["5-2"]["renters"], 17.5)
        self.assertEqual(self.census["1-1"]["population"], 5925)

    def test_french_numbers_suppression_and_zero(self):
        self.assertEqual(qc.number("5\u00a0310"), 5310)
        self.assertEqual(qc.number("63,9"), 63.9)
        self.assertEqual(qc.number("0,0"), 0)
        for value in (None, "", "x", "F", "..", "...", "**", "–"):
            self.assertIsNone(qc.number(value))
        for value in ("-1", "NaN", "Infinity"):
            with self.assertRaises(ValueError):
                qc.number(value)
        suppressed = self.profiles["1-2"]["excerpt"].replace("70,8", "x")
        parsed = qc.parse_profile(suppressed, "1-2")
        self.assertIsNone(parsed["lowRiseApartments"])
        self.assertEqual(parsed["detached"], 0.6)
        self.assertIn("missingReason", qc.cell(parsed["lowRiseApartments"]))

    def test_changed_geography_year_universe_or_profile_identity_fails(self):
        original = self.profiles["1-2"]["excerpt"]
        changed = [
            original.replace("juin 2020", "juin 2026"),
            original.replace("(1-2)", "(1-3)"),
            original.replace("2001 et 2021", "2001 et 2016"),
            original.replace("moins de 5 étages", "5 étages ou plus"),
            original.replace("FAITS SAILLANTS", "TABLEAU COMPARATIF"),
            original.replace("76,2", "176,2"),
        ]
        for text in changed:
            with self.assertRaises(ValueError):
                qc.parse_profile(text, "1-2")


class QuebecGeographyTests(unittest.TestCase):
    def test_legal_geography_evidence_and_new_amendment_guard(self):
        laws = json.loads((FIXTURES / "boundary-law-evidence.json").read_text())
        texts = [laws[key]["text"] for key in ("current", "2020", "2026")]
        qc.check_legal_geography(*texts)
        with self.assertRaises(ValueError):
            qc.check_legal_geography(texts[0] + " R.V.Q. 9999", *texts[1:])
        with self.assertRaises(ValueError):
            qc.check_legal_geography(texts[0], texts[1], texts[2].replace("modifier le nom", "modifier les limites"))

    def test_source_projection_and_deterministic_single_assignment(self):
        bounds = box(-71.22, 46.80, -71.21, 46.81)
        self.assertGreater(qc.projected(bounds).area, 820000)
        self.assertLess(qc.projected(bounds).area, 870000)
        areas = {"1-2": {"geometry": qc.projected(bounds)}, "1-1": {"geometry": qc.projected(bounds)}}
        records = [
            {"id": "in", "name": "Inside", "lon": -71.215, "lat": 46.805},
            {"id": "out", "name": "Outside", "lon": -71.225, "lat": 46.805},
        ]
        assigned, outside = qc.assign_points(areas, records)
        self.assertEqual([p["id"] for p in assigned["1-1"]], ["in"])
        self.assertFalse(assigned["1-2"])
        self.assertEqual([p["id"] for p in outside], ["out"])
        with self.assertRaises(ValueError):
            qc.assign_points(areas, records + records[:1])

    def test_real_library_duplicate_is_one_site(self):
        data = json.loads((FIXTURES / "selected-facilities.geojson").read_text())
        rows = [qc.point_record(f, "ID", "NOM_TOPOGRAPHIE") for f in data["features"] if f["properties"]["DESCRIPTION"] == "Bibliothèques"]
        self.assertEqual(len(rows), 28)
        selected = qc.unique_libraries(rows)
        self.assertEqual(len(selected), 27)
        self.assertEqual(selected, qc.unique_libraries(list(reversed(rows))))
        self.assertIn("102399", {r["id"] for r in selected})
        self.assertNotIn("202454", {r["id"] for r in selected})
        # Nearby, differently named institutions must remain separate.
        self.assertEqual(len(qc.unique_libraries([
            {"id": "1", "name": "Bibliothèque A", "lon": -71.21, "lat": 46.81},
            {"id": "2", "name": "Bibliothèque B", "lon": -71.21, "lat": 46.81},
        ])), 2)

    def test_saved_bundle_values_geography_inventory_and_provenance(self):
        bundle = json.loads((ROOT / "data/processed/neighbourhoods/quebec-city.json").read_text())
        self.assertEqual(validate(bundle), 35)
        self.assertEqual(bundle["placeId"], "quebec-city")
        self.assertEqual(bundle["cityName"], "Québec City")
        by_id = {row["id"]: row for row in bundle["neighbourhoods"]}
        profiles = json.loads((FIXTURES / "profiles-2021-excerpts.json").read_text())
        for code, row in by_id.items():
            for key, expected in qc.parse_profile(profiles[code]["excerpt"], code).items():
                self.assertEqual(row["metrics"][key]["value"], expected)
                self.assertEqual(bundle["definitions"][key]["period"], "2021")
            geometry = shape(row["geometry"])
            self.assertTrue(geometry.is_valid)
            self.assertFalse(geometry.is_empty)
            self.assertTrue(-71.6 < geometry.bounds[0] < geometry.bounds[2] < -71.0)
            self.assertTrue(46.6 < geometry.bounds[1] < geometry.bounds[3] < 47.1)
            polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
            self.assertTrue(all(not polygon.exterior.is_ccw for polygon in polygons))
        for key, total in {"parks": 89, "busStops": 4042, "libraries": 27, "communityCentres": 49}.items():
            self.assertEqual(sum(r["metrics"][key]["value"] for r in by_id.values()), total)
        self.assertEqual(by_id["1-2"]["metrics"]["busStops"]["value"], 53)
        self.assertEqual(by_id["3-7"]["metrics"]["parks"]["value"], 3)
        self.assertEqual(by_id["1-1"]["metrics"]["libraries"]["value"], 1)
        self.assertIn("Bibliothèque Gabrielle-Roy", [a["name"] for a in by_id["1-2"]["amenities"]])
        union = unary_union([shape(row["geometry"]) for row in by_id.values()])
        self.assertFalse(union.covers(Point(-71.3705, 46.8061)))  # L'Ancienne-Lorette.
        self.assertFalse(union.covers(Point(-71.4637, 46.7388)))  # Saint-Augustin-de-Desmaures.
        self.assertFalse(bundle["stations"])
        for key in ("rail", "tramStops", "parkland", "tenantShelter", "apartments", "children"):
            self.assertNotIn(key, bundle["definitions"])
        self.assertIn("not the total apartment share", bundle["definitions"]["lowRiseApartments"]["note"])
        self.assertIn("not asserted", bundle["boundaryNote"])
        self.assertIn("not collected", bundle["coverageNote"])
        self.assertIn("ordinary neighbourhood parks are not covered", bundle["coverageNote"])
        self.assertIn("School, dog and linear", bundle["definitions"]["parks"]["label"])
        park_source = next(s for s in bundle["sources"] if s["id"] == qc.PARK_ID)
        self.assertEqual(park_source["licence"], "Attribution (CC-BY 4.0)")
        source_ids = {s["id"] for s in bundle["sources"]}
        self.assertTrue(all(row["quality"]["profileSourceId"] in source_ids for row in by_id.values()))


if __name__ == "__main__":
    unittest.main()
