import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EV_SOURCE_URL, discoverEVReports, parseEVReport } from './evRegistrationSource';
import { importEVReports, mergeEVReports, nextEVMonthlyCheck, runEVRefresh, type EVData } from './evRegistrations';

const source = 'https://www.ilsos.gov/content/dam/departments/vehicles/statistics/electric/';
const reports = discoverEVReports(`<a href="${source}2023/electric022723.pdf">February</a>
  <a href="${source}2026/electric091526.pdf">September</a>
  <a href="https://evil.example/electric/2026/electric101526.pdf">Bad</a>`);
assert.deepEqual(reports.map(r => [r.year, r.month]), [[2023, 2], [2026, 9]]);
assert.match(reports[0].url, /022723/);
assert.throws(() => discoverEVReports('<a href="https://evil.example/report.pdf">Bad</a>'));
const link = reports[1];
const rows = Array.from({ length: 550 }, (_, n) => 60100 + n)
  .filter(zip => zip !== 60612 && zip !== 60622)
  .map((zip, n) => `TEST CITY ${zip} ${n}`);
const text = `COUNTY TOTALS AS OF 09/15/2026\nCOOK .... 49576\nCHICAGO .... 28458\nZIPCODE TOTALS AS OF09/15/2026\n${rows.join('\n')}\nCHICAGO 60622 1183\nCHICAGO 60612 441`;
const report = parseEVReport(text, link, 'Fri, 18 Sep 2026 21:45:16 GMT');
assert.equal(report.cookCounty, 49576, 'county comes from the official county row, not ZIP sums');
assert.equal(report.zipCounts['60622'], 1183);
assert.equal(report.zipTableComplete, true);
assert.throws(() => parseEVReport(text.replace('COOK .... 49576', 'UNKNOWN .... 49576'), link));
assert.throws(() => parseEVReport(text.replaceAll('09/15/2026', '08/15/2026'), link));
assert.throws(() => parseEVReport(text + '\nCHICAGO 60622 1183', link));
assert.throws(() => parseEVReport(text.replace('60622 1183', '60622'), link));
const partial = parseEVReport(text.replace('60622 1183', '60622'), link, undefined, true);
assert.equal(partial.zipTableComplete, false);
assert.equal(partial.zipCounts['60622'], undefined, 'unreadable count is never fabricated as zero');
const original: EVData = {
  lastUpdated: '2026-01-17', dataSource: 'Illinois SOS', sourceUrl: EV_SOURCE_URL,
  cookCountyMonthly: [{ year: 2026, month: 1, count: 44557 }],
  chicagoMonthly: [{ year: 2026, month: 1, count: 25000 }],
  byZipCode: { '60622': [{ year: 2026, month: 1, count: 1093 }], '60612': [{ year: 2026, month: 1, count: 390 }] },
};
const clone = structuredClone(original), now = new Date('2026-10-02T18:00:00Z');
const merged = mergeEVReports(original, [report], now);
assert.deepEqual(original, clone, 'merge never mutates previously verified history');
assert.equal(merged.byZipCode['60622'].at(-1)?.count, 1183);
assert.equal(merged.cookCountyMonthly.at(-1)?.count, 49576);
assert.deepEqual(Object.keys(merged.byZipCode).sort(), Object.keys(original.byZipCode).sort(), 'tracked geography stays unchanged');
assert.equal(mergeEVReports(merged, [report], now).cookCountyMonthly.length, 2, 'rebuild is idempotent');
assert.throws(() => mergeEVReports(merged, [partial], now), /erase an existing/);
assert.equal(nextEVMonthlyCheck(now).toISOString(), '2026-10-19T11:00:00.000Z', '6am Chicago in daylight time');
assert.equal(nextEVMonthlyCheck(new Date('2026-10-19T11:00:00Z')).toISOString(), '2026-11-19T12:00:00.000Z', '6am Chicago after DST ends');
assert.equal(nextEVMonthlyCheck(new Date('2026-12-20T00:00:00Z')).toISOString(), '2027-01-19T12:00:00.000Z', 'year rollover');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-refresh-test-'));
try {
  const file = path.join(directory, 'ev.json');
  fs.writeFileSync(file, JSON.stringify(original));
  importEVReports([report], file, now);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.refresh.nextCheckAt, '2026-10-19T11:00:00.000Z');
  assert.equal(saved.reports['2026-09'].sourceLastModified, 'Fri, 18 Sep 2026 21:45:16 GMT');
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => importEVReports([partial], file, now));
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'failed import cannot overwrite a verified count');
  fs.writeFileSync(file, JSON.stringify(original));
  const index = { body: Buffer.from(`<a href="${link.url}">September</a>`), lastModified: undefined };
  const due = new Date('2026-09-19T11:05:00Z');
  await runEVRefresh({ file, now: due, fetchIndex: async () => index, download: async () => report });
  const successful = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(successful.cookCountyMonthly.at(-1).count, 49576);
  assert.equal(successful.refresh.nextCheckAt, '2026-10-19T11:00:00.000Z');
  await runEVRefresh({ file, force: true, now, fetchIndex: async () => index, download: async () => report });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).refresh.nextCheckAt, '2026-10-19T11:00:00.000Z',
    'a forced repair before publication week does not start premature daily checks');
  await runEVRefresh({ file, now: new Date('2026-09-20T12:00:00Z'), fetchIndex: async () => { throw new Error('not due'); } });
  fs.writeFileSync(file, JSON.stringify(original));
  await assert.rejects(runEVRefresh({
    file, now: due, fetchIndex: async () => { throw new Error('EV proxy HTTP 401'); },
  }), /401/);
  const failed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(failed.cookCountyMonthly, original.cookCountyMonthly);
  assert.deepEqual(failed.byZipCode, original.byZipCode);
  assert.equal(failed.lastUpdated, original.lastUpdated);
  assert.equal(failed.refresh.nextCheckAt, '2026-09-20T11:00:00.000Z', 'late or failed publication checks retry next day');
  await runEVRefresh({ file, now: new Date('2026-09-19T12:00:00Z'), fetchIndex: async () => { throw new Error('retry flood'); } });
  fs.writeFileSync(file, JSON.stringify({ ...original, refresh: { nextCheckAt: due.toISOString(), lateChecks: 13 } }));
  await assert.rejects(runEVRefresh({ file, now: due, fetchIndex: async () => { throw new Error('still late'); } }));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).refresh.nextCheckAt, '2026-10-19T11:00:00.000Z', 'limited retries return to monthly cadence');
} finally { fs.rmSync(directory, { recursive: true }); }
console.log('EV source validation, atomic merge, date discovery, and monthly schedule checks passed');