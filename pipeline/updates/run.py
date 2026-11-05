"""Refresh only the small IRCC feeds, retaining each failed source's last entries."""
from __future__ import annotations

import json
import fcntl
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch  # noqa: E402
from ingest import (SOURCES, NEWS_PAGE, PDU_PAGE, ROUNDS_PAGE, news_endpoint, rounds_endpoint,
                    news_atom_endpoint, news_publication_types,
                    parse_news, parse_pdu, parse_rounds, merge_source, validate_feed)  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/data/updates.json"


def refresh(previous, read, checked_at):
    year = int(checked_at[:4])
    def news():
        endpoint = news_endpoint(read(NEWS_PAGE))
        publication_types = news_publication_types(read(news_atom_endpoint(endpoint)))
        return parse_news(read(endpoint), publication_types)

    loaders = {
        "ircc-news": news,
        "ircc-program-delivery": lambda: parse_pdu(read(PDU_PAGE), year - 2),
        "ircc-express-entry": lambda: parse_rounds(read(rounds_endpoint(read(ROUNDS_PAGE)))),
    }
    entries, states = [], []
    for source in SOURCES:
        try:
            rows = loaders[source["id"]]()
            merged, state = merge_source(previous, rows, source, checked_at)
        except Exception as error:
            merged, state = merge_source(previous, [], source, checked_at, str(error))
        entries.extend(merged)
        states.append(state)
    result = {"schemaVersion": 1, "generatedAt": checked_at,
              "entries": sorted(entries, key=lambda r: (r["publishedAt"][:10], r["publishedAt"], r["id"]), reverse=True),
              "sources": states}
    validate_feed(result)
    return result


def write_atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".updates-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as file:
            json.dump(value, file, ensure_ascii=False, indent=1, allow_nan=False)
            file.write("\n")
        Path(temp).replace(path)
    finally:
        Path(temp).unlink(missing_ok=True)


def refresh_locked():
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {"entries": [], "sources": []}
    if OUTPUT.exists():
        validate_feed(previous)
    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    downloads = {}

    def read(url):
        if url not in downloads:
            # Check each official endpoint once per run. common.fetch raises on
            # failed refresh, so an old cached page cannot count as a fresh check.
            path = fetch(url, max_age_days=0, retries=2, timeout=45)
            downloads[url] = path.read_text(encoding="utf-8-sig")
        return downloads[url]

    result = refresh(previous, read, checked_at)
    write_atomic(OUTPUT, result)
    for state in result["sources"]:
        print(f"{state['id']}: {state['status']}; {state['count']} records; "
              f"{state['coverageStart']} to {state['coverageEnd']}")
        if state.get("error"):
            print("  " + state["error"])
    return 2 if any(s["status"] == "failed" for s in result["sources"]) else 0


def main():
    # Statistics refresh and standalone app-data builds exchange whole data
    # directories. Serialize before reading the previous feed as well as during
    # the final write, so neither stale merges nor directory swaps lose entries.
    raw = ROOT / "data" / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    with (raw / ".publication.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return refresh_locked()


if __name__ == "__main__":
    raise SystemExit(main())
