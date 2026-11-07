"""Rehearse app rebuild + statistical promotion with the actual committed feeds.

No network or fixtures replace delivered data. Temporary copies are removed.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))
import build_app_data
import refresh
from common.standalone import FEEDS, is_standalone

ROOT = PIPELINE.parent


def independent_hashes(directory):
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in directory.rglob('*') if p.is_file() and is_standalone(p.relative_to(directory))}


class PublicationTests(unittest.TestCase):
    def test_real_feeds_survive_app_rebuild_and_statistical_promotion_together(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            app, processed = base / 'app', base / 'processed'
            staged_app, staged_processed = base / 'staged_app', base / 'staged_processed'
            shutil.copytree(ROOT / 'public/data', app)
            shutil.copytree(ROOT / 'data/processed', processed)
            for name in FEEDS:
                self.assertTrue((app / name).exists(), f'missing delivered feed: {name}')
            before = independent_hashes(app)
            neighbourhoods = {p.name: json.loads(p.read_text()) for p in (app / 'neighbourhoods').glob('*.json')}
            self.assertTrue(neighbourhoods)
            shutil.copytree(app, staged_app)
            shutil.copytree(processed, staged_processed)
            with patch.object(build_app_data, 'OUT', staged_app), patch.object(build_app_data, 'PROCESSED', staged_processed), \
                    patch.dict(os.environ, {'NORTHWARD_PUBLICATION_LOCK_HELD': '1'}):
                self.assertEqual(build_app_data.main(), 0)
            self.assertEqual(before, independent_hashes(staged_app))
            # Simulate an old staged feed: promotion must use the current locked source.
            (staged_app / 'updates.json').write_text('{"stale": true}')
            refresh.promote(staged_processed, staged_app, processed, app)
            self.assertEqual(before, independent_hashes(app))
            self.assertEqual(neighbourhoods, {p.name: json.loads(p.read_text()) for p in (app / 'neighbourhoods').glob('*.json')})

    def test_independent_checks_do_not_claim_statistical_updates(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            for name in ('before', 'after'):
                directory = base / name
                (directory / 'services').mkdir(parents=True)
                (directory / 'lmia/chunks').mkdir(parents=True)
                (directory / 'observations.json').write_text('[{"value":100}]')
                (directory / 'services/history.json').write_text(json.dumps({'lastCheck': name}))
                (directory / 'lmia/chunks/example.json').write_text(json.dumps({'sourceCheck': name}))
            self.assertEqual(refresh.fingerprint(base / 'before'), refresh.fingerprint(base / 'after'))
            (base / 'after/observations.json').write_text('[{"value":101}]')
            self.assertNotEqual(refresh.fingerprint(base / 'before'), refresh.fingerprint(base / 'after'))

    def test_invalid_feed_prevents_statistical_exchange(self):
        with tempfile.TemporaryDirectory() as temporary:
            paths = [Path(temporary) / name for name in ('staged_processed', 'staged_app', 'processed', 'app')]
            for path, value in zip(paths, ('new', 'new', 'old', 'old')):
                path.mkdir()
                (path / 'generation').write_text(value)
            with patch.object(refresh, 'validate_standalone', side_effect=ValueError('invalid feed')):
                with self.assertRaises(ValueError):
                    refresh.promote(*paths)
            self.assertEqual((paths[2] / 'generation').read_text(), 'old')
            self.assertEqual((paths[3] / 'generation').read_text(), 'old')


if __name__ == '__main__':
    unittest.main()
