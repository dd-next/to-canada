import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useJSON } from '../data/useJSON';
import { Badge } from '../components/ui/Badge';
import { Button, ButtonAnchor } from '../components/ui/Button';
import { Disclosure } from '../components/ui/Disclosure';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Select } from '../components/ui/Select';
import { formatDate, formatNumber, plural } from '../lib/format';
import { normalize } from '../lib/places';
import { useUrlState } from '../lib/state';
import type { ProgramRecord } from '../types/contract';
import type { IRCCUpdate, IRCCUpdatesFeed, IRCCUpdateSource, IRCCUpdateType } from '../types/updates';
import '../styles/updates.css';

const TYPES: Record<IRCCUpdateType, string> = {
  news: 'News',
  program_delivery: 'Program delivery update',
  express_entry: 'Express Entry draw',
};
const PAGE_SIZE = 30;
const PUBLICATION_TYPES: Record<string, string> = {
  'backgrounders': 'Backgrounder', 'news releases': 'News release',
  'statements': 'Statement', 'media advisories': 'Media advisory', 'speeches': 'Speech',
};
const STALE_AFTER = 24 * 60 * 60 * 1000;

function checkedAt(iso: string | null) {
  if (!iso) return 'No successful check recorded';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Check time unavailable';
  return `${new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`;
}

function isStale(source: IRCCUpdateSource) {
  const successful = source.lastSuccessfulCheckAt ? Date.parse(source.lastSuccessfulCheckAt) : NaN;
  return source.status === 'failed' || !Number.isFinite(successful) || Date.now() - successful > STALE_AFTER;
}

function UpdateCard({ item, programs, source }: { item: IRCCUpdate; programs: Map<string, ProgramRecord>; source?: IRCCUpdateSource }) {
  const related = item.programIds.map((id) => programs.get(id)).filter((p): p is ProgramRecord => !!p);
  return (
    <article className="update" aria-labelledby={`update-${item.id}`}>
      <div className="update__date">
        <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
        <span className="update__date-label">Published</span>
      </div>
      <div className="update__body">
        <div className="update__badges">
          <Badge variant="neutral">{TYPES[item.type]}</Badge>
          {item.publicationType && <Badge variant="neutral">{PUBLICATION_TYPES[item.publicationType] ?? item.publicationType}</Badge>}
          {item.topics.map((topic) => <span className="update__topic" key={topic}>{topic}</span>)}
        </div>
        <h2 id={`update-${item.id}`} className="update__title">
          <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
        </h2>
        {item.description && <p className="update__description">{item.description}</p>}
        {(item.effectiveDate || item.audience || item.updatedAt) && (
          <dl className="update__context">
            {item.effectiveDate && <div><dt>Effective</dt><dd><time dateTime={item.effectiveDate}>{formatDate(item.effectiveDate)}</time></dd></div>}
            {item.audience && <div><dt>Applies to</dt><dd>{item.audience}</dd></div>}
            {item.updatedAt && item.updatedAt !== item.publishedAt && <div><dt>Publication updated</dt><dd><time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></dd></div>}
          </dl>
        )}
        {item.draw && (
          <div className="update__draw">
            <p className="update__draw-kind">Round {item.draw.round} · {item.draw.category} · {formatDate(item.draw.date)}</p>
            <dl>
              <div><dt className="label">Invitations</dt><dd className="num">{formatNumber(item.draw.invitations)}</dd></div>
              <div><dt className="label">CRS cutoff</dt><dd className="num">{formatNumber(item.draw.crsCutoff)}</dd></div>
            </dl>
            {item.draw.tieBreaking && <p className="update__tie">Tie-breaking rule: {item.draw.tieBreaking}</p>}
          </div>
        )}
        {related.length > 0 && (
          <p className="update__programs">
            <span>Program reference: </span>
            {related.map((program, index) => (
              <span key={program.id}>{index > 0 && ' · '}<Link className="link" to={`/immigration/programs?program=${encodeURIComponent(program.id)}`}>{program.shortName ?? program.name}</Link></span>
            ))}
          </p>
        )}
        <footer className="update__footer">
          <ButtonAnchor href={item.url} variant="outline" size="sm" aria-label={`Read the official publication: ${item.title}`}>Official publication</ButtonAnchor>
          <span>{source?.label ?? 'Immigration, Refugees and Citizenship Canada'}</span>
        </footer>
      </div>
    </article>
  );
}

export default function UpdatesPage() {
  const feed = useJSON<IRCCUpdatesFeed>('updates.json');
  const programs = useJSON<ProgramRecord[]>('programs.json');
  const [params, update] = useUrlState();
  const query = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const topic = params.get('topic') ?? '';
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [query, type, topic]);
  const programById = useMemo(() => new Map((programs.data ?? []).map((p) => [p.id, p])), [programs.data]);
  const sourceById = useMemo(() => new Map((feed.data?.sources ?? []).map((s) => [s.id, s])), [feed.data]);
  const topics = useMemo(() => [...new Set((feed.data?.entries ?? []).flatMap((item) => item.topics))].sort(), [feed.data]);
  const filtered = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean);
    return (feed.data?.entries ?? []).filter((item) => {
      if (type && item.type !== type) return false;
      if (topic && !item.topics.includes(topic)) return false;
      const text = normalize([item.title, item.description, item.publicationType, item.audience, ...item.topics, item.draw?.round, item.draw?.category].filter(Boolean).join(' '));
      return words.every((word) => text.includes(word));
    }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  }, [feed.data, query, type, topic]);
  const staleSources = (feed.data?.sources ?? []).filter(isStale);
  const filtering = !!(query || type || topic);
  const clear = () => update({ q: null, type: null, topic: null });

  return (
    <div className="page updates">
      <SectionHeader level={1} kicker="Official publications" title="IRCC Updates" dek="News, program delivery changes and Express Entry rounds, with direct links to the official record." />
      <p className="updates__intro">Reference information, not an eligibility assessment. Check the official publication for current requirements. Draw categories and programs have different selection rules; their cutoffs are shown separately.</p>

      {feed.data && (
        <section className="updates__sources" aria-label="Source coverage and update status">
          {staleSources.length > 0 && <p className="updates__stale" role="status"><strong>Some sources are not up to date.</strong> Existing publications remain available. Check source coverage below and confirm recent changes on the official pages.</p>}
          <Disclosure summary="Sources, coverage and last successful checks" defaultOpen={staleSources.length > 0}>
            <p className="updates__coverage-note">Checks are scheduled every six hours. The dates below describe the publications captured from each source; they do not imply a complete archive.</p>
            <ul className="updates__source-list">
              {feed.data.sources.map((source) => (
                <li key={source.id}>
                  <div className="updates__source-heading"><a href={source.url} target="_blank" rel="noopener noreferrer" className="link">{source.label}</a><Badge variant={isStale(source) ? 'caution' : 'neutral'} title={isStale(source) ? 'Check failed or the last successful check is more than 24 hours old' : 'The source was successfully checked within the past 24 hours'}>{source.status === 'failed' ? 'Check failed' : isStale(source) ? 'Check overdue' : 'Checked'}</Badge></div>
                  <p>{plural(source.count, 'publication')} · {source.coverageStart && source.coverageEnd ? `${formatDate(source.coverageStart)} – ${formatDate(source.coverageEnd)}` : 'Coverage not yet established'}</p>
                  <p>Last successful check: {checkedAt(source.lastSuccessfulCheckAt)}</p>
                  {source.status === 'failed' && <p>Latest attempt: {checkedAt(source.lastCheckedAt)}. The official source could not be checked; retained entries may be out of date.</p>}
                </li>
              ))}
            </ul>
          </Disclosure>
        </section>
      )}

      <section className="updates__filters" aria-label="Filter IRCC updates">
        <div className="field updates__search">
          <label className="field__label label" htmlFor="updates-search">Search updates</label>
          <div className="updates__searchbox"><Icon name="search" size={16} /><input id="updates-search" type="search" value={query} placeholder="Title, topic, audience or draw number…" onChange={(event) => update({ q: event.target.value || null }, { replace: true })} /></div>
        </div>
        <Select label="Type" value={type} onChange={(value) => update({ type: value || null })} options={[{ value: '', label: 'All types' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))]} />
        <Select label="Topic" value={topic} onChange={(value) => update({ topic: value || null })} options={[{ value: '', label: 'All topics' }, ...topics.map((value) => ({ value, label: value }))]} />
      </section>

      {feed.loading && <p className="app-status" role="status">Loading official IRCC updates…</p>}
      {feed.error && <EmptyState title="IRCC updates could not be loaded">Please try again later. You can still <a href="https://www.canada.ca/en/immigration-refugees-citizenship/news.html" className="link" target="_blank" rel="noopener noreferrer">read the official IRCC news</a>.</EmptyState>}
      {feed.data && (
        <>
          <div className="updates__count" role="status"><span>{plural(filtered.length, 'publication')}{filtering ? ' match your filters' : ''} · Newest first</span>{filtering && <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}</div>
          {filtered.length === 0 && <EmptyState title={feed.data.entries.length === 0 ? 'No publications available in this snapshot' : 'No updates match your filters'} action={filtering ? <Button onClick={clear}>Clear filters</Button> : undefined}>{feed.data.entries.length === 0 ? 'Check the official source pages above for their latest publications.' : 'Try another topic, type or search phrase.'}</EmptyState>}
          <div className="updates__list">{filtered.slice(0, limit).map((item) => <UpdateCard item={item} programs={programById} source={sourceById.get(item.sourceId)} key={item.id} />)}</div>
          {filtered.length > limit && <div className="updates__more"><Button onClick={() => setLimit((count) => count + PAGE_SIZE)}>Show more publications</Button><p>Showing {formatNumber(limit)} of {formatNumber(filtered.length)}</p></div>}
        </>
      )}
    </div>
  );
}
