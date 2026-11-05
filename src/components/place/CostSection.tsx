import { useMemo, useState } from 'react';
import type { ChartSpec, MetricDef, Observation, Place } from '../../types/contract';
import type { CoreData } from '../../data/core';
import { mbmMonthly } from '../../model/budget';
import { formatMonthly, formatNumber, formatPeriod } from '../../lib/format';
import { ChartRenderer } from '../../charts';
import { Badge } from '../ui/Badge';
import { ButtonLink } from '../ui/Button';
import { MissingValue } from '../ui/EmptyState';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SourceNote } from '../ui/SourceNote';
import { geoName, hasValue } from './data';

const SIZES = ['1', '2', '3', '4', '5', '6'] as const;
type Size = (typeof SIZES)[number];

const isShelter = (m: MetricDef) => /shelter/i.test(m.dims?.component ?? '') || m.id.endsWith('_shelter');
const isTotal = (m: MetricDef) => /^total$/i.test(m.dims?.component ?? '') || m.id.endsWith('_total');

/** Market Basket Measure components for a chosen household size (square-root scale), shelter shown apart. */
export function CostSection({ core, place }: { core: CoreData; place: Place }) {
  const [size, setSize] = useState<Size>('1');
  const n = Number(size);
  const byPlace = core.obsIndex.get(place.id);
  const metrics = useMemo(() => core.metrics.filter((m) => m.dims?.family === 'cost_mbm' || m.id.startsWith('cost_mbm_')), [core.metrics]);
  const parts = metrics
    .filter((m) => !isShelter(m) && !isTotal(m))
    .map((m) => ({ m, o: byPlace?.get(m.id) }))
    .filter((x): x is { m: MetricDef; o: Observation } => !!x.o);
  const shelterM = metrics.find(isShelter);
  const totalM = metrics.find(isTotal);
  const shelter = shelterM ? byPlace?.get(shelterM.id) : undefined;
  const total = totalM ? byPlace?.get(totalM.id) : undefined;
  const ref = parts.find((p) => hasValue(p.o))?.o ?? total;

  if (!metrics.length) return <MissingValue reason="Basic-basket (Market Basket Measure) costs are not in this data snapshot yet." />;
  if (!ref)
    return <MissingValue label="No basket costs for this place" reason="Statistics Canada publishes no Market Basket Measure region for this place in the snapshot." />;

  const monthly = parts.map((p) => ({ ...p, v: hasValue(p.o) ? mbmMonthly(p.o.value, n, p.o.referenceHouseholdSize ?? (place.province === 'NU' ? 5 : 4)) : null })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  const nonShelter = monthly.every((p) => p.v !== null) ? monthly.reduce((a, p) => a + (p.v ?? 0), 0) : null;
  const shelterMonthly = hasValue(shelter) ? mbmMonthly(shelter.value, n, shelter.referenceHouseholdSize ?? (place.province === 'NU' ? 5 : 4)) : null;
  const referenceSize = ref.referenceHouseholdSize ?? (place.province === 'NU' ? 5 : 4);
  const region = geoName(ref.geo.name);
  const spec: ChartSpec = {
    id: 'mbm',
    type: 'bar_ranked',
    title: `Basic basket without shelter, ${n === 1 ? 'one person' : `${n} people`}, per month`,
    subtitle: `Market Basket Measure ${formatPeriod(ref.period)} · basket region: ${region}`,
    unit: 'CAD_month',
    series: [{ id: 'mbm', label: 'Monthly cost', points: monthly.map((p) => ({ x: p.m.dims?.component ?? p.m.shortLabel, y: p.v, f: p.o.flags })) }],
    sourceIds: [...new Set(parts.map((p) => p.o.sourceId))],
  };

  return (
    <div className="pcost">
      <div className="ppanel pcost__main">
        <div className="pcost__controls">
          <div>
            <p className="label">Household size</p>
            <SegmentedControl
              label="Household size"
              value={size}
              onChange={setSize}
              options={SIZES.map((s) => ({ value: s, label: s === '6' ? '6' : s, title: `${s} ${s === '1' ? 'person' : 'people'}` }))}
            />
          </div>
          <div className="pcost__badges">
            <Badge variant="estimate">Estimate</Badge>
            <span className="pcost__region">Basket region: {region}</span>
          </div>
        </div>
        <ChartRenderer spec={spec} titleLevel={3} linkPlaces={false} showSource={false} />
        <div className="pcost__totals">
          <div>
            <p className="label">Basket without shelter</p>
            <p className="pcost__total num">{nonShelter !== null ? formatMonthly(nonShelter) : 'Incomplete'}</p>
          </div>
          <div>
            <p className="label">Shelter benchmark (not added to rent)</p>
            <p className="pcost__total pcost__total--muted num">{shelterMonthly !== null ? formatMonthly(shelterMonthly) : 'No data'}</p>
          </div>
        </div>
        <SourceNote sourceId={spec.sourceIds} period={ref.period} periodType="year" />
      </div>
      <div className="pcost__side">
        <div className="ppanel ppanel--quiet">
          <p className="ppanel__title">How to read this</p>
          <div className="ppanel__text pcost__explain">
            <p>
              Statistics Canada prices a modest basket — food, clothing, transport, phone and internet, other necessities and shelter — for a reference household of {referenceSize} people in each
              basket region. We scale it to {n === 1 ? 'one person' : `${n} people`} with Statistics Canada’s square-root rule: cost × √{n} ÷ √{referenceSize}
              {n === referenceSize ? ' (the reference family, unchanged)' : ` = ×${formatNumber(Math.sqrt(n / referenceSize), 2)}`}, then ÷ 12 for a month.
            </p>
            <p>
              The shelter part is a benchmark for a modest home, not a rent. Budgets on this site use the sourced asking rent instead and leave shelter out, so housing
              is never counted twice.
            </p>
            <p>These are thresholds of a basic standard of living, not average spending, and the region is the basket’s, not exactly the CMA.</p>
          </div>
          <ButtonLink to={`/budget?place=${encodeURIComponent(place.id)}`} variant="outline" iconRight="arrowRight" size="sm">
            Build a budget
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
