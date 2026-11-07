import type { LmiaMetadata } from '../../types/lmia';
import { Disclosure } from '../ui/Disclosure';
import { formatDate, formatNumber } from '../../lib/format';
import { publisherText, safeSourceUrl } from './model';

export function lmiaDate(value: string | null | undefined): string {
  return value && Number.isFinite(Date.parse(value)) ? formatDate(value) : 'Not recorded';
}

export default function LmiaSources({ metadata }: { metadata: LmiaMetadata }) {
  const coverage = metadata.coverage;
  const failed = metadata.resources.filter((resource) => !!resource.error);
  return (
    <section className="lmia__coverage" aria-label="Historical coverage and sources">
      {metadata.status === 'partial' && <p className="lmia__partial-label">Partial historical series</p>}
      <dl className="lmia__coverage-summary">
        <div><dt>Historical coverage</dt><dd>{coverage.start && coverage.end ? `${lmiaDate(coverage.start)} – ${lmiaDate(coverage.end)}` : 'Not yet established'}</dd></div>
        <div><dt>Reporting periods</dt><dd>{formatNumber(coverage.periodCount)}</dd></div>
        <div><dt>Published records</dt><dd>{formatNumber(coverage.rowCount)}</dd></div>
        <div><dt>Last successful check</dt><dd>{lmiaDate(metadata.lastSuccessfulCheckAt)}</dd></div>
      </dl>
      {metadata.status !== 'ok' && <p className="lmia__warning" role="status"><strong>{metadata.status === 'partial' ? 'The complete historical series has not been verified.' : 'The latest source check did not complete.'}</strong> {metadata.status === 'partial' ? 'The dates and counts shown describe only the available releases. ' : 'Available records remain browseable. '}{failed.length > 0 ? `${failed.length} resource${failed.length === 1 ? '' : 's'} could not be refreshed. ` : ''}Retained records may be out of date; inspect the coverage notes below.</p>}
      {metadata.catalogue?.status === 'cached' && <p className="lmia__source-note">The official catalogue could not be checked during the latest attempt. Processing continued from the catalogue verified on {lmiaDate(metadata.catalogue.lastSuccessfulCheckAt ?? metadata.catalogue.checkedAt)}. Newly published or revised releases may be missing.</p>}
      <Disclosure summary="Coverage, source releases and reuse terms" defaultOpen={coverage.rowCount === 0}>
        <p className="lmia__source-intro">Published by {metadata.dataset.publisher}. Available releases are selected to avoid counting language copies, alternate formats and overlapping reporting periods twice. Historical reporting layouts and occupation classifications vary.</p>
        <p className="lmia__source-links"><a className="link" href={safeSourceUrl(metadata.dataset.url)} target="_blank" rel="noopener noreferrer">Official dataset and releases</a><a className="link" href={safeSourceUrl(metadata.dataset.licence.url)} target="_blank" rel="noopener noreferrer">{metadata.dataset.licence.name}</a></p>
        <dl className="lmia__dates">
          <div><dt>Last attempt</dt><dd>{lmiaDate(metadata.lastAttemptAt)}</dd></div>
          <div><dt>Last content update</dt><dd>{lmiaDate(metadata.lastSuccessfulUpdateAt)}</dd></div>
          <div><dt>Snapshot prepared</dt><dd>{lmiaDate(metadata.generatedAt)}</dd></div>
        </dl>
        <p className="lmia__source-note">Metadata is checked weekly and can be refreshed manually. A successful check is not a new reporting period. The source dates below identify the files used; they do not establish current employer activity.</p>
        {metadata.runUrl && <p className="lmia__source-note"><a className="link" href={safeSourceUrl(metadata.runUrl)} target="_blank" rel="noopener noreferrer">Latest refresh run and operational details</a></p>}
        {metadata.catalogue?.discoverySource && <p className="lmia__source-note">Release URL discovery: <a className="link" href={safeSourceUrl(metadata.catalogue.discoverySource)} target="_blank" rel="noopener noreferrer">LMIA Watch’s resource list</a>. {metadata.catalogue.discoveryNote ?? 'Used only to locate official ESDC download links. Employer records come from the official files, and this list does not establish complete historical coverage.'}</p>}
        {coverage.notes.length > 0 && <ul className="lmia__notes">{coverage.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
        {metadata.error && <p className="lmia__source-error">Latest check: {metadata.error}</p>}
        {coverage.gaps.length > 0 && <details className="lmia__release-details"><summary>Coverage gaps and unavailable periods ({coverage.gaps.length})</summary><ul className="lmia__notes">{coverage.gaps.map((gap, index) => <li key={index}>{lmiaDate(gap.start)} – {lmiaDate(gap.end)}: {gap.reason}</li>)}</ul></details>}
        {metadata.resources.length > 0 && <details className="lmia__release-details"><summary>Release checks and source status ({metadata.resources.length})</summary><ul className="lmia__release-list">{metadata.resources.map((resource) => <li key={resource.id}>
          <a className="link" href={safeSourceUrl(resource.url)} target="_blank" rel="noopener noreferrer">{resource.name}</a>
          <p>{resource.period?.label ?? 'Reporting period unavailable'} · {resource.language} · {resource.format} · {formatNumber(resource.rows)} records · {resource.status.replaceAll('_', ' ')}</p>
          <p>Retrieved {lmiaDate(resource.retrievedAt)}{resource.revision ? ` · Publisher revision: ${resource.revision}` : ''}</p>
          {resource.error && <p className="lmia__source-error">{resource.error}</p>}
          {resource.notes.length > 0 && <ul>{resource.notes.map((note, index) => <li key={index}>{publisherText(note)}</li>)}</ul>}
          <details className="lmia__provenance"><summary>Resource identity</summary><p>Catalogue resource: <code>{resource.id}</code></p>{resource.sha256 && <p>SHA-256: <code>{resource.sha256}</code></p>}</details>
        </li>)}</ul></details>}
        {metadata.excludedResources.length > 0 && <details className="lmia__release-details"><summary>Alternative or excluded files ({metadata.excludedResources.length})</summary><ul className="lmia__release-list">{metadata.excludedResources.map((resource, index) => <li key={`${resource.id}-${index}`}><a className="link" href={safeSourceUrl(resource.url)} target="_blank" rel="noopener noreferrer">{resource.name}</a><p>{resource.reason}</p></li>)}</ul></details>}
        <p className="lmia__licence-note">Contains information licensed under the Open Government Licence – Canada. Northward is independent of the Government of Canada.</p>
      </Disclosure>
    </section>
  );
}
