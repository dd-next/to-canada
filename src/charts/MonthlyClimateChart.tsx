import { area as d3area, curveMonotoneX, line as d3line } from 'd3-shape';
import { useMemo } from 'react';
import type { ChartSeries, ChartSpec, Flag } from '../types/contract';
import { compareColor } from '../lib/colors';
import { MONTHS_LONG, monthIndex } from '../lib/layers';
import { valueScale, valueTick, type ValueScale } from './axes';
import { ChartTooltip, HitLayer, Plot, TipBody, useActive, type ChartCtx, type HitTarget, type TipRowData } from './core';
import { FONT_LABEL, FONT_TICK, fitText, textWidth } from './measure';
import { CLIMATE } from './palette';
import { flagNotes, fmt, isNum, seriesPlace } from './text';

export interface MonthlyClimateProps {
  spec: ChartSpec;
  width: number;
  ctx: ChartCtx;
}

export type ClimateRole = 'mean' | 'max' | 'min' | 'band' | 'precip' | 'rain' | 'snow';

/** Which climate quantity a series carries, from its id/label (and y0/y1 for a combined band). */
export function climateRole(s: Pick<ChartSeries, 'id' | 'label' | 'points'>): ClimateRole | null {
  const t = `${s.id} ${s.label}`.toLowerCase().replace(/[_-]+/g, ' ');
  if (/precip/.test(t)) return 'precip';
  if (/snow/.test(t)) return 'snow';
  if (/rain/.test(t)) return 'rain';
  if (s.points.some((p) => isNum(p.y0) || isNum(p.y1))) return 'band';
  if (/\bmax|maximum|\bhigh/.test(t)) return 'max';
  if (/\bmin\b|minimum|\blow/.test(t)) return 'min';
  if (/mean|avg|average|temp/.test(t)) return 'mean';
  return null;
}

export interface ClimateMonth {
  m: number;
  mean: number | null;
  max: number | null;
  min: number | null;
  precip: number | null;
  rain: number | null;
  snow: number | null;
  flags: Flag[];
}

export interface ClimateGroup {
  key: string;
  label: string;
  placeId?: string;
  months: ClimateMonth[];
}

const emptyMonths = (): ClimateMonth[] => Array.from({ length: 12 }, (_, i) => ({ m: i + 1, mean: null, max: null, min: null, precip: null, rain: null, snow: null, flags: [] }));

function addSeries(months: ClimateMonth[], s: ChartSeries, role: ClimateRole) {
  for (const p of s.points) {
    const m = monthIndex(String(p.x));
    if (!m) continue;
    const row = months[m - 1];
    if (p.f) row.flags.push(...p.f);
    const y = isNum(p.y) ? p.y : null;
    if (role === 'band') {
      row.mean = y;
      if (isNum(p.y0)) row.min = p.y0;
      if (isNum(p.y1)) row.max = p.y1;
    } else row[role] = y;
  }
}

/**
 * One group per place when the spec compares places (several band/mean series,
 * or series carrying different placeIds); otherwise one group built from the
 * role series (mean, daily max/min, precipitation, snow) of a single place.
 */
export function climateGroups(spec: ChartSpec): ClimateGroup[] {
  const roles = spec.series.map((s) => ({ s, role: climateRole(s), placeId: seriesPlace(s) }));
  const temps = roles.filter((r) => r.role === 'band' || r.role === 'mean');
  const places = new Set(roles.map((r) => r.placeId).filter(Boolean));
  if (temps.length > 1 && (places.size > 1 || temps.every((r) => r.role === 'band'))) {
    return temps.map(({ s, role, placeId }) => {
      const months = emptyMonths();
      addSeries(months, s, role!);
      for (const r of roles) if (r.placeId && r.placeId === placeId && r.s !== s && r.role) addSeries(months, r.s, r.role);
      return { key: s.id, label: s.label, placeId, months };
    });
  }
  const months = emptyMonths();
  for (const r of roles) if (r.role) addSeries(months, r.s, r.role);
  return [{ key: 'all', label: spec.title, placeId: roles.find((r) => r.placeId)?.placeId, months }];
}

/** Back-compat helper: the months of a single-place climate spec. */
export const climateMonths = (spec: ChartSpec): ClimateMonth[] => climateGroups(spec)[0]?.months ?? emptyMonths();

interface Layout {
  cols: number;
  panelW: number;
  tH: number;
  pH: number;
  titleH: number;
  gapX: number;
  gapY: number;
  panelH: number;
  rows: number;
  height: number;
  precipGap: number;
}

function layoutFor(width: number, groups: ClimateGroup[], hasPrecip: boolean): Layout {
  const multi = groups.length > 1;
  const cols = multi ? (width >= 940 ? 3 : width >= 580 ? 2 : 1) : 1;
  const gapX = multi ? 28 : 0;
  const gapY = multi ? 26 : 0;
  const titleH = multi ? 26 : 22;
  const tH = multi ? (cols === 1 ? 150 : 132) : width < 520 ? 170 : 200;
  const pH = hasPrecip ? (multi ? 52 : 84) : 0;
  const precipGap = hasPrecip ? (multi ? 22 : 34) : 0;
  const panelH = titleH + tH + precipGap + pH + 22;
  const rows = Math.ceil(groups.length / cols);
  const panelW = (width - gapX * (cols - 1)) / cols;
  return { cols, panelW, tH, pH, titleH, gapX, gapY, panelH, rows, height: rows * panelH + (rows - 1) * gapY, precipGap };
}

export function climateHeight(width: number, spec?: ChartSpec): number {
  if (!spec) return (width < 520 ? 170 : 200) + 22 + 34 + 84 + 24;
  const groups = climateGroups(spec);
  const hasPrecip = groups.some((g) => g.months.some((m) => isNum(m.precip) || isNum(m.rain)));
  return layoutFor(width, groups, hasPrecip).height;
}

/**
 * Twelve months: a temperature band (average daily low to high) with the mean
 * line, and precipitation columns on their own panel and scale (never a second
 * axis on the same plot). Several places render as small multiples sharing one
 * temperature scale.
 */
export function MonthlyClimateChart({ spec, width, ctx }: MonthlyClimateProps) {
  const [active, setActive] = useActive();
  const groups = useMemo(() => climateGroups(spec), [spec]);
  const multi = groups.length > 1;
  const all = groups.flatMap((g) => g.months);
  const hasPrecip = all.some((m) => isNum(m.precip) || isNum(m.rain));
  const hasSnow = all.some((m) => isNum(m.snow));
  const useRain = !all.some((m) => isNum(m.precip));
  const precipOf = (m: ClimateMonth) => (useRain ? m.rain : m.precip);
  const precipLabel = useRain ? 'Rainfall' : 'Precipitation';
  const L = layoutFor(width, groups, hasPrecip);
  const temps = all.flatMap((m) => [m.mean, m.max, m.min]).filter(isNum);
  const pre = all.map(precipOf).filter(isNum);
  const tScale = valueScale(temps.length ? temps : [0, 1], [L.titleH + L.tH, L.titleH], { zero: false, ticks: 5 });
  const pScale = valueScale(pre.length ? pre : [0, 1], [L.titleH + L.tH + L.precipGap + L.pH, L.titleH + L.tH + L.precipGap], { zero: true, ticks: 2 });
  const tickW = Math.max(
    24,
    ...tScale.ticks.map((t) => textWidth(valueTick(t, 'degC', tScale.ticks), FONT_TICK)),
    ...(hasPrecip ? pScale.ticks.map((t) => textWidth(valueTick(t, 'mm', pScale.ticks), FONT_TICK)) : []),
  );
  const left = Math.ceil(tickW) + 8;
  const right = multi ? 6 : Math.ceil(textWidth('Mean', FONT_LABEL)) + 16;
  const band = (L.panelW - left - right) / 12;
  const origin = (gi: number) => ({ x: (gi % L.cols) * (L.panelW + L.gapX), y: Math.floor(gi / L.cols) * (L.panelH + L.gapY) });

  const targets: HitTarget[] = groups.flatMap((g, gi) => {
    const o = origin(gi);
    return g.months.map((m) => {
      const ys = [m.max, m.mean, m.min].filter(isNum).map(tScale.scale);
      const parts = [
        isNum(m.max) ? `average daily high ${fmt(m.max, 'degC', 1)}` : null,
        isNum(m.mean) ? `mean ${fmt(m.mean, 'degC', 1)}` : null,
        isNum(m.min) ? `average daily low ${fmt(m.min, 'degC', 1)}` : null,
        isNum(precipOf(m)) ? `${precipLabel.toLowerCase()} ${fmt(precipOf(m), 'mm', 0)}` : null,
        isNum(m.snow) ? `snowfall ${fmt(m.snow, 'cm', 0)}` : null,
      ].filter(Boolean);
      return {
        key: `${g.key}-${m.m}`,
        x: o.x + left + (m.m - 1) * band,
        y: o.y + L.titleH - 4,
        w: band,
        h: L.tH + L.precipGap + L.pH + 8,
        ax: o.x + left + (m.m - 0.5) * band,
        ay: o.y + (ys.length ? Math.min(...ys) : L.titleH + L.tH / 2),
        aria: `${multi ? `${g.label}, ` : ''}${MONTHS_LONG[m.m - 1]}: ${parts.length ? parts.join(', ') : 'no data'}`,
        placeId: g.placeId,
      };
    });
  });

  const ag = active !== null ? groups[Math.floor(active / 12)] : null;
  const am = active !== null && ag ? ag.months[active % 12] : null;
  const rows: TipRowData[] = am
    ? [
        { key: 'max', color: CLIMATE.bandStroke, keyKind: 'line', value: isNum(am.max) ? fmt(am.max, 'degC', 1) : 'No data', name: 'Average daily high', missing: !isNum(am.max) },
        { key: 'mean', color: CLIMATE.mean, keyKind: 'line', value: isNum(am.mean) ? fmt(am.mean, 'degC', 1) : 'No data', name: 'Mean temperature', missing: !isNum(am.mean), strong: true },
        { key: 'min', color: CLIMATE.bandStroke, keyKind: 'line', value: isNum(am.min) ? fmt(am.min, 'degC', 1) : 'No data', name: 'Average daily low', missing: !isNum(am.min) },
        ...(hasPrecip ? [{ key: 'p', color: CLIMATE.precip, keyKind: 'rect' as const, value: isNum(precipOf(am)) ? fmt(precipOf(am), 'mm', 0) : 'No data', name: precipLabel, missing: !isNum(precipOf(am)) }] : []),
        ...(hasSnow ? [{ key: 's', value: isNum(am.snow) ? fmt(am.snow, 'cm', 0) : 'No data', name: 'Snowfall', missing: !isNum(am.snow) }] : []),
      ]
    : [];

  return (
    <Plot
      width={width}
      height={L.height}
      summary={climateSummary(spec, groups)}
      overlay={
        <>
          <HitLayer targets={targets} active={active} onActive={setActive} label={`${ctx.title}: months`} />
          {am && ag && active !== null && (
            <ChartTooltip x={targets[active].ax} y={targets[active].ay} width={width}>
              <TipBody title={multi ? `${ag.label} · ${MONTHS_LONG[am.m - 1]}` : MONTHS_LONG[am.m - 1]} rows={rows} notes={[...new Set(flagNotes(am.flags))]} />
            </ChartTooltip>
          )}
        </>
      }
    >
      <g aria-hidden="true">
        {groups.map((g, gi) => {
          const o = origin(gi);
          const slot = ctx.slotOf(g.placeId);
          return (
            <g key={g.key} transform={`translate(${o.x},${o.y})`}>
              <Panel
                group={g}
                multi={multi}
                width={L.panelW}
                layout={L}
                left={left}
                right={right}
                band={band}
                tScale={tScale}
                pScale={pScale}
                hasPrecip={hasPrecip}
                precipOf={precipOf}
                precipLabel={precipLabel}
                activeMonth={ag === g && am ? am.m : null}
                accent={slot >= 0 ? compareColor(slot) : null}
                narrow={band < 22}
              />
            </g>
          );
        })}
      </g>
    </Plot>
  );
}

function Panel({
  group,
  multi,
  width,
  layout: L,
  left,
  right,
  band,
  tScale,
  pScale,
  hasPrecip,
  precipOf,
  precipLabel,
  activeMonth,
  accent,
  narrow,
}: {
  group: ClimateGroup;
  multi: boolean;
  width: number;
  layout: Layout;
  left: number;
  right: number;
  band: number;
  tScale: ValueScale;
  pScale: ValueScale;
  hasPrecip: boolean;
  precipOf: (m: ClimateMonth) => number | null;
  precipLabel: string;
  activeMonth: number | null;
  accent: string | null;
  narrow: boolean;
}) {
  const { months } = group;
  const plotR = width - right;
  const xm = (m: number) => left + (m - 0.5) * band;
  const yt = tScale.scale;
  const yp = pScale.scale;
  const [d0, d1] = tScale.domain;
  const lineOf = (k: 'mean' | 'max' | 'min') =>
    d3line<ClimateMonth>()
      .defined((m) => isNum(m[k]))
      .x((m) => xm(m.m))
      .y((m) => yt(m[k] as number))
      .curve(curveMonotoneX)(months) ?? '';
  const bandPath =
    d3area<ClimateMonth>()
      .defined((m) => isNum(m.max) && isNum(m.min))
      .x((m) => xm(m.m))
      .y0((m) => yt(m.min as number))
      .y1((m) => yt(m.max as number))
      .curve(curveMonotoneX)(months) ?? '';
  const hasBand = months.some((m) => isNum(m.max) && isNum(m.min));
  const hasMean = months.some((m) => isNum(m.mean));
  const tTop = L.titleH;
  const pTop = L.titleH + L.tH + L.precipGap;
  const bottom = pTop + L.pH;
  const colW = Math.min(16, band * 0.56);
  const am = activeMonth ? months[activeMonth - 1] : null;

  // Direct label (single place): the mean at the right end; the band is named in the legend and the tooltip.
  const lastMean = [...months].reverse().find((x) => isNum(x.mean));
  const annualMean = months.filter((m) => isNum(m.mean));
  const jan = months[0];
  const jul = months[6];

  return (
    <>
      {multi ? (
        <text className={accent ? 'ct-label ct-label--strong' : 'ct-label'} x={0} y={14}>
          {fitText(group.label, width * 0.55, FONT_LABEL)}
          {accent && <tspan fill={accent}> ●</tspan>}
        </text>
      ) : (
        <text className="ct-axis-title" x={0} y={10}>
          Temperature, °C
        </text>
      )}
      {multi && annualMean.length === 12 && isNum(jan.mean) && isNum(jul.mean) && (
        <text className="ct-tick" x={width} y={14} textAnchor="end">
          Jan {fmt(jan.mean, 'degC', 1)} · Jul {fmt(jul.mean, 'degC', 1)}
        </text>
      )}
      {tScale.ticks.map((t) => (
        <g key={`t${t}`}>
          <line className={t === 0 ? 'ct-freeze' : 'ct-grid'} x1={left} x2={plotR} y1={yt(t)} y2={yt(t)} />
          <text className={t === 0 ? 'ct-tick ct-tick--freeze' : 'ct-tick'} x={left - 6} y={yt(t)} dy="0.32em" textAnchor="end">
            {valueTick(t, 'degC', tScale.ticks)}
          </text>
        </g>
      ))}
      {d0 < 0 && d1 > 0 && !tScale.ticks.includes(0) && <line className="ct-freeze" x1={left} x2={plotR} y1={yt(0)} y2={yt(0)} />}
      {am && <rect className="ct-rowband" x={left + (am.m - 1) * band} y={tTop - 4} width={band} height={bottom - tTop + 8} />}
      {hasBand && <path d={bandPath} fill={accent ? `${accent}2e` : CLIMATE.band} />}
      {hasBand && <path d={lineOf('max')} fill="none" stroke={CLIMATE.bandStroke} strokeWidth={1} />}
      {hasBand && <path d={lineOf('min')} fill="none" stroke={CLIMATE.bandStroke} strokeWidth={1} />}
      {!hasBand && months.some((m) => isNum(m.max)) && <path d={lineOf('max')} fill="none" stroke={CLIMATE.bandStroke} strokeWidth={1.5} />}
      {!hasBand && months.some((m) => isNum(m.min)) && <path d={lineOf('min')} fill="none" stroke={CLIMATE.bandStroke} strokeWidth={1.5} />}
      {hasMean && <path d={lineOf('mean')} fill="none" stroke={accent ?? CLIMATE.mean} strokeWidth={2.25} strokeLinecap="round" />}
      {am && isNum(am.mean) && <circle cx={xm(am.m)} cy={yt(am.mean)} r={4} fill={accent ?? CLIMATE.mean} stroke="var(--paper)" strokeWidth={2} />}
      {!multi && lastMean && (
        <text className="ct-label ct-label--strong" x={plotR + 8} y={yt(lastMean.mean as number)} dy="0.32em">
          Mean
        </text>
      )}

      {hasPrecip && (
        <>
          <text className="ct-axis-title" x={0} y={pTop - (multi ? 8 : 10)}>
            {precipLabel}, mm
          </text>
          {pScale.ticks.map((t) => (
            <g key={`p${t}`}>
              <line className="ct-grid" x1={left} x2={plotR} y1={yp(t)} y2={yp(t)} />
              <text className="ct-tick" x={left - 6} y={yp(t)} dy="0.32em" textAnchor="end">
                {valueTick(t, 'mm', pScale.ticks)}
              </text>
            </g>
          ))}
          <line className="ct-base" x1={left} x2={plotR} y1={yp(0)} y2={yp(0)} />
          {months.map((m) => {
            const v = precipOf(m);
            if (!isNum(v)) return null;
            const x0 = xm(m.m) - colW / 2;
            const r = Math.min(3, colW / 2, yp(0) - yp(v));
            return (
              <path
                key={`c${m.m}`}
                d={`M${x0},${yp(0)}V${yp(v) + r}Q${x0},${yp(v)} ${x0 + r},${yp(v)}H${x0 + colW - r}Q${x0 + colW},${yp(v)} ${x0 + colW},${yp(v) + r}V${yp(0)}Z`}
                fill={CLIMATE.precip}
                fillOpacity={am && am.m !== m.m ? 0.55 : 0.85}
              />
            );
          })}
        </>
      )}
      {!hasPrecip && <line className="ct-base" x1={left} x2={plotR} y1={tTop + L.tH} y2={tTop + L.tH} />}
      {months.map((m) => (
        <text key={`m${m.m}`} className="ct-tick" x={xm(m.m)} y={bottom + 15} textAnchor="middle">
          {narrow ? MONTHS_LONG[m.m - 1].slice(0, 1) : MONTHS_LONG[m.m - 1].slice(0, 3)}
        </text>
      ))}
    </>
  );
}

function climateSummary(spec: ChartSpec, groups: ClimateGroup[]): string {
  const parts = groups.map((g) => {
    const withMean = g.months.filter((m) => isNum(m.mean));
    if (!withMean.length) return `${g.label}: no monthly means`;
    const warm = withMean.reduce((a, b) => (b.mean! > a.mean! ? b : a));
    const cold = withMean.reduce((a, b) => (b.mean! < a.mean! ? b : a));
    const wet = g.months.filter((m) => isNum(m.precip)).reduce<ClimateMonth | null>((a, b) => (!a || b.precip! > a.precip! ? b : a), null);
    return `${groups.length > 1 ? `${g.label}: ` : ''}warmest ${MONTHS_LONG[warm.m - 1]} (mean ${fmt(warm.mean, 'degC', 1)}), coldest ${MONTHS_LONG[cold.m - 1]} (mean ${fmt(cold.mean, 'degC', 1)})${wet ? `, wettest ${MONTHS_LONG[wet.m - 1]} (${fmt(wet.precip, 'mm', 0)})` : ''}`;
  });
  return `${spec.title}. Monthly climate normals${groups.length > 1 ? ` for ${groups.length} places on one temperature scale` : ''}. ${parts.join('. ')}.`;
}
