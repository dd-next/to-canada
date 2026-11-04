import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DataManifest, MetricDef, Observation, Place, SourceRecord } from '../types/contract';
import { loadJSON } from './api';

/** The small core bundle every page needs. Larger files (wages, series, insights,
 * programs, geometry) are loaded on demand with useJSON(). */
export interface CoreData {
  manifest: DataManifest;
  places: Place[];
  metrics: MetricDef[];
  observations: Observation[];
  sources: SourceRecord[];
  placeById: Map<string, Place>;
  metricById: Map<string, MetricDef>;
  sourceById: Map<string, SourceRecord>;
  /** obsIndex.get(placeId)?.get(metricId) -> latest observation */
  obsIndex: Map<string, Map<string, Observation>>;
  /** byMetric.get(metricId) -> observations across places */
  byMetric: Map<string, Observation[]>;
}

type CoreState = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: CoreData };

const CoreContext = createContext<CoreState>({ status: 'loading' });

export function index(
  manifest: DataManifest,
  places: Place[],
  metrics: MetricDef[],
  observations: Observation[],
  sources: SourceRecord[],
): CoreData {
  const obsIndex = new Map<string, Map<string, Observation>>();
  const byMetric = new Map<string, Observation[]>();
  for (const o of observations) {
    let m = obsIndex.get(o.placeId);
    if (!m) obsIndex.set(o.placeId, (m = new Map()));
    const prev = m.get(o.metricId);
    // Keep the latest period when a metric has several observations per place.
    if (!prev || o.period > prev.period) m.set(o.metricId, o);
  }
  for (const m of obsIndex.values())
    for (const o of m.values()) {
      const arr = byMetric.get(o.metricId) ?? [];
      arr.push(o);
      byMetric.set(o.metricId, arr);
    }
  return {
    manifest,
    places,
    metrics,
    observations,
    sources,
    placeById: new Map(places.map((p) => [p.id, p])),
    metricById: new Map(metrics.map((m) => [m.id, m])),
    sourceById: new Map(sources.map((s) => [s.id, s])),
    obsIndex,
    byMetric,
  };
}

export function CoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CoreState>({ status: 'loading' });
  useEffect(() => {
    Promise.all([
      loadJSON<DataManifest>('manifest.json'),
      loadJSON<Place[]>('places.json'),
      loadJSON<MetricDef[]>('metrics.json'),
      loadJSON<Observation[]>('observations.json'),
      loadJSON<SourceRecord[]>('sources.json'),
    ]).then(
      ([manifest, places, metrics, observations, sources]) =>
        setState({ status: 'ready', data: index(manifest, places, metrics, observations, sources) }),
      (error: Error) => setState({ status: 'error', error }),
    );
  }, []);
  const value = useMemo(() => state, [state]);
  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>;
}

export function useCoreState(): CoreState {
  return useContext(CoreContext);
}

/** Use inside components rendered only when core data is ready. */
export function useCore(): CoreData {
  const s = useContext(CoreContext);
  if (s.status !== 'ready') throw new Error('useCore() called before core data loaded');
  return s.data;
}
