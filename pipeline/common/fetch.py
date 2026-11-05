"""Cached, polite, retrying downloads shared by every pipeline.

All raw downloads land in data/raw/<host>/ (git-ignored). A file is fetched at
most once per max_age; concurrent workers wait on a per-URL lock instead of
downloading twice. Every cached file has a sidecar <file>.meta.json recording
the URL, retrieval time and response headers (used for provenance).
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
UA = "Northward-data-pipeline/0.1 (open-data research; contact via repository)"
CA_BUNDLE = os.environ.get("REQUESTS_CA_BUNDLE") or (
    "/root/.ccr/ca-bundle.crt" if Path("/root/.ccr/ca-bundle.crt").exists() else True
)


class FetchError(RuntimeError):
    pass


def _cache_path(url: str, payload: object | None, suffix: str | None) -> Path:
    parsed = urlparse(url)
    key = url if payload is None else url + "|" + json.dumps(payload, sort_keys=True)
    digest = hashlib.sha1(key.encode()).hexdigest()[:12]
    base = os.path.basename(parsed.path) or "index"
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:80]
    if suffix and not base.endswith(suffix):
        base += suffix
    return RAW / parsed.netloc / f"{digest}_{base}"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def meta_for(path: Path) -> dict:
    mp = Path(str(path) + ".meta.json")
    return json.loads(mp.read_text()) if mp.exists() else {}


def fetch(
    url: str,
    *,
    params: dict | None = None,
    json_payload: object | None = None,
    max_age_days: float | None = None,
    retries: int = 4,
    timeout: int = 180,
    suffix: str | None = None,
    headers: dict | None = None,
) -> Path:
    """Download url (GET, or POST when json_payload is given) into the raw cache.

    Returns the cached file path. Raises FetchError after bounded retries.
    max_age_days=None means "use the cached copy forever" (reproducible runs);
    pass a number (or set NORTHWARD_REFRESH=1) to refresh.
    """
    full_url = requests.Request("GET", url, params=params).prepare().url or url
    path = _cache_path(full_url, json_payload, suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    force = os.environ.get("NORTHWARD_REFRESH") == "1"
    lock_path = Path(str(path) + ".lock")
    with open(lock_path, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            if path.exists() and not force:
                age_days = (time.time() - path.stat().st_mtime) / 86400
                if max_age_days is None or age_days < max_age_days:
                    return path
            last_err: Exception | None = None
            for attempt in range(retries):
                try:
                    h = {"User-Agent": UA, **(headers or {})}
                    if json_payload is not None:
                        r = requests.post(full_url, json=json_payload, headers=h, timeout=timeout, verify=CA_BUNDLE)
                    else:
                        r = requests.get(full_url, headers=h, timeout=timeout, verify=CA_BUNDLE, stream=True)
                    if r.status_code >= 400:
                        r.close()
                    if r.status_code in (429, 500, 502, 503, 504):
                        raise FetchError(f"HTTP {r.status_code}")
                    if r.status_code >= 400:
                        # Client errors are not retried.
                        raise FetchError(f"HTTP {r.status_code} for {full_url}")
                    tmp = Path(str(path) + ".part")
                    with open(tmp, "wb") as fh:
                        for chunk in r.iter_content(1 << 16):
                            fh.write(chunk)
                    tmp.replace(path)
                    meta = {
                        "url": full_url,
                        "method": "POST" if json_payload is not None else "GET",
                        "payload": json_payload,
                        "retrievedAt": now_iso(),
                        "status": r.status_code,
                        "contentType": r.headers.get("Content-Type"),
                        "lastModified": r.headers.get("Last-Modified"),
                        "bytes": path.stat().st_size,
                    }
                    Path(str(path) + ".meta.json").write_text(json.dumps(meta, indent=1))
                    return path
                except (requests.RequestException, FetchError) as e:  # bounded retry
                    last_err = e
                    if isinstance(e, FetchError) and "HTTP 4" in str(e) and "HTTP 429" not in str(e):
                        break
                    time.sleep(2 ** (attempt + 1))
            if path.exists():
                # Keep the previously retrieved snapshot rather than failing hard.
                print(f"[fetch] WARNING refresh failed, using cached snapshot: {full_url} ({last_err})")
                return path
            raise FetchError(f"Failed to fetch {full_url}: {last_err}")
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def fetch_json(url: str, **kw) -> object:
    return json.loads(fetch(url, suffix=".json", **kw).read_text(encoding="utf-8"))


def fetch_text(url: str, **kw) -> str:
    return fetch(url, **kw).read_text(encoding="utf-8", errors="replace")
