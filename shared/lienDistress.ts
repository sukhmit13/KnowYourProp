// Liens section — distress resolution. Pure, deterministic, shared by the
// client card and tests.
//
// THE RULE: a distress filing (lis pendens / foreclosure / notice of default)
// recorded BEFORE the most recent GENUINE sale is resolved — a real sale after
// the filing clears prior litigation from title. "Genuine sale" comes from the
// Sales section (assessor sale history), never from a bare recorder deed:
// - warranty-deed / arms-length sale = real sale → clears prior distress
// - quit-claim / nominal / intra-owner transfer = NOT a sale → clears nothing
//
// Guardrail 0: resolve STATE, never react to presence. The headline, the
// section chip, and the KPI all read from the SAME resolved state returned
// here — they cannot disagree.

export interface DistressDocLike {
  documentNumber?: string | null;
  recordedDate?: string | null;
  isReleased?: boolean;
  isProbablyCleared?: boolean;
}

export interface SaleRowLike {
  saleDate?: string | null;
  salePrice?: number | null;
  deedType?: string | null;
}

export interface MortgageDocLike {
  recordedDate?: string | null;
  grantor?: string | null; // recorder index: mortgage grantor = borrower
  documentType?: string | null;
}

/** New financing (origination/refi/HELOC) — NOT a modification, extension,
 *  amendment, or assignment of a pre-filing loan (those imply no fresh title
 *  clearance). */
export function isNewOrigination(m: MortgageDocLike): boolean {
  const t = (m.documentType || "").toUpperCase();
  return !["MOD", "EXTENSION", "AMEND", "ASSIGN", "SUBORDINAT"].some(k => t.includes(k));
}

/** Accepts "YYYY-MM-DD(THH…)" and "MM/DD/YYYY". Null for anything else —
 *  including impossible calendar dates (2020-02-31 etc.), which Date.parse
 *  would silently normalize. An unparseable date must NEVER resolve a filing. */
export function parseFlexDate(s: string | null | undefined): number | null {
  if (!s) return null;
  let y: number, mo: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  const us = iso ? null : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
  else if (us) { y = +us[3]; mo = +us[1]; d = +us[2]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // round-trip check rejects normalized impossible dates
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.getTime();
}

/** Most recent GENUINE sale from the Sales section — real consideration and
 *  not a quit-claim/gift/nominal transfer. Null when no real sale exists. */
export function genuineSaleAnchor(sales: SaleRowLike[] | null | undefined): { time: number; year: number } | null {
  let best: number | null = null;
  for (const s of sales ?? []) {
    if (!((s.salePrice ?? 0) > 1000)) continue;                       // nominal → not a sale
    if (/quit\s*-?\s*claim|gift/i.test(s.deedType || "")) continue;   // taker takes subject to prior filings
    const t = parseFlexDate(s.saleDate);
    if (t !== null && (best === null || t > best)) best = t;
  }
  return best === null ? null : { time: best, year: new Date(best).getUTCFullYear() };
}

const normEntity = (s: string | null | undefined): string =>
  (s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\b(LLC|INC|CORP|TRUST|TR|CO|COMPANY|NA|N A)\b/g, "").replace(/\s+/g, " ").trim();

/** Loose same-entity check for owner ↔ mortgage-borrower comparison. */
export function sameEntityLoose(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normEntity(a), nb = normEntity(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export interface ResolvedDistress {
  activeCount: number;
  resolvedCount: number;
  /** how the resolved filings cleared — "sale" dominates messaging.
   *  "financing" is softer than a recorded dismissal: display as
   *  "resolved (financing after filing — clean title implied), verify". */
  resolvedBy: "sale" | "financing" | "released" | "stale" | null;
  /** year of the clearing sale (when resolvedBy === "sale") */
  resolvedSaleYear: number | null;
  /** year of the oldest resolved filing — for "a {year} lis pendens" copy */
  oldestResolvedYear: number | null;
}

/**
 * Resolve lis-pendens/foreclosure filings against the sales anchor.
 * Order of resolvers per filing:
 *   1. explicitly released/dismissed (isReleased from the recorder index)
 *   2. a GENUINE sale recorded after the filing (the main resolver)
 *   3. NEW financing (origination/refi/HELOC) after the filing — the lender
 *      required clean title to close; owner-agnostic, softer than a dismissal
 * A filing none of these touch stays ACTIVE.
 */
export function resolveDistress(
  filings: DistressDocLike[] | null | undefined,
  sales: SaleRowLike[] | null | undefined,
  opts?: {
    mortgages?: MortgageDocLike[] | null;
    /** kept for back-compat only; the financing resolver is owner-agnostic —
     *  whoever borrowed needed clean title to close */
    currentOwner?: string | null;
    /** treat unresolved filings older than N years as stale/historical
     *  (matches the long-standing product heuristic for foreclosures);
     *  requires a parseable filing date — unknown dates stay active */
    staleYears?: number;
    /** clock for staleness (tests); defaults to now */
    nowMs?: number;
  },
): ResolvedDistress {
  const anchor = genuineSaleAnchor(sales);
  const mortgages = opts?.mortgages ?? [];
  const owner = opts?.currentOwner ?? null;
  const now = opts?.nowMs ?? Date.now();

  let active = 0, resolved = 0;
  let resolvedBy: ResolvedDistress["resolvedBy"] = null;
  let resolvedSaleYear: number | null = null;
  let oldestResolvedYear: number | null = null;

  for (const f of filings ?? []) {
    const ft = parseFlexDate(f.recordedDate);
    let state: "active" | ResolvedDistress["resolvedBy"] = "active";

    if (f.isReleased || f.isProbablyCleared) state = "released";
    else if (anchor && ft !== null && ft < anchor.time) state = "sale";
    // financing after the filing — the lender required clean title to
    // originate. Owner-agnostic; NEW originations only (mods/assignments of a
    // pre-filing loan prove nothing).
    else if (ft !== null && mortgages.some(m => {
      const mt = parseFlexDate(m.recordedDate);
      return mt !== null && mt > ft && isNewOrigination(m);
    })) state = "financing";
    else if (opts?.staleYears && ft !== null && now - ft >= opts.staleYears * 365.25 * 24 * 3600 * 1000) state = "stale";

    if (state === "active") { active++; continue; }
    resolved++;
    // "sale" is the strongest story for messaging; keep it once seen
    if (state === "sale") { resolvedBy = "sale"; resolvedSaleYear = anchor!.year; }
    else if (resolvedBy !== "sale") resolvedBy = state;
    if (ft !== null) {
      const y = new Date(ft).getUTCFullYear();
      if (oldestResolvedYear === null || y < oldestResolvedYear) oldestResolvedYear = y;
    }
  }
  return { activeCount: active, resolvedCount: resolved, resolvedBy, resolvedSaleYear, oldestResolvedYear };
}
