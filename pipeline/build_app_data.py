"""Merge data/processed/<domain>/ outputs into the app snapshot in public/data/.

Usage (from repo root):  python3 -I pipeline/build_app_data.py

Validates the shared contract on the way: every observation must reference a
known place, metric and source; units/flags must be known; duplicate keys are
errors. Missing values stay null. Nothing here invents or fills data.
"""
from __future__ import annotations

import json
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.contract import FLAGS, PROCESSED, ROOT, UNITS, load_places  # noqa: E402

OUT = ROOT / "public" / "data"
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


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    files: dict = {}
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    # ---------------------------------------------------------------- places
    places = read("geo", "places")
    if places is None:
        print("ERROR: data/processed/geo/places.json missing (geography workstream output).")
        return 1
    place_ids = {p["id"] for p in places}
    seed_ids = {p["id"] for p in load_places()} if (PROCESSED / "geo" / "places.json").exists() else place_ids
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
    if topo.exists():
        (OUT / "geo").mkdir(parents=True, exist_ok=True)
        shutil.copy(topo, OUT / "geo" / "canada.topo.json")
        files["geo/canada.topo.json"] = {"bytes": topo.stat().st_size, "records": 1}
    else:
        errors.append("geo/canada.topo.json missing")

    # ---------------------------------------------------------------- core files + manifest
    dump("places.json", places, files)
    dump("metrics.json", list(metrics.values()), files)
    dump("observations.json", observations, files)
    dump("sources.json", sorted(sources.values(), key=lambda s: s["id"]), files)

    cov = []
    by_place = defaultdict(set)
    for o in observations:
        if o.get("value") is not None:
            by_place[o["placeId"]].add(o["metricId"])
    for p in places:
        cov.append({"placeId": p["id"], "metrics": len(by_place[p["id"]]), "core": p.get("tier") == "core"})
    manifest = {"product": PRODUCT, "builtAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                "files": files, "coverage": cov}
    dump("manifest.json", manifest, files)

    for w in warnings:
        print("WARN ", w)
    for e in errors[:50]:
        print("ERROR", e)
    total = sum(f["bytes"] for f in files.values())
    print(f"public/data: {len(files)} files, {total/1024:.0f} KiB; places={len(places)} metrics={len(metrics)} "
          f"observations={len(observations)} sources={len(sources)} insights={len(insights)}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
