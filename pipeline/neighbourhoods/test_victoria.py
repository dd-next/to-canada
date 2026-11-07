"""Census-vintage unions, suppression and spatial attribution regressions."""
import copy
import csv
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from neighbourhoods import victoria
from shapely.geometry import box, mapping, Point

FIXTURES = Path(__file__).parent / 'fixtures' / 'victoria'


class VictoriaTests(unittest.TestCase):
    def setUp(self):
        self.short = victoria.read_census((FIXTURES / 'short_excerpt.csv').read_text())
        self.long = victoria.read_census((FIXTURES / 'long_excerpt.csv').read_text())

    def test_source_values_and_count_based_household_average(self):
        m = victoria.comparison_metrics(self.short, self.long, ('Burnside/Gorge',))
        self.assertEqual(m['population']['value'], 6875)
        self.assertEqual(m['households']['value'], 3255)
        self.assertEqual(m['householdSize']['value'], 1.73)
        self.assertEqual(m['renters']['value'], 65.9)
        self.assertEqual(m['tenantShelter']['value'], 1190)

    def test_combined_area_sums_counts_then_computes_rates_and_omits_median(self):
        m = victoria.comparison_metrics(self.short, self.long, ('Downtown', 'Fairfield'))
        self.assertEqual(m['population']['value'], 20860)
        self.assertEqual(m['households']['value'], 12405)
        self.assertEqual(m['renters']['value'], 61.0)
        self.assertEqual(m['transit']['value'], 10.0)
        self.assertIsNone(m['tenantShelter']['value'])
        self.assertIn('cannot be calculated', m['tenantShelter']['missingReason'])

    def test_missing_component_is_not_imputed_during_aggregation(self):
        self.long['Fairfield'][('Renter', 0)] = None
        m = victoria.comparison_metrics(self.short, self.long, ('Downtown', 'Fairfield'))
        self.assertIsNone(m['renters']['value'])
        self.assertIn('missingReason', m['renters'])
        self.assertEqual(victoria.number('0'), 0)
        for raw in ('x', 'F', '...', ''):
            self.assertIsNone(victoria.number(raw))

    def test_repeated_labels_retain_occurrence_and_duplicate_columns_fail(self):
        table = victoria.read_census('Metric,A\n0 to 14 years,475\n0 to 14 years,7\n')
        self.assertEqual(table['A'][('0 to 14 years', 0)], 475)
        self.assertEqual(table['A'][('0 to 14 years', 1)], 7)
        with self.assertRaises(ValueError):
            victoria.read_census('Metric,A,A\nCount,1,2\n')

    def test_crosswalk_combines_both_sides_of_each_documented_transfer(self):
        self.assertEqual(victoria.GROUPS['Downtown / Fairfield'], ('Downtown', 'Fairfield'))
        self.assertEqual(victoria.GROUPS['Oaklands / Jubilee'], ('Oaklands', 'Jubilee'))
        members = [name for names in victoria.GROUPS.values() for name in names]
        self.assertEqual(len(members), len(set(members)))
        self.assertEqual(set(members), set(self.short))

    def test_spatial_counts_union_parks_and_use_polygon_distance_without_rail(self):
        record = {'id': 'fixture', 'geometry': mapping(box(0, 0, 100, 100)), 'metrics': {}}
        parks = [{'id': 'a', 'name': 'A', 'geometry': mapping(box(0, 0, 60, 100))},
                 {'id': 'b', 'name': 'B', 'geometry': mapping(box(40, 0, 100, 100))}]
        stops = [{'id': 'inside', 'name': 'Inside', 'lon': 10, 'lat': 10},
                 {'id': 'near', 'name': 'Near', 'lon': 850, 'lat': 50},
                 {'id': 'far', 'name': 'Far', 'lon': 901, 'lat': 50}]
        amenities = [{'name': 'Centre', 'category': 'Community centre', 'geometry': mapping(Point(50, 50))}]
        identity = type('Projection', (), {'transform': staticmethod(lambda x, y: (x, y))})()
        with patch.object(victoria.Transformer, 'from_crs', return_value=identity):
            result = victoria.spatial_metrics([record], parks, stops, amenities, crs=3157, park_source='p', stop_source='t', amenity_source='a')
        self.assertEqual(record['metrics']['parkland']['value'], 100)
        self.assertEqual(record['metrics']['parks']['value'], 2)
        self.assertEqual(record['metrics']['busStops']['value'], 2)
        self.assertEqual(record['metrics']['communityCentres']['value'], 1)
        self.assertEqual(record['stations'], [])
        self.assertEqual(result, [])


if __name__ == '__main__':
    unittest.main()
