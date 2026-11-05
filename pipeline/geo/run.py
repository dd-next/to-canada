"""Rebuild all geography / everyday-life outputs: python3 -I pipeline/geo/run.py [--skip-places | --pop-only]

Steps: places.json + canada.topo.json -> Census 2021 metrics -> July 1 population estimates (popest) -> climate normals -> insights -> sources/metrics/observations/series.
Downloads go through common.fetch (cached in data/raw/); delete the cache or set NORTHWARD_REFRESH=1 to refresh.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.contract import write_processed, PROCESSED  # noqa: E402
from common.fetch import now_iso  # noqa: E402
from common.statcan import source_record  # noqa: E402

import places as places_step  # noqa: E402
import census  # noqa: E402
import popest  # noqa: E402
import climate  # noqa: E402
import insights  # noqa: E402

CBF_SRC = {
    "id": "statcan-cbf-2021",
    "title": "2021 Census Cartographic Boundary Files (provinces/territories, economic regions, CMAs/CAs, census subdivisions, population centres)",
    "publisher": "Statistics Canada", "tableId": "92-160-X (2021 Census boundary files)",
    "url": "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21",
    "downloadUrl": "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer",
    "referencePeriod": "2021 Census geography", "licence": "Statistics Canada Open Licence",
    "attribution": "Source: Statistics Canada, 2021 Census Boundary files. Reproduced and distributed on an 'as is' basis with the permission of Statistics Canada.",
    "transformations": [
        "Read through the official StatCan GIS REST service (layers PR, ER, CMA, PC, CSD) as GeoJSON in WGS84 because the www12.statcan.gc.ca file downloads answer 403 to non-browser clients.",
        "Provinces/territories queried one by one with identical minimal server generalization (0.0005 deg); simplified with mapshaper (topology-aware, weighted Visvalingam, keep-shapes), snapped, and densified to 0.25 deg so parallels curve under conic projection.",
        "CMA/CA polygons for the place CMAs/CAs (Ottawa-Gatineau as its two provincial parts; Iqaluit as its CSD) simplified separately.",
        "Economic regions overlapping each CMA/CA: each CSD in the CMA/CA assigned to the ER containing its representative point; ERs holding >= 3% of the CMA/CA population (by CSD population) are listed, the ER of the principal CSD first.",
        "Marker: centroid (EPSG:3347) of the part of the largest population centre inside the principal CSD (representative point of the CSD if none)."],
    "notes": ["Cartographic (shoreline-clipped) boundaries are generalized for display; not for area measurement."],
    "status": "ok"}


def pop_only() -> None:
    """Refresh only the July 1 population estimates (pop_estimate + its source); geometry, census and climate stay as written."""
    places = json.loads((PROCESSED / "geo" / "places.json").read_text(encoding="utf-8"))
    p_metrics, p_obs, p_sources = popest.main(places)
    ids = {m["id"] for m in p_metrics}
    src_ids = {x["id"] for x in p_sources}
    for name, new, key in (("metrics", p_metrics, "id"), ("observations", p_obs, "metricId"), ("sources", p_sources, "id")):
        cur = json.loads((PROCESSED / "geo" / f"{name}.json").read_text(encoding="utf-8"))
        cur = [r for r in cur if r[key] not in (ids if name != "sources" else src_ids)]
        write_processed("geo", name, cur + new)
    print("geo population estimates refreshed:", len(p_obs), "observations")


def main() -> None:
    if "--pop-only" in sys.argv:
        return pop_only()
    if "--skip-places" not in sys.argv or not (PROCESSED / "geo" / "places.json").exists():
        places_step.main()
    places = json.loads((PROCESSED / "geo" / "places.json").read_text(encoding="utf-8"))
    for p in places:
        p.pop("climateStation", None)
    c_metrics, c_obs, c_sources = census.main(places)
    p_metrics, p_obs, p_sources = popest.main(places)   # latest July 1 estimates; no geometry refetch
    k_metrics, k_obs, k_series, stations, k_sources, gaps = climate.main(places)
    for p in places:
        if p["id"] in stations:
            p["climateStation"] = stations[p["id"]]
    write_processed("geo", "places", places, check=False)

    cbf = {**CBF_SRC, "retrievedAt": now_iso()}
    hier = source_record("98-10-0003-01", reference_period="2021 Census",
                         transformations=["CMA/CA -> CSD hierarchy and 2021 CSD populations; used to list the ten largest municipalities and to weight economic regions."])
    sources = [cbf, hier] + c_sources + p_sources + k_sources
    metrics = c_metrics + p_metrics + k_metrics
    observations = c_obs + p_obs + k_obs
    write_processed("geo", "sources", sources)
    write_processed("geo", "metrics", metrics)
    write_processed("geo", "observations", observations)
    write_processed("geo", "series", k_series)
    ins = insights.main(places, observations, k_series)
    write_processed("geo", "insights", ins)
    print("geo outputs written:", len(places), "places,", len(observations), "observations,", len(k_series), "series,", len(ins), "insights; climate gaps:", gaps)


if __name__ == "__main__":
    main()
