/** Data helpers for the place profile: metric lookup, comparable ranks, series → chart specs, wage rows. */
import type { ChartSeries, ChartSpec, Flag, MetricDef, Observation, Place, Series, WageTable } from '../../types/contract';
import type { CoreData } from '../../data/core';
import { cleanGeoName, formatPeriod, ordinal } from '../../lib/format';
import { defaultAscending, lookupWage, monthIndex, monthSlug, unitTypeSlug, UNIT_TYPE_ORDER, type LayerCatalog, type WageCell } from '../../lib/layers';
import { serializeParams } from '../../lib/state';
import { provinceName } from '../../lib/places';
import { isMonthToken } from '../../charts/axes';

/** Display name for a geography: StatCan separators as dashes, bilingual names shortened to English. */
export const geoName = (name: string) => cleanGeoName(name).split(' / ')[0];

export const hasValue = (o: Observation | null | undefined): o is Observation & { value: number } =>
  !!o && o.value !== null && Number.isFinite(o.value) && !(o.flags ?? []).includes('too_unreliable');

const BROAD: Flag[] = ['provincial_value', 'regional_value', 'national_value'];
/** Value describes a broader area than the place (territory-wide, economic region…). */
export const isBroad = (o: Observation) => (o.flags ?? []).some((f) => BROAD.includes(f));

/** First metric present among candidate ids, else the first matching the predicate. */
export function findMetric(core: CoreData, ids: string[], pred?: (m: MetricDef) => boolean): MetricDef | undefined {
  for (const id of ids) {
    const m = core.metricById.get(id);
    if (m) return m;
  }
  return pred ? core.metrics.find(pred) : undefined;
}

const MONTH_SLUG = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Climate metric for a month and statistic: clim_jan_mean_temp, or a month family (dims.month) with a matching label. */
export function climateMetric(core: CoreData, month: number, stat: 'mean' | 'min' | 'max'): MetricDef | undefined {
  const slug = MONTH_SLUG[month - 1];
  const statRe = stat === 'mean' ? /mean|avg|average/i : stat === 'min' ? /\bmin|minimum|low/i : /\bmax|maximum|high/i;
  return findMetric(core, [`clim_${slug}_${stat}_temp`, `clim_${slug}_${stat}`], (m) => {
    if (m.category !== 'climate' || m.unit !== 'degC') return false;
    const mm = monthIndex(m.dims?.month) ?? (new RegExp(`\\b${slug}`, 'i').test(m.id) ? month : null);
    return mm === month && statRe.test(`${m.id} ${m.label} ${m.dims?.stat ?? ''}`);
  });
}

export interface Comparable {
  metric: MetricDef;
  own: Observation & { value: number };
  /** Same metric, period, source and geography type, with a value (includes this place). */
  peers: { placeId: string; value: number }[];
  /** 1 = first in the metric's default order (lowest first when higher is worse). */
  rank: number;
  higher: number;
  lower: number;
  ties: number;
}

/** Where a place sits among places with comparable observations (same metric & period). null when not comparable. */
export function comparable(core: CoreData, placeId: string, metric: MetricDef): Comparable | { metric: MetricDef; own: Observation | undefined; reason: string } {
  const own = core.obsIndex.get(placeId)?.get(metric.id);
  if (!hasValue(own)) return { metric, own, reason: own?.note ?? 'No value for this place' };
  if (isBroad(own)) return { metric, own, reason: 'Not ranked: the value covers a broader area than the place' };
  const peers = (core.byMetric.get(metric.id) ?? [])
    .filter((o) => hasValue(o) && o.period === own.period && o.sourceId === own.sourceId && !isBroad(o))
    .map((o) => ({ placeId: o.placeId, value: o.value as number }));
  if (peers.length < 3) return { metric, own, reason: 'Too few places with a comparable value to rank' };
  const v = own.value;
  const higher = peers.filter((p) => p.value > v).length;
  const lower = peers.filter((p) => p.value < v).length;
  const ties = peers.filter((p) => p.value === v).length - 1;
  const rank = (defaultAscending(metric) ? lower : higher) + 1;
  return { metric, own, peers, rank, higher, lower, ties };
}

export const isComparable = (c: ReturnType<typeof comparable>): c is Comparable => 'peers' in c;

/** Neutral sentence: "lower than in 19 of the 25 other places with data". */
export function rankSentence(c: Comparable): string {
  const others = c.peers.length - 1;
  const upper = c.lower >= c.higher;
  const n = upper ? c.lower : c.higher;
  const word = upper ? 'higher' : 'lower';
  const tie = c.ties > 0 ? `, the same as ${c.ties === 1 ? '1 other' : `${c.ties} others`}` : '';
  return `${word} than in ${n} of the ${others} other places with data${tie}`;
}

export const rankLabel = (c: Comparable) => `${ordinal(c.rank)} of ${c.peers.length} · ${defaultAscending(c.metric) ? 'lowest' : 'highest'} first`;

/** Explorer link for a metric (family key + unit/month variant) with this place selected; null if it is not a map layer. */
export function explorerHref(catalog: LayerCatalog, m: MetricDef, placeId: string): string | null {
  const entry = catalog.entryOfMetric.get(m.id);
  if (!entry) return null;
  const p = new URLSearchParams({ metric: entry.key });
  if (entry.dim === 'unitType' && m.dims?.unitType) p.set('unit', unitTypeSlug(m.dims.unitType));
  const mi = monthIndex(m.dims?.month);
  if (entry.dim === 'month' && mi) p.set('month', monthSlug(mi));
  p.set('place', placeId);
  return `/${serializeParams(p)}`;
}

// ------------------------------------------------------------------ series

export const findSeries = (series: Series[] | undefined, metricId: string) => series?.find((s) => s.metricId === metricId);

export function toChartSeries(s: Series, label?: string, placeId?: string): ChartSeries {
  return { id: s.id, label: label ?? s.label, placeId, points: s.points.map((p) => ({ x: p.t, y: p.v, f: p.f })) };
}

/** Monthly normals series (t = '01'..'12') for temperature, precipitation, rain or snow. */
export function climateSeries(series: Series[] | undefined): Series[] {
  return (series ?? []).filter(
    (s) => (s.unit === 'degC' || s.unit === 'mm' || s.unit === 'cm') && s.points.length >= 6 && s.points.length <= 12 && s.points.every((p) => isMonthToken(p.t)),
  );
}

export function lineSpec(opts: { id: string; title: string; subtitle?: string; unit: ChartSpec['unit']; series: ChartSeries[]; sourceIds: string[]; notes?: string; yLabel?: string }): ChartSpec {
  return { type: 'line', ...opts };
}

// ------------------------------------------------------------------ rents by unit type

export const RENT_FAMILIES = [
  { family: 'rent_asking', label: 'Asking rent', short: 'Asking' },
  { family: 'rent_cmhc_avg', label: 'CMHC average rent', short: 'CMHC average' },
  { family: 'rent_paid', label: 'Average paid rent', short: 'Paid' },
] as const;

export interface RentCell {
  metric: MetricDef;
  obs: Observation | undefined;
}

/** Rent metrics by family and unit type for a place (only families present in the snapshot). */
export function rentGrid(core: CoreData, placeId: string) {
  const byPlace = core.obsIndex.get(placeId);
  const fams = RENT_FAMILIES.map((f) => {
    const metrics = core.metrics.filter((m) => m.dims?.family === f.family && m.dims?.unitType);
    const cells = new Map<string, RentCell>();
    for (const m of metrics) cells.set(m.dims!.unitType!, { metric: m, obs: byPlace?.get(m.id) });
    const anyObs = [...cells.values()].find((c) => c.obs);
    return { ...f, cells, period: anyObs?.obs?.period ?? null, periodType: metrics[0]?.periodType, sourceId: anyObs?.obs?.sourceId ?? metrics[0]?.sourceIds[0] };
  }).filter((f) => f.cells.size > 0);
  const unitTypes = UNIT_TYPE_ORDER.filter((u) => fams.some((f) => f.cells.has(u)));
  return { fams, unitTypes };
}

// ------------------------------------------------------------------ wages

export interface WageRow {
  key: 'er' | 'province' | 'canada';
  label: string;
  cell: { low: number | null; median: number | null; high: number | null; annual: boolean } | null;
  flags: Flag[];
}

/** Primary economic region (or flagged province fallback), the province and Canada for one occupation. */
export function wageRows(table: WageTable, noc: string, place: Place): { primary: WageCell | null; rows: WageRow[]; territoryNoProvince: boolean } {
  const cells = table.byNoc[noc] ?? {};
  const primary = lookupWage(table, noc, place);
  const provKey = Object.keys(table.geos).find((k) => table.geos[k].level === 'province' && (k === place.province || table.geos[k].id === place.geo.province.id));
  const caKey = Object.keys(table.geos).find((k) => table.geos[k].level === 'country') ?? (cells.CA ? 'CA' : undefined);
  const pack = (c: (typeof cells)[string] | undefined) => (c ? { low: c[0], median: c[1], high: c[2], annual: c[3] === 1 } : null);
  const rows: WageRow[] = [];
  const er = place.geo.economicRegions[0];
  if (primary && primary.fallback === null)
    rows.push({ key: 'er', label: `ER: ${geoName(primary.geo.name)}`, cell: primary, flags: ['regional_value'] });
  else
    rows.push({ key: 'er', label: `ER: ${er ? geoName(er.name) : '—'}`, cell: null, flags: ['not_available'] });
  rows.push({ key: 'province', label: provinceName(place.province), cell: provKey ? pack(cells[provKey]) : null, flags: ['provincial_value'] });
  rows.push({ key: 'canada', label: 'Canada', cell: caKey ? pack(cells[caKey]) : null, flags: ['national_value'] });
  return { primary, rows, territoryNoProvince: !provKey };
}

/** Why a place has no wage cell: "…in the Toronto economic region or Ontario" (no repetition for territories). */
export function noWageReason(place: Place): string {
  const er = place.geo.economicRegions[0];
  const erName = er ? geoName(er.name) : null;
  const prov = geoName(place.geo.province.name);
  const where = erName && erName !== prov ? `the ${erName} economic region or ${prov}` : prov;
  return `Job Bank publishes no median wage for this occupation in ${where}`;
}

/** Job Bank's reference period token ('2023-2024 (LFS…)' → '2023–2024'). */
export const wagePeriod = (table: WageTable) => formatPeriod(table.referencePeriod, 'period');
