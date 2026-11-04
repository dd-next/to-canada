import { useEffect, useState, type ReactNode } from 'react';

export interface ProfileSectionProps {
  id: string;
  /** Running section number, e.g. "03". */
  num: string;
  title: string;
  dek?: ReactNode;
  /** Right-aligned controls in the header (e.g. a profession picker). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A numbered profile section: kicker number, heavy title, serif dek, strong rule. */
export function ProfileSection({ id, num, title, dek, aside, children, className }: ProfileSectionProps) {
  return (
    <section id={id} className={['psec', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-h`}>
      <header className="psec__head">
        <div className="psec__titles">
          <p className="psec__num mono" aria-hidden="true">
            {num}
          </p>
          <h2 id={`${id}-h`} className="psec__title">
            {title}
          </h2>
          {dek && <p className="psec__dek">{dek}</p>}
        </div>
        {aside && <div className="psec__aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export interface NavItem {
  id: string;
  label: string;
}

/** Sticky mini-nav of the profile's sections with scroll-spy (aria-current on the section in view). */
export function SectionNav({ items, label }: { items: NavItem[]; label: string }) {
  const [current, setCurrent] = useState<string | null>(items[0]?.id ?? null);
  const key = items.map((i) => i.id).join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = key
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
        let best: string | null = null;
        let bestTop = Infinity;
        for (const [id, top] of visible) if (top !== Infinity && Math.abs(top) < Math.abs(bestTop)) {
          best = id;
          bestTop = top;
        }
        if (best) setCurrent(best);
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);

  useEffect(() => {
    // keep the current item visible in the horizontally scrolling bar (mobile)
    const link = document.querySelector<HTMLElement>(`.pnav a[href="#${current}"]`);
    const bar = link?.closest('.pnav__list');
    if (!link || !bar) return;
    const l = link.offsetLeft;
    const r = l + link.offsetWidth;
    if (l < bar.scrollLeft || r > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: Math.max(0, l - 24), behavior: 'auto' });
  }, [current]);

  return (
    <nav className="pnav" aria-label={label}>
      <ul className="pnav__list">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={current === i.id ? 'true' : undefined} onClick={() => setCurrent(i.id)}>
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
