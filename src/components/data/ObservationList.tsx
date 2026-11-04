import type { MetricDef, Observation } from '../../types/contract';
import { formatMetric, formatPeriod, geoQualifier, missingReason } from '../../lib/format';
import { ProvenanceBadges } from '../ui/Badge';
import { SourceNote } from '../ui/SourceNote';

export interface ObservationRowProps {
  metric: MetricDef;
  obs: Observation | null | undefined;
  /** Show the expandable SourceNote under the row (default true). */
  showSource?: boolean;
}

/** One labelled, traceable value: label · value · period · geography qualifier · badges · source. */
export function ObservationRow({ metric, obs, showSource = true }: ObservationRowProps) {
  const missing = !obs || obs.value === null;
  const qualifier = geoQualifier(obs);
  return (
    <li className={['obs-row', missing && 'is-missing'].filter(Boolean).join(' ')}>
      <div className="obs-row__head">
        <span className="obs-row__label">{metric.shortLabel}</span>
        <span className="obs-row__value num">{missing ? <span className="obs-row__na">No data</span> : formatMetric(obs!.value, metric)}</span>
      </div>
      <p className="obs-row__meta">
        {obs?.period && <span className="mono">{formatPeriod(obs.period, metric.periodType)}</span>}
        {qualifier && <span> · {qualifier}</span>}
        {missing && <span className="obs-row__why"> · {missingReason(obs?.flags, obs?.note)}</span>}
      </p>
      <ProvenanceBadges obs={obs ?? null} />
      {showSource && obs && <SourceNote sourceId={obs.sourceId} period={obs.period} periodType={metric.periodType} />}
    </li>
  );
}

/** A list of key observations (place drawer, profiles, compare columns). */
export function ObservationList({ items, showSource = true }: { items: { metric: MetricDef; obs: Observation | null | undefined }[]; showSource?: boolean }) {
  return (
    <ul className="obs-list">
      {items.map(({ metric, obs }) => (
        <ObservationRow key={metric.id} metric={metric} obs={obs} showSource={showSource} />
      ))}
    </ul>
  );
}
