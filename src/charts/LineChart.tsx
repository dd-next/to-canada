import { line as d3line } from 'd3-shape';
import { useMemo } from 'react';
import type { ChartSpec, Flag } from '../types/contract';
import { compareColor } from '../lib/colors';
import { isPartialX, orderXs, unitAxisTitle, valueScale, valueTick, xKindOf, xLabelFull, xTicks } from './axes';
import { ChartTooltip, HitLayer, Mark, Plot, TipBody, useActive, type ChartCtx, type HitTarget, type TipRowData } from './core';
import { FONT_LABEL, FONT_LABEL_STRONG, FONT_TICK, fitText, textWidth } from './measure';
import { CHART_BASE, CHART_CONTEXT_LINE, seriesColor, seriesShape } from './palette';
import { chartDecimals, chartSummary, flagNotes, fmt, isNum, seriesPlace } from './text';

export interface LineChartProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
  height?: number;
}

interface Styled {
  id: string;
  label: string;
  placeId?: string;
  color: string;
  width: number;
  emphasis: 'hi' | 'normal' | 'context';
  slot: number;
  index: number;
  values: Map<string, { y: number | null; f?: Flag[] }>;
}

export const lineHeight = (width: number) => (width < 480 ? 236 : width < 760 ? 272 : 312);

/** Style rule shared by the legend and the chart: highlighted places in compare colours, others recede. */
export function styleLineSeries(spec: ChartSpec, ctx: ChartCtx) {
  const anyHi = spec.series.some((s) => ctx.slotOf(seriesPlace(s)) >= 0);
  const many = spec.series.length > 4;
  return spec.series.map((s, i) => {
    const placeId = seriesPlace(s);
    const slot = ctx.slotOf(placeId);
    if (anyHi) return { color: slot >= 0 ? compareColor(slot) : CHART_CONTEXT_LINE, width: slot >= 0 ? 2.5 : 1.5, emphasis: (slot >= 0 ? 'hi' : 'context') as Styled['emphasis'], slot };
    if (many) return { color: '#8a7f73', width: 1.75, emphasis: 'normal' as const, slot: -1 };
    return { color: spec.series.length === 1 ? CHART_BASE : seriesColor(i), width: 2.25, emphasis: 'normal' as const, slot: -1 };
  });
}

/** Lines over periods (or numbers): gaps for nulls, direct end labels, crosshair tooltip. */
export function LineChart({ spec, width, ctx, height: hProp }: LineChartProps) {
  const [active, setActive] = useActive();
  const height = hProp ?? lineHeight(width);
  const unit = spec.unit;

  const model = useMemo(() => {
    const allX = spec.series.flatMap((s) => s.points.map((p) => p.x));
    const kind = xKindOf(allX);
    const xs = orderXs(allX, kind);
    const styles = styleLineSeries(spec, ctx);
    const series: Styled[] = spec.series.map((s, i) => ({
      id: s.id,
      label: s.label,
      placeId: seriesPlace(s),
      ...styles[i],
      index: i,
      values: new Map(s.points.map((p) => [String(p.x), { y: isNum(p.y) ? p.y : null, f: p.f }])),
    }));
    const ys = spec.series.flatMap((s) => s.points.map((p) => p.y)).filter(isNum);
    const refs = (spec.refs ?? []).filter((r) => r.axis !== 'x');
    const decimals = chartDecimals(unit, ys);
    return { kind, xs, series, ys: [...ys, ...refs.map((r) => r.value)], refs, decimals };
  }, [spec, ctx, unit]);

  const { kind, xs, series, ys, refs, decimals } = model;
  const narrow = width < 520;
  const top = 22;
  const bottom = 24 + (spec.xLabel ? 16 : 0);

  // y scale first (left margin depends on tick labels)
  const prelim = valueScale(ys, [height - bottom, top], { zero: 'auto', ticks: Math.max(3, Math.round((height - top - bottom) / 58)) });
  const tickLabels = prelim.ticks.map((t) => valueTick(t, unit, prelim.ticks));
  const left = Math.ceil(Math.max(24, ...tickLabels.map((t) => textWidth(t, FONT_TICK)))) + 10;

  // end labels: last non-null, non-partial point per series
  const lastOf = (s: Styled) => {
    for (let i = xs.length - 1; i >= 0; i--) {
      if (isPartialX(xs[i])) continue;
      const v = s.values.get(String(xs[i]));
      if (v && v.y !== null) return { x: xs[i], y: v.y };
    }
    return null;
  };
  const labelled = series
    .map((s) => ({ s, last: lastOf(s) }))
    .filter((e): e is { s: Styled; last: { x: string | number; y: number } } => !!e.last)
    .filter((e) => !narrow || e.s.emphasis !== 'context' || series.length <= 3);
  const showValue = (s: Styled) => s.emphasis === 'hi' || (series.length <= 4 && s.emphasis === 'normal');
  const maxLabelW = Math.min(narrow ? width * 0.34 : 190, width * 0.4);
  const labelText = (s: Styled, y: number) => {
    const name = showValue(s) ? `${s.label} ${fmt(y, unit, decimals)}` : s.label;
    return fitText(name, maxLabelW, s.emphasis === 'hi' ? FONT_LABEL_STRONG : FONT_LABEL);
  };
  const endLabels = labelled.map((e) => ({ ...e, text: labelText(e.s, e.last.y) }));
  const right = endLabels.length ? Math.ceil(Math.max(...endLabels.map((e) => textWidth(e.text, e.s.emphasis === 'hi' ? FONT_LABEL_STRONG : FONT_LABEL)))) + 18 : 14;
  const plotL = left;
  const plotR = Math.max(plotL + 60, width - right);

  const { scale: y, ticks } = valueScale(ys, [height - bottom, top], { zero: 'auto', ticks: Math.max(3, Math.round((height - top - bottom) / 58)) });
  const numeric = kind === 'numeric';
  const xNum = (x: string | number) => Number(x);
  const nums = numeric ? xs.filter((x) => !isPartialX(x)).map(xNum) : [];
  const xMin = nums.length ? Math.min(...nums) : 0;
  const xMax = nums.length ? Math.max(...nums) : 1;
  const xPos = (x: string | number) => {
    if (numeric && !isPartialX(x)) return plotL + ((xNum(x) - xMin) / (xMax - xMin || 1)) * (plotR - plotL);
    const i = xs.findIndex((v) => String(v) === String(x));
    return xs.length <= 1 ? (plotL + plotR) / 2 : plotL + (i / (xs.length - 1)) * (plotR - plotL);
  };

  // relax end-label positions (no stacking on top of each other)
  const gap = 14;
  const placed = endLabels.map((e) => ({ ...e, ty: y(e.last.y), ly: y(e.last.y) })).sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < placed.length; i++) placed[i].ly = Math.max(placed[i].ly, placed[i - 1].ly + gap);
  const maxY = height - bottom;
  if (placed.length && placed[placed.length - 1].ly > maxY) {
    placed[placed.length - 1].ly = maxY;
    for (let i = placed.length - 2; i >= 0; i--) placed[i].ly = Math.min(placed[i].ly, placed[i + 1].ly - gap);
  }
  const overflow = placed.length && placed[0].ly < top - 8;
  const finalLabels = overflow ? placed.filter((p) => p.s.emphasis !== 'context') : placed;

  const order = [...series].sort((a, b) => (a.emphasis === 'context' ? 0 : 1) - (b.emphasis === 'context' ? 0 : 1));
  const path = (s: Styled) =>
    d3line<string | number>()
      .defined((x) => !isPartialX(x) && (s.values.get(String(x))?.y ?? null) !== null)
      .x((x) => xPos(x))
      .y((x) => y(s.values.get(String(x))!.y!))(xs) ?? '';
  // single isolated points (a defined value with undefined neighbours) need a dot to be visible
  const isolated = (s: Styled) =>
    xs.filter((x, i) => {
      if (isPartialX(x)) return false;
      const v = s.values.get(String(x))?.y ?? null;
      if (v === null) return false;
      const prev = i > 0 ? (s.values.get(String(xs[i - 1]))?.y ?? null) : null;
      const next = i < xs.length - 1 && !isPartialX(xs[i + 1]) ? (s.values.get(String(xs[i + 1]))?.y ?? null) : null;
      return prev === null && next === null;
    });
  const partials = xs.filter(isPartialX);
  const xt = xTicks(xs, kind, plotR - plotL);
  const [d0, d1] = y.domain();

  // hit targets: one band per x position
  const positions = xs.map(xPos);
  const targets: HitTarget[] = xs.map((x, i) => {
    const prev = i > 0 ? (positions[i - 1] + positions[i]) / 2 : plotL - 6;
    const next = i < xs.length - 1 ? (positions[i] + positions[i + 1]) / 2 : plotR + 6;
    const vals = series
      .map((s) => ({ s, v: s.values.get(String(x))?.y ?? null }))
      .filter((e) => e.v !== null)
      .sort((a, b) => b.v! - a.v!);
    const anchorY = vals.length ? Math.min(...vals.map((e) => y(e.v!))) : (top + height - bottom) / 2;
    const read = vals.length ? vals.slice(0, 10).map((e) => `${e.s.label} ${fmt(e.v, unit, decimals)}`).join('; ') : 'no data';
    return { key: String(x), x: prev, y: top - 6, w: next - prev, h: height - bottom - top + 12, ax: positions[i], ay: anchorY, aria: `${xLabelFull(x, kind, ctx.periodType, spec.xLabel)}: ${read}` };
  });

  const act = active !== null ? xs[active] : null;
  const tipRows: TipRowData[] =
    act === null
      ? []
      : series
          .map((s) => ({ s, e: s.values.get(String(act)) }))
          .filter(({ e }) => e !== undefined)
          .sort((a, b) => {
            const ra = a.s.emphasis === 'context' ? 1 : 0;
            const rb = b.s.emphasis === 'context' ? 1 : 0;
            return ra - rb || (b.e!.y ?? -Infinity) - (a.e!.y ?? -Infinity);
          })
          .map(({ s, e }) => ({
            key: s.id,
            color: s.color,
            keyKind: 'line' as const,
            value: e!.y === null ? 'No data' : fmt(e!.y, unit, decimals),
            name: s.label,
            missing: e!.y === null,
            strong: s.emphasis === 'hi',
          }));
  const tipNotes = act === null ? [] : [...new Set(series.flatMap((s) => flagNotes(s.values.get(String(act))?.f)))];
  if (act !== null && isPartialX(act)) tipNotes.unshift('Partial period (year to date) — not comparable with full years');

  const summary = chartSummary(spec, ctx.periodType);
  const yTitle = spec.yLabel ?? unitAxisTitle(unit);

  return (
    <Plot
      width={width}
      height={height}
      summary={summary}
      overlay={
        <>
          <HitLayer targets={targets} active={active} onActive={setActive} label={`${ctx.title}: values by ${spec.xLabel?.toLowerCase() ?? 'period'}`} />
          {active !== null && act !== null && (
            <ChartTooltip x={targets[active].ax} y={targets[active].ay} width={width}>
              <TipBody title={xLabelFull(act, kind, ctx.periodType, spec.xLabel)} rows={tipRows} notes={tipNotes} />
            </ChartTooltip>
          )}
        </>
      }
    >
      <g aria-hidden="true">
        {yTitle && (
          <text className="ct-axis-title" x={0} y={10}>
            {yTitle}
          </text>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 && d0 < 0 && d1 > 0 ? 'ct-zero' : 'ct-grid'} x1={plotL} x2={plotR} y1={y(t)} y2={y(t)} />
            <text className="ct-tick" x={plotL - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {valueTick(t, unit, ticks)}
            </text>
          </g>
        ))}
        <line className="ct-base" x1={plotL} x2={plotR} y1={height - bottom} y2={height - bottom} />
        {xt.map((t) => (
          <g key={String(t.x)}>
            <line className="ct-tickmark" x1={xPos(t.x)} x2={xPos(t.x)} y1={height - bottom} y2={height - bottom + 4} />
            <text className="ct-tick" x={xPos(t.x)} y={height - bottom + 15} textAnchor={xPos(t.x) > plotR - 20 ? 'end' : xPos(t.x) < plotL + 20 ? 'start' : 'middle'}>
              {t.label}
            </text>
          </g>
        ))}
        {spec.xLabel && (
          <text className="ct-axis-title" x={plotR} y={height - 2} textAnchor="end">
            {spec.xLabel}
          </text>
        )}
        {refs.map((r) => (
          <g key={r.label}>
            <line className="ct-ref" x1={plotL} x2={plotR} y1={y(r.value)} y2={y(r.value)} />
            <text className="ct-ref-label" x={plotL + 4} y={y(r.value) - 5}>
              {r.label} {fmt(r.value, unit, decimals)}
            </text>
          </g>
        ))}
        {act !== null && <line className="ct-crosshair" x1={xPos(act)} x2={xPos(act)} y1={top - 4} y2={height - bottom} />}
        {order.map((s) => (
          <g key={s.id} className={`ct-series ct-series--${s.emphasis}`}>
            <path d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />
            {isolated(s).map((x) => (
              <circle key={String(x)} cx={xPos(x)} cy={y(s.values.get(String(x))!.y!)} r={2.75} fill={s.color} />
            ))}
            {partials.map((x) => {
              const v = s.values.get(String(x))?.y ?? null;
              if (v === null) return null;
              return <circle key={String(x)} cx={xPos(x)} cy={y(v)} r={4} fill="var(--paper)" stroke={s.color} strokeWidth={1.75} />;
            })}
          </g>
        ))}
        {finalLabels.map((l) => {
          const ex = xPos(l.last.x);
          const lx = plotR + 8;
          const moved = Math.abs(l.ly - l.ty) > 1.5 || ex < plotR - 1;
          return (
            <g key={l.s.id} className={`ct-endlabel ct-endlabel--${l.s.emphasis}`}>
              {l.s.emphasis !== 'context' && <circle cx={ex} cy={l.ty} r={3.5} fill={l.s.color} stroke="var(--paper)" strokeWidth={2} />}
              {moved && <path className="ct-leader" d={`M${ex + 4},${l.ty}L${lx - 6},${l.ty}L${lx - 2},${l.ly}`} fill="none" />}
              <text className={l.s.emphasis === 'hi' ? 'ct-label ct-label--strong' : l.s.emphasis === 'context' ? 'ct-label ct-label--muted' : 'ct-label'} x={lx} y={l.ly} dy="0.32em">
                {l.text}
              </text>
            </g>
          );
        })}
        {act !== null &&
          series.map((s) => {
            const v = s.values.get(String(act))?.y ?? null;
            if (v === null) return null;
            return <Mark key={s.id} cx={xPos(act)} cy={y(v)} r={s.emphasis === 'context' ? 3 : 4} fill={s.color} stroke="var(--paper)" strokeWidth={2} shape={s.slot >= 0 ? 'circle' : seriesShape(0)} />;
          })}
      </g>
    </Plot>
  );
}
