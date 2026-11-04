import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import { InsightCard } from '../components/insights/InsightCard';
import { INDEX_PATH, TOPIC_GROUPS, orderInsights, type InsightSummary } from '../components/insights/model';
import { useScrollReset } from '../components/insights/scroll';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Kicker } from '../components/ui/SectionHeader';
import { formatDate, plural } from '../lib/format';
import '../styles/insights.css';

export default function InsightsPage() {
  const core = useCore();
  const index = useJSON<InsightSummary[]>(INDEX_PATH);
  const items = useMemo(() => orderInsights(index.data ?? []), [index.data]);
  const groups = useMemo(
    () =>
      TOPIC_GROUPS.map((g) => ({ ...g, items: items.filter((i) => g.topics.includes(i.topic)) }))
        .concat([{ id: 'other', label: 'More', dek: '', topics: [], items: items.filter((i) => !TOPIC_GROUPS.some((g) => g.topics.includes(i.topic))) }])
        .filter((g) => g.items.length),
    [items],
  );
  const places = new Set(items.flatMap((i) => i.relatedPlaceIds));
  const sources = new Set(items.flatMap((i) => i.sourceIds));
  const numberOf = (id: string) => items.findIndex((i) => i.id === id);
  useScrollReset('insights');

  return (
    <>
    <div className="page ins-index">
      <header className="ins-hero">
        <div className="ins-hero__text">
          <Kicker>Insights</Kicker>
          <h1 className="display ins-hero__title">The questions people ask before a move, answered from the public record.</h1>
          <p className="dek">
            Rent for a first lease, pay in your line of work, how long savings last, where new permanent residents settle. Every figure is computed from
            official tables, and every assumption, gap and caveat is left in view.
          </p>
        </div>
        {items.length > 0 && (
          <nav className="ins-hero__toc" aria-label="Questions in this section">
            <p className="label">In this section</p>
            <ol>
              {items.map((i, n) => (
                <li key={i.id}>
                  <Link to={`/insights/${i.id}`}>
                    <span className="ins-hero__tocnum mono">{String(n + 1).padStart(2, '0')}</span>
                    <span>{i.question}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </header>

      {index.loading && !index.data && (
        <p className="app-status" role="status">
          Loading insights…
        </p>
      )}
      {index.error && (
        <EmptyState title="The insights could not be loaded" action={<ButtonLink to="/">Back to the map</ButtonLink>}>
          {index.error.message}. The rest of the site still works from the same data snapshot.
        </EmptyState>
      )}
      {index.data && items.length === 0 && (
        <EmptyState title="No insights in this snapshot yet">Insights are computed when the data is built. The explorer and place profiles still work.</EmptyState>
      )}

      {items.length > 0 && (
        <ul className="ins-index__facts" aria-label="This section">
          <li>
            <span className="label">Explorations</span>
            <span className="ins-index__fact num">{items.length}</span>
          </li>
          <li>
            <span className="label">Places discussed</span>
            <span className="ins-index__fact num">{places.size}</span>
          </li>
          <li>
            <span className="label">Official sources</span>
            <span className="ins-index__fact num">{sources.size}</span>
          </li>
          <li>
            <span className="label">Computed from the snapshot of</span>
            <span className="ins-index__fact ins-index__fact--date">{formatDate(core.manifest.builtAt)}</span>
          </li>
        </ul>
      )}

      {groups.map((g, gi) => (
        <section key={g.id} className="ins-group" aria-labelledby={`ins-g-${g.id}`}>
          <header className="ins-group__head">
            <p className="ins-group__num mono" aria-hidden="true">
              {String.fromCharCode(65 + gi)}
            </p>
            <h2 id={`ins-g-${g.id}`} className="h2">
              {g.label}
            </h2>
            {g.dek && <p className="ins-group__dek">{g.dek}</p>}
            <p className="ins-group__count label">{plural(g.items.length, 'piece')}</p>
          </header>
          <ul className="ins-grid">
            {g.items.map((i, k) => {
              const featured = numberOf(i.id) === 0;
              const before = g.items.slice(0, k).filter((x) => numberOf(x.id) !== 0).length;
              const rest = g.items.filter((x) => numberOf(x.id) !== 0).length;
              const alone = !featured && rest % 2 === 1 && before === rest - 1;
              return (
                <li key={i.id} className={featured || alone ? 'ins-grid__full' : undefined}>
                  <InsightCard insight={i} index={numberOf(i.id)} layout={featured ? 'featured' : alone ? 'wide' : 'normal'} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

    </div>
      {items.length > 0 && (
        <section className="ins-how dark-band" aria-labelledby="ins-how-h">
          <div className="ins-how__inner">
            <Kicker>How these are made</Kicker>
            <h2 id="ins-how-h" className="h2">
              Computed, not written from memory.
            </h2>
            <ol className="ins-how__grid">
              <li>
                <p className="ins-how__title">Observation or calculation</p>
                <p className="ins-how__body">Each finding says whether it is read straight from a table or derived from one — and calculations show their working.</p>
              </li>
              <li>
                <p className="ins-how__title">Comparable values only</p>
                <p className="ins-how__body">Rankings use one measure, one period and one method. Places a source does not cover are named, not quietly dropped.</p>
              </li>
              <li>
                <p className="ins-how__title">Context, not advice</p>
                <p className="ins-how__body">These describe the recent past. They are not forecasts, not offers of work and not immigration advice.</p>
              </li>
            </ol>
            <p className="ins-how__cta">
              <ButtonLink to="/sources" variant="outline" iconRight="arrowRight">
                Sources & methods
              </ButtonLink>
            </p>
          </div>
        </section>
      )}
    </>
  );
}
