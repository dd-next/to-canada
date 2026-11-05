"""Source-shaped regressions, runnable without the raw cache or network."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'pipeline' / 'work'))
sys.path.insert(0, str(ROOT / 'pipeline' / 'housing'))
import wages
import cmhc

FIXTURES = ROOT / 'pipeline' / 'work' / 'fixtures'


class WageEditionChecks(unittest.TestCase):
    def test_real_catalog_selects_newest_published_resource(self):
        package = wages.catalog_from_html((FIXTURES / 'wages-catalog.html').read_text())
        resource = wages.discover_resource(package)
        self.assertEqual(resource['edition'], 2025)
        self.assertIn('9da94d63-b178-4a64-aeb3-b6a3bd721ad2', resource['url'])
        package['resources'].reverse()
        self.assertEqual(wages.discover_resource(package), resource)
        with self.assertRaisesRegex(ValueError, 'Manual update required'):
            wages.discover_resource({'resources': []})

    def test_real_rows_retain_individual_period_method_and_annual_basis(self):
        frame = pd.read_csv(FIXTURES / 'wages-2025-sample.csv', dtype=str, keep_default_na=False)
        occ = [{'noc': code} for code in ('00010', '00011', '21103')]
        with patch.object(wages, 'load_raw', return_value=(frame, {'sourceId': 'jobbank-wages-2025', 'releaseDate': '2025-11-19'})), patch.object(wages, 'build_occupations', return_value=occ):
            _, table, *_ = wages.build([{'province': 'ON', 'geo': {'economicRegions': []}}])
        expected = [('00010', '2021', '2021 Census', 1), ('00011', '2023-2024', 'Labour Force Survey', 0), ('21103', '2024', 'Small Area Estimation', 0)]
        for noc, period, method, annual in expected:
            self.assertEqual(table['metadata'][noc]['CA']['referencePeriod'], period)
            self.assertEqual(table['metadata'][noc]['CA']['methodology'], method)
            self.assertEqual(table['byNoc'][noc]['CA'][3], annual)
        self.assertEqual(table['byNoc']['00010']['CA'][1], 84000)
        self.assertEqual(table['byNoc']['21103']['CA'][1], 53.94)

    def test_cmhc_catalog_and_new_edition_without_code_changes(self):
        html = (FIXTURES / 'cmhc-catalog.html').read_text()
        current = cmhc.discover_catalog(html)
        self.assertEqual((current['edition'], current['releaseDate']), (2025, '2025-12-11'))
        next_edition = cmhc.discover_catalog(html.replace('2025', '2026'))
        self.assertEqual(next_edition['edition'], 2026)
        self.assertIn('/2026/rmr-{slug}-2026-en.xlsx', next_edition['base'])
        with self.assertRaisesRegex(ValueError, 'Manual update required'):
            cmhc.discover_catalog('<html>Service unavailable</html>')


if __name__ == '__main__':
    unittest.main()
