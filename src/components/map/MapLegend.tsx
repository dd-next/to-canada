import { useState } from 'react';
import type { MetricDef } from '../../types/contract';
import { compactForUnit, MISSING_LABEL, scaleReading, type ClassScale } from '../../lib/colors';
import { formatPeriod, formatTick, plural, unitLabel } from '../../lib/format';
import type { LayerData } from '../../lib/layers';
import { Badge } from '../ui/Badge';
import { SourceNote } from '../ui/SourceNote';
import { Icon } from '../ui/Icon';

export interface MapLegendProps {
  metric: MetricDef;
  layer: LayerData | null;
  scale: ClassScale | null;
  /** Start collapsed (mobile). */
  collapsible?: boolean;
  pending?: boolean;
  className?: string;
}

/** Docked legend: label, unit, periods present, printed thresholds, missing swatch, fixed-scale note, source. */
export function MapLegend({ metric, layer, scale, collapsible, pending, className }: MapLegendProps) {
  const [open, setOpen] = useState(!collapsible);
  const compact = scale ? compactForUnit(metric.unit, scale.domain[1]) : false;
  const n = scale?.colors.length ?? 0;
  const periods = layer?.periods ?? [];
  const missing = layer ? layer.counts.missing + layer.counts.notComparable : 0;
  return (
    <section className={['legend', !open && 'is-collapsed', className].filter(Boolean).join(' ')} aria-label="Map legend">
      <div className="legend__head">
        <p className="legend__title">{metric.label}</p>
        {collapsible && (
          <button type="button" className="legend__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="sr-only">{open ? 'Hide legend details' : 'Show legend details'}</span>
            <Icon name={open ? 'chevronDown' : 'chevronUp'} size={14} />
          </button>
        )}
      </div>
      {layer?.calculation && (
        <p className="legend__calc">
          <Badge variant="estimate">Calculation</Badge> <span>{layer.calculation.replace(/^Calculation · /, '')}</span>
        </p>
      )}
      <p className="legend__unit">
        {unitLabel(metric.unit)}
        {periods.length > 0 && (
          <>
            {' · '}
            {periods.length === 1
              ? formatPeriod(periods[0].period, metric.periodType)
              : periods.map((p, i) => (
                  <span key={p.period}>
                    {i > 0 && ', '}
                    {formatPeriod(p.period, metric.periodType)} <span className="legend__count">({p.count})</span>
                  </span>
                ))}
          </>
        )}
      </p>

      {pending ? (
        <p className="legend__pending">Loading values…</p>
      ) : scale ? (
        <div className="legend__scale" role="img" aria-label={legendSummary(metric, scale, compact)}>
          <div className="legend__swatches">
            {scale.colors.map((c, i) => (
              <span key={i} className="legend__swatch" style={{ background: c }} />
            ))}
          </div>
          <div className="legend__ticks num" aria-hidden="true">
            {scale.thresholds.map((t, i) => (
              <span key={t} style={{ left: `${((i + 1) / n) * 100}%` }}>
                {formatTick(t, metric.unit, metric.decimals, compact)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="legend__pending">No comparable values for this layer.</p>
      )}

      {open && (
        <>
          <ul className="legend__keys">
            <li>
              <span className="legend__missing" aria-hidden="true" />
              {MISSING_LABEL}
              {layer && <span className="legend__count"> ({missing})</span>}
            </li>
            {layer && layer.counts.otherPeriod > 0 && (
              <li className="legend__note">
                {plural(layer.counts.otherPeriod, 'place')} {layer.counts.otherPeriod === 1 ? 'reports' : 'report'} an older period — coloured, not ranked
              </li>
            )}
            <li>
              <span className="legend__size" aria-hidden="true">
                <i />
                <i />
              </span>
              Marker area = population
            </li>
          </ul>
          <p className="legend__fixed">
            Scale fixed across all {layer ? plural(layer.counts.total, 'place') : 'places'}
            {scale && <> · {scaleReading(metric, scale)}</>}
          </p>
          {layer?.caveat && <p className="legend__caveat">{layer.caveat}</p>}
          {metric.comparabilityNote && <p className="legend__caveat">{metric.comparabilityNote}</p>}
          <SourceNote sourceId={layer?.sourceIds ?? metric.sourceIds} period={layer?.primaryPeriod} periodType={metric.periodType} />
        </>
      )}
    </section>
  );
}

function legendSummary(metric: MetricDef, scale: ClassScale, compact: boolean): string {
  const f = (v: number) => formatTick(v, metric.unit, metric.decimals, compact);
  const parts = scale.bins.map((b) => (b.lo === null ? `below ${f(b.hi!)}` : b.hi === null ? `${f(b.lo)} and above` : `${f(b.lo)} to ${f(b.hi)}`));
  return `${scale.colors.length} colour classes: ${parts.join('; ')}.`;
}
