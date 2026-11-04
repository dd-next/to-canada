/** Insight index entries, topic metadata and links from findings to the explorer. */
import { useEffect, useMemo, useState } from 'react';
import type { Finding, Insight, InsightTopic } from '../../types/contract';
import { loadJSON } from '../../data/api';
import { unitTypeSlug } from '../../lib/layers';
import { compareHref, serializeParams } from '../../lib/state';

/** One row of public/data/insights/index.json (lead: candidate for the contract). */
export interface InsightSummary {
  id: string;
  topic: InsightTopic;
  title: string;
  question: string;
  dek: string;
  relatedPlaceIds: string[];
  sourceIds: string[];
  leadStat?: Finding['stat'];
  leadHeadline?: string;
}

export const INDEX_PATH = 'insights/index.json';
export const insightPath = (id: string) => `insights/${encodeURIComponent(id)}.json`;

export const TOPIC_LABELS: Record<InsightTopic, string> = {
  housing: 'Housing',
  budget: 'Budget',
  work: 'Work',
  immigrant_income: 'Immigrant income',
  settlement: 'Settlement',
  language_life: 'Language & life',
  climate: 'Climate',
};

/** Index sections: the order a newcomer meets these questions. */
export const TOPIC_GROUPS: { id: string; label: string; dek: string; topics: InsightTopic[] }[] = [
  { id: 'money', label: 'Home & money', dek: 'What a first lease costs and how long savings last.', topics: ['housing', 'budget'] },
  { id: 'work', label: 'Work & pay', dek: 'Wages of people already in the job, and how tight local job markets are.', topics: ['work'] },
  { id: 'settling', label: 'Settling in', dek: 'Where new permanent residents go, who stays, and how incomes develop.', topics: ['settlement', 'immigrant_income'] },
  { id: 'life', label: 'Everyday life', dek: 'Language, commuting, households and weather.', topics: ['language_life', 'climate'] },
];

/** Order insights by topic group (then by their order in the index). */
export function orderInsights<T extends { topic: InsightTopic }>(items: T[]): T[] {
  const rank = (t: InsightTopic) => {
    let i = 0;
    for (const g of TOPIC_GROUPS) for (const topic of g.topics) {
      if (topic === t) return i;
      i++;
    }
    return 99;
  };
  return items.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x.topic) - rank(b.x.topic) || a.i - b.i).map((e) => e.x);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * Period text for stats: a plain token ('2025-Q4', '2016-2023') is left for
 * formatPeriod; a descriptive one ('2025-Q4 vs Oct 2025') keeps every part,
 * with each token made readable ('Q4 2025 vs Oct 2025').
 */
export function periodText(p: string): string {
  const t = p.trim();
  if (/^[\dQ/-]+$/.test(t)) return t;
  return t
    .replace(/\b(\d{4})-Q([1-4])\b/g, 'Q$2 $1')
    .replace(/\b(\d{4})-(0[1-9]|1[0-2])\b/g, (_, y: string, m: string) => `${MON[Number(m) - 1]} ${y}`);
}

/** "/?metric=…&<mapParams>&highlight=a,b&from=<headline>" — omits metric when the finding has none. */
export function showOnMapHref(f: Pick<Finding, 'metricId' | 'mapParams' | 'placeIds' | 'headline'>): string {
  const p = new URLSearchParams();
  if (f.metricId) p.set('metric', f.metricId);
  for (const [k, v] of Object.entries(f.mapParams ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    // The explorer reads unit types as slugs (1br, 2br…); accept labels such as "1 bedroom" too.
    p.set(k, k === 'unit' ? unitTypeSlug(String(v)) : String(v));
  }
  if (f.placeIds.length) p.set('highlight', f.placeIds.join(','));
  p.set('from', f.headline.length > 160 ? `${f.headline.slice(0, 157)}…` : f.headline);
  return `/${serializeParams(p)}`;
}

/** "/compare?compare=a,b,c" for findings about two or more places (first three). */
export const compareTheseHref = (placeIds: string[]) => (placeIds.length >= 2 ? compareHref(placeIds.slice(0, 3)) : null);

export interface LoadedInsights {
  insights: Insight[];
  loading: boolean;
  errors: { id: string; error: Error }[];
}

/** Load several insight files (cached by loadJSON). */
export function useInsightFiles(ids: string[] | null): LoadedInsights {
  const key = ids ? ids.join('|') : null;
  const [state, setState] = useState<LoadedInsights>({ insights: [], loading: key !== null, errors: [] });
  useEffect(() => {
    if (key === null) {
      setState({ insights: [], loading: false, errors: [] });
      return;
    }
    let alive = true;
    const list = key ? key.split('|') : [];
    setState((s) => ({ ...s, loading: true }));
    Promise.allSettled(list.map((id) => loadJSON<Insight>(insightPath(id)))).then((res) => {
      if (!alive) return;
      const insights: Insight[] = [];
      const errors: { id: string; error: Error }[] = [];
      res.forEach((r, i) => (r.status === 'fulfilled' ? insights.push(r.value) : errors.push({ id: list[i], error: r.reason as Error })));
      setState({ insights, loading: false, errors });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => state, [state]);
}
