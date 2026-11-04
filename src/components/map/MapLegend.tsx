import { useState } from 'react';
import type { MetricDef } from '../../types/contract';
import { compactForUnit, MISSING_LABEL, scaleReading, type ClassScale } from '../../lib/colors';
import { formatPeriod, formatTick, plural, unitLabel } from '../../lib/format';
import type { LayerData } from '../../lib/layers';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import { SourceNote } from '../ui/SourceNote';

export interface MapLegendProps {
  metric: MetricDef;
  layer: LayerData | null;
  scale: ClassScale | null;
  /** Override the heading (defaults to metric.label). */
  title?: string;
  /** Compact: scale + missing line only (e.g. while the detail drawer is open, or on mobile). */
  compact?: boolean;
  pending?: boolean;
  className?: string;
}

/**
 * Docked legend: label, unit and the periods actually present, printed class
 * thresholds, the missing swatch, a fixed-scale note and the source. Secondary
 * notes (older periods, marker size, caveats) sit behind a toggle.
 */
export function MapLegend({ metric, layer, scale, title, compact, pending, className }: MapLegendProps) {
  const [notes, setNotes] = useState(false);
  const compactNum = scale ? compactForUnit(metric.unit, scale.domain[1]) : false;
  const n = scale?.colors.length ?? 0;
  const periods = layer?.periods ?? [];
  const missing = layer ? layer.counts.missing + layer.counts.notComparable : 0;
  const hasNotes = !!layer && (layer.counts.otherPeriod > 0 || !!layer.caveat || !!metric.comparabilityNote);
  return (
    <section className={['legend', compact && 'legend--compact', notes && 'is-open', className].filter(Boolean).join(' ')} aria-label="Map legend">
      <div className="legend__head">
        <p className="legend__title">{title ?? metric.label}</p>
        <button type="button" className="legend__toggle" aria-expanded={notes} onClick={() => setNotes((o) => !o)}>
          {notes ? 'Less' : 'Notes'}
          {hasNotes && !notes && <span className="legend__dot" aria-hidden="true" />}
          <Icon name={notes ? 'chevronUp' : 'chevronDown'} size={12} />
        </button>
      </div>
      {!compact && (
        <p className="legend__unit">
          {unitLabel(metric.unit)}
          {periods.length > 0 && (
            <>
              {' · '}
              {periods.map((p, i) => (
                <span key={p.period}>
                  {i > 0 && ', '}
                  {formatPeriod(p.period, metric.periodType)}
                  {periods.length > 1 && <span className="legend__count"> ({p.count})</span>}
                </span>
              ))}
            </>
          )}
        </p>
      )}
      {layer?.calculation && (
        <p className="legend__calc">
          <Badge variant="estimate">Calculation</Badge>
          {!compact && <span>{layer.calculation.replace(/^Calculation · /, '')}</span>}
        </p>
      )}

      {pending ? (
        <p className="legend__pending">Loading values…</p>
      ) : scale ? (
        <div className="legend__scale" role="img" aria-label={legendSummary(metric, scale, compactNum)}>
          <div className="legend__swatches">
            {scale.colors.map((c, i) => (
              <span key={i} className="legend__swatch" style={{ background: c }} />
            ))}
          </div>
          <div className="legend__ticks num" aria-hidden="true">
            {scale.thresholds.map((t, i) => (
              <span key={t} style={{ left: `${((i + 1) / n) * 100}%` }}>
                {formatTick(t, metric.unit, metric.decimals, compactNum)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="legend__pending">No comparable values for this layer.</p>
      )}

      <p className="legend__summary">
        <span className="legend__missing" aria-hidden="true" />
        <span>
          {MISSING_LABEL}
          {layer && <span className="legend__count"> ({missing})</span>}
        </span>
        <span className="legend__fixed">Scale fixed across all {layer ? plural(layer.counts.total, 'place') : 'places'}</span>
      </p>

      {notes && (
        <ul className="legend__notes">
          {compact && (
            <li>
              {unitLabel(metric.unit)}
              {periods.length > 0 && ` · ${periods.map((p) => formatPeriod(p.period, metric.periodType)).join(', ')}`}
            </li>
          )}
          {scale && <li>{scaleReading(metric, scale)}.</li>}
          {layer && layer.counts.otherPeriod > 0 && (
            <li>
              {plural(layer.counts.otherPeriod, 'place')} {layer.counts.otherPeriod === 1 ? 'reports' : 'report'} an older period — coloured, not ranked.
            </li>
          )}
          <li className="legend__size-note">
            <span className="legend__size" aria-hidden="true">
              <i />
              <i />
            </span>
            <span>Marker area shows population (small places keep a minimum size). Crowded markers are nudged apart, with a leader line to the true spot.</span>
          </li>
          {layer?.calculation && compact && <li>{layer.calculation}</li>}
          {layer?.caveat && <li className="legend__caveat">{layer.caveat}</li>}
          {metric.comparabilityNote && <li className="legend__caveat">{metric.comparabilityNote}</li>}
        </ul>
      )}
      {(!compact || notes) && <SourceNote sourceId={layer?.sourceIds ?? metric.sourceIds} period={layer?.primaryPeriod} periodType={metric.periodType} />}
    </section>
  );
}

function legendSummary(metric: MetricDef, scale: ClassScale, compact: boolean): string {
  const f = (v: number) => formatTick(v, metric.unit, metric.decimals, compact);
  const parts = scale.bins.map((b) => (b.lo === null ? `below ${f(b.hi!)}` : b.hi === null ? `${f(b.lo)} and above` : `${f(b.lo)} to ${f(b.hi)}`));
  return `${scale.colors.length} colour classes: ${parts.join('; ')}.`;
}
