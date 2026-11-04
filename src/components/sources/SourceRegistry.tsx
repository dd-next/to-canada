import { useMemo } from 'react';
import type { SourceRecord } from '../../types/contract';
import { formatDate, formatPeriod, plural } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Disclosure } from '../ui/Disclosure';

/** Group key: publisher without a trailing parenthetical acronym. */
const groupKey = (s: SourceRecord) => s.publisher.replace(/\s*\([^)]*\)\s*$/, '').trim();

const STATUS: Record<NonNullable<SourceRecord['status']>, string> = {
  ok: 'Up to date',
  stale_snapshot: 'Older snapshot',
  partial: 'Partial download',
  failed: 'Download failed',
};

function SourceItem({ s }: { s: SourceRecord }) {
  const status = s.status ?? 'ok';
  const extra = (s.transformations?.length ?? 0) + (s.notes?.length ?? 0) > 0 || !!s.attribution;
  return (
    <article className="src" id={s.id}>
      <header className="src__head">
        <h4 className="src__title">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="link">
            {s.title}
          </a>
        </h4>
        {status !== 'ok' ? <Badge variant="caution">{STATUS[status]}</Badge> : <Badge variant="sourced">Up to date</Badge>}
      </header>
      <dl className="src__dl">
        {s.tableId && (
          <div>
            <dt className="label">Table</dt>
            <dd>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="mono">
                {s.tableId}
              </a>
            </dd>
          </div>
        )}
        {s.referencePeriod && (
          <div>
            <dt className="label">Reference period</dt>
            <dd>{formatPeriod(s.referencePeriod)}</dd>
          </div>
        )}
        {s.releaseDate && (
          <div>
            <dt className="label">Released</dt>
            <dd>{formatDate(s.releaseDate)}</dd>
          </div>
        )}
        <div>
          <dt className="label">Retrieved</dt>
          <dd>{formatDate(s.retrievedAt)}</dd>
        </div>
        <div>
          <dt className="label">Licence</dt>
          <dd>{s.licence}</dd>
        </div>
      </dl>
      {extra && (
        <Disclosure summary="What we did with it" variant="rule">
          <div className="src__more">
            {s.transformations && s.transformations.length > 0 && (
              <>
                <h5 className="label">Transformations</h5>
                <ul>
                  {s.transformations.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}
            {s.notes && s.notes.length > 0 && (
              <>
                <h5 className="label">Notes and limits</h5>
                <ul>
                  {s.notes.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}
            {s.attribution && <p className="src__attr">{s.attribution}</p>}
            {s.downloadUrl && (
              <p className="src__attr">
                Data endpoint: <span className="mono src__url">{s.downloadUrl}</span>
              </p>
            )}
          </div>
        </Disclosure>
      )}
    </article>
  );
}

export function SourceRegistry({ sources }: { sources: SourceRecord[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, SourceRecord[]>();
    for (const s of sources) {
      const k = groupKey(s);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([name, items]) => ({ name, items: items.sort((a, b) => a.title.localeCompare(b.title)) }));
  }, [sources]);
  return (
    <div className="srcgroups">
      {groups.map((g) => (
        <section key={g.name} className="srcgroup" aria-label={g.name}>
          <h3 className="srcgroup__name">
            {g.name} <span className="imm__n num">{plural(g.items.length, 'source')}</span>
          </h3>
          <div className="srcgroup__items">
            {g.items.map((s) => (
              <SourceItem key={s.id} s={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
