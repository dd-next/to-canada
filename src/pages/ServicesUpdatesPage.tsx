import { Link } from 'react-router-dom';
import { useJSON } from '../data/useJSON';
import { useUrlState } from '../lib/state';
import { formatNumber } from '../lib/format';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Button, ButtonLink } from '../components/ui/Button';
import { Disclosure } from '../components/ui/Disclosure';
import { EmptyState } from '../components/ui/EmptyState';
import { Select } from '../components/ui/Select';
import { boundedPage, safeServiceUrl, serviceHref, serviceTimestamp } from '../components/services/filter';
import type { ServiceChangeKind, ServicesHistory } from '../types/services';
import '../styles/services.css';

const CHANGE_LABEL: Record<ServiceChangeKind, string> = { added: 'Added', edited: 'Edited', retired: 'Retired', restored: 'Restored' };
const RUN_LABEL = { updated: 'Content updated', no_changes: 'No content changes', failed: 'Check failed' };
const PAGE_SIZE = 30;
const displayValue = (value: unknown) => value == null ? 'Not supplied' : typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : JSON.stringify(value);
function ChangeCounts({ counts }: { counts: Record<ServiceChangeKind, number> }) {
  return <span>{(Object.keys(CHANGE_LABEL) as ServiceChangeKind[]).filter((key) => counts[key]).map((key) => `${formatNumber(counts[key])} ${key}`).join(' · ') || 'No content changes'}</span>;
}

export default function ServicesUpdatesPage() {
  const feed = useJSON<ServicesHistory>('services/history.json');
  const [params, update] = useUrlState();
  const eventId = params.get('event') ?? '';
  const changeType = params.get('change') ?? '';
  const events = [...(feed.data?.events ?? [])].sort((left, right) => right.at.localeCompare(left.at));
  const runs = [...(feed.data?.runs ?? [])].sort((left, right) => right.at.localeCompare(left.at));
  const selected = events.find((event) => event.id === eventId);
  const changes = (selected?.changes ?? []).filter((change) => !changeType || change.type === changeType);
  const page = boundedPage(params.get('historyPage'), changes.length, PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(changes.length / PAGE_SIZE));
  return <div className="page services services--log">
    <SectionHeader level={1} kicker="Services" title="Update log" dek="What changed in our copy of the Awesome Canada catalogue, starting with our first import." />
    <p className="services__intro">Daily checks compare complete source snapshots. An unchanged check does not create a content event. Removal means the entry left the catalogue; it does not establish that the service closed.</p>
    {feed.loading && <p className="app-status" role="status">Loading catalogue history…</p>}
    {feed.error && <EmptyState title="The update log could not be loaded"><p>Please reload or try again later. <Link to="/services" className="link">Return to the directory</Link>.</p></EmptyState>}
    {feed.data && <>
      <section className="services__checks" aria-label="Source check history">
        <Disclosure summary={`Source checks (${formatNumber(runs.length)}) — ${runs[0] ? RUN_LABEL[runs[0].status] ?? runs[0].status : 'none recorded'}`} defaultOpen={runs[0]?.status === 'failed'}>
          <p className="services__fine">These are source catalogue checks, not independent checks of every linked website. A failed check retains the last valid catalogue.</p>
          <ol className="services__run-list">{runs.map((run) => <li key={run.id}>
            <div><strong>{RUN_LABEL[run.status] ?? run.status}</strong> · <time dateTime={run.at}>{serviceTimestamp(run.at)}</time>{run.runUrl && safeServiceUrl(run.runUrl) && <> · <a className="link" href={safeServiceUrl(run.runUrl)!} target="_blank" rel="noopener noreferrer">Run details</a></>}</div>
            {run.sourceCommit && <p className="services__fine">Source version <a className="link" href={`https://github.com/wra-sol/awesome-canada/commit/${encodeURIComponent(run.sourceCommit)}`} target="_blank" rel="noopener noreferrer">{run.sourceCommit.slice(0, 12)}</a></p>}
            {run.error && <p className="services__notice">{run.error}</p>}
          </li>)}</ol>
        </Disclosure>
      </section>
      {eventId ? <section className="services__event-detail" aria-label="Selected catalogue update">
        <ButtonLink to="/services/updates" variant="ghost" size="sm">← All updates</ButtonLink>
        {!selected ? <EmptyState title="This update was not found"><p>Choose an update from the full log.</p></EmptyState> : <>
          <h2 className="h2">{selected.type === 'initial_import' ? 'Initial catalogue import' : 'Catalogue changed'}</h2>
          <p><time dateTime={selected.at}>{serviceTimestamp(selected.at)}</time> · <ChangeCounts counts={selected.counts} /></p>
          {selected.type === 'initial_import' && <p className="services__fine">These entries were first imported into Northward together. Their original upstream addition dates may be earlier; no earlier Northward changes are implied.</p>}
          <p className="services__fine">Compared source: <a className="link" href={`https://github.com/wra-sol/awesome-canada/commit/${encodeURIComponent(selected.sourceCommit)}`} target="_blank" rel="noopener noreferrer">{selected.sourceCommit.slice(0, 12)}</a></p>
          {selected.runUrl && safeServiceUrl(selected.runUrl) && <p className="services__fine"><a className="link" href={safeServiceUrl(selected.runUrl)!} target="_blank" rel="noopener noreferrer">Operational run details</a></p>}
          <div className="services__change-filter"><Select label="Change type" value={changeType} onChange={(value) => update({ change: value || null, historyPage: null })} options={[{ value: '', label: 'All changes' }, ...Object.entries(CHANGE_LABEL).map(([value, label]) => ({ value, label }))]} /><p role="status">{formatNumber(changes.length)} affected {changes.length === 1 ? 'entry' : 'entries'}</p></div>
          {changes.length === 0 && <EmptyState title="No entries with this change type" action={<Button onClick={() => update({ change: null, historyPage: null })}>Show all changes</Button>} />}
          <ul className="services__changes">{changes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((change) => <li key={`${change.id}-${change.type}`}><span className="services__change-type">{CHANGE_LABEL[change.type]}</span><div><Link className="link" to={serviceHref(change.id)}>{change.name}</Link>{change.fields.length > 0 && change.before && change.after && <Disclosure summary={`Changed fields: ${change.fields.join(', ')}`}><dl className="services__change-values">{change.fields.map((field) => <div key={field}><dt>{field}</dt><dd><span>Before</span><p>{displayValue(change.before?.[field])}</p><span>After</span><p>{displayValue(change.after?.[field])}</p></dd></div>)}</dl></Disclosure>}</div></li>)}</ul>
          {pageCount > 1 && <nav className="services__pagination" aria-label="Changed entry pages"><Button disabled={page === 1} onClick={() => update({ historyPage: page - 1 })}>Previous</Button><p>Page {page} of {pageCount}</p><Button disabled={page === pageCount} onClick={() => update({ historyPage: page + 1 })}>Next</Button></nav>}
        </>}
      </section> : <section aria-label="Catalogue content events" className="services__events">
        {events.length === 0 && <EmptyState title="No successful import recorded"><p>The directory will show the first complete, validated import when available.</p></EmptyState>}
        {events.map((event) => <article className="services__event" key={event.id}><time dateTime={event.at}>{serviceTimestamp(event.at)}</time><div><h2 className="h3"><Link to={`/services/updates?event=${encodeURIComponent(event.id)}`}>{event.type === 'initial_import' ? 'Initial catalogue import' : 'Catalogue changed'}</Link></h2><p><ChangeCounts counts={event.counts} /></p><Link className="link" to={`/services/updates?event=${encodeURIComponent(event.id)}`}>See affected entries →</Link></div></article>)}
      </section>}
    </>}
  </div>;
}
