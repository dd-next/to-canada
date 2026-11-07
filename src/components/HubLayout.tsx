import { useEffect, useRef } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { IMMIGRATION_NAV, SERVICES_NAV } from '../nav';
import '../styles/hub.css';

/** Compatibility links keep all public query/hash state without persisting answers. */
export function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

export default function HubLayout({ section }: { section: 'immigration' | 'services' }) {
  const { pathname, hash } = useLocation();
  const links = section === 'immigration' ? IMMIGRATION_NAV : SERVICES_NAV;
  const navList = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = navList.current;
    const active = list?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!list || !active) return;
    const left = active.getBoundingClientRect().left - list.getBoundingClientRect().left;
    const right = left + active.offsetWidth;
    if (left < 0 || right > list.clientWidth) list.scrollTo({ left: Math.max(0, list.scrollLeft + left - 16) });
  }, [pathname]);
  useEffect(() => {
    if (!hash) return;
    let id: string;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    // Lazy pages and datasets may arrive after the browser's initial anchor scroll.
    const scroll = () => {
      const target = document.getElementById(id);
      if (!target) return false;
      target.scrollIntoView({ block: 'start' });
      return true;
    };
    const observer = new MutationObserver(() => { if (scroll()) observer.disconnect(); });
    const frame = requestAnimationFrame(() => {
      if (!scroll()) observer.observe(document.getElementById('main')!, { childList: true, subtree: true });
    });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [pathname, hash]);
  return (
    <div className={`hub hub--${section}`}>
      <nav className="hub-nav" aria-label={section === 'immigration' ? 'Immigration sections' : 'Services sections'}>
        <ul ref={navList}>
          {links.map((link) => <li key={link.to}><NavLink end to={link.to}>{link.label}</NavLink></li>)}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
