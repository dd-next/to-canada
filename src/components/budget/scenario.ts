/**
 * The user's arrival-budget scenario: what they typed on the Budget page.
 *
 * Privacy: the scenario lives ONLY in this browser's localStorage (STORAGE.budget).
 * Personal amounts enter a URL only through explicit scenario sharing or
 * Compare's "Edit on Budget" action (see encodeScenario).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { STORAGE } from '../../config';
import type { Observation, Place } from '../../types/contract';
import { computeBudget, mbmMonthly, type BudgetInputs, type BudgetLine, type BudgetResult } from '../../model/budget';
import type { CoreData } from '../../data/core';
import { cleanGeoName, geoQualifier, missingReason } from '../../lib/format';
import { unitTypeSlug } from '../../lib/layers';

export const UNIT_TYPES = ['Studio', '1 bedroom', '2 bedroom', '3 bedroom+'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export const MAX_AMOUNT = 1_000_000_000;
export const MAX_HOUSEHOLD = 6;

/** MBM non-shelter components that seed the recurring lines (shelter is excluded: rent is entered separately). */
export const MBM_LINES = [
  { id: 'food', metricId: 'cost_mbm_food', label: 'Food', component: 'food' },
  { id: 'clothing', metricId: 'cost_mbm_clothing', label: 'Clothing and footwear', component: 'clothing' },
  { id: 'transport', metricId: 'cost_mbm_transport', label: 'Transportation', component: 'transportation' },
  { id: 'communication', metricId: 'cost_mbm_communication', label: 'Phone and internet', component: 'communication services' },
  { id: 'other', metricId: 'cost_mbm_other', label: 'Other necessities', component: 'other necessities' },
] as const;

export const USER_LINES = [
  { id: 'childcare', label: 'Childcare' },
  { id: 'debt', label: 'Debt payments' },
  { id: 'remittances', label: 'Money sent to family (remittances)' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'other_monthly', label: 'Other monthly costs' },
] as const;

export const ONE_TIME_LINES = [
  { id: 'travel', label: 'Travel to your new city', hint: 'Flights, moving or shipping your belongings.' },
  { id: 'temp_stay', label: 'Temporary accommodation', hint: 'Hotel or short-term rental before your lease starts.' },
  {
    id: 'deposit',
    label: 'Rent deposit',
    hint: 'Rules differ by province: some limit or prohibit deposits, others allow a damage deposit or last month’s rent. Check the tenancy rules where you are moving.',
  },
  { id: 'setup', label: 'Furniture and setup', hint: 'Bed, kitchen basics, winter clothing, phone plan activation.' },
  { id: 'fees', label: 'Fees', hint: 'Application, biometrics, credential assessment, licensing or medical exam fees you still have to pay.' },
  { id: 'other_once', label: 'Other one-time costs', hint: '' },
] as const;

export interface Scenario {
  placeId: string | null;
  household: number;
  unit: UnitType;
  /** Household take-home (net) income per month. */
  income: number | null;
  savings: number | null;
  noc: string | null;
  /** User-edited rent; only applies to the place and housing type it was typed for. */
  rent: { key: string; value: number } | null;
  /** User edits of MBM-seeded lines, by line id. Absent = use the estimate. */
  mbm: Record<string, number>;
  user: Record<string, number>;
  oneTime: Record<string, number>;
}

export const DEFAULT_SCENARIO: Scenario = {
  placeId: null,
  household: 1,
  unit: '1 bedroom',
  income: null,
  savings: null,
  noc: null,
  rent: null,
  mbm: {},
  user: {},
  oneTime: {},
};

export const rentKey = (placeId: string | null, unit: string) => `${placeId ?? ''}|${unit}`;

// ------------------------------------------------------------------ parsing

export type AmountParse = { value: number | null; error?: string };

/** Parse a typed amount ("$1,250.50"). Empty = no value (not an error). */
export function parseAmount(raw: string): AmountParse {
  const t = raw.replace(/[\s$,]/g, '');
  if (t === '') return { value: null };
  if (/^-/.test(t)) return { value: null, error: 'Amounts can’t be negative.' };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { value: null, error: 'Enter a number, for example 1,250.' };
  const v = Number(t);
  if (!Number.isFinite(v)) return { value: null, error: 'Enter a number, for example 1,250.' };
  if (v > MAX_AMOUNT) return { value: null, error: 'That number is too large (limit 1,000,000,000).' };
  return { value: Math.round(v * 100) / 100 };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_AMOUNT ? v : null);
const numRecord = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const n = num(x);
      if (n !== null && /^[a-z_]{1,24}$/.test(k)) out[k] = n;
    }
  return out;
};

export function sanitizeScenario(raw: unknown): Scenario {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCENARIO };
  const r = raw as Record<string, unknown>;
  const rent = r.rent as { key?: unknown; value?: unknown } | null | undefined;
  const rentVal = rent ? num(rent.value) : null;
  return {
    placeId: typeof r.placeId === 'string' && /^[a-z0-9-]{1,40}$/.test(r.placeId) ? r.placeId : null,
    household: Number.isInteger(r.household) && (r.household as number) >= 1 && (r.household as number) <= MAX_HOUSEHOLD ? (r.household as number) : 1,
    unit: (UNIT_TYPES as readonly unknown[]).includes(r.unit) ? (r.unit as UnitType) : '1 bedroom',
    income: num(r.income),
    savings: num(r.savings),
    noc: typeof r.noc === 'string' && /^\d{4,5}$/.test(r.noc) ? r.noc : null,
    rent: rent && typeof rent.key === 'string' && rentVal !== null ? { key: rent.key, value: rentVal } : null,
    mbm: numRecord(r.mbm),
    user: numRecord(r.user),
    oneTime: numRecord(r.oneTime),
  };
}

// ------------------------------------------------------------------ local store

function readStored(): Scenario {
  try {
    const raw = window.localStorage.getItem(STORAGE.budget);
    return raw ? sanitizeScenario(JSON.parse(raw)) : { ...DEFAULT_SCENARIO };
  } catch {
    return { ...DEFAULT_SCENARIO };
  }
}

let current: Scenario = typeof window === 'undefined' ? { ...DEFAULT_SCENARIO } : readStored();
const listeners = new Set<() => void>();
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE.budget) {
      current = readStored();
      listeners.forEach((l) => l());
    }
  });

export const scenarioStore = {
  get: () => current,
  set(next: Scenario) {
    current = next;
    try {
      window.localStorage.setItem(STORAGE.budget, JSON.stringify(next));
    } catch {
      /* storage unavailable: the scenario lives in memory for this visit */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** The stored scenario plus an updater (functional, so rapid typing never loses fields). */
export function useScenario(): [Scenario, (fn: (s: Scenario) => Scenario) => void] {
  const s = useSyncExternalStore(scenarioStore.subscribe, scenarioStore.get, scenarioStore.get);
  const update = useCallback((fn: (s: Scenario) => Scenario) => scenarioStore.set(fn(scenarioStore.get())), []);
  return [s, update];
}

// ------------------------------------------------------------------ share links

const SHARE_KEYS = ['scenario', 'hh', 'income', 'savings', 'rent'];
export const hasSharedNumbers = (p: URLSearchParams) => SHARE_KEYS.some((k) => p.has(k)) || [...p.keys()].some((k) => /^(m|u|o)_/.test(k));

/** Remove every personal-number key (used after a shared link has been read). */
export const stripSharedNumbers = (p: URLSearchParams) => {
  for (const k of [...p.keys()]) if (SHARE_KEYS.includes(k) || /^(m|u|o)_/.test(k)) p.delete(k);
};

/** Explicitly encode the scenario into URL search params (only used when the person asks to share). */
export function encodeScenario(s: Scenario, opts: { lines?: boolean } = { lines: true }): URLSearchParams {
  const p = new URLSearchParams();
  p.set('scenario', '1');
  if (s.placeId) p.set('place', s.placeId);
  p.set('hh', String(s.household));
  p.set('unit', unitTypeSlug(s.unit));
  if (s.income !== null) p.set('income', String(s.income));
  if (s.savings !== null) p.set('savings', String(s.savings));
  if (s.noc) p.set('noc', s.noc);
  if (opts.lines !== false) {
    if (s.rent && s.rent.key === rentKey(s.placeId, s.unit)) p.set('rent', String(s.rent.value));
    for (const [k, v] of Object.entries(s.mbm)) p.set(`m_${k}`, String(v));
    for (const [k, v] of Object.entries(s.user)) p.set(`u_${k}`, String(v));
    for (const [k, v] of Object.entries(s.oneTime)) p.set(`o_${k}`, String(v));
  }
  return p;
}

const slugToUnit = (slug: string | null): UnitType | null => UNIT_TYPES.find((u) => unitTypeSlug(u) === slug) ?? null;

/** Complete links (including legacy links carrying personal fields) start from
 * defaults. Ordinary place/unit/NOC navigation keeps this browser's scenario.
 */
export function decodeScenario(p: URLSearchParams, base: Scenario): Scenario {
  if (hasSharedNumbers(p)) base = DEFAULT_SCENARIO;
  const n = (k: string) => {
    const v = p.get(k);
    return v === null || v.trim() === '' ? null : num(Number(v));
  };
  const hh = Number(p.get('hh'));
  const unit = slugToUnit(p.get('unit')) ?? base.unit;
  const place = p.get('place') ?? base.placeId;
  const sub = (prefix: string) => {
    const out: Record<string, number> = {};
    for (const [k, v] of p.entries()) {
      if (!k.startsWith(prefix)) continue;
      const x = v.trim() === '' ? null : num(Number(v));
      if (x !== null) out[k.slice(prefix.length)] = x;
    }
    return out;
  };
  const rent = n('rent');
  return sanitizeScenario({
    ...base,
    placeId: place,
    household: Number.isInteger(hh) && hh >= 1 && hh <= MAX_HOUSEHOLD ? hh : base.household,
    unit,
    income: p.has('income') ? n('income') : base.income,
    savings: p.has('savings') ? n('savings') : base.savings,
    noc: p.get('noc') ?? base.noc,
    rent: rent !== null ? { key: rentKey(place, unit), value: rent } : base.rent,
    mbm: { ...base.mbm, ...sub('m_') },
    user: { ...base.user, ...sub('u_') },
    oneTime: { ...base.oneTime, ...sub('o_') },
  });
}

// ------------------------------------------------------------------ building the model inputs

export interface RentInfo {
  unit: UnitType;
  /** Asking rent observation, when one exists with a value. */
  sourced: Observation | null;
  /** Why there is no asking rent (when sourced is null). */
  missingWhy: string | null;
  /** CMHC average rent, offered as a labelled reference only. */
  reference: Observation | null;
  overridden: boolean;
  /** The rent actually used (sourced or the user's), or null if none. */
  value: number | null;
}

const hasValue = (o: Observation | undefined | null): o is Observation => !!o && o.value !== null && !(o.flags ?? []).includes('too_unreliable');

function familyObs(core: CoreData, placeId: string, family: string, unit: UnitType): Observation | null {
  const m = core.metrics.find((x) => x.dims?.family === family && x.dims?.unitType === unit);
  return m ? (core.obsIndex.get(placeId)?.get(m.id) ?? null) : null;
}

export function rentInfo(core: CoreData, place: Place | null, s: Scenario, useOverrides = true): RentInfo {
  const unit = s.unit;
  if (!place) return { unit, sourced: null, missingWhy: 'Choose a place to see its asking rent.', reference: null, overridden: false, value: null };
  const ask = familyObs(core, place.id, 'rent_asking', unit);
  const sourced = hasValue(ask) ? ask : null;
  const cmhc = familyObs(core, place.id, 'rent_cmhc_avg', unit);
  const ref = hasValue(cmhc) ? cmhc : null;
  const over = useOverrides && s.rent && s.rent.key === rentKey(place.id, unit) ? s.rent.value : null;
  const missingWhy = sourced
    ? null
    : ask
      ? missingReason(ask.flags, ask.note)
      : 'The snapshot has no asking-rent observation for this place and housing type.';
  return { unit, sourced, missingWhy, reference: ref, overridden: over !== null, value: over ?? sourced?.value ?? null };
}

export interface MbmInfo {
  id: string;
  label: string;
  obs: Observation | null;
  /** Estimated monthly amount for the household, or null when there is no MBM value. */
  estimate: number | null;
}

export function mbmInfo(core: CoreData, place: Place | null, household: number): MbmInfo[] {
  return MBM_LINES.map((l) => {
    const o = place ? (core.obsIndex.get(place.id)?.get(l.metricId) ?? null) : null;
    return { id: l.id, label: l.label, obs: o, estimate: hasValue(o) ? mbmMonthly(o.value, household, o.referenceHouseholdSize ?? (place?.province === 'NU' ? 5 : 4)) : null };
  });
}

export function mbmRegionName(infos: MbmInfo[]): string | null {
  const g = infos.find((i) => i.obs)?.obs?.geo;
  return g ? cleanGeoName(g.name) : null;
}

export function mbmAssumption(region: string | null, household: number, referenceSize: number, period?: string): string {
  return `MBM ${period ?? ''} basket for ${region ?? 'the place’s basket region'}, from a ${referenceSize}-person reference household, scaled to ${household} ${household === 1 ? 'person' : 'people'} with the square-root scale; MBM shelter excluded because rent is entered separately.`;
}

export interface ScenarioModel {
  inputs: BudgetInputs;
  result: BudgetResult;
  rent: RentInfo;
  mbm: MbmInfo[];
}

/** Turn a scenario into model inputs for one place. `useOverrides=false` = official-benchmark lines only (used by Compare). */
export function buildModel(core: CoreData, place: Place | null, s: Scenario, opts: { overrides?: boolean } = {}): ScenarioModel {
  const useOverrides = opts.overrides !== false;
  const rent = rentInfo(core, place, s, useOverrides);
  const mbm = mbmInfo(core, place, s.household);
  const recurring: BudgetLine[] = [];
  recurring.push({
    id: 'rent',
    label: 'Rent',
    amount: rent.value,
    origin: rent.overridden ? 'user' : 'sourced',
    sourceId: rent.sourced?.sourceId,
    period: rent.sourced?.period,
    note: rent.sourced ? `Average asking rent, ${rent.unit.toLowerCase()}` : undefined,
  });
  for (const m of mbm) {
    const over = useOverrides ? s.mbm[m.id] : undefined;
    recurring.push({
      id: m.id,
      label: m.label,
      amount: over ?? m.estimate,
      origin: over !== undefined ? 'user' : 'estimate',
      sourceId: m.obs?.sourceId,
      period: m.obs?.period,
    });
  }
  for (const u of USER_LINES) {
    const v = s.user[u.id];
    if (v !== undefined) recurring.push({ id: `user_${u.id}`, label: u.label, amount: v, origin: 'user' });
  }
  const oneTime: BudgetLine[] = ONE_TIME_LINES.flatMap((l) => (s.oneTime[l.id] !== undefined ? [{ id: l.id, label: l.label, amount: s.oneTime[l.id], origin: 'user' as const }] : []));
  const inputs: BudgetInputs = { takeHomeMonthly: s.income, savings: s.savings, recurring, oneTime };
  return { inputs, result: computeBudget(inputs), rent, mbm };
}

/** Qualifier for an observation's geography (adds the MBM basket region). */
export function obsQualifier(o: Observation | null | undefined): string | null {
  const q = geoQualifier(o);
  if (q) return q;
  if (o?.geo.level === 'mbm_region') return `Basket region: ${cleanGeoName(o.geo.name)}`;
  return null;
}
