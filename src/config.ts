/** Product-level configuration. The product name is a working title and can be
 * changed at build time with VITE_PRODUCT_NAME=... */
export const PRODUCT = {
  name: (import.meta.env.VITE_PRODUCT_NAME as string | undefined) ?? 'Northward',
  tagline: 'Where in Canada could you build a life?',
  description:
    'An independent explorer of Canadian cities built on official open data: rents, wages by occupation, labour markets, climate and immigration reference.',
  /** Base URL for data snapshots (served from /public/data). */
  dataBase: `${import.meta.env.BASE_URL}data/`,
} as const;

/** Local-storage keys (personal inputs never leave the browser unless shared explicitly). */
export const STORAGE = {
  favourites: 'nw:favourites:v1',
  budget: 'nw:budget:v1',
  prefs: 'nw:prefs:v1',
} as const;
