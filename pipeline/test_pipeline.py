"""Focused refresh regressions. Run: python3 -I pipeline/test_pipeline.py"""
from __future__ import annotations

import importlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'immigration'))
from common import fetch as fetch_module
from common.derived_cache import current, mark, signature
import refresh


class Response:
    status_code = 200
    headers = {'Content-Type': 'text/csv'}
    def iter_content(self, _size):
        yield b'official bytes'
    def close(self):
        pass


class RefreshTests(unittest.TestCase):
    def test_forced_fetch_downloads_once_per_run_and_preserves_cache_on_failure(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(fetch_module, 'RAW', Path(temp)), patch.dict(os.environ, {'NORTHWARD_REFRESH': '1'}):
            with patch.object(fetch_module, 'RUN_ID', 'first'), patch.object(fetch_module.requests, 'get', return_value=Response()) as get:
                path = fetch_module.fetch('https://official.example/data.csv')
                before = fetch_module.meta_for(path)
                self.assertEqual(path, fetch_module.fetch('https://official.example/data.csv'))
                self.assertEqual(get.call_count, 1)
            with patch.object(fetch_module, 'RUN_ID', 'second'), patch.object(fetch_module.requests, 'get', side_effect=fetch_module.requests.ConnectionError('offline')):
                with self.assertRaises(fetch_module.FetchError):
                    fetch_module.fetch('https://official.example/data.csv', retries=1)
            self.assertEqual(path.read_bytes(), b'official bytes')
            self.assertEqual(fetch_module.meta_for(path), before)
            self.assertTrue(Path(str(path) + '.error.json').exists())

    def test_derived_cache_invalidates_source_and_transformation(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source.csv', Path(temp) / 'filtered.csv'
            source.write_text('old official observation')
            output.write_text('filtered observation')
            initial = signature(source, {'version': 1})
            mark(output, initial)
            self.assertTrue(current(output, initial))
            source.write_text('new official observation')
            self.assertFalse(current(output, signature(source, {'version': 1})))
            source.write_text('old official observation')
            self.assertFalse(current(output, signature(source, {'version': 2})))

    def test_population_filter_reads_changed_archive(self):
        pop = importlib.import_module('pop')
        with tempfile.TemporaryDirectory() as temp:
            source, filtered = Path(temp) / 'population.zip', Path(temp) / 'filtered.csv'
            def archive(value):
                with zipfile.ZipFile(source, 'w') as z:
                    z.writestr('17100148.csv', 'REF_DATE,GEO,DGUID,UOM,SCALAR_FACTOR,VALUE,STATUS,SYMBOL,Gender,Age group\n2025,Toronto,id,Persons,units,' + str(value) + ',,,Total - gender,All ages\n')
            with patch.object(pop, 'FILTERED', filtered), patch.object(pop, 'fetch', return_value=source):
                archive(100)
                self.assertEqual(pop.read_filtered().iloc[0]['VALUE_NUM'], 100)
                archive(200)
                self.assertEqual(pop.read_filtered().iloc[0]['VALUE_NUM'], 200)

    def test_failed_domain_does_not_publish_partial_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            processed, app = root / 'data/processed', root / 'public/data'
            processed.mkdir(parents=True)
            app.mkdir(parents=True)
            (processed / 'statistics.json').write_text('[{"value": 100}]')
            (app / 'statistics.json').write_text('[{"value": 100}]')
            (processed / 'sources.json').write_text('[{"referencePeriod": "2025"}]')
            calls = []
            def command(args, **kwargs):
                calls.append(args[-1])
                staged = Path(kwargs['env']['NORTHWARD_PROCESSED'])
                if args[-1] == '--pop-only':
                    (staged / 'statistics.json').write_text('[{"value": 999}]')
                    (staged / 'sources.json').write_text('[{"referencePeriod": "2026"}]')
                    return subprocess.CompletedProcess(args, 1)
                if args[-1].endswith('freshness.py'):
                    period = json.loads((staged / 'sources.json').read_text())[0]['referencePeriod']
                    report = Path(kwargs['env']['NORTHWARD_APP_DATA']) / 'freshness-checks.json'
                    report.write_text(json.dumps([{'ourPeriod': period, 'status': 'current'}]))
                return subprocess.CompletedProcess(args, 0)
            with patch.object(refresh, 'ROOT', root), patch.object(refresh.subprocess, 'run', side_effect=command), patch.object(sys, 'argv', ['refresh.py', '--domains', 'geo']):
                self.assertEqual(refresh.main(), 2)
            self.assertEqual(json.loads((app / 'statistics.json').read_text()), [{'value': 100}])
            self.assertEqual(json.loads((processed / 'statistics.json').read_text()), [{'value': 100}])
            self.assertEqual(json.loads((app / 'refresh-status.json').read_text())['status'], 'error')
            self.assertFalse(any('build_app_data' in call for call in calls))
            self.assertEqual(json.loads((app / 'freshness-checks.json').read_text())[0]['ourPeriod'], '2025')

    def test_publication_rolls_back_processed_if_app_exchange_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = [Path(temp) / name for name in ('staged_processed', 'staged_app', 'processed', 'app')]
            for path, value in zip(paths, ('new', 'new', 'old', 'old')):
                path.mkdir()
                (path / 'value').write_text(value)
            real_exchange = refresh.exchange
            count = 0
            def exchange(left, right):
                nonlocal count
                count += 1
                if count == 2:
                    raise OSError('publication failure')
                real_exchange(left, right)
            with patch.object(refresh, 'exchange', side_effect=exchange):
                with self.assertRaises(OSError):
                    refresh.promote(*paths)
            self.assertEqual((paths[2] / 'value').read_text(), 'old')
            self.assertEqual((paths[3] / 'value').read_text(), 'old')

    def test_successful_publication_keeps_independent_updates(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = [Path(temp) / name for name in ('staged_processed', 'staged_app', 'processed', 'app')]
            for path, value in zip(paths, ('new', 'new', 'old', 'old')):
                path.mkdir()
                (path / 'value').write_text(value)
            (paths[3] / 'updates.json').write_text('{"items": ["new IRCC publication"]}')
            (paths[1] / 'updates.json').write_text('{"items": []}')
            refresh.promote(*paths)
            self.assertEqual((paths[2] / 'value').read_text(), 'new')
            self.assertEqual((paths[3] / 'value').read_text(), 'new')
            self.assertEqual(json.loads((paths[3] / 'updates.json').read_text())['items'], ['new IRCC publication'])

    def test_invalid_staged_format_keeps_valid_app(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            processed, app = root / 'data/processed', root / 'public/data'
            processed.mkdir(parents=True)
            app.mkdir(parents=True)
            (processed / 'statistics.json').write_text('[{"value": 100}]')
            (app / 'statistics.json').write_text('[{"value": 100}]')
            def command(args, **kwargs):
                staged = Path(kwargs['env']['NORTHWARD_APP_DATA'])
                if args[-1].endswith('build_app_data.py'):
                    self.assertEqual(kwargs['env']['NORTHWARD_PUBLICATION_LOCK_HELD'], '1')
                    (staged / 'statistics.json').write_text('{"unexpected": "publisher format changed"}')
                return subprocess.CompletedProcess(args, 1 if args[-1].endswith('check_app_data.py') else 0)
            with patch.object(refresh, 'ROOT', root), patch.object(refresh.subprocess, 'run', side_effect=command), patch.object(sys, 'argv', ['refresh.py', '--domains', 'geo']):
                self.assertEqual(refresh.main(), 2)
            self.assertEqual(json.loads((app / 'statistics.json').read_text()), [{'value': 100}])
            self.assertEqual(json.loads((app / 'refresh-status.json').read_text())['errors'][0]['step'], 'validate')

    def test_self_contained_check_does_not_claim_source_verification(self):
        script = Path(__file__).with_name('check_app_data.py')
        with tempfile.TemporaryDirectory() as temp:
            env = {**os.environ, 'NORTHWARD_RAW': temp}
            local = subprocess.run([sys.executable, '-I', str(script)], capture_output=True, text=True, env=env)
            self.assertEqual(local.returncode, 0, local.stdout + local.stderr)
            self.assertIn('SKIP source integration checks', local.stdout)
            strict = subprocess.run([sys.executable, '-I', str(script), '--sources'], capture_output=True, text=True, env=env)
            self.assertNotEqual(strict.returncode, 0)
            self.assertIn('Source verification unavailable', strict.stdout)
            self.assertNotIn('raw CSV not located for re-read)', strict.stdout)


if __name__ == '__main__':
    unittest.main()
