/**
 * Shared app state:
 *  - favourites ("Saved") in localStorage (STORAGE.favourites)
 *  - compare tray (max 3) in localStorage, so a selection survives navigation;
 *    shareable pages mirror it in the URL (?compare=toronto,calgary,halifax)
 *  - URL search-param state with literal commas and batched updates
 * All storage access is wrapped in try/catch (private mode, quotas, SSR).
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { STORAGE } from '../config';

export const COMPARE_MAX = 3;
/** Compare tray key (not in STORAGE yet; lead may move it there). */
export const COMPARE_KEY = 'nw:compare:v1';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep in memory */
  }
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export interface ListStore {
  get(): string[];
  set(next: string[]): void;
  subscribe(listener: () => void): () => void;
}

function createListStore(key: string, max = Infinity): ListStore {
  const read = (): string[] => {
    const raw = safeGet(key);
    if (!raw) return [];
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(0, max) : [];
    } catch {
      return [];
    }
  };
  let ids = typeof window === 'undefined' ? [] : read();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        ids = read();
        emit();
      }
    });
  return {
    get: () => ids,
    set(next) {
      const clean = [...new Set(next)].slice(0, max);
      if (sameList(clean, ids)) return;
      ids = clean;
      safeSet(key, JSON.stringify(ids));
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const favouritesStore = createListStore(STORAGE.favourites);
export const compareStore = createListStore(COMPARE_KEY, COMPARE_MAX);

function useStore(store: ListStore): string[] {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// ------------------------------------------------------------------ favourites

export interface Favourites {
  ids: string[];
  isSaved(id: string): boolean;
  toggle(id: string): void;
  add(id: string): void;
  remove(id: string): void;
  clear(): void;
}

/** Saved places (localStorage). */
export function useFavourites(): Favourites {
  const ids = useStore(favouritesStore);
  return useMemo(
    () => ({
      ids,
      isSaved: (id) => ids.includes(id),
      toggle: (id) => {
        const cur = favouritesStore.get();
        favouritesStore.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
      },
      add: (id) => favouritesStore.set([...favouritesStore.get(), id]),
      remove: (id) => favouritesStore.set(favouritesStore.get().filter((x) => x !== id)),
      clear: () => favouritesStore.set([]),
    }),
    [ids],
  );
}

// ------------------------------------------------------------------ compare

export interface CompareTray {
  ids: string[];
  max: number;
  isFull: boolean;
  has(id: string): boolean;
  /** Returns false when the tray is full (or the id is already there). */
  add(id: string): boolean;
  remove(id: string): void;
  /** Returns the new membership (true = now in the tray), or null if it could not be added. */
  toggle(id: string): boolean | null;
  set(ids: string[]): void;
  clear(): void;
}

function trayApi(ids: string[]): CompareTray {
  const add = (id: string) => {
    const cur = compareStore.get();
    if (cur.includes(id) || cur.length >= COMPARE_MAX) return false;
    compareStore.set([...cur, id]);
    return true;
  };
  const remove = (id: string) => compareStore.set(compareStore.get().filter((x) => x !== id));
  return {
    ids,
    max: COMPARE_MAX,
    isFull: ids.length >= COMPARE_MAX,
    has: (id) => ids.includes(id),
    add,
    remove,
    toggle: (id) => {
      if (compareStore.get().includes(id)) {
        remove(id);
        return false;
      }
      return add(id) ? true : null;
    },
    set: (next) => compareStore.set(next),
    clear: () => compareStore.set([]),
  };
}

/** The compare tray (persists across navigation and reloads). */
export function useCompareTray(): CompareTray {
  const ids = useStore(compareStore);
  return useMemo(() => trayApi(ids), [ids]);
}

export const parseIdList = (s: string | null | undefined): string[] =>
  s ? [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))] : [];

/** Link to the comparison page for a selection. */
export const compareHref = (ids: string[]) => (ids.length ? `/compare?compare=${ids.map(encodeURIComponent).join(',')}` : '/compare');

/**
 * Compare selection for shareable pages (e.g. /compare). The URL param wins
 * when present (and updates the tray); otherwise the tray is written into the
 * URL so the page can be shared. Pass validIds to drop unknown ids.
 */
export function useCompareSelection(param = 'compare', validIds?: Set<string>): CompareTray {
  const [params, update] = useUrlState();
  const trayIds = useStore(compareStore);
  const fromUrl = params.has(param);
  const urlKey = params.get(param) ?? '';
  const ids = useMemo(() => {
    const list = fromUrl ? parseIdList(urlKey) : trayIds;
    return list.filter((id) => !validIds || validIds.has(id)).slice(0, COMPARE_MAX);
  }, [fromUrl, urlKey, trayIds, validIds]);

  useEffect(() => {
    if (fromUrl) {
      if (!sameList(ids, compareStore.get())) compareStore.set(ids);
    } else if (trayIds.length) update({ [param]: trayIds }, { replace: true });
  }, [fromUrl, ids, trayIds, param, update]);

  return useMemo(() => {
    const base = trayApi(ids);
    const write = (next: string[]) => {
      const n = [...new Set(next)].slice(0, COMPARE_MAX);
      compareStore.set(n);
      update({ [param]: n.length ? n : null });
    };
    return {
      ...base,
      add: (id) => {
        if (ids.includes(id) || ids.length >= COMPARE_MAX) return false;
        write([...ids, id]);
        return true;
      },
      remove: (id) => write(ids.filter((x) => x !== id)),
      toggle: (id) => {
        if (ids.includes(id)) {
          write(ids.filter((x) => x !== id));
          return false;
        }
        if (ids.length >= COMPARE_MAX) return null;
        write([...ids, id]);
        return true;
      },
      set: write,
      clear: () => write([]),
    };
  }, [ids, param, update]);
}

// ------------------------------------------------------------------ URL state

export type ParamValue = string | number | boolean | null | undefined | readonly string[];
export type ParamPatch = Record<string, ParamValue>;

/** Serialise search params keeping commas literal (?compare=a,b,c). */
export function serializeParams(p: URLSearchParams): string {
  const s = p.toString().replace(/%2C/gi, ',');
  return s ? `?${s}` : '';
}

/**
 * Current search params plus a batched updater. `update({ metric: 'x', noc: null })`
 * sets/deletes several keys in one history entry (push by default; pass
 * { replace: true } for transient changes).
 */
export function useUrlState(): [URLSearchParams, (patch: ParamPatch, opts?: { replace?: boolean }) => void] {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const update = useCallback(
    (patch: ParamPatch, opts?: { replace?: boolean }) => {
      const next = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)) next.delete(k);
        else next.set(k, Array.isArray(v) ? v.join(',') : String(v));
      }
      const search = serializeParams(next);
      const current = typeof window !== 'undefined' ? window.location.search : '';
      if (search === current || (search === '' && current === '?')) return;
      navigate({ pathname, search, hash }, { replace: opts?.replace, preventScrollReset: true });
    },
    [navigate, pathname, hash],
  );
  return [params, update];
}

/** One search param as state. Setting the default (or null) removes it from the URL. */
export function useSearchParamState(key: string, defaultValue: string | null = null): [string | null, (v: string | null, opts?: { replace?: boolean }) => void] {
  const [params, update] = useUrlState();
  const value = params.get(key) ?? defaultValue;
  const set = useCallback(
    (v: string | null, opts?: { replace?: boolean }) => update({ [key]: v === defaultValue ? null : v }, opts),
    [key, defaultValue, update],
  );
  return [value, set];
}

/** A comma-separated id list param (e.g. ?highlight=a,b,c). */
export function useListParam(key: string): [string[], (ids: string[], opts?: { replace?: boolean }) => void] {
  const [params, update] = useUrlState();
  const raw = params.get(key);
  const ids = useMemo(() => parseIdList(raw), [raw]);
  const set = useCallback((next: string[], opts?: { replace?: boolean }) => update({ [key]: next.length ? next : null }, opts), [key, update]);
  return [ids, set];
}
