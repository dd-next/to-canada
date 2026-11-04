/** Formatting, accessible summaries and missing-data notes for ChartSpecs. */
import type { ChartPoint, ChartSeries, ChartSpec, Flag, MetricDef, Unit } from '../types/contract';
import { defaultDecimals, formatValue, missingReason, plural, qualityNotes } from '../lib/format';
import { isPartialX, orderXs, xKindOf, xLabelFull } from './axes';

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Decimals for a chart: the unit default for money / percent / temperature, else 1 when values are fractional. */
export function chartDecimals(unit: Unit, values: (number | null | undefined)[]): number {
  if (unit === 'CAD' || unit === 'CAD_hour' || unit === 'CAD_month' || unit === 'CAD_year' || unit === 'percent' || unit === 'pp' || unit === 'degC') return defaultDecimals(unit);
  const finite = values.filter(isNum);
  if (finite.every((v) => Number.isInteger(v))) return 0;
  const max = Math.max(...finite.map(Math.abs));
  return max < 100 ? 1 : 0;
}

/** Value with unit for tooltips, labels and tables ("$2,090/mo", "6.9%", "−5.5 °C", "23.3 per 1,000"). */
export function fmt(v: number | null | undefined, unit: Unit, decimals: number): string {
  return formatValue(v, unit, decimals);
}

/** Point label that adds information beyond the category name (e.g. "within sampling error"). */
export function pointNote(p: ChartPoint): string | undefined {
  const l = p.label?.trim();
  if (!l || l === String(p.x).trim()) return undefined;
  return l;
}

/** Short quality notes for point flags (rounded, use with caution, regional…). */
export function flagNotes(f: Flag[] | undefined): string[] {
  const out = qualityNotes(f);
  for (const x of f ?? []) {
    if (x === 'rounded') out.push('Rounded by the source');
    else if (x === 'provincial_value') out.push('Province-wide value');
    else if (x === 'regional_value') out.push('Regional value');
    else if (x === 'cma_wide') out.push('Whole-CMA value');
    else if (x === 'station_proxy') out.push('Nearest climate station');
  }
  return [...new Set(out)];
}

export const missingText = (p: ChartPoint | undefined) => (p?.f?.length ? missingReason(p.f) : 'No published value');

export const allValues = (spec: ChartSpec) => spec.series.flatMap((s) => s.points.flatMap((p) => [p.y, p.y0 ?? null, p.y1 ?? null]));

export function seriesPlace(s: ChartSeries): string | undefined {
  return s.placeId ?? (s.points.length && s.points.every((p) => p.placeId && p.placeId === s.points[0].placeId) ? s.points[0].placeId : undefined);
}

/** Missing-data note under a chart. Null values are gaps or omitted, never zero. */
export function missingNote(spec: ChartSpec, periodType?: MetricDef['periodType']): string | null {
  const parts: string[] = [];
  if (spec.type === 'line' || spec.type === 'monthly_climate') {
    const kind = xKindOf(spec.series.flatMap((s) => s.points.map((p) => p.x)));
    const gaps = spec.series
      .map((s) => ({ s, n: s.points.filter((p) => p.y === null).length, first: s.points.find((p) => p.y === null) }))
      .filter((g) => g.n > 0);
    if (gaps.length) {
      const total = gaps.reduce((a, g) => a + g.n, 0);
      const ex = gaps[0].first ? ` (e.g. ${spec.series.length > 1 ? `${gaps[0].s.label}, ` : ''}${xLabelFull(gaps[0].first.x, kind, periodType)})` : '';
      parts.push(`No data for ${plural(total, 'point')}${ex}: shown as gaps in the line, not as zero.`);
    }
    if (spec.series.some((s) => s.points.some((p) => isPartialX(p.x) && p.y !== null)))
      parts.push('Hollow markers are partial (year-to-date) periods, not comparable with full-year totals.');
  } else if (spec.type === 'scatter') {
    const n = spec.series.reduce((a, s) => a + s.points.filter((p) => !isNum(p.y) || !isNum(typeof p.x === 'number' ? p.x : Number(p.x))).length, 0);
    if (n) parts.push(`${plural(n, 'point')} without both values ${n === 1 ? 'is' : 'are'} omitted.`);
  } else {
    const missing: string[] = [];
    for (const s of spec.series)
      for (const p of s.points) if (p.y === null && (spec.type !== 'range' || (p.y0 == null && p.y1 == null))) missing.push(spec.series.length > 1 ? `${p.x} (${s.label})` : String(p.x));
    if (missing.length) {
      const list = missing.length <= 6 ? missing.join(', ') : `${missing.slice(0, 5).join(', ')} and ${missing.length - 5} more`;
      parts.push(`No data: ${list}. Marked “No data” in the chart, never drawn as zero.`);
    }
  }
  return parts.length ? parts.join(' ') : null;
}

const listing = (items: string[]) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** One-paragraph accessible summary of what the chart shows. */
export function chartSummary(spec: ChartSpec, periodType?: MetricDef['periodType']): string {
  const unit = spec.unit;
  const values = allValues(spec);
  const d = chartDecimals(unit, values);
  const f = (v: number | null | undefined) => fmt(v, unit, d);
  const head = spec.title.replace(/\.$/, '');
  switch (spec.type) {
    case 'bar_ranked': {
      const pts = (spec.series[0]?.points ?? []).filter((p) => isNum(p.y));
      if (!pts.length) return `${head}. Bar chart with no published values.`;
      const hi = pts.reduce((a, b) => (b.y! > a.y! ? b : a));
      const lo = pts.reduce((a, b) => (b.y! < a.y! ? b : a));
      return `${head}. Bar chart of ${plural(pts.length, 'value')}. Highest: ${hi.x}, ${f(hi.y)}. Lowest: ${lo.x}, ${f(lo.y)}.`;
    }
    case 'line': {
      const xs = spec.series.flatMap((s) => s.points.map((p) => p.x));
      const kind = xKindOf(xs);
      const ordered = orderXs(xs, kind).filter((x) => !isPartialX(x));
      const latest = spec.series
        .map((s) => {
          const last = [...s.points].filter((p) => !isPartialX(p.x)).reverse().find((p) => isNum(p.y));
          return last ? `${s.label} ${f(last.y)}` : null;
        })
        .filter((x): x is string => !!x)
        .slice(0, 8);
      const span = ordered.length ? `from ${xLabelFull(ordered[0], kind, periodType, spec.xLabel)} to ${xLabelFull(ordered[ordered.length - 1], kind, periodType, spec.xLabel)}` : '';
      return `${head}. Line chart, ${plural(spec.series.length, 'series', 'series')} ${span}. Latest values: ${latest.join('; ')}.`;
    }
    case 'dot_compare': {
      const cats = new Set(spec.series.flatMap((s) => s.points.map((p) => String(p.x))));
      return `${head}. Dot plot comparing ${listing(spec.series.map((s) => s.label))} for ${plural(cats.size, 'category', 'categories')}.`;
    }
    case 'range': {
      const pts = spec.series.flatMap((s) => s.points).filter((p) => isNum(p.y));
      const hi = pts.length ? pts.reduce((a, b) => (b.y! > a.y! ? b : a)) : null;
      const lo = pts.length ? pts.reduce((a, b) => (b.y! < a.y! ? b : a)) : null;
      return `${head}. Range chart of low, median and high values for ${plural(spec.series.reduce((a, s) => a + s.points.length, 0), 'row')}.${hi && lo ? ` Highest median: ${hi.x}, ${f(hi.y)}. Lowest median: ${lo.x}, ${f(lo.y)}.` : ''}`;
    }
    case 'scatter': {
      const n = spec.series.reduce((a, s) => a + s.points.length, 0);
      return `${head}. Scatter plot of ${plural(n, 'point')}${spec.xLabel ? `; across: ${spec.xLabel}` : ''}${spec.yLabel ? `; up: ${spec.yLabel}` : ''}.`;
    }
    case 'stacked_bar': {
      const cats = new Set(spec.series.flatMap((s) => s.points.map((p) => String(p.x))));
      return `${head}. Stacked bars of ${listing(spec.series.map((s) => s.label))} for ${plural(cats.size, 'category', 'categories')}.`;
    }
    case 'monthly_climate':
      return `${head}. Monthly climate normals: temperature by month with daily high and low, and monthly precipitation.`;
    case 'slope': {
      const xs = orderXs(spec.series.flatMap((s) => s.points.map((p) => p.x)), 'category');
      return `${head}. Slope chart comparing ${listing(xs.map(String).slice(0, 2))} for ${plural(spec.series.length, 'category', 'categories')}.`;
    }
    default:
      return head;
  }
}
