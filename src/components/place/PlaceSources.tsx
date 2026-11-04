import { Link } from 'react-router-dom';
import type { CoreData } from '../../data/core';
import { formatDate } from '../../lib/format';
import { periodText } from '../insights/model';
import { SourceNote } from '../ui/SourceNote';

/** Every source behind the page, with reference period, release and retrieval dates, plus how to read the profile. */
export function PlaceSources({ core, sourceIds, missing }: { core: CoreData; sourceIds: string[]; missing: string[] }) {
  const records = sourceIds
    .map((id) => ({ id, rec: core.sourceById.get(id) }))
    .sort((a, b) => (a.rec?.publisher ?? a.id).localeCompare(b.rec?.publisher ?? b.id) || (a.rec?.title ?? '').localeCompare(b.rec?.title ?? ''));
  return (
    <div className="psources">
      <div className="psources__list">
        <ul>
          {records.map(({ id, rec }) => (
            <li key={id}>
              <p className="psources__title">{rec?.title ?? id}</p>
              <p className="psources__dates mono">
                {rec?.referencePeriod && <>{/^\d/.test(rec.referencePeriod) ? `Covers ${periodText(rec.referencePeriod)}` : rec.referencePeriod} · </>}
                {rec?.releaseDate && <>Released {formatDate(rec.releaseDate)} · </>}
                {rec ? <>Retrieved {formatDate(rec.retrievedAt)}</> : 'No source record in this snapshot'}
              </p>
              <SourceNote sourceId={id} />
            </li>
          ))}
        </ul>
      </div>
      <aside className="psources__how">
        <p className="ppanel__title">How to read this profile</p>
        <ul className="ppanel__text psources__rules">
          <li>Every number names the geography it was measured for. Economic-region, province-wide and territory-wide values are labelled as such.</li>
          <li>A value the source does not publish is shown as missing with the reason — never as zero, never estimated.</li>
          <li>Anything we calculate (gross monthly pay, basket scaling, rent as a share of pay) is labelled and shows its method.</li>
          <li>Ranks compare only places with the same measure, period, source and type of geography.</li>
        </ul>
        {missing.length > 0 && (
          <p className="ppanel__note">
            Not in this data snapshot yet: {missing.join('; ')}. Those sections appear automatically when the data is published here.
          </p>
        )}
        <p className="ppanel__note">
          Snapshot built {formatDate(core.manifest.builtAt)}. <Link to="/sources">All sources & methods</Link>
        </p>
      </aside>
    </div>
  );
}
