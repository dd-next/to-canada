/**
 * Arrival-budget model (pure functions, no UI).
 *
 * Every line carries its provenance so the interface can label it:
 *   sourced  – an official observation used as-is (e.g. StatCan asking rent)
 *   estimate – derived from an official benchmark with an explicit assumption
 *              (e.g. MBM basket component scaled to household size)
 *   user     – typed by the user
 *
 * Money is CAD. Monthly figures are per month; one-time costs are separate and
 * reduce the savings available before the monthly runway starts.
 */

export type Origin = 'sourced' | 'estimate' | 'user';

export interface BudgetLine {
  id: string;
  label: string;
  /** CAD per month (recurring) or CAD (one-time). null = not entered / unavailable. */
  amount: number | null;
  origin: Origin;
  /** Short explanation shown beside the line (assumption, source, period). */
  note?: string;
  sourceId?: string;
  period?: string;
}

export interface BudgetInputs {
  /** Household take-home (net) income per month. null = not entered. */
  takeHomeMonthly: number | null;
  /** Savings available on arrival. null = not entered. */
  savings: number | null;
  /** Monthly recurring costs, including the rent line (id 'rent'). */
  recurring: BudgetLine[];
  /** One-time arrival costs. */
  oneTime: BudgetLine[];
}

export type Runway =
  | { kind: 'months'; months: number }   // savings last this many months
  | { kind: 'not_drawn' }                // monthly balance >= 0: savings are not drawn down
  | { kind: 'exhausted' }                // one-time costs already use all savings
  | { kind: 'unknown'; missing: string[] };

export interface BudgetResult {
  /** Sum of entered recurring lines (null lines count as missing, not zero). */
  monthlySpending: number;
  /** Recurring lines with no amount — the total is incomplete while this is non-empty. */
  missingRecurring: string[];
  oneTimeTotal: number;
  /** Savings left after one-time costs (may be negative). null if savings not entered. */
  savingsAfterArrival: number | null;
  /** takeHomeMonthly − monthlySpending. null if income not entered. */
  monthlyBalance: number | null;
  /** Runway using the entered income (only drawn down when balance < 0). */
  runwayWithIncome: Runway;
  /** Runway with no income at all (e.g. while job searching). */
  runwayNoIncome: Runway;
  breakdown: { id: string; label: string; amount: number; share: number; origin: Origin }[];
}

const clean = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.max(0, v);

function runway(savingsAfter: number | null, monthlyDraw: number, missing: string[]): Runway {
  if (savingsAfter === null) return { kind: 'unknown', missing: ['savings', ...missing] };
  if (missing.length) return { kind: 'unknown', missing };
  if (monthlyDraw <= 0) return { kind: 'not_drawn' };
  if (savingsAfter <= 0) return { kind: 'exhausted' };
  return { kind: 'months', months: savingsAfter / monthlyDraw };
}

export function computeBudget(inputs: BudgetInputs): BudgetResult {
  const income = clean(inputs.takeHomeMonthly);
  const savings = clean(inputs.savings);
  const missingRecurring = inputs.recurring.filter((l) => clean(l.amount) === null).map((l) => l.label);
  const monthlySpending = inputs.recurring.reduce((s, l) => s + (clean(l.amount) ?? 0), 0);
  const oneTimeTotal = inputs.oneTime.reduce((s, l) => s + (clean(l.amount) ?? 0), 0);
  const savingsAfterArrival = savings === null ? null : savings - oneTimeTotal;
  const monthlyBalance = income === null ? null : income - monthlySpending;

  // A missing rent makes every runway unknown; other missing lines are reported
  // as incomplete but do not block the calculation (they are treated as not entered).
  const rentLine = inputs.recurring.find((l) => l.id === 'rent');
  const rentMissing = rentLine && clean(rentLine.amount) === null ? [rentLine.label] : [];
  const runwayNoIncome = runway(savingsAfterArrival, monthlySpending, rentMissing);
  const runwayWithIncome =
    income === null
      ? { kind: 'unknown' as const, missing: ['take-home income'] }
      : runway(savingsAfterArrival, monthlySpending - income, rentMissing);

  const total = monthlySpending || 1;
  const breakdown = inputs.recurring
    .filter((l) => (clean(l.amount) ?? 0) > 0)
    .map((l) => ({ id: l.id, label: l.label, amount: clean(l.amount)!, share: clean(l.amount)! / total, origin: l.origin }))
    .sort((a, b) => b.amount - a.amount);

  return {
    monthlySpending,
    missingRecurring,
    oneTimeTotal,
    savingsAfterArrival,
    monthlyBalance,
    runwayWithIncome,
    runwayNoIncome,
    breakdown,
  };
}

/** Square-root equivalence scale from the source's reference household.
 * Most baskets use four people; the Nunavut methodology uses five.
 */
export function mbmScale(annualReference: number, householdSize: number, referenceHouseholdSize = 4): number {
  if (!Number.isFinite(referenceHouseholdSize) || referenceHouseholdSize <= 0) throw new Error('Invalid MBM reference household size');
  const n = Math.max(1, Math.round(householdSize));
  return annualReference * Math.sqrt(n / referenceHouseholdSize);
}

export function mbmMonthly(annualReference: number | null, householdSize: number, referenceHouseholdSize = 4): number | null {
  return annualReference === null ? null : mbmScale(annualReference, householdSize, referenceHouseholdSize) / 12;
}
