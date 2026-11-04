import { memo, useCallback } from 'react';
import type { MetricDef, Place } from '../../types/contract';
import type { ClassScale } from '../../lib/colors';
import { formatPeriod, formatValue, plural } from '../../lib/format';
import { defaultAscending, type LayerData, type LayerDatum } from '../../lib/layers';
import { provinceAbbr } from '../../lib/places';
import type { CompareTray, Favourites } from '../../lib/state';
import { Button, IconButton } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Select } from '../ui/Select';

export type SortMode = 'auto' | 'high' | 'low' | 'name';
export interface ResultRow {
  place: Place;
  datum: LayerDatum | undefined;
}

const STATUS_ORDER = { ok: 0, other_period: 1, not_comparable: 2, missing: 3 } as const;

/** Sort rows: comparable values first (by value), then older periods, then non-comparable, then missing (A–Z). */
export function sortRows(rows: ResultRow[], metric: MetricDef | null, mode: SortMode): ResultRow[] {
  const asc = mode === 'low' || (mode === 'auto' && !!metric && defaultAscending(metric));
  return [...rows].sort((a, b) => {
    if (mode === 'name') return a.place.name.localeCompare(b.place.name);
    const sa = STATUS_ORDER[a.datum?.status ?? 'missing'];
    const sb = STATUS_ORDER[b.datum?.status ?? 'missing'];
    if (sa !== sb) return sa - sb;
    const va = a.datum?.value ?? a.datum?.shown ?? null;
    const vb = b.datum?.value ?? b.datum?.shown ?? null;
    if (va !== null && vb !== null && va !== vb) return asc ? va - vb : vb - va;
    return a.place.name.localeCompare(b.place.name);
  });
}

/** Short tag for the geography a value describes (list rows). */
export function qualifierTag(d: LayerDatum | undefined): string | null {
  if (!d?.obs) return null;
  const f = d.flags;
  if (f.includes('provincial_value')) return 'Province';
  if (f.includes('national_value')) return 'Canada';
  if (f.includes('cma_wide')) return 'CMA-wide';
  if (f.includes('regional_value')) return d.obs.geo.level === 'economic_region' ? 'ER' : 'Region';
  return null;
}

export interface ResultsListProps {
  rows: ResultRow[];
  metric: MetricDef | null;
  layer: LayerData | null;
  scale: ClassScale | null;
  pending?: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  highlightIds?: ReadonlySet<string> | null;
  onSelect: (id: string, via: 'pointer' | 'keyboard') => void;
  onHover: (id: string | null) => void;
  compare: CompareTray;
  favourites: Favourites;
  onCompareFull: () => void;
  sort: SortMode;
  onSortChange: (m: SortMode) => void;
  totalPlaces: number;
  filterLabel?: string | null;
  onClearFilters?: () => void;
}

export function ResultsList({
  rows,
  metric,
  layer,
  scale,
  pending,
  selectedId,
  hoveredId,
  highlightIds,
  onSelect,
  onHover,
  compare,
  favourites,
  onCompareFull,
  sort,
  onSortChange,
  totalPlaces,
  filterLabel,
  onClearFilters,
}: ResultsListProps) {
  const sorted = sortRows(rows, metric, sort);
  const toggleCompare = useCallback(
    (id: string) => {
      if (compare.toggle(id) === null) onCompareFull();
    },
    [compare, onCompareFull],
  );
  const withData = rows.filter((r) => r.datum && r.datum.shown !== null).length;
  const asc = metric ? defaultAscending(metric) : false;
  const autoLabel = asc ? 'Lowest first' : 'Highest first';
  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results__head">
        <h2 id="results-title" className="results__title">
          Places
        </h2>
        <p className="results__count" aria-live="polite">
          {plural(rows.length, 'place')}
          {filterLabel ? ` in ${filterLabel}` : ''}
          {!pending && metric && <> · {withData} with data</>}
        </p>
        <Select
          label="Sort places"
          hideLabel
          size="sm"
          className="results__sort"
          value={sort}
          onChange={(v) => onSortChange(v as SortMode)}
          options={[
            { value: 'auto', label: `${autoLabel} (default)` },
            { value: asc ? 'high' : 'low', label: asc ? 'Highest first' : 'Lowest first' },
            { value: 'name', label: 'A–Z' },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No places match these filters."
          action={
            onClearFilters && (
              <Button size="sm" variant="outline" onClick={onClearFilters}>
                Clear filters
              </Button>
            )
          }
        >
          Statistics here cover {totalPlaces} metropolitan areas and larger towns.
        </EmptyState>
      ) : (
        <ol className="results__list">
          {sorted.map((r) => (
            <ResultItem
              key={r.place.id}
              row={r}
              metric={metric}
              layer={layer}
              scale={scale}
              pending={pending}
              selected={r.place.id === selectedId}
              hovered={r.place.id === hoveredId}
              highlighted={!!highlightIds?.has(r.place.id)}
              inCompare={compare.has(r.place.id)}
              compareFull={compare.isFull}
              saved={favourites.isSaved(r.place.id)}
              onSelect={onSelect}
              onHover={onHover}
              onToggleCompare={toggleCompare}
              onToggleSave={favourites.toggle}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

interface ResultItemProps {
  row: ResultRow;
  metric: MetricDef | null;
  layer: LayerData | null;
  scale: ClassScale | null;
  pending?: boolean;
  selected: boolean;
  hovered: boolean;
  highlighted: boolean;
  inCompare: boolean;
  compareFull: boolean;
  saved: boolean;
  onSelect: (id: string, via: 'pointer' | 'keyboard') => void;
  onHover: (id: string | null) => void;
  onToggleCompare: (id: string) => void;
  onToggleSave: (id: string) => void;
}

const ResultItem = memo(function ResultItem({
  row,
  metric,
  layer,
  scale,
  pending,
  selected,
  hovered,
  highlighted,
  inCompare,
  compareFull,
  saved,
  onSelect,
  onHover,
  onToggleCompare,
  onToggleSave,
}: ResultItemProps) {
  const { place, datum: d } = row;
  const id = place.id;
  const hasShown = !!d && d.shown !== null;
  const value = hasShown && metric ? formatValue(d!.shown, d!.shownUnit, d!.shownUnit === metric.unit ? metric.decimals : undefined) : null;
  const bar = d && d.value !== null && scale ? scale.bar(d.value) : null;
  const color = d && d.value !== null && scale ? scale.color(d.value) : null;
  const tag = qualifierTag(d);
  const ranked = d?.rank !== undefined;
  const cls = ['result', selected && 'is-selected', hovered && 'is-hovered', highlighted && 'is-highlighted', d?.status && `is-${d.status.replace('_', '-')}`]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls} onPointerEnter={() => onHover(id)} onPointerLeave={() => onHover(null)}>
      <button
        type="button"
        className="result__main"
        aria-pressed={selected}
        onClick={(e) => onSelect(id, e.detail === 0 ? 'keyboard' : 'pointer')}
        onFocus={() => onHover(id)}
        onBlur={() => onHover(null)}
      >
        <span className="result__rank mono" title={ranked && layer ? `Rank ${d!.rank} of ${layer.counts.ranked}` : 'Not ranked'}>
          {ranked ? d!.rank : '–'}
        </span>
        <span className="result__name">
          {place.name}
          <span className="result__prov">{provinceAbbr(place.province)}</span>
        </span>
        <span className="result__value num">{pending ? '…' : (value ?? <span className="result__na">No data</span>)}</span>
        {pending ? (
          <span className="result__bar is-pending" aria-hidden="true" />
        ) : bar ? (
          <span className="result__bar" aria-hidden="true">
            {scale!.zero > 0 && <span className="result__zero" style={{ left: `${scale!.zero * 100}%` }} />}
            <span className="result__fill" style={{ left: `${bar[0] * 100}%`, width: `${Math.max(0.8, (bar[1] - bar[0]) * 100)}%`, background: color ?? undefined }} />
          </span>
        ) : (
          <span className="result__why" title={d?.reason ?? undefined}>
            {d?.reason ?? 'No observation'}
          </span>
        )}
        <span className="result__period mono" title={d?.qualifier ?? undefined}>
          {tag && <b className="result__tag">{tag}</b>}
          {d?.period && metric ? formatPeriod(d.period, metric.periodType) : ''}
        </span>
        {d?.status === 'other_period' && <span className="sr-only">. {d.reason}</span>}
        {d?.status === 'not_comparable' && <span className="sr-only">. {d.reason}</span>}
      </button>
      <div className="result__actions">
        <IconButton
          size="sm"
          icon={inCompare ? 'check' : 'compare'}
          label={inCompare ? `Remove ${place.name} from compare` : compareFull ? `Compare is full (3 places) — remove one to add ${place.name}` : `Add ${place.name} to compare`}
          pressed={inCompare}
          aria-disabled={!inCompare && compareFull ? true : undefined}
          className="result__compare"
          onClick={() => onToggleCompare(id)}
        />
        <IconButton size="sm" icon={saved ? 'starFilled' : 'star'} label={saved ? `Remove ${place.name} from saved` : `Save ${place.name}`} pressed={saved} className="result__save" onClick={() => onToggleSave(id)} />
      </div>
    </li>
  );
});
