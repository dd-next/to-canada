import { Link } from 'react-router-dom';
import type { Insight, Place } from '../../types/contract';
import { KindBadge } from '../insights/FindingItem';
import { TOPIC_LABELS } from '../insights/model';
import { Icon } from '../ui/Icon';

/** Findings from the insights that name this place, linking to the finding in its insight. */
export function PlaceFindings({ place, insights, loading }: { place: Place; insights: Insight[]; loading: boolean }) {
  const items = insights.flatMap((ins) => ins.findings.filter((f) => f.placeIds.includes(place.id)).map((f) => ({ ins, f })));
  const mentioned = insights.filter((i) => !items.some((x) => x.ins.id === i.id));
  if (loading && !items.length) return <p className="ppanel__text">Loading findings…</p>;
  if (!items.length && !mentioned.length) return <p className="ppanel__text">No insight in this snapshot names {place.name} yet.</p>;
  return (
    <div className="pfind">
      {items.length > 0 && (
        <ol className="pfind__list">
          {items.map(({ ins, f }) => (
            <li key={`${ins.id}-${f.id}`}>
              <Link to={`/insights/${ins.id}#finding-${f.id}`} className="pfind__link">
                <span className="pfind__meta">
                  <span className="label">{TOPIC_LABELS[ins.topic] ?? ins.topic}</span>
                  <KindBadge kind={f.kind} />
                </span>
                <span className="pfind__headline">{f.headline}</span>
                <span className="pfind__from">
                  From “{ins.title}” <Icon name="arrowRight" size={14} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {mentioned.length > 0 && (
        <p className="ppanel__note">
          Also among the places in:{' '}
          {mentioned.map((i, k) => (
            <span key={i.id}>
              {k > 0 && ' · '}
              <Link to={`/insights/${i.id}`} className="link">
                {i.question}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
