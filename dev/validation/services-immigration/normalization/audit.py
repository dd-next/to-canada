"""Independent before/after field audit; pass two published lmia directory paths."""
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

before, after = map(Path, sys.argv[1:3])
old = json.loads((before / "metadata.json").read_text())
new = json.loads((after / "metadata.json").read_text())
assert old["resources"] == new["resources"], "Source identity/provenance/status must stay unchanged"
for key in ("coverage", "catalogue", "lastAttemptAt", "lastSuccessfulCheckAt", "errors", "status", "runUrl"):
    assert old.get(key) == new.get(key), key
assert old["lastSuccessfulUpdateAt"] != new["lastSuccessfulUpdateAt"]
assert old["generatedAt"] != new["generatedAt"]
assert [(p["id"], p["rowCount"], p["resourceId"]) for p in old["periods"]] == [
    (p["id"], p["rowCount"], p["resourceId"]) for p in new["periods"]]
changes, duplicate_before, duplicate_after = Counter(), 0, 0
totals_before, totals_after = Counter(), Counter()
aliases = {
    "Territoires-du-Nord-Ouest": "NT",
    "À l'extérieur du Canada": "HO",
    "Les employeurs exerçant leurs activités au Canada avec un siège social à l'extérieur du Canada": "HO",
}
for period in old["periods"]:
    relative = period["indexPath"].removeprefix("lmia/")
    initial = json.loads((before / relative).read_text())
    final = json.loads((after / relative).read_text())
    assert initial["columns"] == final["columns"]
    assert len(initial["rows"]) == len(final["rows"])
    assert len({row[0] for row in final["rows"]}) == len(final["rows"])
    identities = lambda rows: Counter(tuple(row[i] for i in (1, 2, 4, 5, 6, 7, 8, 12)) for row in rows)
    duplicate_before += sum(count - 1 for count in identities(initial["rows"]).values())
    duplicate_after += sum(count - 1 for count in identities(final["rows"]).values())
    for first, second in zip(initial["rows"], final["rows"]):
        for index, (a, b) in enumerate(zip(first, second)):
            if a != b:
                assert index in (0, 3, 6, 7, 8), (period["id"], index)
                changes[index] += 1
        if first[3] != second[3]:
            assert first[3] is None and second[3] == aliases[first[4]]
        if first[6:9] != second[6:9]:
            assert period["id"] == "2016" and first[6] is None and first[8] is None
            match = re.fullmatch(r"(\d{1,3})\s*[-–—]\s*(.*)", first[7])
            assert match and second[6:9] == [match[1].zfill(4), match[2] or None, "2011"]
            assert first[0] != second[0]
        for row, totals in ((first, totals_before), (second, totals_after)):
            totals["records"] += 1
            for column, label in ((9, "approvedLmias"), (10, "approvedPositions")):
                totals[label + ("Unknown" if row[column] is None else "Known")] += 1 if row[column] is None else row[column]
for source in (before / "audits").glob("*.json"):
    assert source.read_bytes() == (after / "audits" / source.name).read_bytes()
assert (before / "catalogue.json").read_bytes() == (after / "catalogue.json").read_bytes()
assert changes == Counter({0: 1572, 3: 4820, 6: 1572, 7: 1572, 8: 1572})
assert totals_before == totals_after
assert duplicate_before == duplicate_after == 16
report = {
    "status": "passed", "checkedAt": datetime.now(timezone.utc).isoformat(),
    "baselineCommit": "45895e2", "sourceRefetch": False,
    "totalsPreserved": dict(totals_after), "changedFieldCounts": dict(changes),
    "duplicateObservationsBefore": duplicate_before, "duplicateObservationsAfter": duplicate_after,
    "sourceMetadataUnchanged": True, "sourceAuditsUnchanged": True,
    "catalogueCacheUnchanged": True, "sourceCheckAndAttemptClocksUnchanged": True,
    "migration": new["normalizationMigrations"][-1],
    "metadataSha256": hashlib.sha256((after / "metadata.json").read_bytes()).hexdigest(),
}
print(json.dumps(report, indent=2, ensure_ascii=False))
