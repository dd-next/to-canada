"""Services lifecycle, completeness and publication regressions (no network)."""
from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.ingest import (blank_catalogue, digest, failed_snapshot, reconcile,
                             safe_url, validate_input, validate_snapshot)
from services.run import git_blob_sha, publish
from services.check import validate_directory

ROOT = Path(__file__).resolve().parents[2]
AT = "2026-11-07T18:00:00+00:00"
LATER = "2026-11-08T18:00:00+00:00"
LATEST = "2026-11-09T18:00:00+00:00"
SOURCE = {"id": "awesome-canada", "name": "Awesome Canada", "commit": "a" * 40,
          "contentHash": "b" * 64, "catalogueUrl": "https://github.com/wra-sol/awesome-canada/blob/" + "a" * 40 + "/data/resources.json"}


def resource(n, **patches):
    return {"name": f"Service {n}", "description": f"Useful service {n}", "url": f"https://example.ca/{n}",
            "level": "Municipal", "jurisdiction": "Example municipality", "category": "health", "type": "Portal",
            "tags": ["care", "example"], **patches}


def initial(rows=None):
    return reconcile(rows if rows is not None else [resource(n) for n in range(10)], SOURCE, at=AT)


class ServicesTests(unittest.TestCase):
    def test_initial_import_accounts_for_every_record_and_preserves_source(self):
        rows = [resource(1, name="Centre de santé — Health centre", dateAdded="2024-01-01", extra={"url_fr": "https://example.ca/fr"}),
                resource(2, level="Provincial", jurisdiction="Yukon")]
        catalogue, history, quarantine = initial(rows)
        validate_snapshot(catalogue, history)
        self.assertEqual(catalogue["meta"]["counts"]["input"], 2)
        self.assertEqual(catalogue["meta"]["counts"]["current"], 2)
        self.assertEqual(history["events"][0]["type"], "initial_import")
        self.assertEqual(history["events"][0]["counts"]["added"], 2)
        self.assertEqual(catalogue["entries"][0]["sourceRecord"], rows[0])
        self.assertEqual(catalogue["entries"][0]["firstSeenAt"], AT)
        self.assertNotEqual(catalogue["entries"][0]["firstSeenAt"], rows[0]["dateAdded"])
        self.assertEqual(catalogue["entries"][1]["coverage"]["kind"], "provincial_territorial")
        self.assertTrue(quarantine["accepted"])

    def test_unchanged_check_only_updates_check_time_and_same_run_is_idempotent(self):
        rows = [resource(n) for n in range(10)]
        old, history, _ = initial(rows)
        new, new_history, _ = reconcile(rows, SOURCE, old, history, at=LATER)
        self.assertEqual(new["meta"]["status"], "no_changes")
        self.assertEqual(new["meta"]["lastSuccessfulContentUpdateAt"], AT)
        self.assertEqual(new["meta"]["lastSuccessfulCheckAt"], LATER)
        self.assertEqual(new["entries"], old["entries"])
        self.assertEqual(new_history["events"], history["events"])
        again, again_history, _ = reconcile(rows, SOURCE, new, new_history, at=LATER)
        self.assertEqual(again, new)
        self.assertEqual(again_history, new_history)

    def test_description_category_and_name_edits_keep_stable_id(self):
        rows = [resource(n) for n in range(10)]
        old, history, _ = initial(rows)
        changed = copy.deepcopy(rows)
        changed[0].update(description="Changed purpose", category="new-future-category", name="New display name")
        new, hist, _ = reconcile(changed, SOURCE, old, history, at=LATER)
        by_url = {r["url"]: r for r in new["entries"]}
        self.assertEqual(by_url[rows[0]["url"]]["id"], old["entries"][0]["id"])
        self.assertEqual(by_url[rows[0]["url"]]["contentChangedAt"], LATER)
        self.assertEqual(hist["events"][-1]["counts"], {"added": 0, "edited": 1, "retired": 0, "restored": 0})
        self.assertEqual(hist["events"][-1]["changes"][0]["fields"], ["category", "description", "name"])

    def test_additions_removals_and_restoration_retain_audit_identity(self):
        rows = [resource(n) for n in range(10)]
        old, history, _ = initial(rows)
        new, hist, _ = reconcile(rows[1:] + [resource(11)], SOURCE, old, history, at=LATER)
        self.assertEqual(new["meta"]["counts"]["current"], 10)
        self.assertEqual(new["meta"]["counts"]["retired"], 1)
        retired = next(e for e in new["entries"] if e["state"] == "retired")
        self.assertEqual(retired["sourceRecord"], rows[0])
        restored, hist, _ = reconcile(rows + [resource(11)], SOURCE, new, hist, at=LATEST)
        self.assertEqual(next(e for e in restored["entries"] if e["url"] == rows[0]["url"])["id"], retired["id"])
        self.assertEqual(hist["events"][-1]["counts"]["restored"], 1)
        validate_snapshot(restored, hist)

    def test_duplicate_urls_do_not_merge_distinct_coverage_or_identical_occurrences(self):
        rows = [resource(1), resource(1, jurisdiction="Second municipality"), resource(1)]
        old, history, _ = initial(rows)
        self.assertEqual(len(old["entries"]), 3)
        self.assertEqual(len({e["id"] for e in old["entries"]}), 3)
        reordered, hist, _ = reconcile(list(reversed(rows)), SOURCE, old, history, at=LATER)
        self.assertEqual({e["id"] for e in reordered["entries"]}, {e["id"] for e in old["entries"]})
        self.assertEqual(len(hist["events"]), 1)
        self.assertEqual(reordered["meta"]["counts"]["input"], 3)

    def test_schema_anomaly_is_quarantined_and_never_retires_valid_entries(self):
        old, history, _ = initial()
        bad = [resource(n) for n in range(10)]
        bad[0]["tags"] = "changed schema"
        new, hist, report = reconcile(bad, SOURCE, old, history, at=LATER)
        self.assertEqual(new["entries"], old["entries"])
        self.assertEqual(new["meta"]["status"], "failed")
        self.assertEqual(new["meta"]["lastSuccessfulCheckAt"], AT)
        self.assertEqual(len(report["records"]), 1)
        self.assertEqual(report["records"][0]["recordIndex"], 0)
        self.assertIn("tags", report["records"][0]["reasons"][0])
        self.assertEqual(hist["events"], history["events"])
        validate_snapshot(new, hist)

    def test_duplicate_occurrence_addition_and_removal_preserve_surviving_ids(self):
        rows = [resource(n) for n in range(10)] + [resource(0)]
        old, history, _ = initial(rows)
        duplicate_ids = sorted(e["id"] for e in old["entries"] if e["url"] == rows[0]["url"])
        fewer, hist, _ = reconcile(rows[:-1], SOURCE, old, history, at=LATER)
        survivor = next(e for e in fewer["entries"] if e["url"] == rows[0]["url"] and e["state"] == "current")
        self.assertEqual(survivor["id"], duplicate_ids[0])
        self.assertEqual(hist["events"][-1]["counts"], {"added": 0, "edited": 0, "retired": 1, "restored": 0})
        more, hist, _ = reconcile(rows + [resource(0)], SOURCE, fewer, hist, at=LATEST)
        current_ids = {e["id"] for e in more["entries"] if e["url"] == rows[0]["url"] and e["state"] == "current"}
        self.assertTrue(set(duplicate_ids) <= current_ids)
        self.assertEqual(hist["events"][-1]["counts"], {"added": 1, "edited": 0, "retired": 0, "restored": 1})
        validate_snapshot(more, hist)

    def test_removed_jurisdiction_is_reported_without_inventing_other_city_coverage(self):
        rows = [resource(n, jurisdiction="Small municipality" if n == 0 else "Example municipality") for n in range(10)]
        old, history, _ = initial(rows)
        new, _, _ = reconcile(rows[1:], SOURCE, old, history, at=LATER)
        self.assertIn("Small municipality", " ".join(new["meta"]["warnings"]))
        self.assertTrue(any(e["jurisdiction"] == "Small municipality" and e["state"] == "retired" for e in new["entries"]))

    def test_empty_failed_and_top_level_schema_change_retain_catalogue(self):
        old, history, _ = initial()
        for payload in ([], {"resources": [resource(1)]}):
            new, hist, _ = reconcile(payload, SOURCE, old, history, at=LATER)
            self.assertEqual(new["entries"], old["entries"])
            self.assertEqual(new["meta"]["status"], "failed")
            self.assertEqual(hist["events"], history["events"])
        failed, hist, _ = failed_snapshot(old, history, LATER, "HTTP 429; retry later")
        self.assertEqual(failed["entries"], old["entries"])
        self.assertEqual(failed["meta"]["lastSuccessfulCheckAt"], AT)
        self.assertEqual(hist["runs"][-1]["status"], "failed")

    def test_suspicious_contraction_requires_reviewed_override(self):
        old, history, _ = initial()
        new, _, _ = reconcile([resource(0)], SOURCE, old, history, at=LATER)
        self.assertEqual(new["entries"], old["entries"])
        self.assertIn("more than 20%", new["meta"]["error"])
        accepted, hist, _ = reconcile([resource(0)], SOURCE, old, history, at=LATER, allow_large_removals=True)
        self.assertEqual(accepted["meta"]["counts"]["retired"], 9)
        validate_snapshot(accepted, hist)

    def test_disappeared_category_blocks_removals_even_when_total_count_is_unchanged(self):
        rows = [resource(n, category="rare" if n == 0 else "health") for n in range(10)]
        old, history, _ = initial(rows)
        changed = [resource(n) for n in range(10)]
        failed, _, _ = reconcile(changed, SOURCE, old, history, at=LATER)
        self.assertIn("Categories disappeared: rare", failed["meta"]["error"])
        self.assertEqual(failed["entries"], old["entries"])

    def test_unknown_categories_jurisdictions_and_levels_are_preserved(self):
        row = resource(1, category="future-category", jurisdiction="Unmapped new district", level="Special jurisdiction")
        catalogue, history, _ = initial([row])
        self.assertEqual(catalogue["entries"][0]["sourceRecord"], row)
        self.assertEqual(catalogue["entries"][0]["coverage"]["kind"], "unmapped")
        self.assertEqual(catalogue["meta"]["categories"], ["future-category"])
        validate_snapshot(catalogue, history)

    def test_untrusted_text_is_retained_but_unsafe_outbound_schemes_are_rejected(self):
        row = resource(1, description='<img src=x onerror="alert(1)">')
        accepted, rejected = validate_input([row])
        self.assertEqual(accepted[0][1]["description"], row["description"])
        for url in ("javascript:alert(1)", "data:text/html,test", "//example.ca", "https://user:pass@example.ca", "https://exa\nmple.ca", "https://[invalid"):
            self.assertFalse(safe_url(url))
            _, rejected = validate_input([resource(1, url=url)])
            self.assertEqual(len(rejected), 1)
        self.assertTrue(safe_url("https://example.ca/fr?x=1#part"))

    def test_published_generation_is_valid_and_failed_exchange_keeps_old_bytes(self):
        catalogue, history, report = initial()
        license_text = (ROOT / "third_party/awesome-canada/LICENSE").read_text()
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "services"
            publish(catalogue, history, report, license_text, output)
            validate_directory(output)
            before = {p.name: p.read_bytes() for p in output.iterdir()}
            changed = reconcile([resource(n, description="Updated") for n in range(10)], SOURCE, catalogue, history, at=LATER)
            with patch("services.run.exchange", side_effect=OSError("simulated publication failure")):
                with self.assertRaises(OSError):
                    publish(*changed, license_text, output)
            self.assertEqual(before, {p.name: p.read_bytes() for p in output.iterdir()})

    def test_blob_hash_and_snapshot_hash_detect_different_bytes(self):
        self.assertEqual(git_blob_sha(b"test\n"), "9daeafb9864cf43055ae93beb0afd6c7d144bfa4")
        self.assertNotEqual(git_blob_sha(b"test\n"), git_blob_sha(b"test"))
        catalogue, history, _ = initial()
        catalogue["entries"][0]["sourceRecord"]["description"] = "tampered"
        with self.assertRaises(AssertionError):
            validate_snapshot(catalogue, history)

    def test_new_upstream_commit_without_content_changes_is_only_a_check(self):
        rows = [resource(n) for n in range(10)]
        old, history, _ = initial(rows)
        new_source = {**SOURCE, "commit": "c" * 40}
        new, hist, _ = reconcile(rows, new_source, old, history, at=LATER, run_url="https://github.com/dd-next/to-canada/actions/runs/123")
        self.assertEqual(new["meta"]["source"]["commit"], "c" * 40)
        self.assertEqual(new["meta"]["lastSuccessfulContentUpdateAt"], AT)
        self.assertEqual(hist["events"], history["events"])
        self.assertEqual(hist["runs"][-1]["runUrl"], "https://github.com/dd-next/to-canada/actions/runs/123")


if __name__ == "__main__":
    unittest.main()
