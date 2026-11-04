/** Place reference helpers: provinces, regions, map presets and alias-aware search. */
import type { Place, ProvinceCode, RegionCode } from '../types/contract';

export const PROVINCES: Record<ProvinceCode, { name: string; abbr: string; region: RegionCode }> = {
  BC: { name: 'British Columbia', abbr: 'B.C.', region: 'west' },
  AB: { name: 'Alberta', abbr: 'Alta.', region: 'prairies' },
  SK: { name: 'Saskatchewan', abbr: 'Sask.', region: 'prairies' },
  MB: { name: 'Manitoba', abbr: 'Man.', region: 'prairies' },
  ON: { name: 'Ontario', abbr: 'Ont.', region: 'ontario' },
  QC: { name: 'Quebec', abbr: 'Que.', region: 'quebec' },
  NB: { name: 'New Brunswick', abbr: 'N.B.', region: 'atlantic' },
  NS: { name: 'Nova Scotia', abbr: 'N.S.', region: 'atlantic' },
  PE: { name: 'Prince Edward Island', abbr: 'P.E.I.', region: 'atlantic' },
  NL: { name: 'Newfoundland and Labrador', abbr: 'N.L.', region: 'atlantic' },
  YT: { name: 'Yukon', abbr: 'Y.T.', region: 'north' },
  NT: { name: 'Northwest Territories', abbr: 'N.W.T.', region: 'north' },
  NU: { name: 'Nunavut', abbr: 'Nvt.', region: 'north' },
};
export const PROVINCE_ORDER: ProvinceCode[] = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];

export type LonLatBox = [[number, number], [number, number]];

export interface RegionDef {
  code: RegionCode;
  label: string;
  /** Longer name for titles and screen readers. */
  title: string;
  /** Map framing preset (lon/lat, west-south to east-north). */
  frame: LonLatBox;
}

export const REGIONS: RegionDef[] = [
  { code: 'west', label: 'West', title: 'British Columbia', frame: [[-136.5, 48.1], [-114.2, 57.5]] },
  { code: 'prairies', label: 'Prairies', title: 'Alberta, Saskatchewan and Manitoba', frame: [[-120.2, 48.9], [-89.0, 57.5]] },
  { code: 'ontario', label: 'Ontario', title: 'Ontario', frame: [[-93.0, 41.8], [-74.3, 50.5]] },
  { code: 'quebec', label: 'Quebec', title: 'Quebec', frame: [[-80.0, 44.9], [-60.5, 50.8]] },
  { code: 'atlantic', label: 'Atlantic', title: 'New Brunswick, Nova Scotia, Prince Edward Island, Newfoundland and Labrador', frame: [[-69.2, 43.3], [-52.4, 49.8]] },
  { code: 'north', label: 'North', title: 'Yukon, Northwest Territories and Nunavut', frame: [[-140.5, 59.0], [-62.0, 69.5]] },
];
export const REGION_BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));

/** Whole-country framing: all provinces, trimmed above ~71°N so the populated south gets the canvas. */
export const CANADA_FRAME: LonLatBox = [[-139.5, 41.7], [-52.6, 70.5]];

export const provinceName = (code: ProvinceCode | string) => PROVINCES[code as ProvinceCode]?.name ?? code;
export const provinceAbbr = (code: ProvinceCode | string) => PROVINCES[code as ProvinceCode]?.abbr ?? code;
export const regionLabel = (code: RegionCode | string) => REGION_BY_CODE.get(code as RegionCode)?.label ?? code;

/** Lowercase, strip accents and punctuation: "Montréal" -> "montreal", "St. John's" -> "st johns". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface PlaceMatch {
  place: Place;
  /** What matched: the place name, a municipality inside its CMA/CA, its stat label, or its province. */
  via: 'name' | 'alias' | 'label' | 'province';
  /** The municipality (alias) that matched, e.g. 'Mississauga'. */
  alias?: string;
  score: number;
}

function scoreText(hay: string, q: string): number {
  if (!hay) return 0;
  if (hay === q) return 100;
  if (hay.startsWith(q)) return 80;
  if (hay.split(' ').some((w) => w.startsWith(q))) return 60;
  if (hay.includes(q)) return 40;
  return 0;
}

/**
 * Search places by name, CMA/CA municipalities (aliases), stat label and province.
 * "Mississauga" -> Toronto (via alias); "quebec" -> Québec City, then Quebec places.
 */
export function searchPlaces(places: Place[], query: string, limit = 12): PlaceMatch[] {
  const q = normalize(query);
  if (!q) return [];
  const out: PlaceMatch[] = [];
  for (const place of places) {
    let best: PlaceMatch | null = null;
    const consider = (m: PlaceMatch) => {
      if (!best || m.score > best.score) best = m;
    };
    const n = scoreText(normalize(place.name), q);
    if (n) consider({ place, via: 'name', score: n + 10 });
    for (const alias of place.municipalities ?? []) {
      const a = scoreText(normalize(alias), q);
      if (a) consider({ place, via: 'alias', alias, score: a });
    }
    const l = scoreText(normalize(place.statLabel), q);
    if (l) consider({ place, via: 'label', score: l - 5 });
    const pn = PROVINCES[place.province];
    const p = Math.max(scoreText(normalize(pn?.name ?? ''), q), q.length >= 2 && normalize(place.province) === q ? 70 : 0);
    if (p) consider({ place, via: 'province', score: p - 30 });
    if (best) out.push(best);
  }
  const pop = (p: Place) => p.population?.value ?? 0;
  out.sort((a, b) => b.score - a.score || pop(b.place) - pop(a.place) || a.place.name.localeCompare(b.place.name));
  return out.slice(0, limit);
}

/** Description line for a search match, e.g. "Toronto CMA — includes Mississauga". */
export function describeMatch(m: PlaceMatch): string {
  if (m.via === 'alias' && m.alias) return `${m.place.statLabel} — includes ${m.alias}`;
  if (m.via === 'province') return `${m.place.statLabel} · ${provinceName(m.place.province)}`;
  return `${m.place.statLabel} · ${provinceName(m.place.province)}`;
}

/** Padded lon/lat frame around a set of places (for province filters and highlights). */
export function boxAround(places: Pick<Place, 'lon' | 'lat'>[], minLon = 7, minLat = 3.5): LonLatBox | null {
  if (places.length === 0) return null;
  let w = Infinity;
  let e = -Infinity;
  let s = Infinity;
  let n = -Infinity;
  for (const p of places) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  const padLon = Math.max((minLon - (e - w)) / 2, (e - w) * 0.18);
  const padLat = Math.max((minLat - (n - s)) / 2, (n - s) * 0.18);
  return [
    [w - padLon, s - padLat],
    [e + padLon, n + padLat],
  ];
}
