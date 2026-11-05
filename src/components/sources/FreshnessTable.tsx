import type { FreshnessEntry } from '../../types/contract';
import { formatDate, formatPeriod, formatPopulationPeriod } from '../../lib/format';

/** One row per data family: newest period in the snapshot, the publisher's release date and when we retrieved it. */
export function FreshnessTable({ entries }: { entries: FreshnessEntry[] }) {
  return (
    <div className="fresh" role="table" aria-label="Data freshness by family">
      <div className="fresh__row fresh__row--head" role="row">
        <span role="columnheader">Data</span>
        <span role="columnheader">Latest period</span>
        <span role="columnheader">Released</span>
        <span role="columnheader">Retrieved</span>
      </div>
      {entries.map((f) => (
        <div className="fresh__row" role="row" key={f.id}>
          <span className="fresh__label" role="cell">
            <a href={`#${f.sourceId}`} className="link">
              {f.label}
            </a>
          </span>
          <span className="fresh__period num" role="cell" data-label="Latest period">
            {/^\d{4}-\d{2}-\d{2}$/.test(f.latestPeriod) ? formatPopulationPeriod(f.latestPeriod) : formatPeriod(f.latestPeriod, f.periodType)}
          </span>
          <span role="cell" data-label="Released">
            {f.releaseDate ? formatDate(f.releaseDate) : 'n/a (fixed reference)'}
          </span>
          <span role="cell" data-label="Retrieved">
            {formatDate(f.retrievedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
