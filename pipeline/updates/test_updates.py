"""Focused regressions, with real source excerpts; no network or extra test stack."""
import copy
import fcntl
import json
import select
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import (SOURCES, NEWS_PAGE, PDU_PAGE, ROUNDS_PAGE, parse_news, parse_pdu,
                    parse_rounds, news_endpoint, rounds_endpoint, merge_source, validate_feed,
                    news_atom_endpoint, news_publication_types)
from run import refresh

FIXTURES = Path(__file__).resolve().parent / "fixtures"
NOW = "2026-11-05T12:00:00+00:00"
LATER = "2026-11-05T18:00:00+00:00"


def fixture(name):
    return (FIXTURES / name).read_text()


def source_inputs():
    news_landing, rounds_landing = fixture("news-landing.html"), fixture("rounds-landing.html")
    return {NEWS_PAGE: news_landing, news_endpoint(news_landing): fixture("news.json"),
            news_atom_endpoint(news_endpoint(news_landing)): fixture('news-atom.xml'),
            PDU_PAGE: fixture("program-delivery.html"), ROUNDS_PAGE: rounds_landing,
            rounds_endpoint(rounds_landing): fixture("rounds.json")}


class IRCCUpdatesTests(unittest.TestCase):
    def setUp(self):
        self.inputs = source_inputs()
        self.feed = refresh({"entries": [], "sources": []}, self.inputs.__getitem__, NOW)

    def test_real_news_publication_dates_and_publisher_teaser(self):
        rows = parse_news(fixture("news.json"))
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]["publishedAt"], "2026-11-03T10:00:00-05:00")
        self.assertEqual(rows[0]["title"], "Canada modernizes the asylum system to support timely decisions")
        self.assertNotIn("description", rows[0])  # Do not duplicate title as a summary.
        self.assertIn("Express Entry", rows[-1]["title"])
        self.assertEqual(rows[-1]["programIds"], ["express-entry"])
        self.assertNotIn("effectiveDate", rows[-1])  # No date inferred by a language model.

    def test_identical_titles_can_be_distinct_official_publication_types(self):
        rows = parse_news(fixture('news.json'), news_publication_types(fixture('news-atom.xml')))
        self.assertEqual(rows[0]['title'], rows[1]['title'])
        self.assertNotEqual(rows[0]['id'], rows[1]['id'])
        self.assertEqual(rows[0]['publicationType'], 'backgrounders')
        self.assertEqual(rows[1]['publicationType'], 'news releases')

    def test_real_program_delivery_rows(self):
        rows = parse_pdu(fixture("program-delivery.html"), 2024)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["title"], "Temporary resident permits: applying for permanent residence")
        self.assertEqual(rows[0]["publishedAt"], "2026-11-03")
        self.assertEqual(rows[0]["topics"], ["Temporary residents"])
        self.assertEqual(rows[-1]["topics"], ["Refugees"])

    def test_real_draw_fields_and_alphanumeric_rounds(self):
        rows = parse_rounds(fixture("rounds.json"))
        self.assertEqual(rows[0]["draw"]["round"], "453")
        self.assertEqual(rows[0]["draw"]["invitations"], 150)
        self.assertEqual(rows[0]["draw"]["crsCutoff"], 477)
        self.assertEqual(rows[0]["draw"]["category"], "Transport Occupations, 2026-Version 2")
        self.assertEqual({r["draw"]["round"] for r in rows}, {"453", "91a", "91b", "1"})
        self.assertEqual(len({r["url"] for r in rows}), 4)
        self.assertTrue(rows[0]["url"].endswith("invitations.html?q=453"))
        self.assertNotIn("/content/canadasite/", rows[0]["url"])

    def test_repeated_processing_has_stable_ids_hashes_and_first_seen(self):
        again = refresh(self.feed, self.inputs.__getitem__, LATER)
        self.assertEqual(len(again["entries"]), len(self.feed["entries"]))
        old = {r["id"]: r for r in self.feed["entries"]}
        for row in again["entries"]:
            self.assertEqual(row["firstSeenAt"], NOW)
            self.assertEqual(row["lastCheckedAt"], LATER)
            self.assertEqual(row["contentHash"], old[row["id"]]["contentHash"])

    def test_duplicate_entries_are_idempotent(self):
        raw = parse_news(fixture("news.json"))
        rows, _ = merge_source(self.feed, raw + raw, SOURCES[0], LATER)
        self.assertEqual(len(rows), 4)

    def test_existing_publication_changes_in_place(self):
        raw = parse_news(fixture("news.json"))
        before = next(e for e in self.feed["entries"] if e["id"] == raw[0]["id"])
        raw[0]["title"] += " — corrected"
        rows, _ = merge_source(self.feed, raw, SOURCES[0], LATER)
        after = next(e for e in rows if e["id"] == before["id"])
        self.assertEqual(len(rows), 4)
        self.assertEqual(after["firstSeenAt"], before["firstSeenAt"])
        self.assertNotEqual(after["contentHash"], before["contentHash"])
        self.assertEqual(after["contentChangedAt"], LATER)
        self.assertNotIn("updatedAt", after)  # Observation is not a publisher date.

    def test_pdu_footer_changes_do_not_create_or_change_publications(self):
        original = parse_pdu(fixture("program-delivery.html"), 2024)
        altered = parse_pdu(fixture("program-delivery.html") + '<footer>Updated 2026-11-05 <a href="/en/contact.html">Contact</a></footer>', 2024)
        self.assertEqual(original, altered)

    def test_network_failure_retains_entries_and_successful_check_time(self):
        def read(url):
            if url == PDU_PAGE:
                raise OSError("Simulated unavailable official source")
            return self.inputs[url]
        after = refresh(self.feed, read, LATER)
        self.assertEqual([e for e in after["entries"] if e["sourceId"] == SOURCES[1]["id"]],
                         [e for e in self.feed["entries"] if e["sourceId"] == SOURCES[1]["id"]])
        state = after["sources"][1]
        self.assertEqual(state["status"], "failed")
        self.assertEqual(state["lastSuccessfulCheckAt"], NOW)
        self.assertEqual(state["lastCheckedAt"], LATER)

    def test_unexpected_format_retains_source_and_reports_error(self):
        self.inputs[PDU_PAGE] = "<html>Site maintenance <footer>Updated today</footer></html>"
        after = refresh(self.feed, self.inputs.__getitem__, LATER)
        self.assertEqual(after["sources"][1]["status"], "failed")
        self.assertEqual(after["sources"][1]["count"], 3)
        self.assertIn("table missing", after["sources"][1]["error"])

    def test_conflicting_duplicate_does_not_publish_partial_source(self):
        endpoint = news_endpoint(self.inputs[NEWS_PAGE])
        payload = json.loads(self.inputs[endpoint])
        duplicate = copy.deepcopy(payload["feed"]["entry"][0])
        duplicate["title"] = "Conflicting title for the same publication"
        payload["feed"]["entry"].append(duplicate)
        self.inputs[endpoint] = json.dumps(payload)
        after = refresh(self.feed, self.inputs.__getitem__, LATER)
        self.assertEqual(after["sources"][0]["status"], "failed")
        self.assertEqual(after["sources"][0]["count"], 4)
        self.assertEqual([e for e in after["entries"] if e["sourceId"] == SOURCES[0]["id"]],
                         [e for e in self.feed["entries"] if e["sourceId"] == SOURCES[0]["id"]])

    def test_missing_feed_items_are_retained_not_deleted(self):
        rows, _ = merge_source(self.feed, parse_news(fixture("news.json"))[:1], SOURCES[0], LATER)
        self.assertEqual(len(rows), 4)

    def test_schema_validates_generated_hash(self):
        validate_feed(self.feed)
        self.feed["entries"][0]["title"] += " tampered"
        with self.assertRaisesRegex(ValueError, "hash"):
            validate_feed(self.feed)

    def test_runner_waits_for_publication_and_reads_the_latest_feed(self):
        """A real second process must not read stale input while a publisher holds the lock."""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            raw = root / 'data/raw'
            output = root / 'public/data/updates.json'
            raw.mkdir(parents=True)
            output.parent.mkdir(parents=True)
            older = copy.deepcopy(self.feed)
            removed = older['entries'].pop()
            for source in older['sources']:
                if source['id'] == removed['sourceId']:
                    source['count'] -= 1
            output.write_text(json.dumps(older))
            worker = r'''
import fcntl, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import run
run.ROOT = Path(sys.argv[2])
run.OUTPUT = run.ROOT / 'public/data/updates.json'
original_flock = fcntl.flock
def flock(fd, operation):
    print('LOCK_WAIT', flush=True)
    return original_flock(fd, operation)
run.fcntl.flock = flock
def unavailable(*args, **kwargs):
    raise OSError('Offline concurrency regression; preserve the feed read after locking')
run.fetch = unavailable
raise SystemExit(run.main())
'''
            with (raw / '.publication.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                child = subprocess.Popen([sys.executable, '-I', '-c', worker,
                                          str(Path(__file__).resolve().parent), str(root)],
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    self.assertTrue(select.select([child.stdout], [], [], 10)[0], 'Worker did not reach its publication lock')
                    self.assertEqual(child.stdout.readline().strip(), 'LOCK_WAIT')
                    self.assertIsNone(child.poll(), 'Worker must block while another publisher holds the lock')
                    # Simulate another publication adding an entry while it owns
                    # the same lock. The waiting runner must merge from this file.
                    output.write_text(json.dumps(self.feed))
                    fcntl.flock(lock, fcntl.LOCK_UN)
                    stdout, stderr = child.communicate(timeout=10)
                    self.assertEqual(child.returncode, 2, stdout + stderr)
                    after = json.loads(output.read_text())
                    self.assertEqual(after['entries'], self.feed['entries'])
                    self.assertIn(removed['id'], {entry['id'] for entry in after['entries']})
                finally:
                    if child.poll() is None:
                        child.kill()
                        child.communicate()


if __name__ == "__main__":
    unittest.main()
