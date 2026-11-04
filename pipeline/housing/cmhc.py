"""CMHC Rental Market Survey (October 2025): average rent and vacancy rate by bedroom type for each place's centre.

Source files: CMHC Rental Market Survey Data Tables (Excel), one workbook per centre, tables 1.1.1 (vacancy rate)
and 1.1.2 (average rent) "Private Apartment ... by Zone and Bedroom Type" (privately initiated apartment structures of
three units and over). We read the whole-centre row (e.g. 'Calgary CMA').
"""
from __future__ import annotations

import openpyxl

from common_h import places, statcan_geo_key
from common.contract import obs
from common.fetch import fetch, meta_for

SID = "cmhc-rms-2025"
BASE = ("https://assets.cmhc-schl.gc.ca/sites/cmhc/professional/housing-markets-data-and-research/"
        "housing-data-tables/rental-market/rental-market-report-data-tables/2025/rmr-{slug}-2025-en.xlsx")
LANDING = ("https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/"
           "rental-market/rental-market-report-data-tables")
PERIOD = "2025-10"
SLUGS = {  # placeId -> CMHC file slug (verified by download; the slug is CMHC's own file naming)
    "toronto": "toronto", "montreal": "montreal", "vancouver": "vancouver", "calgary": "calgary", "edmonton": "edmonton",
    "ottawa": "ottawa", "gatineau": "gatineau", "winnipeg": "winnipeg", "quebec-city": "quebec", "hamilton": "hamilton",
    "kitchener-waterloo": "kitchener-cambridge-waterloo", "london": "london", "halifax": "halifax", "victoria": "victoria",
    "saskatoon": "saskatoon", "regina": "regina", "st-johns": "st-johns", "windsor": "windsor", "kelowna": "kelowna",
    "abbotsford-mission": "abbotsford-mission", "moncton": "moncton", "saint-john": "saint-john",
    "fredericton": "fredericton", "sherbrooke": "sherbrooke", "sudbury": "greater-sudbury", "thunder-bay": "thunder-bay",
    "charlottetown": "charlottetown", "yellowknife": "yellowknife",
}
NOT_IN_RMS = {
    "brandon": "Brandon CA is not among the CMHC Rental Market Survey centres in the 2025 data tables (no workbook).",
    "whitehorse": "Whitehorse is not among the CMHC Rental Market Survey centres in the 2025 data tables (no workbook).",
    "iqaluit": "Iqaluit is not covered by the CMHC Rental Market Survey data tables.",
}
ROWNAME = {"quebec-city": "Québec CMA"}  # the Québec workbook holds several centres
GROUPS = [("Studio", "studio"), ("1 Bedroom", "1br"), ("2 Bedroom", "2br"), ("3 Bedroom +", "3br"), ("Total", "total")]
UT = {"studio": "Studio", "1br": "1 bedroom", "2br": "2 bedroom", "3br": "3 bedroom+"}


def _num(s):
    if s is None:
        return None
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None


def parse_table(ws, want: str | None = None) -> dict:
    """Return {group: {'Oct-24': (value, code), 'Oct-25': (...)}} for the whole-centre (last data) row, plus row label."""
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    grp_row = next(r for r in rows if r[1] in ("Studio",))
    hdr = rows[rows.index(grp_row) + 1]
    # data rows: first cell not None and not footnote; stop at the '§' footnote
    data = []
    for r in rows[rows.index(grp_row) + 2:]:
        if r[0] is None:
            continue
        if str(r[0]).startswith("§"):
            break
        data.append(r)
    cma_rows = [r for r in data if str(r[0]).rstrip().endswith((" CMA", " CA", "CMA"))]
    row = next((r for r in data if r[0] == want), None) if want else (cma_rows[-1] if cma_rows else data[-1])
    if row is None:
        raise ValueError(f"row {want!r} not found")
    out = {"_row": row[0], "_title": rows[0][0]}
    starts = [(i, g) for i, g in enumerate(grp_row) if g in dict(GROUPS)]
    for i, g in starts:
        cols = {}
        j = i
        while j < len(hdr) and (j == i or grp_row[j] is None) and j < i + 5:
            if hdr[j] in ("Oct-24", "Oct-25"):
                cols[hdr[j]] = (row[j], row[j + 1])
            j += 1
        out[dict(GROUPS)[g]] = cols
    return out


def build():
    out_obs, ctx, cov = [], {}, {}
    prov = {}
    for pl in places():
        pid = pl["id"]
        dg, gref = statcan_geo_key(pl)
        if pid in NOT_IN_RMS or pid not in SLUGS:
            cov[pid] = NOT_IN_RMS.get(pid, "no CMHC workbook mapped")
            if gref:
                for mid in ("studio", "1br", "2br", "3br"):
                    out_obs.append(obs(pid, f"rent_cmhc_avg_{mid}", None, PERIOD, gref, SID, ["not_available"], cov[pid]))
                out_obs.append(obs(pid, "rent_vacancy_rate", None, PERIOD, gref, SID, ["not_available"], cov[pid]))
            continue
        url = BASE.format(slug=SLUGS[pid])
        p = fetch(url, suffix=".xlsx")
        prov[pid] = {"url": url, "retrievedAt": meta_for(p).get("retrievedAt"), "lastModified": meta_for(p).get("lastModified")}
        wb = openpyxl.load_workbook(p, data_only=True)
        want = ROWNAME.get(pid)
        rent = parse_table(wb["Table 1.1.2"], want)
        vac = parse_table(wb["Table 1.1.1"], want)
        cov[pid] = f"covered ({rent['_row']})"
        note_geo = ""
        if pl["part"]:
            note_geo = " CMHC reports the Ontario/Quebec parts of Ottawa-Gatineau as separate centres; this is the provincial part."
        ctx[pid] = {"rent": rent, "vac": vac}
        for key in ("studio", "1br", "2br", "3br"):
            for per, label in (("Oct-25", PERIOD), ):
                v, code = rent[key][per]
                out_obs.append(_mk(pid, f"rent_cmhc_avg_{key}", v, code, label, gref, f"CMHC table 1.1.2, row '{rent['_row']}'." + note_geo))
        v, code = vac["total"]["Oct-25"]
        out_obs.append(_mk(pid, "rent_vacancy_rate", v, code, PERIOD, gref,
                           f"CMHC table 1.1.1, row '{vac['_row']}', all bedroom types ('Total').{note_geo}"))
    return out_obs, ctx, cov, prov


def _mk(pid, mid, v, code, period, gref, note):
    val = _num(v)
    fl = []
    code = (code or "").strip() if isinstance(code, str) else ""
    if str(v).strip() == "**":
        val, fl = None, ["suppressed"]
        note += " CMHC '**': data suppressed."
    elif val is None:
        fl = ["not_available"]
        note += f" CMHC cell value '{v}'."
    else:
        if code == "d":
            fl.append("use_with_caution")
        if code:
            note += f" CMHC reliability code '{code}' ({dict(a='excellent', b='very good', c='good', d='poor, use with caution').get(code, code)})."
    return obs(pid, mid, val, period, gref, SID, fl, note.strip())


def metric_defs():
    out = []
    base = dict(category="housing", unit="CAD_month", decimals=0, higherIs="worse", geoLevel="cma", periodType="month",
                seasonalAdjustment="not_applicable", priceBasis="current_dollars", sourceIds=[SID],
                comparabilityNote="CMHC surveys purpose-built rental apartment structures of 3+ units each October, reporting rents "
                                  "actually charged to sitting and new tenants (stock average). Not comparable with StatCan asking rents "
                                  "(online listings of units advertised during a quarter).")
    names = {"studio": "studio", "1br": "1-bedroom", "2br": "2-bedroom", "3br": "3-bedroom+"}
    for k, ut in UT.items():
        out.append({**base, "id": f"rent_cmhc_avg_{k}", "label": f"CMHC average rent, {names[k]} apartment",
                    "shortLabel": f"CMHC avg rent, {ut.replace(' bedroom', ' bed')}",
                    "description": f"Average monthly rent of {names[k]} units in privately initiated rental apartment structures of three or more units "
                                   "in the October 2025 CMHC Rental Market Survey (all units, occupied and vacant-for-rent; sitting tenants included).",
                    "basis": "average rent charged, purpose-built rental apartments (3+ units), October survey", "mapLayer": True,
                    "dims": {"family": "rent_cmhc_avg", "unitType": ut}})
    out.append({**base, "id": "rent_vacancy_rate", "label": "CMHC rental vacancy rate (all bedroom types)", "shortLabel": "Vacancy rate",
                "unit": "percent", "decimals": 1, "higherIs": "better",
                "description": "Share of purpose-built rental apartment units (structures of 3+ units) that were vacant and available for immediate "
                               "rental on the October 2025 survey date. Higher vacancy generally means more choice for renters.",
                "basis": "CMHC October survey, apartments in structures of 3+ units, total of all bedroom types", "mapLayer": True,
                "priceBasis": None, "dims": {"family": "rent_vacancy"}})
    for m in out:
        if m.get("priceBasis") is None:
            m.pop("priceBasis", None)
    return out
