import { useMemo } from 'react';
import type { ChartSpec } from '../types/contract';
import { compareColor } from '../lib/colors';
import { formatNumber } from '../lib/format';
import { valueScale } from './axes';
import { ChartTooltip, HitLayer, Plot, TipBody, linkHint, useActive, type ChartCtx, type HitTarget } from './core';
import { FONT_LABEL, FONT_LABEL_STRONG, fitText, textWidth } from './measure';
import { CHART_CONTEXT_LINE, seriesColor } from './palette';
import { chartDecimals, chartSummary, fmt, isNum, seriesPlace } from './text';

export interface SlopeProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
}

interface Item {
  key: string;
  label: string;
  placeId?: string;
  a: number | null;
  b: number | null;
  slot: number;
  i: number;
}

/**
 * Normalise both slope shapes: one series per category with two points
 * (x = period), or one series per period with a point per category.
 */
export function slopeItems(spec: ChartSpec, ctx: ChartCtx): { periods: [string, string]; items: Item[] } {
  const xs = [...new Set(spec.series.flatMap((s) => s.points.map((p) => String(p.x))))];
  const perCategory = spec.series.every((s) => s.points.length <= 2) && xs.length === 2;
  if (perCategory) {
    const periods = [...xs].sort() as [string, string];
    return {
      periods,
      items: spec.series.map((s, i) => {
        const get = (t: string) => s.points.find((p) => String(p.x) === t)?.y;
        const placeId = seriesPlace(s);
        return { key: s.id, label: s.label, placeId, a: isNum(get(periods[0])) ? get(periods[0])! : null, b: isNum(get(periods[1])) ? get(periods[1])! : null, slot: ctx.slotOf(placeId), i };
      }),
    };
  }
  const [sa, sb] = spec.series;
  const periods: [string, string] = [sa?.label ?? 'Before', sb?.label ?? 'After'];
  const cats = [...new Set([...(sa?.points ?? []), ...(sb?.points ?? [])].map((p) => String(p.x)))];
  return {
    periods,
    items: cats.map((c, i) => {
      const pa = sa?.points.find((p) => String(p.x) === c);
      const pb = sb?.points.find((p) => String(p.x) === c);
      const placeId = pa?.placeId ?? pb?.placeId;
      return { key: c, label: c, placeId, a: isNum(pa?.y) ? pa!.y! : null, b: isNum(pb?.y) ? pb!.y! : null, slot: ctx.slotOf(placeId), i };
    }),
  };
}

export const slopeHeight = (spec: ChartSpec) => Math.max(260, Math.min(520, spec.series.length * 22 + 80));

/** Two periods per category, joined by a line; values labelled at both ends. */
export function SlopeChart({ spec, width, ctx }: SlopeProps) {
  const [active, setActive] = useActive();
  const unit = spec.unit;
  const { periods, items } = useMemo(() => slopeItems(spec, ctx), [spec, ctx]);
  const values = items.flatMap((it) => [it.a, it.b]).filter(isNum);
  const decimals = chartDecimals(unit, values);
  const anyHi = items.some((it) => it.slot >= 0);
  const many = items.length > 4;
  const height = Math.max(260, Math.min(520, items.length * 22 + 80));
  const top = 30;
  const bottom = 14;
  const narrow = width < 520;
  const cap = narrow ? width * 0.3 : 200;
  const leftText = (it: Item) => (it.a === null ? '' : narrow ? fmt(it.a, unit, decimals) : `${it.label} ${fmt(it.a, unit, decimals)}`);
  const rightText = (it: Item) => fitText(it.b === null ? `${it.label} (no data)` : `${fmt(it.b, unit, decimals)} ${it.label}`, cap, FONT_LABEL_STRONG);
  const lw = Math.min(cap, Math.max(30, ...items.map((it) => textWidth(leftText(it), FONT_LABEL)))) + 12;
  const rw = Math.min(cap, Math.max(30, ...items.map((it) => textWidth(rightText(it), FONT_LABEL_STRONG)))) + 12;
  const xa = lw;
  const xb = Math.max(xa + 80, width - rw);
  const { scale: y } = valueScale(values, [height - bottom, top], { zero: 'auto', ticks: 4 });

  const relax = (side: 'a' | 'b') => {
    const arr = items
      .filter((it) => it[side] !== null)
      .map((it) => ({ it, ty: y(it[side] as number), ly: y(it[side] as number) }))
      .sort((p, q) => p.ty - q.ty);
    for (let i = 1; i < arr.length; i++) arr[i].ly = Math.max(arr[i].ly, arr[i - 1].ly + 14);
    if (arr.length && arr[arr.length - 1].ly > height - 4) {
      arr[arr.length - 1].ly = height - 4;
      for (let i = arr.length - 2; i >= 0; i--) arr[i].ly = Math.min(arr[i].ly, arr[i + 1].ly - 14);
    }
    return new Map(arr.map((e) => [e.it.key, e.ly]));
  };
  const la = relax('a');
  const lb = relax('b');
  const color = (it: Item) => (it.slot >= 0 ? compareColor(it.slot) : anyHi ? CHART_CONTEXT_LINE : many ? '#8a7f73' : seriesColor(it.i));

  const targets: HitTarget[] = items.map((it) => {
    const ly = lb.get(it.key) ?? la.get(it.key) ?? top;
    const change = it.a !== null && it.b !== null ? it.b - it.a : null;
    return {
      key: it.key,
      x: xb - 6,
      y: ly - 9,
      w: width - xb + 6,
      h: 18,
      ax: xb,
      ay: ly,
      aria: `${it.label}: ${periods[0]} ${fmt(it.a, unit, decimals)}, ${periods[1]} ${fmt(it.b, unit, decimals)}${change !== null ? `, change ${fmt(change, unit === 'percent' ? 'pp' : unit, decimals)}` : ''}`,
      placeId: it.placeId,
    };
  });
  const act = active !== null ? items[active] : null;
  const order = [...items].sort((p, q) => (p.slot >= 0 ? 1 : 0) - (q.slot >= 0 ? 1 : 0));

  return (
    <Plot
      width={width}
      height={height}
      summary={chartSummary(spec)}
      overlay={
        <>
          <HitLayer targets={targets} active={active} onActive={setActive} label={`${ctx.title}: categories`} activatePlace={ctx.activatePlace} orientation="vertical" />
          {act && active !== null && (
            <ChartTooltip x={targets[active].ax} y={targets[active].ay} width={width}>
              <TipBody
                title={act.label}
                rows={[
                  { key: 'a', value: act.a === null ? 'No data' : fmt(act.a, unit, decimals), name: periods[0], missing: act.a === null },
                  { key: 'b', color: color(act), keyKind: 'line', value: act.b === null ? 'No data' : fmt(act.b, unit, decimals), name: periods[1], missing: act.b === null, strong: true },
                ]}
                notes={
                  act.a !== null && act.b !== null && act.a !== 0
                    ? [`Change: ${fmt(act.b - act.a, unit === 'percent' ? 'pp' : unit, decimals)}${unit !== 'percent' && unit !== 'pp' ? ` (${formatNumber(((act.b - act.a) / Math.abs(act.a)) * 100, 0, { signed: true })}%)` : ''}`]
                    : []
                }
                hint={linkHint(act.placeId ? act.label : undefined, !!(act.placeId && ctx.activatePlace))}
              />
            </ChartTooltip>
          )}
        </>
      }
    >
      <g aria-hidden="true">
        <text className="ct-axis-title" x={xa} y={12} textAnchor="middle">
          {periods[0]}
        </text>
        <text className="ct-axis-title" x={xb} y={12} textAnchor="middle">
          {periods[1]}
        </text>
        <line className="ct-base" x1={xa} x2={xa} y1={top - 8} y2={height - bottom} />
        <line className="ct-base" x1={xb} x2={xb} y1={top - 8} y2={height - bottom} />
        {order.map((it) => {
          const c = color(it);
          const strong = it.slot >= 0 || active === it.i;
          return (
            <g key={it.key} className="ct-slope">
              {it.a !== null && it.b !== null && <line x1={xa} x2={xb} y1={y(it.a)} y2={y(it.b)} stroke={c} strokeWidth={strong ? 2.75 : 2} strokeLinecap="round" />}
              {it.a !== null && <circle cx={xa} cy={y(it.a)} r={3.5} fill={c} stroke="var(--paper)" strokeWidth={1.5} />}
              {it.b !== null && <circle cx={xb} cy={y(it.b)} r={3.5} fill={c} stroke="var(--paper)" strokeWidth={1.5} />}
              {it.a !== null && (
                <text className={strong ? 'ct-label ct-label--strong' : 'ct-label ct-label--soft'} x={xa - 8} y={la.get(it.key)} dy="0.32em" textAnchor="end">
                  {fitText(leftText(it), lw - 12)}
                </text>
              )}
              <text className={strong ? 'ct-label ct-label--strong' : it.b === null ? 'ct-label ct-label--muted' : 'ct-label'} x={xb + 8} y={lb.get(it.key) ?? la.get(it.key)} dy="0.32em">
                {rightText(it)}
              </text>
            </g>
          );
        })}
      </g>
    </Plot>
  );
}
