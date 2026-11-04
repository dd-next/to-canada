/**
 * Geometry + projection helpers for the Canada map.
 * Projection: Statistics Canada Lambert conformal conic (standard parallels 49°N
 * and 77°N, central meridian 91°52′W), fitted to a whole-country frame.
 */
import type { FeatureCollection, Geometry, MultiLineString, MultiPoint } from 'geojson';
import { geoConicConformal, geoGraticule, geoPath, type GeoProjection } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { useMemo } from 'react';
import { useJSON } from '../../data/useJSON';
import type { LonLatBox } from '../../lib/places';

export interface ProvinceProps {
  code?: string;
  pruid?: string;
  name?: string;
}
export interface CmaProps {
  placeId?: string;
  cmaId?: string;
  name?: string;
  level?: string;
}

export interface CanadaGeo {
  provinces: FeatureCollection<Geometry, ProvinceProps>;
  /** Shared province/territory borders. Empty when the file has a single national feature. */
  interior: MultiLineString | null;
  /** Coastline + international border. */
  outline: MultiLineString;
  cmas: FeatureCollection<Geometry, CmaProps> | null;
}

export const GEO_PATH = 'geo/canada.topo.json';

/** Convert the TopoJSON (object `provinces`, optional `cmas`) into GeoJSON layers. */
export function toCanadaGeo(topo: Topology): CanadaGeo | null {
  const provObj = topo.objects?.provinces as GeometryCollection<ProvinceProps> | undefined;
  if (!provObj) return null;
  const provinces = feature(topo, provObj) as FeatureCollection<Geometry, ProvinceProps>;
  const interiorMesh = provObj.geometries.length > 1 ? mesh(topo, provObj, (a, b) => a !== b) : null;
  const outline = mesh(topo, provObj, (a, b) => a === b);
  const cmaObj = topo.objects?.cmas as GeometryCollection<CmaProps> | undefined;
  const cmas = cmaObj && cmaObj.geometries.length ? (feature(topo, cmaObj) as FeatureCollection<Geometry, CmaProps>) : null;
  return { provinces, interior: interiorMesh && interiorMesh.coordinates.length ? interiorMesh : null, outline, cmas };
}

/** Load + convert the map geometry once (cached by loadJSON). */
export function useCanadaGeo(): { geo: CanadaGeo | null; loading: boolean; error?: Error } {
  const topo = useJSON<Topology>(GEO_PATH);
  const geo = useMemo(() => (topo.data ? toCanadaGeo(topo.data) : null), [topo.data]);
  return { geo, loading: topo.loading, error: topo.error ?? (topo.data && !geo ? new Error('Map file has no `provinces` object') : undefined) };
}

/** A lon/lat box as a densified MultiPoint (fits correctly under the conic projection). */
export function boxGeometry([[w, s], [e, n]]: LonLatBox): MultiPoint {
  const pts: [number, number][] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const lon = w + ((e - w) * i) / steps;
    pts.push([lon, s], [lon, n]);
  }
  for (let i = 0; i <= steps; i++) {
    const lat = s + ((n - s) * i) / steps;
    pts.push([w, lat], [e, lat]);
  }
  return { type: 'MultiPoint', coordinates: pts };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const noInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** StatCan Lambert fitted so `frame` fills the drawable area. */
export function makeProjection(width: number, height: number, frame: LonLatBox, pad: Insets): GeoProjection {
  const p = geoConicConformal().parallels([49, 77]).rotate([91.8667, 0]);
  const x0 = pad.left;
  const y0 = pad.top;
  const x1 = Math.max(x0 + 10, width - pad.right);
  const y1 = Math.max(y0 + 10, height - pad.bottom);
  p.fitExtent(
    [
      [x0, y0],
      [x1, y1],
    ],
    boxGeometry(frame),
  );
  return p;
}

/** Zoom transform that frames a lon/lat box inside the visible part of the viewport. */
export function frameTransform(
  projection: GeoProjection,
  box: LonLatBox,
  width: number,
  height: number,
  visible: Insets,
  scaleExtent: [number, number],
  /** Share of the visible area the box should fill. */
  fill = 0.94,
): ZoomTransform {
  const b = geoPath(projection).bounds(boxGeometry(box));
  const [[bx0, by0], [bx1, by1]] = b;
  const vw = Math.max(40, width - visible.left - visible.right);
  const vh = Math.max(40, height - visible.top - visible.bottom);
  const k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], fill * Math.min(vw / (bx1 - bx0), vh / (by1 - by0))));
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const tx = visible.left + vw / 2 - k * cx;
  const ty = visible.top + vh / 2 - k * cy;
  return zoomIdentity.translate(tx, ty).scale(k);
}

/** Faint graticule (10° meridians, 5° parallels) over the Canada extent. */
export const graticule = geoGraticule()
  .extent([
    [-150, 38],
    [-45, 86],
  ])
  .step([10, 5])();
