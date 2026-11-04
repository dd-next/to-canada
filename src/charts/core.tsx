/**
 * Shared chart machinery: the context every chart body receives, the HTML hit
 * layer (keyboard-focusable points with a roving tab stop, pointer + touch),
 * the positioned tooltip and small SVG mark helpers.
 *
 * Accessibility model: the SVG marks are one role="img" with a summary label;
 * the points are real buttons in a separate group (one tab stop, arrow keys move
 * between points, Enter opens a place profile when the point has a placeId);
 * every value is also in the "View data" table.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { MetricDef, Unit } from '../types/contract';
import type { MarkShape } from './palette';

export interface ChartCtx {
  unit: Unit;
  periodType?: MetricDef['periodType'];
  /** Highlighted place ids; index = compare-colour slot. */
  highlight: readonly string[];
  /** Compare slot of a place (−1 = not highlighted). */
  slotOf: (placeId: string | undefined) => number;
  /** Open a place profile (undefined = points are not links). */
  activatePlace?: (placeId: string) => void;
  /** Accessible chart name (the title). */
  title: string;
  reduced: boolean;
}

export interface HitTarget {
  key: string;
  /** Hit rectangle, px in plot coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tooltip anchor. */
  ax: number;
  ay: number;
  /** Accessible description of the point (read on focus). */
  aria: string;
  placeId?: string;
}

/** Active (hovered / focused) target index shared by a chart body. */
export function useActive() {
  return useState<number | null>(null);
}

export interface HitLayerProps {
  targets: HitTarget[];
  active: number | null;
  onActive: (i: number | null) => void;
  /** Group label, e.g. "Asking rent, 1 bedroom: data points". */
  label: string;
  activatePlace?: (placeId: string) => void;
  /** Layout direction of the points (arrow keys). */
  orientation?: 'horizontal' | 'vertical';
}

/** Transparent buttons over the marks. One tab stop; arrows move; Escape hides the tooltip. */
export function HitLayer({ targets, active, onActive, label, activatePlace, orientation = 'horizontal' }: HitLayerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rover, setRover] = useState(0);
  const pointer = useRef<string>('mouse');
  const armed = useRef<number | null>(null);
  const tabStop = Math.min(active ?? rover, Math.max(0, targets.length - 1));

  const move = (e: KeyboardEvent, i: number) => {
    const n = targets.length;
    let next: number | null = null;
    const fwd = orientation === 'horizontal' ? ['ArrowRight', 'ArrowDown'] : ['ArrowDown', 'ArrowRight'];
    const back = orientation === 'horizontal' ? ['ArrowLeft', 'ArrowUp'] : ['ArrowUp', 'ArrowLeft'];
    if (fwd.includes(e.key)) next = Math.min(n - 1, i + 1);
    else if (back.includes(e.key)) next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'PageDown') next = Math.min(n - 1, i + 10);
    else if (e.key === 'PageUp') next = Math.max(0, i - 10);
    else if (e.key === 'Escape') {
      if (active !== null) {
        e.preventDefault();
        e.stopPropagation();
        onActive(null);
      }
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setRover(next);
    refs.current[next]?.focus();
  };

  if (targets.length === 0) return null;
  return (
    <div className="chart__hits" role="group" aria-label={label}>
      {targets.map((t, i) => {
        const style: CSSProperties = { left: t.x, top: t.y, width: Math.max(1, t.w), height: Math.max(1, t.h) };
        const link = !!(t.placeId && activatePlace);
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className={['chart__hit', i === active && 'is-active', link && 'is-link'].filter(Boolean).join(' ')}
            style={style}
            tabIndex={i === tabStop ? 0 : -1}
            aria-label={t.aria + (link ? '. Press Enter to open the profile.' : '')}
            onPointerDown={(e) => {
              pointer.current = e.pointerType;
              if (e.pointerType === 'touch') onActive(i);
            }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'touch') onActive(i);
            }}
            onPointerLeave={(e) => {
              // Keep the tooltip only for keyboard focus (a mouse click also focuses the button).
              const el = refs.current[i];
              if (e.pointerType !== 'touch' && !(document.activeElement === el && el?.matches(':focus-visible'))) onActive(null);
            }}
            onFocus={() => {
              setRover(i);
              onActive(i);
            }}
            onBlur={(e) => {
              const to = e.relatedTarget as Node | null;
              if (!to || !e.currentTarget.parentElement?.contains(to)) onActive(null);
            }}
            onKeyDown={(e) => move(e, i)}
            onClick={(e) => {
              if (!link) return;
              // Touch: the first tap shows the tooltip, a second tap on the same point opens the profile.
              if (pointer.current === 'touch' && e.detail !== 0 && armed.current !== i) {
                armed.current = i;
                onActive(i);
                return;
              }
              armed.current = null;
              activatePlace!(t.placeId!);
            }}
          />
        );
      })}
    </div>
  );
}

export interface TooltipProps {
  /** Anchor in plot px. */
  x: number;
  y: number;
  /** Plot width (the tooltip is kept inside it horizontally). */
  width: number;
  children: ReactNode;
}

/** Positioned tooltip: beside the anchor when there is room, otherwise above/below it. Purely visual (aria-hidden). */
export function ChartTooltip({ x, y, width, children }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 14;
    let left: number;
    let top = y - h / 2;
    if (x + gap + w <= width) left = x + gap;
    else if (x - gap - w >= 0) left = x - gap - w;
    else {
      left = Math.max(0, Math.min(width - w, x - w / 2));
      top = y - h - gap >= -40 ? y - h - gap : y + gap;
    }
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [x, y, width, children]);
  return (
    <div ref={ref} className="chart-tip" aria-hidden="true" style={pos ? { left: pos.left, top: pos.top } : { left: x, top: y, visibility: 'hidden' }}>
      {children}
    </div>
  );
}

export type KeyKind = 'line' | 'dot' | 'rect' | 'range' | 'hollow';

/** Series key for legends and tooltip rows (mirrors the mark). */
export function SeriesKey({ color, kind = 'line', shape = 'circle', dashed }: { color: string; kind?: KeyKind; shape?: MarkShape; dashed?: boolean }) {
  if (kind === 'line')
    return (
      <svg className="chart-key" width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
        <line x1="1" x2="15" y1="5" y2="5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? '3 2.5' : undefined} />
      </svg>
    );
  if (kind === 'rect' || kind === 'range')
    return (
      <svg className="chart-key" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
        <rect x="0.5" y={kind === 'range' ? 3 : 1} width="13" height={kind === 'range' ? 4 : 8} rx="1.5" fill={color} />
      </svg>
    );
  return (
    <svg className="chart-key" width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
      <Mark shape={shape} r={4} fill={kind === 'hollow' ? 'var(--paper)' : color} stroke={kind === 'hollow' ? color : undefined} strokeWidth={kind === 'hollow' ? 1.5 : undefined} />
    </svg>
  );
}

/** A point mark of a given shape centred on (0,0) unless cx/cy are given. */
export function Mark({
  shape = 'circle',
  r,
  cx = 0,
  cy = 0,
  fill,
  stroke,
  strokeWidth,
  className,
  dashed,
}: {
  shape?: MarkShape;
  r: number;
  cx?: number;
  cy?: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
  dashed?: boolean;
}) {
  const common = { fill, stroke, strokeWidth, className, strokeDasharray: dashed ? '2.5 2' : undefined };
  switch (shape) {
    case 'square': {
      const s = r * 1.75;
      return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} {...common} />;
    }
    case 'diamond': {
      const d = r * 1.35;
      return <path d={`M${cx},${cy - d}L${cx + d},${cy}L${cx},${cy + d}L${cx - d},${cy}Z`} {...common} />;
    }
    case 'triangle': {
      const t = r * 1.3;
      return <path d={`M${cx},${cy - t}L${cx + t},${cy + t * 0.8}L${cx - t},${cy + t * 0.8}Z`} {...common} />;
    }
    default:
      return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
}

export interface TipRowData {
  key: string;
  color?: string;
  keyKind?: KeyKind;
  shape?: MarkShape;
  value: string;
  name?: string;
  missing?: boolean;
  note?: string;
  strong?: boolean;
}

/** Tooltip body: title, value rows (value first, label second), notes, link hint. */
export function TipBody({ title, sub, rows, notes, hint }: { title: string; sub?: string; rows: TipRowData[]; notes?: string[]; hint?: string | null }) {
  return (
    <>
      <p className="chart-tip__title">{title}</p>
      {sub && <p className="chart-tip__sub">{sub}</p>}
      {rows.length > 0 && (
        <ul className="chart-tip__rows">
          {rows.map((r) => (
            <li key={r.key} className={['chart-tip__row', r.missing && 'is-missing', r.strong && 'is-strong'].filter(Boolean).join(' ')}>
              {r.color ? <SeriesKey color={r.color} kind={r.keyKind} shape={r.shape} /> : <span className="chart-tip__nokey" />}
              <span className="chart-tip__value num">{r.value}</span>
              {r.name && <span className="chart-tip__name">{r.name}</span>}
              {r.note && <span className="chart-tip__rownote">{r.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {notes?.filter(Boolean).map((n) => (
        <p key={n} className="chart-tip__note">
          {n}
        </p>
      ))}
      {hint && <p className="chart-tip__hint">{hint}</p>}
    </>
  );
}

/** Profile hint shown in tooltips of linked points. */
export function linkHint(name: string | undefined, enabled: boolean): string | null {
  if (!enabled || !name) return null;
  const touch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
  return touch ? `Tap again to open ${name}` : `Click to open ${name}`;
}

/** Plot frame: positions the SVG, hit layer and tooltip together. */
export function Plot({ width, height, summary, children, overlay, className }: { width: number; height: number; summary: string; children: ReactNode; overlay?: ReactNode; className?: string }) {
  return (
    <div className={['chart__plot', className].filter(Boolean).join(' ')} style={{ height }}>
      <svg className="chart__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
        {children}
      </svg>
      {overlay}
    </div>
  );
}
