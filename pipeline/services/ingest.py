"""Lossless Awesome Canada snapshot reconciliation, independent of I/O.

Destination reachability is deliberately not used as an inclusion criterion.
Source classification is preserved; editorial coverage is labelled separately.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date
from urllib.parse import urlsplit

REPOSITORY = "https://github.com/wra-sol/awesome-canada"
SITE = "https://awesome-canada.ca/"
ATTRIBUTION = "Catalogue adapted from Awesome Canada by wra-sol and contributors."
COPYRIGHT = "Copyright (c) 2026 Awesome Canada"
KNOWN_LEVELS = {"Federal", "Provincial", "Territorial", "Regional", "Municipal", "Agency", "Crown Corp"}
TERRITORIES = {"Yukon", "Northwest Territories", "Nunavut"}
REQUIRED = ("name", "description", "url", "category", "level", "jurisdiction", "type")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def safe_url(value):
    if not isinstance(value, str) or any(ord(c) < 32 for c in value):
        return False
    try:
        parsed = urlsplit(value)
        return parsed.scheme in {"http", "https"} and bool(parsed.hostname) and not parsed.username and not parsed.password
    except ValueError:
        return False


def coverage(row):
    level, jurisdiction = row["level"], row["jurisdiction"]
    if level == "Federal" and jurisdiction == "Canada":
        kind = "national"
    elif level in {"Provincial", "Territorial"}:
        kind = "provincial_territorial"
    elif level == "Municipal":
        kind = "municipal"
    elif level == "Regional":
        kind = "regional"
    elif level in {"Agency", "Crown Corp"}:
        kind = "agency"
    else:
        kind = "unmapped"
    return {"kind": kind, "label": f"{jurisdiction} · {level} (source classification)",
            "sourceLevel": level, "sourceJurisdiction": jurisdiction}


def validate_input(payload):
    if not isinstance(payload, list):
        raise ValueError("Catalogue must be a JSON array; possible upstream schema change")
    if not payload:
        raise ValueError("Empty catalogue rejected; the previous snapshot is retained")
    valid, quarantined = [], []
    for index, row in enumerate(payload):
        reasons = []
        if not isinstance(row, dict):
            reasons.append("Record is not an object")
        else:
            for key in REQUIRED:
                if not isinstance(row.get(key), str) or not row[key].strip():
                    reasons.append(f"{key} must be a non-empty string")
            if not safe_url(row.get("url")):
                reasons.append("url must be an HTTP(S) address without credentials or control characters")
            if not isinstance(row.get("tags"), list) or any(not isinstance(t, str) for t in row.get("tags", [])):
                reasons.append("tags must be an array of strings")
            if row.get("dateAdded") is not None:
                try:
                    if not isinstance(row["dateAdded"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["dateAdded"]):
                        raise ValueError()
                    date.fromisoformat(row["dateAdded"])
                except (ValueError, TypeError):
                    reasons.append("dateAdded must be an ISO calendar date when supplied")
        if reasons:
            quarantined.append({"recordIndex": index, "reasons": reasons, "sourceRecord": row})
        else:
            valid.append((index, copy.deepcopy(row)))
    return valid, quarantined


def identity(row):
    return (row["url"], row["level"], row["jurisdiction"], row["name"], row["type"])


def match_records(rows, previous):
    """Match exact content first, then progressively unambiguous source identities.

    Same-URL services with distinct geographic coverage stay distinct. Ambiguous
    duplicates are never collapsed; unmatched entries receive separate IDs.
    """
    remaining_new = set(range(len(rows)))
    remaining_old = set(range(len(previous)))
    matched = {}
    for phase, key in enumerate((lambda r: canonical(r), identity,
                lambda r: (r["url"], r["level"], r["jurisdiction"]), lambda r: (r["url"],))):
        new_groups, old_groups = defaultdict(list), defaultdict(list)
        for i in sorted(remaining_new):
            new_groups[key(rows[i][1])].append(i)
        for i in sorted(remaining_old):
            old_groups[key(previous[i]["sourceRecord"])].append(i)
        for value, new_ids in new_groups.items():
            old_ids = old_groups.get(value, [])
            # Exact duplicates have no distinct information to pair. Reuse the
            # surviving occurrences even when their multiplicity changes.
            if phase == 0 or len(new_ids) == len(old_ids) == 1:
                for ni, oi in zip(new_ids, sorted(old_ids, key=lambda i: previous[i]["id"])):
                    matched[ni] = previous[oi]
                    remaining_new.remove(ni)
                    remaining_old.remove(oi)
    return matched


def blank_catalogue():
    return {"schemaVersion": 1, "meta": {
        "source": {"id": "awesome-canada", "name": "Awesome Canada", "repositoryUrl": REPOSITORY,
                   "siteUrl": SITE, "catalogueUrl": f"{REPOSITORY}/blob/main/data/resources.json",
                   "commit": None, "contentHash": None},
        "attribution": ATTRIBUTION,
        "license": {"name": "MIT", "copyright": COPYRIGHT, "url": f"{REPOSITORY}/blob/main/LICENSE", "localPath": "services/LICENSE.txt"},
        "firstImportedAt": None, "lastAttemptedAt": None, "lastSuccessfulCheckAt": None,
        "lastSuccessfulContentUpdateAt": None, "status": "failed", "error": None,
        "counts": {"input": 0, "current": 0, "retired": 0, "quarantined": 0, "categories": 0, "jurisdictions": 0},
        "categories": [], "jurisdictions": [], "levels": [], "coverageKinds": [], "warnings": [],
    }, "entries": []}


def blank_history():
    return {"schemaVersion": 1, "events": [], "runs": []}


def record_run(history, *, at, status, source_commit, counts, error=None, run_url=None):
    row = {"id": "check-" + digest([at, source_commit, status, error])[:20], "at": at,
           "status": status, "sourceCommit": source_commit, "counts": counts,
           "error": error, "runUrl": run_url}
    if not any(r["id"] == row["id"] for r in history["runs"]):
        history["runs"].append(row)


def failed_snapshot(previous, history, at, error, *, source_commit=None, quarantine=None,
                    attempt_counts=None, run_url=None):
    catalogue = copy.deepcopy(previous or blank_catalogue())
    history = copy.deepcopy(history or blank_history())
    catalogue["meta"].update(lastAttemptedAt=at, status="failed", error=str(error))
    catalogue["meta"]["lastAttemptCounts"] = attempt_counts
    record_run(history, at=at, status="failed", source_commit=source_commit,
               counts=attempt_counts or catalogue["meta"]["counts"], error=str(error), run_url=run_url)
    report = {"schemaVersion": 1, "attemptedAt": at, "sourceCommit": source_commit,
              "accepted": False, "error": str(error), "records": quarantine or []}
    return catalogue, history, report


def reconcile(payload, source, previous=None, history=None, *, at, run_url=None, allow_large_removals=False):
    """Return a complete snapshot/history/quarantine report, or a retained failure.

    Full source bytes are verified by the runner before calling this function.
    Any schema anomaly blocks recognition of removals. A >20% contraction or
    disappeared category additionally requires an explicit reviewed override.
    """
    previous = previous or blank_catalogue()
    history = history or blank_history()
    try:
        rows, quarantine = validate_input(payload)
    except (ValueError, TypeError) as error:
        return failed_snapshot(previous, history, at, error, source_commit=source.get("commit"), run_url=run_url)
    attempt_counts = {"input": len(payload), "valid": len(rows), "quarantined": len(quarantine)}
    if quarantine:
        return failed_snapshot(previous, history, at, f"{len(quarantine)} invalid records quarantined; entire prior catalogue retained pending schema review",
                               source_commit=source.get("commit"), quarantine=quarantine, attempt_counts=attempt_counts, run_url=run_url)
    active = [e for e in previous["entries"] if e["state"] == "current"]
    old_categories = {e["category"] for e in active}
    new_categories = {r["category"] for _, r in rows}
    anomalies = []
    if active and len(rows) < len(active) * .8:
        anomalies.append(f"Catalogue contracts from {len(active)} to {len(rows)} records (more than 20%)")
    if old_categories - new_categories:
        anomalies.append("Categories disappeared: " + ", ".join(sorted(old_categories - new_categories)))
    if anomalies and not allow_large_removals:
        return failed_snapshot(previous, history, at, "; ".join(anomalies) + ". Review upstream before --accept-large-removals.",
                               source_commit=source.get("commit"), attempt_counts=attempt_counts, run_url=run_url)
    matched = match_records(rows, previous["entries"])
    used_ids = {e["id"] for e in previous["entries"]}
    entries, changes, used_previous = [], [], set()
    for i, (index, row) in enumerate(rows):
        old = matched.get(i)
        content_hash = digest(row)
        if old:
            local_id = old["id"]
            used_previous.add(local_id)
        else:
            stem = "svc-" + digest([row["url"], row["level"], row["jurisdiction"]])[:20]
            local_id, suffix = stem, 2
            while local_id in used_ids:
                local_id = f"{stem}-{suffix}"
                suffix += 1
            used_ids.add(local_id)
        changed = not old or old["contentHash"] != content_hash
        entry = {key: copy.deepcopy(value) for key, value in row.items() if key in {*REQUIRED, "tags", "dateAdded", "kind"}}
        entry.update(id=local_id, sourceRecord=row,
                     source={"id": "awesome-canada", "url": source["catalogueUrl"], "commit": source["commit"], "recordIndex": index},
                     contentHash=content_hash, firstSeenAt=old["firstSeenAt"] if old else at,
                     contentChangedAt=at if changed else old["contentChangedAt"],
                     state="current", retiredAt=None, coverage=coverage(row))
        entries.append(entry)
        if not old or changed or old["state"] == "retired":
            change_type = "added" if not old else "restored" if old["state"] == "retired" else "edited"
            fields = sorted(k for k in set(row) | set(old["sourceRecord"] if old else {})
                            if not old or row.get(k) != old["sourceRecord"].get(k))
            change = {"id": local_id, "name": row["name"], "type": change_type, "fields": fields}
            if old and changed:
                change["before"] = {k: old["sourceRecord"].get(k) for k in fields}
                change["after"] = {k: row.get(k) for k in fields}
            changes.append(change)
    for old in previous["entries"]:
        if old["id"] in used_previous:
            continue
        retired = copy.deepcopy(old)
        if old["state"] == "current":
            retired.update(state="retired", retiredAt=at)
            changes.append({"id": old["id"], "name": old["name"], "type": "retired", "fields": ["state"]})
        entries.append(retired)
    entries.sort(key=lambda e: (e["name"].casefold(), e["id"]))
    catalogue = copy.deepcopy(previous)
    catalogue["entries"] = entries
    categories = sorted(new_categories)
    jurisdictions = sorted({row["jurisdiction"] for _, row in rows})
    levels = sorted({row["level"] for _, row in rows})
    warnings = ["Coverage labels are upstream classifications, not a verified statement of eligibility or availability."]
    unknown_levels = set(levels) - KNOWN_LEVELS
    if unknown_levels:
        warnings.append("Unmapped source levels retained: " + ", ".join(sorted(unknown_levels)))
    duplicates = sum(n - 1 for n in Counter(row["url"] for _, row in rows).values() if n > 1)
    if duplicates:
        warnings.append(f"{duplicates} repeated URL occurrences retained as separate source records; coverage is not merged.")
    warnings.extend(anomalies)
    disappeared_jurisdictions = {e["jurisdiction"] for e in active} - set(jurisdictions)
    if disappeared_jurisdictions:
        warnings.append("Jurisdictions absent from this complete upstream snapshot: " + ", ".join(sorted(disappeared_jurisdictions)))
    disappeared_levels = {e["level"] for e in active} - set(levels)
    if disappeared_levels:
        warnings.append("Source levels absent from this complete upstream snapshot: " + ", ".join(sorted(disappeared_levels)))
    counts = {"input": len(payload), "current": len(rows), "retired": sum(e["state"] == "retired" for e in entries),
              "quarantined": 0, "categories": len(categories), "jurisdictions": len(jurisdictions)}
    catalogue["meta"].update(source=copy.deepcopy(source), firstImportedAt=previous["meta"]["firstImportedAt"] or at,
                             lastAttemptedAt=at, lastSuccessfulCheckAt=at,
                             lastSuccessfulContentUpdateAt=at if changes else previous["meta"]["lastSuccessfulContentUpdateAt"],
                             status="updated" if changes else "no_changes", error=None, counts=counts, categories=categories,
                             jurisdictions=jurisdictions, levels=levels, coverageKinds=sorted({coverage(row)["kind"] for _, row in rows}),
                             warnings=warnings, lastAttemptCounts=attempt_counts)
    catalogue["meta"]["license"]["url"] = f"{REPOSITORY}/blob/{source['commit']}/LICENSE"
    history = copy.deepcopy(history)
    change_counts = {kind: sum(c["type"] == kind for c in changes) for kind in ("added", "edited", "retired", "restored")}
    if changes:
        event = {"id": "change-" + digest([at, source["commit"], changes])[:20],
                 "type": "initial_import" if not previous["meta"]["firstImportedAt"] else "changes", "at": at,
                 "sourceCommit": source["commit"], "counts": change_counts, "changes": changes, "runUrl": run_url}
        history["events"].append(event)
    record_run(history, at=at, status=catalogue["meta"]["status"], source_commit=source["commit"], counts=change_counts, run_url=run_url)
    report = {"schemaVersion": 1, "attemptedAt": at, "sourceCommit": source["commit"], "accepted": True, "error": None, "records": []}
    return catalogue, history, report


def validate_snapshot(catalogue, history):
    assert catalogue["schemaVersion"] == history["schemaVersion"] == 1
    meta, entries = catalogue["meta"], catalogue["entries"]
    assert len({e["id"] for e in entries}) == len(entries), "Duplicate service IDs"
    active = [e for e in entries if e["state"] == "current"]
    assert meta["counts"]["current"] == len(active)
    assert meta["counts"]["retired"] == len(entries) - len(active)
    assert meta["counts"]["input"] == len(active) + meta["counts"]["quarantined"]
    assert meta["categories"] == sorted({e["category"] for e in active})
    assert meta["jurisdictions"] == sorted({e["jurisdiction"] for e in active})
    assert meta["counts"]["categories"] == len(meta["categories"])
    assert meta["counts"]["jurisdictions"] == len(meta["jurisdictions"])
    assert sorted(e["source"]["recordIndex"] for e in active) == list(range(meta["counts"]["input"])), "Incomplete source-record accounting"
    assert meta["attribution"] == ATTRIBUTION and meta["license"]["copyright"] == COPYRIGHT
    for entry in entries:
        assert safe_url(entry["url"]), entry["id"]
        assert entry["contentHash"] == digest(entry["sourceRecord"]), entry["id"]
        assert entry["coverage"] == coverage(entry["sourceRecord"])
        assert entry["state"] in {"current", "retired"}
        assert entry["firstSeenAt"] <= entry["contentChangedAt"]
        assert entry["retiredAt"] is not None if entry["state"] == "retired" else entry["retiredAt"] is None
        if entry["state"] == "current":
            assert entry["source"]["commit"] == meta["source"]["commit"]
        for field in (*REQUIRED, "tags"):
            assert entry[field] == entry["sourceRecord"][field]
    ids = {e["id"] for e in entries}
    assert len({e["id"] for e in history["events"]}) == len(history["events"])
    assert len({r["id"] for r in history["runs"]}) == len(history["runs"])
    for event in history["events"]:
        assert event["changes"]
        assert all(c["id"] in ids for c in event["changes"])
        assert event["counts"] == {kind: sum(c["type"] == kind for c in event["changes"]) for kind in ("added", "edited", "retired", "restored")}
