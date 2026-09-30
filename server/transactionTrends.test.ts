import assert from 'node:assert/strict';
import {
  aggregateCounts,
  assessorNbhdToSaleHistoryKey,
  buildNbhdFilter,
  calculateMedianPrices,
  classifyClass,
  getTransactionTrends,
} from './transactionTrends';

// The live datasets use a three-digit assessor nbhd and a five-digit
// township+nbhd key in parcel sales.
assert.equal(assessorNbhdToSaleHistoryKey('Lake View', '50'), '73050');
assert.equal(assessorNbhdToSaleHistoryKey('North Chicago', 22), '74022');
assert.equal(assessorNbhdToSaleHistoryKey('Unknown Township', '50'), null);
assert.equal(buildNbhdFilter(['73050', '74022']), "nbhd in ('73050','74022')");

for (const cls of ['202', '203', '208', '209', '210']) {
  assert.equal(classifyClass(cls), 'singleFamily', `class ${cls} is single-family`);
}
assert.equal(classifyClass('211'), 'unit2to4');
for (const cls of ['204', '234', '299']) {
  assert.equal(classifyClass(cls), 'condo', `class ${cls} is a condominium`);
}
for (const cls of ['300', '313', '318', '390', '391', '399', '400', '401', '414', '478', '489', '499', '600']) {
  assert.equal(classifyClass(cls), 'commercial', `class ${cls} is commercial or mixed-use`);
}
for (const cls of ['201', '205', '206', '207', '212', '213', '214', '215', '218', '219', '297', '298', '301', '397', '500', '999', '300A']) {
  assert.equal(classifyClass(cls), null, `unmapped class ${cls} remains unknown`);
}

const counts = aggregateCounts([
  { year: '2022', class: '202', cnt: '3' },
  { year: '2022', class: '210', cnt: '2' },
  { year: '2022', class: '211', cnt: '4' },
  { year: '2022', class: '212', cnt: '10' },
  { year: '2024', class: '204', cnt: '7' },
  { year: '2025', class: '400', cnt: '6' },
  { year: '2024', class: '999', cnt: '100' },
  { year: '2021', class: '202', cnt: '100' },
]);
assert.deepEqual(counts.get(2022), { singleFamily: 5, unit2to4: 4, condo: 0, commercial: 0 });
assert.deepEqual(counts.get(2024), { singleFamily: 0, unit2to4: 0, condo: 7, commercial: 0 });
assert.deepEqual(counts.get(2025), { singleFamily: 0, unit2to4: 0, condo: 0, commercial: 6 });

const medians = calculateMedianPrices([
  { class: '202', sale_price: '1' },
  { class: '210', sale_price: '100000' },
  { class: '209', sale_price: '300000' },
  { class: '205', sale_price: '9000000' },
  { class: '211', sale_price: '250000' },
  { class: '212', sale_price: '350000' },
  { class: '204', sale_price: '400000' },
  { class: '234', sale_price: '600000' },
  { class: '299', sale_price: '800000' },
  { class: '300', sale_price: '900000' },
  { class: '400', sale_price: '1100000' },
  { class: '600', sale_price: '1500000' },
  { class: '999', sale_price: '9999999' },
  { class: '202', sale_price: 'not-a-price' },
  { class: '205', sale_price: null },
]);
assert.deepEqual(medians, {
  singleFamily: 100000,
  unit2to4: 250000,
  condo: 600000,
  commercial: 1100000,
});

const originalFetch = globalThis.fetch;
const requestUrls: URL[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  requestUrls.push(url);
  const rows = url.hostname === 'datacatalog.cookcountyil.gov' && url.pathname.includes('c49d-89sn')
    ? [{ township_name: 'Lake View', nbhd: '50' }]
    : url.searchParams.get('$select') === 'class,sale_price'
      ? [
          { class: '202', sale_price: '100000' },
          { class: '203', sale_price: '300000' },
          { class: '299', sale_price: '250000' },
        ]
      : [
          { year: '2022', nbhd: '73050', class: '202', cnt: '2' },
          { year: '2025', nbhd: '73050', class: '299', cnt: '3' },
        ];
  return { ok: true, json: async () => rows } as Response;
}) as typeof fetch;
const mockedFetch = globalThis.fetch;

try {
  const trends = await getTransactionTrends('60612');
  assert.equal(trends.zip, '60612');
  assert.equal('ranking' in trends, false);
  assert.equal(trends.years.length, 4);
  assert.equal(trends.years.find((year) => year.year === 2022)?.singleFamily, 2);
  assert.equal(trends.years.find((year) => year.year === 2025)?.condo, 3);
  const latestCompleteYear = [2022, 2023, 2024, 2025].filter((year) => year < new Date().getFullYear()).at(-1)!;
  assert.deepEqual(trends.years.find((year) => year.year === latestCompleteYear)?.medianPrice, {
    singleFamily: 200000,
    unit2to4: null,
    condo: 250000,
    commercial: null,
  });

  const assessorRequest = requestUrls.find((url) => url.pathname.includes('c49d-89sn'))!;
  assert.equal(assessorRequest.searchParams.get('$group'), 'township_name,nbhd');
  assert.match(assessorRequest.searchParams.get('$where')!, /property_zip >= '60612' AND property_zip < '60613' AND property_city='CHICAGO'/);
  const salesRequests = requestUrls.filter((url) => url.pathname.includes('wvhk-k5uv'));
  assert.equal(salesRequests.length, 2);
  for (const url of salesRequests) {
    const where = url.searchParams.get('$where')!;
    assert.match(where, /nbhd in \('73050'\)/);
    assert.match(where, /sale_filter_less_than_10k=false/);
    assert.match(where, /sale_filter_deed_type=false/);
  }
  const priceRequest = salesRequests.find((url) => url.searchParams.get('$select') === 'class,sale_price')!;
  assert.equal(priceRequest.searchParams.get('$where')?.includes(`${latestCompleteYear}-01-01`), true);

  await getTransactionTrends('60612');
  assert.equal(requestUrls.length, 3, 'successful ZIP result is cached');

  const storedResult = { ...trends, zip: '60614' };
  const fresh = await getTransactionTrends('60614', {
    read: async () => ({ result: storedResult, fetchedAt: Date.now() }),
    write: async () => { throw new Error('fresh cache should not refresh'); },
  });
  assert.deepEqual(fresh, storedResult);
  assert.equal(requestUrls.length, 3, 'shared cache avoids cold Cook County requests');

  const staleZip = '60615';
  const fetchedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  let saved!: () => void;
  const savedPromise = new Promise<void>((resolve) => { saved = resolve; });
  const stale = await getTransactionTrends(staleZip, {
    read: async () => ({ result: { ...trends, zip: staleZip }, fetchedAt }),
    write: async () => { saved(); },
  });
  assert.equal(stale.isStale, true, 'expired shared data is marked as stale');
  assert.equal(stale.lastUpdated, new Date(fetchedAt).toISOString());
  await savedPromise;
  const refreshed = await getTransactionTrends(staleZip);
  assert.equal(refreshed.isStale, undefined, 'successful background refresh replaces stale data');

  globalThis.fetch = (async () => ({
    ok: false,
    status: 503,
    text: async () => 'County source unavailable',
  })) as typeof fetch;
  await assert.rejects(getTransactionTrends('60616'), /Socrata HTTP 503/, 'cold source failure is an error, not an empty sale history');
  globalThis.fetch = (async () => ({ ok: true, json: async () => [] })) as typeof fetch;
  await assert.rejects(getTransactionTrends('60617'), /No assessor neighborhoods/, 'an unmapped ZIP is not reported as zero sales');
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const rows = url.pathname.includes('c49d-89sn') ? [{ township_name: 'Lake View', nbhd: '50' }] : [];
    return { ok: true, json: async () => rows } as Response;
  }) as typeof fetch;
  await assert.rejects(getTransactionTrends('60618'), /no sale-count rows/, 'empty upstream sales must not be cached as confirmed zero sales');

  globalThis.fetch = mockedFetch;
  const withoutSharedCache = await getTransactionTrends('60619', {
    read: async () => { throw new Error('Cache database unavailable'); },
    write: async () => { throw new Error('Cache database unavailable'); },
  });
  assert.equal(withoutSharedCache.years.find((year) => year.year === 2022)?.singleFamily, 2, 'healthy county response works when the cache database is down');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('transaction trends calculations passed');