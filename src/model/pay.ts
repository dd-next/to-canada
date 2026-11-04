/**
 * Pay conversions used by the profession lens. Job Bank wages are GROSS wages
 * of employed workers (not advertised pay, not take-home). Converting hourly to
 * monthly needs an hours assumption, which the interface must display.
 */

/** Full-time assumption used across the product (visible wherever it is applied). */
export const FULL_TIME_HOURS_PER_WEEK = 37.5;
export const WEEKS_PER_YEAR = 52;

/** Gross monthly pay from a Job Bank cell. isAnnual = the cell is published as an annual wage. */
export function grossMonthly(value: number | null, isAnnual: boolean, hoursPerWeek = FULL_TIME_HOURS_PER_WEEK): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return isAnnual ? value / 12 : (value * hoursPerWeek * WEEKS_PER_YEAR) / 12;
}

/** Gross annual pay from a Job Bank cell. */
export function grossAnnual(value: number | null, isAnnual: boolean, hoursPerWeek = FULL_TIME_HOURS_PER_WEEK): number | null {
  const m = grossMonthly(value, isAnnual, hoursPerWeek);
  return m === null ? null : m * 12;
}

/** Asking rent as a share of gross monthly pay (0.32 = 32%). null when either input is missing. */
export function rentShareOfPay(monthlyRent: number | null, grossMonthlyPay: number | null): number | null {
  if (monthlyRent === null || grossMonthlyPay === null || grossMonthlyPay <= 0) return null;
  return monthlyRent / grossMonthlyPay;
}
