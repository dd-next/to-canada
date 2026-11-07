// UI contract and full-selection filtering regressions; never replaces the published data.
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporary = mkdtempSync(join(tmpdir(), 'northward-lmia-ui-'));
try {
  buildSync({ entryPoints: ['src/components/lmia/model.ts'], outfile: join(temporary, 'model.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { decodeLmiaPartition, employerHistoryHref, filterLmiaRows, LMIA_PAGE_SIZE, pageNumber, periodSelection, prepareLmiaRows, readLmiaFilters, recordHref, safeSourceUrl, summarizeLmiaRows, UNREPORTED } = await import(join(temporary, 'model.mjs'));
  const first = { id: '2022-Q4', label: '2022 Q4', start: '2022-10-01', end: '2022-12-31', kind: 'quarter', indexPath: 'lmia/periods/2022-Q4.json', rowCount: 95, resourceId: 'release-a', status: 'ok' };
  const second = { ...first, id: '2023-Q1', label: '2023 Q1', start: '2023-01-01', end: '2023-03-31', resourceId: 'release-b' };
  const columns = ['id', 'employer', 'address', 'province', 'provinceLabel', 'stream', 'occupationCode', 'occupationTitle', 'nocVersion', 'approvedLmias', 'approvedPositions', 'employerLocationId', 'incorporation'];
  const input = Array.from({ length: 95 }, (_, index) => [`row-${index}`, index === 94 ? 'Café Rivière Inc.' : 'Sample Employer', index === 94 ? '100 rue des Pins, Montréal, QC' : `${index} Example Road, Toronto, ON`, index === 94 ? 'QC' : 'ON', index === 94 ? 'Quebec' : 'Ontario', index === 93 ? null : 'High wage', '63200', 'Cooks', index === 94 ? 'NOC 2021' : 'NOC 2016', index === 94 ? null : 1, index === 94 ? null : 2, `location-${index}`, null]);
  const partition = { schemaVersion: 1, resourceId: first.resourceId, periodId: first.id, columns, rows: input };
  const decoded = decodeLmiaPartition(partition, first);
  const prepared = prepareLmiaRows(decoded);
  const empty = readLmiaFilters(new URLSearchParams());
  assert.equal(LMIA_PAGE_SIZE, 30);
  assert.equal(filterLmiaRows(prepared, { ...empty, query: 'cafe riviere' })[0].id, 'row-94', 'Search must reach records beyond the first rendered page and handle accents.');
  assert.equal(filterLmiaRows(prepared, { ...empty, location: 'Montreal pins', province: 'QC', occupation: '63200 cook', nocVersion: 'NOC 2021' }).length, 1);
  assert.equal(filterLmiaRows(prepared, { ...empty, nocVersion: 'NOC 2016' }).length, 94, 'NOC editions must remain independently filterable.');
  assert.equal(filterLmiaRows(prepared, { ...empty, stream: UNREPORTED })[0].id, 'row-93', 'Missing stream is reachable without inventing a value.');
  assert.equal(filterLmiaRows(prepared, { ...empty, employerLocationId: 'location-1' }).length, 1, 'Same publisher names at different addresses must remain separate.');
  assert.equal(filterLmiaRows(prepared, { ...empty, query: 'no such employer' }).length, 0);
  const totals = summarizeLmiaRows(decoded, [first]);
  assert.deepEqual(totals.lmias, { known: 94, unknown: 1 });
  assert.deepEqual(totals.positions, { known: 188, unknown: 1 });
  assert.equal(totals.rows, 95);
  assert.equal(totals.locations, 95);
  assert.equal(totals.overlappingPeriods, false);
  assert.equal(totals.nocVersions.length, 2);
  const missing = summarizeLmiaRows([decoded[94]], [first]);
  assert.deepEqual(missing.lmias, { known: 0, unknown: 1 }, 'An unknown count is tracked explicitly, never inferred as a published zero.');
  const overlapping = { ...second, id: '2022', start: '2022-01-01', end: '2022-12-31' };
  assert.equal(summarizeLmiaRows([decoded[0], { ...decoded[1], periodId: '2022' }], [first, overlapping]).overlappingPeriods, true, 'Overlapping periods must suppress the displayed sum.');
  assert.deepEqual(periodSelection([first, second], null, false).map((period) => period.id), ['2023-Q1']);
  assert.deepEqual(periodSelection([first, second], null, true).map((period) => period.id), ['2023-Q1', '2022-Q4']);
  assert.equal(periodSelection([first, second], 'unavailable', false).length, 0, 'A stale direct link must not silently select another period.');
  assert.equal(periodSelection([first, second], 'all', false).length, 2);
  assert.equal(pageNumber('999999999999999999999', 95), 1);
  assert.equal(pageNumber('5', 95), 4);
  assert.equal(pageNumber('-2', 95), 1);
  const publicContext = readLmiaFilters(new URLSearchParams('noc=11111&unit=2br&place=toronto&occupation=63200'));
  assert.equal(publicContext.occupation, '63200');
  assert.equal(publicContext.province, '');
  const history = new URL(employerHistoryHref(decoded[94]), 'https://example.test');
  assert.equal(history.searchParams.get('employerLocation'), decoded[94].employerLocationId);
  assert.equal(history.searchParams.get('period'), 'all');
  assert.equal(filterLmiaRows(prepared, readLmiaFilters(history.searchParams)).length, 1);
  const record = new URL(recordHref(decoded[94]), 'https://example.test');
  assert.equal(filterLmiaRows(prepared, readLmiaFilters(record.searchParams))[0].id, 'row-94');
  assert.equal(safeSourceUrl('javascript:alert(1)'), undefined);
  assert.equal(safeSourceUrl('data:text/html,unsafe'), undefined);
  assert.equal(safeSourceUrl('https://user:secret@example.test/'), undefined);
  assert.equal(safeSourceUrl('https://open.canada.ca/data/en/dataset/example'), 'https://open.canada.ca/data/en/dataset/example');
  assert.throws(() => decodeLmiaPartition({ ...partition, periodId: second.id }, first));
  assert.throws(() => decodeLmiaPartition({ ...partition, rows: input.slice(0, 30) }, first), /does not match/, 'Partial downloads cannot claim full-period totals.');
  assert.throws(() => decodeLmiaPartition({ ...partition, columns: columns.slice(0, -1) }, first), /unsupported layout/);
  const invalidCount = structuredClone(partition);
  invalidCount.rows[0][9] = 'suppressed';
  assert.throws(() => decodeLmiaPartition(invalidCount, first), /count is invalid/);
  const duplicate = structuredClone(partition);
  duplicate.rows[1][0] = duplicate.rows[0][0];
  assert.throws(() => decodeLmiaPartition(duplicate, first), /duplicate/);
  console.log('LMIA UI checks passed: complete filtering, unknown counts, NOC versions, overlap guard, conservative history, URL isolation, safe links and partition validation.');

  const metadataPath = 'public/data/lmia/metadata.json';
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    let count = 0;
    const ids = new Set();
    for (const period of metadata.periods) {
      assert.match(period.indexPath, /^lmia\/periods\/[A-Za-z0-9._-]+\.json$/);
      const actual = decodeLmiaPartition(JSON.parse(readFileSync(join('public/data', period.indexPath), 'utf8')), period);
      count += actual.length;
      for (const row of actual) {
        assert.ok(!ids.has(row.id), 'Record IDs must be unique across period partitions.');
        ids.add(row.id);
      }
    }
    assert.equal(count, metadata.coverage.rowCount);
    assert.equal(metadata.periods.length, metadata.coverage.periodCount);
    console.log(`LMIA published UI contract passed: ${count.toLocaleString('en-CA')} records across ${metadata.periods.length} periods.`);
  } else if (process.argv.includes('--snapshot')) {
    throw new Error('No published LMIA metadata exists; snapshot validation was required.');
  } else {
    console.log('Published LMIA snapshot not present yet; UI contract fixtures passed, live snapshot validation pending.');
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
