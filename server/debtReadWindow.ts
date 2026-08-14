// Debt Snapshot — read-window optimization (pure, no I/O).
// The debt picture is read from the most recent GENUINE sale forward
// (resolveState clears everything before it), so the ingester only needs to
// download/OCR documents recorded on/after `saleAnchor − BUFFER`. Pre-window
// documents stay in the pipeline as INDEX-ONLY stubs (doc number, type, date)
// — they still drive "N historical — resolved by sale" counts, but never cost
// a download, an OCR call, or an extraction call.
//
// Safeguards (all deliberate — do not "simplify" away):
// - BUFFER reaches BACKWARD 6 months: the purchase-money mortgage records
//   AROUND the sale (days-to-weeks before the deed, or with a recording lag
//   after it). A strict "after the sale" cutoff would drop the current
//   primary lien. Err generous — one extra OCR is cheap; a missing first
//   lien is not.
// - Tax liens (and other in-rem liens that run with the land) survive a sale
//   — pre-window tax liens are still fully ingested, never stubbed.
// - No genuine sale anchor ⇒ no cutoff — full history is ingested.
// - Unparseable/missing recording date ⇒ read the document (never guess).
// - `alwaysRead` is the demand-driven union hook: other sections (companion
//   parcel joint-acquisition deed, ownership history) can request specific
//   pre-window documents; the window narrows only the DEBT contribution.

import { parseFlexDate } from "@shared/lienDistress";
import type { ExtractedRecorderDoc, RecorderIndexRow } from "./recorderDocIngest";

/** Backward reach from the sale anchor — protects the closing/acquisition
 *  package that records around (often before) the deed. Tunable; consider 12
 *  months if a purchase-money mortgage is ever missed. */
export const DEBT_WINDOW_BUFFER_MONTHS = 6;

const toISO = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** `saleAnchor − BUFFER` as ISO, or null when there is no valid anchor
 *  (never sold / quit-claim-only history ⇒ no cutoff, full ingest). */
export function debtReadWindowStart(mostRecentSaleISO: string | null | undefined): string | null {
  const t = parseFlexDate(mostRecentSaleISO ?? null);
  if (t == null) return null;
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() - DEBT_WINDOW_BUFFER_MONTHS);
  return toISO(d.getTime());
}

/** Normalize a recorder-index date (ISO or MM/DD/YYYY) to ISO; null when
 *  unparseable — callers must treat null as "unknown → read the document". */
export function normalizeIndexDate(s: string | null | undefined): string | null {
  const t = parseFlexDate(s ?? null);
  return t == null ? null : toISO(t);
}

/** In-rem liens that run with the land and survive a sale — never index-only,
 *  even pre-window (rare, so the OCR cost is negligible). */
export function survivesSale(row: Pick<RecorderIndexRow, "documentType" | "category">): boolean {
  if (row.category === "federal_tax" || row.category === "state_tax") return true;
  return /tax\s*lien|special\s*assessment/i.test(row.documentType || "");
}

/** Map a recorder INDEX row to the extraction doc_type vocabulary. Regex on
 *  the free-text type wins over the coarse category (a "LIS PENDENS" often
 *  sits under category "litigation"; an "ASSIGNMENT" under "mortgage"). */
export function mapIndexTypeToDocType(row: Pick<RecorderIndexRow, "documentType" | "category">): ExtractedRecorderDoc["doc_type"] {
  const t = row.documentType || "";
  if (/lis\s*pendens/i.test(t)) return "lis_pendens";
  if (/notice\s*of\s*default/i.test(t)) return "notice_default";
  if (/satisfact/i.test(t)) return "satisfaction";
  if (/assign/i.test(t)) return "assignment";
  if (/modif|amend/i.test(t)) return "modification";
  if (/subordinat/i.test(t)) return "subordination";
  if (/tax\s*lien/i.test(t)) return "tax_lien";
  switch (row.category) {
    case "mortgage": return "mortgage";
    case "release": return "release";
    case "deed": return "deed";
    case "foreclosure": return "foreclosure";
    case "litigation": return "lis_pendens";
    case "judgment": return "judgment_lien";
    case "federal_tax": case "state_tax": return "tax_lien";
    case "mechanic": return "mechanics_lien";
    default: return "other";
  }
}

/** Index-only stand-in for a pre-window document: enough for counts, dates,
 *  and resolved-by-sale classification — no body fields, never cached in
 *  recorder_doc_cache (the cache holds real extractions only). */
export function indexOnlyStub(row: RecorderIndexRow): ExtractedRecorderDoc {
  return {
    doc_number: row.documentNumber,
    doc_type: mapIndexTypeToDocType(row),
    recording_date: normalizeIndexDate(row.recordedDate),
    execution_date: null,
    pins: [],
    parties: { borrower: null, lender: null, assignor: null, assignee: null },
    amount: null,
    index_consideration_amount: typeof row.amount === "number" && row.amount > 0 ? row.amount : null,
    interest_rate: null,
    maturity_date: null,
    modifies: null,
    references_docs: [],
    debtor_name: null,
    is_partial: false,
    is_blanket: false,
    is_credit_line: false,
    extraction_confidence: "low",
    text_source: "index",
    index_only: true,
  };
}

/** Split uncached relevant rows into full-ingest vs index-only. */
export function classifyIngest(
  rows: RecorderIndexRow[],
  windowStart: string | null,
  alwaysRead?: Iterable<string> | null,
): { read: RecorderIndexRow[]; indexOnly: RecorderIndexRow[] } {
  if (!windowStart) return { read: rows.slice(), indexOnly: [] }; // no anchor ⇒ no cutoff
  const must = new Set(Array.from(alwaysRead ?? []));
  const read: RecorderIndexRow[] = [];
  const indexOnly: RecorderIndexRow[] = [];
  for (const row of rows) {
    const date = normalizeIndexDate(row.recordedDate);
    if (must.has(row.documentNumber)   // another section needs the body (union)
      || date == null                  // unknown date — err on reading
      || date >= windowStart           // in-window (incl. backward buffer)
      || survivesSale(row)) {          // in-rem lien — survives the sale
      read.push(row);
    } else {
      indexOnly.push(row);
    }
  }
  return { read, indexOnly };
}
