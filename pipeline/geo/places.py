"""Step 1: verified places.json + canada.topo.json.

Official inputs (all fetched through common.fetch, cached in data/raw/):
  * StatCan 2021 Cartographic Boundary Files via the StatCan GIS REST service
    https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer
    (layers PR 0, ER 2, CMA 6, PC 7, CSD 9). www12.statcan.gc.ca returns 403 to non-browser clients,
    so the download-file route is not used.
  * StatCan WDS tables 98-10-0003-01 (CMA/CA -> CSD hierarchy, 2021 population), 98-10-0002-01 (Iqaluit CSD),
    98-10-0030-01 (CMA/CA and CMA-part population 2021 and 2016).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pandas as pd
from pyproj import Transformer
from shapely.geometry import shape, mapping, Point
from shapely.ops import transform, unary_union
from shapely.validation import make_valid
import warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch, fetch_json, meta_for, now_iso  # noqa: E402
from common.statcan import read_table, table_url, cube_metadata, full_table_csv  # noqa: E402
from common.contract import geo, write_processed, SEED, PROCESSED  # noqa: E402

GEO_DIR = PROCESSED / "geo"
CBF = "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer"
LAYERS = {"PR": 0, "ER": 2, "CMA": 6, "PC": 7, "CSD": 9}
T_CSD_HIER = "98-10-0003-01"
T_CSD_ALL = "98-10-0002-01"
T_POP_PARTS = "98-10-0030-01"
TO3347 = Transformer.from_crs(4326, 3347, always_xy=True).transform
TO4326 = Transformer.from_crs(3347, 4326, always_xy=True).transform
PRCODE = {"10": "NL", "11": "PE", "12": "NS", "13": "NB", "24": "QC", "35": "ON", "46": "MB", "47": "SK",
          "48": "AB", "59": "BC", "60": "YT", "61": "NT", "62": "NU"}
RESERVE_TYPES = {"IRI", "IGD", "RES", "S-É", "TL", "TI", "TK", "NL", "IRI ", "R", "SC", "SNO", "Terres réservées aux Cris",
                 "TC", "TC ", "NV", "NO", "NH", "CT", "VC", "SE", "SÉ"}  # types that are not ordinary municipalities (checked below by name/type)


def layer_query(layer: str, where: str = "1=1", offset: float = 0.001, fields: str = "*") -> dict:
    p = fetch(f"{CBF}/{LAYERS[layer]}/query", params={"where": where, "outFields": fields, "outSR": 4326, "f": "geojson",
                                                      "maxAllowableOffset": offset, "returnGeometry": "true"}, suffix=".geojson")
    d = json.loads(p.read_text(encoding="utf-8"))
    if d.get("exceededTransferLimit"):
        raise RuntimeError(f"layer {layer} exceeded transfer limit for {where}")
    return d


def proj(g):
    g = transform(TO3347, g)
    if g.is_valid:
        return g
    try:
        g = make_valid(g)
    except Exception:
        return g.buffer(0)
    if g.geom_type == "GeometryCollection":
        polys = [x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
        g = unary_union(polys)
    return g


def unproj(g):
    return transform(TO4326, g)


def load_seed() -> list[dict]:
    return json.loads(SEED.read_text(encoding="utf-8"))["places"]


def csd_hierarchy() -> pd.DataFrame:
    """98-10-0003-01 is ordered: CMA/CA row (DGUID 2021S0503/0504) followed by its CSD rows (2021A0005...)."""
    d = pd.read_csv(full_table_csv(T_CSD_HIER)[0], dtype=str, encoding="utf-8-sig", keep_default_na=False)
    pop_col = [c for c in d.columns if c.startswith("Population and dwelling counts (13): Population, 2021")][0]
    rows, cur = [], None
    for _, r in d.iterrows():
        dg = r["DGUID"]
        if dg.startswith("2021S050"):
            cur = (dg, r["GEO"])
            continue
        rows.append({"cma_dguid": cur[0], "cma_name": cur[1], "csd_dguid": dg, "csd_name": r["GEO"],
                     "csduid": dg[-7:], "pop": float(r[pop_col]) if r[pop_col] not in ("", "..", "x") else None})
    return pd.DataFrame(rows)


def main() -> None:
    seed = load_seed()
    retrieved = now_iso()
    hier = csd_hierarchy()
    wide = pd.read_csv(full_table_csv("98-10-0005-01")[0], dtype=str, encoding="utf-8-sig", keep_default_na=False)
    popcol = [c for c in wide.columns if "Population, 2021" in c][0]
    cma_tab = {r["DGUID"]: (r["GEO"], int(r[popcol])) for _, r in wide.iterrows()}

    # parts + CMA populations 98-10-0030 (Total gender, total age)
    parts = pd.read_csv(full_table_csv(T_POP_PARTS)[0], dtype=str, encoding="utf-8-sig", keep_default_na=False)
    parts = parts[(parts["Gender (3a)"] == "Total - Gender") & (parts["Broad age groups (5)"] == "Total - Age")]
    ptab = {r["DGUID"]: (r["GEO"], int(r["View:2021 counts[1]"]), int(r["View:2016 counts[3]"])) for _, r in parts.iterrows()}

    cma_geo = layer_query("CMA", offset=0.002)
    cma_feats = {f["properties"]["CMAPUID"]: f for f in cma_geo["features"]}
    er_geo = layer_query("ER", offset=0.0007)
    er_shapes = [(f["properties"], proj(shape(f["geometry"]))) for f in er_geo["features"]]
    pr_names = {f["properties"]["PRUID"]: f["properties"] for f in layer_query("PR", offset=0.5)["features"]}

    # Iqaluit CSD
    all_csd = pd.read_csv(full_table_csv(T_CSD_ALL)[0], dtype=str, encoding="utf-8-sig", keep_default_na=False)
    iq = all_csd[(all_csd["GEO"] == "Iqaluit") & all_csd["DGUID"].str.startswith("2021A00056204")].iloc[0]
    iq_pop = int(iq[[c for c in all_csd.columns if "Population, 2021" in c][0]])

    places, boundary_cmas, stats = [], [], {}
    for sp in seed:
        pid = sp["id"]
        prov = sp["provinceCode"]
        if sp["cma"] is None:  # Iqaluit
            csd_filter = hier.iloc[0:0]
            csduid = iq["DGUID"][-7:]
            cma_dguid = None
        else:
            cmaid = sp["cma"]["id"]
            if sp["cmaPart"]:
                pu = sp["cmaPart"]["id"]
            else:
                pu = prov + cmaid
            f = cma_feats[pu]
            cp = f["properties"]
            assert cp["CMAUID"] == cmaid, (pid, cp)
            level = "cma" if cp["CMATYPE"] in ("B", "K") else "ca"
            wholed = f"2021S0503{cmaid}" if level == "cma" else f"2021S0504{cmaid}"
            whole_name, whole_pop = cma_tab[wholed]
            whole_name = re.sub(r"\s*\((CMA|CA)\).*$", "", whole_name)
            csd_filter = hier[hier.cma_dguid == wholed]
            if sp["cmaPart"]:
                csd_filter = csd_filter[csd_filter.csd_dguid.str[9:11] == prov]
            csd_filter = csd_filter.sort_values("pop", ascending=False)
            csduid = None

        # CSD geometries for the CMA/CA (or Iqaluit)
        uids = [csduid] if csduid else list(csd_filter.csduid)
        feats = []
        for i in range(0, len(uids), 120):
            where = "CSDUID IN (" + ",".join(f"'{u}'" for u in uids[i:i + 120]) + ")"
            feats += layer_query("CSD", where, offset=0.001)["features"]
        csd = {f["properties"]["CSDUID"]: f for f in feats}
        if csduid:
            principal_uid = csduid
            csd_pop = {csduid: iq_pop}
        else:
            ordinary = [(r.csduid, r.pop) for r in csd_filter.itertuples() if r.csduid in csd]
            principal_uid = ordinary[0][0]
            # the principal municipality is the CSD named like the place when it exists (e.g. Victoria, not larger Saanich)
            for u, _pp in ordinary:
                nm = csd[u]["properties"]["CSDNAME"]
                if nm.lower() == sp["name"].lower().replace("–", "-") or nm.lower() == sp["name"].lower():
                    principal_uid = u
                    break
            csd_pop = dict(ordinary)
        pf = csd[principal_uid]["properties"]
        pgeom = proj(shape(csd[principal_uid]["geometry"]))

        # marker: centroid of (largest population centre within principal CSD) clipped to the CSD
        if "pcs" not in stats:
            stats["pcs"] = [(shape(f_["geometry"]), f_["properties"].get("PCNAME")) for f_ in layer_query("PC", "1=1", offset=0.001)["features"]]
        best, best_a, pcname = None, 0, None
        csd4326 = shape(csd[principal_uid]["geometry"])
        for g, nm in stats["pcs"]:
            if not g.bounds[0] <= csd4326.bounds[2] or not g.bounds[2] >= csd4326.bounds[0] or not g.bounds[1] <= csd4326.bounds[3] or not g.bounds[3] >= csd4326.bounds[1]:
                continue
            if not g.intersects(csd4326):
                continue
            ig = proj(g).intersection(pgeom)
            if ig.area > best_a:
                best, best_a, pcname = ig, ig.area, nm
        if best is not None and not best.is_empty:
            c = best.centroid
            if not best.contains(c):
                c = best.representative_point()
            how = f"centroid of the part of population centre '{pcname}' inside the principal CSD"
        else:
            c = pgeom.representative_point()
            how = "representative point of the principal CSD polygon"
        lon, lat = TO4326(c.x, c.y)
        marker_note = how

        # economic regions by CSD representative points weighted by CSD population
        er_pop: dict[str, float] = {}
        er_prim = None
        for u, pop in csd_pop.items():
            g = proj(shape(csd[u]["geometry"]))
            rp = g.representative_point()
            hits = [(eg.area, ep) for ep, eg in er_shapes if eg.contains(rp)]
            if hits:
                ep = min(hits, key=lambda h: h[0])[1]  # smallest containing polygon (guards against invalid/enclosing geometry)
                er_pop[ep["ERUID"]] = er_pop.get(ep["ERUID"], 0) + (pop or 0)
                if u == principal_uid:
                    er_prim = ep["ERUID"]
        tot = sum(er_pop.values()) or 1
        if pid == "montreal": print("DEBUG", er_pop, len(csd_pop), len(csd))
        ers = [e for e in sorted(er_pop, key=lambda k: -er_pop[k]) if er_pop[e] / tot >= 0.03 or e == er_prim]
        ers = [er_prim] + [e for e in ers if e != er_prim]
        ereg = {ep["ERUID"]: ep for ep, _ in er_shapes}
        er_refs = [geo("economic_region", e, ereg[e]["ERNAME"], ereg[e]["DGUID"], "2021") for e in ers]

        prp = pr_names[prov]
        prov_ref = geo("province", prov, prp["PRENAME"], prp["DGUID"], "2021")
        pc_csd_dg = f"2021A0005{principal_uid}"
        principal = geo("csd", principal_uid, pf["CSDNAME"], pc_csd_dg, "2021")

        place = {
            "id": pid, "name": sp["name"], "statLabel": None, "province": sp["province"], "region": sp["region"],
            "lat": round(lat, 4), "lon": round(lon, 4), "tier": sp["tier"],
            "geo": {"economicRegions": er_refs, "province": prov_ref, "principalCsd": principal},
        }
        if sp["cma"] is None:
            place["statLabel"] = "Iqaluit (city)"
            place["population"] = {"value": iq_pop, "period": "2021", "geo": principal, "sourceId": f"statcan-{T_CSD_ALL}"}
            popsrc = f"statcan-{T_CSD_ALL}"
        else:
            disp = whole_name.split(" / ")[0].replace(" - ", "–")
            cma_ref = geo(level, cmaid, whole_name, wholed, "2021")
            place["geo"]["cma"] = cma_ref
            if sp["cmaPart"]:
                pdg = f"2021S0505{pu}"
                pname, ppop, p16 = ptab[pdg]
                pname = re.sub(r"\s*\(CMA\).*$", "", pname)
                part_ref = geo("cma_part", pu, pname, pdg, "2021")
                place["geo"]["cmaPart"] = part_ref
                place["statLabel"] = f"{disp} CMA ({'Ontario' if prov == '35' else 'Quebec'} part)"
                place["population"] = {"value": ppop, "period": "2021", "geo": part_ref, "sourceId": f"statcan-{T_POP_PARTS}"}
            else:
                place["statLabel"] = f"{disp} {level.upper()}"
                place["population"] = {"value": whole_pop, "period": "2021", "geo": cma_ref, "sourceId": "statcan-98-10-0005-01"}
            # top-10 municipalities: ordinary CSDs by population
            top = []
            for r in csd_filter.itertuples():
                t = csd[r.csduid]["properties"]["CSDTYPE"] if r.csduid in csd else None
                if t in ("IRI", "S-É", "RA", "TR", "R", "IGD", "TC", "NV", "NO", "TI", "TK", "TL", "NL", "SNO", "IRI", "RIV"):
                    continue
                if r.csd_name in top:
                    continue
                top.append(r.csd_name)
                if len(top) == 10:
                    break
            place["municipalities"] = top
            stats.setdefault("csdtypes", {})[pid] = sorted({v["properties"]["CSDTYPE"] for v in csd.values()})
            boundary_cmas.append((pid, cmaid, pu, level if not sp["cmaPart"] else "cma_part", cp["CMANAME"], f["geometry"], cp))
        place["_marker_method"] = marker_note
        places.append(place)

    # Iqaluit CSD polygon for map (level csd)
    iqf = layer_query("CSD", f"CSDUID='{iq['DGUID'][-7:]}'", offset=0.0005)["features"][0]
    boundary_cmas.append(("iqaluit", iq["DGUID"][-7:], iq["DGUID"][-7:], "csd", "Iqaluit", iqf["geometry"], iqf["properties"]))

    # ---- write geometry inputs for mapshaper
    tmp = Path(fetch.__globals__["RAW"]) / "geo_work"
    tmp.mkdir(parents=True, exist_ok=True)
    cm = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": g, "properties": {"placeId": pid, "cmaId": cid, "name": nm, "level": lv}}
        for pid, cid, pu, lv, nm, g, _ in boundary_cmas]}
    (tmp / "cmas.geojson").write_text(json.dumps(cm))
    prg = layer_query("PR", offset=0.01)
    pr = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": f["geometry"],
         "properties": {"code": PRCODE[f["properties"]["PRUID"]], "pruid": f["properties"]["PRUID"], "name": f["properties"]["PRENAME"]}}
        for f in prg["features"]]}
    (tmp / "provinces.geojson").write_text(json.dumps(pr))
    out = GEO_DIR / "canada.topo.json"
    GEO_DIR.mkdir(parents=True, exist_ok=True)
    npx = ["npx", "--no-install", "mapshaper"]
    subprocess.run(npx + ["-i", str(tmp / "provinces.geojson"), "-simplify", "7%", "weighted", "keep-shapes",
                          "-o", str(tmp / "prov_s.json"), "format=geojson"], check=True, cwd=ROOT_DIR)
    subprocess.run(npx + ["-i", str(tmp / "cmas.geojson"), "-simplify", "30%", "weighted", "keep-shapes",
                          "-o", str(tmp / "cmas_s.json"), "format=geojson"], check=True, cwd=ROOT_DIR)
    subprocess.run(npx + ["-i", str(tmp / "prov_s.json"), str(tmp / "cmas_s.json"), "combine-files", "-rename-layers", "provinces,cmas",
                          "-o", str(out), "format=topojson", "quantization=100000", "force"], check=True, cwd=ROOT_DIR)

    for p in places:
        p.pop("_marker_method", None)
    methods = {p["id"]: None for p in places}
    write_processed("geo", "places", places, check=False)
    print("places", len(places), "topo bytes", out.stat().st_size)
    json.dump({"retrievedAt": retrieved}, open(tmp / "places_run.json", "w"))


ROOT_DIR = Path(__file__).resolve().parents[2]

if __name__ == "__main__":
    main()
