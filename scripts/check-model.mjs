// Targeted arithmetic checks for src/model (budget + pay). Run: node scripts/check-model.mjs
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const out = mkdtempSync(join(tmpdir(), 'nw-model-'));
for (const f of ['budget', 'pay'])
  buildSync({ entryPoints: [`src/model/${f}.ts`], outfile: join(out, `${f}.mjs`), format: 'esm', platform: 'node', logLevel: 'error' });
const { computeBudget, mbmScale, mbmMonthly } = await import(join(out, 'budget.mjs'));
const { grossMonthly, rentShareOfPay } = await import(join(out, 'pay.mjs'));
const L = (id, amount, origin = 'user') => ({ id, label: id, amount, origin });
let n = 0; const ok = (name) => { n++; console.log('ok', name); };

// 1. Typical deficit: income 3000, spending 1800 rent + 700 food + 300 other = 2800 → balance +200 (not drawn)
let r = computeBudget({ takeHomeMonthly: 3000, savings: 12000, recurring: [L('rent', 1800, 'sourced'), L('food', 700, 'estimate'), L('other', 300)], oneTime: [L('flights', 2000)] });
assert.equal(r.monthlySpending, 2800); assert.equal(r.monthlyBalance, 200); assert.equal(r.oneTimeTotal, 2000);
assert.equal(r.savingsAfterArrival, 10000); assert.deepEqual(r.runwayWithIncome, { kind: 'not_drawn' });
assert.equal(r.runwayNoIncome.kind, 'months'); assert.ok(Math.abs(r.runwayNoIncome.months - 10000 / 2800) < 1e-9); ok('surplus + no-income runway');

// 2. Deficit with income: income 2000 → draw 800/month → 12.5 months
r = computeBudget({ takeHomeMonthly: 2000, savings: 12000, recurring: [L('rent', 1800), L('food', 700), L('other', 300)], oneTime: [L('flights', 2000)] });
assert.equal(r.monthlyBalance, -800); assert.equal(r.runwayWithIncome.kind, 'months'); assert.equal(r.runwayWithIncome.months, 12.5); ok('deficit runway');

// 3. Zero spending → savings never drawn, no division by zero
r = computeBudget({ takeHomeMonthly: null, savings: 5000, recurring: [L('rent', 0)], oneTime: [] });
assert.equal(r.monthlySpending, 0); assert.deepEqual(r.runwayNoIncome, { kind: 'not_drawn' }); assert.equal(r.runwayWithIncome.kind, 'unknown'); ok('zero spending');

// 4. Missing rent → runway unknown (not computed as if rent were $0)
r = computeBudget({ takeHomeMonthly: 3000, savings: 10000, recurring: [L('rent', null), L('food', 600)], oneTime: [] });
assert.equal(r.runwayNoIncome.kind, 'unknown'); assert.deepEqual(r.missingRecurring, ['rent']); ok('missing rent blocks runway');

// 5. Missing savings → unknown; one-time costs above savings → exhausted
assert.equal(computeBudget({ takeHomeMonthly: 1000, savings: null, recurring: [L('rent', 900)], oneTime: [] }).runwayNoIncome.kind, 'unknown');
assert.equal(computeBudget({ takeHomeMonthly: 0, savings: 1000, recurring: [L('rent', 900)], oneTime: [L('deposit', 1500)] }).runwayNoIncome.kind, 'exhausted');
ok('missing savings / exhausted');

// 6. Negative or NaN inputs are clamped/ignored, never negative spending
r = computeBudget({ takeHomeMonthly: -500, savings: NaN, recurring: [L('rent', -100), L('food', 200)], oneTime: [] });
assert.equal(r.monthlySpending, 200); assert.equal(r.monthlyBalance, -200); assert.equal(r.savingsAfterArrival, null); ok('clamping');

// 7. MBM square-root scale reproduces the published 2025 family-of-4 → 1/2/3/5 values (Agent A check)
assert.equal(Math.round(mbmScale(62880, 1)), 31440); assert.equal(Math.round(mbmScale(62880, 2)), 44463);
assert.equal(Math.round(mbmScale(62880, 3)), 54456); assert.equal(Math.round(mbmScale(62880, 5)), 70302);
assert.equal(mbmMonthly(null, 2), null); ok('MBM equivalence scale');

// 8. Pay: $30/h × 37.5 × 52 / 12 = $4,875/month; annual cell 60,000 → 5,000; rent share
assert.equal(grossMonthly(30, false), 4875); assert.equal(grossMonthly(60000, true), 5000); assert.equal(grossMonthly(null, false), null);
assert.equal(rentShareOfPay(1500, 5000), 0.3); assert.equal(rentShareOfPay(null, 5000), null); assert.equal(rentShareOfPay(1500, null), null); ok('pay conversions');
console.log(`${n} model checks passed`);
