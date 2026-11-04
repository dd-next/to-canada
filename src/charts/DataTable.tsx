import { Link } from 'react-router-dom';
import type { ChartPoint, ChartSpec, MetricDef } from '../types/contract';
import { orderXs, xKindOf, xLabelFull } from './axes';
import { climateGroups } from './MonthlyClimateChart';
import { dotRows } from './DotCompareChart';
import { MONTHS_LONG } from '../lib/layers';
import type { ChartCtx } from './core';
import { chartDecimals, flagNotes, fmt, isNum, missingText, pointNote } from './text';

function Cell({ p, unit, decimals }: { p: ChartPoint | undefined; unit: ChartSpec['unit']; decimals: number }) {
  if (!p || !isNum(p.y)) return <td className="n chart-table__na" title={p ? missingText(p) : 'Not in this chart'}>No data</td>;
  return <td className="n">{fmt(p.y, unit, decimals)}</td>;
}

function PlaceName({ name, placeId }: { name: string; placeId?: string }) {
  return placeId ? (
    <Link to={`/place/${placeId}`} className="chart-table__place">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

const notesOf = (ps: (ChartPoint | undefined)[]) => [...new Set(ps.flatMap((p) => (p ? [pointNote(p) ?? '', ...flagNotes(p.f), !isNum(p.y) && p.f?.length ? missingText(p) : ''] : [])).filter(Boolean))].join(' · ');

/** The chart's numbers as a table (the WCAG-clean twin of every chart). */
export function ChartDataTable({ spec, ctx, periodType }: { spec: ChartSpec; ctx: ChartCtx; periodType?: MetricDef['periodType'] }) {
  const unit = spec.unit;
  const decimals = chartDecimals(unit, spec.series.flatMap((s) => s.points.flatMap((p) => [p.y, p.y0 ?? null, p.y1 ?? null])));
  const caption = <caption className="sr-only">{spec.title}: data</caption>;

  if (spec.type === 'line') {
    const xs = spec.series.flatMap((s) => s.points.map((p) => p.x));
    const kind = xKindOf(xs);
    const ordered = orderXs(xs, kind);
    const maps = spec.series.map((s) => new Map(s.points.map((p) => [String(p.x), p])));
    return (
      <table className="data-table chart-table">
        {caption}
        <thead>
          <tr>
            <th scope="col">{spec.xLabel ?? 'Period'}</th>
            {spec.series.map((s) => (
              <th key={s.id} scope="col" className="n">
                <PlaceName name={s.label} placeId={s.placeId} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...ordered].reverse().map((x) => (
            <tr key={String(x)}>
              <th scope="row">{xLabelFull(x, kind, periodType)}</th>
              {maps.map((m, i) => (
                <Cell key={spec.series[i].id} p={m.get(String(x)) ?? { x, y: null }} unit={unit} decimals={decimals} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (spec.type === 'monthly_climate') {
    const groups = climateGroups(spec);
    if (groups.length > 1) {
      const t = (v: number | null) => (isNum(v) ? fmt(v, 'degC', 1) : '—');
      return (
        <table className="data-table chart-table">
          {caption}
          <thead>
            <tr>
              <th scope="col">Month</th>
              {groups.map((g) => (
                <th key={g.key} scope="col" className="n">
                  <PlaceName name={g.label} placeId={g.placeId} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONTHS_LONG.map((name, i) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {groups.map((g) => {
                  const m = g.months[i];
                  return isNum(m.mean) || isNum(m.min) || isNum(m.max) ? (
                    <td key={g.key} className="n">
                      {t(m.mean)} <span className="chart-table__sub">({t(m.min)} to {t(m.max)})</span>
                    </td>
                  ) : (
                    <td key={g.key} className="n chart-table__na">
                      No data
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={groups.length + 1} className="chart-table__note">
                Mean temperature, with the average daily low to high in brackets.
              </td>
            </tr>
          </tfoot>
        </table>
      );
    }
    const months = groups[0]?.months ?? [];
    const hasSnow = months.some((m) => isNum(m.snow));
    const hasRain = months.some((m) => isNum(m.rain));
    const c = (v: number | null, u: ChartSpec['unit'], d: number) => (isNum(v) ? <td className="n">{fmt(v, u, d)}</td> : <td className="n chart-table__na">No data</td>);
    return (
      <table className="data-table chart-table">
        {caption}
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col" className="n">
              Avg daily high
            </th>
            <th scope="col" className="n">
              Mean
            </th>
            <th scope="col" className="n">
              Avg daily low
            </th>
            <th scope="col" className="n">
              Precipitation
            </th>
            {hasRain && (
              <th scope="col" className="n">
                Rainfall
              </th>
            )}
            {hasSnow && (
              <th scope="col" className="n">
                Snowfall
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.m}>
              <th scope="row">{MONTHS_LONG[m.m - 1]}</th>
              {c(m.max, 'degC', 1)}
              {c(m.mean, 'degC', 1)}
              {c(m.min, 'degC', 1)}
              {c(m.precip, 'mm', 0)}
              {hasRain && c(m.rain, 'mm', 0)}
              {hasSnow && c(m.snow, 'cm', 0)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (spec.type === 'range') {
    const rows = spec.series.flatMap((s) => s.points.map((p) => ({ s, p })));
    const hasNotes = rows.some(({ p }) => notesOf([p]));
    return (
      <table className="data-table chart-table">
        {caption}
        <thead>
          <tr>
            <th scope="col">{spec.series.length > 1 ? 'Category' : (spec.xLabel ?? '')}</th>
            <th scope="col" className="n">
              Low
            </th>
            <th scope="col" className="n">
              Median
            </th>
            <th scope="col" className="n">
              High
            </th>
            {hasNotes && <th scope="col">Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, p }, i) => (
            <tr key={`${s.id}-${i}`} className={ctx.slotOf(p.placeId) >= 0 ? 'is-hi' : undefined}>
              <th scope="row">
                <PlaceName name={spec.series.length > 1 ? `${p.x} · ${s.label}` : String(p.x)} placeId={p.placeId} />
              </th>
              <Cell p={{ x: p.x, y: p.y0 ?? null }} unit={unit} decimals={decimals} />
              <Cell p={p} unit={unit} decimals={decimals} />
              <Cell p={{ x: p.x, y: p.y1 ?? null }} unit={unit} decimals={decimals} />
              {hasNotes && <td className="chart-table__note">{notesOf([p])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (spec.type === 'scatter') {
    const xUnit = spec.xUnit ?? unit;
    const xd = chartDecimals(xUnit, spec.series.flatMap((s) => s.points.map((p) => (typeof p.x === 'number' ? p.x : Number(p.x)))));
    return (
      <table className="data-table chart-table">
        {caption}
        <thead>
          <tr>
            <th scope="col">Point</th>
            <th scope="col" className="n">
              {spec.xLabel ?? 'x'}
            </th>
            <th scope="col" className="n">
              {spec.yLabel ?? 'y'}
            </th>
          </tr>
        </thead>
        <tbody>
          {spec.series.flatMap((s) =>
            s.points.map((p, i) => (
              <tr key={`${s.id}-${i}`} className={ctx.slotOf(p.placeId) >= 0 ? 'is-hi' : undefined}>
                <th scope="row">
                  <PlaceName name={p.label ?? p.placeId ?? String(i + 1)} placeId={p.placeId} />
                </th>
                <td className="n">{fmt(typeof p.x === 'number' ? p.x : Number(p.x), xUnit, xd)}</td>
                <Cell p={p} unit={unit} decimals={decimals} />
              </tr>
            )),
          )}
        </tbody>
      </table>
    );
  }

  if (spec.type === 'slope') {
    // Slope specs can be per category (series) or per period (series); show categories × periods.
    const xs = [...new Set(spec.series.flatMap((s) => s.points.map((p) => String(p.x))))].sort();
    const perCategory = spec.series.every((s) => s.points.length <= 2) && xs.length === 2;
    if (perCategory)
      return (
        <table className="data-table chart-table">
          {caption}
          <thead>
            <tr>
              <th scope="col">Category</th>
              {xs.map((x) => (
                <th key={x} scope="col" className="n">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.series.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  <PlaceName name={s.label} placeId={s.placeId} />
                </th>
                {xs.map((x) => (
                  <Cell key={x} p={s.points.find((p) => String(p.x) === x) ?? { x, y: null }} unit={unit} decimals={decimals} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }

  // Row charts: bar_ranked, dot_compare, stacked_bar (and per-period slope): categories × series.
  const rows = dotRows(spec, ctx);
  const hasNotes = rows.some((r) => notesOf(r.cells));
  return (
    <table className="data-table chart-table">
      {caption}
      <thead>
        <tr>
          <th scope="col">{spec.xLabel ?? ''}</th>
          {spec.series.map((s) => (
            <th key={s.id} scope="col" className="n">
              {s.label}
            </th>
          ))}
          {hasNotes && <th scope="col">Notes</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.slot >= 0 ? 'is-hi' : undefined}>
            <th scope="row">
              <PlaceName name={r.label} placeId={r.placeId} />
            </th>
            {r.cells.map((c, i) => (
              <Cell key={spec.series[i].id} p={c} unit={unit} decimals={decimals} />
            ))}
            {hasNotes && <td className="chart-table__note">{notesOf(r.cells)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
