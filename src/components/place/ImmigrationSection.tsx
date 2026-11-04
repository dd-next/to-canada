import { Link } from 'react-router-dom';
import type { ChartSpec, Place, ProgramRecord, Series } from '../../types/contract';
import type { CoreData } from '../../data/core';
import type { Loadable } from '../../data/useJSON';
import { formatDate } from '../../lib/format';
import { provinceName } from '../../lib/places';
import { ChartRenderer } from '../../charts';
import { ObservationList } from '../data/ObservationList';
import { Badge } from '../ui/Badge';
import { ButtonLink } from '../ui/Button';
import { MissingValue } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { GroupSource, ObsStat } from './KeyFacts';
import { findMetric, findSeries, geoName, lineSpec, toChartSeries } from './data';
import { ListSource } from './ClimateSection';

const CATEGORY: Record<ProgramRecord['category'], string> = {
  federal_economic: 'Federal',
  provincial_nominee: 'Provincial nominee',
  quebec: 'Quebec selection',
  community_pilot: 'Community pilot',
  atlantic: 'Atlantic',
  settlement_support: 'Settlement support',
  pre_arrival: 'Before you arrive',
};
const STATUS: Record<NonNullable<ProgramRecord['status']>['value'], string> = {
  open: 'Open',
  paused: 'Paused',
  closed: 'Closed',
  intake_rounds: 'Intake rounds',
};

export const hasImmigrationData = (core: CoreData) => core.metrics.some((m) => m.category === 'immigration');

/** Programs that apply to a place: its province's nominee program (or Quebec's system), community pilots naming it, the Atlantic program. */
export function programsFor(programs: ProgramRecord[], place: Place): ProgramRecord[] {
  const out = programs.filter(
    (p) =>
      (p.placeIds ?? []).includes(place.id) ||
      (!p.parentId && p.jurisdiction === place.province && (p.category === 'provincial_nominee' || p.category === 'quebec')) ||
      (p.category === 'atlantic' && place.region === 'atlantic'),
  );
  const rank = (p: ProgramRecord) => ((p.placeIds ?? []).includes(place.id) ? 0 : p.jurisdiction === place.province ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function ImmigrationSection({ core, place, series, programs }: { core: CoreData; place: Place; series: Series[] | undefined; programs: Loadable<ProgramRecord[]> }) {
  const pr = findMetric(core, ['imm_pr_admissions']);
  const per = findMetric(core, ['imm_pr_admissions_per_1000']);
  const chg = findMetric(core, ['imm_pr_admissions_change']);
  const s = findSeries(series, 'imm_pr_admissions');
  const spec: ChartSpec | null = s
    ? lineSpec({
        id: 'pr-admissions',
        title: 'New permanent residents by intended destination',
        subtitle: `Admissions per calendar year · ${geoName(s.geo.name)}${s.dims?.basis ? ` · ${s.dims.basis}` : ''}`,
        unit: 'persons',
        series: [toChartSeries(s, place.name, place.id)],
        sourceIds: [s.sourceId],
        notes: 'Counts people at landing by the destination they declared, not where they live now. IRCC rounds counts to protect privacy.',
      })
    : null;
  const outcomes = ['imm_retention_cma_5y', 'imm_retention_5y', 'imm_median_wages_5y']
    .map((id) => core.metricById.get(id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({ metric: m, obs: core.obsIndex.get(place.id)?.get(m.id) }));
  const list = programs.data ? programsFor(programs.data, place) : [];

  return (
    <div className="pimm">
      <div className="pimm__main">
        <div className="ppanel">
          <div className="pstats pstats--3">
            <ObsStat core={core} place={place} metric={pr} label="New permanent residents" source={false} />
            <ObsStat core={core} place={place} metric={per} label="Per 1,000 residents" source={false} />
            <ObsStat core={core} place={place} metric={chg} label="Change on the year before" source={false} />
          </div>
          <GroupSource core={core} place={place} metrics={[pr, per, chg]} />
          {spec ? (
            <ChartRenderer spec={spec} titleLevel={3} linkPlaces={false} highlightIds={[place.id]} height={230} />
          ) : (
            <MissingValue compact label="No admissions history" reason="No IRCC admissions series for this place in the snapshot." />
          )}
        </div>
        {outcomes.length > 0 && (
          <div className="ppanel">
            <p className="ppanel__title">Five years after landing</p>
            <ObservationList items={outcomes} showSource={false} />
            <ListSource items={outcomes} />
          </div>
        )}
      </div>
      <div className="pimm__side">
        <div className="ppanel">
          <p className="ppanel__title">Programs that name {place.name} or {provinceName(place.province)}</p>
          {programs.loading && <p className="ppanel__text">Loading programs…</p>}
          {programs.error && <MissingValue compact label="Programs could not be loaded" reason={programs.error.message} />}
          {programs.data && list.length === 0 && (
            <p className="ppanel__text">No province-, territory- or community-specific program in the directory names this place. Federal programs apply everywhere.</p>
          )}
          <ul className="pprog">
            {list.map((p) => (
              <li key={p.id}>
                <div className="pprog__head">
                  <Badge variant="neutral">{CATEGORY[p.category]}</Badge>
                  {p.status && (
                    <Badge variant={p.status.value === 'open' ? 'sourced' : 'caution'} title={p.status.note}>
                      {STATUS[p.status.value]}
                    </Badge>
                  )}
                </div>
                <a href={p.officialUrl} target="_blank" rel="noreferrer noopener" className="pprog__name">
                  {p.name}
                  <Icon name="external" size={14} />
                </a>
                <p className="pprog__purpose">{p.purpose}</p>
                <p className="pprog__meta mono">
                  {p.operator} · Job offer: {p.jobOfferRequired.replace('_', ' ')} · checked {formatDate(p.lastChecked)}
                </p>
              </li>
            ))}
          </ul>
          <div className="cluster">
            <ButtonLink to={`/immigration?province=${place.province}`} variant="outline" size="sm" iconRight="arrowRight">
              Programs in {provinceName(place.province)}
            </ButtonLink>
            {list.some((p) => (p.placeIds ?? []).includes(place.id)) && (
              <ButtonLink to={`/immigration?place=${encodeURIComponent(place.id)}`} variant="ghost" size="sm" iconRight="arrowRight">
                Community pilots here
              </ButtonLink>
            )}
          </div>
          <p className="ppanel__note">
            Reference only, not eligibility advice. Status is shown only where the official page stated it on the day it was checked. <Link to="/immigration">All programs</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
