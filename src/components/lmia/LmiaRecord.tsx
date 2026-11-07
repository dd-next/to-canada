import { Link } from 'react-router-dom';
import type { LmiaPeriod, LmiaResource, LmiaRow } from '../../types/lmia';
import { Badge } from '../ui/Badge';
import { formatNumber } from '../../lib/format';
import { employerHistoryHref, recordHref, safeSourceUrl } from './model';
import { lmiaDate } from './LmiaSources';

export default function LmiaRecord({ row, period, resource, inHistory }: { row: LmiaRow; period?: LmiaPeriod; resource?: LmiaResource; inHistory: boolean }) {
  return (
    <article className="lmia-record" aria-labelledby={`lmia-${row.id}`}>
      <div className="lmia-record__period"><span className="label">Reporting period</span><strong>{period?.label ?? row.periodId}</strong>{period && <span>{lmiaDate(period.start)} – {lmiaDate(period.end)}</span>}</div>
      <div className="lmia-record__body">
        <div className="lmia-record__badges"><Badge variant="regional" title="Geography as classified by the publisher">{row.provinceLabel || row.province || 'Province not reported'}</Badge>{row.stream && <Badge variant="neutral">{row.stream}</Badge>}</div>
        <h2 id={`lmia-${row.id}`} className="lmia-record__name">{row.employer}</h2>
        <p className="lmia-record__address">{row.address || 'Address not reported in this release'}</p>
        <p className="lmia-record__occupation"><strong>{row.occupationTitle || 'Occupation title not reported'}</strong><span>{row.occupationCode ? `NOC ${row.occupationCode}` : 'NOC code not reported'} · {row.nocVersion ? `Classification: ${row.nocVersion}` : 'NOC version not reported'}</span></p>
        {!row.stream && <p className="lmia-record__missing">Program stream not reported in this release.</p>}
        <div className="lmia-record__links">{!inHistory && <Link className="link" to={employerHistoryHref(row)}>History for this name and address</Link>}<Link className="link" to={recordHref(row)}>Link to record</Link></div>
        <details className="lmia-record__source"><summary>Original release and record details</summary><div>
          {resource ? <><a className="link" href={safeSourceUrl(resource.url)} target="_blank" rel="noopener noreferrer">{resource.name}</a><p>Retrieved {lmiaDate(resource.retrievedAt)}{resource.revision ? ` · Publisher revision: ${resource.revision}` : ''}</p><p>Resource: <code>{resource.id}</code></p>{resource.sha256 && <p>SHA-256: <code>{resource.sha256}</code></p>}{resource.error && <p className="lmia__source-error">This source could not be refreshed; this record is retained from the previous valid snapshot.</p>}</> : <p>Source resource: <code>{row.resourceId}</code></p>}
          <p>Publisher name: {row.employer}</p><p>Publisher address: {row.address || 'Not reported'}</p>{row.incorporation && <p>Publisher incorporation field: {row.incorporation}</p>}
          <p>Record: <code>{row.id}</code></p><p>Missing or suppressed counts are shown as unknown. Separate locations and differently spelled publisher names are not treated as one legal entity.</p>
        </div></details>
      </div>
      <dl className="lmia-record__counts"><div><dt>Approved LMIAs</dt><dd className="num">{row.approvedLmias === null ? 'Unknown' : formatNumber(row.approvedLmias)}</dd></div><div><dt>Approved positions</dt><dd className="num">{row.approvedPositions === null ? 'Unknown' : formatNumber(row.approvedPositions)}</dd></div></dl>
    </article>
  );
}
