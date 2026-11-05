"""Merge data/processed/<domain>/ outputs into the app snapshot in public/data/.

Usage (from repo root):  python3 -I pipeline/build_app_data.py

Validates the shared contract on the way: every observation must reference a
known place, metric and source; units/flags must be known; duplicate keys are
errors. Missing values stay null. Nothing here invents or fills data.
"""
from __future__ import annotations

import json
import fcntl
import os
import tempfile
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.contract import FLAGS, PROCESSED, ROOT, UNITS, load_places  # noqa: E402

OUT = Path(os.environ.get("NORTHWARD_APP_DATA", ROOT / "public" / "data"))
DOMAINS = ["geo", "housing", "work", "immigration", "cost"]
PRODUCT = "Northward"


def read(domain: str, name: str, default=None):
    p = PROCESSED / domain / f"{name}.json"
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def dump(rel: str, data, files: dict, records: int | None = None) -> None:
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    p.write_text(text, encoding="utf-8")
    files[rel] = {"bytes": len(text.encode()), "records": records if records is not None else (len(data) if isinstance(data, (list, dict)) else 1)}


def provisional_places() -> list[dict]:
    """Development-only stand-in for the verified places file (approximate coordinates)."""
    out = []
    for p in load_places():
        cma = p.get("cma")
        level = (cma or {}).get("level", "csd")
        stat = f"{p['name']} {'CMA' if level == 'cma' else 'CA'}" if cma else f"{p['name']} (city)"
        if p.get("cmaPart"):
            stat = f"Ottawa–Gatineau CMA ({'Ontario' if p['province'] == 'ON' else 'Quebec'} part)"
        geo = {"economicRegions": p["economicRegions"],
               "province": {"level": "province", "id": p["provinceCode"], "name": p["provinceName"]}}
        if cma:
            geo["cma"] = cma
        if p.get("cmaPart"):
            geo["cmaPart"] = p["cmaPart"]
        out.append({"id": p["id"], "name": p["name"], "statLabel": stat, "province": p["province"],
                    "region": p["region"], "lat": p["approxLat"], "lon": p["approxLon"], "tier": p["tier"],
                    "geo": geo, "municipalities": p.get("municipalities", [])})
    return out


def build() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    files: dict = {}
    # Build into a staging directory; publish only after all validation succeeds.
    OUT.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------- places
    places = read("geo", "places")
    provisional = False
    if places is None:
        if "--provisional" not in sys.argv:
            print("ERROR: data/processed/geo/places.json missing (geography workstream output). "
                  "Use --provisional for a development build from the seed.")
            return 1
        provisional = True
        places = provisional_places()
        warnings.append("PROVISIONAL BUILD: places from pipeline/places_seed.json with approximate coordinates; "
                        "dev outline geometry. Do not ship.")
    place_ids = {p["id"] for p in places}
    seed_ids = {p["id"] for p in json.loads((ROOT / "pipeline" / "places_seed.json").read_text(encoding="utf-8"))["places"]}
    if seed_ids - place_ids:
        warnings.append(f"places in seed but not in verified places: {sorted(seed_ids - place_ids)}")

    # ---------------------------------------------------------------- sources
    sources: dict[str, dict] = {}
    for d in DOMAINS:
        for s in read(d, "sources", []) or []:
            prev = sources.get(s["id"])
            if prev is None or (s.get("retrievedAt") or "") > (prev.get("retrievedAt") or ""):
                sources[s["id"]] = s

    # ---------------------------------------------------------------- metrics
    metrics: dict[str, dict] = {}
    for d in DOMAINS:
        for m in read(d, "metrics", []) or []:
            if m["id"] in metrics and metrics[m["id"]] != m:
                errors.append(f"metric {m['id']} defined differently by two domains")
            if m.get("unit") not in UNITS:
                errors.append(f"metric {m['id']} unknown unit {m.get('unit')}")
            for sid in m.get("sourceIds", []):
                if sid not in sources:
                    errors.append(f"metric {m['id']} cites unknown source {sid}")
            metrics[m["id"]] = m

    # ---------------------------------------------------------------- observations
    observations: list[dict] = []
    keys = Counter()
    for d in DOMAINS:
        for o in read(d, "observations", []) or []:
            k = (o["placeId"], o["metricId"], o["period"])
            keys[k] += 1
            if o["placeId"] not in place_ids:
                errors.append(f"observation for unknown place {o['placeId']} ({o['metricId']})")
                continue
            if o["metricId"] not in metrics:
                errors.append(f"observation for unknown metric {o['metricId']}")
                continue
            if o["sourceId"] not in sources:
                errors.append(f"observation {k} cites unknown source {o['sourceId']}")
            for f in o.get("flags", []):
                if f not in FLAGS:
                    errors.append(f"observation {k} unknown flag {f}")
            v = o.get("value")
            if v is not None and not isinstance(v, (int, float)):
                errors.append(f"observation {k} non-numeric value {v!r}")
            observations.append(o)
    errors += [f"duplicate observation {k}" for k, n in keys.items() if n > 1]

    # ---------------------------------------------------------------- headline population
    # Latest official July 1 estimate (StatCan 17-10-0148-01) replaces the 2021 Census count as the headline
    # population; the census count stays available as metric pop_2021. Places without an estimate keep the census value.
    est = {o["placeId"]: o for o in observations if o["metricId"] == "pop_estimate" and o.get("value") is not None}
    for p in places:
        o = est.get(p["id"])
        if o:
            p["population"] = {"value": o["value"], "period": f"{o['period']}-07-01" if len(o["period"]) == 4 else o["period"],
                               "geo": o["geo"], "sourceId": o["sourceId"]}

    # ---------------------------------------------------------------- derived monthly climate layers
    # Monthly 1991-2020 normals arrive as per-place Series (t='01'..'12'). The map's month selector
    # needs one metric per month, so derive them here 1:1 from the series values (no modelling).
    MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
              "October", "November", "December"]
    MONTHLY = {"temp_mean": ("clim_m_temp_mean", "Mean daily temperature", "Mean temp", "degC", 1,
                             "Average of daily mean temperatures for the month, 1991-2020 climate normals at the place's reference station."),
               "precip": ("clim_m_precip", "Total precipitation", "Precipitation", "mm", 0,
                          "Average total precipitation (rain + snow water equivalent) for the month, 1991-2020 climate normals at the place's reference station.")}
    geo_series = read("geo", "series", []) or []
    derived_m, derived_o = {}, []
    for srs in geo_series:
        el = (srs.get("dims") or {}).get("element")
        if el not in MONTHLY or not srs.get("placeId") or srs["placeId"] not in place_ids:
            continue
        fam, label, short, unit, dec, desc = MONTHLY[el]
        code = (srs.get("dims") or {}).get("normalsCode", "")
        for pt in srs.get("points", []):
            mm = str(pt["t"]).zfill(2)
            if not mm.isdigit() or not 1 <= int(mm) <= 12:
                continue
            mid = f"{fam}_{mm}"
            derived_m.setdefault(mid, {
                "id": mid, "label": f"{label}, {MONTHS[int(mm) - 1]} (1991–2020 normals)",
                "shortLabel": f"{short}, {MONTHS[int(mm) - 1][:3]}", "category": "climate", "unit": unit,
                "decimals": dec, "higherIs": "neutral", "description": desc, "basis": "station climate normals",
                "geoLevel": "station", "periodType": "normals", "sourceIds": [srs["sourceId"]], "mapLayer": True,
                "dims": {"family": fam, "month": mm},
                "comparabilityNote": "Station proxy for the place; stations differ in elevation and distance from the city centre."})
            flags = ["station_proxy"] + ([] if code in ("A", "B", "C", "D", "") else ["use_with_caution"])
            v = pt.get("v")
            derived_o.append({"placeId": srs["placeId"], "metricId": mid, "value": v, "period": "1991-2020",
                              "geo": srs["geo"], "sourceId": srs["sourceId"],
                              "flags": sorted(set(flags + ([] if v is not None else ["not_available"])))})
    for mid, m in derived_m.items():
        if mid in metrics:
            errors.append(f"derived monthly metric {mid} collides with a domain metric")
        metrics[mid] = m
    observations += derived_o

    # ---------------------------------------------------------------- series (split per place)
    per_place: dict[str, list] = defaultdict(list)
    for d in DOMAINS:
        for s in read(d, "series", []) or []:
            if s.get("unit") not in UNITS:
                errors.append(f"series {s.get('id')} unknown unit {s.get('unit')}")
            if s.get("sourceId") not in sources:
                errors.append(f"series {s.get('id')} cites unknown source {s.get('sourceId')}")
            per_place[s.get("placeId") or "_national"].append(s)
    for pid, arr in per_place.items():
        if pid != "_national" and pid not in place_ids:
            errors.append(f"series for unknown place {pid}")
            continue
        dump(f"series/{pid}.json", arr, files)

    # ---------------------------------------------------------------- insights
    insights = []
    for d in DOMAINS:
        insights += read(d, "insights", []) or []
    index = []
    for ins in insights:
        for f in ins.get("findings", []):
            for sid in f.get("sourceIds", []):
                if sid not in sources:
                    errors.append(f"insight {ins['id']} finding {f['id']} cites unknown source {sid}")
            bad = [p for p in f.get("placeIds", []) if p not in place_ids]
            if bad:
                errors.append(f"insight {ins['id']} finding {f['id']} unknown places {bad}")
        dump(f"insights/{ins['id']}.json", ins, files, records=len(ins.get("findings", [])))
        lead = (ins.get("findings") or [{}])[0]
        index.append({k: ins.get(k) for k in ("id", "topic", "title", "question", "dek", "relatedPlaceIds", "sourceIds")}
                     | {"leadStat": lead.get("stat"), "leadHeadline": lead.get("headline")})
    dump("insights/index.json", index, files)

    # ---------------------------------------------------------------- domain extras
    occ = read("work", "occupations")
    if occ is not None:
        dump("occupations.json", occ, files)
    wages = read("work", "wages")
    if wages is not None:
        dump("wages.json", wages, files, records=len(wages.get("byNoc", {})))
    job_search = read("work", "job_search")
    if job_search is not None:
        dump("job_search.json", job_search, files, records=len(job_search.get("boards", [])))
    programs = read("immigration", "programs")
    if programs is not None:
        dump("programs.json", programs, files)
        for pr in programs:
            bad = [p for p in pr.get("placeIds", []) or [] if p not in place_ids]
            if bad:
                errors.append(f"program {pr['id']} unknown places {bad}")
    topo = PROCESSED / "geo" / "canada.topo.json"
    if not topo.exists() and provisional:
        topo = ROOT / "dev" / "fixtures" / "geo" / "canada.topo.json"
    if topo.exists():
        (OUT / "geo").mkdir(parents=True, exist_ok=True)
        shutil.copy(topo, OUT / "geo" / "canada.topo.json")
        files["geo/canada.topo.json"] = {"bytes": topo.stat().st_size, "records": 1}
    else:
        errors.append("geo/canada.topo.json missing")

    # ---------------------------------------------------------------- program tags on places
    # Community pilots name specific places (verified program records); AIP covers the four
    # Atlantic provinces and Quebec runs its own selection system (both jurisdiction facts).
    tags: dict[str, set] = {p["id"]: set() for p in places}
    for pr in programs or []:
        for pid in pr.get("placeIds") or []:
            if pid in tags and pr.get("category") == "community_pilot":
                tags[pid].add(pr["id"].split("-")[0])
    for p in places:
        if p["province"] in ("NB", "NS", "PE", "NL"):
            tags[p["id"]].add("aip")
        if p["province"] == "QC":
            tags[p["id"]].add("quebec")
        if tags[p["id"]]:
            p["programTags"] = sorted(tags[p["id"]])

    for name in ("freshness", "refresh-status"):
        path = PROCESSED / f"{name}.json"
        if path.exists():
            dump("freshness-checks.json" if name == "freshness" else f"{name}.json", json.loads(path.read_text()), files)

    # ---------------------------------------------------------------- core files + manifest
    dump("places.json", places, files)
    dump("metrics.json", list(metrics.values()), files)
    dump("observations.json", observations, files)
    dump("sources.json", sorted(sources.values(), key=lambda s: s["id"]), files)

    # ---------------------------------------------------------------- data freshness (shown in the footer and on Sources)
    def latest_obs_period(sids: list[str], prefix: str | None = None) -> str | None:
        ps = [o["period"] for o in observations if o["sourceId"] in sids and o.get("value") is not None
              and (prefix is None or o["metricId"].startswith(prefix))]
        ps += [pt["t"] for arr in per_place.values() for sr in arr if sr.get("sourceId") in sids for pt in sr.get("points", [])
               if isinstance(pt.get("t"), str) and re.fullmatch(r"\d{4}(-\d{2}|-Q\d)?", pt["t"])]
        return max(ps) if ps else None

    def ref_end_month(sid: str) -> str | None:
        m = re.search(r"to ([A-Z][a-z]+) (\d{4})", sources.get(sid, {}).get("referencePeriod") or "")
        return f"{m.group(2)}-{MONTH_NUM[m.group(1)[:3]]}" if m and m.group(1)[:3] in MONTH_NUM else None

    MONTH_NUM = {n: f"{i + 1:02d}" for i, n in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}
    pe = latest_obs_period(["statcan-17-10-0148-01"], "pop_estimate")
    cmhc_sids = sorted(s for s in sources if s.startswith("cmhc-rms-"))
    wage_sids = sorted(s for s in sources if s.startswith("jobbank-wages-"))
    FAMILIES = [  # id, label, short label, source ids (first is primary), latest period, periodType
        ("asking-rents", "Asking rents (StatCan, quarterly)", "rents", ["statcan-46-10-0092-01"], latest_obs_period(["statcan-46-10-0092-01"]), None),
        ("cmhc-rents", "CMHC rents and vacancy (October survey)", "CMHC", cmhc_sids, latest_obs_period(cmhc_sids), None),
        ("lfs", "Labour Force Survey (3-month average)", "LFS", ["statcan-14-10-0459-01", "statcan-14-10-0292-01", "statcan-14-10-0462-01"],
         latest_obs_period(["statcan-14-10-0459-01", "statcan-14-10-0292-01", "statcan-14-10-0462-01"]), None),
        ("cpi", "Consumer Price Index", "CPI", ["statcan-18-10-0004-01"], latest_obs_period(["statcan-18-10-0004-01"]), None),
        ("jobbank-wages", "Job Bank wages (annual edition)", "wages", wage_sids,
         (wages or {}).get("edition", (wages or {}).get("referencePeriod")), None),
        ("ircc-admissions", "IRCC permanent-resident admissions (monthly update)", "IRCC", ["ircc-pr-cma"], ref_end_month("ircc-pr-cma"), None),
        ("mbm", "Market Basket Measure thresholds", "MBM", ["statcan-11-10-0066-01"], latest_obs_period(["statcan-11-10-0066-01"]), None),
        ("population-estimates", "Population estimates (July 1)", "population", ["statcan-17-10-0148-01"], f"{pe}-07-01" if pe and len(pe) == 4 else pe, None),
        ("census-2021", "Census of Population 2021", "census", ["statcan-98-10-0005-01"], "2021", "census"),
        ("climate-normals", "Climate normals", "climate", ["eccc-climate-normals-1991-2020"], "1991-2020", "normals"),
    ]
    freshness = []
    for fid, label, short, sids, period, ptype in FAMILIES:
        recs = [sources[x] for x in sids if x in sources]
        if not recs or not period:
            warnings.append(f"freshness family {fid}: no source/period found; omitted")
            continue
        entry = {"id": fid, "label": label, "short": short, "latestPeriod": period,
                 "releaseDate": max((r.get("releaseDate") or "" for r in recs), default="") or None,
                 "retrievedAt": max((r.get("retrievedAt") or "" for r in recs), default="") or None, "sourceId": sids[0]}
        if ptype:
            entry["periodType"] = ptype
        freshness.append(entry)

    cov = []
    by_place = defaultdict(set)
    for o in observations:
        if o.get("value") is not None:
            by_place[o["placeId"]].add(o["metricId"])
    for p in places:
        cov.append({"placeId": p["id"], "metrics": len(by_place[p["id"]]), "core": p.get("tier") == "core"})
    manifest = {"product": PRODUCT, "provisional": provisional, "builtAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                "files": files, "coverage": cov, "freshness": freshness}
    dump("manifest.json", manifest, files)

    for f in sorted(OUT.rglob("*")):
        if f.is_file() and f.relative_to(OUT).as_posix() not in files and f.name not in ("updates.json", "freshness-checks.json", "refresh-status.json"):
            f.unlink()
    for d in sorted((d for d in OUT.rglob("*") if d.is_dir()), key=lambda d: len(d.parts), reverse=True):
        if not any(d.iterdir()):
            d.rmdir()

    for w in warnings:
        print("WARN ", w)
    for e in errors[:50]:
        print("ERROR", e)
    total = sum(f["bytes"] for f in files.values())
    print(f"public/data: {len(files)} files, {total/1024:.0f} KiB; places={len(places)} metrics={len(metrics)} "
          f"observations={len(observations)} sources={len(sources)} insights={len(insights)}")
    return 1 if errors else 0


def main() -> int:
    global OUT
    target = OUT
    lock = None
    if os.environ.get("NORTHWARD_PUBLICATION_LOCK_HELD") != "1":
        lock_path = ROOT / "data" / "raw" / ".publication.lock"
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock = lock_path.open("w")
        fcntl.flock(lock, fcntl.LOCK_EX)
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".app-stage-", dir=target.parent))
    try:
        for name in ("updates.json", "freshness-checks.json", "refresh-status.json"):
            if (target / name).exists():
                shutil.copy2(target / name, stage / name)
        OUT = stage
        code = build()
        if code:
            return code
        if (target / "updates.json").exists():
            shutil.copy2(target / "updates.json", stage / "updates.json")
        if target.exists():
            from refresh import exchange
            exchange(stage, target)
        else:
            stage.rename(target)
        return 0
    finally:
        OUT = target
        shutil.rmtree(stage, ignore_errors=True)
        if lock is not None:
            lock.close()


if __name__ == "__main__":
    raise SystemExit(main())
