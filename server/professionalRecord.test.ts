import assert from "node:assert/strict";
import test from "node:test";
import { rollUp } from "./professionalRecord";
import { normalizeProName } from "../shared/normalizeProName";
import { fetchPermitHistory } from "./permits";
test("successful empty histories are available, not partial", () => {
  const record = rollUp({
    permitData: { permits: [], olderPermits: [] },
    zoningHistoryData: { items: [], coverage: {
      cityCouncil: { complete: true },
      zba: { complete: false, checked: true, earliestIndexedDate: "1993-06-01" },
    } },
    zbaData: { cases: [] },
    taxAppealData: [],
    lienData: { documents: [], searchFailed: false },
  });
  assert.deepEqual(record.groups, []);
  assert.equal(record.totalNames, 0);
  assert.ok(Object.values(record.sourceCoverage).every(source => source.status === "available"));
});

test("real retrieval failures and omitted permit details retain their qualifications", () => {
  const failed = rollUp({
    permitData: { permits: [], apiError: true },
    zoningHistoryData: { items: [], coverage: { cityCouncil: { complete: false } } },
    lienData: { documents: [], searchFailed: true },
  });
  assert.equal(failed.sourceCoverage.permits.status, "unavailable");
  assert.equal(failed.sourceCoverage.zoning.status, "unavailable");
  assert.equal(failed.sourceCoverage.recorder.status, "unavailable");
  const incomplete = rollUp({
    permitData: { permits: [], olderPermits: [], olderPermitsSummary: { count: 3 } },
    zoningHistoryData: { items: [{ type: "ordinance", date: "2025-01-01" }], coverage: { cityCouncil: { complete: false } } },
  });
  assert.equal(incomplete.sourceCoverage.permits.status, "partial");
  assert.equal(incomplete.sourceCoverage.zoning.status, "partial");
});
test("suffix variants dedupe with latest display spelling and one count per permit", () => {
  const rec = rollUp({ permits: [
    { id: "old", issueDate: "2020-01-01", contractors: [{ name: "NORCON INC", type: "General Contractor" }] },
    { id: "new", issueDate: "2026-01-01", contractors: [{ name: "NORCON, INC.", type: "General Contractor" }, { name: "NORCON", type: "General Contractor" }] },
  ] });
  assert.equal(rec.totalNames, 1);
  assert.equal(rec.groups[0].entries[0].name, "NORCON, INC.");
  assert.equal(rec.groups[0].entries[0].recordCount, 2);
  assert.equal(rec.firstYear, 2020); assert.equal(rec.lastYear, 2026);
});
test("shared normalization does not remove Roman numerals inside people's names", () => {
  assert.equal(normalizeProName("Rivera, Esq."), "RIVERA");
  assert.equal(normalizeProName("Williams III"), "WILLIAMS");
  assert.equal(normalizeProName("Norcon, LLC"), "NORCON");
});
test("a fourth raw permit contact and an owner acting as GC are retained", () => {
  const rec = rollUp({ permits: [{
    issue_date: "2026-01-01", contact_1_type: "OWNER", contact_1_name: "A",
    contact_2_type: "CONTRACTOR-GENERAL CONTRACTOR", contact_2_name: "A",
    contact_3_type: "ARCHITECT", contact_3_name: "C",
    contact_4_type: "EXPEDITER", contact_4_name: "D",
  }] });
  assert.equal(rec.groups.find(g => g.key === "contractors")?.entries[0].role, "Owner as General Contractor");
  assert.equal(rec.groups.find(g => g.key === "expediters")?.entries[0].name, "D");
});
test("the real permit adapter retains slot four and passes engineers to the roll-up", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json([{
    permit_: "slot-four", issue_date: "2026-01-01", street_number: "1", street_direction: "N", street_name: "TEST",
    contact_1_type: "OWNER", contact_1_name: "Owner",
    contact_2_type: "ENGINEER", contact_2_name: "Engineer",
    contact_3_type: "ARCHITECT", contact_3_name: "Architect",
    contact_4_type: "EXPEDITER", contact_4_name: "Expediter",
  }]));
  const permits = await fetchPermitHistory("1 N TEST ST");
  assert.equal(permits.permits[0].expediterName, "Expediter");
  assert.equal(permits.permits[0].contacts?.length, 4);
  const rec = rollUp({ permitData: permits });
  assert.equal(rec.groups.find(g => g.key === "design")?.entries.length, 2);
  assert.equal(rec.groups.find(g => g.key === "expediters")?.entries[0].name, "Expediter");
});
test("primary-address filtering excludes co-parcel permits and nearby zoning cases", () => {
  const rec = rollUp({ address: "1 N TEST ST", permits: [
    { id: "one", address: "1 N TEST ST", contractors: [{ name: "Subject GC", type: "General Contractor" }] },
    { id: "two", address: "3 N TEST ST", contractors: [{ name: "Neighbor GC", type: "General Contractor" }] },
  ], zbaData: { cases: [
    { propertyAddress: "3 N TEST ST", representativeRaw: "Neighbor Rep", outcome: "DENIED" },
    { propertyAddress: "1 N TEST ST", representativeRaw: "Subject Rep", outcome: "APPROVED", rawCaseText: "The application is hereby GRANTED.", decisionDate: "2026-05-01" },
  ] } });
  assert.equal(rec.totalNames, 2);
  assert.equal(rec.groups[1].entries[0].outcome, "GRANTED");
  assert.equal(rec.groups[1].entries[0].tag, undefined);
});
test("a self-represented applicant is not labeled an attorney or a literal SELF", () => {
  const rec = rollUp({ zbaData: { cases: [{ representativeRaw: "SELF", applicantName: "Actual Applicant", outcome: "DENIED", decisionDate: "2025-01-01" }] } });
  const e = rec.groups[0].entries[0];
  assert.equal(e.name, "Actual Applicant"); assert.equal(e.role, "Self-represented applicant"); assert.equal(e.tag, undefined);
});
test("tax outcomes come from subject-PIN raw rows, year precision, no amounts or success rates", () => {
  const taxAppealData = ["Decrease", "No Change", "Decrease"].map((result, i) => ({
    attorney_firstname: "Tax", attorney_lastname: "Representative", attorney_firmname: "Tax Firm",
    tax_year: String(2020 + i), result, assessor_totalvalue: 700000, bor_totalvalue: 600000,
  }));
  const rec = rollUp({ taxAppealData });
  const e = rec.groups[0].entries[0];
  assert.equal(e.outcome, "2 OF 3 DECREASED"); assert.equal(e.lastSeen, "2022"); assert.equal(e.lastSeenPrecision, "year");
  assert.equal(e.recordCount, 3); assert.doesNotMatch(JSON.stringify(e), /700000|600000|%|success|winRate/);
});
test("duplicate PIN-year matters do not inflate tax totals; unknown outcomes do not assert zero decreases", () => {
  const a = { attorneyLastName: "Tax Name", taxYear: "2024", result: "Decrease" };
  assert.equal(rollUp({ taxAppealData: [a, a] }).groups[0].entries[0].recordCount, 1);
  const rec = rollUp({ taxAppealData: [a, { ...a, taxYear: "2025", result: "" }] });
  assert.equal(rec.groups[0].entries[0].outcome, undefined);
});
test("released mortgages remain visible and Current requires a resolved title snapshot", () => {
  const documents = [
    { category: "mortgage", documentNumber: "one", grantee: "Released Bank", recordedDate: "2019-01-01", amount: 100000, isReleased: true },
    { category: "mortgage", documentNumber: "two", grantee: "Unresolved Bank", recordedDate: "2020-01-01", amount: 200000 },
    { category: "deed", documentNumber: "three", grantee: "Not a lender", recordedDate: "2026-01-01" },
  ];
  const rec = rollUp({ lienData: { documents } });
  const es = rec.groups[0].entries;
  assert.equal(es.length, 2); assert.equal(es[0].position, undefined); assert.equal(es[1].position, "Prior");
  assert.match(es[1].facts.join(" "), /original recorded principal.*release on record/);
  const resolved = rollUp({ lienData: { documents }, debtSnapshot: { schema_version: 4, active: [{ doc_number: "two", is_credit_line: true }] } });
  assert.equal(resolved.groups[0].entries[0].position, "Current");
  assert.match(resolved.groups[0].entries[0].facts[0], /maximum indebtedness/);
  assert.equal(rollUp({ lienData: { documents }, debtSnapshot: { schema_version: 3, active: [{ doc_number: "two" }] } }).groups[0].entries[0].position, undefined);
});
test("fixed group order, cross-group unique names, newest first, and no more than two facts", () => {
  const rec = rollUp({ permits: [
    { id: "1", issueDate: "2020-01-01", expediterName: "Shared Name", architectName: "Old Architect" },
    { id: "2", issueDate: "2026-01-01", architectName: "Shared Name" },
  ] });
  assert.deepEqual(rec.groups.map(g => g.key), ["design", "expediters"]);
  assert.equal(rec.totalNames, 2); assert.equal(rec.groupCount, 2);
  assert.equal(rec.groups[0].entries[0].name, "Shared Name");
  assert.ok(rec.groups.flatMap(g => g.entries).every(e => e.facts.length <= 2));
});
test("Discovery links require an unambiguous eligible index match and correct trade", () => {
  const source = { permits: [{ contractors: [{ name: "Firm, Inc.", type: "General Contractor" }, { name: "Electric, LLC", type: "Electrical Contractor" }] }] };
  assert.ok(rollUp(source).groups[0].entries.every(e => !e.discoveryUrl));
  const linked = rollUp({ ...source, directory: { contractors: ["Firm", "Electric"] } });
  assert.match(linked.groups[0].entries.find(e => e.key === "FIRM")!.discoveryUrl!, /view=gc-rankings&search=Firm/);
  assert.equal(linked.groups[0].entries.find(e => e.key === "ELECTRIC")!.discoveryUrl, undefined);
  assert.equal(rollUp({ ...source, directory: { contractors: ["Firm", "Firm Inc"] } }).groups[0].entries.find(e => e.key === "FIRM")!.discoveryUrl, undefined);
});
test("missing dates and missing sources remain unknown, not invented current records", () => {
  const rec = rollUp({ permits: [{ contractors: [{ name: "Undated GC", type: "General Contractor" }] }] });
  assert.equal(rec.firstYear, null); assert.equal(rec.groups[0].entries[0].lastSeen, "");
  assert.equal(rollUp({}).sourceCoverage.recorder.status, "unavailable");
  assert.deepEqual(rollUp({}).groups, []);
});

test("prior words in a case do not reverse its recorded denial", () => {
  const rec = rollUp({ zbaData: { cases: [{ representativeRaw: "Rep", outcome: "DENIED", rawCaseText: "An earlier request was GRANTED." }] } });
  assert.equal(rec.groups[0].entries[0].outcome, "DENIED");
});
test("a lender's released filing does not hide another active or unresolved mortgage", () => {
  const documents = [
    { category: "mortgage", grantee: "Same Bank", documentNumber: "older", recordedDate: "2020-01-01" },
    { category: "mortgage", grantee: "Same Bank Inc", documentNumber: "latest", recordedDate: "2021-01-01", isReleased: true },
  ];
  assert.equal(rollUp({ lienData: { documents } }).groups[0].entries[0].position, undefined);
  const rec = rollUp({ lienData: { documents }, debtSnapshot: { schema_version: 4, active: [{ doc_number: "older" }] } });
  assert.equal(rec.totalNames, 1);
  assert.equal(rec.groups[0].entries[0].position, "Current");
});

test("lender amounts can use the resolved document's original principal, never effective balance or loan terms", () => {
  const rec = rollUp({
    lienData: { documents: [{ category: "mortgage", documentNumber: "loan", grantee: "Bank", recordedDate: "2026-01-01", amount: 0 }] },
    debtSnapshot: { schema_version: 4, active: [{ doc_number: "loan", original_amount: 100000, effective_amount: 90000, effective_interest_rate: 6.5 }] },
  });
  assert.match(rec.groups[0].entries[0].facts[0], /100,000 original recorded principal/);
  assert.doesNotMatch(JSON.stringify(rec), /90,000|90000|6\.5|effective_amount|interest_rate/);
});