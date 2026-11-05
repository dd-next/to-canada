// Focused regressions: share links, provenance, city comparability and MBM basis.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

const out = mkdtempSync(join(tmpdir(), 'nw-scenarios-'));
let checks = 0;
const ok = (name) => { checks++; console.log('ok', name); };
try {
  buildSync({ stdin: { contents: `
    export * from './src/components/budget/scenario';
    export * from './src/lib/layers';
    export * from './src/lib/navigation';
    export * from './src/components/compare/measures';
    export { mbmScale, mbmMonthly } from './src/model/budget';
  `, resolveDir: process.cwd(), loader: 'ts' }, outfile: join(out, 'checks.mjs'),
  bundle: true, format: 'esm', platform: 'node', define: { 'import.meta.env': '{}' }, logLevel: 'error' });
  const { DEFAULT_SCENARIO, encodeScenario, decodeScenario, hasSharedNumbers, mbmInfo,
    mbmScale, buildMetricLayer, buildWageLayer, buildRentShareLayer, bestWorst, withNavigationContext } = await import(join(out, 'checks.mjs'));
  const recipient = { ...DEFAULT_SCENARIO, income: 9000, savings: 100000, noc: '21231',
    rent: { key: 'toronto|1 bedroom', value: 999 }, mbm: { food: 700 }, user: { childcare: 2000 }, oneTime: { travel: 4000 } };
  const sender = { ...DEFAULT_SCENARIO, placeId: 'toronto', household: 2, unit: '2 bedroom', noc: '31301' };
  const shared = encodeScenario(sender);
  assert.equal(shared.get('scenario'), '1');
  assert.deepEqual(decodeScenario(shared, recipient), sender);
  assert.deepEqual(decodeScenario(shared, DEFAULT_SCENARIO), sender);
  ok('complete shared scenario is independent of recipient localStorage');

  const legacy = new URLSearchParams('place=toronto&hh=2&unit=2br&income=3000');
  const decodedLegacy = decodeScenario(legacy, recipient);
  assert.deepEqual(decodedLegacy.user, {});
  assert.deepEqual(decodedLegacy.mbm, {});
  assert.deepEqual(decodedLegacy.oneTime, {});
  assert.equal(decodedLegacy.savings, null);
  assert.equal(decodedLegacy.rent, null);
  assert.equal(decodedLegacy.income, 3000);
  ok('legacy complete links reset omitted expenses and missing amounts');

  const navigation = new URLSearchParams('place=vancouver&noc=31301&unit=studio');
  assert.equal(hasSharedNumbers(navigation), false);
  const navScenario = decodeScenario(navigation, recipient);
  assert.deepEqual(navScenario.user, recipient.user);
  assert.equal(navScenario.noc, '31301');
  assert.equal(navScenario.unit, 'Studio');
  assert.match(withNavigationContext('/compare?compare=toronto,vancouver', navigation), /noc=31301/);
  assert.match(withNavigationContext('/budget?place=toronto', navigation), /unit=studio/);
  assert.doesNotMatch(withNavigationContext('/compare', navigation), /income|savings/);
  ok('ordinary navigation preserves public context without importing a complete scenario');

  const places = JSON.parse(readFileSync('public/data/places.json', 'utf8'));
  const chosen = ['toronto', 'vancouver', 'calgary', 'whitehorse'].map((id) => places.find((p) => p.id === id));
  const metric = { id: 'test_unemployment', label: 'Unemployment', unit: 'percent', higherIs: 'worse', sourceIds: ['statcan-test'], basis: 'seasonally adjusted', periodType: 'month' };
  const observations = chosen.map((p, i) => ({ placeId: p.id, metricId: metric.id, value: i + 4, period: '2026-09',
    geo: p.id === 'whitehorse' ? p.geo.province : p.geo.cma, sourceId: 'statcan-test', flags: p.id === 'whitehorse' ? ['provincial_value'] : [] }));
  const index = () => new Map(observations.map((o) => [o.placeId, new Map([[metric.id, o]])]));
  let layer = buildMetricLayer(metric, chosen, index());
  assert.equal(layer.data.get('whitehorse').shown, 7);
  assert.equal(layer.data.get('whitehorse').value, null);
  assert.equal(layer.counts.ranked, 3);
  assert.equal(bestWorst('worse', [layer.data.get('toronto'), layer.data.get('whitehorse')]).best.size, 0);
  ok('territory context stays visible and never participates in city ranking');

  observations[2].period = '2025-09';
  layer = buildMetricLayer(metric, chosen, index());
  assert.equal(layer.data.get('calgary').status, 'other_period');
  assert.equal(layer.data.get('calgary').value, null);
  assert.equal(layer.counts.ranked, 2);
  observations[2].period = '2026-09';
  observations[2].methodology = 'Different survey';
  layer = buildMetricLayer(metric, chosen, index());
  assert.equal(layer.data.get('calgary').status, 'not_comparable');
  ok('reference periods and methodologies use separate ranking cohorts');

  const wageTable = { sourceId: 'jobbank', referencePeriod: 'Edition, not a cell period', geos: {}, byNoc: { '31301': {} }, metadata: { '31301': {} } };
  for (const [i, place] of chosen.slice(0, 3).entries()) {
    const geo = place.geo.economicRegions[0];
    wageTable.geos[geo.id] = geo;
    wageTable.byNoc['31301'][geo.id] = [20, i === 2 ? 60000 : 30, 40, i === 2 ? 1 : 0];
    wageTable.metadata['31301'][geo.id] = { referencePeriod: ['2021', '2023-2024', '2024'][i], methodology: 'Published source methodology' };
  }
  const wage = buildWageLayer(wageTable, { noc: '31301', title: 'Registered nurses' }, chosen);
  assert.equal(wage.data.get('toronto').period, '2021');
  assert.equal(wage.data.get('vancouver').period, '2023-2024');
  assert.equal(wage.data.get('calgary').shownUnit, 'CAD_year');
  assert.equal(wage.data.get('toronto').shownUnit, 'CAD_hour');
  assert.equal(wage.counts.ranked, 0);
  assert.equal(buildRentShareLayer(layer, wage, { noc: '31301', title: 'Registered nurses' }, chosen).counts.ranked, 0);
  delete wageTable.metadata;
  assert.equal(buildWageLayer(wageTable, { noc: '31301', title: 'Registered nurses' }, chosen).data.get('toronto').period, null);
  ok('individual wage periods and units survive; edition never substitutes missing metadata');

  assert.equal(mbmScale(60000, 5, 5), 60000);
  assert.equal(mbmScale(60000, 1, 4), 30000);
  assert.ok(Math.abs(mbmScale(60000, 1, 5) - 60000 / Math.sqrt(5)) < 1e-8);
  const iq = places.find((p) => p.id === 'iqaluit');
  const mbmObs = { value: 60000, period: '2025', referenceHouseholdSize: 5 };
  const core = { obsIndex: new Map([['iqaluit', new Map([['cost_mbm_food', mbmObs]])]]) };
  assert.equal(mbmInfo(core, iq, 5)[0].estimate, 5000);
  ok('Nunavut data reference household is applied in the actual budget adapter');
  console.log(`${checks} scenario/comparability checks passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
