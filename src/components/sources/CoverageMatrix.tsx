import { useMemo } from 'react';
import type { CoreData } from '../../data/core';
import type { Flag, MetricCategory } from '../../types/contract';
import { CATEGORY_LABELS } from '../../lib/layers';
import { provinceAbbr } from '../../lib/places';

const DOMAINS: MetricCategory[] = ['housing', 'work', 'cost', 'climate', 'people', 'immigration'];
const REGIONAL: Flag[] = ['regional_value', 'provincial_value', 'national_value'];
type Status = 'filled' | 'partial' | 'regional' | 'missing';

const STATUS_TEXT: Record<Status, string> = {
  filled: 'Full: nearly all indicators for the place’s own area',
  partial: 'Partial: some indicators missing',
  regional: 'Regional: only province- or region-wide values',
  missing: 'Missing: no published values',
};

function compute(core: CoreData) {
  const expected = new Map<MetricCategory, string[]>();
  for (const c of DOMAINS) {
    const ids = core.metrics.filter((m) => m.category === c && (core.byMetric.get(m.id) ?? []).some((o) => o.value !== null)).map((m) => m.id);
    expected.set(c, ids);
  }
  const rows = core.places.map((p) => {
    const cells = DOMAINS.map((c) => {
      const ids = expected.get(c)!;
      let have = 0;
      let local = 0;
      for (const id of ids) {
        const o = core.obsIndex.get(p.id)?.get(id);
        if (o && o.value !== null) {
          have++;
          if (!(o.flags ?? []).some((f) => REGIONAL.includes(f))) local++;
        }
      }
      const status: Status = have === 0 ? 'missing' : local === 0 ? 'regional' : have >= ids.length * 0.85 && local >= have * 0.6 ? 'filled' : 'partial';
      return { status, have, local, total: ids.length };
    });
    return { place: p, cells };
  });
  return { rows, expected };
}

function Mark({ status }: { status: Status }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={`cov__mark cov__mark--${status}`}>
      {status === 'filled' && <rect x="2" y="2" width="14" height="14" fill="var(--pine)" />}
      {status === 'partial' && (
        <>
          <rect x="2.5" y="2.5" width="13" height="13" fill="none" stroke="var(--pine)" strokeWidth="1.5" />
          <rect x="2.5" y="9" width="13" height="6.5" fill="var(--pine)" />
        </>
      )}
      {status === 'regional' && (
        <>
          <rect x="2.5" y="2.5" width="13" height="13" fill="var(--paper-3)" stroke="var(--ink-2)" strokeWidth="1.5" />
          <path d="M3 15L15 3M3 10L10 3M8 15L15 8" stroke="var(--ink-2)" strokeWidth="1.2" />
        </>
      )}
      {status === 'missing' && <rect x="2.5" y="2.5" width="13" height="13" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="2.5 2" />}
    </svg>
  );
}

export function CoverageMatrix({ core }: { core: CoreData }) {
  const { rows, expected } = useMemo(() => compute(core), [core]);
  return (
    <div>
      <ul className="cov__legend" aria-label="Legend">
        {(Object.keys(STATUS_TEXT) as Status[]).map((s) => (
          <li key={s}>
            <Mark status={s} />
            <span>{STATUS_TEXT[s]}</span>
          </li>
        ))}
      </ul>
      <div className="cov__scroll" role="region" aria-label="Coverage by place and domain" tabIndex={0}>
        <table className="cov">
          <thead>
            <tr>
              <th scope="col">Place</th>
              {DOMAINS.map((c) => (
                <th key={c} scope="col" className="cov__c">
                  {CATEGORY_LABELS[c]}
                  <span className="cov__tot">{expected.get(c)!.length ? `${expected.get(c)!.length} indicators` : 'none yet'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ place, cells }) => (
              <tr key={place.id}>
                <th scope="row">
                  {place.name} <span className="cov__prov">{provinceAbbr(place.province)}</span>
                </th>
                {cells.map((cell, i) => (
                  <td key={DOMAINS[i]} className="cov__c" title={cell.total ? `${cell.have} of ${cell.total} indicators` : 'No indicators published yet'}>
                    <Mark status={cell.status} />
                    <span className="sr-only">
                      {STATUS_TEXT[cell.status]} ({cell.have} of {cell.total})
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cov__note">
        Computed from the observations in this snapshot: for each place, how many of a domain’s published indicators have a value, and whether those values describe the place itself or only its region or province. Work counts labour-force indicators; wages by profession come from Job Bank’s economic-region file and are looked up per profession.
      </p>
    </div>
  );
}
