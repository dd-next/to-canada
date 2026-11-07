/* Real published-snapshot acceptance for historical layouts and uncertain identities. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { X509Certificate, createHash } = require('node:crypto');
const { chromium } = require('playwright');
const base = process.env.NORTHWARD_BROWSER_BASE || 'http://127.0.0.1:4177';
const output = process.env.NORTHWARD_BROWSER_EVIDENCE || 'dev/validation/services-immigration/lmia-recovery';
const metadata = JSON.parse(fs.readFileSync('public/data/lmia/metadata.json', 'utf8'));
const rows = metadata.periods.flatMap(period => JSON.parse(fs.readFileSync('public/data/' + period.indexPath, 'utf8')).rows.map(row => ({ row, period })));
const number = value => value.toLocaleString('en-CA');
const unresolved = /[\u0081\u008d\u008f\u0090\u009d]/;
const report = { base, startedAt: new Date().toISOString(), coverage: metadata.coverage, checks: [], errors: [], screenshots: [] };
fs.mkdirSync(output, { recursive: true });
(async () => {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  if (process.env.NORTHWARD_BROWSER_CA_CERT) {
    const cert = new X509Certificate(fs.readFileSync(process.env.NORTHWARD_BROWSER_CA_CERT));
    args.push('--ignore-certificate-errors-spki-list=' + createHash('sha256').update(cert.publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.errors.push(error.message));
  const go = async params => {
    const response = await page.goto(base + '/immigration/lmia' + (params ? '?' + new URLSearchParams(params) : ''));
    assert.equal(response.status(), 200);
    await page.locator('.lmia__results-heading').waitFor();
  };
  const checkCount = async expected => {
    await page.waitForFunction(value => document.querySelector('.lmia__results-heading')?.textContent.trim().startsWith(value + ' matching record'), number(expected));
  };
  const screenshot = async name => {
    await page.screenshot({ path: path.join(output, name) });
    report.screenshots.push(name);
  };
  try {
    if (process.env.LMIA_REQUIRE_COMPLETE === 'true') {
      assert.equal(metadata.coverage.gaps.length, 0, 'All known selected reporting periods must have validated data.');
      assert.deepEqual([...new Set(metadata.periods.map(p => p.id))].sort(), [...new Set(metadata.resources.map(r => r.period.id))].sort());
    }
    await go();
    const latest = [...metadata.periods].sort((a, b) => b.end.localeCompare(a.end))[0];
    await checkCount(latest.rowCount);
    assert.equal(await page.getByLabel('Reporting period', { exact: true }).inputValue(), latest.id);
    report.checks.push('Latest available period opens with complete counts');
    await go({ period: 'all' });
    await checkCount(rows.length);
    const positions = rows.reduce((sum, { row }) => sum + (row[10] ?? 0), 0);
    assert.equal(await page.locator('.lmia__totals > div').nth(2).locator('dd').innerText(), number(positions));
    report.checks.push('All-period record and approved-position totals match every published tuple');
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 960 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }
    report.checks.push('Full historical selection has no page overflow at desktop, tablet and narrow mobile widths');
    const unnamed = rows.filter(({ row }) => row[1].trim().toLowerCase() === '(blank)');
    if (process.env.LMIA_REQUIRE_COMPLETE === 'true') assert.ok(unnamed.length > 0, 'The real 2019 Q3 unnamed source rows must be included.');
    if (unnamed.length) {
      const sample = unnamed[0];
      await go({ period: sample.period.id, q: '(blank)' });
      const expected = unnamed.filter(item => item.period.id === sample.period.id);
      await checkCount(expected.length);
      assert.equal(await page.getByRole('link', { name: 'History for this name and address', exact: true }).count(), 0);
      assert.equal(await page.locator('.lmia__totals > div').first().locator('dd').innerText(), '0');
      assert.match(await page.locator('.lmia__totals').innerText(), /unnamed record/);
      assert.equal(await page.locator('.lmia__totals > div').nth(2).locator('dd').innerText(), number(expected.reduce((sum, { row }) => sum + (row[10] ?? 0), 0)));
      await page.locator('.lmia-record__source summary').first().click();
      await page.getByText('Publisher name: (blank)', { exact: true }).first().waitFor();
      await screenshot('unnamed-source-record-375.png');
      await go({ period: 'all', employerLocation: sample.row[11] });
      await checkCount(0);
      report.checks.push('Actual unnamed rows retain counts and source labels, stay outside known identities, and cannot establish history through crafted URLs');
    }
    const uncertain = rows.find(({ row }) => row.slice(1, 8).some(value => typeof value === 'string' && unresolved.test(value)));
    if (process.env.LMIA_REQUIRE_COMPLETE === 'true') assert.ok(uncertain, 'Legacy undefined source bytes must remain preserved.');
    if (uncertain) {
      await go({ period: uncertain.period.id, record: uncertain.row[0] });
      await checkCount(1);
      await page.locator('.lmia-record__source summary').click();
      assert.match(await page.locator('.lmia-record').innerText(), /\\x(?:81|8D|8F|90|9D)/);
      assert.equal(unresolved.test(await page.locator('.lmia-record').innerText()), false);
      await page.getByText(/no character has been guessed/).waitFor();
      await screenshot('legacy-source-byte-375.png');
      report.checks.push('Actual unresolved legacy text is visible as explicit escapes and retains source detail');
    }
    const nocRows = rows.filter(({ row, period }) => period.id === '2016' && row[6] === '0631' && row[8] === '2011');
    if (process.env.LMIA_REQUIRE_COMPLETE === 'true') assert.ok(nocRows.length > 0);
    if (nocRows.length) {
      await go({ period: '2016', occupation: '0631', nocVersion: '2011' });
      await checkCount(nocRows.length);
      report.checks.push('Actual restored leading-zero NOC 2011 codes are searchable in their own edition');
    }
    for (const province of ['HO', 'NT']) {
      await go({ period: 'all', province });
      await checkCount(rows.filter(({ row }) => row[3] === province).length);
    }
    report.checks.push('Outside-Canada head offices and Northwest Territories filters include all mapped publisher labels');
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.failure = error.stack;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'recovery-browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output }));
})().catch(error => { console.error(error); process.exitCode = 1; });
