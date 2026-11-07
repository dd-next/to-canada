"""Independent full-row audit of the two retrieved official 2021 LMIA workbooks.

Run with the pipeline virtualenv after downloading the original resources.
This script does not import the LMIA parser and does not make network requests.
Missing raw source files fail explicitly; it never substitutes fixtures.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "public/data/lmia"


def text(value):
    return re.sub(r"\s+", " ", str(value)).strip() if value is not None else None


def main():
    metadata = json.loads((DATA / "metadata.json").read_text())
    sources = {r["id"]: r for r in metadata["resources"]}
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "method": "Independent openpyxl read; every source row compared without importing pipeline parser", "periods": []}
    for quarter in (2, 3):
        pid = f"2021-Q{quarter}"
        paths = list((ROOT / "data/raw/www.esdc.gc.ca").glob(f"*2021Q{quarter}*xlsx"))
        assert len(paths) == 1, f"Raw official workbook missing or ambiguous for {pid}"
        path = paths[0]
        raw_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        period = next(p for p in metadata["periods"] if p["id"] == pid)
        source = sources[period["resourceId"]]
        assert source["sha256"] == raw_hash
        partition = json.loads((DATA / "periods" / f"{pid}.json").read_text())
        workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
        try:
            sheet = workbook["Positive_EN"]
            physical = list(sheet.values)
            assert "(NOC) 2011" in physical[0][0]
            assert [text(v) for v in physical[1]] == ["Province/Territory", "Program Stream", "Employer", "Address", "Occupation", "Approved Positions"]
            notes_start = next(i for i, r in enumerate(physical) if str(r[0]).strip() == "Notes:")
            original_rows = physical[2:notes_start]
            assert len(original_rows) == len(partition["rows"]) == period["rowCount"]
            position_total = 0
            province_counts, stream_counts = Counter(), Counter()
            sample = []
            for index, (original, delivered) in enumerate(zip(original_rows, partition["rows"])):
                province, stream, employer, address, occupation, positions = original
                code, title = text(occupation).split("-", 1)
                assert delivered[1] == text(employer), (pid, index + 3, "employer")
                assert delivered[2] == text(address), (pid, index + 3, "address")
                assert delivered[4] == text(province), (pid, index + 3, "province label")
                assert delivered[5] == text(stream), (pid, index + 3, "stream")
                assert delivered[6:9] == [code, title.strip(), "2011"], (pid, index + 3, "occupation / NOC")
                assert delivered[9] is None, (pid, index + 3, "LMIA count not supplied")
                assert isinstance(positions, int) and delivered[10] == positions, (pid, index + 3, "approved positions")
                position_total += positions
                province_counts[text(province)] += 1
                stream_counts[text(stream)] += 1
                if index in (0, len(original_rows) // 2, len(original_rows) - 1):
                    sample.append({"sourceLine": index + 3, "employer": delivered[1], "address": delivered[2], "occupationCode": delivered[6], "nocVersion": delivered[8], "approvedPositions": delivered[10]})
            assert position_total == sum(row[10] for row in partition["rows"])
            assert sum(row[3] == "HO" for row in partition["rows"]) == province_counts["Employers carrying on business in Canada with Head Office outside of Canada"]
            report["periods"].append({"period": pid, "sourceUrl": source["url"], "sha256": raw_hash, "checkedRows": len(original_rows), "approvedPositions": position_total,
                                      "approvedLmias": None, "approvedLmiasReason": "Publisher file has no approved-LMIA-count column", "nocVersion": "2011",
                                      "byProvinceRows": dict(province_counts), "byStreamRows": dict(stream_counts), "samples": sample})
        finally:
            workbook.close()
    report["checkedRows"] = sum(p["checkedRows"] for p in report["periods"])
    report["approvedPositions"] = sum(p["approvedPositions"] for p in report["periods"])
    report["result"] = "passed"
    destination = Path(__file__).with_suffix(".json")
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"Independent LMIA source audit passed: {report['checkedRows']:,} rows and {report['approvedPositions']:,} approved positions across two non-overlapping periods.")


if __name__ == "__main__":
    main()
