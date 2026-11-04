import { useMemo } from 'react';
import type { ChartSpec } from '../types/contract';
import { textOn } from '../lib/colors';
import { valueScale, valueTick } from './axes';
import { ChartTooltip, HitLayer, Plot, TipBody, linkHint, useActive, type ChartCtx, type HitTarget } from './core';
import { FONT_VALUE, textWidth } from './measure';
import { seriesColor } from './palette';
import { dotRows } from './DotCompareChart';
import { rowLayout } from './rows';
import { chartDecimals, chartSummary, flagNotes, fmt, isNum } from './text';

export interface StackedProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
}

export const stackedHeight = (spec: ChartSpec) => {
  const n = new Set(spec.series.flatMap((s) => s.points.map((p) => String(p.x)))).size;
  return n === 1 ? 56 : n * 30 + 32;
};

/** Shares per category: one horizontal bar per category, segments in series order with a 2px surface gap. */
export function StackedBarChart({ spec, width, ctx }: StackedProps) {
  const [active, setActive] = useActive();
  const unit = spec.unit;
  const rows = useMemo(() => dotRows(spec, ctx), [spec, ctx]);
  const single = rows.length === 1;
  const totals = rows.map((r) => r.cells.reduce((a, c) => a + (isNum(c?.y) && c!.y! > 0 ? c!.y! : 0), 0));
  const values = rows.flatMap((r) => r.cells.map((c) => c?.y)).filter(isNum);
  const decimals = chartDecimals(unit, values);
  const maxTotal = Math.max(1, ...totals);
  const percentWhole = unit === 'percent' && totals.every((t) => t === 0 || Math.abs(t - 100) <= 1.5);
  const rowH = single ? 40 : 30;
  const barH = single ? 28 : 16;
  const L = single
    ? { labelW: 0, plotL: 0, plotR: width, rowH, top: 4, labels: [''] }
    : rowLayout({ labels: rows.map((r) => r.label), width, rightReserve: 14, rowH, top: 4 });
  const { scale: x, ticks } = valueScale(percentWhole ? [0, 100] : [0, maxTotal], [L.plotL, L.plotR], { zero: true, ticks: width < 520 ? 3 : 5 });
  const axisY = L.top + rows.length * rowH + 4;
  const height = single ? L.top + rowH + 4 : axisY + 24;

  const targets: HitTarget[] = rows.map((r, i) => ({
    key: r.key,
    x: 0,
    y: L.top + i * rowH,
    w: width,
    h: rowH,
    ax: x(totals[i]) + 8,
    ay: L.top + i * rowH + rowH / 2,
    aria: `${r.label}: ${spec.series.map((s, si) => `${s.label} ${isNum(r.cells[si]?.y) ? fmt(r.cells[si]!.y, unit, decimals) : 'no data'}`).join('; ')}`,
    placeId: r.placeId,
  }));
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
            <ChartTooltip x={Math.min(targets[active].ax, width - 10)} y={targets[active].ay} width={width}>
              <TipBody
                title={act.label || spec.title}
                rows={spec.series.map((s, si) => {
                  const v = act.cells[si]?.y;
                  return { key: s.id, color: seriesColor(si), keyKind: 'rect', value: isNum(v) ? fmt(v, unit, decimals) : 'No data', name: s.label, missing: !isNum(v) };
                })}
                notes={[...new Set(act.cells.flatMap((c) => flagNotes(c?.f)))]}
                hint={linkHint(act.placeId ? act.label : undefined, !!(act.placeId && ctx.activatePlace))}
              />
            </ChartTooltip>
          )}
        </>
      }
    >
      <g aria-hidden="true">
        {!single &&
          ticks.map((t) => (
            <g key={t}>
              <line className="ct-grid" x1={x(t)} x2={x(t)} y1={L.top} y2={axisY} />
              <text className="ct-tick" x={x(t)} y={axisY + 14} textAnchor="middle">
                {valueTick(t, unit, ticks)}
              </text>
            </g>
          ))}
        {rows.map((r, i) => {
          const yMid = L.top + i * rowH + rowH / 2;
          let acc = 0;
          let drawn = 0;
          return (
            <g key={r.key}>
              {active === i && <rect className="ct-rowband" x={0} y={yMid - rowH / 2} width={width} height={rowH} />}
              {!single && (
                <text className="ct-label" x={L.labelW} y={yMid} dy="0.32em" textAnchor="end">
                  {L.labels[i]}
                </text>
              )}
              {totals[i] === 0 ? (
                <text className="ct-na" x={L.plotL + 4} y={yMid} dy="0.32em">
                  No data
                </text>
              ) : (
                r.cells.map((c, si) => {
                  const v = c?.y;
                  if (!isNum(v) || v <= 0) return null;
                  const first = drawn++ === 0;
                  const x0 = x(acc) + (first ? 0 : 1);
                  acc += v;
                  const x1 = x(acc) - 1;
                  const w = Math.max(0.5, x1 - x0);
                  const fill = seriesColor(si);
                  const text = fmt(v, unit, decimals);
                  const fits = textWidth(text, FONT_VALUE) + 10 <= w && barH >= 14;
                  return (
                    <g key={si}>
                      <rect x={x0} y={yMid - barH / 2} width={w} height={barH} rx={single ? 3 : 2} fill={fill} className="ct-mark" />
                      {fits && (
                        <text className="ct-seglabel" x={x0 + 6} y={yMid} dy="0.32em" fill={textOn(fill)}>
                          {text}
                        </text>
                      )}
                    </g>
                  );
                })
              )}
            </g>
          );
        })}
      </g>
    </Plot>
  );
}
