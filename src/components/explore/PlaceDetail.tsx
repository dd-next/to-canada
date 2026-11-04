import type { MetricDef, Observation, Occupation, Place } from '../../types/contract';
import type { ClassScale } from '../../lib/colors';
import { formatNumber, formatPeriod, formatValue, ordinal } from '../../lib/format';
import { defaultAscending, type LayerData, type LayerDatum } from '../../lib/layers';
import { provinceName, regionLabel } from '../../lib/places';
import type { CompareTray, Favourites } from '../../lib/state';
import { ObservationList } from '../data/ObservationList';
import { Button, ButtonLink, IconButton } from '../ui/Button';
import { MissingValue } from '../ui/EmptyState';
import { Kicker } from '../ui/SectionHeader';
import { Stat } from '../ui/Stat';

function rankLine(d: LayerDatum | undefined, layer: LayerData | null, metric: MetricDef | null): string | null {
  if (!d || !layer || !metric) return null;
  if (d.rank !== undefined) return `${ordinal(d.rank)} of ${layer.counts.ranked} places · ${defaultAscending(metric) ? 'lowest' : 'highest'} first`;
  if (d.status === 'other_period' || d.status === 'not_comparable') return d.reason;
  return null;
}

export interface PlaceActionsProps {
  place: Place;
  compare: CompareTray;
  favourites: Favourites;
  onCompareFull: () => void;
  compact?: boolean;
}

/** Full profile · compare toggle · save. */
export function PlaceActions({ place, compare, favourites, onCompareFull, compact }: PlaceActionsProps) {
  const inCompare = compare.has(place.id);
  const saved = favourites.isSaved(place.id);
  return (
    <div className={['place-actions', compact && 'place-actions--compact'].filter(Boolean).join(' ')}>
      <ButtonLink to={`/place/${place.id}`} variant="primary" size={compact ? 'sm' : 'md'} iconRight="arrowRight">
        Full profile
      </ButtonLink>
      <Button
        variant="outline"
        size={compact ? 'sm' : 'md'}
        icon={inCompare ? 'check' : 'plus'}
        aria-pressed={inCompare}
        aria-disabled={!inCompare && compare.isFull ? true : undefined}
        onClick={() => {
          if (compare.toggle(place.id) === null) onCompareFull();
        }}
      >
        {inCompare ? 'In compare' : 'Add to compare'}
      </Button>
      <IconButton
        icon={saved ? 'starFilled' : 'star'}
        label={saved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
        variant="outline"
        size={compact ? 'sm' : 'md'}
        pressed={saved}
        className="place-actions__save"
        onClick={() => favourites.toggle(place.id)}
      />
    </div>
  );
}

export interface PlaceDetailProps {
  place: Place;
  metric: MetricDef | null;
  layer: LayerData | null;
  datum: LayerDatum | undefined;
  scale: ClassScale | null;
  pending?: boolean;
  /** Wage layer for the chosen profession (shown as a section when it is not the active layer). */
  wageLayer: LayerData | null;
  wageActive: boolean;
  occupation: Occupation | null;
  wagesLoading?: boolean;
  keyObs: { metric: MetricDef; obs: Observation }[];
  compare: CompareTray;
  favourites: Favourites;
  onCompareFull: () => void;
  headingId?: string;
  /** Hide the heading block (when the container already shows it). */
  hideHeader?: boolean;
}

function ActiveStat({ metric, datum, layer, scale, pending }: { metric: MetricDef; datum: LayerDatum | undefined; layer: LayerData | null; scale: ClassScale | null; pending?: boolean }) {
  const swatch = datum && datum.value !== null && scale ? scale.color(datum.value) : null;
  const range = datum?.range && (datum.range[0] !== null || datum.range[1] !== null) ? datum.range : null;
  return (
    <div className="detail__active">
      {swatch && <span className="detail__swatch" style={{ background: swatch }} aria-hidden="true" />}
      <Stat
        size="lg"
        label={metric.label}
        value={pending ? null : (datum?.shown ?? null)}
        unit={datum?.shownUnit ?? metric.unit}
        decimals={datum && datum.shownUnit !== metric.unit ? undefined : metric.decimals}
        period={datum?.period}
        periodType={metric.periodType}
        qualifier={datum?.qualifier}
        flags={datum?.flags}
        note={datum?.obs?.note}
        missingReason={pending ? 'Loading…' : datum?.reason}
        sourceId={datum?.obs?.sourceId ?? metric.sourceIds}
      >
        {range && (
          <p className="detail__range num">
            Low {formatValue(range[0], datum!.shownUnit)} · High {formatValue(range[1], datum!.shownUnit)}
          </p>
        )}
        {rankLine(datum, layer, metric) && <p className="detail__rank">{rankLine(datum, layer, metric)}</p>}
      </Stat>
    </div>
  );
}

/** Drawer / sheet body for a selected place. */
export function PlaceDetail({
  place,
  metric,
  layer,
  datum,
  scale,
  pending,
  wageLayer,
  wageActive,
  occupation,
  wagesLoading,
  keyObs,
  compare,
  favourites,
  onCompareFull,
  headingId,
  hideHeader,
}: PlaceDetailProps) {
  const wageDatum = wageLayer?.data.get(place.id);
  return (
    <div className="detail">
      {!hideHeader && (
        <header className="detail__head">
          <Kicker>
            {provinceName(place.province)} · {regionLabel(place.region)}
          </Kicker>
          <h2 id={headingId} className="detail__name">
            {place.name}
          </h2>
          <p className="detail__statlabel">
            {place.statLabel}
            {place.population && (
              <>
                {' · '}
                <span className="num">pop. {formatNumber(place.population.value, 0, { compact: true })}</span> ({formatPeriod(place.population.period, 'census')})
              </>
            )}
          </p>
        </header>
      )}

      {metric && <ActiveStat metric={metric} datum={datum} layer={layer} scale={scale} pending={pending} />}

      {occupation && !wageActive && (
        <section className="detail__section">
          <h3 className="detail__h label">Your profession</h3>
          {wagesLoading || !wageLayer ? (
            <p className="detail__loading">Loading wages…</p>
          ) : wageDatum ? (
            <Stat
              size="md"
              label={`Median wage · ${occupation.title}`}
              value={wageDatum.shown}
              unit={wageDatum.shownUnit}
              period={wageDatum.period}
              periodType="period"
              qualifier={wageDatum.qualifier}
              flags={wageDatum.flags}
              missingReason={wageDatum.reason}
              sourceId={wageDatum.obs?.sourceId}
            >
              {wageDatum.range && wageDatum.shown !== null && (
                <p className="detail__range num">
                  Low {formatValue(wageDatum.range[0], wageDatum.shownUnit)} · High {formatValue(wageDatum.range[1], wageDatum.shownUnit)}
                </p>
              )}
            </Stat>
          ) : (
            <MissingValue reason="No wage cell for this place." />
          )}
        </section>
      )}

      <section className="detail__section">
        <h3 className="detail__h label">Key numbers</h3>
        {keyObs.length ? <ObservationList items={keyObs} /> : <MissingValue label="No other observations" reason="This snapshot has no further values for this place." />}
      </section>

      <PlaceActions place={place} compare={compare} favourites={favourites} onCompareFull={onCompareFull} />
    </div>
  );
}

/** Compact peek for the mobile sheet: name, value, actions. */
export function PlacePeek({
  place,
  metric,
  datum,
  scale,
  pending,
  compare,
  favourites,
  onCompareFull,
}: Pick<PlaceDetailProps, 'place' | 'metric' | 'datum' | 'scale' | 'pending' | 'compare' | 'favourites' | 'onCompareFull'>) {
  const swatch = datum && datum.value !== null && scale ? scale.color(datum.value) : null;
  const value = datum && datum.shown !== null && metric ? formatValue(datum.shown, datum.shownUnit, datum.shownUnit === metric.unit ? metric.decimals : undefined) : null;
  return (
    <div className="peek">
      <div className="peek__head">
        <div>
          <p className="peek__name">{place.name}</p>
          <p className="peek__label">{place.statLabel}</p>
        </div>
        <div className="peek__value">
          {swatch && <span className="detail__swatch detail__swatch--sm" style={{ background: swatch }} aria-hidden="true" />}
          <span className="num">{pending ? '…' : (value ?? 'No data')}</span>
          {metric && datum?.period && <span className="peek__period mono">{formatPeriod(datum.period, metric.periodType)}</span>}
        </div>
      </div>
      {metric && <p className="peek__metric">{metric.shortLabel}{datum?.qualifier ? ` · ${datum.qualifier}` : ''}</p>}
      <PlaceActions place={place} compare={compare} favourites={favourites} onCompareFull={onCompareFull} compact />
    </div>
  );
}

/** Map tooltip body. */
export function PlaceTooltip({ place, metric, datum, layer, pending }: { place: Place; metric: MetricDef | null; datum: LayerDatum | undefined; layer: LayerData | null; pending?: boolean }) {
  const value = datum && datum.shown !== null && metric ? formatValue(datum.shown, datum.shownUnit, datum.shownUnit === metric.unit ? metric.decimals : undefined) : null;
  return (
    <>
      <p className="tip__name">{place.name}</p>
      <p className="tip__label">{place.statLabel}</p>
      {metric && <p className="tip__metric">{metric.shortLabel}</p>}
      {pending ? (
        <p className="tip__value num">…</p>
      ) : value ? (
        <p className="tip__value num">{value}</p>
      ) : (
        <p className="tip__missing">
          <span className="tip__missing-mark" aria-hidden="true" />
          No comparable data
        </p>
      )}
      {datum?.period && metric && (
        <p className="tip__meta">
          <span className="mono">{formatPeriod(datum.period, metric.periodType)}</span>
          {datum.qualifier && <> · {datum.qualifier}</>}
        </p>
      )}
      {datum?.reason && <p className="tip__reason">{datum.reason}</p>}
      {datum?.rank !== undefined && layer && (
        <p className="tip__rank">
          {ordinal(datum.rank)} of {layer.counts.ranked}
        </p>
      )}
    </>
  );
}
