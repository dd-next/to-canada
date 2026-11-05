"""Malformed publisher metadata must never establish freshness."""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import freshness

STATCAN = {'id': 'statcan-11-10-0066-01', 'tableId': '11-10-0066-01', 'releaseDate': '2026-04-29', 'referencePeriod': '2025'}
IRCC = {'id': 'ircc-pr-cma', 'tableId': 'dataset f7e5498e-0ad8-4417-85c9-9b8aff9b9eda', 'releaseDate': '2026-10-20', 'referencePeriod': '2015-01 to 2026-08'}

class FreshnessIntegrity(unittest.TestCase):
    def test_statcan_empty_success_is_unknown(self):
        with patch.object(freshness, 'fetch_json', return_value=[{'status': 'SUCCESS', 'object': {}}]):
            self.assertEqual(freshness.check_statcan(STATCAN)['status'], 'unknown')

    def test_invalid_or_older_release_is_not_current(self):
        for release in ('2026-99-99', '2025-04-29'):
            with patch.object(freshness, 'fetch_json', return_value=[{'status': 'SUCCESS', 'object': {'releaseTime': release, 'cubeEndDate': '2025-01-01'}}]):
                self.assertEqual(freshness.check_statcan(STATCAN)['status'], 'unknown')

    def test_ircc_without_update_date_is_unknown(self):
        with patch.object(freshness, 'ckan', return_value={'resources': []}):
            self.assertEqual(freshness.check_ircc(IRCC)['status'], 'unknown')

    def test_failed_check_retains_last_success_and_fails_runner(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'freshness.json').write_text(json.dumps([{'sourceId': STATCAN['id'], 'lastSuccessfulCheckAt': '2026-10-01T12:00:00Z'}]))
            with patch.object(freshness, 'PROCESSED', root), patch.object(freshness, 'load_sources', return_value=[STATCAN]), patch.object(freshness, 'check', return_value=freshness.result(STATCAN, 'unknown', None, None, 'Missing date')), patch.dict(os.environ, {'NORTHWARD_APP_DATA': str(root)}), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(freshness.main(), 2)
            result = json.loads((root / 'freshness.json').read_text())[0]
            self.assertEqual(result['lastSuccessfulCheckAt'], '2026-10-01T12:00:00Z')
            self.assertEqual(result['status'], 'unknown')
            self.assertIn('checkedAt', result)

if __name__ == '__main__':
    unittest.main()
