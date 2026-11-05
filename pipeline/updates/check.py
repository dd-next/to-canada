"""Self-contained validation of the committed IRCC feed; no network requests."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import validate_feed

root = Path(__file__).resolve().parents[2]
feed = json.loads((root / "public/data/updates.json").read_text())
validate_feed(feed)
known_programs = {p["id"] for p in json.loads((root / "public/data/programs.json").read_text())}
for item in feed["entries"]:
    assert set(item["programIds"]) <= known_programs, item["id"]
assert feed["entries"], "No IRCC publications in the saved snapshot"
for source in feed["sources"]:
    assert source["count"] == sum(e["sourceId"] == source["id"] for e in feed["entries"])
print(f"IRCC snapshot valid: {len(feed['entries'])} unique records, three source statuses, verified program references")
