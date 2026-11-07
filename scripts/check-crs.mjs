// Offline checks against independently captured IRCC results and published tables.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

const out = mkdtempSync(join(tmpdir(), 'nw-crs-'));
let checks = 0;
const ok = (name) => { checks++; console.log('ok', name); };
try {
  buildSync({ stdin: { contents: `export * from './src/model/crs'; export * from './src/model/crs-language';`, resolveDir: process.cwd(), loader: 'ts' },
    outfile: join(out, 'crs.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
  const { assessCrs, emptyCrsAnswers, emptyLanguage, missingCrsAnswers, ABILITIES, BENCHMARKS, LANGUAGE_TESTS, EDUCATION, CRS_RULES } = await import(join(out, 'crs.mjs'));
  const reference = JSON.parse(readFileSync('dev/fixtures/crs/official-calculator.json', 'utf8'));
  const base = reference.base;
  const language = (test, level) => ({ test, scores: Object.fromEntries(ABILITIES.map((a, i) => [a, Array.isArray(level) ? level[i] : level])) });
  const score = (overrides = {}) => {
    const result = assessCrs({ ...base, ...overrides });
    assert.equal(result.status, 'complete', JSON.stringify(result));
    return result.score;
  };
  const partner = { maritalStatus: 'married', spouseCanadian: false, spouseAccompanying: true, spouseEducation: 'bachelors', spouseCanadianYears: 1, spouseLanguage: language('celpip', 9) };

  let matches = 0;
  for (const fixture of reference.cases) {
    const actual = score(fixture.overrides);
    assert.equal(actual.officialCalculatorTotal, fixture.official.total, `${fixture.name}: official comparator`);
    const expected = structuredClone(fixture.official);
    // Explicit, reviewed differences; never silently normalize arbitrary mismatches.
    if (fixture.name === 'TCF NCLC 4 discrepancy') {
      assert.equal(expected.core.firstLanguage, 0);
      expected.core.firstLanguage = 24; expected.core.total += 24; expected.total += 24;
      assert.equal(actual.calculatorDifferences.length, 1);
    } else if (fixture.name === 'French first with PTE discrepancy') {
      assert.equal(expected.additional.french, 25);
      expected.additional.french = 50; expected.additional.total += 25; expected.total += 25;
      assert.equal(actual.calculatorDifferences.length, 1);
    } else if (fixture.name === 'French first with PTE under nomination cap') {
      expected.additional.french = 50; // The 600-point additional cap preserves the total.
      assert.equal(actual.calculatorDifferences.length, 1);
    } else {
      assert.equal(actual.calculatorDifferences.length, 0, fixture.name);
      matches++;
    }
    for (const key of ['core', 'spouse', 'transferability', 'additional', 'total']) assert.deepEqual(actual[key], expected[key], `${fixture.name}: ${key}`);
  }
  ok(`${matches} complete breakdowns match the official calculator; 3 documented discrepancy cases match published criteria`);

  for (const [index, row] of reference.tables.q3_age.entries()) {
    const age = index === 0 ? 17 : index === 28 ? 45 : index + 17;
    assert.equal(score({ age }).core.age, Number(row[3]), `single age ${age}`);
    assert.equal(score({ ...partner, age }).core.age, Number(row[2]), `partner age ${age}`);
  }
  for (const [index, row] of reference.tables.q4_education.entries()) {
    const education = EDUCATION[index].value;
    assert.equal(score({ education }).core.education, Number(row[3]));
    assert.equal(score({ ...partner, education }).core.education, Number(row[2]));
  }
  ok('every age and education row matches the official source, on both spouse scales');

  const normalizeBand = (s) => s.replaceAll('–', '-').replace(/\s+/g, '');
  for (const test of Object.keys(LANGUAGE_TESTS)) {
    for (const row of reference.tables[test]) {
      const clb = Number(row[5]);
      const index = BENCHMARKS.indexOf(clb);
      assert.deepEqual(LANGUAGE_TESTS[test].bands[index].map(normalizeBand), row.slice(1, 5).map(normalizeBand), `${test} ${clb} raw score bands`);
      for (const accompanied of [false, true]) {
        const actual = score({ ...(accompanied ? partner : {}), firstLanguage: language(test, clb) });
        const firstPoints = test === 'tcf' && clb === 4 ? 6 : Number(row[accompanied ? 6 : 7]);
        assert.equal(actual.core.firstLanguage, firstPoints * 4, `${test} ${clb} first-language points`);
        const second = score({ ...(accompanied ? partner : {}), firstLanguage: language(LANGUAGE_TESTS[test].language === 'en' ? 'tef' : 'ielts', 9), secondLanguage: language(test, clb) });
        assert.equal(second.core.secondLanguage, Math.min(accompanied ? 22 : 24, Number(row[8]) * 4));
      }
      assert.equal(score({ ...partner, spouseLanguage: language(test, clb) }).spouse.language, Number(row[10]) * 4);
    }
  }
  ok('all 160 raw language bands and every first, second and spouse scoring band checked');

  assert.equal(score().total, 424);
  for (const fixture of reference.cases.filter((c) => c.name.startsWith('Maximum'))) assert.equal(score(fixture.overrides).total, CRS_RULES.maximum);
  assert.equal(score({ canadianYears: 0, highWageExperience: '2' }).core.labourMarket, 0);
  assert.equal(score({ canadianYears: 5, highWageExperience: '2', jobOffer: '2' }).core.labourMarket, 150);
  assert.equal(score({ ...partner, canadianYears: 5, highWageExperience: '2', jobOffer: '2' }).core.labourMarket, 140);
  const offered = score({ jobOffer: '2' });
  assert.equal(offered.core.labourMarket, 100);
  assert.equal(offered.transferability.educationWork, 0);
  assert.equal(offered.transferability.foreignCanadian, 0);
  assert.equal(offered.additional.total, 0);
  ok('1,270 maxima, LMI maximum rather than sum, and no invented experience or legacy job-offer bonus');

  for (const field of ['maritalStatus', 'spouseCanadian', 'spouseAccompanying']) {
    const changed = score({ ...partner, [field]: field === 'maritalStatus' ? 'single' : field === 'spouseCanadian' });
    assert.equal(changed.withSpouse, false);
    assert.equal(changed.total, score().total);
    assert.equal(changed.spouse.total, 0);
  }
  assert.equal(score({ ...partner, spouseLanguage: emptyLanguage('none') }).spouse.language, 0);
  assert.equal(score({ secondLanguage: { ...language('tcf', 10), test: 'none' } }).total, score().total);
  ok('inactive partner and language answers cannot leak points into the result');

  const blank = assessCrs(emptyCrsAnswers());
  assert.equal(blank.status, 'incomplete'); assert.ok(blank.missing.length > 0);
  for (const key of ['maritalStatus', 'age', 'education', 'canadianEducation', 'testsRecent', 'canadianYears', 'foreignYears', 'tradeCertificate', 'jobOffer', 'nomination', 'sibling']) {
    assert.equal(assessCrs({ ...base, [key]: null }).status, 'incomplete', key);
  }
  for (const ability of ABILITIES) {
    assert.equal(assessCrs({ ...base, firstLanguage: { ...base.firstLanguage, scores: { ...base.firstLanguage.scores, [ability]: null } } }).status, 'incomplete');
  }
  assert.equal(assessCrs({ ...base, canadianYears: 1, highWageExperience: null }).status, 'incomplete');
  assert.equal(assessCrs({ ...base, ...partner, spouseEducation: null }).status, 'incomplete');
  assert.equal(assessCrs({ ...base, testsRecent: false }).status, 'invalid');
  assert.equal(assessCrs({ ...base, secondLanguage: language('pte', 9) }).status, 'invalid');
  assert.equal(assessCrs({ ...base, age: NaN }).status, 'invalid');
  assert.equal(assessCrs({ ...base, age: 30.5 }).status, 'invalid');
  assert.equal(assessCrs({ ...base, firstLanguage: language('ielts', 12) }).status, 'invalid');
  assert.equal(missingCrsAnswers(base).length, 0);
  ok('missing, expired and invalid inputs never produce a partial or misleading total');

  assert.equal(score({ firstLanguage: language('tef', 7), secondLanguage: language('pte', 5) }).additional.french, 50);
  assert.equal(score({ firstLanguage: language('tef', 7), secondLanguage: language('pte', [5, 5, 4, 5]) }).additional.french, 25);
  assert.equal(score({ firstLanguage: language('pte', 5), secondLanguage: language('tef', 7) }).additional.french, 50);
  assert.equal(score({ secondLanguage: language('tef', [7, 7, 6, 7]) }).additional.french, 0);
  for (const ability of ABILITIES) {
    const s = score({ firstLanguage: { test: 'ielts', scores: { ...base.firstLanguage.scores, [ability]: 6 } } });
    assert.equal(s.transferability.educationLanguage, 0);
    assert.equal(s.transferability.foreignLanguage, 0);
  }
  ok('French bonus is independent of language order; every skill must meet transfer thresholds');
  console.log(`${checks} CRS check groups passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
