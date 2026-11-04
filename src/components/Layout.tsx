import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { PRODUCT } from '../config';
import { FOOTER_NAV, NAV } from '../nav';
import { useDismiss } from '../lib/hooks';
import { CompareTrayMenu, SavedTrayMenu } from './TrayMenu';
import { Icon } from './ui/Icon';
import { Wordmark } from './Wordmark';

function PrimaryNav({ id, onNavigate }: { id?: string; onNavigate?: () => void }) {
  return (
    <ul className="nav__list" id={id}>
      {NAV.map((n) => (
        <li key={n.to}>
          <NavLink to={n.to} end={'end' in n ? n.end : undefined} className="nav__link" onClick={onNavigate}>
            {n.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, () => setMenuOpen(false), [menuBtn, menuPanel]);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const isExplore = pathname === '/';

  return (
    <div className={['app', isExplore && 'app--explore'].filter(Boolean).join(' ')}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="topbar__brand" aria-label={`${PRODUCT.name} — explore the map`}>
          <Wordmark />
        </Link>
        <nav className="nav nav--primary" aria-label="Primary">
          <PrimaryNav />
        </nav>
        <div className="topbar__trays">
          <CompareTrayMenu />
          <SavedTrayMenu />
        </div>
        <button
          ref={menuBtn}
          type="button"
          className="topbar__menu-btn"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
          <span className="label">Menu</span>
        </button>
        <div ref={menuPanel} id="mobile-menu" className="mobile-menu" hidden={!menuOpen}>
          <nav aria-label="Primary (mobile)">
            <PrimaryNav onNavigate={() => setMenuOpen(false)} />
          </nav>
          <ul className="mobile-menu__secondary">
            {FOOTER_NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} onClick={() => setMenuOpen(false)}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="main">
        {children}
      </main>
      <footer className="footer dark-band">
        <div className="footer__inner">
          <div className="footer__brand">
            <Wordmark className="wordmark--on-dark" />
            <p className="footer__tagline">{PRODUCT.tagline}</p>
          </div>
          <nav className="footer__nav" aria-label="Footer">
            <ul>
              {FOOTER_NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to}>{n.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="footer__fine">
            <p>Independent project. Not affiliated with the Government of Canada or any organisation whose data it uses.</p>
            <p>
              Data: Statistics Canada, CMHC, ESDC Job Bank, IRCC, ECCC — see <Link to="/sources">Sources</Link>.
            </p>
            <p className="footer__privacy">Your saved places, comparisons and budget stay in this browser.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
