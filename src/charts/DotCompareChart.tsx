import { useMemo } from 'react';
import type { ChartPoint, ChartSpec } from '../types/contract';
import { compareColor } from '../lib/colors';
import { formatNumber } from '../lib/format';
import { valueScale, valueTick } from './axes';
import { ChartTooltip, HitLayer, Mark, Plot, TipBody, linkHint, useActive, type ChartCtx, type HitTarget, type TipRowData } from './core';
import { CHART_CONNECTOR, seriesColor, seriesShape } from './palette';
import { rowLayout } from './rows';
import { chartDecimals, chartSummary, flagNotes, fmt, isNum, missingText, pointNote } from './text';

export interface DotCompareProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
}

interface Row {
  key: string;
  label: string;
  placeId?: string;
  cells: (ChartPoint | undefined)[];
  slot: number;
}

export function dotRows(spec: ChartSpec, ctx: ChartCtx): Row[] {
  const order: string[] = [];
  const byKey = new Map<string, Row>();
  spec.series.forEach((s, si) =>
    s.points.forEach((p) => {
      const k = String(p.x);
      let r = byKey.get(k);
      if (!r) {
        r = { key: k, label: k, placeId: p.placeId, cells: spec.series.map(() => undefined), slot: ctx.slotOf(p.placeId) };
        byKey.set(k, r);
        order.push(k);
      }
      r.cells[si] = p;
      if (!r.placeId && p.placeId) {
        r.placeId = p.placeId;
        r.slot = ctx.slotOf(p.placeId);
      }
    }),
  );
  return order.map((k) => byKey.get(k)!);
}

export const dotCompareHeight = (spec: ChartSpec) => {
  const n = new Set(spec.series.flatMap((s) => s.points.map((p) => String(p.x)))).size;
  return n * (n > 30 ? 21 : 26) + 34 + (spec.refs?.length ? 16 : 0);
};

/** Two or more values per category (e.g. asking vs CMHC average rent), joined by a line showing the gap. */
export function DotCompareChart({ spec, width, ctx }: DotCompareProps) {
  const [active, setActive] = useActive();
  const unit = spec.unit;
  const rows = useMemo(() => dotRows(spec, ctx), [spec, ctx]);
  const values = rows.flatMap((r) => r.cells.map((c) => c?.y)).filter(isNum);
  const decimals = chartDecimals(unit, values);
  const L = rowLayout({ labels: rows.map((r) => r.label), width, rightReserve: 18, rowH: rows.length > 30 ? 21 : 26, top: spec.refs?.length ? 20 : 4, strong: rows.map((r) => r.slot >= 0) });
  const { scale: x, ticks } = valueScale([...values, ...(spec.refs ?? []).map((r) => r.value)], [L.plotL + 8, L.plotR], { zero: false, ticks: width < 520 ? 3 : 5, pad: 0.03 });
  const height = L.top + rows.length * L.rowH + 30;
  const axisY = L.top + rows.length * L.rowH + 6;
  const r = rows.length > 30 ? 4.25 : 5;
  const two = spec.series.length === 2;

  const targets: HitTarget[] = rows.map((row, i) => {
    const yTop = L.top + i * L.rowH;
    const vals = row.cells.map((c) => (isNum(c?.y) ? c!.y! : null));
    const present = vals.filter(isNum);
    const reads = spec.series.map((s, si) => `${s.label} ${vals[si] === null ? 'no data' : fmt(vals[si], unit, decimals)}`).join('; ');
    return {
      key: row.key,
      x: 0,
      y: yTop,
      w: width,
      h: L.rowH,
      ax: present.length ? x(Math.max(...present)) + 10 : L.plotL + 40,
      ay: yTop + L.rowH / 2,
      aria: `${row.label}: ${reads}`,
      placeId: row.placeId,
    };
  });

  const act = active !== null ? rows[active] : null;
  let gapNote: string | null = null;
  if (act && two) {
    const a = act.cells[0]?.y;
    const b = act.cells[1]?.y;
    if (isNum(a) && isNum(b) && b !== 0) {
      const diff = a - b;
      const pct = (diff / b) * 100;
      gapNote = `${spec.series[0].label} is ${fmt(Math.abs(diff), unit, decimals)} ${diff >= 0 ? 'higher' : 'lower'} (${formatNumber(pct, 0, { signed: true })}%) than ${spec.series[1].label}`;
    }
  }
  const tipRows: TipRowData[] = act
    ? spec.series.map((s, si) => {
        const c = act.cells[si];
        const v = isNum(c?.y) ? c!.y! : null;
        return { key: s.id, color: seriesColor(si), keyKind: 'dot', shape: seriesShape(si), value: v === null ? 'No data' : fmt(v, unit, decimals), name: s.label, missing: v === null };
      })
    : [];
  const tipNotes = act ? [...new Set(act.cells.flatMap((c) => [...flagNotes(c?.f), c ? (pointNote(c) ?? '') : '', c && !isNum(c.y) ? missingText(c) : '']))] : [];

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
              <TipBody title={act.label} rows={tipRows} notes={[gapNote ?? '', ...tipNotes]} hint={linkHint(act.placeId ? act.label : undefined, !!(act.placeId && ctx.activatePlace))} />
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
        <line className="ct-base" x1={L.plotL + 8} x2={L.plotR} y1={axisY} y2={axisY} />
        {(spec.refs ?? []).map((rf) => (
          <g key={rf.label}>
            <line className="ct-ref" x1={x(rf.value)} x2={x(rf.value)} y1={L.top - 6} y2={axisY} />
            <text className="ct-ref-label" x={x(rf.value)} y={10} textAnchor={x(rf.value) > (L.plotL + L.plotR) / 2 ? 'end' : 'start'} dx={x(rf.value) > (L.plotL + L.plotR) / 2 ? -4 : 4}>
              {rf.label} {fmt(rf.value, unit, decimals)}
            </text>
          </g>
        ))}
        {rows.map((row, i) => {
          const yMid = L.top + i * L.rowH + L.rowH / 2;
          const vals = row.cells.map((c) => (isNum(c?.y) ? c!.y! : null));
          const present = vals.filter(isNum);
          const strong = row.slot >= 0;
          return (
            <g key={row.key}>
              {(strong || active === i) && <rect className={strong ? 'ct-rowband ct-rowband--hi' : 'ct-rowband'} x={0} y={yMid - L.rowH / 2} width={width} height={L.rowH} />}
              {strong && <rect x={0} y={yMid - L.rowH / 2} width={3} height={L.rowH} fill={compareColor(row.slot)} />}
              <text className={strong ? 'ct-label ct-label--strong' : present.length ? 'ct-label' : 'ct-label ct-label--muted'} x={L.labelW} y={yMid} dy="0.32em" textAnchor="end">
                {L.labels[i]}
              </text>
              {present.length === 0 ? (
                <text className="ct-na" x={L.plotL + 10} y={yMid} dy="0.32em">
                  No data
                </text>
              ) : (
                <>
                  {present.length > 1 && <line x1={x(Math.min(...present))} x2={x(Math.max(...present))} y1={yMid} y2={yMid} stroke={CHART_CONNECTOR} strokeWidth={2} strokeLinecap="round" />}
                  {vals.map((v, si) =>
                    v === null ? null : <Mark key={si} shape={seriesShape(si)} cx={x(v)} cy={yMid} r={r} fill={seriesColor(si)} stroke="var(--paper)" strokeWidth={1.5} className="ct-mark" />,
                  )}
                </>
              )}
            </g>
          );
        })}
      </g>
    </Plot>
  );
}
