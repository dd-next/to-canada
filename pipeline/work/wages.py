"""Job Bank wages (ESDC) -> occupations.json + wages.json (WageTable)."""
from __future__ import annotations

import json
import re
from html import unescape
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch, fetch_json, fetch_text, meta_for  # noqa: E402
from common.contract import geo, load_places, write_processed, PROCESSED  # noqa: E402

DATASET = "adad580f-76b0-4502-bd05-20c125de9116"
CATALOG = "https://open.canada.ca/data/api/3/action/package_show"


def discover_resource(package: dict) -> dict:
    """Choose the latest English wage CSV explicitly advertised by the publisher."""
    choices = []
    for resource in package.get("resources", []):
        name = resource.get("name") or ""
        url = resource.get("url") or ""
        match = re.search(r"\b(20\d{2})\s+Wages\b", name, re.I)
        languages = resource.get("language") or []
        if isinstance(languages, str):
            languages = [languages]
        if not match or not url.startswith("https://") or not url.lower().endswith(".csv"):
            continue
        if languages and not any(x in ("en", "eng", "en-ca") for x in languages):
            continue
        choices.append((int(match.group(1)), resource.get("last_modified") or resource.get("created") or "", url, resource))
    if not choices:
        raise ValueError("Manual update required: official Job Bank catalog has no recognizable English yearly wage CSV")
    edition, _, _, resource = max(choices, key=lambda x: x[:3])
    return {**resource, "edition": edition}

NOC_BASE = "https://www.statcan.gc.ca/en/subjects/standard/noc/2021/indexV1/"
NOC_STRUCT = NOC_BASE + "noc-2021-v1.0-classification-structure.csv"
NOC_ELEM = NOC_BASE + "noc-2021-v1.0-elements.csv"
NOC_SOURCE_ID = "statcan-noc-2021-v1.0"
PROV_MAP = {"NL": "NL", "PEI": "PE", "NS": "NS", "NB": "NB", "QC": "QC", "ON": "ON", "MB": "MB", "SK": "SK",
            "AB": "AB", "BC": "BC", "YK": "YT", "NWT": "NT", "NU": "NU"}
PROV_NAMES = {"NL": "Newfoundland and Labrador", "PE": "Prince Edward Island", "NS": "Nova Scotia",
              "NB": "New Brunswick", "QC": "Quebec", "ON": "Ontario", "MB": "Manitoba", "SK": "Saskatchewan",
              "AB": "Alberta", "BC": "British Columbia", "YT": "Yukon", "NT": "Northwest Territories", "NU": "Nunavut"}
PRUID = {"NL": "10", "PE": "11", "NS": "12", "NB": "13", "QC": "24", "ON": "35", "MB": "46", "SK": "47",
         "AB": "48", "BC": "59", "YT": "60", "NT": "61", "NU": "62"}


def place_ers(places):
    """{er_code: (name_from_place, province)} for the primary + overlapping ERs of every place."""
    out = {}
    for p in places:
        ers = p.get("economicRegions") or p.get("geo", {}).get("economicRegions") or []
        for e in ers:
            out[str(e["id"])] = (e["name"], p["province"])
    return out


def catalog_from_html(html: str) -> dict:
    """Fallback to the publisher's machine-readable DataDownload markup."""
    resources = []
    for block in re.findall(r'<span property="distribution"[^>]*>(.*?)</span>\s*</span>', html, re.S):
        def field(name):
            m = re.search(r'<span property="' + name + r'"[^>]*>([^<]*)', block)
            return unescape(m.group(1)).strip() if m else ""
        date = re.search(r'property="datePublished" value="([^"]+)"', block)
        resources.append({"name": field("name"), "url": field("url"), "format": field("fileFormat"),
                          "language": ["en"], "last_modified": date.group(1) if date else None})
    modified = re.search(r'<span property="dateModified">([^<]+)', html)
    return {"resources": resources, "metadata_modified": modified.group(1) if modified else None}


def latest_resource() -> tuple[dict, dict]:
    try:
        payload = fetch_json(CATALOG, params={"id": DATASET}, max_age_days=1, retries=1, timeout=30)
        if not payload.get("success") or not isinstance(payload.get("result"), dict):
            raise ValueError("Job Bank catalog returned an unexpected format")
        package = payload["result"]
    except (ValueError, RuntimeError):
        package = catalog_from_html(fetch_text(f"https://open.canada.ca/data/en/dataset/{DATASET}", max_age_days=1))
    return discover_resource(package), package


def load_raw() -> tuple[pd.DataFrame, dict]:
    resource, package = latest_resource()
    path = fetch(resource["url"], max_age_days=7)
    df = pd.read_csv(path, dtype=str, encoding="utf-8-sig", keep_default_na=False)
    required = {"NOC_CNP", "ER_Code_Code_RE", "Reference_Period", "Data_Source_E", "Annual_Wage_Flag_Salaire_annuel"}
    if not required <= set(df.columns):
        raise ValueError("Job Bank wage CSV schema changed; manual review required")
    revisions = sorted(v for v in df.get("Revision_Date_Date_revision", []) if re.fullmatch(r"20\d{2}-\d{2}-\d{2}", v))
    return df, {**meta_for(path), "edition": resource["edition"], "sourceId": f"jobbank-wages-{resource['edition']}",
                "url": resource["url"], "releaseDate": revisions[-1] if revisions else (resource.get("last_modified") or "")[:10] or None,
                "catalogModified": package.get("metadata_modified")}


def num(s):
    s = (s or "").strip()
    if s in ("", "NA", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def build_occupations():
    st = pd.read_csv(fetch(NOC_STRUCT), dtype=str, encoding="utf-8-sig", keep_default_na=False)
    code_col = [c for c in st.columns if c.startswith("Code")][0]
    broad = {r[code_col]: r["Class title"] for _, r in st.iterrows() if r["Level"] == "1"}
    el = pd.read_csv(fetch(NOC_ELEM), dtype=str, encoding="utf-8-sig", keep_default_na=False)
    ecode = [c for c in el.columns if c.startswith("Code")][0]
    ill = el[el["Element Type Label English"] == "Illustrative example(s)"]
    examples: dict[str, list[str]] = {}
    for c, g in ill.groupby(ecode):
        seen = []
        for v in g["Element Description English"]:
            v = v.strip()
            if v and v not in seen:
                seen.append(v)
        examples[c] = seen[:6]
    occ = []
    for _, r in st[st["Level"] == "5"].iterrows():
        c = r[code_col]
        o = {"noc": c, "title": r["Class title"], "teer": int(c[1]), "broadCategory": c[0],
             "broadTitle": broad[c[0]]}
        if examples.get(c):
            o["examples"] = examples[c]
        occ.append(o)
    return occ


def build(places=None):
    places = places or load_places()
    df, meta = load_raw()
    ers = place_ers(places)
    occ = build_occupations()
    occ_codes = {o["noc"] for o in occ}
    df["noc"] = df["NOC_CNP"].str.replace("NOC_", "", regex=False)
    df["er"] = df["ER_Code_Code_RE"].str.replace("ER", "", regex=False)
    csv_er = {r.er: r.ER_Name for r in df[df.er.str.len() == 4].drop_duplicates("er").itertuples()}
    mismatches = []
    for code, (nm, prov) in sorted(ers.items()):
        jb = csv_er.get(code)
        if jb is None:
            mismatches.append({"er": code, "placeName": nm, "jobBank": None})
        elif jb.replace("--", "-").lower() != nm.replace("--", "-").lower():
            mismatches.append({"er": code, "placeName": nm, "jobBank": jb})
    geos = {"CA": geo("country", "01", "Canada")}
    keep = {"00": "CA"}
    for prov, pc in PROV_MAP.items():
        keep[PRUID[pc]] = pc
        geos[pc] = geo("province", PRUID[pc], PROV_NAMES[pc], vintage="Job Bank")
    for code in ers:
        geos[code] = geo("economic_region", code, csv_er.get(code, ers[code][0]), vintage="ER 2021")
    # provinces: drop territories as separate keys (their ER == the territory)
    for t in ("YT", "NT", "NU", "PE"):
        pass
    sel = df[df.noc.isin(occ_codes) & (df.er.isin(set(ers)) | df.er.isin(["00", "10", "11", "12", "13", "24", "35", "46", "47", "48", "59"]))]
    by: dict[str, dict] = {}
    ref_counts: dict[str, int] = {}
    metadata: dict[str, dict] = {}
    for r in sel.itertuples():
        if r.er == "00":
            key = "CA"
        elif len(r.er) == 2:
            key = keep[r.er]
        else:
            key = r.er
        lo, md, hi = num(r.Low_Wage_Salaire_Minium), num(r.Median_Wage_Salaire_Median), num(r.High_Wage_Salaire_Maximal)
        if lo is None and md is None and hi is None:
            continue
        ann = 1 if r.Annual_Wage_Flag_Salaire_annuel == "1" else 0
        by.setdefault(r.noc, {})[key] = [lo, md, hi, ann]
        metadata.setdefault(r.noc, {})[key] = {
            "referencePeriod": r.Reference_Period.strip(),
            "methodology": r.Data_Source_E.strip(),
            "source": r.Data_Source_E.strip(),
        }
        if not metadata[r.noc][key]["referencePeriod"] or not metadata[r.noc][key]["methodology"]:
            raise ValueError(f"Missing wage provenance for NOC {r.noc}, geography {key}")
        ref_counts[r.Reference_Period] = ref_counts.get(r.Reference_Period, 0) + 1
    # drop province keys never used
    used = {k for v in by.values() for k in v}
    geos = {k: v for k, v in geos.items() if k in used}
    table = {
        "sourceId": meta["sourceId"],
        "referencePeriod": "; ".join(sorted(ref_counts)),
        "revisionDate": meta.get("releaseDate"),
        "metadata": metadata,
        "geos": geos,
        "byNoc": by,
    }
    return occ, table, meta, mismatches, ref_counts, df


def write(occ, table):
    write_processed("work", "occupations", occ, check=False)
    out = PROCESSED / "work" / "wages.json"
    out.write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return out


def sources(meta, ref_counts):
    return [{
        "id": meta["sourceId"],
        "title": f"Wages (Job Bank), {meta['edition']} edition",
        "publisher": "Employment and Social Development Canada (Job Bank)",
        "tableId": DATASET,
        "url": "https://open.canada.ca/data/en/dataset/adad580f-76b0-4502-bd05-20c125de9116",
        "downloadUrl": meta["url"],
        "releaseDate": meta.get("releaseDate"),
        "retrievedAt": meta.get("retrievedAt"),
        "lastCheckedAt": meta.get("lastCheckedAt"),
        "referencePeriod": "; ".join(sorted(ref_counts)),
        "licence": "Open Government Licence - Canada",
        "attribution": "Contains information licensed under the Open Government Licence - Canada. Source: Employment and Social Development Canada, Job Bank Wages.",
        "transformations": [
            "Kept NOC 2021 unit groups (5-digit), the economic regions used by our places, provinces, and Canada.",
            "Low/median/high wage kept as published; hourly dollars unless Annual_Wage_Flag = 1 (annual dollars).",
            "Cells with no published wage are omitted (not zero-filled); the Job Bank file refers users to the provincial/national wage in that case.",
        ],
        "notes": [
            "Wages describe employed workers, not advertised pay. Each cell retains the publisher's period and Data_Source_E methodology; estimates with different periods or methods must not be pooled into a ranking.",
            "Job Bank's ER_Name differs slightly from StatCan for ER 5920 ('Lower Mainland' vs 'Lower Mainland--Southwest') and ER 6010 ('Yukon Territory' vs 'Yukon').",
            "Territories and PEI have a single economic region equal to the territory/province; no separate provincial key is stored.",
            f"Cells kept by reference period label: {ref_counts}",
            "The newest English wage CSV edition is discovered from the official open.canada.ca catalog; each cell retains its own Reference_Period and Data_Source_E.",
        ],
        "status": "ok",
    }, {
        "id": NOC_SOURCE_ID,
        "title": "National Occupational Classification (NOC) 2021 Version 1.0: classification structure and elements",
        "publisher": "Statistics Canada",
        "url": "https://www.statcan.gc.ca/en/subjects/standard/noc/2021/indexV1",
        "downloadUrl": NOC_STRUCT,
        "retrievedAt": meta_for(fetch(NOC_STRUCT)).get("retrievedAt"),
        "licence": "Statistics Canada Open Licence",
        "attribution": "Source: Statistics Canada, NOC 2021 Version 1.0.",
        "transformations": ["Unit groups (level 5) with TEER = second digit of the code; broad category = first digit; examples = first six 'Illustrative example(s)' elements."],
        "status": "ok",
    }]


if __name__ == "__main__":
    occ, table, meta, mm, rc, df = build()
    p = write(occ, table)
    print(p.stat().st_size, len(occ), len(table["byNoc"]), len(table["geos"]), mm, rc)
