import type { ReactNode } from 'react';
import type { Flag, MetricDef, Unit } from '../../types/contract';
import { formatPeriod, qualityNotes, splitValue } from '../../lib/format';
import { ProvenanceBadges } from './Badge';
import { MissingValue } from './EmptyState';
import { SourceNote } from './SourceNote';

export interface StatProps {
  label: ReactNode;
  value: number | null | undefined;
  unit: Unit;
  decimals?: number;
  period?: string | null;
  periodType?: MetricDef['periodType'];
  /** Geography qualifier, e.g. "Economic region: Toronto". */
  qualifier?: string | null;
  flags?: Flag[];
  note?: string;
  /** Explicit missing reason (overrides flags). */
  missingReason?: string | null;
  sourceId?: string | string[] | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Compact notation for large numbers ("1.2M"). */
  compact?: boolean;
  /** Show provenance badges (regional / caution / missing). Default true. */
  badges?: boolean;
  /** Extra line under the meta (e.g. rank). */
  children?: ReactNode;
  className?: string;
}

/** Big number + unit + label + period/qualifier + provenance + source. Missing renders an explanation, never 0. */
export function Stat({
  label,
  value,
  unit,
  decimals,
  period,
  periodType,
  qualifier,
  flags,
  note,
  missingReason,
  sourceId,
  size = 'md',
  compact,
  badges = true,
  children,
  className,
}: StatProps) {
  const missing = value === null || value === undefined || !Number.isFinite(value);
  const { number, suffix } = splitValue(value ?? null, unit, decimals, { compact });
  const cautions = qualityNotes(flags).filter((n) => !n.startsWith('Published as an annual'));
  return (
    <div className={['stat', `stat--${size}`, missing && 'stat--missing', className].filter(Boolean).join(' ')}>
      <div className="stat__label label">{label}</div>
      {missing ? (
        <MissingValue flags={flags} note={note} reason={missingReason} compact={size === 'sm'} />
      ) : (
        <div className="stat__value num">
          <span className="stat__number">{number}</span>
          {suffix && <span className="stat__unit">{suffix}</span>}
        </div>
      )}
      {(period || qualifier) && (
        <p className="stat__meta">
          {period && <span className="stat__period">{formatPeriod(period, periodType)}</span>}
          {period && qualifier && ' · '}
          {qualifier && <span className="stat__qualifier">{qualifier}</span>}
        </p>
      )}
      {badges && !missing && <ProvenanceBadges obs={{ value: value ?? null, flags }} />}
      {!missing && cautions.length > 0 && <p className="stat__caution">{cautions.join(' · ')}</p>}
      {children && <div className="stat__extra">{children}</div>}
      {sourceId && <SourceNote sourceId={sourceId} period={period} periodType={periodType} />}
    </div>
  );
}
