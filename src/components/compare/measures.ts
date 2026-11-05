/**
 * Measures for the comparison: every metric (plus the profession wage and the
 * rent-share calculation) as one LayerDatum per place, so the table and the
 * dot strips read the same honest data.
 */
import type { CoreData } from '../../data/core';
import type { MetricCategory, MetricDef, Occupation, Unit, WageTable } from '../../types/contract';
import { formatPeriod } from '../../lib/format';
import { buildMetricLayer, buildWageLayer, buildRentShareLayer, monthIndex, WAGE_LAYER_KEY, type LayerDatum } from '../../lib/layers';
import { FULL_TIME_HOURS_PER_WEEK } from '../../model/pay';

export interface Measure {
  id: string;
  label: string;
  shortLabel: string;
  category: MetricCategory;
  unit: Unit;
  decimals: number;
  higherIs: MetricDef['higherIs'];
  periodType?: MetricDef['periodType'];
  sourceIds: string[];
  /** Plain-English description / basis. */
  description?: string;
  /** Derived by Northward (labelled CALCULATION). */
  calculation?: boolean;
  data: Map<string, LayerDatum>;
}

const SHOW_MONTHS = new Set([1, 7]);

export function buildMeasures(core: CoreData, unitType: string, occupation: Pick<Occupation, 'noc' | 'title'> | null, wages: WageTable | undefined): Measure[] {
  const out: Measure[] = [];
  const places = core.places;
  const rentMetric = core.metrics.find((m) => m.dims?.family === 'rent_asking' && m.dims?.unitType === unitType);

  for (const m of core.metrics) {
    const t = m.dims?.unitType;
    if (t && t !== unitType) continue;
    const mi = monthIndex(m.dims?.month);
    if (mi !== null && !SHOW_MONTHS.has(mi)) continue;
    const layer = buildMetricLayer(m, places, core.obsIndex);
    if (![...layer.data.values()].some((d) => d.obs)) continue;
    out.push({
      id: m.id,
      label: m.label,
      shortLabel: m.shortLabel,
      category: m.category,
      unit: m.unit,
      decimals: m.decimals,
      higherIs: m.higherIs,
      periodType: m.periodType,
      sourceIds: m.sourceIds,
      description: m.basis ?? m.description,
      data: layer.data,
    });
  }

  if (occupation && wages) {
    const wl = buildWageLayer(wages, occupation, places);
    out.push({
      id: WAGE_LAYER_KEY,
      label: wl.metric.label,
      shortLabel: `Median wage: ${occupation.title}`,
      category: 'work',
      unit: wl.metric.unit,
      decimals: wl.metric.decimals,
      higherIs: 'better',
      periodType: 'period',
      sourceIds: wl.metric.sourceIds,
      description: 'Wages of employed workers in the main economic region (gross, before tax; not advertised pay).',
      data: wl.data,
    });
    if (rentMetric) {
      const rl = buildMetricLayer(rentMetric, places, core.obsIndex);
      const data = buildRentShareLayer(rl, wl, occupation, places).data;
      out.push({
        id: 'rent_share',
        label: `Rent as share of gross pay: ${occupation.title}`,
        shortLabel: 'Rent ÷ gross pay',
        category: 'housing',
        unit: 'percent',
        decimals: 0,
        higherIs: 'worse',
        periodType: rentMetric.periodType,
        sourceIds: [...rentMetric.sourceIds, ...wl.metric.sourceIds],
        description: `Asking rent (${unitType.toLowerCase()}) ÷ gross monthly median wage (${FULL_TIME_HOURS_PER_WEEK} h/week). Gross, before tax — not take-home.`,
        calculation: true,
        data,
      });
    }
  }
  return out;
}

/**
 * Best and worst place ids — only when EVERY compared value exists and is comparable:
 * same unit, same period, same kind of geography (no regional/provincial mix).
 */
export function bestWorst(higherIs: MetricDef['higherIs'], cells: LayerDatum[]): { best: Set<string>; worst: Set<string>; reason: string | null } {
  const none = (reason: string | null) => ({ best: new Set<string>(), worst: new Set<string>(), reason });
  if (higherIs === 'neutral' || cells.length < 2) return none(null);
  if (cells.some((c) => c.status !== 'ok')) return none('Not ranked: geography, period or methodology is not comparable');
  if (new Set(cells.map((c) => c.comparisonKey)).size > 1) return none('Not ranked: different measurement methods or geography');
  if (cells.some((c) => c.value === null)) return none('Not ranked: a value is missing');
  if (new Set(cells.map((c) => c.period)).size > 1) return none('Not ranked: different periods');
  if (new Set(cells.map((c) => c.shownUnit)).size > 1) return none('Not ranked: different units');
  const vals = cells.map((c) => c.value!);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  if (hi === lo) return none(null);
  const goodHigh = higherIs === 'better';
  return {
    best: new Set(cells.filter((c) => c.value === (goodHigh ? hi : lo)).map((c) => c.placeId)),
    worst: new Set(cells.filter((c) => c.value === (goodHigh ? lo : hi)).map((c) => c.placeId)),
    reason: null,
  };
}

export const periodLabel = (m: Pick<Measure, 'periodType'>, d: LayerDatum) => (d.period ? formatPeriod(d.period, m.periodType) : null);
