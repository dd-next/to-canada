import type { MetricDef } from '../../types/contract';
import type { ClassScale } from '../../lib/colors';
import { formatValue } from '../../lib/format';
import { focusVisible, type ResultRow } from './ResultsList';

export interface RankExtremesProps {
  rows: ResultRow[];
  metric: MetricDef | null;
  scale: ClassScale | null;
  selectedId: string | null;
  onSelect: (id: string, via: 'pointer' | 'keyboard') => void;
  onHover: (id: string | null) => void;
  /** Places per column (default 3). */
  size?: number;
}

/** Lowest / highest comparable values among the listed places, side by side. */
export function RankExtremes({ rows, metric, scale, selectedId, onSelect, onHover, size = 3 }: RankExtremesProps) {
  if (!metric) return null;
  const ranked = rows.filter((r) => r.datum?.status === 'ok' && r.datum.value !== null).sort((a, b) => a.datum!.value! - b.datum!.value!);
  if (ranked.length < 4) return null;
  const n = Math.min(size, Math.floor(ranked.length / 2));
  const columns = [
    { key: 'low', title: 'Lowest', items: ranked.slice(0, n) },
    { key: 'high', title: 'Highest', items: ranked.slice(-n).reverse() },
  ];
  return (
    <div className="extremes" aria-label={`Lowest and highest: ${metric.shortLabel}`} role="group">
      {columns.map((c) => (
        <div key={c.key} className="extremes__col">
          <p className="extremes__title label">{c.title}</p>
          <ol className="extremes__list">
            {c.items.map((r) => {
              const d = r.datum!;
              return (
                <li key={r.place.id}>
                  <button
                    type="button"
                    className={['extremes__item', r.place.id === selectedId && 'is-selected'].filter(Boolean).join(' ')}
                    onClick={(e) => onSelect(r.place.id, e.detail === 0 ? 'keyboard' : 'pointer')}
                    onPointerEnter={(e) => e.pointerType !== 'touch' && onHover(r.place.id)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={(e) => focusVisible(e.currentTarget) && onHover(r.place.id)}
                    onBlur={() => onHover(null)}
                  >
                    <span className="extremes__swatch" style={{ background: scale?.color(d.value) ?? undefined }} aria-hidden="true" />
                    <span className="extremes__name">{r.place.name}</span>
                    <span className="extremes__value num">{formatValue(d.shown, d.shownUnit, d.shownUnit === metric.unit ? metric.decimals : undefined)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
