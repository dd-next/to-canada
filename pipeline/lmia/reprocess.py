"""Audit narrow corrections to previously validated LMIA tuples, without network I/O.

This maintenance command does not re-fetch sources or replay the full raw parser.
It leaves transformVersion at 1 so an ordinary refresh still attempts parser 2.
Use --check to validate and report the proposed changes without publication.
"""
from __future__ import annotations

import argparse
import copy
import fcntl
import hashlib
import json
import re
import shutil
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lmia.check import validate_directory
from lmia.ingest import PROVINCES, digest, validate_partition

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_ID = "published-tuples-geography-noc-width"
MIGRATION_VERSION = 1
ALIASES = {
    "Territoires-du-Nord-Ouest": "NT",
    "À l'extérieur du Canada": "HO",
    "Les employeurs exerçant leurs activités au Canada avec un siège social à l'extérieur du Canada": "HO",
}
IDENTITY_FIELDS = (1, 2, 4, 5, 6, 7, 8, 12)
IMMUTABLE_FIELDS = (1, 2, 4, 5, 9, 10, 11, 12)
SOURCE_FIELDS = ("id", "url", "sha256", "revision", "retrievedAt", "lastSuccessfulCheckAt", "lastAttemptAt",
                 "publisherModifiedAt", "publisherCreatedAt", "status", "transformVersion", "auditPath")


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def local_path(directory, published_path):
    if not isinstance(published_path, str) or not published_path.startswith("lmia/"):
        raise ValueError("Invalid local LMIA maintenance path")
    relative = Path(published_path.removeprefix("lmia/"))
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Unsafe local LMIA maintenance path")
    path = directory / relative
    if not path.resolve().is_relative_to(directory.resolve()):
        raise ValueError("LMIA maintenance path escapes its snapshot")
    return path


def replay_partition(partition, resource, source_audit):
    """Prove the parser-1 preimage, then change only the two specified mappings."""
    if type(resource.get("transformVersion")) is not int or resource["transformVersion"] != 1:
        raise ValueError("Tuple maintenance requires known parser transformVersion 1")
    if not isinstance(source_audit, dict):
        raise ValueError("Invalid source audit for LMIA tuple maintenance")
    validate_partition(partition)
    before_seen, after_seen = Counter(), Counter()
    rows, province_samples, occupation_samples, id_samples = [], [], [], []
    province_count = occupation_count = id_count = changed_rows = 0
    for index, original in enumerate(partition["rows"]):
        preimage = digest([original[i] for i in IDENTITY_FIELDS])[:20]
        occurrence = before_seen[preimage]
        before_seen[preimage] += 1
        if original[0] != f"{resource['id']}:{preimage}:{occurrence}":
            raise ValueError(f"LMIA row-ID preimage mismatch at published row index {index}")
        location = "loc-" + digest([original[1], original[2], original[4]])[:20]
        if original[11] != location:
            raise ValueError(f"LMIA location-ID preimage mismatch at published row index {index}")
        row = list(original)
        province_changed = row[3] is None and row[4] in ALIASES
        if province_changed:
            row[3] = ALIASES[row[4]]
            province_count += 1
        occupation_changed = False
        if partition["periodId"] == "2016" and source_audit.get("declaredNocVersion") == "2011" and row[6] is None and row[8] is None and isinstance(row[7], str):
            match = re.fullmatch(r"(\d{1,3})\s*[-–—]\s*(.*)", row[7])
            if match:
                row[6], row[7], row[8] = match[1].zfill(4), match[2] or None, "2011"
                occupation_changed = True
                occupation_count += 1
        after = digest([row[i] for i in IDENTITY_FIELDS])[:20]
        row[0] = f"{resource['id']}:{after}:{after_seen[after]}"
        after_seen[after] += 1
        if any(row[i] != original[i] for i in IMMUTABLE_FIELDS):
            raise ValueError("LMIA tuple maintenance altered immutable source fields")
        changed_rows += row != original
        sample = {"publishedRowIndex": index, "oldRecordId": original[0], "newRecordId": row[0]}
        if province_changed and len(province_samples) < 20:
            province_samples.append({**sample, "sourceProvinceLabel": original[4], "oldProvinceCode": None, "newProvinceCode": row[3]})
        if occupation_changed and len(occupation_samples) < 20:
            occupation_samples.append({**sample, "retainedOccupation": original[7], "oldOccupationCode": None,
                                       "newOccupationCode": row[6], "newOccupationTitle": row[7], "declaredNocVersion": "2011"})
        if row[0] != original[0]:
            id_count += 1
            if len(id_samples) < 20:
                id_samples.append(sample)
        rows.append(row)
    updated = {**partition, "rows": rows}
    validate_partition(updated)
    return updated, {"rowCount": len(rows), "changedRows": changed_rows,
                     "provinceCodeCorrections": province_count, "occupationCodeCorrections": occupation_count,
                     "recordIdsChanged": id_count, "provinceSamples": province_samples,
                     "occupationSamples": occupation_samples, "recordIdSamples": id_samples,
                     "duplicateObservationsBefore": sum(count - 1 for count in before_seen.values()),
                     "duplicateObservationsAfter": sum(count - 1 for count in after_seen.values())}


def reprocess(directory, lock_path, *, applied_at=None, check_only=False, validate_snapshot=validate_directory):
    """Lock before reading, stage every change, validate, then exchange atomically."""
    directory, lock_path = Path(directory), Path(lock_path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = validate_snapshot(directory)
        resources = {resource["id"]: resource for resource in previous["resources"]}
        metadata = copy.deepcopy(previous)
        partitions, audits, all_rows = {}, [], []
        totals = Counter()
        for period in previous["periods"]:
            resource = resources[period["resourceId"]]
            path = local_path(directory, period["indexPath"])
            raw = path.read_bytes()
            partition = json.loads(raw)
            version = resource.get("transformVersion")
            if type(version) is int and version == 2:
                all_rows.extend(partition["rows"])
                continue
            if type(version) is not int or version != 1:
                raise ValueError(f"Unsupported LMIA transformVersion for tuple maintenance: {version}")
            audit_path = local_path(directory, resource.get("auditPath"))
            source_audit_raw = audit_path.read_bytes()
            updated, report = replay_partition(partition, resource, json.loads(source_audit_raw))
            all_rows.extend(updated["rows"])
            updated_raw = encoded(updated) if report["changedRows"] else raw
            audits.append({"periodId": period["id"], "resourceId": resource["id"],
                           "inputPartitionSha256": sha(raw), "outputPartitionSha256": sha(updated_raw),
                           "source": {key: resource[key] for key in SOURCE_FIELDS if key in resource},
                           "sourceAuditSha256": sha(source_audit_raw), "corrections": report})
            totals.update({key: report[key] for key in ("rowCount", "changedRows", "provinceCodeCorrections", "occupationCodeCorrections", "recordIdsChanged")})
            if updated_raw != raw:
                partitions[period["indexPath"]] = updated_raw
                next(p for p in metadata["periods"] if p["id"] == period["id"])["indexBytes"] = len(updated_raw)
        result = {"changed": bool(partitions), "dryRun": check_only, "changedPeriods": len(partitions), **dict(totals)}
        if not partitions:
            return result
        applied_at = applied_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        applied = datetime.fromisoformat(applied_at.replace("Z", "+00:00"))
        if applied.utcoffset() is None:
            raise ValueError("LMIA tuple maintenance requires an explicit processing timezone")
        report = {"schemaVersion": 1, "migrationId": MIGRATION_ID, "migrationVersion": MIGRATION_VERSION,
                  "appliedAt": applied_at, "publishedRowIndexBase": 0,
                  "method": "Narrow normalization of already validated published tuples; no source re-fetch or full raw-parser replay.",
                  "rules": {"sourceTransformVersion": 1, "exactNullProvinceAliases": ALIASES,
                            "occupation": {"periodId": "2016", "requiredSourceAuditNocVersion": "2011",
                                           "requiredOldCode": None, "requiredOldNocVersion": None,
                                           "retainedTitlePattern": r"^(\d{1,3})\s*[-–—]\s*(.*)$", "targetWidth": 4}},
                  "summary": result, "periods": audits}
        report_key = digest({"migrationId": MIGRATION_ID, "migrationVersion": MIGRATION_VERSION,
                             "appliedAt": applied_at,
                             "inputs": {audit["periodId"]: audit["inputPartitionSha256"] for audit in audits}})[:20]
        report_path = f"lmia/normalization-audits/{MIGRATION_ID}-v{MIGRATION_VERSION}-{report_key}.json"
        report_raw = encoded(report)
        metadata.setdefault("normalizationMigrations", []).append({"id": MIGRATION_ID, "version": MIGRATION_VERSION,
                    "appliedAt": applied_at, "auditPath": report_path, "auditSha256": sha(report_raw),
                    "changedRows": totals["changedRows"]})
        metadata["generatedAt"] = metadata["lastSuccessfulUpdateAt"] = applied_at
        metadata["facets"]["provinces"] = [{"code": code, "label": PROVINCES[code][0]} for code in sorted({row[3] for row in all_rows if row[3]})]
        metadata["facets"]["nocVersions"] = sorted({row[8] for row in all_rows if row[8]})
        stage = Path(tempfile.mkdtemp(prefix=".lmia-normalize-", dir=directory.parent))
        try:
            shutil.copytree(directory, stage, dirs_exist_ok=True)
            for published_path, raw in partitions.items():
                local_path(stage, published_path).write_bytes(raw)
            staged_report = local_path(stage, report_path)
            staged_report.parent.mkdir(parents=True, exist_ok=True)
            staged_report.write_bytes(report_raw)
            (stage / "metadata.json").write_bytes(encoded(metadata))
            validate_snapshot(stage)
            if not check_only:
                from refresh import exchange
                exchange(stage, directory)
            return {**result, "auditPath": report_path, "appliedAt": applied_at}
        finally:
            shutil.rmtree(stage, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate and report proposed corrections without publication")
    args = parser.parse_args()
    report = reprocess(ROOT / "public/data/lmia", ROOT / "data/raw/.publication.lock", check_only=args.check)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
