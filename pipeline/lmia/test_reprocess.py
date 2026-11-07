"""Offline maintenance tests. Only temporary LMIA snapshots are published."""
from __future__ import annotations

import copy
import fcntl
import hashlib
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lmia.check import validate_directory
from lmia.ingest import COLUMNS, DATASET
from lmia.reprocess import encoded, reprocess

BEFORE = "2026-11-07T19:22:30+00:00"
ATTEMPT = "2026-11-07T19:58:05+00:00"
PROCESSED = "2026-11-07T20:30:00+00:00"
RESOURCE = "fixture-2016"


def original_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:20]


def old_rows():
    rows = [
        [None, "Fixture Employer", "Example address", None, "Territoires-du-Nord-Ouest", "High Wage", None, "631-Directeurs", None, None, 2, None, "Corporation"],
        [None, "Fixture Employer", "Example address", None, "Territoires-du-Nord-Ouest", "High Wage", "0631", "Directeurs", "2011", None, None, None, "Corporation"],
        [None, "Fixture Employer", "Example address", None, "Territoires-du-Nord-Ouest", "High Wage", None, "631-Directeurs", None, 1, 3, None, "Corporation"],
        [None, "Fixture Marine", "Outside address", None, "À l'extérieur du Canada", "Low Wage", "2171", "Profession", "2011", 2, 5, None, None],
        [None, "Fixture Overseas", "Another address", None, "Les employeurs exerçant leurs activités au Canada avec un siège social à l'extérieur du Canada", "Low Wage", "2171", "Profession", "2011", None, 1, None, None],
        [None, "Fixture Unknown", "Unknown address", None, "Unknown publisher region", "Low Wage", "2171", "Profession", "2011", None, 4, None, None],
    ]
    seen = Counter()
    for row in rows:
        identity = original_hash([row[index] for index in (1, 2, 4, 5, 6, 7, 8, 12)])
        row[0] = f"{RESOURCE}:{identity}:{seen[identity]}"
        seen[identity] += 1
        row[11] = "loc-" + original_hash([row[1], row[2], row[4]])
    return rows


def write_snapshot(directory, *, edition="2011", transform=1):
    partition = {"schemaVersion": 1, "resourceId": RESOURCE, "periodId": "2016", "columns": COLUMNS, "rows": old_rows()}
    (directory / "periods").mkdir(parents=True)
    (directory / "audits").mkdir()
    raw = encoded(partition)
    (directory / "periods/2016.json").write_bytes(raw)
    (directory / f"audits/{RESOURCE}.json").write_bytes(encoded({"declaredNocVersion": edition, "notes": ["Synthetic fixture, not delivered data."]}))
    metadata = {"schemaVersion": 1, "dataset": DATASET, "generatedAt": BEFORE, "lastAttemptAt": ATTEMPT,
                "lastSuccessfulCheckAt": None, "lastSuccessfulUpdateAt": BEFORE, "status": "partial", "error": "Official catalogue timeout",
                "catalogue": {"status": "ok", "checkedAt": BEFORE},
                "coverage": {"start": "2016-01-01", "end": "2016-12-31", "rowCount": len(partition["rows"]), "periodCount": 1,
                             "gaps": [{"start": "2017-01-01", "end": "2017-03-31", "reason": "Unavailable source"}], "notes": ["Partial fixture coverage"]},
                "periods": [{"id": "2016", "label": "2016", "start": "2016-01-01", "end": "2016-12-31", "kind": "annual",
                             "indexPath": "lmia/periods/2016.json", "rowCount": len(partition["rows"]), "resourceId": RESOURCE, "status": "retained", "indexBytes": len(raw)}],
                "resources": [{"id": RESOURCE, "url": "https://example.invalid/published.csv", "sha256": "a" * 64, "revision": "original-revision",
                               "retrievedAt": BEFORE, "lastSuccessfulCheckAt": BEFORE, "lastAttemptAt": ATTEMPT, "status": "retained",
                               "error": "Remote source outage", "transformVersion": transform, "rows": len(partition["rows"]), "auditPath": f"lmia/audits/{RESOURCE}.json"},
                              {"id": "missing-period", "url": "https://example.invalid/unavailable.csv", "status": "failed", "rows": 0,
                               "sha256": None, "retrievedAt": None, "lastAttemptAt": ATTEMPT, "error": "connection timeout"}],
                "excludedResources": [], "errors": [{"resourceId": "missing-period", "error": "connection timeout"}],
                "facets": {"provinces": [], "nocVersions": ["2011"], "streams": ["High Wage", "Low Wage"]}}
    (directory / "metadata.json").write_bytes(encoded(metadata))
    validate_directory(directory)
    return metadata, partition


def snapshot_bytes(directory):
    return {str(path.relative_to(directory)): path.read_bytes() for path in directory.rglob("*") if path.is_file()}


class PublishedTupleMaintenance(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.output = self.root / "lmia"
        self.output.mkdir()
        self.lock = self.root / "raw/.publication.lock"
        self.before_metadata, self.before_partition = write_snapshot(self.output)

    def tearDown(self):
        self.temporary.cleanup()

    def test_preserves_source_counts_locations_clocks_and_ordered_multiplicity(self):
        source_audit = (self.output / f"audits/{RESOURCE}.json").read_bytes()
        with patch("requests.get", side_effect=AssertionError("Network must not be used")), patch("requests.post", side_effect=AssertionError("Network must not be used")):
            result = reprocess(self.output, self.lock, applied_at=PROCESSED)
        self.assertEqual((result["provinceCodeCorrections"], result["occupationCodeCorrections"]), (5, 2))
        metadata = validate_directory(self.output)
        partition = json.loads((self.output / "periods/2016.json").read_text())
        self.assertEqual(metadata["resources"], self.before_metadata["resources"])
        self.assertEqual(metadata["coverage"], self.before_metadata["coverage"])
        for key in ("lastAttemptAt", "lastSuccessfulCheckAt", "status", "error", "errors", "catalogue"):
            self.assertEqual(metadata[key], self.before_metadata[key])
        self.assertEqual(metadata["generatedAt"], PROCESSED)
        self.assertEqual(metadata["lastSuccessfulUpdateAt"], PROCESSED)
        self.assertEqual((self.output / f"audits/{RESOURCE}.json").read_bytes(), source_audit)
        rows = partition["rows"]
        for old, new in zip(self.before_partition["rows"], rows):
            self.assertEqual([new[i] for i in (1, 2, 4, 5, 9, 10, 11, 12)], [old[i] for i in (1, 2, 4, 5, 9, 10, 11, 12)])
        self.assertEqual([row[3] for row in rows], ["NT", "NT", "NT", "HO", "HO", None])
        self.assertEqual([row[6:9] for row in rows[:3]], [["0631", "Directeurs", "2011"]] * 3)
        self.assertEqual([row[0].rsplit(":", 1)[1] for row in rows[:3]], ["0", "1", "2"])
        self.assertEqual(len({row[0] for row in rows}), len(rows))
        self.assertNotEqual(rows[1][0], self.before_partition["rows"][1][0], "All ordered IDs must be replayed when a corrected identity collides")
        migration = metadata["normalizationMigrations"][0]
        report_raw = (self.output / migration["auditPath"].removeprefix("lmia/")).read_bytes()
        self.assertEqual(hashlib.sha256(report_raw).hexdigest(), migration["auditSha256"])
        report = json.loads(report_raw)
        self.assertIn("no source re-fetch or full raw-parser replay", report["method"])
        self.assertEqual(report["periods"][0]["source"]["sha256"], "a" * 64)
        self.assertEqual(report["periods"][0]["inputPartitionSha256"], hashlib.sha256(encoded(self.before_partition)).hexdigest())
        self.assertEqual(report["periods"][0]["outputPartitionSha256"], hashlib.sha256((self.output / "periods/2016.json").read_bytes()).hexdigest())

    def test_second_run_is_exact_no_op_and_dry_run_never_publishes(self):
        before = snapshot_bytes(self.output)
        dry = reprocess(self.output, self.lock, applied_at=PROCESSED, check_only=True)
        self.assertTrue(dry["changed"])
        self.assertEqual(snapshot_bytes(self.output), before)
        reprocess(self.output, self.lock, applied_at=PROCESSED)
        first = snapshot_bytes(self.output)
        second = reprocess(self.output, self.lock, applied_at="2026-11-08T20:30:00+00:00")
        self.assertFalse(second["changed"])
        self.assertEqual(snapshot_bytes(self.output), first)

    def test_incorrect_row_or_location_preimage_refuses_publication(self):
        incorrect_ordinal = self.before_partition["rows"][0][0].rsplit(":", 1)[0] + ":99"
        for field, value in ((0, RESOURCE + ":incorrect:0"), (0, incorrect_ordinal), (11, "loc-incorrect")):
            with self.subTest(field=field):
                partition = copy.deepcopy(self.before_partition)
                partition["rows"][0][field] = value
                (self.output / "periods/2016.json").write_bytes(encoded(partition))
                before = snapshot_bytes(self.output)
                with self.assertRaisesRegex(ValueError, "preimage mismatch"):
                    reprocess(self.output, self.lock, applied_at=PROCESSED)
                self.assertEqual(snapshot_bytes(self.output), before)

    def test_parser_two_resources_are_outside_this_maintenance_scope(self):
        metadata = copy.deepcopy(self.before_metadata)
        metadata["resources"][0]["transformVersion"] = 2
        (self.output / "metadata.json").write_bytes(encoded(metadata))
        before = snapshot_bytes(self.output)
        result = reprocess(self.output, self.lock, applied_at=PROCESSED)
        self.assertFalse(result["changed"])
        self.assertEqual(snapshot_bytes(self.output), before)

    def test_unknown_transform_refuses_and_unknown_noc_edition_is_not_guessed(self):
        metadata = copy.deepcopy(self.before_metadata)
        metadata["resources"][0]["transformVersion"] = 99
        (self.output / "metadata.json").write_bytes(encoded(metadata))
        before = snapshot_bytes(self.output)
        with self.assertRaisesRegex(ValueError, "Unsupported LMIA transformVersion"):
            reprocess(self.output, self.lock, applied_at=PROCESSED)
        self.assertEqual(snapshot_bytes(self.output), before)
        (self.output / "metadata.json").write_bytes(encoded(self.before_metadata))
        (self.output / f"audits/{RESOURCE}.json").write_bytes(encoded({"declaredNocVersion": "2016"}))
        result = reprocess(self.output, self.lock, applied_at=PROCESSED)
        self.assertEqual(result["occupationCodeCorrections"], 0)
        rows = json.loads((self.output / "periods/2016.json").read_text())["rows"]
        self.assertEqual(rows[0][6:9], [None, "631-Directeurs", None])

    def test_stage_validation_failure_preserves_published_bytes(self):
        before = snapshot_bytes(self.output)
        def validate(path):
            value = validate_directory(path)
            if path != self.output:
                raise ValueError("Staged validation refused")
            return value
        with self.assertRaisesRegex(ValueError, "Staged validation refused"):
            reprocess(self.output, self.lock, applied_at=PROCESSED, validate_snapshot=validate)
        self.assertEqual(snapshot_bytes(self.output), before)
        self.assertEqual(list(self.root.glob(".lmia-normalize-*")), [])

    def test_snapshot_rejects_missing_corrupt_or_unsafe_normalization_audit(self):
        reprocess(self.output, self.lock, applied_at=PROCESSED)
        metadata = validate_directory(self.output)
        audit = self.output / metadata["normalizationMigrations"][0]["auditPath"].removeprefix("lmia/")
        original = audit.read_bytes()
        audit.unlink()
        with self.assertRaisesRegex(ValueError, "Missing LMIA normalization audit"):
            validate_directory(self.output)
        audit.write_bytes(original + b" ")
        with self.assertRaisesRegex(ValueError, "audit hash mismatch"):
            validate_directory(self.output)
        audit.write_bytes(original)
        validate_directory(self.output)
        metadata["normalizationMigrations"][0]["auditPath"] = "lmia/normalization-audits/../../outside.json"
        (self.output / "metadata.json").write_bytes(encoded(metadata))
        with self.assertRaisesRegex(ValueError, "Unsafe LMIA normalization audit path"):
            validate_directory(self.output)

    def test_publication_lock_is_held_before_every_snapshot_read(self):
        checked = []
        def validate(path):
            with self.lock.open("a") as contender:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
            checked.append(path)
            return validate_directory(path)
        reprocess(self.output, self.lock, applied_at=PROCESSED, validate_snapshot=validate)
        self.assertEqual(len(checked), 2)


if __name__ == "__main__":
    unittest.main()
