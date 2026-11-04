import type { ChartSpec, MetricDef, Place, Series } from '../../types/contract';
import type { CoreData } from '../../data/core';
import { formatNumber } from '../../lib/format';
import { ChartRenderer } from '../../charts';
import { ObservationList } from '../data/ObservationList';
import { MissingValue } from '../ui/EmptyState';
import { SourceNote } from '../ui/SourceNote';
import { climateMetric, climateSeries, findMetric, toChartSeries } from './data';

/** True when the snapshot carries any climate data at all (metrics or monthly normals). */
export const hasClimateData = (core: CoreData, series: Series[] | undefined) => core.metrics.some((m) => m.category === 'climate') || climateSeries(series).length > 0;

export function ClimateSection({ core, place, series }: { core: CoreData; place: Place; series: Series[] | undefined }) {
  const normals = climateSeries(series);
  const byPlace = core.obsIndex.get(place.id);
  const station = place.climateStation;
  const spec: ChartSpec | null = normals.length
    ? {
        id: 'climate-normals',
        type: 'monthly_climate',
        title: `${place.name}: climate by month`,
        subtitle: `${normals[0].geo.name ? `${normals[0].geo.name} · ` : ''}Climate normals ${station?.normalsPeriod ?? ''}`.trim(),
        unit: 'degC',
        series: normals.map((s) => toChartSeries(s)),
        sourceIds: [...new Set(normals.map((s) => s.sourceId))],
      }
    : null;
  const winter = [
    climateMetric(core, 1, 'mean'),
    climateMetric(core, 1, 'min'),
    findMetric(core, ['clim_days_below_minus20']),
    findMetric(core, ['clim_annual_snow']),
  ];
  const summer = [climateMetric(core, 7, 'mean'), climateMetric(core, 7, 'max'), findMetric(core, ['clim_days_above_30']), findMetric(core, ['clim_annual_precip'])];
  const items = (ms: (MetricDef | undefined)[]) => ms.filter((m): m is MetricDef => !!m).map((m) => ({ metric: m, obs: byPlace?.get(m.id) }));
  const winterItems = items(winter);
  const summerItems = items(summer);
  const any = spec || [...winterItems, ...summerItems].some((i) => i.obs);

  return (
    <div className="pclimate">
      <div className="pclimate__main">
        {spec ? (
          <div className="ppanel">
            <ChartRenderer spec={spec} titleLevel={3} linkPlaces={false} />
          </div>
        ) : (
          <div className="ppanel">
            <MissingValue label="No monthly normals" reason={any ? 'Monthly normals for this place are not in the snapshot.' : 'No climate normals for this place in the snapshot.'} />
          </div>
        )}
      </div>
      <div className="pclimate__side">
        {station ? (
          <div className="ppanel">
            <p className="ppanel__title">Where the weather is measured</p>
            <dl className="pdl">
              <dt>Station</dt>
              <dd>{station.name}</dd>
              <dt>Climate ID</dt>
              <dd className="mono">{station.climateId}</dd>
              <dt>Distance</dt>
              <dd>{formatNumber(station.distanceKm, 0)} km from the marker point</dd>
              {station.elevationM !== undefined && (
                <>
                  <dt>Elevation</dt>
                  <dd>{formatNumber(station.elevationM, 0)} m</dd>
                </>
              )}
              <dt>Normals</dt>
              <dd>{station.normalsPeriod}</dd>
            </dl>
            <p className="ppanel__note">One station stands in for the whole area; neighbourhoods by the water or at elevation can differ.</p>
            <SourceNote sourceId={station.sourceId} period={station.normalsPeriod} periodType="normals" />
          </div>
        ) : (
          <div className="ppanel ppanel--quiet">
            <MissingValue compact label="Station not recorded" reason="The climate station used for this place is not listed in the snapshot." />
          </div>
        )}
        {winterItems.length > 0 && (
          <div className="ppanel">
            <p className="ppanel__title">Winter</p>
            <ObservationList items={winterItems} />
          </div>
        )}
        {summerItems.length > 0 && (
          <div className="ppanel">
            <p className="ppanel__title">Summer and the year</p>
            <ObservationList items={summerItems} />
          </div>
        )}
      </div>
    </div>
  );
}
