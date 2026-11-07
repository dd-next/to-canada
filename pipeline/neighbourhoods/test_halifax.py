"""Exact 2021 tract joins and duplicated Census Profile symbol columns."""
import csv
import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from neighbourhoods import halifax
from shapely.geometry import box

FIXTURE = Path(__file__).parent / 'fixtures' / 'halifax' / 'profile_excerpt.csv'


class HalifaxTests(unittest.TestCase):
    def rows(self):
        return list(csv.reader(io.StringIO(FIXTURE.read_text())))

    def test_source_tract_values_and_correct_denominators(self):
        profiles = halifax.parse_profile_rows(iter(self.rows()), {'2050001.00', '2050002.00'})
        m = halifax.census_metrics(profiles['2050001.00'])
        self.assertEqual(m['population']['value'], 4123)
        self.assertEqual(m['households']['value'], 1635)
        self.assertEqual(m['renters']['value'], 42.3)
        self.assertEqual(m['tenantShelter']['value'], 760)
        self.assertEqual(m['transit']['value'], 12.5)
        self.assertEqual(m['walkCycle']['value'], 3.9)

    def test_total_count_symbol_is_used_instead_of_the_last_symbol_column(self):
        rows = self.rows()
        value_index = rows[0].index('C1_COUNT_TOTAL')
        target = next(r for r in rows[1:] if r[2] == '2050001.00' and r[8] == '1416')
        target[value_index + 1] = 'x'
        target[-1] = ''
        data = halifax.parse_profile_rows(iter(rows), {'2050001.00', '2050002.00'})
        self.assertIsNone(halifax.census_metrics(data['2050001.00'])['renters']['value'])

    def test_duplicate_missing_and_changed_characteristics_fail(self):
        rows = self.rows()
        with self.assertRaises(ValueError):
            halifax.parse_profile_rows(iter(rows + [rows[1]]), {'2050001.00', '2050002.00'})
        with self.assertRaises(ValueError):
            halifax.parse_profile_rows(iter(rows[:-1]), {'2050001.00', '2050002.00'})
        rows[1][9] = 'A different measurement'
        with self.assertRaises(ValueError):
            halifax.parse_profile_rows(iter(rows), {'2050001.00', '2050002.00'})

    def test_cma_rows_cannot_be_joined_to_a_tract(self):
        rows = self.rows()
        for r in rows[1:]:
            if r[2] == '2050001.00':
                r[1] = '2021S0503205'
                r[3] = 'Census metropolitan area'
        with self.assertRaises(ValueError):
            halifax.parse_profile_rows(iter(rows), {'2050001.00', '2050002.00'})

    def test_whole_tract_municipality_filter_does_not_clip_census_counts(self):
        municipality = box(0, 0, 100, 100)
        self.assertTrue(halifax.within_municipality(box(10, 10, 20, 20), municipality))
        self.assertFalse(halifax.within_municipality(box(110, 10, 120, 20), municipality))
        with self.assertRaises(ValueError):
            halifax.within_municipality(box(90, 10, 110, 20), municipality)


if __name__ == '__main__':
    unittest.main()
