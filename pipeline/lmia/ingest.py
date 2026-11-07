"""Parse publisher releases without joining employers or mixing reporting periods.

Written for Northward. The public CanQuery implementation was inspected as a
layout reference; no code is incorporated from it.
"""
from __future__ import annotations

import calendar
import csv
import hashlib
import io
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

DATASET_ID = "90fed587-1364-4f33-a9ee-208181dc0b97"
CATALOGUE_URL = f"https://open.canada.ca/data/api/3/action/package_show?id={DATASET_ID}"
TRANSFORM_VERSION = 1
DATASET = {
    "id": DATASET_ID,
    "title": "Temporary Foreign Worker Program: Positive LMIA Employers List",
    "url": f"https://open.canada.ca/data/en/dataset/{DATASET_ID}",
    "publisher": "Employment and Social Development Canada / Government of Canada",
    "licence": {"name": "Open Government Licence – Canada", "url": "https://open.canada.ca/en/open-government-licence-canada"},
}
COLUMNS = ["id", "employer", "address", "province", "provinceLabel", "stream", "occupationCode",
           "occupationTitle", "nocVersion", "approvedLmias", "approvedPositions", "employerLocationId", "incorporation"]
PROVINCES = {
    "NL": ["Newfoundland and Labrador", "Terre-Neuve-et-Labrador"],
    "PE": ["Prince Edward Island", "Île-du-Prince-Édouard"],
    "NS": ["Nova Scotia", "Nouvelle-Écosse"], "NB": ["New Brunswick", "Nouveau-Brunswick"],
    "QC": ["Quebec", "Québec"], "ON": ["Ontario"], "MB": ["Manitoba"], "SK": ["Saskatchewan"],
    "AB": ["Alberta"], "BC": ["British Columbia", "Colombie-Britannique"],
    "YT": ["Yukon", "Yukon Territory"], "NT": ["Northwest Territories", "Territoires du Nord-Ouest"],
    "NU": ["Nunavut"],
    "HO": ["Employers carrying on business in Canada with Head Office outside of Canada", "Outside Canada", "Head Office outside of Canada"],
}


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return re.sub(r"\s+", " ", str(value)).strip()


def folded(value):
    return "".join(c for c in unicodedata.normalize("NFKD", clean(value)) if not unicodedata.combining(c)).lower()


PROVINCE_LOOKUP = {folded(label): code for code, labels in PROVINCES.items() for label in [code, *labels]}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def safe_url(value):
    parsed = urlparse(str(value))
    return parsed.scheme in ("https", "http") and bool(parsed.netloc) and not parsed.username and not parsed.password


def period_from_name(name):
    text = clean(name)
    match = re.match(r"^(20\d{2})\s*Q([1-4])(?:\s*[-–]?\s*Q([1-4]))?(?=\D|$)", text, re.I)
    if match:
        year, first, last = int(match[1]), int(match[2]), int(match[3] or match[2])
        if not 2014 <= year <= date.today().year + 1 or last < first:
            return None
        sm, em = first * 3 - 2, last * 3
        pid = f"{year}-Q{first}" + (f"Q{last}" if last != first else "")
        return {"id": pid, "label": f"{year} Q{first}" + (f"–Q{last}" if last != first else ""),
                "start": f"{year}-{sm:02}-01", "end": f"{year}-{em:02}-{calendar.monthrange(year, em)[1]}",
                "kind": "quarter" if first == last else "half-year" if last - first == 1 else "multi-quarter"}
    match = re.match(r"^(20\d{2})(?=\s*[-–:,(]|\s*$)", text)
    if not match or not 2014 <= int(match[1]) <= date.today().year + 1:
        return None
    year = int(match[1])
    start, end = date(year, 1, 1), date(year, 12, 31)
    narrow = re.search(r"between\s+([a-z]+)\s+(\d{1,2})\s+and\s+([a-z]+)\s+(\d{1,2}),?\s+(20\d{2})", text, re.I)
    if narrow:
        months = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
        try:
            start = date(int(narrow[5]), months[narrow[1].lower()], int(narrow[2]))
            end = date(int(narrow[5]), months[narrow[3].lower()], int(narrow[4]))
            if start.year != year or end.year != year or start > end:
                return None
        except (KeyError, ValueError):
            return None
    # The French 2014 catalogue describes this same explicitly bounded release.
    elif year == 2014 and re.search(r"20\s+juin.*31\s+d[eé]cembre", text, re.I):
        start = date(2014, 6, 20)
    return {"id": str(year), "label": str(year), "start": start.isoformat(), "end": end.isoformat(), "kind": "annual"}


def language_of(resource):
    value = resource.get("language") or []
    if isinstance(value, str):
        value = re.split(r"[,;\s]+", value)
    if any(x in ("en", "eng", "en-ca") for x in value):
        return "en"
    if any(x in ("fr", "fra", "fre", "fr-ca") for x in value):
        return "fr"
    name = folded(resource.get("name", ""))
    if "employers" in name:
        return "en"
    if "employeurs" in name:
        return "fr"
    return "unknown"


def resource_descriptor(resource):
    name = resource.get("name") or ""
    if isinstance(name, dict):
        name = name.get("en") or name.get("fr") or ""
    form = clean(resource.get("format")).lower().lstrip(".")
    if form in ("excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"):
        form = "xlsx"
    version_input = {key: resource.get(key) for key in ("id", "url", "format", "last_modified", "hash", "size", "source_hash", "data_processed", "rows_updated_at")}
    return {"id": resource.get("id"), "name": name, "url": resource.get("url"), "format": form,
            "language": language_of(resource), "revision": digest(version_input),
            "publisherModifiedAt": resource.get("last_modified"), "publisherCreatedAt": resource.get("created"),
            "period": period_from_name(name)}


def select_resources(package):
    """One format/language/revision per period, then maximum non-overlap coverage.

    Dynamic programming maximises days covered before preferring finer releases.
    An annual file is therefore kept if only one overlapping quarter is present.
    """
    if package.get("id") != DATASET_ID or not isinstance(package.get("resources"), list) or not package["resources"]:
        raise ValueError("Invalid or empty official catalogue; previous snapshot retained")
    groups, excluded = defaultdict(list), []
    ids = set()
    for raw in package["resources"]:
        r = resource_descriptor(raw)
        if not r["id"] or r["id"] in ids:
            raise ValueError("Catalogue resource IDs are missing or duplicated")
        ids.add(r["id"])
        if not safe_url(r["url"]):
            excluded.append({**r, "reason": "Unsupported or unsafe resource URL"})
        elif r["format"] not in ("csv", "xls", "xlsx"):
            excluded.append({**r, "reason": "Documentation or unsupported format; not an employer release"})
        elif not r["period"]:
            excluded.append({**r, "reason": "Unrecognised reporting period; requires review"})
        else:
            p = r["period"]
            groups[(p["start"], p["end"])].append(r)
    candidates = []
    for group in groups.values():
        # An explicitly newer publisher revision wins even in French. English
        # and text format are tie-breakers, never additional observations.
        # Creation timestamps alone do not establish a content revision.
        group.sort(key=lambda r: (r["publisherModifiedAt"] or "", r["language"] == "en", {"csv": 3, "xlsx": 2, "xls": 1}[r["format"]], r["id"]), reverse=True)
        winner = group[0]
        candidates.append(winner)
        for r in group[1:]:
            excluded.append({**r, "reason": f"Alternative language, format or revision of {winner['id']}; not counted twice"})
    if not candidates:
        raise ValueError("No recognisable employer releases in catalogue")
    candidates.sort(key=lambda r: (r["period"]["end"], r["period"]["start"], r["id"]))
    best = [((0, 0), [])]
    for index, r in enumerate(candidates):
        period = r["period"]
        compatible = next((j + 1 for j in range(index - 1, -1, -1) if candidates[j]["period"]["end"] < period["start"]), 0)
        days = (date.fromisoformat(period["end"]) - date.fromisoformat(period["start"])).days + 1
        score, prior = best[compatible]
        include = ((score[0] + days, score[1] + 1), [*prior, index])
        best.append(include if include[0] > best[-1][0] else best[-1])
    selected_indexes = set(best[-1][1])
    chosen = []
    for index, r in enumerate(candidates):
        if index in selected_indexes:
            chosen.append(r)
        else:
            excluded.append({**r, "reason": "Overlapping reporting period; excluded to prevent double counting"})
    chosen.sort(key=lambda r: r["period"]["start"])
    return chosen, sorted(excluded, key=lambda r: r["id"])


def number(value):
    text = re.sub(r"[,\s]", "", clean(value))
    if not re.fullmatch(r"\d+(?:\.0+)?", text):
        return None
    return int(float(text))


def header_columns(row):
    columns = {}
    for i, raw in enumerate(row):
        v = folded(raw).strip(" :*")
        if re.match(r"province|territor", v): columns.setdefault("provinceLabel", i)
        elif re.search(r"stream|volet", v): columns.setdefault("stream", i)
        elif re.fullmatch(r"employer(?: name)?|employeur|nom de l.employeur", v): columns.setdefault("employer", i)
        elif re.match(r"address|adresse", v): columns.setdefault("address", i)
        elif re.search(r"(?:occupation|noc|cnp).*code|code.*(?:occupation|noc|cnp)", v): columns.setdefault("occupationCode", i)
        elif re.search(r"(?:occupation|noc|cnp).*(?:title|titre)|(?:title|titre).*(?:occupation|noc|cnp)", v): columns.setdefault("occupationTitle", i)
        elif re.match(r"occupa|profession", v): columns.setdefault("occupation", i)
        elif re.search(r"incorporat|constitut", v): columns.setdefault("incorporation", i)
        elif re.search(r"position|poste", v): columns.setdefault("requestedPositions" if re.search(r"request|demand", v) else "approvedPositions", i)
        elif re.search(r"lmia|eimt", v): columns.setdefault("requestedLmias" if re.search(r"request|demand", v) else "approvedLmias", i)
    return columns if "employer" in columns and ("approvedPositions" in columns or "requestedPositions" in columns) else None


def read_tables(path):
    raw = Path(path).read_bytes()
    if len(raw) > 40 * 1024 * 1024:
        raise ValueError("Resource exceeds 40 MiB safety bound")
    if raw.startswith(b"PK\x03\x04"):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        try:
            return [(sheet.title, [list(row) for row in sheet.iter_rows(values_only=True)]) for sheet in wb]
        finally:
            wb.close()
    if raw.startswith(b"\xd0\xcf\x11\xe0"):
        import xlrd
        wb = xlrd.open_workbook(file_contents=raw)
        return [(sheet.name, [sheet.row_values(i) for i in range(sheet.nrows)]) for sheet in wb.sheets()]
    if raw[:100].lstrip().lower().startswith((b"<html", b"<!doctype", b"<?xml")):
        raise ValueError("Expected tabular data but received HTML/XML")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = raw.decode("utf-16")
    else:
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("cp1252")
    try:
        dialect = csv.Sniffer().sniff(text[:16000], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return [("CSV", list(csv.reader(io.StringIO(text), dialect)))]


def parse_table(records, resource, sheet="CSV"):
    found = [(i, header_columns(row)) for i, row in enumerate(records[:40]) if header_columns(row)]
    if not found:
        raise ValueError("Unrecognised employer table header")
    first, columns = found[0]
    context = " ".join(clean(v) for row in records[:first + 1] for v in row) + " " + resource["name"]
    version = re.search(r"(?:NOC|CNP)\)?\s*(20\d{2})", context, re.I)
    declared_version = version[1] if version else None
    notes, aggregates, quarantine, ignored, publisher_counts = [], [], [], Counter(), []
    section = None
    for record in records[:first]:
        cells = [clean(v) for v in record if clean(v)]
        if len(cells) == 1 and folded(cells[0]) in PROVINCE_LOOKUP:
            section = cells[0]
    state, output, in_notes = {}, [], False
    seen = Counter()
    for line, record in enumerate(records[first + 1:], first + 2):
        cells = [clean(v) for v in record]
        nonempty = [v for v in cells if v]
        if not nonempty:
            ignored["blank"] += 1
            continue
        if re.match(r"^notes?\s*:?$", nonempty[0], re.I) or (len(nonempty) == 1 and re.match(r"^\d+[.)]\s", nonempty[0])):
            in_notes = True
        if in_notes:
            notes.append(" ".join(nonempty))
            ignored["notes"] += 1
            continue
        new_header = header_columns(record)
        if new_header:
            columns = new_header
            state = {}
            ignored["repeated_header"] += 1
            continue
        if len(nonempty) == 1:
            if "provinceLabel" not in columns:
                section = nonempty[0]
                state = {}
                ignored["section"] += 1
            else:
                quarantine.append({"sheet": sheet, "line": line, "reason": "Unexpected standalone text", "cells": cells})
            continue
        current = {field: cells[idx] if idx < len(cells) else "" for field, idx in columns.items()}
        employer = current.get("employer", "")
        if folded(employer) in ("total", "grand total", "other employers", "autres employeurs", "total general"):
            aggregates.append({"label": employer, "approvedPositions": number(current.get("approvedPositions")), "approvedLmias": number(current.get("approvedLmias")), "line": line})
            ignored["aggregate"] += 1
            state = {}
            continue
        group_changed = any(current.get(k) and current[k] != state.get(k) for k in ("provinceLabel", "stream"))
        if group_changed:
            # A new province/stream cannot inherit a previous employer or address.
            state.pop("employer", None)
            state.pop("address", None)
            state.pop("incorporation", None)
        if employer:
            if employer != state.get("employer"):
                state.pop("address", None)
                state.pop("incorporation", None)
            state["employer"] = employer
        else:
            employer = state.get("employer", "")
        if not employer or folded(employer) == "(blank)":
            quarantine.append({"sheet": sheet, "line": line, "reason": "Missing employer identity", "cells": cells})
            state.pop("employer", None)
            continue
        for field in ("provinceLabel", "stream", "address", "incorporation"):
            if current.get(field):
                state[field] = current[field]
        def val(field):
            value = state.get(field) or None
            return None if folded(value) == "(blank)" else value
        province_label = val("provinceLabel") if "provinceLabel" in columns else section
        province = PROVINCE_LOOKUP.get(folded(province_label))
        occupation = current.get("occupation", "")
        occupation_match = re.match(r"^(\d{4,5})\s*[-–—]\s*(.*)", occupation)
        code = occupation_match[1] if occupation_match else None
        title = occupation_match[2] or None if occupation_match else (occupation or None)
        if "occupationCode" in columns:
            supplied = current.get("occupationCode", "")
            if supplied and folded(supplied) != "(blank)":
                if not re.fullmatch(r"\d{1,5}", supplied):
                    raise ValueError(f"Invalid separate occupation code at line {line}: {supplied}")
                width = 5 if declared_version == "2021" else 4 if declared_version in ("2006", "2011", "2016") else len(supplied)
                code = supplied.zfill(width)
                if len(code) not in (4, 5):
                    raise ValueError(f"Unrecognised occupation-code width at line {line}")
            title = current.get("occupationTitle") or None
        elif "occupationTitle" in columns:
            title = current.get("occupationTitle") or title
        if folded(title) == "(blank)": title = None
        noc = None
        if code:
            if len(code) == 5:
                noc = "2021"
            elif declared_version and declared_version != "2021":
                noc = declared_version
            else:
                noc = "Unspecified (4-digit)"
        location_id = "loc-" + digest([employer, val("address"), province_label])[:20]
        identity = [employer, val("address"), province_label, val("stream"), code, title, noc, val("incorporation")]
        ihash = digest(identity)[:20]
        occurrence = seen[ihash]
        seen[ihash] += 1
        row = {"id": f"{resource['id']}:{ihash}:{occurrence}", "employer": employer,
               "address": val("address"), "province": province, "provinceLabel": province_label,
               "stream": val("stream"), "occupationCode": code, "occupationTitle": title, "nocVersion": noc,
               "approvedLmias": number(current.get("approvedLmias")), "approvedPositions": number(current.get("approvedPositions")),
               "employerLocationId": location_id, "incorporation": val("incorporation")}
        if "requestedLmias" in columns or "requestedPositions" in columns:
            publisher_counts.append({"rowId": row["id"], "line": line,
                                     "requestedLmias": number(current.get("requestedLmias")),
                                     "requestedPositions": number(current.get("requestedPositions"))})
        output.append([row.get(k) for k in COLUMNS])
    if not output:
        raise ValueError("Employer release has no valid rows")
    # Unrecognised rows cannot silently turn a changed layout into a partial release.
    if quarantine:
        raise ValueError(f"{len(quarantine)} unrecognised data rows; first: {quarantine[:2]}")
    if publisher_counts:
        notes.append("Publisher columns labelled requested LMIAs/positions are preserved in this audit, not relabelled as approved counts.")
    return output, {"notes": notes, "aggregates": aggregates, "ignoredRows": dict(ignored), "quarantine": quarantine,
                    "publisherRequestedCounts": publisher_counts,
                    "declaredNocVersion": declared_version, "sheet": sheet, "inputRows": len(records)}


def parse_file(path, resource):
    candidates = []
    for name, records in read_tables(path):
        if any(header_columns(row) for row in records[:40]):
            candidates.append((name, records))
    if not candidates:
        raise ValueError("No recognised employer table in resource")
    # A second populated table could be a bilingual duplicate or an extra period.
    # Reject it for explicit review instead of silently adding overlapping records.
    if len(candidates) != 1:
        raise ValueError(f"Multiple employer tables require review: {[c[0] for c in candidates]}")
    name, records = candidates[0]
    rows, audit = parse_table(records, resource, name)
    if len(rows) > 200000:
        raise ValueError("Employer release exceeds 200,000-row safety bound")
    return {"schemaVersion": 1, "resourceId": resource["id"], "periodId": resource["period"]["id"], "columns": COLUMNS, "rows": rows}, audit


def validate_partition(value):
    if value.get("schemaVersion") != 1 or value.get("columns") != COLUMNS or not isinstance(value.get("rows"), list) or not value["rows"]:
        raise ValueError("Invalid LMIA period partition")
    ids = set()
    for row in value["rows"]:
        if len(row) != len(COLUMNS) or not isinstance(row[1], str) or not row[1]:
            raise ValueError("Invalid LMIA row")
        if row[0] in ids or not row[0].startswith(value["resourceId"] + ":"):
            raise ValueError("Duplicate or mismatched LMIA row ID")
        ids.add(row[0])
        for index in (9, 10):
            if row[index] is not None and (not isinstance(row[index], int) or isinstance(row[index], bool) or row[index] < 0):
                raise ValueError("LMIA counts must be nonnegative integers or unknown")
        if row[3] is not None and row[3] not in PROVINCES:
            raise ValueError("Unknown province code; preserve it as a source label")
        if row[6] and not re.fullmatch(r"\d{4,5}", row[6]):
            raise ValueError("Invalid NOC code")
        if row[6] and len(row[6]) == 5 and row[8] != "2021":
            raise ValueError("NOC version/code mismatch")
    return len(ids)
