import type { BudgetResult, Runway } from '../../model/budget';
import { formatCAD, formatNumber, formatPercent } from '../../lib/format';
import { OriginBadge } from './Provenance';

export const LINE_COLORS = ['#a63d2a', '#2d5f8b', '#2d6862', '#c8952c', '#7a5f93', '#8a6f5a', '#4f4f4f', '#b97b8a', '#5b8a5a', '#9a8c3a', '#3c7f9e'];

export function formatMonths(m: number): string {
  if (m >= 120) return 'more than 10 years';
  if (m >= 24) return `about ${formatNumber(m / 12, 1)} years`;
  return `${formatNumber(m, 1)} ${Math.abs(m - 1) < 0.05 ? 'month' : 'months'}`;
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Plain-language sentence for a runway. */
export function runwaySentence(r: Runway, kind: 'noIncome' | 'withIncome', ctx: { spending: number; income: number | null }): string {
  switch (r.kind) {
    case 'months':
      return kind === 'noIncome'
        ? `With no income, your savings after one-time costs would last ${formatMonths(r.months)}.`
        : `Your spending is ${formatCAD(ctx.spending - (ctx.income ?? 0))} a month more than your income, so your savings after one-time costs would last ${formatMonths(r.months)}.`;
    case 'not_drawn':
      return kind === 'noIncome'
        ? 'No monthly spending is entered, so savings are not drawn down.'
        : 'Your take-home income covers your monthly spending, so your savings are not drawn down.';
    case 'exhausted':
      return 'One-time costs use up all of your savings, so there is nothing left to cover monthly spending.';
    case 'unknown':
      return `Add ${list(r.missing.map((m) => m.toLowerCase()))} to see this.`;
  }
}

/** Short runway value for tables ("4.2 months", "Not drawn", "None"). */
export function runwayShort(r: Runway): string {
  switch (r.kind) {
    case 'months':
      return formatMonths(r.months);
    case 'not_drawn':
      return 'Savings not drawn';
    case 'exhausted':
      return 'No savings left';
    case 'unknown':
      return '—';
  }
}

interface Props {
  result: BudgetResult;
  income: number | null;
  savings: number | null;
  placeName: string | null;
  rentMissing: boolean;
}

function Big({ label, value, tone, hint }: { label: string; value: string; tone?: 'bad'; hint?: string }) {
  return (
    <div className={['bres__stat', tone === 'bad' && 'is-bad'].filter(Boolean).join(' ')}>
      <div className="label">{label}</div>
      <div className={['bres__num', 'num', value.length > 11 && 'is-long'].filter(Boolean).join(' ')}>{value}</div>
      {hint && <p className="bres__hint">{hint}</p>}
    </div>
  );
}

/** Live results. The summary region is aria-live so changes are announced as inputs change. */
export function BudgetResults({ result, income, savings, placeName, rentMissing }: Props) {
  const r = result;
  const nothing = r.monthlySpending === 0 && !rentMissing && r.breakdown.length === 0;
  const balance = rentMissing ? null : r.monthlyBalance;
  const shortfall = r.savingsAfterArrival !== null && r.savingsAfterArrival < 0;
  return (
    <div className="bres">
      <div className="bres__live" aria-live="polite" aria-atomic="false">
        <div className="bres__grid">
          <Big
            label="Monthly spending"
            value={rentMissing ? '—' : formatCAD(r.monthlySpending)}
            hint={rentMissing ? 'Enter a rent to complete the total.' : r.missingRecurring.length ? `Incomplete — no amount for ${list(r.missingRecurring.map((m) => m.toLowerCase()))}.` : nothing ? 'Nothing entered yet.' : undefined}
          />
          <Big
            label="Monthly balance"
            value={balance === null ? '—' : formatCAD(balance)}
            tone={balance !== null && balance < 0 ? 'bad' : undefined}
            hint={balance === null ? (rentMissing ? 'Needs a rent so spending is complete.' : 'Enter your take-home income to see income minus spending.') : balance < 0 ? 'Spending is higher than income.' : 'Income minus spending.'}
          />
          <Big label="One-time arrival costs" value={formatCAD(r.oneTimeTotal)} hint={r.oneTimeTotal === 0 ? 'None entered.' : undefined} />
          <Big
            label="Savings after arrival"
            value={r.savingsAfterArrival === null ? '—' : formatCAD(r.savingsAfterArrival)}
            tone={shortfall ? 'bad' : undefined}
            hint={
              savings === null
                ? 'Enter your savings on arrival.'
                : shortfall
                  ? `One-time costs are ${formatCAD(-r.savingsAfterArrival!)} more than your savings.`
                  : 'Savings minus one-time costs.'
            }
          />
        </div>
        <div className="bres__runways">
          <div className="bres__runway">
            <p className="label">Runway with no income</p>
            <p className="bres__sentence">{runwaySentence(r.runwayNoIncome, 'noIncome', { spending: r.monthlySpending, income })}</p>
            <p className="bres__note">A job-search scenario: nothing earned, spending as entered.</p>
          </div>
          <div className="bres__runway">
            <p className="label">Runway with your income</p>
            <p className="bres__sentence">{runwaySentence(r.runwayWithIncome, 'withIncome', { spending: r.monthlySpending, income })}</p>
          </div>
        </div>
      </div>

      <section className="bres__breakdown" aria-label="Where the monthly money goes">
        <h3 className="label">Where each month goes{placeName ? ` in ${placeName}` : ''}</h3>
        {r.breakdown.length === 0 ? (
          <p className="bres__empty">Monthly lines will appear here as you enter them.</p>
        ) : (
          <>
            <div className="bbar" role="img" aria-label={`Monthly spending of ${formatCAD(r.monthlySpending)}: ${r.breakdown.slice(0, 4).map((b) => `${b.label} ${formatPercent(b.share * 100, 0)}`).join(', ')}${r.breakdown.length > 4 ? ' and others' : ''}`}>
              {r.breakdown.map((b, i) => (
                <span key={b.id} className="bbar__seg" style={{ width: `${Math.max(b.share * 100, 0.4)}%`, background: LINE_COLORS[i % LINE_COLORS.length] }} title={`${b.label}: ${formatCAD(b.amount)}`} />
              ))}
            </div>
            <table className="data-table bbar__table">
              <caption className="sr-only">Monthly spending by line</caption>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col" className="n">
                    Per month
                  </th>
                  <th scope="col" className="n">
                    Share
                  </th>
                  <th scope="col">Basis</th>
                </tr>
              </thead>
              <tbody>
                {r.breakdown.map((b, i) => (
                  <tr key={b.id}>
                    <th scope="row">
                      <span className="bbar__sw" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} aria-hidden="true" />
                      {b.label}
                    </th>
                    <td className="n">{formatCAD(b.amount)}</td>
                    <td className="n">{formatPercent(b.share * 100, 0)}</td>
                    <td>
                      <OriginBadge origin={b.origin} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{rentMissing ? 'Total without rent' : 'Total'}</th>
                  <td className="n">{formatCAD(r.monthlySpending)}</td>
                  <td className="n">100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
