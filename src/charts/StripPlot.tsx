import { useRef } from 'react';
import type { Unit } from '../types/contract';
import { useElementSize } from '../lib/hooks';
import { formatTick } from '../lib/format';
import { FONT_TICK, textWidth } from './measure';
import { CHART_CONTEXT_LINE } from './palette';
import { isNum } from './text';
import '../styles/charts.css';

export interface StripItem {
  id: string;
  label: string;
  value: number;
}

export interface StripPlotProps {
  items: StripItem[];
  /** The place being profiled (drawn large in the accent colour). */
  highlightId: string;
  unit: Unit;
  decimals?: number;
  /** Accessible description (the rank sentence). */
  label: string;
  color?: string;
  className?: string;
}

/**
 * One dot per place on a single value axis, the profiled place emphasised, the
 * minimum and maximum labelled and the median ticked. Purely a picture of the
 * rank sentence next to it (role="img").
 */
export function StripPlot({ items, highlightId, unit, decimals, label, color = 'var(--accent)', className }: StripPlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(ref);
  const vals = items.map((i) => i.value).filter(isNum).sort((a, b) => a - b);
  const h = 40;
  if (!vals.length) return <div ref={ref} className={['strip', className].filter(Boolean).join(' ')} style={{ height: h }} />;
  const min = vals[0];
  const max = vals[vals.length - 1];
  const median = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  const pad = 7;
  const x = (v: number) => (max === min ? width / 2 : pad + ((v - min) / (max - min)) * (width - pad * 2));
  const hi = items.find((i) => i.id === highlightId);
  const fmtTick = (v: number) => formatTick(v, unit, decimals ?? 0, Math.abs(v) >= 100_000);
  const minT = fmtTick(min);
  const maxT = fmtTick(max);
  return (
    <div ref={ref} className={['strip', className].filter(Boolean).join(' ')} style={{ height: h }}>
      {width > 0 && (
        <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={label}>
          <line className="ct-grid" x1={pad} x2={width - pad} y1={14} y2={14} />
          <line className="strip__median" x1={x(median)} x2={x(median)} y1={6} y2={22} />
          {items
            .filter((i) => i.id !== highlightId)
            .map((i) => (
              <circle key={i.id} cx={x(i.value)} cy={14} r={3.5} fill={CHART_CONTEXT_LINE} fillOpacity={0.75} stroke="var(--paper)" strokeWidth={1} />
            ))}
          {hi && <circle cx={x(hi.value)} cy={14} r={6.5} fill={color} stroke="var(--paper)" strokeWidth={2} />}
          <text className="ct-tick" x={pad - 2} y={h - 4} textAnchor="start">
            {minT}
          </text>
          <text className="ct-tick" x={width - pad + 2} y={h - 4} textAnchor="end">
            {maxT}
          </text>
          {x(median) - textWidth('median', FONT_TICK) / 2 > pad + textWidth(minT, FONT_TICK) + 8 && x(median) + textWidth('median', FONT_TICK) / 2 < width - pad - textWidth(maxT, FONT_TICK) - 8 && (
            <text className="ct-tick ct-tick--faint" x={x(median)} y={h - 4} textAnchor="middle">
              median
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
