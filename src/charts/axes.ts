/**
 * Axis helpers: what kind of x values a chart has (quarters, months, years,
 * numbers, months of the year, categories), human labels for them, tick
 * thinning by available width, and nice value scales.
 */
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import type { MetricDef, Unit } from '../types/contract';
import { formatPeriod, formatTick, formatValue } from '../lib/format';
import { MONTHS_LONG, monthIndex } from '../lib/layers';
import { FONT_TICK, textWidth } from './measure';

export type XKind = 'quarter' | 'month' | 'year' | 'numeric' | 'monthOfYear' | 'category';

const RE_QUARTER = /^\d{4}-Q[1-4]$/;
const RE_MONTH = /^\d{4}-\d{2}$/;
const RE_YEAR = /^\d{4}$/;
/** Months of the year in normals series are zero-padded ('01'..'12'); bare '1'..'10' stay numeric. */
const RE_MOY = /^(0[1-9]|1[0-2])$/;

const MONTH_NAMES = new Set(MONTHS_LONG.flatMap((m) => [m.toLowerCase(), m.slice(0, 3).toLowerCase()]));
/** '01'..'12', 'Jan', 'January' (strict: category names never qualify). */
export const isMonthToken = (x: string | number) => RE_MOY.test(String(x).trim()) || MONTH_NAMES.has(String(x).trim().toLowerCase().replace(/\.$/, ''));

/** Year-to-date / partial-period points (not comparable with full periods). */
export const isPartialX = (x: string | number) => typeof x === 'string' && /\bytd\b|year[\s-]to[\s-]date|partial/i.test(x);

export function xKindOf(xs: readonly (string | number)[]): XKind {
  const full = xs.filter((x) => !isPartialX(x));
  if (full.length === 0) return 'category';
  if (full.every((x) => typeof x === 'number')) return 'numeric';
  const s = full.map(String);
  if (s.every((x) => RE_QUARTER.test(x))) return 'quarter';
  if (s.every((x) => RE_MONTH.test(x))) return 'month';
  if (s.every((x) => RE_YEAR.test(x))) return 'year';
  if (s.length <= 12 && s.every(isMonthToken)) return 'monthOfYear';
  if (s.every((x) => x.trim() !== '' && Number.isFinite(Number(x)))) return 'numeric';
  return 'category';
}

/** Unique x values in reading order: numbers ascending, periods lexicographically (contract rule), categories as given. */
export function orderXs(xs: readonly (string | number)[], kind: XKind): (string | number)[] {
  const seen = new Map<string, string | number>();
  for (const x of xs) if (!seen.has(String(x))) seen.set(String(x), x);
  const uniq = [...seen.values()];
  if (kind === 'category') return uniq;
  if (kind === 'numeric') return uniq.sort((a, b) => Number(a) - Number(b));
  if (kind === 'monthOfYear') return uniq.sort((a, b) => (monthIndex(String(a)) ?? 99) - (monthIndex(String(b)) ?? 99));
  return uniq.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
}

/** Full label for tooltips and tables. */
export function xLabelFull(x: string | number, kind: XKind, periodType?: MetricDef['periodType'], xLabel?: string): string {
  const s = String(x);
  if (isPartialX(x)) return s.replace(/\(([A-Za-z]{3})-([A-Za-z]{3})\)/, '($1–$2)');
  switch (kind) {
    case 'quarter':
      return formatPeriod(s);
    case 'month':
      return formatPeriod(s, periodType === 'three_month_avg' ? periodType : undefined);
    case 'monthOfYear': {
      const m = monthIndex(s);
      return m ? MONTHS_LONG[m - 1] : s;
    }
    case 'numeric':
      return xLabel ? `${xLabel}: ${s}` : s;
    default:
      return s;
  }
}

/** Short label for an x tick. */
function tickText(x: string | number, kind: XKind, narrow = false): string {
  const s = String(x);
  if (isPartialX(x)) {
    const y = /^(\d{4})/.exec(s)?.[1];
    return y ? `${y} YTD` : 'YTD';
  }
  switch (kind) {
    case 'quarter':
    case 'month':
      return s.slice(0, 4);
    case 'monthOfYear': {
      const m = monthIndex(s);
      const name = m ? MONTHS_LONG[m - 1] : s;
      return narrow ? name.slice(0, 1) : name.slice(0, 3);
    }
    default:
      return s;
  }
}

export interface XTick {
  x: string | number;
  label: string;
}

/**
 * Ticks that fit `plotWidth`. Quarters and months tick on the first period of
 * each year (labelled with the year); years, numbers and categories are thinned.
 */
export function xTicks(xs: readonly (string | number)[], kind: XKind, plotWidth: number): XTick[] {
  if (xs.length === 0) return [];
  const gap = 14;
  const fits = (ticks: XTick[]) => {
    if (ticks.length <= 1) return true;
    const avail = plotWidth / Math.max(1, xs.length - 1);
    for (let i = 1; i < ticks.length; i++) {
      const a = xs.indexOf(ticks[i - 1].x);
      const b = xs.indexOf(ticks[i].x);
      const dist = (b - a) * avail;
      if (dist < (textWidth(ticks[i - 1].label, FONT_TICK) + textWidth(ticks[i].label, FONT_TICK)) / 2 + gap) return false;
    }
    return true;
  };
  const thin = (cands: XTick[]): XTick[] => {
    for (let step = 1; step <= cands.length; step++) {
      const picked = cands.filter((_, i) => i % step === 0);
      if (fits(picked)) return picked;
    }
    return cands.slice(0, 1);
  };
  if (kind === 'monthOfYear') {
    const wide = xs.map((x) => ({ x, label: tickText(x, kind) }));
    if (fits(wide)) return wide;
    return xs.map((x) => ({ x, label: tickText(x, kind, true) }));
  }
  if (kind === 'quarter' || kind === 'month') {
    const first = (x: string | number) => (kind === 'quarter' ? String(x).endsWith('-Q1') : String(x).endsWith('-01'));
    const cands = xs.filter((x) => first(x) || isPartialX(x)).map((x) => ({ x, label: tickText(x, kind) }));
    if (cands.length >= 2) return thin(cands);
    // Short spans: label each period in full, thinned.
    return thin(xs.map((x) => ({ x, label: kind === 'quarter' ? formatPeriod(String(x)) : formatPeriod(String(x)) })));
  }
  const all = xs.map((x) => ({ x, label: tickText(x, kind) }));
  if (fits(all)) return all;
  // Keep the last tick visible: thin counting back from the end.
  for (let step = 2; step <= all.length; step++) {
    const picked = all.filter((_, i) => (all.length - 1 - i) % step === 0);
    if (fits(picked)) return picked;
  }
  return all.slice(-1);
}

export interface ValueScale {
  scale: ScaleLinear<number, number>;
  ticks: number[];
  domain: [number, number];
}

/**
 * A nice linear scale for values. `zero` forces the baseline in (bars always,
 * lines when the data sit close to zero). Returns ticks inside the domain.
 */
export function valueScale(values: number[], range: [number, number], opts: { zero?: boolean | 'auto'; ticks?: number; pad?: number } = {}): ValueScale {
  const finite = values.filter((v) => Number.isFinite(v));
  let lo = finite.length ? Math.min(...finite) : 0;
  let hi = finite.length ? Math.max(...finite) : 1;
  const zero = opts.zero === 'auto' ? lo >= 0 && lo <= hi * 0.4 : opts.zero;
  if (zero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (lo === hi) {
    const d = Math.abs(lo) * 0.1 || 1;
    lo -= d;
    hi += d;
  }
  if (opts.pad) {
    const span = hi - lo;
    if (!(zero && lo === 0)) lo -= span * opts.pad;
    hi += span * opts.pad;
  }
  const n = opts.ticks ?? 5;
  const scale = scaleLinear().domain([lo, hi]).range(range).nice(n);
  const [d0, d1] = scale.domain() as [number, number];
  return { scale, ticks: scale.ticks(n), domain: [d0, d1] };
}

/** Tick label for a value axis: "$1,400", "6%", "−10°", "130k". */
export function valueTick(v: number, unit: Unit, ticks: number[]): string {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const max = Math.max(...ticks.map(Math.abs));
  const compact = max >= 10_000;
  if (unit === 'CAD_hour') return formatTick(v, unit, decimals);
  if (unit === 'months' || unit === 'days' || unit === 'mm' || unit === 'cm' || unit === 'per_1000' || unit === 'minutes' || unit === 'km' || unit === 'hours')
    return formatTick(v, 'count', decimals, compact);
  return formatTick(v, unit, decimals, compact);
}

/** Value with its unit, for tooltips, labels and tables. */
export const fmtValue = (v: number | null | undefined, unit: Unit, decimals?: number) => formatValue(v, unit, decimals);

/** Unit words for axis titles ("$ per month", "%", "°C"). */
export function unitAxisTitle(unit: Unit): string {
  switch (unit) {
    case 'CAD':
      return 'Dollars';
    case 'CAD_hour':
      return '$ per hour';
    case 'CAD_month':
      return '$ per month';
    case 'CAD_year':
      return '$ per year';
    case 'percent':
      return 'Percent';
    case 'pp':
      return 'Percentage points';
    case 'degC':
      return '°C';
    case 'mm':
      return 'Millimetres';
    case 'cm':
      return 'Centimetres';
    case 'per_1000':
      return 'Per 1,000 residents';
    case 'persons':
      return 'People';
    case 'months':
      return 'Months';
    case 'days':
      return 'Days';
    default:
      return '';
  }
}
