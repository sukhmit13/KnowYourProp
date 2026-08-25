// Debt Snapshot — Stage 2.5: resolveState (the fix layer). Pure deterministic
// code, no LLM. Consumes Stage 2's reconcile() output plus Stage 1's raw doc
// array and resolves STATE — which liens burden the CURRENT owner, which
// distress is live vs resolved, which liens are stale.
//
// Core rules:
// 1. A clearing transfer (arms-length sale OR court-ordered judicial sale)
//    resets the prior owner's owner-specific liens. Judicial deeds clear at
//    ANY price (credit bids record nominal amounts); ordinary deeds need real
//    consideration between unrelated parties.
// 2. Tax liens run with the land — never cleared by transfer.
// 3. Purchase-money mortgages are never cleared.
// 4. Position is recomputed on current-owner liens only, after clearing.
// 5. Cleared liens are retained in cleared_by_sale with a title note —
//    resolved, never a fake "satisfied".

import type { ExtractedRecorderDoc } from "./recorderDocIngest";
import type { LienStack, ReconciledMortgage } from "./debtReconcile";

const NOMINAL_CONSIDERATION = 1000;  // <= this => not arms-length (gift / quitclaim)
const MECHANICS_ENFORCE_YEARS = 2;   // IL mechanics-lien window (verify)
const JUDGMENT_LIEN_YEARS = 7;       // IL judgment-lien life, revivable (verify)
const BLANKET_VALUE_MULT = 1.3;

const daysBetween = (a: string, b: string): number =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const ageYears = (d: string, today: string): number => daysBetween(d, today) / 365.25;

const normEntity = (s: string | null | undefined): string => (s || "").toUpperCase().replace(/[.,]/g, "")
  .replace(/\b(LLC|L L C|INC|CORP|CO|COMPANY|N A|NA|TRUST|LP|LLP)\b/g, "").replace(/\s+/g, " ").trim();
const sameEntity = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && normEntity(a) === normEntity(b);

// judicial / distressed deed: clears by COURT ORDER, regardless of the (often nominal/credit-bid) price
const JUDICIAL_GRANTOR_RE = /\b(receiver|sheriff|commissioner|referee|master in chancery|special commissioner)\b/i;
const isJudicialDeed = (d: ExtractedRecorderDoc & { deed_subtype?: string }): boolean =>
  (!!d.deed_subtype && /receiver|sheriff|foreclosure|judicial|trustee|deed[-_ ]?in[-_ ]?lieu/i.test(d.deed_subtype)) ||
  JUDICIAL_GRANTOR_RE.test(d.parties?.assignor || "");
// NOTE: bare "trustee" is deliberately NOT in the grantor regex — Chicago land
// trusts make "as Trustee under Trust No..." a routine non-judicial grantor.
// A trustee's SALE deed is caught via the deed_subtype matcher above ("trustee"
// belongs there but never in the grantor-text fallback).

const isArmsLength = (d: ExtractedRecorderDoc): boolean => {
  const consid = d.index_consideration_amount ?? null;
  if (consid == null) return false;                    // unknown => NOT assumed arms-length
  if (consid <= NOMINAL_CONSIDERATION) return false;   // gift / nominal quitclaim
  if (sameEntity(d.parties?.assignor, d.parties?.assignee)) return false; // related parties
  return true;
};
// a "clearing transfer" resets prior-owner liens: an arms-length sale OR a court-ordered judicial sale
const isClearingTransfer = (d: ExtractedRecorderDoc): boolean => isArmsLength(d) || isJudicialDeed(d);

/** Stage 2.5 patch — the report's Sales section, the single source of truth
 *  for what counts as a SALE. Quit-claims / nominal / intra-owner transfers
 *  are not in it, so they never clear liens and never reset the anchor. */
export interface SalesSectionRef {
  most_recent_sale_date: string | null;   // ISO — the report's most recent GENUINE sale
  sales?: Array<{ date?: string | null; price?: number | null; doc_number?: string | null; is_arms_length?: boolean | null }>;
}

export interface ResolvedMortgage extends ReconciledMortgage {
  resolved_by_sale?: boolean;
  /** later, materially smaller loan with no release — adds to the debt */
  lien_kind?: "junior";
  /** a later similar-or-larger loan exists with no release of this one — may be an unrecorded refinance */
  refi_suspect?: boolean;
  status?: string;
  title_note?: string;
  verify_senior_survival?: boolean;
  blanket?: boolean;
  blanket_pins?: string[];
  suppress_ltv?: boolean;
  pool_value?: number | null;
  pool_ltv?: number | null;
  pool_ltv_note?: string | null;
  note?: string;
  extraction_gap?: boolean;
  display_lender?: string;
  position_confidence?: "low";
  /** newer.effective_amount > older.effective_amount * 1.05 on a refi pair (never asserts cash taken out) */
  cashOutSuspect?: boolean;
  /** newer recorded amount minus older recorded amount when both are known */
  recordedDelta?: number;
}

export interface DistressDoc extends ExtractedRecorderDoc {
  state?: "active" | "resolved";
}

export interface LienDoc extends ExtractedRecorderDoc {
  enforceability?: string;
  debtor_flag?: string;
}

/** One entry per consecutive first-position pair where the PIN set changed */
export interface ScopeChange {
  /** the newer loan that narrowed or widened the parcel scope */
  atDocNumber: string;
  recordingDate: string;
  /** PINs in the older loan that are absent from the newer loan */
  droppedPins: string[];
  /** PINs in the newer loan that were absent from the older loan */
  addedPins: string[];
}

export interface ResolvedState {
  current_owner: string | null;
  ownership_acquired: string | null;
  acquired_via: string;
  /** the ownership anchor clearing is read from — Sales-section-bound when available */
  anchor: { date: string | null; source: "sales-section" | "deed-derived" | "none" };
  /** deeds recorded AFTER the anchor that are NOT sales (quit-claims etc.) — they cleared nothing */
  non_sale_transfers: Array<{ doc_number: string; recording_date: string | null; deed_subtype?: string | null; grantor: string | null; grantee: string | null }>;
  active: ResolvedMortgage[];          // current-owner liens, re-positioned
  /** sum of active recorded amounts — null when any active amount is unextracted */
  combined_recorded_debt: number | null;
  /** mortgages with an explicit matched release/satisfaction */
  satisfied: ResolvedMortgage[];
  cleared_by_sale: ResolvedMortgage[];
  distress: DistressDoc[];
  foreclosure_active: boolean;
  liens: LienDoc[];
  flags: string[];
  /** parcel scope changes detected across consecutive first-position loans */
  scopeChanges: ScopeChange[];
}

/** Index rows for the owner's OTHER parcels (recorder INDEX only — never OCR
 *  sibling docs). Key = PIN, value = that pin's indexed doc numbers. */
export type IndexByPin = Record<string, Array<{ docNumber: string }>>;

export function resolveState(
  stack: LienStack,
  docs: ExtractedRecorderDoc[],
  parcel?: { pin?: string | null; value?: number | null } | null,
  opts?: { indexByPin?: IndexByPin | null; valueOf?: (pin: string) => number | null | undefined; salesSection?: SalesSectionRef | null } | unknown[] | null,
  todayISO?: string,
): ResolvedState {
  const o = (opts && !Array.isArray(opts)) ? opts : null;
  const indexByPin = o?.indexByPin ?? null;
  // NB: "valueOf" is inherited from Object.prototype — destructuring with a
  // default would silently grab that built-in. Own-property check required.
  const valueOf = o && Object.prototype.hasOwnProperty.call(o, "valueOf") ? o.valueOf : undefined;
  const today = todayISO ?? new Date().toISOString().slice(0, 10);

  // Pure-function contract: annotate copies, never the caller's reconcile
  // output or doc array (reused objects must not observe stale annotations).
  const stackActive: ResolvedMortgage[] = stack.active.map(m => ({ ...m, modifications: [...m.modifications] }));
  const stackSatisfied: ResolvedMortgage[] = stack.satisfied.map(m => ({ ...m, modifications: [...m.modifications] }));
  docs = docs.map(d => ({ ...d }));

  // ---- (A) OWNERSHIP TIMELINE from deeds ----
  const deeds = docs.filter(d => d.doc_type === "deed" && d.recording_date)
    .sort((a, b) => a.recording_date!.localeCompare(b.recording_date!));
  const acquisitionDeed = deeds[deeds.length - 1] ?? null;             // newest deed
  const currentOwner = acquisitionDeed?.parties?.assignee ?? null;     // grantee of newest deed
  const lastClearingXfer = [...deeds].reverse().find(isClearingTransfer) ?? null;

  // Stage 2.5 patch — OWNERSHIP ANCHOR. PRIMARY: bind to the Sales section's
  // most recent GENUINE sale (it already excludes quit-claims / nominal
  // transfers). FALLBACK (no Sales section): deed-derived as before.
  const salesSection = o?.salesSection ?? null;
  let anchor: ResolvedState["anchor"] = salesSection?.most_recent_sale_date
    ? { date: salesSection.most_recent_sale_date, source: "sales-section" }
    : lastClearingXfer?.recording_date
      ? { date: lastClearingXfer.recording_date, source: "deed-derived" }
      : { date: null, source: "none" };
  // Guard against an INCOMPLETE sales history: a court-ordered (judicial)
  // deed recorded AFTER the sales-section anchor is a genuine ownership
  // change MyDec often omits — it wins. Ordinary/quit-claim deeds never do.
  if (anchor.source === "sales-section" && lastClearingXfer?.recording_date
    && isJudicialDeed(lastClearingXfer) && lastClearingXfer.recording_date > anchor.date!) {
    anchor = { date: lastClearingXfer.recording_date, source: "deed-derived" };
  }
  // Match the anchor sale to its recorded deed (for judicial/status wording):
  // by the Sales section's doc number first, else the earliest deed recorded
  // on/after the sale date. Deed-derived anchor keeps its own deed.
  const normDocNo = (s: string | null | undefined) => (s || "").replace(/\W/g, "").replace(/^0+/, "");
  let anchorDeed: ExtractedRecorderDoc | null = lastClearingXfer;
  if (anchor.source === "sales-section") {
    const saleDocNos = new Set((salesSection!.sales || [])
      .filter(s => s.doc_number && (!s.date || s.date.slice(0, 10) === anchor.date))
      .map(s => normDocNo(s.doc_number)));
    // Doc-number match is authoritative. Otherwise only accept a deed
    // recorded within ~180 days after the sale (deeds record on/after the
    // sale) — a later transfer must NOT masquerade as the acquisition deed.
    const near = (d: ExtractedRecorderDoc) => {
      if (!d.recording_date || d.recording_date < anchor.date!) return false;
      const gap = (Date.parse(d.recording_date) - Date.parse(anchor.date!)) / 86_400_000;
      return gap <= 180;
    };
    anchorDeed = deeds.find(d => saleDocNos.has(normDocNo(d.doc_number)))
      ?? deeds.find(near)
      ?? null;                                  // unmatched: keep the sale date, deed details unknown
  }
  const viaJudicial = !!anchorDeed && isJudicialDeed(anchorDeed);
  // The date clearing is judged against; the anchor deed's recording date when
  // known (purchase-money guard needs the recorded form), else the sale date.
  const anchorRecDate = anchorDeed?.recording_date ?? anchor.date;
  // Deeds after the anchor that are NOT the anchor sale = non-sale transfers
  // (quit-claim, trust distribution). They clear nothing and reset nothing.
  const nonSaleTransfers: ResolvedState["non_sale_transfers"] = anchor.date
    ? deeds.filter(d => d !== anchorDeed && d.recording_date! > (anchorRecDate ?? anchor.date!))
      .map(d => ({
        doc_number: d.doc_number,
        recording_date: d.recording_date ?? null,
        deed_subtype: (d as any).deed_subtype ?? null,
        grantor: d.parties?.assignor ?? null,
        grantee: d.parties?.assignee ?? null,
      }))
    : [];

  // ---- (B) CLEARING TRANSFER CLEARS PRIOR-OWNER LIENS (the position-3 fix) ----
  const mortgages = stackActive;
  const clearedBySale: ResolvedMortgage[] = [];
  // caveat 7: the foreclosing lien context — oldest cleared lien predating the
  // others may have been senior to and outside the action.
  for (const m of mortgages) {
    // never clear the CURRENT acquisition's loan; a prior owner's purchase-money
    // mortgage (same-day as an older deed) is still prior-owner debt and can clear
    if (m.purchase_money && (!anchorRecDate || (m.recording_date ?? "") >= anchorRecDate)) continue;
    const priorToXfer = !!(anchor.date && m.recording_date && m.recording_date < anchor.date);
    const notCurrentOwnerDebt = !!(currentOwner && m.borrower && !sameEntity(m.borrower, currentOwner));
    if (priorToXfer && (notCurrentOwnerDebt || m.borrower == null)) {
      m.resolved_by_sale = true;
      const subtype = (anchorDeed as any)?.deed_subtype as string | undefined;
      m.status = viaJudicial
        ? `extinguished by court-ordered ${subtype || "receiver's/judicial"} sale recorded ${anchorRecDate}`
        : `resolved by sale — presumed paid at ${anchorRecDate} closing (no release recorded)`;
      m.title_note = viaJudicial
        ? "wiped by judicial sale; junior liens extinguished by court order"
        : "unreleased pre-sale mortgage; title insurer would have required payoff — minor title note";
      clearedBySale.push(m);
    }
  }
  // caveat 7 (lightweight): a lien senior to and outside the action can survive
  // a judicial sale — tag the senior-most cleared lien rather than asserting clean.
  if (viaJudicial && clearedBySale.length > 1) {
    const seniorMost = [...clearedBySale].sort((a, b) => (a.recording_date || "").localeCompare(b.recording_date || ""))[0];
    if (clearedBySale.some(m => m !== seniorMost && m.recording_date && seniorMost.recording_date
      && seniorMost.recording_date < m.recording_date)) {
      seniorMost.verify_senior_survival = true;
    }
  }
  // EVERYTHING at/after the anchor stays active — a later quit-claim / non-sale
  // transfer changes NOTHING here.
  const active = mortgages.filter(m => !m.resolved_by_sale)
    .sort((a, b) => (a.recording_date || "").localeCompare(b.recording_date || ""));
  active.forEach((m, i) => { m.position = i + 1; });                   // RE-position on current-owner liens only

  // Classify multiple active liens by AMOUNT — refi (replaces) vs junior lien
  // (adds). Never assume a payoff.
  // Each later lien is compared against ALL earlier unreleased liens (an
  // intervening junior loan must not hide a refinance of the first).
  for (let j = 1; j < active.length; j++) {
    const newer = active[j];
    if (!newer.effective_amount) continue;
    let refiOfSomething = false;
    for (let i = 0; i < j; i++) {
      const older = active[i];
      if (!older.effective_amount) continue;
      if (newer.effective_amount >= older.effective_amount * 0.9) {
        // later loan is similar-or-larger AND the older is unreleased => POSSIBLY an unrecorded refinance
        older.refi_suspect = true;
        older.note = "a later loan of similar-or-greater size is recorded with no release — may be a refinance; confirm payoff";
        refiOfSomething = true;
        // 2C: cash-out classification — annotate the NEWER loan
        if (newer.effective_amount > older.effective_amount * 1.05) {
          newer.cashOutSuspect = true;
          newer.recordedDelta = newer.effective_amount - older.effective_amount;
        }
      }
    }
    if (!refiOfSomething) {
      // materially smaller than every earlier loan => a JUNIOR / second lien (home-equity, HELOC, piggyback). Both live; it ADDS.
      newer.lien_kind = "junior";
      newer.note = "smaller loan recorded after the first with no release — a junior/second lien, not a refinance; it adds to the debt";
    }
  }
  const combined_recorded_debt = active.length && active.every(m => m.effective_amount != null)
    ? active.reduce((s, m) => s + (m.effective_amount as number), 0)
    : null;

  // ---- (C) DISTRESS: active vs resolved ----
  const distress = docs.filter(d =>
    d.doc_type === "lis_pendens" || d.doc_type === "foreclosure" || d.doc_type === "notice_default",
  ) as DistressDoc[];
  for (const d of distress) {
    d.state = "active";
    if (anchor.date && d.recording_date && d.recording_date < anchor.date)
      d.state = "resolved";                                            // predates the anchor sale/acquisition
    if (docs.some(x => x.doc_type === "mortgage" && !!x.recording_date && !!d.recording_date
      && x.recording_date > d.recording_date && sameEntity(x.parties?.borrower, currentOwner)))
      d.state = "resolved";                                            // current owner financed after the filing
    if (docs.some(x => (x.references_docs || []).includes(d.doc_number)
      && (x.doc_type === "release" || x.doc_type === "satisfaction")))
      d.state = "resolved";                                            // explicit dismissal/release
  }
  const foreclosure_active = distress.some(d => d.state === "active"
    && (d.doc_type === "foreclosure" || d.doc_type === "lis_pendens"));

  // ---- (D) LIEN enforceability (stale / cleared) ----
  const liens = docs.filter(d =>
    d.doc_type === "mechanics_lien" || d.doc_type === "judgment_lien" || d.doc_type === "tax_lien",
  ) as LienDoc[];
  for (const L of liens) {
    L.enforceability = "live";
    if (L.doc_type !== "tax_lien" && anchor.date && L.recording_date
      && L.recording_date < anchor.date)
      L.enforceability = "resolved by sale — verify";                  // tax liens run WITH the land — never here
    if (L.doc_type === "mechanics_lien" && L.recording_date && ageYears(L.recording_date, today) > MECHANICS_ENFORCE_YEARS)
      L.enforceability = "likely expired — verify";
    if (L.doc_type === "judgment_lien" && L.recording_date && ageYears(L.recording_date, today) > JUDGMENT_LIEN_YEARS)
      L.enforceability = "may be expired/satisfied — verify";
  }

  // ---- (E) BLANKET / cross-collateralized (loan-scoped pool) ----
  // The collateral pool is defined by the LOAN, not the owner: encumbered set =
  // PINs in the doc body ∪ PINs the doc is indexed under (recorder INDEX only —
  // never the owner's whole portfolio, never OCR of sibling docs).
  //
  // 2A: Run over EVERY reconciled mortgage (active + cleared_by_sale), not just active.
  // scopeChanges_ is populated inside the block below and exposed as scopeChanges after.
  const scopeChanges_: ScopeChange[] = [];
  //
  // A released loan's PIN set is needed for the timeline's parcel coverage band and
  // for detecting scope changes (2B). Nothing in this block depends on liveness.
  {
    // Canonicalize to the 14-digit Cook County parcel form: extractors copy
    // PINs verbatim, so "13-13-327-027" (10 digits, unit part omitted) must
    // equal subject "13133270270000" or a one-parcel loan false-positives as
    // blanket. Only 10- and 14-digit forms are trusted; anything else is dropped.
    const normPin = (p: string) => {
      const d = p.replace(/\D/g, "");
      if (d.length === 14) return d;
      if (d.length === 10) return d + "0000";
      return "";
    };
    const docPins = new Map<string, Set<string>>();
    const addPin = (dn: string, pin: string) => {
      const k = normPin(pin);
      if (!k) return;
      if (!docPins.has(dn)) docPins.set(dn, new Set());
      docPins.get(dn)!.add(k);
    };
    for (const d of docs) (d.pins || []).forEach(p => addPin(d.doc_number, p));
    if (indexByPin) for (const [pin, rows] of Object.entries(indexByPin))
      for (const r of (rows || []) as Array<{ docNumber: string }>) addPin(String(r.docNumber), pin);

    const thisPin = parcel?.pin ? normPin(parcel.pin) : null;

    // Every reconciled mortgage participates: current-owner active, explicitly
    // satisfied/released, and unreleased prior-owner debt cleared by a sale.
    const allMortgages: ResolvedMortgage[] = [...active, ...stackSatisfied, ...clearedBySale];
    // Track the FULL pin pool per mortgage doc number for scope-change comparison (2B).
    // blanket_pins only stores OTHER-than-subject pins; scope change needs the full set.
    const fullPoolByDocNumber = new Map<string, Set<string>>();
    for (const m of allMortgages) {
      const pool = new Set<string>([
        ...(m.pins || []).map(normPin),
        ...Array.from(docPins.get(m.doc_number) || []),
        ...(thisPin ? [thisPin] : []),
      ].filter(Boolean));
      const otherPins = Array.from(pool).filter(p => p !== thisPin);

      // SIGNAL 1 (strong, free): loan names / is indexed under >1 PIN
      let blanket = m.is_blanket || pool.size > 1;
      // SIGNAL 2 (soft fallback): amount >> this parcel's value AND owner holds another parcel
      if (!blanket && m.effective_amount && parcel?.value
        && m.effective_amount > parcel.value * BLANKET_VALUE_MULT && otherPins.length > 0)
        blanket = true;   // "likely" — suppress LTV, flag to confirm

      m.blanket = blanket;
      m.blanket_pins = blanket ? otherPins : [];
      if (blanket) {
        m.suppress_ltv = true;
        m.note = otherPins.length
          ? `cross-collateralized — this loan also encumbers ${otherPins.join(", ")}; per-parcel leverage not meaningful`
          : "blanket / cross-collateralized — spans multiple properties; per-parcel leverage not meaningful";
        // Pool LTV — the only meaningful leverage on a blanket loan. Any pool
        // pin we can't value ⇒ null with a note (never a partial denominator).
        // Only compute for active loans; cleared loans no longer burden the current owner.
        if (!m.resolved_by_sale) {
          const vals = Array.from(pool).map(p => (p === thisPin ? (parcel?.value ?? valueOf?.(p)) : valueOf?.(p)));
          const complete = vals.length > 0 && vals.every(v => typeof v === "number" && v > 0);
          const poolValue = complete ? (vals as number[]).reduce((s, v) => s + v, 0) : null;
          m.pool_value = poolValue;
          m.pool_ltv = poolValue && m.effective_amount ? +(m.effective_amount / poolValue).toFixed(2) : null;
          m.pool_ltv_note = poolValue ? null : "pool value incomplete — combined leverage not computed";
        }
      }
      // Store full pool for 2B scope-change detection.
      // Only track when the doc has explicit pins beyond the subject (pool.size > 1),
      // or was derived from the doc body itself (m.pins had entries). This prevents
      // loans with no PIN information from appearing to have a known empty set.
      const hasExplicitPins = (m.pins || []).length > 0 || (docPins.get(m.doc_number)?.size ?? 0) > 0;
      if (hasExplicitPins) fullPoolByDocNumber.set(m.doc_number, pool);
    }

    // ---- (2B) PARCEL SCOPE CHANGES — walk the first-position chain oldest → newest ----
    // For consecutive first-position / refinance-chain loans where the PIN sets are
    // both known and non-empty and differ, emit a scopeChange entry.
    // Results are written into scopeChanges_ (declared before this block).
    // Uses fullPoolByDocNumber (full pool including subject) rather than blanket_pins.
    const chainCandidates = [...allMortgages]
      .filter(m => fullPoolByDocNumber.has(m.doc_number)) // must have explicit PIN data
      .sort((a, b) => (a.recording_date || "").localeCompare(b.recording_date || ""));

    for (let i = 0; i < chainCandidates.length - 1; i++) {
      const older = chainCandidates[i];
      const newer = chainCandidates[i + 1];

      // Only compare consecutive first-position / refinance-chain pairs.
      // Explicitly released loans have no live position, so a similar-or-larger
      // later amount is the conservative replacement signal for that history.
      const amountSuggestsReplacement = older.effective_amount != null
        && newer.effective_amount != null
        && newer.effective_amount >= older.effective_amount * 0.9;
      const olderIsChain = older.refi_suspect || older.satisfied || older.resolved_by_sale || older.position === 1;
      const newerIsChain = newer.lien_kind !== "junior"
        && (amountSuggestsReplacement || older.refi_suspect || older.satisfied || older.resolved_by_sale);
      if (!olderIsChain || !newerIsChain) continue;

      // Cash-out signal belongs to the newer replacement loan. It describes
      // only the delta between recorded original principals, never proceeds.
      if (amountSuggestsReplacement
        && newer.effective_amount! > older.effective_amount! * 1.05) {
        newer.cashOutSuspect = true;
        newer.recordedDelta = newer.effective_amount! - older.effective_amount!;
      }

      // Require both sides have a known non-empty PIN set.
      // An empty set is missing data, not a release — brief §2B says "never emit when either side empty/unknown".
      const olderPool = fullPoolByDocNumber.get(older.doc_number)!;
      const newerPool = fullPoolByDocNumber.get(newer.doc_number)!;
      if (olderPool.size === 0 || newerPool.size === 0) continue; // missing data

      // Compute dropped/added relative to the full pool (subject pin included).
      // droppedPins = in older but not newer; addedPins = in newer but not older.
      const droppedPins = Array.from(olderPool).filter(p => !newerPool.has(p));
      const addedPins = Array.from(newerPool).filter(p => !olderPool.has(p));
      if (droppedPins.length === 0 && addedPins.length === 0) continue; // PIN sets equal — no change

      if (newer.recording_date) {
        scopeChanges_.push({
          atDocNumber: newer.doc_number,
          recordingDate: newer.recording_date,
          droppedPins,
          addedPins,
        });
      }
    }
  }

  const scopeChanges: ScopeChange[] = scopeChanges_;

  // ---- (F) EXTRACTION gaps ----
  for (const m of active) {
    if (m.lender == null || m.effective_amount == null) {
      m.extraction_gap = true;
      m.display_lender = m.lender ?? "— not extracted (open document)";
      m.position_confidence = "low";
    }
  }

  // ---- (G) OWNER-ENTITY resolution for name-indexed liens ----
  for (const L of liens) {
    if (!L.debtor_name) continue;
    if (!sameEntity(L.debtor_name, currentOwner))
      L.debtor_flag = "possible — confirm debtor identity";            // e.g. DON DEAL 5 LLC vs 6 LLC
  }

  return {
    current_owner: currentOwner,
    ownership_acquired: anchorRecDate ?? acquisitionDeed?.recording_date ?? null,
    acquired_via: viaJudicial ? (((anchorDeed as any)?.deed_subtype as string) || "receiver's/judicial sale")
      : (anchor.date ? "arms-length sale" : "unknown"),
    anchor,
    non_sale_transfers: nonSaleTransfers,
    active,
    combined_recorded_debt,
    satisfied: stackSatisfied,
    cleared_by_sale: clearedBySale,
    distress,
    foreclosure_active,
    liens,
    flags: [
      ...(foreclosure_active ? ["foreclosure_active"] : []),
      ...(active.some(m => m.blanket) ? ["blanket"] : []),
      ...(clearedBySale.length ? ["pre_sale_liens_cleared"] : []),
      ...(active.some(m => m.extraction_gap) ? ["extraction_gap"] : []),
    ],
    scopeChanges,
  };
}
