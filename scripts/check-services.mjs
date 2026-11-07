import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

const output = mkdtempSync(join(tmpdir(), 'northward-services-'));
let checks = 0;
const ok = (description) => { checks += 1; console.log(`ok ${description}`); };
try {
  buildSync({ stdin: { contents: "export * from './src/components/services/filter'; export * from './src/components/immigration/programGroups';", resolveDir: process.cwd(), loader: 'ts' }, outfile: join(output, 'filters.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
  const { filterServices, readServiceFilters, SERVICE_FILTER_KEYS, SERVICES_PAGE_SIZE, boundedPage, safeServiceUrl, serviceHref, PROGRAM_GROUPS, programInGroup, programGroupHref } = await import(join(output, 'filters.mjs'));
  const entry = (overrides = {}) => ({ id: 'federal-1', name: 'Aide à l’emploi', description: 'Employment and training information', url: 'https://example.ca/service', tags: ['newcomers', 'skills'], category: 'Employment', jurisdiction: 'Canada', level: 'Federal', type: 'Resource', state: 'current', coverage: { kind: 'national' }, ...overrides });
  const defaults = readServiceFilters(new URLSearchParams());
  const entries = [entry(), entry({ id: 'city-1', name: 'Library help', category: 'Libraries', jurisdiction: 'Smallville', level: 'Municipal', coverage: { kind: 'municipal' } }), entry({ id: 'retired-1', name: 'Former listing', state: 'retired' })];
  assert.deepEqual(filterServices(entries, defaults).map((item) => item.id), ['federal-1', 'city-1']);
  assert.equal(filterServices(entries, { ...defaults, query: 'aide emploi skills' })[0].id, 'federal-1');
  assert.equal(filterServices(entries, { ...defaults, query: 'emploi missing' }).length, 0);
  assert.equal(filterServices(entries, { ...defaults, jurisdiction: 'Smallville', coverage: 'municipal', category: 'Libraries' })[0].id, 'city-1');
  assert.equal(filterServices(entries, { ...defaults, jurisdiction: 'Smallville', coverage: 'national' }).length, 0);
  assert.equal(filterServices(entries, { ...defaults, state: 'retired' })[0].id, 'retired-1');
  assert.equal(filterServices(entries, { ...defaults, state: 'all' }).length, 3);
  ok('search covers accented source names, tags and full text; filters intersect exact category/jurisdiction/coverage without inventing national applicability');

  const many = Array.from({ length: SERVICES_PAGE_SIZE * 4 + 1 }, (_, index) => entry({ id: `entry-${index}`, name: index === SERVICES_PAGE_SIZE * 4 ? 'Needle far beyond the rendered page' : `Item ${index}` }));
  assert.equal(filterServices(many, { ...defaults, query: 'needle' })[0].id, `entry-${SERVICES_PAGE_SIZE * 4}`);
  assert.equal(boundedPage('999999999999999999999', many.length), 5);
  assert.equal(boundedPage('-1', many.length), 1);
  assert.equal(boundedPage('2junk', many.length), 1);
  assert.equal(boundedPage('9', 0), 1);
  ok('filtering finds records beyond the first page and pagination bounds malformed or stale URL values');

  const foreign = new URLSearchParams('q=global&noc=21231&place=toronto&unit=1br&category=other&svcQ=employment&svcCategory=Employment&svcJurisdiction=Canada&svcCoverage=national&svcState=all&svcPage=2');
  assert.deepEqual(readServiceFilters(foreign), { query: 'employment', category: 'Employment', jurisdiction: 'Canada', coverage: 'national', state: 'all' });
  for (const key of SERVICE_FILTER_KEYS) foreign.delete(key);
  assert.equal(foreign.get('noc'), '21231');
  assert.equal(foreign.get('q'), 'global');
  assert.equal(foreign.get('place'), 'toronto');
  const detailUrl = new URL(serviceHref('resource with & punctuation?'), 'https://northward.example');
  assert.equal(detailUrl.pathname, '/services');
  assert.equal(detailUrl.searchParams.get('service'), 'resource with & punctuation?');
  ok('Services URL keys are isolated from shared controls and stable entry links encode identifiers safely');

  for (const unsafe of ['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/a', '//example.ca', '/path', 'https://user:password@example.ca/']) assert.equal(safeServiceUrl(unsafe), null, unsafe);
  assert.equal(safeServiceUrl('https://example.ca/fr?x=1&y=2'), 'https://example.ca/fr?x=1&y=2');
  assert.equal(safeServiceUrl('http://example.ca/'), 'http://example.ca/');
  ok('only absolute HTTP(S) destinations without credentials can become outbound links');

  const programs = JSON.parse(readFileSync('public/data/programs.json', 'utf8'));
  const assigned = new Map();
  for (const group of PROGRAM_GROUPS.filter((item) => item.id)) for (const program of programs.filter((item) => programInGroup(item, group.id))) assigned.set(program.id, (assigned.get(program.id) ?? 0) + 1);
  assert.equal(assigned.size, programs.length);
  for (const program of programs) {
    assert.equal(assigned.get(program.id), 1, program.id);
    assert.ok(programInGroup(program, ''));
    if (program.parentId) assert.ok(programs.some((parent) => parent.id === program.parentId), `${program.id}: missing parent`);
    if (['pre_arrival', 'settlement_support'].includes(program.category)) {
      assert.ok(programInGroup(program, 'support'));
      assert.equal(programInGroup(program, 'federal'), false);
    }
  }
  const groupedUrl = new URL(programGroupHref('?program=old&place=toronto&jurisdiction=ON&q=work', 'community', '#g-ON'), 'https://northward.example');
  assert.equal(groupedUrl.pathname, '/immigration/programs');
  assert.equal(groupedUrl.searchParams.get('place'), 'toronto');
  assert.equal(groupedUrl.searchParams.get('jurisdiction'), 'ON');
  assert.equal(groupedUrl.searchParams.get('q'), 'work');
  assert.equal(groupedUrl.searchParams.get('program'), null);
  assert.equal(groupedUrl.searchParams.get('group'), 'community');
  assert.equal(groupedUrl.hash, '#g-ON');
  ok(`${programs.length} original program records map once across navigation groups; support and parent/stream relationships stay distinct`);

  if (existsSync('public/data/services/catalogue.json')) {
    const catalogue = JSON.parse(readFileSync('public/data/services/catalogue.json', 'utf8'));
    const current = catalogue.entries.filter((item) => item.state === 'current');
    assert.equal(filterServices(catalogue.entries, defaults).length, current.length);
    assert.equal(new Set(catalogue.entries.map((item) => item.id)).size, catalogue.entries.length);
    for (const category of catalogue.meta.categories) assert.ok(filterServices(catalogue.entries, { ...defaults, state: 'all', category }).length > 0, category);
    for (const jurisdiction of catalogue.meta.jurisdictions) assert.ok(filterServices(catalogue.entries, { ...defaults, state: 'all', jurisdiction }).length > 0, jurisdiction);
    for (const item of catalogue.entries) assert.ok(safeServiceUrl(item.url), item.id);
    assert.ok(catalogue.meta.attribution.includes('Awesome Canada'));
    assert.ok(readFileSync('public/data/services/LICENSE.txt', 'utf8').includes('Copyright (c) 2026 Awesome Canada'));
    ok(`all ${catalogue.entries.length} delivered entries, ${catalogue.meta.categories.length} categories and ${catalogue.meta.jurisdictions.length} jurisdictions are reachable; attribution/license present`);
  } else console.log('SKIP real Services snapshot coverage: ingestion has not yet produced the snapshot');
} finally { rmSync(output, { recursive: true, force: true }); }
console.log(`${checks} Services / program-navigation checks passed`);
