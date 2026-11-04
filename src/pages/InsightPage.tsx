import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Insight } from '../types/contract';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import { ChartRenderer } from '../charts';
import { FindingItem, PlaceChips } from '../components/insights/FindingItem';
import { INDEX_PATH, TOPIC_LABELS, insightPath, orderInsights, type InsightSummary } from '../components/insights/model';
import { useScrollReset } from '../components/insights/scroll';
import { ButtonLink } from '../components/ui/Button';
import { Disclosure } from '../components/ui/Disclosure';
import { Icon } from '../components/ui/Icon';
import { Kicker } from '../components/ui/SectionHeader';
import { Select } from '../components/ui/Select';
import { SourceNote } from '../components/ui/SourceNote';
import { formatDate, plural } from '../lib/format';
import { parseIdList, useUrlState } from '../lib/state';
import '../styles/insights.css';

const SECTIONS = [
  { id: 'findings', label: 'Findings' },
  { id: 'charts', label: 'Charts' },
  { id: 'meaning', label: 'What it means' },
  { id: 'method', label: 'Method & limits' },
  { id: 'sources', label: 'Sources' },
];

export default function InsightPage() {
  const { insightId = '' } = useParams();
  const core = useCore();
  const index = useJSON<InsightSummary[]>(INDEX_PATH);
  const listed = index.data?.some((i) => i.id === insightId);
  const fileState = useJSON<Insight>(index.data && !listed ? null : insightPath(insightId));
  const insight = fileState.data && fileState.data.id === insightId ? fileState.data : null;
  const order = useMemo(() => orderInsights(index.data ?? []), [index.data]);
  const pos = order.findIndex((i) => i.id === insightId);
  const prev = pos > 0 ? order[pos - 1] : null;
  const next = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;

  const [params, update] = useUrlState();
  const highlightRaw = params.get('highlight');
  const chartPlaces = useMemo(() => {
    const ids = new Set<string>();
    for (const c of insight?.charts ?? [])
      for (const s of c.series) {
        if (s.placeId) ids.add(s.placeId);
        for (const p of s.points) if (p.placeId) ids.add(p.placeId);
      }
    return core.places.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [insight, core.places]);
  const highlight = useMemo(() => parseIdList(highlightRaw).filter((id) => core.placeById.has(id)).slice(0, 3), [highlightRaw, core.placeById]);
  useScrollReset(insightId, !!insight);

  const notFound = (index.data && !listed && !index.loading) || (fileState.error && !fileState.loading);
  if (notFound)
    return (
      <div className="page ins-article">
        <div className="ins-missing">
          <Kicker>Insights</Kicker>
          <h1 className="h1">We couldn’t find that insight.</h1>
          <p className="dek">
            There is no insight called <span className="mono">“{insightId}”</span> in this data snapshot
            {fileState.error && listed ? ` (the file could not be loaded: ${fileState.error.message})` : ''}. It may have been renamed, or the snapshot was rebuilt without it.
          </p>
          {order.length > 0 && (
            <ul className="ins-missing__list">
              {order.map((i) => (
                <li key={i.id}>
                  <Link to={`/insights/${i.id}`}>
                    <span className="label">{TOPIC_LABELS[i.topic]}</span>
                    <span>{i.question}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p>
            <ButtonLink to="/insights" variant="primary" icon="chevronLeft">
              All insights
            </ButtonLink>
          </p>
        </div>
      </div>
    );

  if (!insight)
    return (
      <div className="app-status" role="status">
        Loading insight…
      </div>
    );

  const meta = order[pos];
  const places = insight.relatedPlaceIds.filter((id) => core.placeById.has(id));

  return (
    <>
      <article className="page ins-article" aria-labelledby="ins-title">
        <nav className="ins-crumbs" aria-label="Breadcrumb">
          <Link to="/insights">Insights</Link>
          <span aria-hidden="true">/</span>
          <span>{TOPIC_LABELS[insight.topic] ?? insight.topic}</span>
        </nav>
        <header className="ins-head">
          <Kicker>
            {TOPIC_LABELS[insight.topic] ?? insight.topic}
            {pos >= 0 && ` · ${String(pos + 1).padStart(2, '0')} of ${String(order.length).padStart(2, '0')}`}
          </Kicker>
          <h1 id="ins-title" className="h1 ins-head__title">
            {insight.title}
          </h1>
          <div className="ins-head__grid">
            <div className="ins-question">
              <p className="label">The question</p>
              <p className="ins-question__text">{insight.question}</p>
            </div>
            <div className="ins-head__dek">
              <p className="dek">{insight.dek}</p>
              <p className="ins-head__meta">
                <span>Computed {formatDate(insight.computedAt)}</span>
                <span aria-hidden="true">·</span>
                <span>{plural(insight.findings.length, 'finding')}</span>
                <span aria-hidden="true">·</span>
                <span>{plural(insight.sourceIds.length, 'official source')}</span>
                {places.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{plural(places.length, 'place')}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </header>

        <div className="ins-layout">
          <aside className="ins-rail" aria-label="In this insight">
            <nav className="ins-toc">
              <p className="label">In this piece</p>
              <ol>
                {SECTIONS.filter((s) => s.id !== 'charts' || insight.charts.length).map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.label}</a>
                  </li>
                ))}
                {places.length > 0 && (
                  <li>
                    <a href="#places">Places</a>
                  </li>
                )}
              </ol>
            </nav>
            {meta?.leadHeadline && (
              <div className="ins-rail__lead">
                <p className="label">In one line</p>
                <p className="ins-rail__lead-text">{meta.leadHeadline}</p>
              </div>
            )}
          </aside>

          <div className="ins-main">
            <section id="findings" className="ins-sec" aria-labelledby="findings-h">
              <h2 id="findings-h" className="ins-sec__h">
                Findings
              </h2>
              <ol className="findings">
                {insight.findings.map((f, i) => (
                  <FindingItem key={f.id} finding={f} n={i + 1} placeById={core.placeById} />
                ))}
              </ol>
            </section>

            {insight.charts.length > 0 && (
              <section id="charts" className="ins-sec" aria-labelledby="charts-h">
                <div className="ins-sec__headrow">
                  <h2 id="charts-h" className="ins-sec__h">
                    Charts
                  </h2>
                  {chartPlaces.length > 0 && (
                    <Select
                      size="sm"
                      className="ins-highlight"
                      label="Highlight a place in every chart"
                      value={highlight[0] ?? ''}
                      onChange={(v) => update({ highlight: v || null }, { replace: true })}
                      options={[{ value: '', label: 'No highlight' }, ...chartPlaces.map((p) => ({ value: p.id, label: p.name }))]}
                    />
                  )}
                </div>
                <div className="ins-charts">
                  {insight.charts.map((c) => (
                    <ChartRenderer key={c.id} spec={c} id={`chart-${c.id}`} highlightIds={highlight} />
                  ))}
                </div>
              </section>
            )}

            <section id="meaning" className="ins-sec" aria-labelledby="meaning-h">
              <h2 id="meaning-h" className="ins-sec__h">
                What it means
              </h2>
              <div className="prose ins-interp">
                {insight.interpretation.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>

            <section id="method" className="ins-sec" aria-labelledby="method-h">
              <h2 id="method-h" className="ins-sec__h">
                Method & limits
              </h2>
              <div className="ins-method">
                <Disclosure summary={`How it was computed · ${plural(insight.methodology.length, 'step')}`} variant="boxed" defaultOpen={false}>
                  <ol className="ins-list">
                    {insight.methodology.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ol>
                </Disclosure>
                <Disclosure summary={`Limitations · ${plural(insight.limitations.length, 'caveat')}`} variant="boxed" defaultOpen={false}>
                  <ul className="ins-list">
                    {insight.limitations.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </Disclosure>
              </div>
            </section>

            <section id="sources" className="ins-sec" aria-labelledby="sources-h">
              <h2 id="sources-h" className="ins-sec__h">
                Sources
              </h2>
              <ul className="ins-sources">
                {insight.sourceIds.map((id) => (
                  <li key={id}>
                    {core.sourceById.get(id) && <p className="ins-sources__title">{core.sourceById.get(id)!.title}</p>}
                    <SourceNote sourceId={id} />
                  </li>
                ))}
              </ul>
            </section>

            {places.length > 0 && (
              <section id="places" className="ins-sec" aria-labelledby="places-h">
                <h2 id="places-h" className="ins-sec__h">
                  Places in this piece
                </h2>
                <p className="ins-sec__note">Open a profile for each place’s rents, wages, jobs and costs in one page.</p>
                <PlaceChips ids={places} placeById={core.placeById} label="Related places" />
              </section>
            )}
          </div>
        </div>
      </article>

      {order.length > 0 && (
        <nav className="ins-pager" aria-label="More insights">
          <div className="ins-pager__inner">
            {prev ? (
              <Link to={`/insights/${prev.id}`} className="ins-pager__link ins-pager__link--prev">
                <span className="label">
                  <Icon name="arrowRight" size={14} className="ins-pager__back" /> Previous
                </span>
                <span className="ins-pager__q">{prev.question}</span>
              </Link>
            ) : (
              <Link to="/insights" className="ins-pager__link ins-pager__link--prev">
                <span className="label">
                  <Icon name="arrowRight" size={14} className="ins-pager__back" /> All insights
                </span>
                <span className="ins-pager__q">Back to the insights index</span>
              </Link>
            )}
            {next ? (
              <Link to={`/insights/${next.id}`} className="ins-pager__link ins-pager__link--next">
                <span className="label">
                  Next <Icon name="arrowRight" size={14} />
                </span>
                <span className="ins-pager__q">{next.question}</span>
              </Link>
            ) : (
              <Link to="/insights" className="ins-pager__link ins-pager__link--next">
                <span className="label">
                  All insights <Icon name="arrowRight" size={14} />
                </span>
                <span className="ins-pager__q">Back to the insights index</span>
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
