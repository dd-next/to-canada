import type { MetricDef, Observation, Occupation, Place, WageTable } from '../../types/contract';
import type { CoreData } from '../../data/core';
import { formatPeriod, formatValue, geoQualifier, missingReason, splitValue } from '../../lib/format';
import { lookupWage } from '../../lib/layers';
import { Button } from '../ui/Button';
import { MissingValue } from '../ui/EmptyState';
import { SourceNote } from '../ui/SourceNote';
import { Stat } from '../ui/Stat';
import { climateMetric, findMetric, geoName, hasValue, noWageReason, wagePeriod } from './data';

const NOT_IN_SNAPSHOT = 'Not in this data snapshot yet';

/** One source line for a group of stats (ids and the period of the first observation). */
export function GroupSource({ core, place, metrics }: { core: CoreData; place: Place; metrics: (MetricDef | undefined)[] }) {
  const obs = metrics.map((m) => (m ? core.obsIndex.get(place.id)?.get(m.id) : undefined)).filter((o): o is Observation => !!o);
  const ids = [...new Set(obs.map((o) => o.sourceId))];
  if (!ids.length) return null;
  const periods = [...new Set(obs.map((o) => o.period))];
  const m = metrics.find(Boolean);
  return <SourceNote sourceId={ids} period={periods.length === 1 ? periods[0] : null} periodType={m?.periodType} />;
}

export function ObsStat({
  core,
  place,
  metric,
  label,
  size = 'md',
  source = true,
  children,
}: {
  core: CoreData;
  place: Place;
  metric: MetricDef | undefined;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Show the source line under the stat (turn off when a group shares one source note). */
  source?: boolean;
  children?: React.ReactNode;
}) {
  const o: Observation | undefined = metric ? core.obsIndex.get(place.id)?.get(metric.id) : undefined;
  const ok = hasValue(o);
  return (
    <Stat
      size={size}
      label={label ?? metric?.shortLabel ?? '—'}
      value={ok ? o.value : null}
      unit={metric?.unit ?? 'count'}
      decimals={metric?.decimals}
      period={o?.period ?? null}
      periodType={metric?.periodType}
      qualifier={geoQualifier(o)}
      flags={o?.flags}
      note={o?.note && !ok ? o.note : undefined}
      missingReason={!metric ? NOT_IN_SNAPSHOT : !o ? 'No observation for this place in the current snapshot' : ok ? null : missingReason(o.flags, o.note)}
      sourceId={source ? (o?.sourceId ?? metric?.sourceIds) : null}
    >
      {children}
    </Stat>
  );
}

export interface KeyFactsProps {
  core: CoreData;
  place: Place;
  occupation: Occupation | null;
  wages: WageTable | undefined;
  wagesLoading: boolean;
  onPickProfession: () => void;
}

/** The profile's headline numbers, each with period, geography qualifier and source. */
export function KeyFacts({ core, place, occupation, wages, wagesLoading, onPickProfession }: KeyFactsProps) {
  const rent = findMetric(core, ['rent_asking_1br'], (m) => m.dims?.family === 'rent_asking' && m.dims?.unitType === '1 bedroom');
  const vacancy = findMetric(core, ['rent_vacancy_rate']);
  const unemployment = findMetric(core, ['lfs_unemployment_rate']);
  const pr = findMetric(core, ['imm_pr_admissions']);
  const per1000 = findMetric(core, ['imm_pr_admissions_per_1000']);
  const perObs = per1000 ? core.obsIndex.get(place.id)?.get(per1000.id) : undefined;
  const jan = climateMetric(core, 1, 'mean');
  const jul = climateMetric(core, 7, 'mean');

  return (
    <ul className="pfacts" aria-label={`Key numbers for ${place.name}`}>
      <li>
        <ObsStat core={core} place={place} metric={rent} label="Asking rent, 1 bedroom" />
      </li>
      <li>
        <ObsStat core={core} place={place} metric={vacancy} label="Rental vacancy rate" />
      </li>
      <li>
        <ObsStat core={core} place={place} metric={unemployment} label="Unemployment rate" />
      </li>
      <li>
        <WageFact place={place} occupation={occupation} wages={wages} loading={wagesLoading} onPick={onPickProfession} />
      </li>
      <li>
        <ClimateFact core={core} place={place} jan={jan} jul={jul} />
      </li>
      <li>
        <ObsStat core={core} place={place} metric={pr} label="New permanent residents">
          {hasValue(perObs) && per1000 && <p className="pfacts__extra num">{formatValue(perObs.value, per1000.unit, 1)} residents</p>}
        </ObsStat>
      </li>
    </ul>
  );
}

function WageFact({ place, occupation, wages, loading, onPick }: { place: Place; occupation: Occupation | null; wages: WageTable | undefined; loading: boolean; onPick: () => void }) {
  if (!occupation)
    return (
      <div className="stat stat--md pfacts__prompt">
        <div className="stat__label label">Median wage in your line of work</div>
        <p className="pfacts__prompt-text">Choose a profession to see what people employed in it earn here.</p>
        <Button size="sm" variant="outline" icon="briefcase" onClick={onPick}>
          Choose a profession
        </Button>
      </div>
    );
  if (loading || !wages)
    return (
      <div className="stat stat--md">
        <div className="stat__label label">Median wage · {occupation.title}</div>
        <p className="pfacts__loading">Loading wages…</p>
      </div>
    );
  const cell = lookupWage(wages, occupation.noc, place);
  return (
    <Stat
      size="md"
      label={`Median wage · ${occupation.title}`}
      value={cell?.median ?? null}
      unit={cell?.annual ? 'CAD_year' : 'CAD_hour'}
      period={cell?.referencePeriod ?? 'Not recorded'}
      periodType="period"
      qualifier={cell ? (cell.fallback === 'province' ? `Province-wide value (${geoName(cell.geo.name)}) — no economic-region wage` : `Economic region: ${geoName(cell.geo.name)}`) : null}
      flags={cell ? [cell.fallback === 'province' ? 'provincial_value' : 'regional_value', ...(cell.annual ? (['annual_wage'] as const) : [])] : ['not_available']}
      missingReason={cell ? null : noWageReason(place)}
      sourceId={wages.sourceId}
    >
      <p className="pfacts__extra">Employed workers’ wages, not job-ad pay · {wagePeriod(cell)}</p>
    </Stat>
  );
}

function ClimateFact({ core, place, jan, jul }: { core: CoreData; place: Place; jan: MetricDef | undefined; jul: MetricDef | undefined }) {
  const oj = jan ? core.obsIndex.get(place.id)?.get(jan.id) : undefined;
  const ol = jul ? core.obsIndex.get(place.id)?.get(jul.id) : undefined;
  const label = 'Mean temperature, January · July';
  if (!hasValue(oj) && !hasValue(ol))
    return (
      <div className="stat stat--md stat--missing">
        <div className="stat__label label">{label}</div>
        <MissingValue reason={!jan && !jul ? 'Climate normals (1991–2020) are not in this data snapshot yet' : missingReason(oj?.flags ?? ol?.flags, oj?.note ?? ol?.note)} />
      </div>
    );
  const part = (o: Observation | undefined, m: MetricDef | undefined) => {
    if (!hasValue(o) || !m) return <span className="pfacts__na">No data</span>;
    const { number, suffix } = splitValue(o.value, m.unit, m.decimals);
    return (
      <span className="pfacts__temp">
        <span className="stat__number">{number}</span>
        <span className="stat__unit">{suffix}</span>
      </span>
    );
  };
  const o = hasValue(oj) ? oj : ol!;
  const station = place.climateStation;
  return (
    <div className="stat stat--md">
      <div className="stat__label label">{label}</div>
      <div className="stat__value num pfacts__pair">
        {part(oj, jan)}
        <span className="pfacts__sep" aria-hidden="true">
          /
        </span>
        {part(ol, jul)}
      </div>
      <p className="stat__meta">
        <span className="stat__period">{formatPeriod(o.period, 'normals')}</span>
        {(station || geoQualifier(o)) && <> · {station ? `Station: ${station.name}` : geoQualifier(o)}</>}
      </p>
      <SourceNote sourceId={o.sourceId} period={o.period} periodType="normals" />
    </div>
  );
}
