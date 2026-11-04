import { useMemo, useState } from 'react';
import type { ChartSpec, Place, Series } from '../../types/contract';
import type { CoreData } from '../../data/core';
import { formatPeriod, geoQualifier } from '../../lib/format';
import { unitTypeShort } from '../../lib/layers';
import { ChartRenderer } from '../../charts';
import { ButtonLink } from '../ui/Button';
import { MissingValue } from '../ui/EmptyState';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SourceNote } from '../ui/SourceNote';
import { ObsStat } from './KeyFacts';
import { findMetric, findSeries, geoName, hasValue, lineSpec, rentGrid, toChartSeries } from './data';

export function HousingSection({ core, place, series, seriesLoading }: { core: CoreData; place: Place; series: Series[] | undefined; seriesLoading: boolean }) {
  const grid = useMemo(() => rentGrid(core, place.id), [core, place.id]);
  const [bed, setBed] = useState<'1br' | '2br'>('1br');

  // Rents by unit type: one series per source family, unit types as categories.
  const rentSpec: ChartSpec = useMemo(
    () => ({
      id: 'rents-by-type',
      type: 'dot_compare',
      title: 'Rent by unit type',
      subtitle: 'Asking rents are advertised prices for new leases; the CMHC average covers all tenants in purpose-built rentals; paid rent is what sitting tenants pay.',
      unit: 'CAD_month',
      series: grid.fams.map((f) => ({
        id: f.family,
        label: `${f.short}${f.period ? ` · ${formatPeriod(f.period, f.periodType)}` : ''}`,
        points: grid.unitTypes
          .filter((u) => f.cells.has(u))
          .map((u) => {
            const c = f.cells.get(u)!;
            return { x: unitTypeShort(u), y: hasValue(c.obs) ? c.obs.value : null, f: c.obs ? c.obs.flags : ['not_available' as const] };
          }),
      })),
      sourceIds: [...new Set(grid.fams.map((f) => f.sourceId).filter((s): s is string => !!s))],
    }),
    [grid],
  );
  const anyRent = grid.fams.some((f) => [...f.cells.values()].some((c) => hasValue(c.obs)));
  const missingNotes = grid.fams
    .map((f) => {
      const cells = [...f.cells.values()];
      if (cells.some((c) => hasValue(c.obs))) return null;
      const note = cells.find((c) => c.obs?.note)?.obs?.note;
      return { label: f.label as string, note: note ?? 'No values for this place in the snapshot' };
    })
    .filter((x): x is { label: string; note: string } => x !== null);
  const geoLine = grid.fams
    .flatMap((f) => [...f.cells.values()])
    .map((c) => c.obs)
    .find((o) => hasValue(o));

  const askS = findSeries(series, `rent_asking_${bed}`);
  const paidS = findSeries(series, `rent_paid_${bed}`);
  const histSpec: ChartSpec | null =
    askS || paidS
      ? lineSpec({
          id: `rent-history-${bed}`,
          title: `${bed === '1br' ? '1-bedroom' : '2-bedroom'} rent over time`,
          subtitle: `Quarterly · ${geoName((askS ?? paidS)!.geo.name)} · current dollars`,
          unit: 'CAD_month',
          series: [askS && toChartSeries(askS, 'Asking rent'), paidS && toChartSeries(paidS, 'Paid rent')].filter((x): x is NonNullable<typeof x> => !!x),
          sourceIds: [...new Set([askS?.sourceId, paidS?.sourceId].filter((x): x is string => !!x))],
          notes: paidS ? 'Paid rent is StatCan’s average of what tenants pay (a three-quarter moving average); asking rent is the advertised price of units for rent.' : undefined,
        })
      : null;

  const cpiRent = findSeries(series, 'cpi_rent_change_1y');
  const cpiAll = findSeries(series, 'cpi_all_items_change_1y');
  const cpiSpec: ChartSpec | null =
    cpiRent || cpiAll
      ? lineSpec({
          id: 'cpi',
          title: 'Price change over 12 months',
          subtitle: `Consumer Price Index · ${geoName((cpiRent ?? cpiAll)!.geo.name)} · not seasonally adjusted`,
          unit: 'percent',
          series: [cpiRent && toChartSeries(cpiRent, 'Rent (CPI)'), cpiAll && toChartSeries(cpiAll, 'All items')].filter((x): x is NonNullable<typeof x> => !!x),
          sourceIds: [...new Set([cpiRent?.sourceId, cpiAll?.sourceId].filter((x): x is string => !!x))],
          notes: 'The CPI measures price change, not price levels: it cannot say which city is cheaper. The rent index follows rents already being paid, including renewals.',
        })
      : null;

  const vacancy = findMetric(core, ['rent_vacancy_rate']);
  const change = findMetric(core, ['rent_asking_1br_change_1y']);
  const cpiR = findMetric(core, ['cpi_rent_change_1y']);
  const cpiRObs = cpiR ? core.obsIndex.get(place.id)?.get(cpiR.id) : undefined;

  return (
    <div className="phousing">
      <div className="phousing__main">
        {anyRent ? (
          <div className="ppanel">
            <ChartRenderer spec={rentSpec} titleLevel={3} linkPlaces={false} />
            {geoLine && geoQualifier(geoLine) && <p className="ppanel__note">{geoQualifier(geoLine)}</p>}
            {missingNotes.map((m) => (
              <MissingValue key={m.label} compact what={m.label} reason={m.note} />
            ))}
          </div>
        ) : (
          <div className="ppanel">
            <p className="ppanel__title">Rent by unit type</p>
            {missingNotes.map((m) => (
              <MissingValue key={m.label} what={m.label} reason={m.note} />
            ))}
            <p className="ppanel__text">
              Neither StatCan’s asking-rent table nor CMHC’s Rental Market Survey covers {place.name} in this snapshot. Local listings and the territorial or
              provincial housing office are the places to check.
            </p>
          </div>
        )}
        {histSpec ? (
          <div className="ppanel">
            <ChartRenderer
              spec={histSpec}
              titleLevel={3}
              linkPlaces={false}
              height={240}
              controls={
                <SegmentedControl
                  label="Unit type"
                  size="sm"
                  value={bed}
                  onChange={setBed}
                  options={[
                    { value: '1br', label: '1 bed' },
                    { value: '2br', label: '2 bed', disabled: !findSeries(series, 'rent_asking_2br') && !findSeries(series, 'rent_paid_2br') },
                  ]}
                />
              }
            />
          </div>
        ) : (
          !seriesLoading && anyRent && <MissingValue compact label="No rent history" reason="No quarterly rent series for this place in the snapshot." />
        )}
      </div>
      <div className="phousing__side">
        <div className="ppanel">
          <p className="ppanel__title">Vacancy and change</p>
          <div className="pstats">
            <ObsStat core={core} place={place} metric={vacancy} label="Rental vacancy rate" />
            <ObsStat core={core} place={place} metric={change} label="Asking rent, 1 bed, change over a year" />
            <ObsStat core={core} place={place} metric={cpiR} label="Rent prices (CPI), 12-month change">
              {hasValue(cpiRObs) && <p className="pfacts__extra">A price change of rents already being paid — not a rent level.</p>}
            </ObsStat>
          </div>
        </div>
        {cpiSpec && (
          <div className="ppanel">
            <ChartRenderer spec={cpiSpec} titleLevel={3} linkPlaces={false} height={210} />
          </div>
        )}
        <div className="ppanel ppanel--cta">
          <p className="ppanel__title">Plan the first months</p>
          <p className="ppanel__text">Start a budget with {place.name}’s asking rent and basic-basket costs filled in, then change anything to match your situation.</p>
          <ButtonLink to={`/budget?place=${encodeURIComponent(place.id)}`} variant="primary" iconRight="arrowRight">
            Budget for {place.name}
          </ButtonLink>
        </div>
        {!anyRent && grid.fams.length > 0 && <SourceNote sourceId={rentSpec.sourceIds} lead="Checked" />}
      </div>
    </div>
  );
}
