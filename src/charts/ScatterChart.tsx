import { useMemo } from 'react';
import type { ChartPoint, ChartSpec, Unit } from '../types/contract';
import { compareColor } from '../lib/colors';
import { unitAxisTitle, valueScale, valueTick } from './axes';
import { ChartTooltip, HitLayer, Mark, Plot, TipBody, linkHint, useActive, type ChartCtx, type HitTarget } from './core';
import { FONT_LABEL, FONT_TICK, textWidth } from './measure';
import { CHART_BASE, CHART_CONTEXT_LINE, seriesColor, seriesShape } from './palette';
import { chartDecimals, chartSummary, flagNotes, fmt, isNum, pointNote } from './text';

export interface ScatterProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
  height?: number;
}

interface Pt {
  key: string;
  p: ChartPoint;
  si: number;
  x: number;
  y: number;
  name: string;
  slot: number;
}

const numX = (x: string | number) => (typeof x === 'number' ? x : Number(x));

export const scatterHeight = (width: number) => Math.round(Math.max(260, Math.min(440, width * 0.62)));

/** Labelled points (x numeric, y numeric), optional quadrant reference lines. */
export function ScatterChart({ spec, width, ctx, height: hProp }: ScatterProps) {
  const [active, setActive] = useActive();
  const yUnit = spec.unit;
  const xUnit: Unit = spec.xUnit ?? spec.unit;
  const height = hProp ?? scatterHeight(width);
  const pts: Pt[] = useMemo(
    () =>
      spec.series
        .flatMap((s, si) =>
          s.points.map((p, i) => ({
            key: `${s.id}-${i}`,
            p,
            si,
            x: numX(p.x),
            y: p.y as number,
            name: p.label ?? (p.placeId ? p.placeId : String(i + 1)),
            slot: ctx.slotOf(p.placeId ?? s.placeId),
          })),
        )
        .filter((d) => isNum(d.x) && isNum(d.y))
        .sort((a, b) => a.x - b.x),
    [spec, ctx],
  );
  const anyHi = pts.some((d) => d.slot >= 0);
  const xd = chartDecimals(xUnit, pts.map((d) => d.x));
  const yd = chartDecimals(yUnit, pts.map((d) => d.y));
  const refsX = (spec.refs ?? []).filter((r) => r.axis === 'x');
  const refsY = (spec.refs ?? []).filter((r) => r.axis !== 'x');

  const top = 22;
  const bottom = 40;
  const yPre = valueScale([...pts.map((d) => d.y), ...refsY.map((r) => r.value)], [height - bottom, top], { zero: false, ticks: 5, pad: 0.04 });
  const left = Math.ceil(Math.max(24, ...yPre.ticks.map((t) => textWidth(valueTick(t, yUnit, yPre.ticks), FONT_TICK)))) + 10;
  const right = 16;
  const { scale: y, ticks: yt } = yPre;
  const { scale: x, ticks: xt } = valueScale([...pts.map((d) => d.x), ...refsX.map((r) => r.value)], [left, width - right], { zero: false, ticks: width < 520 ? 4 : 6, pad: 0.04 });

  // Direct labels: highlighted points first, then extremes; skip any that would collide.
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labelled = new Map<string, { lx: number; ly: number; anchor: 'start' | 'end' }>();
  const want = [
    ...pts.filter((d) => d.slot >= 0),
    ...[...pts].sort((a, b) => b.y - a.y).slice(0, 2),
    ...[...pts].sort((a, b) => a.y - b.y).slice(0, 2),
    pts[0],
    pts[pts.length - 1],
  ].filter(Boolean);
  for (const d of want) {
    if (labelled.has(d.key) || labelled.size >= (width < 520 ? 5 : 9)) continue;
    const w = textWidth(d.name, FONT_LABEL);
    const cx = x(d.x);
    const cy = y(d.y);
    for (const side of ['start', 'end'] as const) {
      const lx = side === 'start' ? cx + 8 : cx - 8;
      const bx0 = side === 'start' ? lx : lx - w;
      const box = { x0: bx0 - 2, x1: bx0 + w + 2, y0: cy - 8, y1: cy + 8 };
      if (box.x0 < left || box.x1 > width) continue;
      if (boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      boxes.push(box);
      labelled.set(d.key, { lx, ly: cy, anchor: side });
      break;
    }
  }

  const targets: HitTarget[] = pts.map((d) => {
    const cx = x(d.x);
    const cy = y(d.y);
    return {
      key: d.key,
      x: cx - 12,
      y: cy - 12,
      w: 24,
      h: 24,
      ax: cx,
      ay: cy,
      aria: `${d.name}: ${spec.xLabel ?? 'x'} ${fmt(d.x, xUnit, xd)}, ${spec.yLabel ?? 'y'} ${fmt(d.y, yUnit, yd)}`,
      placeId: d.p.placeId,
    };
  });
  const act = active !== null ? pts[active] : null;
  const colorOf = (d: Pt) => (d.slot >= 0 ? compareColor(d.slot) : anyHi ? CHART_CONTEXT_LINE : spec.series.length > 1 ? seriesColor(d.si) : CHART_BASE);

  return (
    <Plot
      width={width}
      height={height}
      summary={chartSummary(spec)}
      overlay={
        <>
          <HitLayer targets={targets} active={active} onActive={setActive} label={`${ctx.title}: points`} activatePlace={ctx.activatePlace} />
          {act && active !== null && (
            <ChartTooltip x={targets[active].ax} y={targets[active].ay} width={width}>
              <TipBody
                title={act.name}
                sub={spec.series.length > 1 ? spec.series[act.si].label : undefined}
                rows={[
                  { key: 'y', value: fmt(act.y, yUnit, yd), name: spec.yLabel ?? unitAxisTitle(yUnit) },
                  { key: 'x', value: fmt(act.x, xUnit, xd), name: spec.xLabel ?? unitAxisTitle(xUnit) },
                ]}
                notes={[pointNote({ ...act.p, label: act.p.label === act.name ? undefined : act.p.label }) ?? '', ...flagNotes(act.p.f)]}
                hint={linkHint(act.p.placeId ? act.name : undefined, !!(act.p.placeId && ctx.activatePlace))}
              />
            </ChartTooltip>
          )}
        </>
      }
    >
      <g aria-hidden="true">
        <text className="ct-axis-title" x={0} y={10}>
          {spec.yLabel ?? unitAxisTitle(yUnit)}
        </text>
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line className="ct-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
            <text className="ct-tick" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {valueTick(t, yUnit, yt)}
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <g key={`x${t}`}>
            <line className="ct-grid" x1={x(t)} x2={x(t)} y1={top} y2={height - bottom} />
            <text className="ct-tick" x={x(t)} y={height - bottom + 15} textAnchor="middle">
              {valueTick(t, xUnit, xt)}
            </text>
          </g>
        ))}
        <line className="ct-base" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
        <text className="ct-axis-title" x={width - right} y={height - 4} textAnchor="end">
          {spec.xLabel ?? unitAxisTitle(xUnit)}
        </text>
        {refsY.map((r) => (
          <g key={`ry${r.label}`}>
            <line className="ct-ref" x1={left} x2={width - right} y1={y(r.value)} y2={y(r.value)} />
            <text className="ct-ref-label" x={width - right} y={y(r.value) - 5} textAnchor="end">
              {r.label}
            </text>
          </g>
        ))}
        {refsX.map((r) => (
          <g key={`rx${r.label}`}>
            <line className="ct-ref" x1={x(r.value)} x2={x(r.value)} y1={top} y2={height - bottom} />
            <text className="ct-ref-label" x={x(r.value) + 4} y={top + 8}>
              {r.label}
            </text>
          </g>
        ))}
        {[...pts]
          .sort((a, b) => (a.slot >= 0 ? 1 : 0) - (b.slot >= 0 ? 1 : 0))
          .map((d) => (
            <Mark
              key={d.key}
              shape={spec.series.length > 1 && d.slot < 0 ? seriesShape(d.si) : 'circle'}
              cx={x(d.x)}
              cy={y(d.y)}
              r={d.slot >= 0 ? 6 : 4.5}
              fill={colorOf(d)}
              stroke="var(--paper)"
              strokeWidth={2}
              className={['ct-mark', act?.key === d.key && 'is-active'].filter(Boolean).join(' ')}
            />
          ))}
        {pts.map((d) => {
          const l = labelled.get(d.key);
          if (!l) return null;
          return (
            <text key={`l${d.key}`} className={d.slot >= 0 ? 'ct-label ct-label--strong' : 'ct-label ct-label--soft'} x={l.lx} y={l.ly} dy="0.32em" textAnchor={l.anchor}>
              {d.name}
            </text>
          );
        })}
      </g>
    </Plot>
  );
}
