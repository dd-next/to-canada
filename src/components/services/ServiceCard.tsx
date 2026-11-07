import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { ButtonAnchor } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { formatDate } from '../../lib/format';
import type { ServiceEntry } from '../../types/services';
import { COVERAGE_LABELS, safeServiceUrl, serviceHref, serviceTimestamp } from './filter';

export default function ServiceCard({ entry, detail = false }: { entry: ServiceEntry; detail?: boolean }) {
  const url = safeServiceUrl(entry.url);
  const sourceUrl = safeServiceUrl(entry.source.url);
  return (
    <article className={`service-card${detail ? ' service-card--detail' : ''}`} aria-labelledby={`service-${entry.id}`}>
      <div className="service-card__labels"><Badge variant="neutral">{entry.category}</Badge><span>{COVERAGE_LABELS[entry.coverage.kind] ?? entry.coverage.kind}</span></div>
      <h2 id={`service-${entry.id}`} className="service-card__name">{detail ? entry.name : <Link to={serviceHref(entry.id)}>{entry.name}</Link>}</h2>
      {entry.state === 'retired' && <p className="services__notice"><strong>No longer in the source catalogue.</strong> Retained for reference{entry.retiredAt ? ` since ${formatDate(entry.retiredAt)}` : ''}. This does not establish whether the service has closed.</p>}
      <p className="service-card__description">{entry.description}</p>
      <p className="service-card__where"><span className="label">Source coverage</span> {entry.coverage.label}</p>
      {entry.tags.length > 0 && <ul className="service-card__tags" aria-label="Source tags">{(detail ? entry.tags : entry.tags.slice(0, 5)).map((tag, index) => <li key={`${tag}-${index}`}>{tag}</li>)}{!detail && entry.tags.length > 5 && <li>+{entry.tags.length - 5} more</li>}</ul>}
      <footer className="service-card__footer">
        {url ? <ButtonAnchor href={url} size="sm" aria-label={`Visit ${entry.name} (opens in a new tab)`}>Visit service</ButtonAnchor> : <span>Destination unavailable</span>}
        {!detail && <Link to={serviceHref(entry.id)} className="link service-card__details">Details & source</Link>}
        <span className="service-card__destination">{entry.url}</span>
      </footer>
      {detail && <Disclosure summary="Catalogue record and source" defaultOpen>
        <dl className="services__facts">
          <div><dt>Original category</dt><dd>{entry.category}</dd></div>
          <div><dt>Original jurisdiction</dt><dd>{entry.jurisdiction}</dd></div>
          <div><dt>Original level</dt><dd>{entry.level}</dd></div>
          {entry.type && <div><dt>Source type</dt><dd>{entry.type}</dd></div>}
          {entry.kind && <div><dt>Source kind</dt><dd>{entry.kind}</dd></div>}
          {entry.dateAdded && <div><dt>Added by Awesome Canada</dt><dd>{formatDate(entry.dateAdded)}</dd></div>}
          <div><dt>First imported here</dt><dd>{serviceTimestamp(entry.firstSeenAt)}</dd></div>
          <div><dt>Record last changed here</dt><dd>{serviceTimestamp(entry.contentChangedAt)}</dd></div>
          <div><dt>Source record</dt><dd>{sourceUrl ? <a href={sourceUrl} className="link" target="_blank" rel="noopener noreferrer">Awesome Canada catalogue</a> : 'Awesome Canada catalogue'} · version <code>{entry.source.commit.slice(0, 12)}</code></dd></div>
        </dl>
        <p className="services__fine">Coverage follows the source’s classification; a municipality is not its metropolitan area. Listing and import dates do not verify current eligibility, costs, languages or availability.</p>
      </Disclosure>}
    </article>
  );
}
