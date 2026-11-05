import type { MetricDef, Observation, Place } from '../types/contract';

/** Eligibility for a city ranking. Context values remain visible outside it. */
export function cityRankingReason(o: Observation, place: Place): string | null {
  if (o.flags?.some((f) => ['regional_value', 'provincial_value', 'national_value', 'station_proxy', 'cma_wide'].includes(f)))
    return 'Broader area or station proxy — shown as context, not ranked as a city value';
  const expected = { cma: place.geo.cma, ca: place.geo.cma, cma_part: place.geo.cmaPart, csd: place.geo.principalCsd };
  const local = expected[o.geo.level as keyof typeof expected];
  if (!local || local.level !== o.geo.level || local.id !== o.geo.id)
    return 'Different geographic coverage — shown as context, not ranked as a city value';
  return null;
}

/** Values only share a scale/rank when their measurement contracts match. */
export function comparisonKey(metric: MetricDef, o: Observation): string {
  return JSON.stringify([o.geo.level, metric.unit, o.sourceId, o.methodology ?? metric.basis ?? '',
    metric.seasonalAdjustment ?? '', metric.priceBasis ?? '', metric.priceBaseYear ?? '', o.referenceHouseholdSize ?? null]);
}
