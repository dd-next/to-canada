import { PRODUCT } from '../config';

const cache = new Map<string, Promise<unknown>>();

/** Fetch a JSON snapshot from public/data once per session. */
export function loadJSON<T>(path: string): Promise<T> {
  const url = PRODUCT.dataBase + path;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p as Promise<T>;
}
