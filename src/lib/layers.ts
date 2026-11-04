/**
 * Map/list "layers": metrics with mapLayer:true grouped by category, metric
 * families collapsed into one entry (switching dims.unitType), plus the virtual
 * profession-wage layer built from wages.json.
 *
 * A layer is turned into one LayerDatum per place so the map, results list,
 * legend and tooltips all read the same, honest view of the data.
 */
import type { Flag, GeoRef, MetricCategory, MetricDef, Observation, Occupation, Place, Unit, WageTable } from '../types/contract';
import { cleanGeoName, formatPeriod, geoQualifier, missingReason } from './format';

export const CATEGORY_ORDER: MetricCategory[] = ['housing', 'work', 'cost', 'immigration', 'climate', 'people'];
export const CATEGORY_LABELS: Record<MetricCategory, string> = {
  housing: 'Housing',
  work: 'Work',
  cost: 'Cost',
  immigration: 'Immigration',
  climate: 'Climate',
  people: 'People',
};

/** Canonical order + short labels for dims.unitType (Canadian terms). */
export const UNIT_TYPE_ORDER = ['Studio', '1 bedroom', '2 bedroom', '3 bedroom+'];
const UNIT_TYPE_SHORT: Record<string, string> = { Studio: 'Studio', '1 bedroom': '1 bed', '2 bedroom': '2 bed', '3 bedroom+': '3+ bed' };
const UNIT_TYPE_SLUG: Record<string, string> = { Studio: 'studio', '1 bedroom': '1br', '2 bedroom': '2br', '3 bedroom+': '3br' };

const UNIT_TYPE_BUTTON: Record<string, string> = { Studio: 'Studio', '1 bedroom': '1', '2 bedroom': '2', '3 bedroom+': '3+' };

export const unitTypeShort = (t: string) => UNIT_TYPE_SHORT[t] ?? t;
/** Compact button label: Studio / 1 / 2 / 3+. */
export const unitTypeButton = (t: string) => UNIT_TYPE_BUTTON[t] ?? t;

export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** dims.month -> 1..12 ('01', '1', 'jan', 'January' all work). */
export function monthIndex(m: string | undefined): number | null {
  if (!m) return null;
  const n = Number(m);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const i = MONTHS_LONG.findIndex((x) => x.toLowerCase().startsWith(m.toLowerCase().slice(0, 3)));
  return i >= 0 ? i + 1 : null;
}
export const monthSlug = (n: number) => String(n).padStart(2, '0');
const MONTH_RE = new RegExp(`\\b(${MONTHS_LONG.join('|')}|${MONTHS_LONG.map((m) => m.slice(0, 3)).join('|')})\\b\\.?`, 'i');
export function unitTypeSlug(t: string): string {
  return UNIT_TYPE_SLUG[t] ?? t.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Id of the virtual profession-wage layer (URL: ?metric=noc_wage&noc=21231). */
export const WAGE_LAYER_KEY = 'noc_wage';

export interface LayerEntry {
  /** URL value: the family id for families, otherwise the metric id. */
  key: string;
  label: string;
  category: MetricCategory;
  family?: string;
  /** Which dimension the variants differ by. */
  dim?: 'unitType' | 'month';
  /** Variants in canonical unit-type / month order (length 1 when not a family). */
  variants: MetricDef[];
}

export interface LayerCatalog {
  entries: LayerEntry[];
  byCategory: Map<MetricCategory, LayerEntry[]>;
  byKey: Map<string, LayerEntry>;
  entryOfMetric: Map<string, LayerEntry>;
}

function commonLabel(variants: MetricDef[], dim?: LayerEntry['dim']): string {
  if (dim === 'month') {
    const base = variants[0].label.replace(MONTH_RE, '').replace(/\s{2,}/g, ' ').replace(/^[\s,·–-]+|[\s,·–-]+$/g, '');
    return base ? base[0].toUpperCase() + base.slice(1) : variants[0].shortLabel;
  }
  if (variants.length === 1) {
    const m = variants[0];
    const t = m.dims?.unitType;
    if (t) return m.shortLabel.replace(new RegExp(`[,·–-]?\\s*(${escapeRe(t)}|${escapeRe(unitTypeShort(t))})\\s*$`, 'i'), '').trim() || m.shortLabel;
    return m.shortLabel;
  }
  const labels = variants.map((v) => v.shortLabel);
  let prefix = labels[0];
  for (const l of labels) while (!l.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = prefix.replace(/[\s,·–(-]+$/, '').trim();
  return prefix.length >= 3 ? prefix : variants[0].label;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function unitOrder(t: string | undefined): number {
  const i = t ? UNIT_TYPE_ORDER.indexOf(t) : -1;
  return i === -1 ? 99 : i;
}

export function buildLayerCatalog(metrics: MetricDef[]): LayerCatalog {
  const entries: LayerEntry[] = [];
  const families = new Map<string, LayerEntry>();
  for (const m of metrics) {
    if (!m.mapLayer) continue;
    // Families switch dims.unitType (housing type) or dims.month; other dimensions stay separate layers.
    const fam = m.dims?.family && (m.dims.unitType || monthIndex(m.dims.month) !== null) ? m.dims.family : undefined;
    if (fam) {
      let e = families.get(fam);
      if (!e) {
        e = { key: fam, label: '', category: m.category, family: fam, variants: [] };
        families.set(fam, e);
        entries.push(e);
      }
      e.variants.push(m);
    } else entries.push({ key: m.id, label: m.shortLabel, category: m.category, variants: [m] });
  }
  for (const e of families.values()) {
    e.dim = e.variants.some((v) => monthIndex(v.dims?.month) !== null) ? 'month' : 'unitType';
    e.variants.sort((a, b) =>
      e.dim === 'month'
        ? (monthIndex(a.dims?.month) ?? 99) - (monthIndex(b.dims?.month) ?? 99)
        : unitOrder(a.dims?.unitType) - unitOrder(b.dims?.unitType) || a.id.localeCompare(b.id),
    );
    e.label = commonLabel(e.variants, e.dim);
  }
  const byCategory = new Map<MetricCategory, LayerEntry[]>();
  for (const c of CATEGORY_ORDER) byCategory.set(c, []);
  for (const e of entries) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category)!.push(e);
  }
  const entryOfMetric = new Map<string, LayerEntry>();
  for (const e of entries) for (const v of e.variants) entryOfMetric.set(v.id, e);
  return { entries, byCategory, byKey: new Map(entries.map((e) => [e.key, e])), entryOfMetric };
}

/** Default layer: 1-bedroom asking rent when present, else the first housing layer, else the first layer. */
export function defaultLayerKey(catalog: LayerCatalog): string | null {
  const rent = catalog.entryOfMetric.get('rent_asking_1br');
  if (rent) return rent.key;
  return catalog.byCategory.get('housing')?.[0]?.key ?? catalog.entries[0]?.key ?? null;
}

export interface ResolvedLayer {
  entry: LayerEntry | null;
  metric: MetricDef | null;
  unitType?: string;
  /** 1..12 for month families. */
  month?: number;
}

/**
 * Pick the variant: unit-type slug for unit families (fallback 1 bedroom), month
 * ('01'..'12') for month families (fallback January), else the first.
 */
export function pickVariant(entry: LayerEntry, unitSlug: string | null | undefined, monthParam?: string | null): MetricDef {
  if (entry.dim === 'month') {
    const want = monthIndex(monthParam ?? undefined);
    return (want && entry.variants.find((v) => monthIndex(v.dims?.month) === want)) || entry.variants[0];
  }
  const bySlug = unitSlug ? entry.variants.find((v) => v.dims?.unitType && unitTypeSlug(v.dims.unitType) === unitSlug) : undefined;
  return bySlug ?? entry.variants.find((v) => v.dims?.unitType === '1 bedroom') ?? entry.variants[0];
}

/**
 * Resolve ?metric= & ?unit= to a catalog entry and metric. `metric` may be a
 * family id ('rent_asking') or a concrete metric id ('rent_asking_2br', e.g. from
 * an Insight finding). Unknown values fall back to the default layer.
 */
export function resolveLayer(catalog: LayerCatalog, metricParam: string | null, unitParam: string | null, monthParam: string | null = null): ResolvedLayer {
  let entry = metricParam ? catalog.byKey.get(metricParam) : undefined;
  let metric: MetricDef | undefined;
  if (entry) metric = pickVariant(entry, unitParam, monthParam);
  else if (metricParam && catalog.entryOfMetric.has(metricParam)) {
    entry = catalog.entryOfMetric.get(metricParam)!;
    const wantsVariant = entry.family && ((entry.dim === 'unitType' && unitParam) || (entry.dim === 'month' && monthParam));
    metric = wantsVariant ? pickVariant(entry, unitParam, monthParam) : entry.variants.find((v) => v.id === metricParam);
  }
  if (!entry || !metric) {
    const key = defaultLayerKey(catalog);
    entry = key ? catalog.byKey.get(key) : undefined;
    metric = entry ? pickVariant(entry, unitParam, monthParam) : undefined;
  }
  return { entry: entry ?? null, metric: metric ?? null, unitType: metric?.dims?.unitType, month: monthIndex(metric?.dims?.month) ?? undefined };
}

/** The asking-rent family used by the rent-share calculation (dims.family with unit types, monthly dollars). */
export function rentFamily(catalog: LayerCatalog): LayerEntry | null {
  const preferred = catalog.byKey.get('rent_asking');
  if (preferred?.dim === 'unitType') return preferred;
  return catalog.entries.find((e) => e.dim === 'unitType' && e.category === 'housing' && e.variants[0]?.unit === 'CAD_month') ?? null;
}

// ------------------------------------------------------------------ per-place layer data

export type DatumStatus = 'ok' | 'other_period' | 'not_comparable' | 'missing';

export interface LayerDatum {
  placeId: string;
  /** Underlying observation (synthesised for the wage layer). */
  obs: Observation | null;
  /** Comparable value: used for colour, bars and ranking. null when missing / not comparable. */
  value: number | null;
  /** Value to print (may be non-comparable, e.g. an annual wage on an hourly layer). */
  shown: number | null;
  shownUnit: Unit;
  status: DatumStatus;
  period: string | null;
  /** Geography qualifier ('Economic region: …', 'Province-wide value', …). */
  qualifier: string | null;
  /** Why the value is missing or not comparable. */
  reason: string | null;
  flags: Flag[];
  /** Low / high range (wages). */
  range?: [number | null, number | null];
  /** Reproducible calculation, for derived layers (labelled CALCULATION in the UI). */
  calc?: string;
  /** National rank among comparable values for the layer's main period (1 = first in the default order). */
  rank?: number;
}

export interface LayerData {
  metric: MetricDef;
  data: Map<string, LayerDatum>;
  /** The period most places share (ties -> latest). Only these values are ranked. */
  primaryPeriod: string | null;
  periods: { period: string; count: number }[];
  counts: { ok: number; otherPeriod: number; notComparable: number; missing: number; total: number; ranked: number };
  sourceIds: string[];
  /** Extra caveat for the legend (e.g. annual wages on an hourly layer). */
  caveat?: string;
  /** Derived layer: the legend and drawer label it CALCULATION and show this assumption. */
  calculation?: string;
}

/** Default "best-first" order: lowest first when higher is worse, otherwise highest first. */
export const defaultAscending = (m: Pick<MetricDef, 'higherIs'>) => m.higherIs === 'worse';

function finalize(metric: MetricDef, data: Map<string, LayerDatum>, caveat?: string, calculation?: string): LayerData {
  const periodCount = new Map<string, number>();
  for (const d of data.values()) if (d.value !== null && d.period) periodCount.set(d.period, (periodCount.get(d.period) ?? 0) + 1);
  const periods = [...periodCount.entries()].map(([period, count]) => ({ period, count })).sort((a, b) => b.count - a.count || (a.period < b.period ? 1 : -1));
  const primaryPeriod = periods[0]?.period ?? null;
  for (const d of data.values()) if (d.status === 'ok' && d.period !== primaryPeriod) {
    d.status = 'other_period';
    d.reason = `Different period (${formatPeriod(d.period, metric.periodType)}) — shown but not ranked`;
  }
  const ranked = [...data.values()].filter((d) => d.status === 'ok' && d.value !== null);
  const asc = defaultAscending(metric);
  ranked.sort((a, b) => (asc ? a.value! - b.value! : b.value! - a.value!));
  let prev: number | null = null;
  let rank = 0;
  ranked.forEach((d, i) => {
    if (d.value !== prev) rank = i + 1;
    d.rank = rank;
    prev = d.value;
  });
  const counts = { ok: 0, otherPeriod: 0, notComparable: 0, missing: 0, total: data.size, ranked: ranked.length };
  for (const d of data.values()) {
    if (d.status === 'ok') counts.ok++;
    else if (d.status === 'other_period') counts.otherPeriod++;
    else if (d.status === 'not_comparable') counts.notComparable++;
    else counts.missing++;
  }
  periods.sort((a, b) => (a.period < b.period ? 1 : -1));
  const sourceIds = [...new Set([...metric.sourceIds, ...[...data.values()].map((d) => d.obs?.sourceId).filter((s): s is string => !!s)])];
  return { metric, data, primaryPeriod, periods, counts, sourceIds, caveat, calculation };
}

/** Build layer data for a real metric from obsIndex (latest observation per place). */
export function buildMetricLayer(metric: MetricDef, places: Place[], obsIndex: Map<string, Map<string, Observation>>): LayerData {
  const data = new Map<string, LayerDatum>();
  for (const p of places) {
    const o = obsIndex.get(p.id)?.get(metric.id) ?? null;
    const flags = o?.flags ?? [];
    const hasValue = o !== null && o.value !== null && !flags.includes('too_unreliable');
    data.set(p.id, {
      placeId: p.id,
      obs: o,
      value: hasValue ? o!.value : null,
      shown: hasValue ? o!.value : null,
      shownUnit: metric.unit,
      status: hasValue ? 'ok' : 'missing',
      period: o?.period ?? null,
      qualifier: geoQualifier(o),
      reason: hasValue ? null : o ? missingReason(flags, o.note) : 'No observation for this place in the current snapshot',
      flags,
    });
  }
  return finalize(metric, data);
}

// ------------------------------------------------------------------ profession wages

/** Key in byNoc[noc] for a geography: direct key match first, then via the geos dictionary. */
function pickKey(table: WageTable, cells: WageTable['byNoc'][string], level: GeoRef['level'], ids: string[]): string | null {
  for (const id of ids) if (id && cells[id] && (!table.geos[id] || table.geos[id].level === level)) return id;
  for (const [key, g] of Object.entries(table.geos)) if (g.level === level && ids.includes(g.id) && cells[key]) return key;
  return null;
}

export interface WageCell {
  key: string;
  geo: GeoRef;
  low: number | null;
  median: number | null;
  high: number | null;
  annual: boolean;
  fallback: 'province' | null;
}

/** Wage cell for a place: primary economic region, else the province (flagged). */
export function lookupWage(table: WageTable, noc: string, place: Place): WageCell | null {
  const cells = table.byNoc[noc];
  if (!cells) return null;
  const er = place.geo.economicRegions[0];
  const erKey = er ? pickKey(table, cells, 'economic_region', [er.id]) : null;
  const erCell = erKey ? cells[erKey] : undefined;
  if (erKey && erCell && erCell[1] !== null) {
    return { key: erKey, geo: table.geos[erKey] ?? er, low: erCell[0], median: erCell[1], high: erCell[2], annual: erCell[3] === 1, fallback: null };
  }
  const prKey = pickKey(table, cells, 'province', [place.province, place.geo.province.id]);
  const prCell = prKey ? cells[prKey] : undefined;
  if (prKey && prCell && prCell[1] !== null) {
    return { key: prKey, geo: table.geos[prKey] ?? place.geo.province, low: prCell[0], median: prCell[1], high: prCell[2], annual: prCell[3] === 1, fallback: 'province' };
  }
  return null;
}

/** Synthesised MetricDef for the profession layer. */
export function wageMetric(occupation: Pick<Occupation, 'noc' | 'title'>, table: WageTable, annual: boolean): MetricDef {
  return {
    id: WAGE_LAYER_KEY,
    label: `Median wage: ${occupation.title}`,
    shortLabel: 'Median wage',
    category: 'work',
    unit: annual ? 'CAD_year' : 'CAD_hour',
    decimals: annual ? 0 : 2,
    higherIs: 'better',
    description: `Median ${annual ? 'annual' : 'hourly'} wage of people employed as ${occupation.title.toLowerCase()} (NOC ${occupation.noc}) in each place's main economic region. These are wages of employed workers, not advertised pay.`,
    basis: 'gross wages of employed workers',
    geoLevel: 'economic_region',
    periodType: 'period',
    sourceIds: [table.sourceId],
    mapLayer: true,
    dims: { noc: occupation.noc },
  };
}

/** Build the virtual "Median wage: <occupation>" layer. */
/** Job Bank reference periods can be descriptive; data carry the leading period token. */
function periodToken(p: string): string {
  const m = /^(\d{4}(?:[-/]\d{4})?)/.exec(p.trim());
  return m ? m[1] : p;
}

export function buildWageLayer(table: WageTable, occupation: Pick<Occupation, 'noc' | 'title'>, places: Place[]): LayerData {
  const period = periodToken(table.referencePeriod);
  const cells = new Map<string, WageCell | null>();
  let annualCount = 0;
  let hourlyCount = 0;
  for (const p of places) {
    const c = lookupWage(table, occupation.noc, p);
    cells.set(p.id, c);
    if (c) c.annual ? annualCount++ : hourlyCount++;
  }
  const annualLayer = annualCount > hourlyCount;
  const metric = wageMetric(occupation, table, annualLayer);
  const data = new Map<string, LayerDatum>();
  let mixed = 0;
  for (const p of places) {
    const c = cells.get(p.id) ?? null;
    const er = p.geo.economicRegions[0];
    if (!c) {
      const o: Observation = {
        placeId: p.id,
        metricId: WAGE_LAYER_KEY,
        value: null,
        period: period,
        geo: er ?? p.geo.province,
        sourceId: table.sourceId,
        flags: ['not_available'],
      };
      data.set(p.id, {
        placeId: p.id,
        obs: o,
        value: null,
        shown: null,
        shownUnit: metric.unit,
        status: 'missing',
        period: period,
        qualifier: er ? `Economic region: ${cleanGeoName(er.name)}` : null,
        reason: `Job Bank publishes no median wage for this occupation in ${er ? cleanGeoName(er.name) : 'this economic region'} or ${p.geo.province.name}`,
        flags: ['not_available'],
      });
      continue;
    }
    const flags: Flag[] = [c.fallback === 'province' ? 'provincial_value' : 'regional_value'];
    if (c.annual) flags.push('annual_wage');
    const o: Observation = { placeId: p.id, metricId: WAGE_LAYER_KEY, value: c.median, period: period, geo: c.geo, sourceId: table.sourceId, flags };
    const comparable = c.annual === annualLayer;
    if (!comparable) mixed++;
    data.set(p.id, {
      placeId: p.id,
      obs: o,
      value: comparable ? c.median : null,
      shown: c.median,
      shownUnit: c.annual ? 'CAD_year' : 'CAD_hour',
      status: comparable ? 'ok' : 'not_comparable',
      period: period,
      qualifier:
        c.fallback === 'province'
          ? `Province-wide value (${cleanGeoName(c.geo.name)}) — no economic-region wage`
          : `Economic region: ${cleanGeoName(c.geo.name)}`,
      reason: comparable ? null : c.annual ? 'Published as an annual wage — not comparable with the hourly values on this layer' : 'Published as an hourly wage — not comparable with the annual values on this layer',
      flags,
      range: [c.low, c.high],
    });
  }
  const notes: string[] = [];
  if (mixed) notes.push(`${mixed} ${mixed === 1 ? 'place is' : 'places are'} published on a different wage basis and not coloured.`);
  if (period !== table.referencePeriod.trim()) notes.push(`Reference period: ${table.referencePeriod}.`);
  const caveat = notes.length ? notes.join(' ') : undefined;
  return finalize(metric, data, caveat);
}

/**
 * Key observations for a place profile/drawer: one per category in category
 * order (then a second pass), skipping excluded metric ids. Map layers first.
 */
export function keyObservations(
  placeId: string,
  metrics: MetricDef[],
  obsIndex: Map<string, Map<string, Observation>>,
  opts: { exclude?: string[]; limit?: number; preferUnitType?: string } = {},
): { metric: MetricDef; obs: Observation }[] {
  const limit = opts.limit ?? 6;
  const exclude = new Set(opts.exclude ?? []);
  const byPlace = obsIndex.get(placeId);
  if (!byPlace) return [];
  const families = new Set<string>();
  const candidates = new Map<MetricCategory, { metric: MetricDef; obs: Observation }[]>();
  const sorted = [...metrics].sort((a, b) => Number(!!b.mapLayer) - Number(!!a.mapLayer));
  for (const m of sorted) {
    if (exclude.has(m.id)) continue;
    const o = byPlace.get(m.id);
    if (!o) continue;
    const fam = m.dims?.family;
    if (fam) {
      if (families.has(fam)) continue;
      const preferred = opts.preferUnitType ?? '1 bedroom';
      const sibling = metrics.find((x) => x.dims?.family === fam && x.dims?.unitType === preferred && byPlace.has(x.id) && !exclude.has(x.id));
      if (sibling && sibling.id !== m.id) {
        families.add(fam);
        const list = candidates.get(sibling.category) ?? [];
        list.push({ metric: sibling, obs: byPlace.get(sibling.id)! });
        candidates.set(sibling.category, list);
        continue;
      }
      families.add(fam);
    }
    const list = candidates.get(m.category) ?? [];
    list.push({ metric: m, obs: o });
    candidates.set(m.category, list);
  }
  const out: { metric: MetricDef; obs: Observation }[] = [];
  for (let pass = 0; pass < 3 && out.length < limit; pass++)
    for (const c of CATEGORY_ORDER) {
      const item = candidates.get(c)?.[pass];
      if (item && out.length < limit) out.push(item);
    }
  return out;
}

// ------------------------------------------------------------------ rent as share of gross pay (calculation)

/** Id of the virtual calculation layer (URL: ?metric=rent_share&noc=31301&unit=1br). */
export const RENT_SHARE_KEY = 'rent_share';
/** Paid hours per week assumed when turning an hourly median into monthly gross pay. */
export const HOURS_PER_WEEK = 37.5;
export const monthlyFromHourly = (hourly: number) => (hourly * HOURS_PER_WEEK * 52) / 12;

export function rentShareMetric(occupation: Pick<Occupation, 'noc' | 'title'>, rent: MetricDef, wageSourceId: string): MetricDef {
  const unitType = rent.dims?.unitType;
  return {
    id: RENT_SHARE_KEY,
    label: `Rent as share of gross pay: ${occupation.title}`,
    shortLabel: 'Rent ÷ gross pay',
    category: 'housing',
    unit: 'percent',
    decimals: 0,
    higherIs: 'worse',
    description: `Asking rent for ${unitType ? `a ${unitType.toLowerCase()} unit` : 'a unit'} divided by gross monthly pay at the median wage for ${occupation.title.toLowerCase()} (hourly median × ${HOURS_PER_WEEK} h × 52 weeks ÷ 12). Gross pay before tax and deductions — not take-home pay.`,
    basis: `calculation: asking rent ÷ gross monthly median wage, ${HOURS_PER_WEEK} paid hours a week`,
    geoLevel: 'cma',
    periodType: rent.periodType,
    sourceIds: [...rent.sourceIds, wageSourceId].filter(Boolean),
    comparabilityNote: 'Rent and wage reference periods differ; the wage describes the economic region.',
    mapLayer: true,
    dims: { noc: occupation.noc, ...(unitType ? { unitType } : {}) },
  };
}

const money = (v: number, d = 0) => `$${v.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/**
 * Rent ÷ gross monthly pay for one occupation, per place. Missing when either
 * input is missing. Hourly medians become monthly at HOURS_PER_WEEK; annual cells ÷ 12.
 */
export function buildRentShareLayer(rent: LayerData, wage: LayerData, occupation: Pick<Occupation, 'noc' | 'title'>, places: Place[]): LayerData {
  const metric = rentShareMetric(occupation, rent.metric, wage.metric.sourceIds[0] ?? '');
  const data = new Map<string, LayerDatum>();
  for (const p of places) {
    const r = rent.data.get(p.id);
    const w = wage.data.get(p.id);
    const rentVal = r && (r.status === 'ok' || r.status === 'other_period') ? r.value : null;
    const wageVal = w?.shown ?? null;
    const flags = [...new Set([...(r?.flags ?? []), ...(w?.flags ?? [])])].filter((f) => f !== 'not_available' && f !== 'annual_wage') as Flag[];
    if (rentVal === null || wageVal === null || !r?.obs || !w) {
      const what = rentVal === null && wageVal === null ? 'rent or wage' : rentVal === null ? 'asking-rent' : 'wage';
      const why = rentVal === null ? r?.reason : w?.reason;
      data.set(p.id, {
        placeId: p.id,
        obs: r?.obs ? { ...r.obs, metricId: RENT_SHARE_KEY, value: null, flags: ['not_available'] } : null,
        value: null,
        shown: null,
        shownUnit: 'percent',
        status: 'missing',
        period: r?.period ?? null,
        qualifier: null,
        reason: `Needs both inputs — no ${what} value${why ? ` (${why.replace(/\.$/, '')})` : ''}`,
        flags: ['not_available'],
      });
      continue;
    }
    const annual = w.shownUnit === 'CAD_year';
    const monthly = annual ? wageVal / 12 : monthlyFromHourly(wageVal);
    const share = (rentVal / monthly) * 100;
    const calc = annual
      ? `${money(rentVal)}/mo ÷ (${money(wageVal)}/yr ÷ 12 = ${money(monthly)}/mo) = ${share.toFixed(1)}%`
      : `${money(rentVal)}/mo ÷ (${money(wageVal, 2)}/hr × ${HOURS_PER_WEEK} h × 52 ÷ 12 = ${money(monthly)}/mo) = ${share.toFixed(1)}%`;
    data.set(p.id, {
      placeId: p.id,
      obs: { ...r.obs, metricId: RENT_SHARE_KEY, value: share, flags, note: calc },
      value: share,
      shown: share,
      shownUnit: 'percent',
      status: 'ok',
      period: r.period,
      qualifier: w.qualifier ? `Wage — ${w.qualifier}` : null,
      reason: null,
      flags,
      calc,
    });
  }
  return finalize(metric, data, undefined, `Calculation · gross pay at ${HOURS_PER_WEEK} h a week, before tax — not take-home`);
}
