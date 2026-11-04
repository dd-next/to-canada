import { Link } from 'react-router-dom';
import type { Finding, Place } from '../../types/contract';
import { chartDecimals } from '../../charts/text';
import { Badge } from '../ui/Badge';
import { ButtonLink } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { SourceNote } from '../ui/SourceNote';
import { Stat } from '../ui/Stat';
import { compareTheseHref, periodText, showOnMapHref } from './model';

export function KindBadge({ kind }: { kind: Finding['kind'] }) {
  return kind === 'observation' ? (
    <Badge variant="sourced" title="Read straight from an official table">
      Observation
    </Badge>
  ) : (
    <Badge variant="estimate" title="Derived from official tables; the calculation is shown">
      Calculation
    </Badge>
  );
}

/** Place chips that link to profiles. */
export function PlaceChips({ ids, placeById, label }: { ids: string[]; placeById: Map<string, Place>; label: string }) {
  const known = ids.filter((id) => placeById.has(id));
  if (!known.length) return null;
  return (
    <ul className="place-chips" aria-label={label}>
      {known.map((id) => (
        <li key={id}>
          <Link to={`/place/${id}`} className="chip chip--link">
            {placeById.get(id)!.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export interface FindingItemProps {
  finding: Finding;
  n: number;
  placeById: Map<string, Place>;
}

/** A numbered finding: kind, headline, detail, stat, calculation, map/compare jumps and sources. */
export function FindingItem({ finding: f, n, placeById }: FindingItemProps) {
  const places = f.placeIds.filter((id) => placeById.has(id));
  const compare = compareTheseHref(places);
  const canMap = !!f.metricId || places.length > 0;
  return (
    <li className="finding" id={`finding-${f.id}`}>
      <p className="finding__num mono" aria-hidden="true">
        {String(n).padStart(2, '0')}
      </p>
      <div className="finding__main">
        <div className="finding__kind">
          <KindBadge kind={f.kind} />
        </div>
        <h3 className="finding__headline">{f.headline}</h3>
        <p className="finding__detail">{f.detail}</p>
        {f.stat && (
          <div className="finding__stat">
            <Stat size="md" label={f.stat.label} value={f.stat.value} unit={f.stat.unit} decimals={chartDecimals(f.stat.unit, [f.stat.value])} period={periodText(f.stat.period)} badges={false} />
          </div>
        )}
        {f.calc && (
          <Disclosure summary="How this was calculated" variant="plain" className="finding__calc">
            <p className="finding__calc-text mono">{f.calc}</p>
          </Disclosure>
        )}
        <PlaceChips ids={places} placeById={placeById} label={`Places in finding ${n}`} />
        {(canMap || compare) && (
          <div className="finding__actions">
            {canMap && (
              <ButtonLink to={showOnMapHref({ ...f, placeIds: places })} size="sm" variant="primary" icon="map">
                Show on map
              </ButtonLink>
            )}
            {compare && (
              <ButtonLink to={compare} size="sm" variant="outline" icon="compare">
                Compare these
              </ButtonLink>
            )}
          </div>
        )}
        <SourceNote sourceId={f.sourceIds} />
      </div>
    </li>
  );
}
