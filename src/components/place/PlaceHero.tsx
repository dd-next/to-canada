import { useState } from 'react';
import type { Place } from '../../types/contract';
import { formatNumber, formatPopulationPeriod } from '../../lib/format';
import { provinceName, regionLabel } from '../../lib/places';
import { useCompareTray, useFavourites } from '../../lib/state';
import { Button, ButtonLink } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Kicker } from '../ui/SectionHeader';
import { SourceNote } from '../ui/SourceNote';
import { LocatorMap } from './LocatorMap';

const PROGRAM_TAGS: Record<string, string> = {
  rcip: 'Rural Community Immigration Pilot',
  fcip: 'Francophone Community Immigration Pilot',
  aip: 'Atlantic Immigration Program',
  quebec: 'Quebec selects its own immigrants',
  rnip: 'Rural and Northern Immigration Pilot (closed)',
};

/** "Statistics cover the whole CMA, including Mississauga, Brampton and Markham." */
export function coverageLine(place: Place): string {
  const munis = place.municipalities ?? [];
  const list = munis.length > 4 ? `${munis.slice(0, 4).join(', ')} and other municipalities` : munis.length > 1 ? `${munis.slice(0, -1).join(', ')} and ${munis[munis.length - 1]}` : munis[0];
  const level = place.geo.cma?.level;
  const area = place.geo.cmaPart
    ? `the ${place.statLabel.replace(/\s*\((.+)\)$/, ' — $1')}`
    : level === 'ca'
      ? 'the whole census agglomeration'
      : level === 'csd' || (!place.geo.cma && place.geo.principalCsd)
        ? 'the city itself'
        : level === 'cma'
          ? 'the whole census metropolitan area (CMA)'
          : `the ${place.statLabel}`;
  return list ? `Statistics cover ${area}, including ${list}.` : `Statistics cover ${area}.`;
}

export function PlaceHero({ place, places }: { place: Place; places: Place[] }) {
  const favourites = useFavourites();
  const compare = useCompareTray();
  const [notice, setNotice] = useState<string | null>(null);
  const saved = favourites.isSaved(place.id);
  const inCompare = compare.has(place.id);
  return (
    <header className="phero">
      <div className="phero__text">
        <Kicker>
          {provinceName(place.province)}
          {regionLabel(place.region) !== provinceName(place.province) && ` · ${regionLabel(place.region)}`}
          {place.tier === 'extended' && ' · Partial coverage'}
        </Kicker>
        <h1 className="display phero__name">{place.name}</h1>
        <p className="phero__label">
          <strong>{place.statLabel}</strong>
          {place.population && (
            <>
              {' · '}
              <span className="num">Population {formatNumber(place.population.value)}</span>
              <span className="phero__period mono"> · {formatPopulationPeriod(place.population.period)}</span>
            </>
          )}
        </p>
        <p className="phero__coverage">{coverageLine(place)}</p>
        {place.blurb && <p className="dek phero__blurb">{place.blurb}</p>}
        {place.programTags && place.programTags.length > 0 && (
          <ul className="phero__tags" aria-label="Immigration programs that name this place">
            {place.programTags.map((t) => (
              <li key={t}>
                <Chip tone="accent" title={PROGRAM_TAGS[t] ?? t}>
                  {PROGRAM_TAGS[t] ?? t.toUpperCase()}
                </Chip>
              </li>
            ))}
          </ul>
        )}
        <div className="phero__actions">
          <Button variant={saved ? 'outline' : 'primary'} icon={saved ? 'starFilled' : 'star'} aria-pressed={saved} onClick={() => favourites.toggle(place.id)}>
            {saved ? 'Saved' : 'Save'}
          </Button>
          <Button
            variant="outline"
            icon={inCompare ? 'check' : 'plus'}
            aria-pressed={inCompare}
            aria-disabled={!inCompare && compare.isFull ? true : undefined}
            onClick={() => {
              const r = compare.toggle(place.id);
              setNotice(r === null ? 'Compare holds three places. Remove one to add another.' : r ? `${place.name} added to compare.` : `${place.name} removed from compare.`);
            }}
          >
            {inCompare ? 'In compare' : 'Add to compare'}
          </Button>
          <ButtonLink to={`/?place=${encodeURIComponent(place.id)}`} variant="ghost" icon="map">
            See on the map
          </ButtonLink>
        </div>
        <p className="phero__notice" role="status" aria-live="polite">
          {notice}
        </p>
        {place.population && <SourceNote sourceId={place.population.sourceId} period={place.population.period} periodType="census" lead="Population" />}
      </div>
      <div className="phero__map">
        <LocatorMap place={place} places={places} />
        <p className="phero__coords mono">
          {Math.abs(place.lat).toFixed(2)}° {place.lat >= 0 ? 'N' : 'S'} · {Math.abs(place.lon).toFixed(2)}° {place.lon < 0 ? 'W' : 'E'}
        </p>
      </div>
    </header>
  );
}
