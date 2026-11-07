"""Regression checks for missing census cells, denominators and park overlaps."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from neighbourhoods import run
from shapely.geometry import box, mapping


class NeighbourhoodTests(unittest.TestCase):
    def test_suppressed_cells_stay_missing_and_zero_survives(self):
        for value in (None, "", "x", "F", "..", "...", "-"):
            self.assertIsNone(run.number(value))
        self.assertEqual(run.number("0"), 0)
        self.assertIn("missingReason", run.cell(None))
        for invalid in ("NaN", "Infinity", "-1"):
            with self.assertRaises(ValueError):
                run.number(invalid)

    def test_percentages_do_not_impute_missing_or_zero_denominators(self):
        self.assertIsNone(run.ratio(None, 100))
        self.assertIsNone(run.ratio(0, 0))
        self.assertIsNone(run.ratio(10, 5))  # Small-area random rounding can exceed a denominator.
        self.assertEqual(run.ratio(0, 100), 0)
        self.assertIsNone(run.sum_known(None, 15))

    def test_duplicate_census_cells_fail_instead_of_overwriting(self):
        row = {"neighbourhood_number": "5480", "characteristics_code": "1"}
        with self.assertRaises(ValueError):
            run.census_index([row, row])

    def test_parks_without_public_id_are_retained(self):
        row = {"geometry": mapping(box(0, 0, 1, 1))}
        self.assertEqual(run.park_id(row, "id", "geometry"), run.park_id(row, "id", "geometry"))
        self.assertNotEqual(run.park_id(row, "id", "geometry"), run.park_id({"geometry": mapping(box(0, 0, 2, 2))}, "id", "geometry"))

    def test_overlapping_parks_not_double_counted_and_distance_is_to_boundary(self):
        # In this synthetic fixture projection is identity, so units are metres.
        records = [{"id": "test", "name": "Test", "geometry": mapping(box(0, 0, 100, 100)), "metrics": {}}]
        parks = [{"id": "a", "name": "A", "geometry": mapping(box(0, 0, 60, 100))},
                 {"id": "b", "name": "B", "geometry": mapping(box(40, 0, 100, 100))}]
        stations = [{"id": "1", "name": "Inside", "lon": 5, "lat": 5},
                    {"id": "2", "name": "Inside", "lon": 6, "lat": 6},
                    {"id": "3", "name": "Nearby", "lon": 850, "lat": 50},
                    {"id": "4", "name": "Far", "lon": 901, "lat": 50}]
        sources = [{"id": key, "releaseDate": "2026-11-07"} for key in ("bounds", "parks", "rail")]
        with patch.object(run, "PROJECT", lambda x, y, z=None: (x, y)), patch.object(run, "UNPROJECT", lambda x, y, z=None: (x, y)), patch.object(run, "SOURCES", sources):
            bundle = run.finish("edmonton", records, {}, "bounds", parks, "parks", stations, "rail", "fixture", "fixture")
        record = bundle["neighbourhoods"][0]
        self.assertEqual(record["metrics"]["parkland"]["value"], 100)
        self.assertEqual(record["metrics"]["parks"]["value"], 2)
        self.assertEqual(record["metrics"]["rail"]["value"], 2)
        self.assertEqual([s["distanceToBoundaryM"] for s in record["stations"]], [0, 750])


if __name__ == "__main__":
    unittest.main()
