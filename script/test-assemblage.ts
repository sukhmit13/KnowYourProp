// Deterministic tests for shared/assemblage.ts — run with: npx tsx script/test-assemblage.ts
import assert from 'node:assert';
import { detectAssemblage, buildAssemblageTakeaway, pinsAreSequential, addressesAreAdjacent } from '../shared/assemblage';

const sale = (o: Partial<import('../shared/assemblage').AssemblageSale>) => ({
  saleDate: '', salePrice: 0, sellerName: '', buyerName: '', deedType: 'Warranty Deed', docNo: '', year: '', ...o,
});

// --- 522/520 N Claremont regression fixture ---
const jointDeed = '1310645032';
const subj522 = {
  pin: '17-07-117-024-0000',
  address: '522 N Claremont Ave',
  owner: 'SUKHMIT KALSI',
  debtSummary: 'UWM $712,500 + 2nd',
  saleHistory: [
    sale({ saleDate: '2021-06-15', salePrice: 0, buyerName: 'SUKHMIT KALSI', deedType: 'Quit Claim Deed', docNo: '2116612001', year: '2021' }),
    sale({ saleDate: '2013-04-16', salePrice: 475000, buyerName: 'SUKHMIT KALSI', docNo: jointDeed, year: '2013' }),
  ],
};
const co520 = {
  pin: '17-07-117-025-0000',
  address: '520 N Claremont Ave',
  owner: '520 CLAREMONT LLC',
  saleHistory: [
    sale({ saleDate: '2021-07-02', salePrice: 0, buyerName: '520 CLAREMONT LLC', deedType: 'Quit Claim Deed', docNo: '2118312044', year: '2021' }),
    sale({ saleDate: '2013-04-16', salePrice: 475000, buyerName: 'SUKHMIT KALSI', docNo: jointDeed, year: '2013' }),
  ],
};

// 1) 522 triggers: joint 2013 acquisition, adjacent PINs, separated 2021, common_control likely
const a = detectAssemblage({ subject: subj522, coParcel: co520, matchReason: 'Same deed (Legal Description)', zoning: 'RT-4' });
assert(a, 'expected assemblage to trigger for 522/520');
assert.equal(a!.acquired_together.year, 2013);
assert.equal(a!.acquired_together.doc_number, jointDeed);
assert.equal(a!.acquired_together.price, 475000);
assert.equal(a!.separated, true);
assert.equal(a!.separated_year, 2021);
assert.equal(a!.common_control, 'likely');
assert(pinsAreSequential(subj522.pin, co520.pin));
assert(addressesAreAdjacent(subj522.address, co520.address));

// 2) Takeaway is deterministic and hedged — "likely", never "certain"
const t = buildAssemblageTakeaway(a!);
assert(/likely/i.test(t.headline), 'headline must hedge with "likely"');
assert(!/certain(?!,? not)/i.test(t.headline.replace(/not certain/gi, '')), 'headline must not assert certainty');
const cautionRow = t.rows.find(r => r.tone === 'caution');
assert(cautionRow && cautionRow.chip === 'Confirm', 'personal↔LLC split must carry a Confirm chip');
assert(/likely same owner/i.test(cautionRow!.html));
assert(!/certainly|proven|confirmed common/i.test(cautionRow!.html));
const debtRow = t.rows[t.rows.length - 1];
// detection above passed no subjectDebtScope → 'unknown': PIN-only framing, no cross-collateral claim
assert(/for this PIN only/.test(debtRow.html) && !/no cross-collateral/i.test(debtRow.html));

// 3) Owner-name match WITHOUT shared acquisition does NOT trigger
const noSharedDoc = detectAssemblage({
  subject: { ...subj522, saleHistory: [sale({ saleDate: '2013-04-16', buyerName: 'SUKHMIT KALSI', docNo: 'AAA111', year: '2013' })] },
  coParcel: { ...co520, owner: 'SUKHMIT KALSI', saleHistory: [sale({ saleDate: '2013-04-16', buyerName: 'SUKHMIT KALSI', docNo: 'BBB222', year: '2013' })] },
  matchReason: 'Shared ownership — SUKHMIT KALSI (buyer, 2013)',
});
assert.equal(noSharedDoc, null, 'bare owner-name match must NOT trigger');

// 4) Shared acquisition WITHOUT adjacency does NOT trigger
const farAway = detectAssemblage({
  subject: subj522,
  coParcel: { ...co520, pin: '17-07-220-005-0000', address: '1400 W Grand Ave' },
  matchReason: 'Same deed (Legal Description)',
});
assert.equal(farAway, null, 'non-adjacent parcel must NOT trigger even with shared deed');

// 5) Identical named owner on both parcels → exact, no hedge in headline
const exact = detectAssemblage({
  subject: { ...subj522, owner: 'SUKHMIT KALSI' },
  coParcel: { ...co520, owner: 'SUKHMIT KALSI', saleHistory: [co520.saleHistory[1]] },
});
assert(exact && exact.common_control === 'exact');
assert(/same owner/.test(buildAssemblageTakeaway(exact!).headline));

// 6) personal↔LLC can never be "exact" even with matching normalized core name
const entityLine = detectAssemblage({
  subject: { ...subj522, owner: 'SUKHMIT KALSI' },
  coParcel: { ...co520, owner: 'SUKHMIT KALSI LLC' },
});
assert(entityLine && entityLine.common_control !== 'exact', 'personal↔LLC must never be exact');

// 7) "Same deed" matchReason with a doc # NOT present in either sale history must NOT trigger
const unverifiedClaim = detectAssemblage({
  subject: { ...subj522, saleHistory: [sale({ saleDate: '2013-04-16', buyerName: 'SUKHMIT KALSI', docNo: 'AAA111', year: '2013' })] },
  coParcel: { ...co520, saleHistory: [sale({ saleDate: '2013-04-16', buyerName: 'SUKHMIT KALSI', docNo: 'BBB222', year: '2013' })] },
  matchReason: 'Same deed (Doc #9999999999)',
});
assert.equal(unverifiedClaim, null, 'unverified matchReason doc must NOT trigger');

// 8) "Same deed (Legal Description)" without a verifiable shared doc in histories must NOT trigger
const legalNoDoc = detectAssemblage({
  subject: { ...subj522, saleHistory: [sale({ docNo: 'AAA111', year: '2013' })] },
  coParcel: { ...co520, saleHistory: [sale({ docNo: 'BBB222', year: '2013' })] },
  matchReason: 'Same deed (Legal Description)',
});
assert.equal(legalNoDoc, null, 'shared-deed claim without a verifiable doc must NOT trigger');

// 9) unclear control (owner unresolved) must hedge as unclear, never "likely one owner"
const unclear = detectAssemblage({
  subject: subj522,
  coParcel: { ...co520, owner: null },
});
assert(unclear && unclear.common_control === 'unclear');
const tu = buildAssemblageTakeaway(unclear!);
assert(/unclear/i.test(tu.headline), 'unclear control must say unclear in headline');
assert(!/likely still one owner/i.test(tu.headline));
assert(tu.rows.some(r => /control is unclear/i.test(r.html) && r.chip === 'Confirm'));

// 10) debt-scope discipline: no snapshot → no cross-collateralization claim; blanket → flagged
const tUnknown = buildAssemblageTakeaway(a!); // default debt_scope 'unknown'
assert.equal(a!.debt_scope, 'unknown');
const debtRowU = tUnknown.rows[tUnknown.rows.length - 1];
assert(!/no cross-collateral/i.test(debtRowU.html), 'unknown scope must not claim no cross-collateralization');
assert(/for this PIN only/.test(debtRowU.html));
const aSingle = detectAssemblage({ subject: subj522, coParcel: co520, subjectDebtScope: 'single_pin' })!;
assert(/no cross-collateralized loan appears/.test(buildAssemblageTakeaway(aSingle).rows.at(-1)!.html));
const aBlanket = detectAssemblage({ subject: subj522, coParcel: co520, subjectDebtScope: 'blanket' })!;
const blanketRow = buildAssemblageTakeaway(aBlanket).rows.at(-1)!;
assert(blanketRow.tone === 'caution' && /spans multiple PINs/.test(blanketRow.html));

console.log('✓ all assemblage tests passed');
