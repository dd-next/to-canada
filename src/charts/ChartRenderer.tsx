import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChartSpec, MetricDef } from '../types/contract';
import { compareColor } from '../lib/colors';
import { useElementSize, usePrefersReducedMotion } from '../lib/hooks';
import { Disclosure } from '../components/ui/Disclosure';
import { SourceNote } from '../components/ui/SourceNote';
import { BarRankedChart, barRankedHeight } from './BarRankedChart';
import { ChartDataTable } from './DataTable';
import { DotCompareChart, dotCompareHeight } from './DotCompareChart';
import { LineChart, lineHeight, styleLineSeries } from './LineChart';
import { MonthlyClimateChart, climateGroups, climateHeight } from './MonthlyClimateChart';
import { RangeChart, rangeHeight } from './RangeChart';
import { ScatterChart, scatterHeight } from './ScatterChart';
import { SlopeChart, slopeHeight } from './SlopeChart';
import { StackedBarChart, stackedHeight } from './StackedBarChart';
import { SeriesKey, type ChartCtx } from './core';
import { useFontsReady } from './measure';
import { CHART_BASE, CHART_RANGE, CLIMATE, seriesColor, seriesShape } from './palette';
import { missingNote, seriesPlace } from './text';
import '../styles/charts.css';

export interface ChartRendererProps {
  spec: ChartSpec;
  /** Places to emphasise, in compare-colour order (up to 3). */
  highlightIds?: readonly string[];
  /** Render without the built-in title block (the page provides one). */
  hideTitle?: boolean;
  /** Heading level of the title (default 3). */
  titleLevel?: 2 | 3 | 4;
  /** How to read period x values, e.g. 'three_month_avg' for LFS series. */
  periodType?: MetricDef['periodType'];
  /** Show the source line (default true). */
  showSource?: boolean;
  /** Show the "View data" table (default true). */
  showTable?: boolean;
  /** Points with a placeId open /place/:id (default true). */
  linkPlaces?: boolean;
  /** Fixed plot height for line and scatter charts. */
  height?: number;
  /** Extra content under the notes (e.g. assumptions). */
  footer?: ReactNode;
  /** Content between the header and the plot (e.g. a control). */
  controls?: ReactNode;
  className?: string;
  id?: string;
}

const MAX_HI = 3;

/** Approximate plot height before the width is known (rows are fixed-height, so no layout shift). */
function estimateHeight(spec: ChartSpec, width: number, h?: number): number {
  switch (spec.type) {
    case 'bar_ranked':
      return barRankedHeight(spec);
    case 'dot_compare':
      return dotCompareHeight(spec);
    case 'range':
      return rangeHeight(spec);
    case 'stacked_bar':
      return stackedHeight(spec);
    case 'monthly_climate':
      return climateHeight(width, spec);
    case 'slope':
      return slopeHeight(spec);
    case 'scatter':
      return h ?? scatterHeight(width);
    default:
      return h ?? lineHeight(width);
  }
}

/**
 * Renders any contract ChartSpec: title, legend, the chart (responsive,
 * keyboard-focusable points with tooltips), missing-data note, notes, source
 * and a "View data" table. Null values are gaps or "No data", never zero.
 */
export function ChartRenderer({
  spec,
  highlightIds,
  hideTitle,
  titleLevel = 3,
  periodType,
  showSource = true,
  showTable = true,
  linkPlaces = true,
  height,
  footer,
  controls,
  className,
  id,
}: ChartRendererProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(bodyRef);
  useFontsReady();
  const reduced = usePrefersReducedMotion();
  const navigate = useNavigate();
  const titleId = useId();

  // Highlight slots: the prop seeds them; the legend can change them (line and slope charts with place series).
  const placeSeries = useMemo(() => spec.series.map(seriesPlace), [spec.series]);
  const toggleable = (spec.type === 'line' || spec.type === 'slope') && spec.series.length >= 2 && placeSeries.every(Boolean);
  const seed = useMemo(() => {
    const s: (string | null)[] = [null, null, null];
    (highlightIds ?? []).slice(0, MAX_HI).forEach((h, i) => (s[i] = h));
    return s;
  }, [highlightIds]);
  const [local, setLocal] = useState<{ slots: (string | null)[]; order: string[] } | null>(null);
  const slots = local?.slots ?? seed;
  const toggle = useCallback(
    (placeId: string) => {
      setLocal((cur) => {
        const s = [...(cur?.slots ?? seed)];
        const order = [...(cur?.order ?? seed.filter((x): x is string => !!x))];
        const at = s.indexOf(placeId);
        if (at >= 0) {
          s[at] = null;
          return { slots: s, order: order.filter((x) => x !== placeId) };
        }
        let free = s.indexOf(null);
        if (free < 0) {
          const oldest = order.shift()!;
          free = s.indexOf(oldest);
        }
        s[free] = placeId;
        return { slots: s, order: [...order, placeId] };
      });
    },
    [seed],
  );

  const activatePlace = useCallback((pid: string) => navigate(`/place/${pid}`), [navigate]);
  const ctx: ChartCtx = useMemo(
    () => ({
      unit: spec.unit,
      periodType,
      highlight: slots.filter((x): x is string => !!x),
      slotOf: (pid) => (pid ? slots.indexOf(pid) : -1),
      activatePlace: linkPlaces ? activatePlace : undefined,
      title: spec.title,
      reduced,
    }),
    [spec.unit, spec.title, periodType, slots, linkPlaces, activatePlace, reduced],
  );

  const H = `h${titleLevel}` as 'h2' | 'h3' | 'h4';
  const note = useMemo(() => missingNote(spec, periodType), [spec, periodType]);
  const empty = spec.series.every((s) => s.points.every((p) => p.y === null && p.y0 == null && p.y1 == null));

  let body: ReactNode = null;
  if (width > 0 && !empty) {
    switch (spec.type) {
      case 'line':
        body = <LineChart spec={spec} width={width} ctx={ctx} height={height} />;
        break;
      case 'bar_ranked':
        body = <BarRankedChart spec={spec} width={width} ctx={ctx} />;
        break;
      case 'dot_compare':
        body = <DotCompareChart spec={spec} width={width} ctx={ctx} />;
        break;
      case 'range':
        body = <RangeChart spec={spec} width={width} ctx={ctx} />;
        break;
      case 'scatter':
        body = <ScatterChart spec={spec} width={width} ctx={ctx} height={height} />;
        break;
      case 'stacked_bar':
        body = <StackedBarChart spec={spec} width={width} ctx={ctx} />;
        break;
      case 'monthly_climate':
        body = <MonthlyClimateChart spec={spec} width={width} ctx={ctx} />;
        break;
      case 'slope':
        body = <SlopeChart spec={spec} width={width} ctx={ctx} />;
        break;
      default:
        body = <p className="chart__unsupported">This chart type ({String((spec as ChartSpec).type)}) is not supported yet. The numbers are in the table below.</p>;
    }
  }

  return (
    <figure className={['chart', `chart--${spec.type}`, className].filter(Boolean).join(' ')} id={id} aria-labelledby={hideTitle ? undefined : titleId} aria-label={hideTitle ? spec.title : undefined}>
      {!hideTitle && (
        <figcaption className="chart__head">
          <H id={titleId} className="chart__title">
            {spec.title}
          </H>
          {spec.subtitle && <p className="chart__sub">{spec.subtitle}</p>}
        </figcaption>
      )}
      {controls && <div className="chart__controls">{controls}</div>}
      <Legend spec={spec} ctx={ctx} toggleable={toggleable} onToggle={toggle} onReset={local ? () => setLocal(null) : undefined} />
      <div ref={bodyRef} className="chart__body">
        {empty ? (
          <p className="chart__empty">
            <span className="missing__mark" aria-hidden="true" />
            No published values for this chart in the current snapshot.
          </p>
        ) : (
          body ?? <div className="chart__placeholder" style={{ height: estimateHeight(spec, 640, height) }} />
        )}
      </div>
      {(note || spec.notes || footer || showSource || showTable) && (
        <div className="chart__foot">
          {note && <p className="chart__missing">{note}</p>}
          {spec.notes && <p className="chart__notes">{spec.notes}</p>}
          {footer}
          {showSource && spec.sourceIds.length > 0 && <SourceNote sourceId={spec.sourceIds} />}
          {showTable && !empty && (
            <Disclosure summary={<span className="chart__tabletoggle">View data</span>} variant="plain" className="chart__table">
              <div className="chart-table__scroll">
                <ChartDataTable spec={spec} ctx={ctx} periodType={periodType} />
              </div>
            </Disclosure>
          )}
        </div>
      )}
    </figure>
  );
}

function Legend({ spec, ctx, toggleable, onToggle, onReset }: { spec: ChartSpec; ctx: ChartCtx; toggleable: boolean; onToggle: (id: string) => void; onReset?: () => void }) {
  if (spec.type === 'monthly_climate') {
    const months = climateGroups(spec).flatMap((g) => g.months);
    const precip = months.some((m) => m.precip !== null);
    const rain = !precip && months.some((m) => m.rain !== null);
    return (
      <ul className="chart__legend" aria-label="Legend">
        <li>
          <SeriesKey color={CLIMATE.mean} kind="line" />
          Mean temperature
        </li>
        <li>
          <SeriesKey color={CLIMATE.band} kind="rect" />
          Average daily low to high
        </li>
        {(precip || rain) && (
          <li>
            <SeriesKey color={CLIMATE.precip} kind="rect" />
            {precip ? 'Precipitation (rain and melted snow)' : 'Rainfall'}
          </li>
        )}
      </ul>
    );
  }
  if (spec.type === 'range')
    return (
      <ul className="chart__legend" aria-label="Legend">
        <li>
          <SeriesKey color={CHART_BASE} kind="dot" />
          Median
        </li>
        <li>
          <SeriesKey color={CHART_RANGE} kind="range" />
          Low to high
        </li>
        {spec.series.length > 1 && <li className="chart__legend-note">{spec.series.map((s) => s.label).join(' · ')}</li>}
      </ul>
    );
  if (spec.series.length < 2 || spec.type === 'bar_ranked') return null;

  if (spec.type === 'line' || spec.type === 'slope') {
    const styles = spec.type === 'line' ? styleLineSeries(spec, ctx) : null;
    const anyHi = spec.series.some((s) => ctx.slotOf(seriesPlace(s)) >= 0);
    return (
      <div className="chart__legend-wrap">
        <ul className={['chart__legend', toggleable && 'chart__legend--toggles'].filter(Boolean).join(' ')} aria-label={toggleable ? 'Legend. Choose up to three to highlight' : 'Legend'}>
          {spec.series.map((s, i) => {
            const pid = seriesPlace(s);
            const slot = ctx.slotOf(pid);
            const color = styles ? styles[i].color : slot >= 0 ? compareColor(slot) : anyHi ? '#ad9f90' : seriesColor(i);
            if (toggleable && pid)
              return (
                <li key={s.id}>
                  <button type="button" className={['chart__toggle', slot >= 0 && 'is-on'].filter(Boolean).join(' ')} aria-pressed={slot >= 0} onClick={() => onToggle(pid)}>
                    <SeriesKey color={color} kind="line" />
                    {s.label}
                  </button>
                </li>
              );
            return (
              <li key={s.id}>
                <SeriesKey color={color} kind="line" />
                {s.label}
              </li>
            );
          })}
        </ul>
        {toggleable && (
          <p className="chart__legend-hint">
            {onReset ? (
              <button type="button" className="chart__reset" onClick={onReset}>
                Reset highlight
              </button>
            ) : (
              'Select up to three to highlight'
            )}
          </p>
        )}
      </div>
    );
  }
  const kind = spec.type === 'stacked_bar' ? 'rect' : 'dot';
  return (
    <ul className="chart__legend" aria-label="Legend">
      {spec.series.map((s, i) => (
        <li key={s.id}>
          <SeriesKey color={seriesColor(i)} kind={kind} shape={seriesShape(i)} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
