import { useEffect, useState } from 'react';
import { loadJSON } from './api';

export interface Loadable<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

/** React hook around loadJSON. Pass null to skip loading. */
export function useJSON<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ loading: path !== null });
  useEffect(() => {
    if (path === null) {
      setState({ loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    loadJSON<T>(path).then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}
