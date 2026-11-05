import type { ProgramCategory, ProgramRecord } from '../../types/contract';
import { formatDate } from '../../lib/format';
import { provinceName } from '../../lib/places';
import { Badge } from '../ui/Badge';
import { ButtonAnchor } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';

export const CATEGORY_LABEL: Record<ProgramCategory, string> = {
  federal_economic: 'Federal economic',
  provincial_nominee: 'Provincial nominee',
  quebec: 'Québec system',
  community_pilot: 'Community pilot',
  atlantic: 'Atlantic',
  settlement_support: 'Settlement support',
  pre_arrival: 'Pre-arrival support',
};

export const JOB_LABEL: Record<ProgramRecord['jobOfferRequired'], string> = {
  yes: 'Job offer required',
  no: 'No job offer required',
  conditional: 'Job offer or qualifying alternative',
  varies: 'Job offer: depends on stream',
  not_applicable: 'Job offer: not applicable',
  unknown: 'Job offer: unclear — check the official page',
};

const STATUS_LABEL = { open: 'Open', paused: 'Paused', closed: 'Closed', intake_rounds: 'Intake rounds' } as const;

export const jurisdictionName = (j: ProgramRecord['jurisdiction']) => (j === 'federal' ? 'Federal (IRCC)' : provinceName(j));

export function ProgramCard({ p, parentName, placeNames }: { p: ProgramRecord; parentName?: string; placeNames: string[] }) {
  const cond = p.majorConditions ?? [];
  return (
    <article className="prog" aria-labelledby={`prog-${p.id}`}>
      <header className="prog__head">
        <div className="prog__badges">
          <Badge variant="regional">{jurisdictionName(p.jurisdiction)}</Badge>
          <Badge variant="neutral">{CATEGORY_LABEL[p.category]}</Badge>
          {p.jobOfferRequired !== 'not_applicable' && <Badge variant={p.jobOfferRequired === 'yes' ? 'caution' : 'neutral'}>{JOB_LABEL[p.jobOfferRequired]}</Badge>}
        </div>
        <h3 id={`prog-${p.id}`} className="prog__name">
          {p.name}
        </h3>
        <p className="prog__op">
          {p.operator}
          {parentName && <> · stream of {parentName}</>}
        </p>
      </header>
      {p.status && (
        <p className={`prog__status prog__status--${p.status.value}`}>
          <strong>{STATUS_LABEL[p.status.value]}</strong> — verified on {formatDate(p.lastChecked)}
          {p.status.note ? <>: {p.status.note}</> : null}{' '}
          <a href={p.status.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            Status page
          </a>
        </p>
      )}
      <p className="prog__purpose">{p.purpose}</p>
      {p.jobOfferNote && <p className="prog__purpose">{p.jobOfferNote}</p>}
      <dl className="prog__dl">
        <div>
          <dt className="label">Who it is for</dt>
          <dd>{p.audience}</dd>
        </div>
        <div>
          <dt className="label">Where</dt>
          <dd>
            {p.geography}
            {placeNames.length > 0 && <> Places in Northward: {placeNames.join(', ')}.</>}
          </dd>
        </div>
      </dl>
      {cond.length > 0 && (
        <Disclosure summary={`Major conditions (${cond.length})`} variant="rule" defaultOpen={cond.length <= 1}>
          <ul className="prog__cond">
            {cond.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Disclosure>
      )}
      <footer className="prog__foot">
        <ButtonAnchor href={p.officialUrl} variant="outline" size="sm" aria-label={`Official page for ${p.name} (opens in a new tab)`}>
          Official page
        </ButtonAnchor>
        {(p.links ?? []).map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="link prog__link">
            {l.label}
          </a>
        ))}
        <span className="prog__checked">Page last checked {formatDate(p.lastChecked)}</span>
      </footer>
    </article>
  );
}
