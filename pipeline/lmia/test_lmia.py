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
from lmia.ingest import (CATALOGUE_URL, COLUMNS, DATASET_ID, UNDEFINED_CP1252_BYTES, catalogue_cache,
                         decode_csv, digest, parse_file, parse_table, period_from_name,
                         resource_descriptor, select_resources, validate_catalogue_cache, validate_partition)
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


def verified_download(pkg, checked_at=STAMP):
    raw = json.dumps({"success": True, "result": pkg}).encode()
    return pkg, {"url": CATALOGUE_URL, "method": "GET", "status": 200, "retrievedAt": checked_at,
                 "lastCheckedAt": checked_at, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}


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
    def test_french_publisher_geographies_keep_labels_and_separate_outside_canada(self):
        labels = ["Territoires-du-Nord-Ouest", "À l'extérieur du Canada",
                  "Les employeurs exerçant leurs activités au Canada avec un siège social à l'extérieur du Canada",
                  "Unmapped publisher geography"]
        table = [HEADER, *[[label, "Haut salaire", f"Publisher {i}", "Source address", "21231-Profession", "", "", 2]
                          for i, label in enumerate(labels)]]
        rows, _ = parse_table(table, resource_descriptor(raw_resource()))
        self.assertEqual([row[3] for row in rows], ["NT", "HO", "HO", None])
        self.assertEqual([row[4] for row in rows], labels)
        self.assertEqual(sum(row[10] for row in rows), 8)

    def test_modern_missing_counts_preserve_unknowns(self):
        resource = resource_descriptor(raw_resource())
        rows, audit = parse_table(TABLE, resource)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1][9:11], [None, None])
        self.assertEqual(rows[2][3], "HO")
        self.assertEqual(rows[0][8], "2021")
        self.assertEqual(audit["ignoredRows"]["notes"], 2)

    def test_french_remarques_footer_keeps_published_rows_and_notes(self):
        table = [["Province/Territoire", "Volet", "Employeur", "Adresse", "Profession", "Postes approuvés"],
                 ["Québec", "Haut salaire", "Entreprise Démonstration", "Montréal", "21231-Profession", 3],
                 ["Remarques:"],
                 ["1. Les postes approuvés ne sont pas des permis de travail."],
                 ["2. Les noms sont ceux publiés par l'éditeur."]]
        rows, audit = parse_table(table, resource_descriptor(raw_resource()))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1:4], ["Entreprise Démonstration", "Montréal", "QC"])
        self.assertEqual(rows[0][10], 3)
        self.assertEqual(audit["ignoredRows"]["notes"], 3)
        self.assertEqual(audit["notes"], [row[0] for row in table[2:]])
        # A genuine employer called Notes is not a footer when other fields exist.
        named_notes = [["Employer", "Address", "Approved Positions"], ["Notes", "Ottawa", 2]]
        self.assertEqual(parse_table(named_notes, resource_descriptor(raw_resource()))[0][0][1], "Notes")

    def test_undefined_legacy_bytes_are_lossless_and_audited(self):
        undefined = bytes(sorted(UNDEFINED_CP1252_BYTES))
        raw = b"Soci\xe9t\xe9\x92s " + undefined + b" / " + b"\x8d" * 25
        text, audit = decode_csv(raw)
        reconstructed = b"".join(bytes((ord(char),)) if ord(char) in UNDEFINED_CP1252_BYTES
                                 else char.encode("cp1252") for char in text)
        self.assertEqual(reconstructed, raw)
        self.assertTrue(text.startswith("Société’s "))
        self.assertNotIn("\ufffd", text)
        self.assertEqual(audit["encoding"], "Windows-1252")
        self.assertEqual(sum(issue["count"] for issue in audit["undefinedBytes"]), 30)
        issue = next(issue for issue in audit["undefinedBytes"] if issue["hex"] == "8D")
        self.assertEqual(issue["count"], 26)
        self.assertTrue(issue["offsetsTruncated"])
        self.assertEqual(len(issue["firstByteOffsets"]), 20)
        self.assertTrue(all(raw[offset] == 0x8D for offset in issue["firstByteOffsets"]))

    def test_undefined_legacy_bytes_survive_full_csv_and_json_publication(self):
        raw = (b"Employer,Address,Approved Positions\r\n"
               b"Soci\xe9t\xe9\x8d Test,Ottawa\x90,4\r\nNotes:\r\n1. Source note\r\n")
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "legacy.csv"
            path.write_bytes(raw)
            partition, audit = parse_file(path, resource_descriptor(raw_resource()))
            published = json.loads(json.dumps(partition, ensure_ascii=False).encode("utf-8"))
            self.assertEqual(published["rows"][0][1:3], ["Société\u008d Test", "Ottawa\u0090"])
            self.assertEqual(published["rows"][0][10], 4)
            self.assertEqual({issue["hex"] for issue in audit["decoding"]["undefinedBytes"]}, {"8D", "90"})
            self.assertIn("Undefined Windows-1252", audit["notes"][-1])

    def test_publisher_unnamed_rows_preserve_counts_without_entity_history(self):
        table = [["Province/Territoire", "Volet", "Employeur", "Adresse", "Profession", "Postes approuvés"],
                 ["Colombie-Britannique", "Bas salaire", "Entreprise Démonstration", "Pitt Meadows, BC V3Y 2J4", "6311-Profession", 2],
                 ["Colombie-Britannique", "Bas salaire", "(blank)", "Pitt Meadows, BC V3Y 2J4", "6311-Profession", 3],
                 ["Colombie-Britannique", "Bas salaire", "(blank)", "Pitt Meadows, BC V3Y 2J4", "6311-Profession", 3],
                 ["Colombie-Britannique", "Bas salaire", "(blank)", "", "6311-Profession", "x"]]
        resource = resource_descriptor(raw_resource("2019-q3", "2019Q3-Employers NOC 2011"))
        rows, audit = parse_table(table, resource)
        self.assertEqual(len(rows), 4)
        self.assertEqual([row[1] for row in rows], ["Entreprise Démonstration", "(blank)", "(blank)", "(blank)"])
        self.assertEqual(sum(row[10] or 0 for row in rows), 8)
        self.assertIsNone(rows[-1][10])
        self.assertIsNone(rows[-1][2], "An unnamed row must not inherit another row's address")
        self.assertEqual(len({row[11] for row in rows}), 4)
        self.assertEqual(audit["unpublishedEmployerRowCount"], 3)
        self.assertEqual([record["rowId"] for record in audit["unpublishedEmployerRows"]], [row[0] for row in rows[1:]])
        again, _ = parse_table(table, resource)
        self.assertEqual(again, rows, "Repeated ingestion must remain deterministic")
        other, _ = parse_table(table, resource_descriptor(raw_resource("2019-q4", "2019Q4-Employers NOC 2011")))
        self.assertEqual(rows[0][11], other[0][11], "Published exact employer/location identity still supports history")
        self.assertTrue(all(a[11] != b[11] for a, b in zip(rows[1:], other[1:])))

    def test_empty_grouped_cells_cannot_inherit_an_unnamed_employer(self):
        table = [["Province", "Employer", "Address", "Approved Positions"],
                 ["Ontario", "(blank)", "Ottawa", 2], ["", "", "Ottawa", 3]]
        with self.assertRaisesRegex(ValueError, "Missing employer identity"):
            parse_table(table, resource_descriptor(raw_resource()))

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

    def test_combined_codes_restore_only_declared_edition_width(self):
        header = ["Province", "Employer", "Address", "Occupation", "Approved Positions"]
        table = [header,
                 ["Québec", "Fixture A", "Montréal", "631-Directeurs de la restauration", 2],
                 ["Québec", "Fixture B", "Montréal", "16-Cadres supérieurs", 3],
                 ["Québec", "Fixture C", "Montréal", "6-Cadres", "x"],
                 ["Québec", "Fixture D", "Montréal", "0631-Directeurs", 4]]
        for edition in ("2006", "2011", "2016", "2021"):
            with self.subTest(edition=edition):
                resource = resource_descriptor(raw_resource(name=f"2016-Employers NOC {edition}"))
                rows, audit = parse_table(table, resource)
                width = 5 if edition == "2021" else 4
                self.assertEqual([row[6] for row in rows], [code.zfill(width) for code in ("631", "16", "6", "0631")])
                self.assertEqual([row[7] for row in rows], ["Directeurs de la restauration", "Cadres supérieurs", "Cadres", "Directeurs"])
                self.assertEqual({row[8] for row in rows}, {edition})
                self.assertEqual([row[10] for row in rows], [2, 3, None, 4])
                padding = audit["occupationCodePadding"]
                self.assertEqual(padding["count"], 4 if edition == "2021" else 3)
                self.assertEqual(padding["samples"][0], {"line": 2, "sourceOccupation": "631-Directeurs de la restauration",
                                                        "normalizedCode": "631".zfill(width), "declaredNocVersion": edition})
                self.assertFalse(padding["samplesTruncated"])

    def test_combined_short_codes_without_known_edition_are_not_guessed(self):
        table = [["Employer", "Address", "Occupation", "Approved Positions"],
                 ["Fixture A", "Ottawa", "16-Cadres supérieurs", 3],
                 ["Fixture B", "Ottawa", "0631-Directeurs", 2]]
        for title in ("2016-Employers", "2016-Employers NOC 2019"):
            rows, audit = parse_table(table, resource_descriptor(raw_resource(name=title)))
            self.assertEqual(rows[0][6:9], [None, "16-Cadres supérieurs", None])
            self.assertEqual(rows[1][6], "0631")
            self.assertEqual(audit["occupationCodePadding"]["count"], 0)

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
        self.assertFalse((self.stage / "catalogue.json").exists())

    def initial_verified(self, pkg=None, read=None):
        value = refresh(empty_metadata(), self.previous_dir, self.stage,
                        lambda: verified_download(pkg or self.pkg), read or self.read, STAMP)
        dump(self.stage / "metadata.json", value)
        validate_directory(self.stage)
        shutil.copytree(self.stage, self.previous_dir, dirs_exist_ok=True)
        return value

    def test_verified_catalogue_cache_persists_real_source_provenance(self):
        value = self.initial_verified()
        cached = validate_catalogue_cache(json.loads((self.stage / "catalogue.json").read_text()))
        self.assertEqual(cached["package"], self.pkg)
        self.assertEqual(cached["checkedAt"], STAMP)
        self.assertEqual(cached["provenance"]["sha256"], verified_download(self.pkg)[1]["sha256"])
        self.assertEqual(cached["packageSha256"], digest(self.pkg))
        self.assertEqual(value["catalogue"]["cachePath"], "lmia/catalogue.json")
        self.assertEqual(value["catalogue"]["status"], "ok")

    def test_cached_catalogue_progresses_missing_resource_without_fresh_complete_check(self):
        pkg = package(raw_resource(), raw_resource("q3", "2026Q3-Employers NOC 2021"))
        def first_read(resource):
            if resource["id"] == "q3": raise OSError("temporary resource outage")
            return self.read(resource)
        previous = self.initial_verified(pkg, first_read)
        self.assertEqual(previous["coverage"]["periodCount"], 1)
        self.assertIsNone(previous["lastSuccessfulCheckAt"])
        later = "2026-11-08T18:00:00+00:00"
        result = refresh(previous, self.previous_dir, self.stage,
                         lambda: (_ for _ in ()).throw(OSError("catalogue timeout")), self.read, later)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["coverage"]["periodCount"], 2)
        self.assertEqual(result["coverage"]["rowCount"], 6)
        self.assertIsNone(result["lastSuccessfulCheckAt"])
        self.assertEqual(result["lastSuccessfulUpdateAt"], later)
        self.assertEqual(result["catalogue"]["checkedAt"], STAMP)
        self.assertEqual(result["catalogue"]["lastSuccessfulCheckAt"], STAMP)
        self.assertEqual(result["catalogue"]["lastAttemptAt"], later)
        self.assertEqual(result["catalogue"]["status"], "cached")
        self.assertIn("catalogue timeout", result["error"])
        self.assertIn("current catalogue completeness is unverified", result["coverage"]["notes"][0].lower())
        self.assertEqual(result["resources"][0]["lastSuccessfulCheckAt"], previous["resources"][0]["lastSuccessfulCheckAt"])
        dump(self.stage / "metadata.json", result)
        validate_directory(self.stage)

    def test_cached_no_change_preserves_content_and_successful_check_dates(self):
        previous = self.initial_verified()
        cached_bytes = (self.stage / "catalogue.json").read_bytes()
        partition_bytes = (self.stage / "periods/2026-Q2.json").read_bytes()
        later = "2026-11-08T18:00:00+00:00"
        result = refresh(previous, self.previous_dir, self.stage,
                         lambda: (_ for _ in ()).throw(OSError("HTTP 503")), self.read, later)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["lastAttemptAt"], later)
        for key in ("lastSuccessfulCheckAt", "lastSuccessfulUpdateAt", "generatedAt"):
            self.assertEqual(result[key], previous[key])
        self.assertEqual(result["resources"][0]["lastSuccessfulCheckAt"], STAMP)
        self.assertEqual(result["resources"][0]["status"], "retained")
        self.assertEqual((self.stage / "catalogue.json").read_bytes(), cached_bytes)
        self.assertEqual((self.stage / "periods/2026-Q2.json").read_bytes(), partition_bytes)
        self.assertEqual(self.calls, 1)
        dump(self.stage / "metadata.json", result)
        validate_directory(self.stage)
        (self.stage / "catalogue.json").unlink()
        with self.assertRaisesRegex(ValueError, "cached-catalogue metadata"):
            validate_directory(self.stage)

    def test_fresh_catalogue_recovery_replaces_cache_without_fake_content_update(self):
        previous = self.initial_verified()
        outage = refresh(previous, self.previous_dir, self.stage,
                         lambda: (_ for _ in ()).throw(OSError("HTTP 503")), self.read, "2026-11-08T18:00:00+00:00")
        later = "2026-11-09T18:00:00+00:00"
        recovered = refresh(outage, self.previous_dir, self.stage,
                            lambda: verified_download(self.pkg, later), self.read, later)
        self.assertEqual(recovered["status"], "ok")
        self.assertEqual(recovered["catalogue"]["status"], "ok")
        self.assertEqual(recovered["catalogue"]["checkedAt"], later)
        self.assertEqual(recovered["lastSuccessfulCheckAt"], later)
        self.assertEqual(recovered["lastSuccessfulUpdateAt"], previous["lastSuccessfulUpdateAt"])
        self.assertNotIn("error", recovered)
        cached = validate_catalogue_cache(json.loads((self.stage / "catalogue.json").read_text()))
        self.assertEqual(cached["checkedAt"], later)

    def test_corrupt_or_secondary_catalogues_cannot_bootstrap_verified_cache(self):
        original = catalogue_cache(*verified_download(self.pkg))
        variants = []
        changed = copy.deepcopy(original); changed["packageSha256"] = "0" * 64; variants.append(changed)
        for change in (lambda p: p.update(id="wrong-dataset"),
                       lambda p: p.update(_discoverySource="https://example.invalid/discovery.csv"),
                       lambda p: p["resources"][0].update(url="javascript:unsafe"),
                       lambda p: p["resources"][0].pop("url"),
                       lambda p: p.update(resources=[])):
            value = copy.deepcopy(original); change(value["package"])
            value["packageSha256"] = digest(value["package"]); variants.append(value)
        for key, value in (("url", "https://example.invalid/not-official"), ("sha256", ""), ("bytes", 0), ("retrievedAt", "2026-11-07")):
            changed = copy.deepcopy(original); changed["provenance"][key] = value; variants.append(changed)
        for value in variants:
            with self.subTest(value=value):
                with self.assertRaises(ValueError): validate_catalogue_cache(value)
        previous = self.initial_verified()
        dump(self.stage / "catalogue.json", variants[0])
        result = refresh(previous, self.previous_dir, self.stage,
                         lambda: (_ for _ in ()).throw(OSError("outage")), self.read, "2026-11-08T18:00:00+00:00")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["periods"], previous["periods"])
        self.assertEqual(self.calls, 1)
        with self.assertRaises(ValueError): validate_directory(self.stage)
        validate_directory(self.previous_dir)

    def test_unsafe_or_incomplete_fresh_catalogue_cannot_replace_valid_cache(self):
        previous = self.initial_verified()
        original = (self.stage / "catalogue.json").read_bytes()
        unsafe = copy.deepcopy(self.pkg); unsafe["resources"][0]["url"] = "javascript:unsafe"
        result = refresh(previous, self.previous_dir, self.stage,
                         lambda: verified_download(unsafe), self.read, "2026-11-08T18:00:00+00:00")
        self.assertEqual(result["catalogue"]["status"], "cached")
        self.assertEqual((self.stage / "catalogue.json").read_bytes(), original)
        incomplete = package(raw_resource("q3", "2026Q3-Employers NOC 2021"))
        result = refresh(previous, self.previous_dir, self.stage,
                         lambda: verified_download(incomplete), self.read, "2026-11-09T18:00:00+00:00")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["periods"], previous["periods"])
        self.assertEqual((self.stage / "catalogue.json").read_bytes(), original)


if __name__ == "__main__": unittest.main()
