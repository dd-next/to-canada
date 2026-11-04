import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PRODUCT } from '../config';
import { NAV } from '../nav';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header>
        <strong>{PRODUCT.name}</strong>
        <nav aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main">{children}</main>
    </>
  );
}
