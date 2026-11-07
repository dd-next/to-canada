/** Primary navigation (lead-owned). Labels are short, uppercase in the UI. */
export const NAV = [
  { to: '/', label: 'Explore', end: true },
  { to: '/compare', label: 'Compare' },
  { to: '/budget', label: 'Budget' },
  { to: '/insights', label: 'Insights' },
  { to: '/immigration', label: 'Immigration' },
  { to: '/services', label: 'Services' },
] as const;

export const IMMIGRATION_NAV = [
  { to: '/immigration/programs', label: 'Programs' },
  { to: '/immigration/express-entry', label: 'EE Calculator' },
  { to: '/immigration/updates', label: 'IRCC Updates' },
  { to: '/immigration/lmia', label: 'LMIA History' },
] as const;

export const SERVICES_NAV = [
  { to: '/services', label: 'Directory' },
  { to: '/services/updates', label: 'Update log' },
  { to: '/services/sources', label: 'Sources & credits' },
] as const;

export const FOOTER_NAV = [
  { to: '/sources', label: 'Sources & methods' },
  { to: '/about', label: 'About' },
] as const;
