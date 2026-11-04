import { Link } from 'react-router-dom';
import type { MetricDef, Place } from '../../types/contract';
import type { CoreData } from '../../data/core';
import { formatMetric, formatPeriod, geoQualifier } from '../../lib/format';
import { buildLayerCatalog } from '../../lib/layers';
import { StripPlot } from '../../charts';
import { MissingValue } from '../ui/EmptyState';
import { SourceNote } from '../ui/SourceNote';
import { climateMetric, comparable, explorerHref, findMetric, isComparable, rankLabel, rankSentence, type Comparable } from './data';
import { useMemo } from 'react';

/** Candidate measures, in reading order. Only those with data for this place are shown. */
function tradeoffMetrics(core: CoreData): MetricDef[] {
  const list: (MetricDef | undefined)[] = [
    findMetric(core, ['rent_asking_1br']),
    findMetric(core, ['rent_vacancy_rate']),
    findMetric(core, ['cost_mbm_total']),
    findMetric(core, ['lfs_unemployment_rate']),
    findMetric(core, ['lfs_employment_rate']),
    climateMetric(core, 1, 'mean'),
    climateMetric(core, 7, 'mean'),
    findMetric(core, ['commute_transit_share']),
    findMetric(core, ['lang_french_knowledge']),
    findMetric(core, ['imm_pr_admissions_per_1000']),
  ];
  return list.filter((m): m is MetricDef => !!m);
}

const SHORT: Record<string, string> = {
  rent_asking_1br: 'Asking rent, 1 bed',
  rent_vacancy_rate: 'Rental vacancy rate',
  cost_mbm_total: 'Basic basket, family of four',
  lfs_unemployment_rate: 'Unemployment rate',
  lfs_employment_rate: 'Employment rate',
  imm_pr_admissions_per_1000: 'New permanent residents per 1,000',
};

const LABELS: Record<string, string> = {
  rent_asking_1br: 'Asking rent for a 1 bedroom',
  rent_vacancy_rate: 'The rental vacancy rate',
  cost_mbm_total: 'The basic-basket cost (family of four)',
  lfs_unemployment_rate: 'The unemployment rate',
  lfs_employment_rate: 'The employment rate',
  imm_pr_admissions_per_1000: 'New permanent residents per 1,000 residents',
  commute_transit_share: 'The share commuting by public transit',
  lang_french_knowledge: 'The share who can speak French',
};

export function Tradeoffs({ core, place }: { core: CoreData; place: Place }) {
  const catalog = useMemo(() => buildLayerCatalog(core.metrics), [core.metrics]);
  const rows = useMemo(() => tradeoffMetrics(core).map((m) => comparable(core, place.id, m)), [core, place.id]);
  const shown = rows.filter((r) => isComparable(r) || r.own);
  const ranked = shown.filter(isComparable);
  if (!shown.length)
    return <MissingValue label="Nothing to compare yet" reason="This place has no values for the measures we compare across places." />;
  return (
    <div className="tradeoffs">
      <ul className="tradeoffs__list">
        {shown.map((r) => {
          const m = r.metric;
          const label = LABELS[m.id] ?? m.label;
          const href = explorerHref(catalog, m, place.id);
          if (!isComparable(r)) {
            const o = r.own;
            return (
              <li key={m.id} className="trade trade--unranked">
                <div className="trade__text">
                  <p className="trade__label">{SHORT[m.id] ?? m.shortLabel}</p>
                  <p className="trade__value num">{o && o.value !== null ? formatMetric(o.value, m) : 'No data'}</p>
                  <p className="trade__sentence">{r.reason}{o && geoQualifier(o) ? ` (${geoQualifier(o)})` : ''}.</p>
                </div>
                <div className="trade__viz trade__viz--empty" aria-hidden="true">
                  <span>Not ranked</span>
                </div>
              </li>
            );
          }
          const c = r as Comparable;
          const sentence = `${label} is ${rankSentence(c)} (${formatPeriod(c.own.period, m.periodType)}).`;
          return (
            <li key={m.id} className="trade">
              <div className="trade__text">
                <p className="trade__label">{SHORT[m.id] ?? m.shortLabel}</p>
                <p className="trade__value num">{formatMetric(c.own.value, m)}</p>
                <p className="trade__sentence">{sentence}</p>
                <p className="trade__rank mono">
                  {rankLabel(c)}
                  {href && (
                    <>
                      {' · '}
                      <Link to={href} className="trade__map">
                        On the map
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="trade__viz">
                <StripPlot
                  items={c.peers.map((p) => ({ id: p.placeId, label: core.placeById.get(p.placeId)?.name ?? p.placeId, value: p.value }))}
                  highlightId={place.id}
                  unit={m.unit}
                  decimals={m.decimals}
                  label={`${place.name}: ${formatMetric(c.own.value, m)}. ${sentence}`}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="tradeoffs__note">
        Each dot is a place with a comparable value — same measure, same period, same source and geography type; {place.name} is the large dot, the tick
        is the median. Places measured on a broader area (territory-wide, province-wide) are not ranked.{' '}
        {ranked.length > 0 && 'Ranks use the map’s order: lowest first for measures where a higher value is worse for newcomers (such as rent), highest first otherwise.'}
      </p>
      <SourceNote sourceId={[...new Set(shown.map((r) => r.own?.sourceId).filter((s): s is string => !!s))]} lead="Sources" />
    </div>
  );
}
