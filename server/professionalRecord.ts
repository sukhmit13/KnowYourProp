import type { ProfessionalEntry, ProfessionalRecord, ProfessionKey } from "../shared/professionalRecord";
import { normalizeProName } from "../shared/normalizeProName";
import { addressesMatch } from "./zoningHistory";

type Row = Record<string, any>;
type Coverage = ProfessionalRecord["sourceCoverage"];
export interface RollUpInput {
  address?: string;
  city?: string;
  permits?: Row[];
  permitData?: Row | null;
  zoningHistoryData?: { items?: Row[]; coverage?: Row } | null;
  zbaData?: { cases?: Row[]; approvals?: Row[] } | null;
  taxAppealData?: Row[] | null;
  lienData?: Row | null;
  debtSnapshot?: Row | null;
  sourceCoverage?: Coverage;
  /** Only names whose membership in the relevant Discovery index is known. */
  directory?: Partial<Record<ProfessionKey, string[]>>;
}
const GROUPS: Array<{ key: ProfessionKey; label: string; note?: string }> = [
  { key: "contractors", label: "Contractors" },
  { key: "design", label: "Architects & Engineers" },
  { key: "expediters", label: "Permit Expediters" },
  { key: "zoningAttorneys", label: "Zoning Attorneys", note: "outcome as the Board recorded it" },
  { key: "taxAttorneys", label: "Tax Appeal Attorneys", note: "outcome as the Board of Review recorded it" },
  { key: "lenders", label: "Lenders", note: "parties with a claim, not hired work" },
];
const VIEWS: Record<ProfessionKey, string> = {
  contractors: "gc-rankings", design: "architect-rankings", expediters: "expeditor-rankings",
  zoningAttorneys: "attorneys", taxAttorneys: "tax-appeal-attorneys", lenders: "lender-rankings",
};
function dateOf(raw: unknown): Pick<ProfessionalEntry, "lastSeen" | "lastSeenPrecision"> {
  const value = typeof raw === "string" ? raw.trim() : raw instanceof Date ? raw.toISOString() : "";
  if (/^\d{4}$/.test(value)) return { lastSeen: value, lastSeenPrecision: "year" };
  if (/^\d{4}-\d{2}$/.test(value)) return { lastSeen: value, lastSeenPrecision: "month" };
  const date = value ? new Date(value) : null;
  return { lastSeen: date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "", lastSeenPrecision: "day" };
}
function permitAddress(p: Row): string {
  return p.address || [p.streetNumber ?? p.street_number, p.streetDirection ?? p.street_direction, p.streetName ?? p.street_name].filter(Boolean).join(" ");
}
function contractorRole(type: string, name: string, owner: string): string {
  if (/OWNER AS GENERAL/i.test(type)) return "Owner as General Contractor";
  if (/GENERAL/i.test(type)) return normalizeProName(name) === normalizeProName(owner) ? "Owner as General Contractor" : "General Contractor";
  return type.replace(/^CONTRACTOR-/i, "").toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}
/** Property-scoped facts, never person rankings, inferred wins, or current balances. */
export function rollUp(input: RollUpInput): ProfessionalRecord {
  const maps = new Map<ProfessionKey, Map<string, ProfessionalEntry>>();
  const identities = new Map<ProfessionalEntry, Set<string>>();
  const years: number[] = [];
  const taxResults = new Map<string, Map<string, string>>();
  const coverage: Coverage = input.sourceCoverage ?? {
    permits: { status: input.permits || input.permitData?.permits ? input.permitData?.apiError || input.permitData?.parseError ? "unavailable" : input.permitData?.olderPermitsSummary?.count > 0 && !input.permitData?.olderPermits?.length ? "partial" : "available" : "unavailable" },
    // An empty, successfully retrieved list is a valid no-records result.
    // City Council's incomplete-search flag is distinct from the ZBA archive's
    // ordinary historical date bounds, which do not indicate retrieval failure.
    zoning: { status: Array.isArray(input.zoningHistoryData?.items)
      ? input.zoningHistoryData?.coverage?.cityCouncil?.complete === false
        ? (input.zoningHistoryData?.items?.length ?? 0) > 0 ? "partial" : "unavailable"
        : "available"
      : "unavailable" },
    zba: { status: Array.isArray(input.zbaData?.cases) || Array.isArray(input.zbaData?.approvals) ? "available" : "unavailable" },
    taxAppeals: { status: Array.isArray(input.taxAppealData) ? "available" : "unavailable" },
    recorder: { status: input.lienData && !input.lienData.searchFailed ? "available" : "unavailable" },
  };
  const add = (group: ProfessionKey, name: unknown, role: string, date: unknown, id: string, extra: Partial<ProfessionalEntry> = {}) => {
    if (typeof name !== "string" || !normalizeProName(name)) return;
    const key = normalizeProName(name), when = dateOf(date);
    if (when.lastSeen) years.push(Number(when.lastSeen.slice(0, 4)));
    if (!maps.has(group)) maps.set(group, new Map());
    const map = maps.get(group)!;
    let entry = map.get(key);
    if (!entry) {
      entry = { name: name.trim(), key, role, ...when, recordCount: 0, facts: [], ...extra };
      map.set(key, entry); identities.set(entry, new Set());
    } else if (when.lastSeen > entry.lastSeen) {
      Object.assign(entry, { name: name.trim(), role, ...when, firm: undefined, outcome: undefined, tag: undefined, position: undefined, facts: [], ...extra });
    }
    identities.get(entry)!.add(id);
    entry.recordCount = identities.get(entry)!.size;
    return entry;
  };
  const permits = input.permits ?? [...(input.permitData?.permits ?? []), ...(input.permitData?.olderPermits ?? [])];
  for (let index = 0; index < permits.length; index++) {
    const p = permits[index];
    const address = permitAddress(p);
    if (input.address && address && !addressesMatch(address, input.address)) continue;
    const id = `permit:${p.id ?? p.permitNumber ?? p.permit_ ?? `${address}|${p.issueDate ?? p.issue_date}|${p.workDescription ?? index}`}`;
    const date = p.issueDate ?? p.issue_date;
    const raw = Array.from({ length: 4 }, (_, n) => ({ name: p[`contact_${n + 1}_name`], type: String(p[`contact_${n + 1}_type`] ?? "") }));
    const owner = p.ownerName || raw.find(c => /^OWNER$/i.test(c.type))?.name || "";
    const contractors = p.contacts ?? p.contractors ?? raw.filter(c => /CONTRACTOR|ENGINEER|ARCHITECT|EXPEDIT/i.test(c.type));
    for (const c of contractors) {
      const type = String(c.type || "");
      if (/ARCHITECT|ENGINEER/i.test(type)) add("design", c.name, /SELF/i.test(type) ? "Self-Certified Architect" : /ENGINEER/i.test(type) ? "Engineer" : "Architect", date, id);
      else if (/EXPEDIT/i.test(type)) add("expediters", c.name, "Permit Expediter", date, id);
      else if (/CONTRACTOR/i.test(type)) add("contractors", c.name, contractorRole(type, c.name || "", owner), date, id);
    }
    if (p.architectName) add("design", p.architectName, /SELF/i.test(p.architectType || "") ? "Self-Certified Architect" : "Architect", date, id);
    if (p.expediterName) add("expediters", p.expediterName, "Permit Expediter", date, id);
  }
  const zoningItems = input.zoningHistoryData?.items ?? [];
  for (let index = 0; index < zoningItems.length; index++) {
    const item = zoningItems[index];
    if (input.address && item.matchedAddress && !addressesMatch(item.matchedAddress, input.address)) continue;
    const id = `zoning:${item.ordinanceId ?? item.attachmentUrl ?? index}`;
    if (item.architect) add("design", item.architect.name, "Architect", item.date, id, { firm: item.architect.firm });
    // A filed application is not a Board outcome; do not turn its status into one.
    if (item.zoningAttorney) add("zoningAttorneys", item.zoningAttorney.name, "Zoning attorney", item.date, id, { firm: item.zoningAttorney.firm, outcome: item.type === "zba" ? item.decision : undefined });
  }
  const zbaCases = input.zbaData?.cases ?? input.zbaData?.approvals ?? [];
  for (let index = 0; index < zbaCases.length; index++) {
    const c = zbaCases[index];
    const address = c.propertyAddress ?? c.address;
    if (input.address && (!address || !addressesMatch(address, input.address))) continue;
    let name = c.representativeRaw;
    if (/^(SELF|SAME AS APPLICANT|SELF[- ]REPRESENTED)$/i.test(name?.trim() || "")) name = c.applicantName;
    const self = name && normalizeProName(name) === normalizeProName(c.applicantName);
    const words = new Set<string>((String(c.rawCaseText ?? "").match(/\b(?:GRANTED|DENIED|WITHDRAWN|CONTINUED|DISMISSED)\b/gi) ?? []).map(word => word.toUpperCase()));
    const sourceOutcome = c.outcome ?? c.decision;
    const word = words.size === 1 ? Array.from(words)[0] : undefined;
    const recordedOutcome = word && (word === sourceOutcome || sourceOutcome === "APPROVED" && word === "GRANTED")
      ? word : sourceOutcome;
    add("zoningAttorneys", name, self ? "Self-represented applicant" : c.ardcVerified ? "Zoning attorney" : "Board representative",
      c.decisionDate ?? c.date, `zba:${c.caseId ?? c.caseNumber ?? index}`,
      { outcome: recordedOutcome, tag: c.ardcVerified === true ? "ARDC verified" : undefined });
  }
  for (const a of input.taxAppealData ?? []) {
    const person = [a.attorneyFirstName ?? a.attorney_firstname, a.attorneyLastName ?? a.attorney_lastname].filter(Boolean).join(" ");
    const firm = a.attorneyFirmName ?? a.attorney_firmname;
    const name = person || firm;
    const year = String(a.taxYear ?? a.tax_year ?? "");
    const id = `appeal:${a.appealId ?? a.appeal_id ?? `${year}|${a.appealType ?? a.appealtype ?? ""}|${a.appealReason ?? a.appealtypedescription ?? ""}|${a.appellant ?? ""}`}`;
    const entry = add("taxAttorneys", name, person ? "Tax appeal attorney" : "Tax appeal firm", year, id, { firm: person ? firm : undefined, outcome: a.result });
    if (entry) {
      if (!taxResults.has(entry.key)) taxResults.set(entry.key, new Map());
      taxResults.get(entry.key)!.set(id, String(a.result ?? ""));
    }
  }
  const snap = input.debtSnapshot?.schema_version === 4 ? input.debtSnapshot : null;
  const active = new Set((snap?.active ?? []).map((m: Row) => m.doc_number));
  const prior = new Set([...(snap?.satisfied ?? []), ...(snap?.cleared_by_sale ?? [])].map((m: Row) => m.doc_number));
  const mortgages = (input.lienData?.documents ?? input.lienData?.mortgages ?? []).filter((m: Row) => m.category === "mortgage" || (!m.category && input.lienData?.mortgages));
  const currentLenders = new Set<string>(), unresolvedLenders = new Set<string>();
  for (let index = 0; index < mortgages.length; index++) {
    const m = mortgages[index];
    const resolved = [...(snap?.active ?? []), ...(snap?.satisfied ?? []), ...(snap?.cleared_by_sale ?? [])].find((s: Row) => s.doc_number === m.documentNumber);
    const indexAmount = Number(m.amount);
    const amount = indexAmount > 0 && Number.isFinite(indexAmount) ? indexAmount : Number(resolved?.original_amount);
    const money = amount > 0 && Number.isFinite(amount) ? `$${Math.round(amount).toLocaleString("en-US")} ${resolved?.is_credit_line ? "maximum indebtedness" : "original recorded principal"}` : "amount unavailable";
    const entry = add("lenders", m.grantee, "Recorded mortgagee", m.recordedDate, `mortgage:${m.documentNumber ?? index}`, {
      position: m.isReleased || prior.has(m.documentNumber) ? "Prior" : active.has(m.documentNumber) ? "Current" : undefined,
      facts: [money, m.isReleased ? "release on record" : prior.has(m.documentNumber) ? "historical / cleared in title snapshot" : "no release identified in available records"],
    });
    if (entry && !m.isReleased && active.has(m.documentNumber)) currentLenders.add(entry.key);
    else if (entry && !m.isReleased && !prior.has(m.documentNumber)) unresolvedLenders.add(entry.key);
  }
  const groups = GROUPS.flatMap(g => {
    const entries = Array.from(maps.get(g.key)?.values() ?? []).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name));
    for (const e of entries) {
      if (g.key === "lenders") {
        if (currentLenders.has(e.key)) e.position = "Current";
        else if (unresolvedLenders.has(e.key)) e.position = undefined;
      }
      if (g.key !== "lenders") e.facts = [`${e.recordCount} record${e.recordCount === 1 ? "" : "s"} here`];
      if (g.key === "taxAttorneys" && e.recordCount > 1) {
        const results = Array.from(taxResults.get(e.key)?.values() ?? []);
        e.outcome = results.every(r => /^(decrease|increase|no[ -]?change)$/i.test(r.trim()))
          ? `${results.filter(r => /^decrease$/i.test(r.trim())).length} OF ${results.length} DECREASED`
          : undefined;
      }
      const matches = (input.directory?.[g.key] ?? []).filter(n => normalizeProName(n) === e.key);
      // A missing/ambiguous index match is plain text, never an invented directory claim.
      if (matches.length === 1 && (g.key !== "contractors" || e.role === "General Contractor")) {
        e.discoveryUrl = `/discovery?view=${VIEWS[g.key]}&search=${encodeURIComponent(matches[0])}`;
      }
      e.facts = e.facts.slice(0, 2);
    }
    return entries.length ? [{ ...g, entries }] : [];
  });
  return {
    groups, totalNames: new Set(groups.flatMap(g => g.entries.map(e => e.key))).size,
    groupCount: groups.length, firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null, sourceCoverage: coverage,
  };
}