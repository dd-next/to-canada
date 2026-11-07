"""Offline LMIA ingestion regressions. No production snapshot is replaced."""
from __future__ import annotations

import copy
import csv
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lmia.check import validate_directory
from lmia.ingest import (COLUMNS, DATASET_ID, parse_file, parse_table, period_from_name,
                         resource_descriptor, select_resources, validate_partition)
from lmia.run import dump, empty_metadata, refresh

FIXTURES = Path(__file__).parent / "fixtures"
HEADER = ["Province/Territory", "Program Stream", "Employer", "Address", "Occupation", "Incorporate Status", "Approved LMIAs", "Approved Positions"]
TABLE = [HEADER,
         ["Ontario", "High Wage", "Fixture Engineering Ltd", "10 Example Street, Ottawa, ON K1A 0A1", "21231-Software engineers and designers", "Corporation", "2", "3"],
         ["Quebec", "Low Wage", "Entreprise Démonstration", "Montréal, QC", "63200-Cooks", "Corporation", "..", "x"],
         ["Outside Canada", "High Wage", "Fixture Marine", "Hamburg", "72602-Deck officers, water transport", "Corporation", "", "1"],
         ["Notes:"], ["1. Fixture only; not a real published employer list."]]
STAMP = "2026-11-07T18:00:00+00:00"


def raw_resource(rid="r-2026q2", name="2026Q2-Positive LMIA employers NOC 2021", **kw):
    return {"id": rid, "name": name, "format": "csv", "language": ["en"], "url": f"https://example.invalid/{rid}.csv", **kw}


def package(*resources):
    return {"id": DATASET_ID, "resources": list(resources)}


def write_csv(directory, rows=TABLE, name="data.csv", encoding="utf-8-sig"):
    path = directory / name
    with path.open("w", newline="", encoding=encoding) as file:
        csv.writer(file).writerows(rows)
    return path


class PeriodAndSelection(unittest.TestCase):
    def test_reporting_periods(self):
        self.assertEqual(period_from_name("2014-Employers between June 20 and December 31, 2014")["start"], "2014-06-20")
        self.assertEqual(period_from_name("2017Q1Q2-Employers")["end"], "2017-06-30")
        self.assertEqual(period_from_name("2016-Employers")["kind"], "annual")
        self.assertIsNone(period_from_name("2017Q3Q1-Employers"))
        self.assertIsNone(period_from_name("2014-Employers between February 30 and December 31, 2014"))

    def test_bilingual_format_revision_deduplication(self):
        base = raw_resource()
        french = raw_resource("fr", language=["fr"], last_modified="2026-11-05")
        xlsx = raw_resource("xlsx", format="xlsx")
        revised = raw_resource("revised", last_modified="2026-11-06")
        selected, excluded = select_resources(package(base, french, xlsx, revised))
        self.assertEqual([r["id"] for r in selected], ["revised"])
        self.assertEqual(len(excluded), 3)
        newer_french = {**french, "last_modified": "2026-11-07"}
        selected, _ = select_resources(package(base, revised, newer_french))
        self.assertEqual([r["id"] for r in selected], ["fr"])

    def test_overlap_maximises_complete_coverage(self):
        annual = raw_resource("annual", "2025-Employers")
        quarters = [raw_resource(f"q{q}", f"2025Q{q}-Employers") for q in range(1, 5)]
        selected, _ = select_resources(package(annual, quarters[0]))
        self.assertEqual([r["id"] for r in selected], ["annual"])
        selected, excluded = select_resources(package(annual, *quarters))
        self.assertEqual([r["id"] for r in selected], ["q1", "q2", "q3", "q4"])
        self.assertIn("Overlapping", excluded[0]["reason"])

    def test_unknown_layout_and_period_are_not_guessed(self):
        with self.assertRaises(ValueError): select_resources(package())
        with self.assertRaises(ValueError): select_resources(package(raw_resource(name="An unknown new report")))


class FormatsAndRows(unittest.TestCase):
    def test_modern_missing_counts_preserve_unknowns(self):
        resource = resource_descriptor(raw_resource())
        rows, audit = parse_table(TABLE, resource)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1][9:11], [None, None])
        self.assertEqual(rows[2][3], "HO")
        self.assertEqual(rows[0][8], "2021")
        self.assertEqual(audit["ignoredRows"]["notes"], 2)

    def test_parenthesised_official_noc_heading(self):
        table = [["National Occupational Classification (NOC) 2011 and Business Location"],
                 ["Province/Territory", "Employer", "Address", "Occupation", "Approved Positions"],
                 ["Ontario", "Fixture", "Ottawa", "2171-Information systems analysts", "2"]]
        rows, audit = parse_table(table, resource_descriptor(raw_resource("old", "2021Q2-Employers")))
        self.assertEqual(rows[0][8], "2011")
        self.assertEqual(audit["declaredNocVersion"], "2011")

    def test_separate_occupation_columns_preserve_code_and_title(self):
        table = [["Employer", "Address", "NOC 2011 Code", "Occupation Title", "Approved Positions"],
                 ["Fixture", "Ottawa", 213, "Computer and information systems managers", 2]]
        rows, _ = parse_table(table, resource_descriptor(raw_resource("old", "2021Q2-Employers")))
        self.assertEqual(rows[0][6:9], ["0213", "Computer and information systems managers", "2011"])

    def test_sectioned_annual_and_totals(self):
        resource = resource_descriptor(raw_resource("2015", "2015-Positive employers"))
        table = [["Positive employer release"], ["Alberta"], ["Employer", "Address", "Positions approved"],
                 ["Fixture Builders", "Edmonton, AB", 4], ["Ontario"], ["Employer", "Address", "Positions approved"],
                 ["Fixture Garden", "Ottawa, ON", 8], ["Other employers", "", 12], ["Total", "", 24], ["Notes:"], ["1. Notes"]]
        rows, audit = parse_table(table, resource)
        self.assertEqual([row[3] for row in rows], ["AB", "ON"])
        self.assertEqual([row[9] for row in rows], [None, None])
        self.assertEqual(len(audit["aggregates"]), 2)

    def test_grouped_cells_do_not_mix_locations_or_noc(self):
        table = [["Province/Territory", "Stream", "Employer", "Address", "Occupations under NOC 2011", "Approved Positions"],
                 ["Ontario", "High Wage", "Fixture Services", "Ottawa, ON", "0213-Computer and information systems managers", "2"],
                 ["", "", "", "", "2171-Information systems analysts and consultants", "4"],
                 ["", "", "", "Toronto, ON", "2171-Information systems analysts and consultants", "1"]]
        rows, _ = parse_table(table, resource_descriptor(raw_resource("old", "2017Q1Q2-Employers NOC 2011")))
        self.assertEqual([r[1] for r in rows], ["Fixture Services"] * 3)
        self.assertEqual(rows[0][11], rows[1][11])
        self.assertNotEqual(rows[1][11], rows[2][11])
        self.assertEqual({row[8] for row in rows}, {"2011"})
        self.assertEqual(rows[0][6], "0213")

    def test_no_false_approved_counts_or_employer_merges(self):
        table = [["Province", "Employer", "Address", "Requested LMIAs", "Requested Positions"],
                 ["Ontario", "Fixture Co. Ltd", "Ottawa", "2", "4"],
                 ["Ontario", "Fixture Company Ltd", "Ottawa", "1", "2"]]
        rows, audit = parse_table(table, resource_descriptor(raw_resource()))
        self.assertEqual(rows[0][9:11], [None, None])
        self.assertEqual(audit["publisherRequestedCounts"][0]["requestedPositions"], 4)
        self.assertNotEqual(rows[0][11], rows[1][11])

    def test_schema_anomaly_fails_complete_resource(self):
        table = copy.deepcopy(TABLE[:2])
        table.append(["Alberta", "Low Wage", "", "Calgary", "63200-Cooks", "Corporation", "1", "2"])
        with self.assertRaisesRegex(ValueError, "Missing employer"):
            parse_table(table, resource_descriptor(raw_resource()))

    def test_csv_cp1252_xlsx_and_xls(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            csv_path = write_csv(directory, encoding="cp1252")
            rowset, _ = parse_file(csv_path, resource_descriptor(raw_resource()))
            self.assertEqual(rowset["rows"][1][1], "Entreprise Démonstration")
            import openpyxl
            wb = openpyxl.Workbook()
            for row in TABLE: wb.active.append(row)
            path = directory / "fixture.xlsx"
            wb.save(path)
            xlsx, _ = parse_file(path, resource_descriptor(raw_resource()))
            self.assertEqual(xlsx["rows"], rowset["rows"])
            xls, _ = parse_file(FIXTURES / "sectioned-2015.xls", resource_descriptor(raw_resource("legacy", "2015-Employers")))
            self.assertEqual(len(xls["rows"]), 2)
            self.assertEqual(xls["rows"][0][3], "AB")


class RefreshPreservation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.previous_dir, self.stage = self.root / "previous", self.root / "stage"
        self.previous_dir.mkdir(); self.stage.mkdir()
        self.path = write_csv(self.root)
        self.pkg = package(raw_resource())
        self.calls = 0

    def tearDown(self): self.temp.cleanup()

    def read(self, resource):
        self.calls += 1
        return self.path, {"sha256": hashlib.sha256(self.path.read_bytes()).hexdigest(), "retrievedAt": STAMP}

    def initial(self):
        value = refresh(empty_metadata(), self.previous_dir, self.stage, lambda: self.pkg, self.read, STAMP)
        dump(self.stage / "metadata.json", value)
        validate_directory(self.stage)
        shutil.copytree(self.stage, self.previous_dir, dirs_exist_ok=True)
        return value

    def test_initial_and_same_input_no_content_update(self):
        previous = self.initial()
        result = refresh(previous, self.previous_dir, self.stage, lambda: self.pkg, self.read, "2026-11-08T18:00:00+00:00")
        self.assertEqual(self.calls, 1)
        self.assertEqual(result["lastSuccessfulUpdateAt"], previous["lastSuccessfulUpdateAt"])
        self.assertNotEqual(result["lastSuccessfulCheckAt"], previous["lastSuccessfulCheckAt"])

    def test_failed_empty_and_incomplete_catalogue_retain_all_rows(self):
        previous = self.initial()
        for load in (lambda: (_ for _ in ()).throw(OSError("network down")), lambda: package(), lambda: package(raw_resource("other", "2026Q3-Employers"))):
            result = refresh(previous, self.previous_dir, self.stage, load, self.read, "2026-11-08T18:00:00+00:00")
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["periods"], previous["periods"])
            self.assertEqual(result["lastSuccessfulCheckAt"], previous["lastSuccessfulCheckAt"])

    def test_revised_resource_failure_retains_old_and_adds_other_period(self):
        previous = self.initial()
        revised = raw_resource(last_modified="2026-11-08")
        newer = raw_resource("q3", "2026Q3-Employers NOC 2021")
        def read(r):
            if r["id"] == revised["id"]: raise OSError("download failed")
            return self.read(r)
        result = refresh(previous, self.previous_dir, self.stage, lambda: package(revised, newer), read, "2026-11-08T18:00:00+00:00")
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["coverage"]["rowCount"], 6)
        self.assertEqual(result["periods"][0]["status"], "retained")
        self.assertEqual(result["lastSuccessfulCheckAt"], previous["lastSuccessfulCheckAt"])
        dump(self.stage / "metadata.json", result)
        validate_directory(self.stage)

    def test_revised_bytes_content_update_and_suspicious_truncation(self):
        previous = self.initial()
        changed = copy.deepcopy(TABLE)
        changed[1][-1] = "9"
        write_csv(self.root, changed)
        revised = raw_resource(last_modified="2026-11-08")
        result = refresh(previous, self.previous_dir, self.stage, lambda: package(revised), self.read, "2026-11-08T18:00:00+00:00")
        self.assertEqual(result["status"], "ok")
        self.assertNotEqual(result["lastSuccessfulUpdateAt"], previous["lastSuccessfulUpdateAt"])
        write_csv(self.root, TABLE[:2])
        truncated = refresh(previous, self.previous_dir, self.stage, lambda: package(revised), self.read, "2026-11-09T18:00:00+00:00", force=True)
        self.assertEqual(truncated["status"], "partial")
        self.assertEqual(truncated["coverage"]["rowCount"], 3)

    def test_duplicate_rows_preserved_and_invalid_totals_rejected(self):
        resource = resource_descriptor(raw_resource())
        rows, _ = parse_table([HEADER, TABLE[1], TABLE[1]], resource)
        self.assertNotEqual(rows[0][0], rows[1][0])
        value = {"schemaVersion": 1, "resourceId": resource["id"], "periodId": "2026-Q2", "columns": COLUMNS, "rows": rows}
        self.assertEqual(validate_partition(value), 2)
        rows[0][10] = -1
        with self.assertRaises(ValueError): validate_partition(value)

    def test_secondary_discovery_never_claims_successful_catalogue_check(self):
        discovery = {**self.pkg, "_discoverySource": "https://example.invalid/urls.csv", "_catalogueError": "Official catalogue timeout"}
        value = refresh(empty_metadata(), self.previous_dir, self.stage, lambda: discovery, self.read, STAMP)
        self.assertEqual(value["status"], "partial")
        self.assertIsNone(value["lastSuccessfulCheckAt"])
        self.assertEqual(value["catalogue"]["status"], "unavailable")
        self.assertEqual(value["coverage"]["rowCount"], 3)


if __name__ == "__main__": unittest.main()
