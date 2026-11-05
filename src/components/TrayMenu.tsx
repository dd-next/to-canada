import { useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCoreState } from '../data/core';
import { withNavigationContext } from '../lib/navigation';
import { compareColor } from '../lib/colors';
import { useDismiss } from '../lib/hooks';
import { compareHref, useCompareTray, useFavourites } from '../lib/state';
import { ButtonLink, IconButton } from './ui/Button';
import { Icon } from './ui/Icon';

function usePlaceName() {
  const core = useCoreState();
  return (id: string) => (core.status === 'ready' ? (core.data.placeById.get(id)?.name ?? id) : id);
}

function Popover({ label, count, icon, children, align = 'right' }: { label: string; count: number; icon: 'compare' | 'star'; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [btn, panel]);
  return (
    <div className={['tray', open && 'is-open'].filter(Boolean).join(' ')}>
      <button
        ref={btn}
        type="button"
        className={['tray__btn', count > 0 && 'has-items'].filter(Boolean).join(' ')}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={icon} size={16} />
        <span className="tray__label">{label}</span>
        <span className="tray__count num">{count}</span>
        <span className="sr-only">{count === 1 ? ' place' : ' places'}</span>
      </button>
      <div ref={panel} id={id} className={`tray__panel tray__panel--${align}`} hidden={!open} role="region" aria-label={label}>
        {open && children(() => setOpen(false))}
      </div>
    </div>
  );
}

/** "Compare (n)" header tray: up to three places, link to the comparison page. */
export function CompareTrayMenu() {
  const context = new URLSearchParams(useLocation().search);
  const tray = useCompareTray();
  const name = usePlaceName();
  return (
    <Popover label="Compare" count={tray.ids.length} icon="compare">
      {(close) => (
        <>
          <p className="tray__title label">Compare · up to {tray.max} places</p>
          {tray.ids.length === 0 ? (
            <p className="tray__empty">Add places from the map or the list to line them up side by side.</p>
          ) : (
            <ul className="tray__list">
              {tray.ids.map((id, i) => (
                <li key={id}>
                  <span className="tray__swatch" style={{ background: compareColor(i) }} aria-hidden="true" />
                  <Link to={`/place/${id}`} onClick={close}>
                    {name(id)}
                  </Link>
                  <IconButton icon="close" size="sm" label={`Remove ${name(id)} from compare`} onClick={() => tray.remove(id)} />
                </li>
              ))}
            </ul>
          )}
          <div className="tray__actions">
            <ButtonLink to={withNavigationContext(compareHref(tray.ids), context)} variant="primary" size="sm" iconRight="arrowRight" onClick={close}>
              Open comparison
            </ButtonLink>
            {tray.ids.length > 0 && (
              <button type="button" className="tray__clear" onClick={() => tray.clear()}>
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </Popover>
  );
}

/** "Saved (n)" header tray: starred places, kept in this browser. */
export function SavedTrayMenu() {
  const fav = useFavourites();
  const name = usePlaceName();
  const highlight = `/?highlight=${fav.ids.join(',')}&from=${encodeURIComponent('Your saved places')}`;
  return (
    <Popover label="Saved" count={fav.ids.length} icon="star">
      {(close) => (
        <>
          <p className="tray__title label">Saved places · this browser only</p>
          {fav.ids.length === 0 ? (
            <p className="tray__empty">Star a place to keep a shortlist. Nothing leaves your device.</p>
          ) : (
            <ul className="tray__list">
              {fav.ids.map((id) => (
                <li key={id}>
                  <Icon name="starFilled" size={14} className="tray__star" />
                  <Link to={`/place/${id}`} onClick={close}>
                    {name(id)}
                  </Link>
                  <IconButton icon="close" size="sm" label={`Remove ${name(id)} from saved`} onClick={() => fav.remove(id)} />
                </li>
              ))}
            </ul>
          )}
          {fav.ids.length > 0 && (
            <div className="tray__actions">
              <ButtonLink to={highlight} variant="outline" size="sm" icon="map" onClick={close}>
                Show on map
              </ButtonLink>
            </div>
          )}
        </>
      )}
    </Popover>
  );
}
