"""Check the complete Awesome Canada catalogue, then atomically publish a validated snapshot.

Usage: python3 -I pipeline/services/run.py [--commit SHA] [--accept-large-removals]
The override is for a reviewed, complete upstream contraction, never a network failure.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch, meta_for
from services.ingest import (COPYRIGHT, REPOSITORY, SITE, blank_catalogue, blank_history,
                    failed_snapshot, reconcile, validate_snapshot)
from services.check import validate_directory
from refresh import exchange

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/data/services"
API = "https://api.github.com/repos/wra-sol/awesome-canada"


def json_read(path, fallback):
    return json.loads(path.read_text()) if path.exists() else fallback


def git_blob_sha(contents):
    return hashlib.sha1(b"blob " + str(len(contents)).encode() + b"\x00" + contents).hexdigest()


def download_snapshot(commit=None, attempt=None):
    if commit is None:
        commit_file = fetch(f"{API}/commits/main", max_age_days=0, retries=2, timeout=40)
        commit_data = json.loads(commit_file.read_text())
        commit = commit_data["sha"]
        committed_at = commit_data.get("commit", {}).get("committer", {}).get("date")
    else:
        committed_at = None
    if not isinstance(commit, str) or not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Upstream commit must be a complete 40-character Git SHA")
    if attempt is not None:
        attempt["sourceCommit"] = commit
    # A pinned Git blob/size check rejects truncated or mismatched downloads.
    metadata_file = fetch(f"{API}/contents/data/resources.json", params={"ref": commit}, retries=2, timeout=40)
    metadata = json.loads(metadata_file.read_text())
    catalogue_file = fetch(f"https://raw.githubusercontent.com/wra-sol/awesome-canada/{commit}/data/resources.json", retries=2, timeout=45)
    contents = catalogue_file.read_bytes()
    if len(contents) != metadata.get("size") or git_blob_sha(contents) != metadata.get("sha"):
        raise ValueError("Catalogue Git blob checksum/size mismatch; incomplete download rejected")
    license_file = fetch(f"https://raw.githubusercontent.com/wra-sol/awesome-canada/{commit}/LICENSE", retries=2, timeout=30)
    license_text = license_file.read_text()
    if COPYRIGHT not in license_text or not license_text.startswith("MIT License") or "IN THE SOFTWARE." not in " ".join(license_text.split()):
        raise ValueError("License validation failed; review upstream terms and importer assumptions before importing")
    source = {"id": "awesome-canada", "name": "Awesome Canada", "repositoryUrl": REPOSITORY, "siteUrl": SITE,
              "catalogueUrl": f"{REPOSITORY}/blob/{commit}/data/resources.json", "commit": commit,
              "contentHash": hashlib.sha256(contents).hexdigest(), "gitBlobSha": metadata["sha"],
              "bytes": len(contents), "retrievedAt": meta_for(catalogue_file).get("retrievedAt"),
              "commitDate": committed_at, "licenseHash": hashlib.sha256(license_text.encode()).hexdigest()}
    payload = json.loads(contents.decode("utf-8-sig"))
    return payload, source, license_text


def publish(catalogue, history, report, license_text, output=OUTPUT):
    """All related files become visible as one generation; failures retain old bytes."""
    validate_snapshot(catalogue, history)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".services-stage-", dir=output.parent))
    try:
        for filename, value in (("catalogue.json", catalogue), ("history.json", history), ("quarantine.json", report)):
            (staging / filename).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
        (staging / "LICENSE.txt").write_text(license_text)
        if catalogue["entries"]:
            validate_directory(staging)
        if output.exists():
            exchange(staging, output)
        else:
            staging.rename(output)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def refresh_locked(args):
    previous = json_read(OUTPUT / "catalogue.json", blank_catalogue())
    history = json_read(OUTPUT / "history.json", blank_history())
    validate_snapshot(previous, history)
    at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    run_url = os.environ.get("NORTHWARD_RUN_URL") or None
    if not run_url and os.environ.get("GITHUB_RUN_ID") and os.environ.get("GITHUB_REPOSITORY"):
        run_url = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    old_license = OUTPUT / "LICENSE.txt"
    repository_license = ROOT / "third_party/awesome-canada/LICENSE"
    license_text = old_license.read_text() if old_license.exists() else repository_license.read_text()
    attempt = {"sourceCommit": args.commit}
    try:
        payload, source, fetched_license = download_snapshot(args.commit, attempt)
        result = reconcile(payload, source, previous, history, at=at, run_url=run_url,
                           allow_large_removals=args.accept_large_removals)
        if result[0]["meta"]["status"] != "failed":
            license_text = fetched_license
    except Exception as error:
        result = failed_snapshot(previous, history, at, str(error), source_commit=attempt["sourceCommit"], run_url=run_url)
    publish(*result, license_text)
    meta = result[0]["meta"]
    print(f"Services {meta['status']}: {meta['counts']['current']} current records, "
          f"{meta['counts']['retired']} retired, {meta['counts']['categories']} categories; "
          f"snapshot commit {meta['source']['commit']}")
    if meta["error"]:
        print(meta["error"])
    return 2 if meta["status"] == "failed" else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", help="Reproduce a specific complete upstream commit")
    parser.add_argument("--accept-large-removals", action="store_true", help="Accept a reviewed complete catalogue contraction/category removal")
    args = parser.parse_args()
    raw = ROOT / "data/raw"
    raw.mkdir(parents=True, exist_ok=True)
    # Must precede previous-snapshot reads, including read failures and no-op checks.
    with (raw / ".publication.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return refresh_locked(args)


if __name__ == "__main__":
    raise SystemExit(main())
