import { Fragment } from 'react';
import type { ChartSpec, MetricDef, Place } from '../../types/contract';
import type { CoreData } from '../../data/core';
import { formatPeriod } from '../../lib/format';
import { ChartRenderer } from '../../charts';
import { ObservationList } from '../data/ObservationList';
import { Disclosure } from '../ui/Disclosure';
import { MissingValue } from '../ui/EmptyState';
import { hasValue } from './data';
import { ListSource } from './ClimateSection';

const GROUPS: { id: string; title: string; test: (m: MetricDef) => boolean }[] = [
  { id: 'pop', title: 'Population and immigrants', test: (m) => m.id.startsWith('pop_') },
  { id: 'lang', title: 'Language', test: (m) => m.id.startsWith('lang_') },
  { id: 'hh', title: 'Households', test: (m) => m.id.startsWith('hh_') },
  { id: 'commute', title: 'Getting to work', test: (m) => m.id.startsWith('commute_') },
];

export const hasPeopleData = (core: CoreData) => core.metrics.some((m) => m.category === 'people');

/** Census 2021 profile: population, language, households, commuting (scope notes from each metric). */
export function PeopleSection({ core, place }: { core: CoreData; place: Place }) {
  const people = core.metrics.filter((m) => m.category === 'people');
  const byPlace = core.obsIndex.get(place.id);
  const groups = GROUPS.map((g) => ({ ...g, items: people.filter(g.test).map((m) => ({ metric: m, obs: byPlace?.get(m.id) })) })).filter((g) => g.items.length);
  const other = people.filter((m) => !GROUPS.some((g) => g.test(m))).map((m) => ({ metric: m, obs: byPlace?.get(m.id) }));
  if (other.length) groups.push({ id: 'other', title: 'More', test: () => true, items: other });
  const any = groups.some((g) => g.items.some((i) => hasValue(i.obs)));
  if (!any) return <MissingValue label="No census profile for this place yet" reason="The snapshot has census measures, but none for this place." />;

  const modes = people.filter((m) => /^commute_(transit|car|active|walk|bike|bicycle|other)/.test(m.id) && m.unit === 'percent');
  const modeObs = modes.map((m) => ({ m, o: byPlace?.get(m.id) })).filter((x) => hasValue(x.o));
  const modeSpec: ChartSpec | null =
    modeObs.length >= 2
      ? {
          id: 'commute-modes',
          type: 'bar_ranked',
          title: 'Main way to get to work',
          subtitle: `Share of commuters · ${formatPeriod(modeObs[0].o!.period, 'census')}`,
          unit: 'percent',
          series: [{ id: 'modes', label: 'Share of commuters', points: modeObs.map((x) => ({ x: x.m.shortLabel.replace(/^commute:\s*/i, ''), y: x.o!.value, f: x.o!.flags })).sort((a, b) => (b.y ?? 0) - (a.y ?? 0)) }],
          sourceIds: [...new Set(modeObs.map((x) => x.o!.sourceId))],
          notes: modes[0]?.basis ?? modes[0]?.description,
        }
      : null;
  const scope = people.filter((m) => m.basis && byPlace?.has(m.id));
  const full = scope.filter((m) => /^100% data/i.test(m.basis ?? ''));
  const sample = scope.filter((m) => /25% sample/i.test(m.basis ?? ''));

  return (
    <div className="ppeople">
      {groups.map((g) => (
        <div key={g.id} className="ppanel">
          <p className="ppanel__title">{g.id === 'commute' && modeSpec ? 'Main way to get to work' : g.title}</p>
          {g.id === 'commute' && modeSpec && <p className="ppanel__note">{modeSpec.subtitle}</p>}
          {g.id === 'commute' && modeSpec ? <ChartRenderer spec={modeSpec} hideTitle linkPlaces={false} showSource={false} /> : null}
          {(() => {
            const rest = g.id === 'commute' && modeSpec ? g.items.filter((i) => !modeObs.some((x) => x.m.id === i.metric.id)) : g.items;
            return rest.length ? <ObservationList items={rest} showSource={false} /> : null;
          })()}
          <ListSource items={g.items} />
        </div>
      ))}
      {scope.length > 0 && (
        <div className="ppanel ppanel--quiet ppeople__scope">
          <p className="ppanel__title">Census scope</p>
          {full.length > 0 && (
            <p className="ppanel__text">
              <strong>Full count (100% data):</strong> {full.map((m) => m.shortLabel).join(', ')}.
            </p>
          )}
          {sample.length > 0 && (
            <p className="ppanel__text">
              <strong>25% long-form sample</strong> — carries sampling variability and random rounding: {sample.map((m) => m.shortLabel).join(', ')}.
            </p>
          )}
          <Disclosure summary="Universe and basis of each measure" variant="plain">
            <dl className="pdl ppeople__dl">
              {scope.map((m) => (
                <Fragment key={m.id}>
                  <dt>{m.shortLabel}</dt>
                  <dd>{m.basis}</dd>
                </Fragment>
              ))}
            </dl>
          </Disclosure>
        </div>
      )}
    </div>
  );
}
