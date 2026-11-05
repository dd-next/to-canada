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
            {f.releaseDate ? formatDate(f.releaseDate) : 'Not published / unknown'}
          </span>
          <span role="cell" data-label="Retrieved">
            {formatDate(f.retrievedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Check times describe publisher probes, never the age of the values themselves. */
export function SourceChecks({ entries, refresh }: { entries: import('../../types/contract').SourceCheck[]; refresh?: import('../../types/contract').RefreshStatus }) {
  const labels = { current: 'No newer release found', newer_available: 'New release available', static: 'Fixed reference vintage', unknown: 'Could not check source', manual_update_required: 'Manual review required' };
  const issues = entries.filter((entry) => !['current', 'static'].includes(entry.status));
  return (
    <div className="source-checks">
      <h3 className="h3">Publisher checks and update issues</h3>
      <p>Checked dates describe attempts to contact publishers. They do not change the observation period or the original retrieval date.</p>
      {refresh?.status === 'error' && <p role="status">The update attempted on {formatDate(refresh.finishedAt)} failed. The previous validated snapshot is retained. {refresh.errors.map((error) => error.step).join(', ')}</p>}
      {refresh?.lastSuccessfulUpdateAt && <p>Last successful snapshot update: {formatDate(refresh.lastSuccessfulUpdateAt)}. {refresh.status === 'no_changes' ? 'No statistical changes were found.' : ''}</p>}
      {refresh?.freshnessCheckFailed && <p role="status">Some publishers could not be checked. The snapshot update does not establish that every source is current.</p>}
      <details open={issues.some((entry) => entry.status === 'unknown' || entry.status === 'newer_available')}>
        <summary>{issues.length} sources need attention · {entries.length} source checks</summary>
        <ul className="source-checks__list">
          {[...entries].sort((a, b) => Number(['current', 'static'].includes(a.status)) - Number(['current', 'static'].includes(b.status))).map((entry) => (
            <li key={entry.sourceId}>
              <a href={`#${entry.sourceId}`} className="link">{entry.title || entry.sourceId}</a>
              <p><strong>{labels[entry.status]}</strong> · Last checked {entry.checkedAt ? formatDate(entry.checkedAt) : 'not recorded'}{entry.lastSuccessfulCheckAt ? ` · Last successful check ${formatDate(entry.lastSuccessfulCheckAt)}` : ''}</p>
              <p>{entry.note}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
