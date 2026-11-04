"""Step 2: Census 2021 people metrics per place (CMA / CA / CMA part; Iqaluit CSD).

Tables (StatCan WDS full-table CSV, streamed from the cached zip, filtered to our DGUIDs):
  98-10-0030-01 population 2021 and 2016 (CMA/CA with parts)           100% data
  98-10-0002-01 population and dwelling counts by CSD (Iqaluit)          100% data
  98-10-0038-01 population in private dwellings / occupied dwellings    100% data  -> average household size
  98-10-0308-01 immigrant status and period of immigration (CMA/CA)    25% sample
  98-10-0175-01 knowledge of official languages (CMA/CA)                25% sample
  98-10-0227-01 language spoken most often at home (CMA/CA)             25% sample
  98-10-0457-01 main mode of commuting by commuting duration (CMA/CA)  25% sample
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch, fetch_json, meta_for  # noqa: E402
from common.statcan import WDS, pid_of, source_record, full_table_csv  # noqa: E402
from common.contract import obs, geo  # noqa: E402

PERIOD = "2021"
SRC = {t: f"statcan-{t}" for t in ["98-10-0030-01", "98-10-0002-01", "98-10-0038-01", "98-10-0308-01", "98-10-0175-01",
                                   "98-10-0227-01", "98-10-0457-01"]}


def stream(table_id: str, keep_dguids: set[str], dim_filters: dict[str, str | list[str]], chunksize: int = 200_000) -> pd.DataFrame:
    """Read the table zip member without extracting it; keep rows for our DGUIDs and dimension values."""
    pid = pid_of(table_id)
    info = fetch_json(f"{WDS}/getFullTableDownloadCSV/{pid}/en", max_age_days=7)
    zpath = fetch(info["object"], max_age_days=7)
    parts = []
    with zipfile.ZipFile(zpath) as zf:
        member = [n for n in zf.namelist() if n.endswith(f"{pid}.csv")][0]
        with zf.open(member) as fh:
            for ch in pd.read_csv(fh, dtype=str, chunksize=chunksize, encoding="utf-8-sig", keep_default_na=False):
                m = ch["DGUID"].isin(keep_dguids)
                for col, val in dim_filters.items():
                    vals = val if isinstance(val, list) else [val]
                    m &= ch[col].isin(vals)
                if m.any():
                    parts.append(ch[m])
    return pd.concat(parts, ignore_index=True)


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def metric_defs() -> list[dict]:
    src = lambda *t: [SRC[x] for x in t]
    d = lambda **k: {"category": "people", "geoLevel": "cma", "periodType": "census", "mapLayer": True,
                     "seasonalAdjustment": "not_applicable", **k}
    sample25 = "25% sample data (long-form census), so values carry sampling variability and random rounding"
    hh = "population in private households"
    return [
        d(id="pop_2021", label="Population, 2021 Census", shortLabel="Population 2021", unit="persons", decimals=0,
          higherIs="neutral", description="Total population counted in the 2021 Census for the place's census metropolitan area / agglomeration (or provincial part of Ottawa–Gatineau; Iqaluit is the city itself).",
          basis="100% data; total population, 2021 boundaries; counts are randomly rounded to a multiple of 5 only for small areas",
          sourceIds=src("98-10-0030-01", "98-10-0002-01"), mapLayer=False,
          comparabilityNote="Compares CMA/CA populations (not city-proper populations). Ottawa and Gatineau are the Ontario and Quebec parts of one CMA. Iqaluit is a single municipality, not a CA."),
        d(id="pop_change_2016_2021", label="Population change, 2016 to 2021", shortLabel="Pop. change 2016–21", unit="percent", decimals=1,
          higherIs="neutral", description="Percentage change in census population between the 2016 and 2021 censuses, on 2021 geographic boundaries.",
          basis="100% data; (2021 count − 2016 count on 2021 boundaries) ÷ 2016 count; computed from published counts",
          sourceIds=src("98-10-0030-01", "98-10-0002-01"),
          comparabilityNote="Census counts, not July estimates; undercoverage differs by census year."),
        d(id="pop_immigrant_share", label="Immigrants, share of population", shortLabel="Immigrant share", unit="percent", decimals=1,
          higherIs="neutral", description="Share of the population in private households who are or have ever been landed immigrants or permanent residents (immigrant status).",
          basis=f"{sample25}; universe: {hh}; non-permanent residents are in the denominator and not counted as immigrants; computed from counts",
          sourceIds=src("98-10-0308-01"), comparabilityNote="Share of the CMA/CA population, not of the city proper."),
        d(id="pop_recent_immigrant_share", label="Recent immigrants (2016 to 2021), share of population", shortLabel="Recent immigrant share", unit="percent", decimals=1,
          higherIs="neutral", description="Share of the population in private households who immigrated between 2016 and 2021 (admitted up to 11 May 2021).",
          basis=f"{sample25}; universe: {hh}; computed from counts",
          sourceIds=src("98-10-0308-01"), comparabilityNote="Immigrants who arrived in 2016–2021 and were still living there in May 2021; not admissions or intended destinations."),
        d(id="lang_french_knowledge", label="Knows French (French only or English and French)", shortLabel="Knows French", unit="percent", decimals=1,
          higherIs="neutral", description="Share of the population who can conduct a conversation in French (French only, or English and French), among all ages.",
          basis=f"{sample25}; universe: {hh}, all ages; knowledge of official languages; computed from counts",
          sourceIds=src("98-10-0175-01"), comparabilityNote="Self-reported conversational ability; includes children. Ottawa and Gatineau use provincial-part values."),
        d(id="lang_bilingual", label="Knows both English and French", shortLabel="English and French", unit="percent", decimals=1,
          higherIs="neutral", description="Share of the population who can conduct a conversation in both official languages (English-French bilingualism), among all ages.",
          basis=f"{sample25}; universe: {hh}, all ages; computed from counts",
          sourceIds=src("98-10-0175-01"), comparabilityNote="Self-reported; includes children. Ottawa and Gatineau use provincial-part values."),
        d(id="lang_nonofficial_home", label="Non-official language spoken most often at home", shortLabel="Non-official language at home", unit="percent", decimals=1,
          higherIs="neutral", description="Share of the population whose language spoken most often at home is a single non-official language (excludes multiple-language answers such as English and a non-official language).",
          basis=f"{sample25}; universe: {hh}, all ages; single-response 'Non-official language'; computed from counts",
          sourceIds=src("98-10-0227-01"), comparabilityNote="Understates use of other languages at home because multiple-language households are counted separately."),
        d(id="commute_transit_share", label="Commute mainly by public transit", shortLabel="Commute: transit", unit="percent", decimals=1,
          higherIs="neutral", description="Share of workers whose main mode of commuting is public transit (bus, subway, light rail, commuter train or ferry).",
          basis=f"{sample25}; universe: employed labour force aged 15+ with a usual place of work (excludes those working at home and with no fixed workplace); computed from counts",
          sourceIds=src("98-10-0457-01"), comparabilityNote="Census was taken in May 2021 during COVID-19 restrictions, which lowered transit use and raised work from home; compare with caution to earlier censuses."),
        d(id="commute_car_share", label="Commute mainly by car, truck or van", shortLabel="Commute: car", unit="percent", decimals=1,
          higherIs="neutral", description="Share of workers whose main mode of commuting is car, truck or van (as driver or passenger).",
          basis=f"{sample25}; universe: employed labour force aged 15+ with a usual place of work; computed from counts",
          sourceIds=src("98-10-0457-01"), comparabilityNote="May 2021 (pandemic) conditions; excludes people working at home."),
        d(id="commute_active_share", label="Commute mainly walking or cycling", shortLabel="Commute: walk/bike", unit="percent", decimals=1,
          higherIs="neutral", description="Share of workers whose main mode of commuting is active transportation (walked or bicycle).",
          basis=f"{sample25}; universe: employed labour force aged 15+ with a usual place of work; walked + bicycle; computed from counts",
          sourceIds=src("98-10-0457-01"), comparabilityNote="May 2021 (pandemic) conditions; excludes people working at home."),
        d(id="commute_45min_share", label="Commute of 45 minutes or more", shortLabel="Commute 45+ min", unit="percent", decimals=1,
          higherIs="worse", description="Share of workers whose usual one-way commuting duration is 45 minutes or more.",
          basis=f"{sample25}; universe: employed labour force aged 15+ with a usual place of work; (45–59 + 60+ minutes) ÷ total; computed from counts",
          sourceIds=src("98-10-0457-01"), comparabilityNote="Self-reported usual one-way duration, May 2021."),
        d(id="hh_avg_size", label="Average household size", shortLabel="Avg household size", unit="ratio", decimals=2,
          higherIs="neutral", description="Average number of persons per private household (population in private dwellings ÷ private dwellings occupied by usual residents), persons per household.",
          basis="100% data; computed from published counts of population in private dwellings and occupied private dwellings",
          sourceIds=src("98-10-0038-01"), comparabilityNote="Computed average (published counts); may differ in the last decimal from StatCan's own rounded average."),
    ]


def main(places: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    cma_pl = [p for p in places if p["geo"].get("cma")]
    dguid_of = {p["id"]: (p["population"]["geo"]) for p in cma_pl}   # geography the table row is for
    dguids = {g["dguid"] for g in dguid_of.values()}
    out: list[dict] = []
    ref = lambda p: dguid_of[p["id"]]

    # ---- population
    t = "98-10-0030-01"
    df = stream(t, dguids, {"Gender (3a)": "Total - Gender", "Broad age groups (5)": "Total - Age"})
    row = {r["DGUID"]: r for _, r in df.iterrows()}
    for p in places:
        if p["id"] == "iqaluit":
            continue
        r = row[ref(p)["dguid"]]
        v21, v16 = num(r["View:2021 counts[1]"]), num(r["View:2016 counts[3]"])
        out.append(obs(p["id"], "pop_2021", v21, PERIOD, ref(p), SRC[t]))
        out.append(obs(p["id"], "pop_change_2016_2021", round((v21 - v16) / v16 * 100, 3), PERIOD, ref(p), SRC[t],
                       note=f"2021 {int(v21)} vs 2016 {int(v16)} (2021 boundaries)"))
    # Iqaluit (CSD)
    t = "98-10-0002-01"
    iq = next(p for p in places if p["id"] == "iqaluit")
    g = iq["geo"]["principalCsd"]
    c2 = pd.read_csv(full_table_csv(t)[0], dtype=str, encoding="utf-8-sig", keep_default_na=False)
    r = c2[c2["DGUID"] == g["dguid"]].iloc[0]
    c21 = [c for c in c2.columns if "Population, 2021" in c][0]
    c16 = [c for c in c2.columns if "Population, 2016" in c][0]
    v21, v16 = num(r[c21]), num(r[c16])
    out.append(obs("iqaluit", "pop_2021", v21, PERIOD, g, SRC[t]))
    out.append(obs("iqaluit", "pop_change_2016_2021", round((v21 - v16) / v16 * 100, 3), PERIOD, g, SRC[t], note=f"2021 {int(v21)} vs 2016 {int(v16)}"))

    # ---- household size
    t = "98-10-0038-01"
    df = stream(t, dguids, {})
    dcol = [c for c in df.columns if c.startswith("Dwellings occupied")][0]
    vcol = [c for c in df.columns if c.startswith("Values")] or [c for c in df.columns if "VALUE" in c.upper()]
    for p in cma_pl:
        sub = df[df["DGUID"] == ref(p)["dguid"]]
        pick = lambda name: num(sub[sub[dcol] == name].iloc[0][vcol[0]]) if len(sub[sub[dcol] == name]) else None
        pop_pd, occ = pick("Population in private dwellings"), pick("Private dwellings occupied by usual residents")
        out.append(obs(p["id"], "hh_avg_size", round(pop_pd / occ, 4) if pop_pd and occ else None, PERIOD, ref(p), SRC[t],
                       note=f"{int(pop_pd)} persons in private dwellings / {int(occ)} occupied private dwellings" if pop_pd and occ else None))
    out.append(obs("iqaluit", "hh_avg_size", None, PERIOD, g, SRC[t], flags=["not_available"],
                   note="Table 98-10-0038-01 does not cover individual municipalities (CSDs) outside CMAs/CAs; not computed."))

    # ---- immigrants
    t = "98-10-0308-01"
    df = stream(t, dguids, {"Age (15C)": "Total - Age", "Gender (3)": "Total - Gender", "Statistics (3)": "Count", "Visible minority (15)": "Total - Visible minority"})
    cols = {c.split(":", 1)[1].split("[")[0]: c for c in df.columns if c.startswith("Immigrant status")}
    tot_c, imm_c, rec_c = cols["Total - Immigrant status and period of immigration"], cols["Immigrants"], cols["2016 to 2021"]
    for p in cma_pl:
        r = df[df["DGUID"] == ref(p)["dguid"]].iloc[0]
        tot, imm, rec = num(r[tot_c]), num(r[imm_c]), num(r[rec_c])
        out.append(obs(p["id"], "pop_immigrant_share", round(imm / tot * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"],
                       note=f"{int(imm)} immigrants of {int(tot)} in private households"))
        out.append(obs(p["id"], "pop_recent_immigrant_share", round(rec / tot * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"],
                       note=f"{int(rec)} immigrants who arrived 2016-2021 of {int(tot)}"))

    # ---- official languages
    t = "98-10-0175-01"
    df = stream(t, dguids, {"Gender (3)": "Total - Gender", "Age (15A)": "Total - Age", "Mother tongue (331)": "Total - Mother tongue"})
    cols = {c.split(":", 1)[1].split("[")[0]: c for c in df.columns if c.startswith("Knowledge")}
    for p in cma_pl:
        r = df[df["DGUID"] == ref(p)["dguid"]].iloc[0]
        tot = num(r[cols["Total - Knowledge of official languages"]])
        fo, bo = num(r[cols["French only"]]), num(r[cols["English and French"]])
        out.append(obs(p["id"], "lang_french_knowledge", round((fo + bo) / tot * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"],
                       note=f"French only {int(fo)} + English and French {int(bo)} of {int(tot)}"))
        out.append(obs(p["id"], "lang_bilingual", round(bo / tot * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"],
                       note=f"English and French {int(bo)} of {int(tot)}"))

    # ---- language at home
    t = "98-10-0227-01"
    df = stream(t, dguids, {"Age (13B)": "Total - Age"})
    ccount = [c for c in df.columns if c.startswith("Statistics") and "Counts" in c][0]
    for p in cma_pl:
        sub = df[df["DGUID"] == ref(p)["dguid"]]
        g_ = lambda n: num(sub[sub["Language spoken most often at home (8)"] == n].iloc[0][ccount])
        tot, na = g_("Total - Language spoken most often at home"), g_("Non-official language")
        out.append(obs(p["id"], "lang_nonofficial_home", round(na / tot * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"],
                       note=f"single non-official language {int(na)} of {int(tot)}"))

    # ---- commuting
    t = "98-10-0457-01"
    df = stream(t, dguids, {"Time leaving for work (7)": "Total - Time leaving for work", "Age (15A)": "Total - Age", "Gender (3)": "Total - Gender",
                            "Statistics (3)": "Count"})
    cols = {c.split(":", 1)[1].split("[")[0]: c for c in df.columns if c.startswith("Commuting duration")}
    tot_c = cols["Total - Commuting duration"]
    for p in cma_pl:
        sub = df[df["DGUID"] == ref(p)["dguid"]]
        mode = lambda n, col=tot_c: num(sub[sub["Main mode of commuting (21)"] == n].iloc[0][col])
        T = mode("Total - Main mode of commuting")
        tr, car, wk, bk = mode("Public transit"), mode("Car, truck or van"), mode("Walked"), mode("Bicycle")
        long_ = mode("Total - Main mode of commuting", cols["45 to 59 minutes"]) + mode("Total - Main mode of commuting", cols["60 minutes and over"])
        nt = f"of {int(T)} commuters with a usual place of work"
        out.append(obs(p["id"], "commute_transit_share", round(tr / T * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"], note=f"{int(tr)} {nt}"))
        out.append(obs(p["id"], "commute_car_share", round(car / T * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"], note=f"{int(car)} {nt}"))
        out.append(obs(p["id"], "commute_active_share", round((wk + bk) / T * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"],
                       note=f"walked {int(wk)} + bicycle {int(bk)} {nt}"))
        out.append(obs(p["id"], "commute_45min_share", round(long_ / T * 100, 3), PERIOD, ref(p), SRC[t], flags=["rounded"], note=f"{int(long_)} {nt}"))
    for m in ["pop_immigrant_share", "pop_recent_immigrant_share", "lang_french_knowledge", "lang_bilingual", "lang_nonofficial_home",
              "commute_transit_share", "commute_car_share", "commute_active_share", "commute_45min_share"]:
        out.append(obs("iqaluit", m, None, PERIOD, g, "statcan-98-10-0002-01", flags=["not_available"],
                       note="Iqaluit is a single municipality outside any CMA/CA; the CMA/CA-level census tables used here do not cover it (CSD-level tables not ingested in this version)."))

    sources = []
    notes_common = ["Census of Population 2021 (reference day 11 May 2021).",
                    "Counts from the long-form (25% sample) tables are randomly rounded (typically to a multiple of 5); percentages are computed from rounded counts."]
    titles = {
        "98-10-0030-01": ("100% data; total gender and total age rows used.", ["Used 2021 and 2016 counts; percent change computed as (2021-2016)/2016."]),
        "98-10-0002-01": ("100% data; Iqaluit CSD row.", ["Used only for Iqaluit population."]),
        "98-10-0038-01": ("100% data.", ["Average household size computed as population in private dwellings / private dwellings occupied by usual residents."]),
        "98-10-0308-01": ("25% sample; rows: total age, total gender, count, total visible minority.", ["Immigrant share = Immigrants / Total; recent = 2016 to 2021 / Total."]),
        "98-10-0175-01": ("25% sample; rows: total gender, total age, total mother tongue.", ["French knowledge = (French only + English and French) / Total; bilingual = English and French / Total."]),
        "98-10-0227-01": ("25% sample; total age; single-response non-official language.", ["Share = 'Non-official language' / Total."]),
        "98-10-0457-01": ("25% sample; total time leaving, total age, total gender, count.", ["Shares computed from main mode rows; 45+ minutes = 45 to 59 + 60 minutes and over."]),
    }
    for t, (basis, tr) in titles.items():
        rec = source_record(t, reference_period="2021 Census (May 2021)", transformations=tr, notes=[basis] + notes_common)
        sources.append(rec)
    return metric_defs(), out, sources


if __name__ == "__main__":
    places = json.loads((Path(__file__).resolve().parents[2] / "data/processed/geo/places.json").read_text())
    m, o, s = main(places)
    print(len(m), len(o), len(s))
