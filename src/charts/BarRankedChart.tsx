import { useMemo } from 'react';
import type { ChartPoint, ChartSpec } from '../types/contract';
import { compareColor } from '../lib/colors';
import { ordinal } from '../lib/format';
import { valueScale } from './axes';
import { ChartTooltip, HitLayer, Plot, TipBody, linkHint, useActive, type ChartCtx, type HitTarget } from './core';
import { FONT_VALUE, textWidth } from './measure';
import { CHART_BASE, CHART_CONTEXT } from './palette';
import { rowLayout } from './rows';
import { chartDecimals, chartSummary, flagNotes, fmt, isNum, missingText, pointNote } from './text';

export interface BarRankedProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
}

interface Row {
  p: ChartPoint;
  label: string;
  value: number | null;
  slot: number;
  rank: number | null;
}

function rowsOf(spec: ChartSpec, ctx: ChartCtx): Row[] {
  const pts = spec.series[0]?.points ?? [];
  const withValue = pts.filter((p) => isNum(p.y));
  const without = pts.filter((p) => !isNum(p.y));
  return [...withValue, ...without].map((p, i) => ({
    p,
    label: String(p.x),
    value: isNum(p.y) ? p.y : null,
    slot: ctx.slotOf(p.placeId),
    rank: isNum(p.y) ? i + 1 : null,
  }));
}

export const barRankedHeight = (spec: ChartSpec) => {
  const n = spec.series[0]?.points.length ?? 0;
  return n * (n > 30 ? 21 : 25) + 8 + (spec.refs?.length ? 20 : 0);
};

/** Horizontal ranked bars (one series), value labels at the tips, optional reference lines. */
export function BarRankedChart({ spec, width, ctx }: BarRankedProps) {
  const [active, setActive] = useActive();
  const unit = spec.unit;
  const rows = useMemo(() => rowsOf(spec, ctx), [spec, ctx]);
  const values = rows.map((r) => r.value).filter(isNum);
  const decimals = chartDecimals(unit, values);
  const anyHi = rows.some((r) => r.slot >= 0);
  const refs = spec.refs ?? [];
  const valueTexts = rows.map((r) => (r.value === null ? 'No data' : fmt(r.value, unit, decimals)));
  const hasNeg = values.some((v) => v < 0);
  const negW = hasNeg ? Math.max(...rows.map((r, i) => (r.value !== null && r.value < 0 ? textWidth(valueTexts[i], FONT_VALUE) : 0))) + 8 : 0;
  const posW = Math.max(46, ...rows.map((r, i) => (r.value === null || r.value >= 0 ? textWidth(valueTexts[i], FONT_VALUE) : 0))) + 8;
  const L = rowLayout({ labels: rows.map((r) => r.label), width, rightReserve: posW, top: refs.length ? 22 : 4, strong: rows.map((r) => r.slot >= 0) });
  const plotL = L.plotL + negW;
  const { scale: x } = valueScale([...values, ...refs.map((r) => r.value)], [plotL, L.plotR], { zero: true, ticks: 4 });
  const x0 = x(0);
  const barH = Math.min(13, L.rowH - 10);
  const height = L.top + rows.length * L.rowH + 4;
  const n = values.length;

  const targets: HitTarget[] = rows.map((r, i) => {
    const yTop = L.top + i * L.rowH;
    const end = r.value === null ? x0 : x(r.value);
    return {
      key: `${r.label}-${i}`,
      x: 0,
      y: yTop,
      w: width,
      h: L.rowH,
      ax: r.value === null ? x0 + 60 : r.value < 0 ? Math.min(end, x0) : Math.max(end, x0) + textWidth(valueTexts[i], FONT_VALUE) + 6,
      ay: yTop + L.rowH / 2,
      aria: `${r.label}: ${r.value === null ? `no data. ${missingText(r.p)}` : valueTexts[i]}${r.rank ? `, ${ordinal(r.rank)} of ${n} as listed` : ''}${pointNote(r.p) ? `, ${pointNote(r.p)}` : ''}`,
      placeId: r.p.placeId,
    };
  });

  const act = active !== null ? rows[active] : null;
  return (
    <Plot
      width={width}
      height={height}
      summary={chartSummary(spec)}
      overlay={
        <>
          <HitLayer targets={targets} active={active} onActive={setActive} label={`${ctx.title}: bars`} activatePlace={ctx.activatePlace} orientation="vertical" />
          {act && active !== null && (
            <ChartTooltip x={targets[active].ax} y={targets[active].ay} width={width}>
              <TipBody
                title={act.label}
                rows={[
                  {
                    key: 'v',
                    color: act.slot >= 0 ? compareColor(act.slot) : anyHi ? CHART_CONTEXT : CHART_BASE,
                    keyKind: 'rect',
                    value: act.value === null ? 'No data' : valueTexts[active],
                    name: spec.series[0]?.label,
                    missing: act.value === null,
                  },
                ]}
                notes={[act.value === null ? missingText(act.p) : '', pointNote(act.p) ?? '', ...flagNotes(act.p.f), act.rank ? `${ordinal(act.rank)} of ${n} in this list` : '']}
                hint={linkHint(act.p.placeId ? act.label : undefined, !!(act.p.placeId && ctx.activatePlace))}
              />
            </ChartTooltip>
          )}
        </>
      }
    >
      <g aria-hidden="true">
        {active !== null && <rect className="ct-rowband" x={0} y={L.top + active * L.rowH} width={width} height={L.rowH} />}
        {refs.map((r) => (
          <g key={r.label}>
            <line className="ct-ref" x1={x(r.value)} x2={x(r.value)} y1={L.top - 6} y2={height - 2} />
            <text className="ct-ref-label" x={x(r.value)} y={10} textAnchor={x(r.value) > (plotL + L.plotR) / 2 ? 'end' : 'start'} dx={x(r.value) > (plotL + L.plotR) / 2 ? -4 : 4}>
              {r.label} {fmt(r.value, unit, decimals)}
            </text>
          </g>
        ))}
        <line className="ct-base" x1={x0} x2={x0} y1={L.top - 2} y2={height - 2} />
        {rows.map((r, i) => {
          const yMid = L.top + i * L.rowH + L.rowH / 2;
          const color = r.slot >= 0 ? compareColor(r.slot) : anyHi ? CHART_CONTEXT : CHART_BASE;
          const strong = r.slot >= 0;
          if (r.value === null)
            return (
              <g key={`${r.label}-${i}`}>
                <text className="ct-label ct-label--muted" x={L.labelW} y={yMid} dy="0.32em" textAnchor="end">
                  {L.labels[i]}
                </text>
                <circle className="ct-missing" cx={x0 + 6} cy={yMid} r={4.5} />
                <text className="ct-na" x={x0 + 16} y={yMid} dy="0.32em">
                  No data
                </text>
              </g>
            );
          const end = x(r.value);
          const bx = Math.min(end, x0);
          const bw = Math.max(1.5, Math.abs(end - x0));
          const neg = r.value < 0;
          return (
            <g key={`${r.label}-${i}`} className="ct-bar">
              <text className={strong ? 'ct-label ct-label--strong' : anyHi ? 'ct-label ct-label--soft' : 'ct-label'} x={L.labelW} y={yMid} dy="0.32em" textAnchor="end">
                {L.labels[i]}
              </text>
              <path d={barPath(bx, yMid - barH / 2, bw, barH, neg ? 'left' : 'right')} fill={color} className="ct-mark" />
              <text className={strong ? 'ct-value ct-value--strong' : 'ct-value'} x={neg ? bx - 5 : bx + bw + 5} y={yMid} dy="0.32em" textAnchor={neg ? 'end' : 'start'}>
                {valueTexts[i]}
              </text>
            </g>
          );
        })}
      </g>
    </Plot>
  );
}

/** Bar with a 3px rounded data end and a square baseline end. */
export function barPath(x: number, y: number, w: number, h: number, dataEnd: 'right' | 'left' | 'top'): string {
  const r = Math.min(3, w / 2, h / 2);
  if (dataEnd === 'right')
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  if (dataEnd === 'left') return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  // columns grow upward from the baseline at y + h
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
