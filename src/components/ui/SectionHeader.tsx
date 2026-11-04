import type { ReactNode } from 'react';

export function Kicker({ children, className, as: Tag = 'p' }: { children: ReactNode; className?: string; as?: 'p' | 'span' | 'div' }) {
  return <Tag className={['kicker', className].filter(Boolean).join(' ')}>{children}</Tag>;
}

export interface SectionHeaderProps {
  kicker?: ReactNode;
  title: ReactNode;
  /** Heading level; 1 renders the page-title style. */
  level?: 1 | 2 | 3;
  dek?: ReactNode;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
  id?: string;
  className?: string;
}

/** Kicker + heavy heading + optional serif dek, on a strong rule. */
export function SectionHeader({ kicker, title, level = 2, dek, actions, id, className }: SectionHeaderProps) {
  const H = `h${level}` as const;
  return (
    <header className={['section-header', `section-header--${level}`, className].filter(Boolean).join(' ')}>
      <div className="section-header__text">
        {kicker && <Kicker>{kicker}</Kicker>}
        <H id={id} className={level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'}>
          {title}
        </H>
        {dek && <p className="dek">{dek}</p>}
      </div>
      {actions && <div className="section-header__actions">{actions}</div>}
    </header>
  );
}
