/**
 * Formatting helpers. Canadian English, CAD, true minus signs (U+2212),
 * no-break spaces before units. Every function accepts null/undefined and
 * returns an em dash so a missing value is never rendered as 0.
 */
import type { Flag, GeoRef, MetricDef, Observation, Unit } from '../types/contract';

export const MINUS = '−';
export const NBSP = ' ';
export const DASH = '—';

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number, compact = false): Intl.NumberFormat {
  const key = `${min}:${max}:${compact}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-CA', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      ...(compact ? { notation: 'compact', compactDisplay: 'short' } : {}),
    });
    nfCache.set(key, f);
  }
  return f;
}

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** 1234.5 -> "1,234.5"; negative numbers get a true minus. */
export function formatNumber(v: number | null | undefined, decimals = 0, opts: { compact?: boolean; signed?: boolean } = {}): string {
  if (!isNum(v)) return DASH;
  const abs = Math.abs(v);
  const body = opts.compact && abs >= 10_000 ? nf(0, abs >= 1e6 ? 1 : 0, true).format(abs) : nf(decimals, decimals).format(abs);
  const zero = Number(abs.toFixed(decimals)) === 0;
  const sign = v < 0 && !zero ? MINUS : opts.signed && !zero ? '+' : '';
  return sign + body;
}

/** "$1,234" (decimals default 0). */
export function formatCAD(v: number | null | undefined, decimals = 0, opts: { compact?: boolean } = {}): string {
  if (!isNum(v)) return DASH;
  const n = formatNumber(Math.abs(v), decimals, opts);
  return (v < 0 && Number(Math.abs(v).toFixed(decimals)) !== 0 ? MINUS : '') + '$' + n;
}
/** "$32.50/hr" */
export const formatHourly = (v: number | null | undefined, decimals = 2) => (isNum(v) ? `${formatCAD(v, decimals)}/hr` : DASH);
/** "$1,850/mo" */
export const formatMonthly = (v: number | null | undefined, decimals = 0) => (isNum(v) ? `${formatCAD(v, decimals)}/mo` : DASH);
/** "$68,000/yr" */
export const formatAnnual = (v: number | null | undefined, decimals = 0, compact = false) =>
  isNum(v) ? `${formatCAD(v, decimals, { compact })}/yr` : DASH;
/** "6.4%" */
export const formatPercent = (v: number | null | undefined, decimals = 1) => (isNum(v) ? `${formatNumber(v, decimals)}%` : DASH);
/** "+1.2 pp" */
export const formatPP = (v: number | null | undefined, decimals = 1) => (isNum(v) ? `${formatNumber(v, decimals, { signed: true })}${NBSP}pp` : DASH);
/** "−7.4 °C" */
export const formatTemp = (v: number | null | undefined, decimals = 1) => (isNum(v) ? `${formatNumber(v, decimals)}${NBSP}°C` : DASH);

/** Short unit suffix used next to big numbers and in legends. */
export function unitSuffix(unit: Unit): string {
  switch (unit) {
    case 'CAD_hour':
      return '/hr';
    case 'CAD_month':
      return '/mo';
    case 'CAD_year':
      return '/yr';
    case 'percent':
      return '%';
    case 'pp':
      return 'pp';
    case 'degC':
      return '°C';
    case 'mm':
      return 'mm';
    case 'cm':
      return 'cm';
    case 'days':
      return 'days';
    case 'hours':
      return 'hours';
    case 'minutes':
      return 'min';
    case 'km':
      return 'km';
    case 'persons':
      return 'people';
    case 'index':
      return 'index';
    case 'ratio':
      return '×';
    default:
      return '';
  }
}

/** Plain-English unit description, e.g. for legends: "Canadian dollars per month". */
export function unitLabel(unit: Unit): string {
  switch (unit) {
    case 'CAD':
      return 'Canadian dollars';
    case 'CAD_hour':
      return 'Canadian dollars per hour';
    case 'CAD_month':
      return 'Canadian dollars per month';
    case 'CAD_year':
      return 'Canadian dollars per year';
    case 'percent':
      return 'percent';
    case 'pp':
      return 'percentage points';
    case 'degC':
      return 'degrees Celsius';
    case 'persons':
      return 'people';
    case 'count':
      return 'count';
    default:
      return unitSuffix(unit);
  }
}

export interface FormatValueOptions {
  /** Use compact notation for large counts / dollars ("1.2M"). */
  compact?: boolean;
  /** Include the unit suffix (default true). */
  withUnit?: boolean;
  /** Override MetricDef.decimals. */
  decimals?: number;
}

/** Format a value by unit. `formatValue(1850, 'CAD_month') -> "$1,850/mo"`. */
export function formatValue(v: number | null | undefined, unit: Unit, decimals?: number, opts: FormatValueOptions = {}): string {
  if (!isNum(v)) return DASH;
  const withUnit = opts.withUnit !== false;
  const d = opts.decimals ?? decimals ?? defaultDecimals(unit);
  switch (unit) {
    case 'CAD':
      return formatCAD(v, d, opts);
    case 'CAD_hour':
      return withUnit ? formatHourly(v, d) : formatCAD(v, d);
    case 'CAD_month':
      return withUnit ? formatMonthly(v, d) : formatCAD(v, d);
    case 'CAD_year':
      return withUnit ? formatAnnual(v, d, opts.compact) : formatCAD(v, d, opts);
    case 'percent':
      return withUnit ? formatPercent(v, d) : formatNumber(v, d);
    case 'pp':
      return withUnit ? formatPP(v, d) : formatNumber(v, d, { signed: true });
    case 'degC':
      return withUnit ? formatTemp(v, d) : formatNumber(v, d);
    case 'persons':
    case 'count':
      return formatNumber(v, d, opts);
    default: {
      const s = unitSuffix(unit);
      return formatNumber(v, d, opts) + (withUnit && s ? NBSP + s : '');
    }
  }
}

/** The number without its unit, and the unit suffix separately (for big Stat displays). */
export function splitValue(v: number | null | undefined, unit: Unit, decimals?: number, opts: FormatValueOptions = {}): { number: string; suffix: string } {
  if (!isNum(v)) return { number: DASH, suffix: '' };
  const d = opts.decimals ?? decimals ?? defaultDecimals(unit);
  if (unit === 'CAD' || unit === 'CAD_hour' || unit === 'CAD_month' || unit === 'CAD_year')
    return { number: formatCAD(v, d, opts), suffix: unit === 'CAD' ? '' : unitSuffix(unit) };
  if (unit === 'persons' || unit === 'count') return { number: formatNumber(v, d, opts), suffix: '' };
  return { number: formatNumber(v, d, { ...opts, signed: unit === 'pp' }), suffix: unitSuffix(unit) };
}

/** Format an observation with its metric's unit and decimals. */
export function formatMetric(v: number | null | undefined, metric: Pick<MetricDef, 'unit' | 'decimals'>, opts: FormatValueOptions = {}): string {
  return formatValue(v, metric.unit, metric.decimals, opts);
}

export function defaultDecimals(unit: Unit): number {
  switch (unit) {
    case 'CAD_hour':
      return 2;
    case 'percent':
    case 'pp':
    case 'degC':
      return 1;
    default:
      return 0;
  }
}

// ------------------------------------------------------------------ periods

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Human period labels:
 *  '2025-Q3' -> 'Q3 2025' · '2025-09' -> 'Sep 2025' · '1991-2020' -> '1991–2020 normals'
 *  '2024/2025' -> '2024/25' · '2023-2024' -> '2023–2024' · '2021' (census) -> '2021 Census'
 *  three_month_avg '2025-09' -> 'Jul–Sep 2025 avg'
 */
export function formatPeriod(period: string | null | undefined, periodType?: MetricDef['periodType']): string {
  if (!period) return DASH;
  const p = period.trim();
  let m = /^(\d{4})-Q([1-4])$/.exec(p);
  if (m) return `Q${m[2]} ${m[1]}`;
  m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) {
    const y = Number(m[1]);
    const mi = Number(m[2]) - 1;
    if (mi < 0 || mi > 11) return p;
    if (periodType === 'three_month_avg') {
      const start = (mi + 10) % 12;
      const sy = mi < 2 ? y - 1 : y;
      return sy === y ? `${MONTHS[start]}–${MONTHS[mi]} ${y} avg` : `${MONTHS[start]} ${sy}–${MONTHS[mi]} ${y} avg`;
    }
    return `${MONTHS[mi]} ${y}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p);
  if (m) return formatDate(p);
  m = /^(\d{4})\/(\d{4})$/.exec(p);
  if (m) return `${m[1]}/${m[2].slice(2)}`;
  m = /^(\d{4})-(\d{4})$/.exec(p);
  if (m) {
    const span = Number(m[2]) - Number(m[1]);
    const normals = periodType === 'normals' || (periodType === undefined && span >= 20);
    return `${m[1]}–${m[2]}${normals ? ' normals' : ''}`;
  }
  if (/^\d{4}$/.test(p) && periodType === 'census') return `${p} Census`;
  return p;
}

/** '2026-10-12' or ISO timestamp -> 'Oct 12, 2026'. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// ------------------------------------------------------------------ geography

/** StatCan names use '--' and ' - ' as separators; display them with en dashes. */
export function cleanGeoName(name: string): string {
  return name.replace(/\s*--\s*/g, '–').replace(/\s+-\s+/g, '–').replace(/\s*\/\s*Grand Sudbury$/, '');
}

/**
 * One-line qualifier for the geography a value actually describes, or null when
 * the value is for the place's own statistical area.
 *   regional_value   -> 'Economic region: Lower Mainland–Southwest'
 *   provincial_value -> 'Province-wide value'
 *   cma_wide         -> 'Whole Ottawa–Gatineau CMA'
 */
export function geoQualifier(o: Pick<Observation, 'geo' | 'flags'> | null | undefined): string | null {
  if (!o) return null;
  const flags = o.flags ?? [];
  const g = o.geo;
  if (flags.includes('provincial_value')) return g?.name ? `Province-wide value (${cleanGeoName(g.name)})` : 'Province-wide value';
  if (flags.includes('national_value')) return 'Canada-wide value';
  if (flags.includes('cma_wide')) return g?.name ? `Whole ${cleanGeoName(g.name)} CMA` : 'Whole CMA value';
  if (flags.includes('regional_value')) return regionQualifier(g);
  if (flags.includes('station_proxy') || g?.level === 'station') return g?.name ? `Station: ${g.name}` : 'Nearest climate station';
  return null;
}

function regionQualifier(g: GeoRef | undefined): string {
  if (!g) return 'Regional value';
  const name = cleanGeoName(g.name);
  switch (g.level) {
    case 'economic_region':
      return `Economic region: ${name}`;
    case 'mbm_region':
      return `Basket region: ${name}`;
    case 'province':
      return `Province-wide value (${name})`;
    case 'cma':
      return `Whole ${name} CMA`;
    default:
      return `Regional value: ${name}`;
  }
}

const MISSING_REASONS: Partial<Record<Flag, string>> = {
  suppressed: 'Suppressed by the source to protect confidentiality or because the estimate is unreliable',
  too_unreliable: 'Withheld: the source rates this estimate too unreliable to publish',
  not_available: 'Not published by the source for this area',
  small_sample: 'Sample too small for a reliable estimate',
};

/** Why a value is missing, from its flags (and note). */
export function missingReason(flags: Flag[] | undefined, note?: string): string {
  const f = flags ?? [];
  const reason =
    (f.includes('too_unreliable') && MISSING_REASONS.too_unreliable) ||
    (f.includes('suppressed') && MISSING_REASONS.suppressed) ||
    (f.includes('small_sample') && MISSING_REASONS.small_sample) ||
    MISSING_REASONS.not_available!;
  return note ? `${reason}. ${note}` : reason;
}

/** Short caution labels for non-missing quality flags. */
export function qualityNotes(flags: Flag[] | undefined): string[] {
  const out: string[] = [];
  for (const f of flags ?? []) {
    if (f === 'use_with_caution') out.push('Use with caution (lower-quality estimate)');
    else if (f === 'preliminary') out.push('Preliminary');
    else if (f === 'revised') out.push('Revised');
    else if (f === 'small_sample') out.push('Small sample');
    else if (f === 'annual_wage') out.push('Published as an annual wage');
  }
  return out;
}

/** "3 places" / "1 place". */
export const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** Ordinal "1st", "22nd". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Compact threshold / axis tick: "$1,400", "6.4%", "−10°", "130k".
 * Drops per-period suffixes (the legend states the unit once).
 */
export function formatTick(v: number, unit: Unit, decimals = 0, compact = false): string {
  const d = Math.min(decimals, Number.isInteger(v) ? 0 : decimals);
  switch (unit) {
    case 'CAD':
    case 'CAD_hour':
    case 'CAD_month':
    case 'CAD_year':
      return formatCAD(v, unit === 'CAD_hour' && !Number.isInteger(v) ? 2 : d, { compact });
    case 'percent':
      return `${formatNumber(v, d)}%`;
    case 'pp':
      return formatNumber(v, d, { signed: true });
    case 'degC':
      return `${formatNumber(v, d)}°`;
    default:
      return formatNumber(v, d, { compact });
  }
}
