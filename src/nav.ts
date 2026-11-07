/** Primary navigation (lead-owned). Labels are short, uppercase in the UI. */
export const NAV = [
  { to: '/', label: 'Explore', end: true },
  { to: '/compare', label: 'Compare' },
  { to: '/budget', label: 'Budget' },
  { to: '/insights', label: 'Insights' },
  { to: '/immigration', label: 'Immigration' },
  { to: '/express-entry', label: 'EE Calculator' },
  { to: '/updates', label: 'IRCC Updates' },
] as const;

export const FOOTER_NAV = [
  { to: '/sources', label: 'Sources & methods' },
  { to: '/about', label: 'About' },
] as const;
