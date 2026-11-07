"""Discover and refresh the official historical positive LMIA series.

Exit 0: complete metadata/resource check. Exit 2: a source failed, with last
valid partitions retained and explicit coverage/check status. --force downloads
all selected resources even when publisher revision metadata is unchanged.
"""
from __future__ import annotations

import argparse
import copy
import fcntl
import json
import os
import shutil
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch, meta_for
from lmia.check import validate_directory
from lmia.ingest import (CATALOGUE_URL, DATASET, PROVINCES, TRANSFORM_VERSION, catalogue_cache,
                         digest, parse_file, select_resources, validate_catalogue_cache,
                         validate_official_catalogue, validate_partition)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/data/lmia"


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")


def empty_metadata():
    return {"schemaVersion": 1, "dataset": DATASET, "generatedAt": None, "lastAttemptAt": None,
            "lastSuccessfulCheckAt": None, "lastSuccessfulUpdateAt": None, "status": "failed",
            "coverage": {"start": None, "end": None, "rowCount": 0, "periodCount": 0, "gaps": [], "notes": []},
            "periods": [], "resources": [], "excludedResources": [],
            "facets": {"provinces": [], "nocVersions": [], "streams": []}}


def coverage(periods, selected):
    ordered = sorted(periods, key=lambda p: p["start"])
    gaps = []
    for prev, curr in zip(ordered, ordered[1:]):
        after = date.fromisoformat(prev["end"]) + timedelta(days=1)
        if after.isoformat() < curr["start"]:
            gaps.append({"start": after.isoformat(), "end": (date.fromisoformat(curr["start"]) - timedelta(days=1)).isoformat(), "reason": "No validated canonical release for this interval"})
    present = {p["id"] for p in periods}
    for r in selected:
        if r["period"]["id"] not in present:
            gaps.append({"start": r["period"]["start"], "end": r["period"]["end"], "reason": "Publisher release discovered but not successfully ingested"})
    return {"start": ordered[0]["start"] if ordered else None, "end": ordered[-1]["end"] if ordered else None,
            "rowCount": sum(p["rowCount"] for p in periods), "periodCount": len(periods), "gaps": gaps,
            "notes": [
                "Historical positive LMIA decisions are not current vacancies, sponsorship promises or applicant eligibility.",
                "Coverage is the publisher's employer list, which excludes personal names; aggregate Other employers and Total rows are retained in source audits, not counted as named employers.",
                "Counts are summed only across non-overlapping reporting periods. Missing or suppressed counts stay unknown.",
                "Employer/location history requires the same publisher name, address and province label; similar names do not establish one legal entity.",
                "NOC versions remain separate. Early releases may not publish occupations, streams or approved LMIA counts.",
            ]}


def refresh(previous, previous_dir, stage, read_catalogue, read_resource, checked_at, force=False):
    """Injectable I/O boundary for preservation and partial-failure tests."""
    result = copy.deepcopy(previous)
    result.update(lastAttemptAt=checked_at, runUrl=os.environ.get("NORTHWARD_RUN_URL"))
    result.pop("error", None)
    cached_catalogue, catalogue_error, new_cache = False, None, None
    catalogue_checked_at = checked_at
    try:
        try:
            download = read_catalogue()
            if isinstance(download, tuple):
                package, provenance = download
            else:
                package, provenance = download, None
            if package.get("success") is False:
                raise ValueError("Official catalogue returned unsuccessful response")
            package = package.get("result", package)
            if not package.get("_discoverySource"):
                validate_official_catalogue(package)
                if provenance is not None:
                    new_cache = catalogue_cache(package, provenance)
                    catalogue_checked_at = new_cache["checkedAt"]
            elif (stage / "catalogue.json").exists():
                # A secondary discovery list must never displace a verified
                # canonical catalogue during an outage.
                raise ValueError(package.get("_catalogueError", "Current official catalogue is unavailable"))
        except Exception as error:
            cached_path = stage / "catalogue.json"
            if not cached_path.exists():
                raise
            cached = validate_catalogue_cache(json.loads(cached_path.read_text()))
            package = cached["package"]
            catalogue_checked_at = cached["checkedAt"]
            cached_catalogue, catalogue_error, new_cache = True, str(error), None
        selected, excluded = select_resources(package)
        discovery_only = bool(package.get("_discoverySource"))
        previous_periods = {p["id"]: p for p in previous["periods"]}
        selected_periods = {r["period"]["id"] for r in selected}
        missing_old = set(previous_periods) - selected_periods
        # A replacement set of finer periods is allowed only if it fully covers
        # every previously published interval. An incomplete catalogue cannot
        # silently remove historical coverage.
        uncovered = []
        for old in previous_periods.values():
            cursor = date.fromisoformat(old["start"])
            for r in selected:
                p = r["period"]
                if p["end"] < cursor.isoformat(): continue
                if p["start"] > cursor.isoformat(): break
                cursor = date.fromisoformat(p["end"]) + timedelta(days=1)
                if cursor.isoformat() > old["end"]: break
            if cursor.isoformat() <= old["end"]: uncovered.append(old["id"])
        if uncovered:
            raise ValueError(f"Catalogue no longer covers previously published periods: {uncovered}")
    except Exception as error:
        result.update(status="failed", error=str(error))
        return result
    if new_cache is not None:
        # Selection and prior-coverage checks above must pass before this
        # validated canonical response replaces the staged cache.
        dump(stage / "catalogue.json", new_cache)
    catalogue_state = {"url": CATALOGUE_URL, "publisherModifiedAt": package.get("metadata_modified"),
                       "checkedAt": None if discovery_only else catalogue_checked_at,
                       "lastSuccessfulCheckAt": None if discovery_only else catalogue_checked_at,
                       "lastAttemptAt": checked_at, "resourceCount": len(package["resources"]), "sha256": digest(package),
                       "status": "cached" if cached_catalogue else "unavailable" if discovery_only else "ok",
                       "discoverySource": package.get("_discoverySource"), "discoveryNote": package.get("_discoveryNote")}
    if (stage / "catalogue.json").exists():
        catalogue_state["cachePath"] = "lmia/catalogue.json"
    if cached_catalogue:
        catalogue_state["error"] = catalogue_error
    prior_resources = {r["id"]: r for r in previous["resources"]}
    resources, periods, errors = [], [], []
    changed = False
    provinces, noc_versions, streams = {}, set(), set()
    for r in selected:
        pid = r["period"]["id"]
        prior_period = previous_periods.get(pid)
        prior_resource = prior_resources.get(prior_period["resourceId"]) if prior_period else None
        target = stage / "periods" / f"{pid}.json"
        source_state = {**r, "notes": [], "rows": 0, "retrievedAt": None, "sha256": None, "status": "failed", "lastAttemptAt": checked_at}
        try:
            same_source = prior_resource and prior_resource["id"] == r["id"] and prior_resource["revision"] == r["revision"]
            reuse = not force and same_source and prior_resource.get("transformVersion") == TRANSFORM_VERSION and target.exists()
            if reuse:
                partition = json.loads(target.read_text())
                source_state = {**prior_resource, "status": "retained" if discovery_only or cached_catalogue else "ok", "lastAttemptAt": checked_at}
                if not discovery_only and not cached_catalogue:
                    source_state["lastSuccessfulCheckAt"] = checked_at
                source_state.pop("error", None)
            else:
                path, provenance = read_resource({**r, "reuseDownload": bool(same_source and not force)})
                partition, audit = parse_file(path, r)
                count = validate_partition(partition)
                if prior_period and count < prior_period["rowCount"] * 0.75:
                    raise ValueError(f"Suspicious reduction from {prior_period['rowCount']} to {count} rows; requires review")
                prior_bytes = target.read_bytes() if target.exists() else None
                dump(target, partition)
                changed = changed or prior_bytes != target.read_bytes()
                source_state.update(status="ok", retrievedAt=provenance["retrievedAt"], sha256=provenance["sha256"], rows=count,
                                    lastSuccessfulCheckAt=provenance.get("lastCheckedAt", provenance["retrievedAt"]), transformVersion=TRANSFORM_VERSION,
                                    notes=audit["notes"], auditPath=f"lmia/audits/{r['id']}.json")
                dump(stage / "audits" / f"{r['id']}.json", audit)
            count = validate_partition(partition)
            p = {**r["period"], "indexPath": f"lmia/periods/{pid}.json", "rowCount": count, "resourceId": r["id"], "status": source_state["status"], "indexBytes": target.stat().st_size}
        except Exception as error:
            errors.append({"resourceId": r["id"], "periodId": pid, "error": str(error)})
            if prior_period and prior_resource:
                # Copy explicit prior bytes; parser failure must not retain a partially written new file.
                source_path = previous_dir / prior_period["indexPath"].removeprefix("lmia/")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_path, target)
                partition = json.loads(target.read_text())
                source_state = {**prior_resource, "status": "retained", "lastAttemptAt": checked_at,
                                "attemptedRevision": r["revision"], "error": str(error)}
                p = {**prior_period, "status": "retained"}
            else:
                source_state.update(error=str(error))
                resources.append(source_state)
                continue
        resources.append(source_state)
        periods.append(p)
        for row in partition["rows"]:
            if row[3]: provinces[row[3]] = PROVINCES[row[3]][0]
            if row[8]: noc_versions.add(row[8])
            if row[5]: streams.add(row[5])
    if missing_old and errors:
        # Repartitioning an annual release into quarters is all-or-nothing;
        # otherwise a retained annual file could overlap successful quarters.
        retained = copy.deepcopy(previous)
        retained.update(lastAttemptAt=checked_at, status="partial", errors=errors, catalogue=catalogue_state,
                        error="Replacement reporting-period set was incomplete; previous non-overlapping series retained.")
        if cached_catalogue:
            retained["coverage"]["notes"].insert(0, f"Official catalogue check failed; using the last verified catalogue from {catalogue_checked_at}. Current catalogue completeness is unverified.")
        for p in retained["periods"]:
            source = previous_dir / p["indexPath"].removeprefix("lmia/")
            target = stage / p["indexPath"].removeprefix("lmia/")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        return retained
    if not periods:
        status = "failed"
    else:
        status = "partial" if errors or discovery_only or cached_catalogue else "ok"
    result.update(status=status, resources=resources, periods=periods, excludedResources=excluded,
                  coverage=coverage(periods, selected),
                  facets={"provinces": [{"code": code, "label": label} for code, label in sorted(provinces.items())],
                          "nocVersions": sorted(noc_versions), "streams": sorted(streams)},
                  catalogue=catalogue_state,
                  errors=errors)
    if discovery_only:
        result["error"] = package.get("_catalogueError", "Official catalogue unavailable; source URLs came from a secondary discovery list. Complete current coverage is unverified.")
        result["coverage"]["notes"].insert(0, "Official catalogue unavailable. Only successfully retrieved official workbooks are included. The other listed periods are discovery-only references, and complete current historical coverage is unverified.")
    if cached_catalogue:
        result["error"] = f"Official catalogue check failed: {catalogue_error}. Using the last verified catalogue from {catalogue_checked_at}; current catalogue completeness is unverified."
        result["coverage"]["notes"].insert(0, f"Official catalogue check failed; using the last verified catalogue from {catalogue_checked_at}. Individual resource downloads can progress, but current catalogue completeness is unverified.")
    if not errors and not discovery_only and not cached_catalogue:
        result["lastSuccessfulCheckAt"] = checked_at
    if changed:
        result["generatedAt"] = checked_at
        result["lastSuccessfulUpdateAt"] = checked_at
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Re-download selected resources even if catalogue revision is unchanged")
    args = parser.parse_args()
    raw = ROOT / "data/raw"
    raw.mkdir(parents=True, exist_ok=True)
    # Acquire before reading prior published state, including on failed checks.
    with (raw / ".publication.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = validate_directory(OUTPUT) if (OUTPUT / "metadata.json").exists() else empty_metadata()
        checked_at = now()
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix=".lmia-stage-", dir=OUTPUT.parent))
        try:
            if OUTPUT.exists():
                shutil.copytree(OUTPUT, stage, dirs_exist_ok=True)
            def read_catalogue():
                try:
                    path = fetch(CATALOGUE_URL, max_age_days=0, retries=2, timeout=35)
                    return json.loads(path.read_text(encoding="utf-8-sig")), meta_for(path)
                except Exception as error:
                    if (stage / "catalogue.json").exists():
                        # refresh validates the persisted canonical cache and
                        # records this failed attempt without refreshing its date.
                        raise
                    # Discovery fallback can bootstrap genuine official workbooks
                    # during an outage, never replace a previously verified catalogue.
                    if previous.get("periods") and not previous.get("catalogue", {}).get("discoverySource"):
                        raise
                    fallback = json.loads((Path(__file__).parent / "discovery-bootstrap.json").read_text())
                    fallback["_catalogueError"] = str(error) + "; current official catalogue could not be verified."
                    return fallback
            failed_hosts = set()
            def read_resource(r):
                host = urlparse(r["url"]).hostname
                if host in failed_hosts:
                    raise RuntimeError("Not attempted after repeated connection failures on the same source host; retained for a later refresh")
                print(f"Downloading {r['period']['label']}: {r['id']} ({r['format']})", flush=True)
                try:
                    path = fetch(r["url"], max_age_days=None if r.get("reuseDownload") else 0, retries=2, timeout=90)
                except Exception as error:
                    if any(term in str(error).lower() for term in ("503", "timeout", "connection")):
                        failed_hosts.add(host)
                    raise
                return path, meta_for(path)
            result = refresh(previous, OUTPUT, stage, read_catalogue, read_resource, checked_at, args.force)
            dump(stage / "metadata.json", result)
            validate_directory(stage)
            if OUTPUT.exists():
                from refresh import exchange
                exchange(stage, OUTPUT)
            else:
                stage.rename(OUTPUT)
            print(f"LMIA {result['status']}: {result['coverage']['rowCount']:,} rows, {len(result['periods'])} periods, "
                  f"{result['coverage']['start']} to {result['coverage']['end']}")
            for error in result.get("errors", []):
                print(f"{error['resourceId']}: {error['error']}")
            if result.get("error"):
                print(result["error"])
            return 0 if result["status"] == "ok" else 2
        finally:
            shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
