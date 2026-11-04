import { useMemo } from 'react';
import type { ChartPoint, ChartSpec } from '../types/contract';
import { compareColor } from '../lib/colors';
import { valueScale, valueTick } from './axes';
import { ChartTooltip, HitLayer, Plot, TipBody, linkHint, useActive, type ChartCtx, type HitTarget } from './core';
import { FONT_VALUE, textWidth } from './measure';
import { CHART_BASE, CHART_RANGE } from './palette';
import { rowLayout } from './rows';
import { chartDecimals, chartSummary, flagNotes, fmt, isNum, missingText, pointNote } from './text';

export interface RangeProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
}

interface Row {
  key: string;
  label: string;
  p: ChartPoint;
  lo: number | null;
  mid: number | null;
  hi: number | null;
  slot: number;
}

export const rangeHeight = (spec: ChartSpec) => {
  const n = spec.series.reduce((a, s) => a + s.points.length, 0);
  return n * (n > 30 ? 22 : 27) + 34;
};

/** Low–median–high per row: a range bar with a median dot and the median value at the end. */
export function RangeChart({ spec, width, ctx }: RangeProps) {
  const [active, setActive] = useActive();
  const unit = spec.unit;
  const multi = spec.series.length > 1;
  const rows: Row[] = useMemo(
    () =>
      spec.series.flatMap((s) =>
        s.points.map((p, i) => ({
          key: `${s.id}-${i}`,
          label: multi ? `${p.x} · ${s.label}` : String(p.x),
          p,
          lo: isNum(p.y0) ? p.y0 : null,
          mid: isNum(p.y) ? p.y : null,
          hi: isNum(p.y1) ? p.y1 : null,
          slot: ctx.slotOf(p.placeId ?? s.placeId),
        })),
      ),
    [spec, ctx, multi],
  );
  const values = rows.flatMap((r) => [r.lo, r.mid, r.hi]).filter(isNum);
  const decimals = chartDecimals(unit, values);
  const anyHi = rows.some((r) => r.slot >= 0);
  const midTexts = rows.map((r) => (r.mid === null ? (r.lo === null && r.hi === null ? 'No data' : 'No median') : fmt(r.mid, unit, decimals)));
  const rightReserve = Math.max(...midTexts.map((t) => textWidth(t, FONT_VALUE))) + 12;
  const rowH = rows.length > 30 ? 22 : 27;
  const L = rowLayout({ labels: rows.map((r) => r.label), width, rightReserve, rowH, top: 4, strong: rows.map((r) => r.slot >= 0) });
  const { scale: x, ticks } = valueScale([...values, ...(spec.refs ?? []).map((r) => r.value)], [L.plotL + 6, L.plotR], { zero: false, ticks: width < 520 ? 3 : 5, pad: 0.03 });
  const axisY = L.top + rows.length * rowH + 6;
  const height = axisY + 24;
  const barH = rowH > 24 ? 9 : 8;

  const targets: HitTarget[] = rows.map((r, i) => {
    const yTop = L.top + i * rowH;
    const right = Math.max(...[r.lo, r.mid, r.hi].filter(isNum).map(x), L.plotL + 20);
    return {
      key: r.key,
      x: 0,
      y: yTop,
      w: width,
      h: rowH,
      ax: right + textWidth(midTexts[i], FONT_VALUE) + 10,
      ay: yTop + rowH / 2,
      aria:
        r.mid === null && r.lo === null && r.hi === null
          ? `${r.label}: no data. ${missingText(r.p)}`
          : `${r.label}: median ${r.mid === null ? 'not published' : fmt(r.mid, unit, decimals)}, low ${fmt(r.lo, unit, decimals)}, high ${fmt(r.hi, unit, decimals)}`,
      placeId: r.p.placeId,
    };
  });

  const act = active !== null ? rows[active] : null;
  const color = (r: Row) => (r.slot >= 0 ? compareColor(r.slot) : anyHi ? '#8a7f73' : CHART_BASE);

  return (
    <Plot
      width={width}
      height={height}
      summary={chartSummary(spec)}
      overlay={
        <>
          <HitLayer targets={targets} active={active} onActive={setActive} label={`${ctx.title}: rows`} activatePlace={ctx.activatePlace} orientation="vertical" />
          {act && active !== null && (
            <ChartTooltip x={targets[active].ax} y={targets[active].ay} width={width}>
              <TipBody
                title={act.label}
                rows={[
                  { key: 'hi', value: act.hi === null ? 'No data' : fmt(act.hi, unit, decimals), name: 'High', missing: act.hi === null },
                  { key: 'mid', color: color(act), keyKind: 'dot', value: act.mid === null ? 'No data' : fmt(act.mid, unit, decimals), name: 'Median', missing: act.mid === null, strong: true },
                  { key: 'lo', value: act.lo === null ? 'No data' : fmt(act.lo, unit, decimals), name: 'Low', missing: act.lo === null },
                ]}
                notes={[pointNote(act.p) ?? '', ...flagNotes(act.p.f), act.mid === null && act.lo === null && act.hi === null ? missingText(act.p) : '']}
                hint={linkHint(act.p.placeId ? String(act.p.x) : undefined, !!(act.p.placeId && ctx.activatePlace))}
              />
            </ChartTooltip>
          )}
        </>
      }
    >
      <g aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line className="ct-grid" x1={x(t)} x2={x(t)} y1={L.top} y2={axisY} />
            <text className="ct-tick" x={x(t)} y={axisY + 14} textAnchor="middle">
              {valueTick(t, unit, ticks)}
            </text>
          </g>
        ))}
        <line className="ct-base" x1={L.plotL + 6} x2={L.plotR} y1={axisY} y2={axisY} />
        {(spec.refs ?? []).map((rf) => (
          <line key={rf.label} className="ct-ref" x1={x(rf.value)} x2={x(rf.value)} y1={L.top} y2={axisY} />
        ))}
        {rows.map((r, i) => {
          const yMid = L.top + i * rowH + rowH / 2;
          const strong = r.slot >= 0;
          const c = color(r);
          const right = Math.max(...[r.lo, r.mid, r.hi].filter(isNum).map(x), L.plotL + 6);
          const none = r.lo === null && r.mid === null && r.hi === null;
          return (
            <g key={r.key}>
              {active === i && <rect className="ct-rowband" x={0} y={yMid - rowH / 2} width={width} height={rowH} />}
              <text className={strong ? 'ct-label ct-label--strong' : none ? 'ct-label ct-label--muted' : anyHi ? 'ct-label ct-label--soft' : 'ct-label'} x={L.labelW} y={yMid} dy="0.32em" textAnchor="end">
                {L.labels[i]}
              </text>
              {none ? (
                <text className="ct-na" x={L.plotL + 10} y={yMid} dy="0.32em">
                  No data
                </text>
              ) : (
                <>
                  {r.lo !== null && r.hi !== null && (
                    <rect x={x(r.lo)} y={yMid - barH / 2} width={Math.max(2, x(r.hi) - x(r.lo))} height={barH} rx={barH / 2} fill={strong ? c : CHART_RANGE} fillOpacity={strong ? 0.32 : 1} className="ct-mark" />
                  )}
                  {r.mid !== null && <circle cx={x(r.mid)} cy={yMid} r={5} fill={c} stroke="var(--paper)" strokeWidth={2} className="ct-mark" />}
                  <text className={strong ? 'ct-value ct-value--strong' : r.mid === null ? 'ct-na' : 'ct-value'} x={right + 8} y={yMid} dy="0.32em">
                    {midTexts[i]}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </g>
    </Plot>
  );
}
