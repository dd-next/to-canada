import { useMemo, useRef } from 'react';
import { scaleLinear } from 'd3-scale';
import type { Place } from '../../types/contract';
import { compareColor, compareShape, type CompareShape } from '../../lib/colors';
import { formatValue, formatPeriod } from '../../lib/format';
import { useElementSize } from '../../lib/hooks';
import type { Measure } from './measures';

function Marker({ shape, x, y, r, fill, stroke = '#fbf6f1', dashed }: { shape: CompareShape; x: number; y: number; r: number; fill: string; stroke?: string; dashed?: boolean }) {
  const common = { fill, stroke, strokeWidth: 1.5, strokeDasharray: dashed ? '2.5 2' : undefined };
  if (shape === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...common} />;
  if (shape === 'diamond') return <path d={`M${x} ${y - r * 1.3}L${x + r * 1.3} ${y}L${x} ${y + r * 1.3}L${x - r * 1.3} ${y}Z`} {...common} />;
  return <circle cx={x} cy={y} r={r} {...common} />;
}

interface StripProps {
  measure: Measure;
  selected: Place[];
}

const LABEL_W = (s: string) => s.length * 6.4 + 8;
const SLOTS = [-18, 20, -34]; // label baseline offsets from the axis: above, below, higher above

function Strip({ measure, selected }: StripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(ref);
  const pad = 14;
  const all = useMemo(() => [...measure.data.values()].filter((d) => d.status === 'ok' && d.value !== null).map((d) => d.value!), [measure]);
  const domain: [number, number] = useMemo(() => {
    if (!all.length) return [0, 1];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
  }, [all]);
  const x = useMemo(() => scaleLinear().domain(domain).range([pad, Math.max(width - pad, pad + 10)]), [domain, width]);
  const fmt = (v: number) => formatValue(v, measure.unit, measure.decimals);
  const placed = selected
    .map((p, i) => ({ p, i, d: measure.data.get(p.id) }))
    .filter((s) => s.d && s.d.status === 'ok' && s.d.value !== null)
    .sort((a, b) => a.d!.value! - b.d!.value!);
  const missing = selected.map((p, i) => ({ p, i, d: measure.data.get(p.id) })).filter((s) => !s.d || s.d.status !== 'ok' || s.d.value === null);

  // Greedy label placement into above / below / higher-above slots.
  const ends: number[] = [-Infinity, -Infinity, -Infinity];
  const labels = placed.map(({ p, i, d }) => {
    const text = `${p.name} ${fmt(d!.value!)}`;
    const w = LABEL_W(text);
    const cx = x(d!.value!);
    const left = Math.min(Math.max(cx - w / 2, 0), Math.max(width - w, 0));
    let slot = ends.findIndex((e) => e < left - 4);
    if (slot < 0) slot = ends.indexOf(Math.min(...ends));
    ends[slot] = left + w;
    return { p, i, text, cx, left, w, slot };
  });
  const midY = 50;
  const ticks = [domain[0], domain[1]];
  const readable = all.length ? `${measure.shortLabel}: ${placed.map((s) => `${s.p.name} ${fmt(s.d!.value!)}`).join(', ')}. Scale from ${fmt(domain[0])} to ${fmt(domain[1])} across ${all.length} places.` : `${measure.shortLabel}: no comparable values`;
  const dir = measure.higherIs === 'better' ? 'Higher is better' : measure.higherIs === 'worse' ? 'Lower is better' : 'Neither higher nor lower is better';

  return (
    <div className="strip">
      <div className="strip__label">
        <p className="strip__title">{measure.shortLabel}</p>
        <p className="strip__meta">
          {dir}
          {measure.calculation && ' · calculation'}
        </p>
      </div>
      <div className="strip__plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={100} role="img" aria-label={readable}>
            <line x1={pad} x2={width - pad} y1={midY} y2={midY} stroke="var(--ink)" strokeWidth={1} />
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={x(t)} x2={x(t)} y1={midY - 4} y2={midY + 4} stroke="var(--ink)" />
                <text x={x(t)} y={94} textAnchor={i === 0 ? 'start' : 'end'} className="strip__tick" transform={`translate(${i === 0 ? -pad + 2 : pad - 2} 0)`}>
                  {fmt(t)}
                </text>
              </g>
            ))}
            {measure.data.size > 0 &&
              [...measure.data.values()]
                .filter((d) => d.status === 'ok' && d.value !== null)
                .map((d) => <circle key={d.placeId} cx={x(d.value!)} cy={midY} r={3.5} fill="var(--ink)" opacity={0.28} />)}
            {labels.map((l) => (
              <g key={l.p.id}>
                <line x1={l.cx} x2={l.cx} y1={midY} y2={midY + SLOTS[l.slot] + (SLOTS[l.slot] < 0 ? 4 : -12)} stroke={compareColor(l.i)} strokeWidth={1} />
                <text x={l.left + l.w / 2} y={midY + SLOTS[l.slot]} textAnchor="middle" className="strip__name" fill={compareColor(l.i)}>
                  {l.text}
                </text>
              </g>
            ))}
            {labels.map((l) => (
              <Marker key={`m${l.p.id}`} shape={compareShape(l.i)} x={l.cx} y={midY} r={7} fill={compareColor(l.i)} />
            ))}
          </svg>
        )}
        {missing.length > 0 && (
          <ul className="strip__missing">
            {missing.map(({ p, i, d }) => (
              <li key={p.id} title={d?.reason ?? undefined}>
                <svg width="14" height="14" aria-hidden="true">
                  <Marker shape={compareShape(i)} x={7} y={7} r={4.5} fill="var(--paper)" stroke="var(--ink)" dashed />
                </svg>
                {p.name}: no comparable value{d?.status === 'other_period' && d.period ? ` (${formatPeriod(d.period, measure.periodType)})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** "Dot strips": every place as a faint dot on a stable scale, the compared places as large labelled markers. */
export function DotStrips({ measures, selected }: { measures: Measure[]; selected: Place[] }) {
  return (
    <div className="strips">
      {measures.map((m) => (
        <Strip key={m.id} measure={m} selected={selected} />
      ))}
    </div>
  );
}
