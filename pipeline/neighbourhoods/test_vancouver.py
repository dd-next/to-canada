"""Offline checks for Vancouver's census universes and geographic attribution."""
import csv
import io
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from neighbourhoods import vancouver as van
from neighbourhoods.check import validate
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import unary_union

FIXTURES = Path(__file__).parent / "fixtures" / "vancouver"
ROOT = Path(__file__).resolve().parents[2]


class VancouverCensusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.csv_text = (FIXTURES / "census-2016-selected.csv").read_text()
        cls.census = van.parse_census(cls.csv_text)

    def changed_csv(self, change):
        rows = list(csv.reader(io.StringIO(self.csv_text)))
        change(rows)
        output = io.StringIO()
        csv.writer(output).writerows(rows)
        return output.getvalue()

    def test_only_local_area_columns_survive(self):
        self.assertEqual(len(self.census), 22)
        self.assertIn("arbutus-ridge", self.census)
        self.assertNotIn("vancouver-csd", self.census)
        self.assertNotIn("vancouver-cma", self.census)
        # Source area counts do not sum to the CSD: Musqueam 2 is included.
        self.assertEqual(sum(v[1] for v in self.census.values()), 633135)

    def test_representative_source_counts_and_money(self):
        self.assertEqual(self.census["downtown"][1], 62030)
        self.assertEqual(self.census["downtown"][150], 35050)
        self.assertEqual(self.census["downtown"][4018], 35100)
        self.assertEqual(self.census["west-end"][4020], 24685)
        self.assertEqual(self.census["dunbar-southlands"][168], 0)
        self.assertEqual(self.census["marpole"][4106], 964)

    def test_renters_use_tenure_not_household_size_universe(self):
        values = van.census_values(self.census["downtown"])
        self.assertEqual(values["renters"], 57.2)  # 20,070 / 35,100; not 35,050.
        self.assertEqual(values["livingAlone"], 51.5)  # 18,055 / 35,050.
        self.assertEqual(values["transit"], 21.2)  # 7,010 / 32,995.
        self.assertEqual(values["walkCycle"], 44.5)  # (13,655 + 1,020) / 32,995.

    def test_apartment_measure_excludes_duplexes(self):
        values = van.census_values(self.census["dunbar-southlands"])
        self.assertEqual(values["apartments"], 9.3)  # (0 + 700) / 7,565.
        self.assertEqual(values["duplex"], 27.0)  # 2,045 / 7,565.
        self.assertEqual(values["detached"], 62.3)
        self.assertEqual(van.census_values(self.census["west-end"])["apartments"], 99.2)

    def test_missing_and_suppressed_cells_do_not_become_zero(self):
        for value in (None, "", "x", "F", "..", "...", "-", "**"):
            self.assertIsNone(van.number(value))
        self.assertEqual(van.number("0"), 0)
        self.assertEqual(van.number("1,234"), 1234)
        for invalid in ("NaN", "Infinity", "-1"):
            with self.assertRaises(ValueError):
                van.number(invalid)
        def suppress(rows):
            next(row for row in rows if row[0] == "168")[3] = "x"
        values = van.census_values(van.parse_census(self.changed_csv(suppress))["downtown"])
        self.assertIsNone(values["apartments"])
        self.assertEqual(values["population"], 62030)
        self.assertIn("missingReason", van.cell(values["apartments"]))
        self.assertIsNone(van.ratio(0, 0))
        self.assertIsNone(van.ratio(105, 100))

    def test_changed_variables_duplicates_and_missing_rows_fail_closed(self):
        def relabel(rows):
            next(row for row in rows if row[0] == "4106")[1] = "Current asking rent"
        def duplicate(rows):
            rows.append(rows[1])
        def remove(rows):
            rows[:] = [row for row in rows if row[0] != "4018"]
        for change in (relabel, duplicate, remove):
            with self.assertRaises(ValueError):
                van.parse_census(self.changed_csv(change))


class VancouverGeographyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.census = van.parse_census((FIXTURES / "census-2016-selected.csv").read_text())

    def test_overlap_union_and_boundary_distance(self):
        # Inputs are already projected metres. One touching-only park is omitted.
        area = box(0, 0, 100, 100)
        parks = [box(0, 0, 60, 100), box(40, 0, 100, 100), box(100, 0, 120, 100)]
        park_rows = [{"park_name": name} for name in ("A", "B", "Touching")]
        stations = [{"id": name, "name": name} for name in ("Inside", "Limit", "Outside")]
        points = [Point(50, 50), Point(900, 50), Point(900.1, 50)]
        metrics, names, nearby = van.spatial_context(area, parks, park_rows, stations, points)
        self.assertEqual(metrics["parkland"]["value"], 100)
        self.assertEqual(metrics["parks"]["value"], 2)
        self.assertEqual(names, ["A", "B"])
        self.assertEqual([p["distanceToBoundaryM"] for p in nearby], [0, 800])
        self.assertEqual(metrics["rail"]["value"], 2)

    def test_interchange_points_are_deduplicated_deterministically(self):
        rows = [{"station": "Waterfront", "geom": mapping(Point(lon, 49.28))} for lon in (-123.10, -123.11)]
        forward = van.unique_stations(rows)
        self.assertEqual(forward, van.unique_stations(list(reversed(rows))))
        self.assertEqual(len(forward), 1)
        self.assertEqual(forward[0]["lon"], -123.11)

    def test_real_projection_is_local_metres(self):
        area = van.projected(box(-123.12, 49.27, -123.11, 49.28))
        self.assertGreater(area.area, 790000)
        self.assertLess(area.area, 830000)

    def test_missing_geometry_fails_instead_of_creating_zero_coverage(self):
        with self.assertRaises(ValueError):
            van.geometry({"geom": None})

    def test_saved_bundle_geography_provenance_and_descriptions(self):
        bundle = json.loads((ROOT / "data/processed/neighbourhoods/vancouver.json").read_text())
        self.assertEqual(validate(bundle), 22)
        self.assertEqual(len(bundle["stations"]), 20)
        self.assertIn("Musqueam 2", bundle["boundaryNote"])
        self.assertIn("Stanley Park is outside", bundle["boundaryNote"])
        self.assertIn("2016", bundle["coverageNote"])
        by_id = {r["id"]: r for r in bundle["neighbourhoods"]}
        union = unary_union([shape(r["geometry"]) for r in by_id.values()])
        self.assertFalse(union.covers(Point(-123.1443, 49.3005)))  # Stanley Park centre.
        self.assertEqual(by_id["downtown"]["metrics"]["libraries"]["value"], 2)
        self.assertEqual(sum(r["metrics"]["libraries"]["value"] for r in by_id.values()), 21)
        self.assertEqual(sum(r["metrics"]["communityCentres"]["value"] for r in by_id.values()), 27)
        for row in by_id.values():
            geom = shape(row["geometry"])
            self.assertTrue(geom.is_valid)
            self.assertFalse(geom.is_empty)
            self.assertTrue(-123.25 < geom.bounds[0] < geom.bounds[2] < -123.02)
            self.assertTrue(49.19 < geom.bounds[1] < geom.bounds[3] < 49.30)
            polygons = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
            self.assertTrue(all(not poly.exterior.is_ccw for poly in polygons))
            # The entire saved census portion agrees with the official fixture.
            for key, value in van.census_values(self.census[row["id"]]).items():
                self.assertEqual(row["metrics"][key]["value"], value)
            for section in row["description"]["sections"]:
                self.assertNotIn("current rent is", section["text"].lower())
        self.assertEqual(sum(any(s["heading"] == "Everyday setting" for s in r["description"]["sections"]) for r in by_id.values()), 10)
        for key in van.census_values(self.census["downtown"]):
            self.assertEqual(bundle["definitions"][key]["period"], "2016")
        self.assertEqual(bundle["definitions"]["tenantShelter"]["unit"], "CAD_month")
        self.assertIn("not current asking rents", bundle["definitions"]["tenantShelter"]["note"])


if __name__ == "__main__":
    unittest.main()
