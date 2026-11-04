import { useId, useState } from 'react';
import { useCoreState } from '../../data/core';
import type { MetricDef, SourceRecord } from '../../types/contract';
import { formatDate, formatPeriod, formatPeriodText } from '../../lib/format';
import { Icon } from './Icon';

export interface SourceNoteProps {
  /** One or more SourceRecord ids. */
  sourceId?: string | string[] | null;
  period?: string | null;
  periodType?: MetricDef['periodType'];
  /** Lead word, default "Source". */
  lead?: string;
  defaultOpen?: boolean;
  /** Tone for dark sections. */
  onDark?: boolean;
  className?: string;
}

function shortName(s: SourceRecord): string {
  return s.tableId ? `${s.publisher} · ${s.tableId}` : `${s.publisher} · ${s.title}`;
}

/**
 * Compact provenance line: "Source: Statistics Canada · 46-10-0092-01 · Q3 2025 · Retrieved Oct 12, 2026",
 * expandable to the full SourceRecord (publisher, table link, licence, transformations, notes).
 */
export function SourceNote({ sourceId, period, periodType, lead = 'Source', defaultOpen = false, onDark, className }: SourceNoteProps) {
  const core = useCoreState();
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const ids = (Array.isArray(sourceId) ? sourceId : sourceId ? [sourceId] : []).filter(Boolean);
  if (ids.length === 0) return null;
  const records = ids.map((id) => ({ id, rec: core.status === 'ready' ? core.data.sourceById.get(id) : undefined }));
  const retrieved = records.map((r) => r.rec?.retrievedAt).filter(Boolean).sort().pop();
  const stale = records.some((r) => r.rec?.status === 'stale_snapshot' || r.rec?.status === 'partial');

  return (
    <div className={['source-note', onDark && 'source-note--dark', open && 'is-open', className].filter(Boolean).join(' ')}>
      <p className="source-note__line">
        <span className="source-note__lead">{lead}:</span>{' '}
        {records.map((r, i) => (
          <span key={r.id}>
            {i > 0 && '; '}
            {r.rec ? shortName(r.rec) : <span className="mono">{r.id}</span>}
          </span>
        ))}
        {period && <> · {formatPeriod(period, periodType)}</>}
        {retrieved && <> · Retrieved {formatDate(retrieved)}</>}
        {stale && <span className="source-note__stale"> · Older snapshot</span>}{' '}
        <button type="button" className="source-note__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'Details'}
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} />
        </button>
      </p>
      <div id={panelId} className="source-note__panel" hidden={!open}>
        {records.map(({ id, rec }) =>
          rec ? (
            <dl key={id} className="source-note__rec">
              <dt>Title</dt>
              <dd>
                <a href={rec.url} target="_blank" rel="noreferrer noopener" className="link">
                  {rec.title}
                </a>
              </dd>
              <dt>Publisher</dt>
              <dd>{rec.publisher}</dd>
              {rec.tableId && (
                <>
                  <dt>Table</dt>
                  <dd>
                    <a href={rec.url} target="_blank" rel="noreferrer noopener" className="mono">
                      {rec.tableId}
                    </a>
                  </dd>
                </>
              )}
              {rec.referencePeriod && (
                <>
                  <dt>Reference period</dt>
                  <dd>{formatPeriodText(rec.referencePeriod)}</dd>
                </>
              )}
              {rec.releaseDate && (
                <>
                  <dt>Released</dt>
                  <dd>{formatDate(rec.releaseDate)}</dd>
                </>
              )}
              <dt>Retrieved</dt>
              <dd>{formatDate(rec.retrievedAt)}</dd>
              <dt>Licence</dt>
              <dd>{rec.licence}</dd>
              {rec.attribution && (
                <>
                  <dt>Attribution</dt>
                  <dd>{rec.attribution}</dd>
                </>
              )}
              {rec.transformations?.length ? (
                <>
                  <dt>What we did</dt>
                  <dd>
                    <ul>
                      {rec.transformations.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              ) : null}
              {rec.notes?.length ? (
                <>
                  <dt>Notes</dt>
                  <dd>
                    <ul>
                      {rec.notes.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              ) : null}
              {rec.status && rec.status !== 'ok' && (
                <>
                  <dt>Status</dt>
                  <dd className="source-note__stale">
                    {rec.status === 'stale_snapshot' ? 'Older snapshot kept because the latest download failed' : rec.status === 'partial' ? 'Partial download' : 'Download failed'}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <p key={id} className="source-note__unknown">
              No source record for <span className="mono">{id}</span> in this snapshot.
            </p>
          ),
        )}
      </div>
    </div>
  );
}
