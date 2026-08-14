// Debt Snapshot — Stage 3 (server): build the resolved snapshot (`snap`) from
// Stages 1→2→2.5, cache it per PIN, and generate the AI takeaway FROM THE SAME
// OBJECT the card renders. The one hard rule: card and takeaway consume the
// same `snap` — no second computation, no re-fetch, no world knowledge.
//
// Cache: `debt_snapshot_cache` self-provisions (drizzle db:push is unusable in
// this project — legacy tables). Recorder docs are immutable, so the takeaway
// is regenerated only when hash(snap) changes; a failed generation persists a
// null sentinel for that hash so page views never re-bill.

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { ingestParcel, type ExtractedRecorderDoc } from "./recorderDocIngest";
import { debtReadWindowStart } from "./debtReadWindow";
import { reconcile } from "./debtReconcile";
import { applyMaturityEstimates } from "./debtMaturityEstimate";
import { resolveState, type ResolvedState, type SalesSectionRef } from "./debtResolveState";
import { getLienData } from "./lienSearch";
import { fetchSaleHistory } from "./pinResolver";
import { sanitizeRowHtml } from "./takeaway";

// ---------------------------------------------------------------------------
// Snapshot shape sent to BOTH the card and the takeaway model
export interface DebtSnap extends ResolvedState {
  docs_total: number;                       // all indexed recorder docs for the PIN
  report_estimated_value?: number | null;   // whitelisted cross-reference
  subject_is_commercial?: boolean | null;   // whitelisted cross-reference
}

export interface DebtTakeawayRow { tone: "good" | "caution" | "insight" | "bad"; html: string; chip: string | null }
export interface DebtTakeaway { title: string; rows: DebtTakeawayRow[] }

export interface DebtSnapshotRecord {
  pin: string;
  snap: DebtSnap;
  snapHash: string;
  takeaway: DebtTakeaway | null;
  takeawayHash: string | null;   // hash the takeaway (or null sentinel) was generated for
  generatedAt: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Self-provisioning cache table
let tableReady: Promise<unknown> | null = null;
function ensureTable(): Promise<unknown> {
  if (!tableReady) {
    tableReady = db.execute(`CREATE TABLE IF NOT EXISTS debt_snapshot_cache (
      pin text PRIMARY KEY,
      snap jsonb NOT NULL,
      snap_hash text NOT NULL,
      takeaway jsonb,
      takeaway_hash text,
      generated_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`).catch(e => { tableReady = null; throw e; });
  }
  return tableReady;
}

export async function getCachedDebtSnapshot(pin: string): Promise<DebtSnapshotRecord | null> {
  await ensureTable();
  const normalizedPin = pin.replace(/\D/g, "");
  const r: any = await db.execute(sql`SELECT * FROM debt_snapshot_cache WHERE pin = ${normalizedPin}`);
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    pin: row.pin,
    snap: typeof row.snap === "string" ? JSON.parse(row.snap) : row.snap,
    snapHash: row.snap_hash,
    takeaway: row.takeaway ? (typeof row.takeaway === "string" ? JSON.parse(row.takeaway) : row.takeaway) : null,
    takeawayHash: row.takeaway_hash ?? null,
    generatedAt: row.generated_at ? new Date(row.generated_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function saveRecord(rec: Omit<DebtSnapshotRecord, "updatedAt">): Promise<void> {
  await ensureTable();
  await db.execute(sql`INSERT INTO debt_snapshot_cache (pin, snap, snap_hash, takeaway, takeaway_hash, generated_at, updated_at)
    VALUES (${rec.pin.replace(/\D/g, "")}, ${JSON.stringify(rec.snap)}::jsonb, ${rec.snapHash},
      ${rec.takeaway ? JSON.stringify(rec.takeaway) : null}::jsonb, ${rec.takeawayHash}, ${rec.generatedAt}, now())
    ON CONFLICT (pin) DO UPDATE SET snap = EXCLUDED.snap, snap_hash = EXCLUDED.snap_hash,
      takeaway = EXCLUDED.takeaway, takeaway_hash = EXCLUDED.takeaway_hash,
      generated_at = EXCLUDED.generated_at, updated_at = now()`);
}

// ---------------------------------------------------------------------------
export function hashSnap(snap: DebtSnap): string {
  // report values are display context; the resolved record drives regeneration
  const { report_estimated_value, subject_is_commercial, ...core } = snap;
  return createHash("sha256").update(JSON.stringify({ pv: 2, core })).digest("hex").slice(0, 24);
}

/** Cache-only recorder index rows for the owner's OTHER parcels — blanket
 *  detection is index-only by design (never scrape/OCR a sibling parcel here).
 *  Siblings without a cached index are simply skipped. */
async function loadSiblingIndex(pins: string[]): Promise<Record<string, Array<{ docNumber: string }>>> {
  const out: Record<string, Array<{ docNumber: string }>> = {};
  for (const p of pins) {
    const normalized = p.replace(/\D/g, "");
    if (normalized.length !== 14) continue;
    const r: any = await db.execute(sql`SELECT documents_json FROM lien_cache WHERE pin = ${normalized}`);
    const raw = r.rows?.[0]?.documents_json;
    if (!raw) continue;
    const docs = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(docs)) out[normalized] = docs
      .filter((d: any) => d?.documentNumber)
      .map((d: any) => ({ docNumber: String(d.documentNumber) }));
  }
  return out;
}

/** Stage 2.5 patch — the report's Sales section as the ownership anchor.
 *  Single source of truth: the assessor sale history already excludes nominal
 *  transfers; a quit-claim never appears as a genuine sale. Fail-soft: any
 *  error → null → resolveState falls back to the deed-derived anchor. */
async function loadSalesSection(pin: string): Promise<SalesSectionRef | null> {
  try {
    const sales = await fetchSaleHistory(pin);
    if (!sales?.length) return null;
    const rows = sales.map(s => ({
      date: (s.saleDate || "").slice(0, 10) || null,
      price: s.salePrice || null,
      doc_number: s.docNo || null,
      // genuine sale = real consideration, not a quit-claim/gift transfer
      is_arms_length: (s.salePrice ?? 0) > 1000 && !/quit\s*-?\s*claim|gift/i.test(s.deedType || ""),
    }));
    const genuine = rows.filter(r => r.is_arms_length && r.date)
      .sort((a, b) => a.date!.localeCompare(b.date!));
    return {
      most_recent_sale_date: genuine.length ? genuine[genuine.length - 1].date! : null,
      sales: rows,
    };
  } catch (err: any) {
    console.warn(`[debtSnapshot] sales-section lookup failed (deed-derived anchor fallback): ${err?.message}`);
    return null;
  }
}

/** Build `snap` for a PIN: ingest (per-doc cached, immutable) → reconcile → resolve. */
export async function buildDebtSnap(
  pin: string,
  ctx?: {
    estimatedValue?: number | null;
    isCommercial?: boolean | null;
    coParcels?: Array<{ pin: string; estimatedValue?: number | null }> | null;
  },
): Promise<DebtSnap> {
  const normalizedPin = pin.replace(/\D/g, "");
  const coParcels = (ctx?.coParcels ?? []).filter(c => c.pin.replace(/\D/g, "") !== normalizedPin);
  const siblingIndexPromise = coParcels.length ? loadSiblingIndex(coParcels.map(c => c.pin)) : Promise.resolve(null);
  // Read-window optimization: the Sales section (assessor data, no OCR) gives
  // the genuine-sale anchor BEFORE ingest, so pre-window docs are index-only
  // stubs instead of download/OCR work. No genuine sale ⇒ null ⇒ full ingest.
  const salesSection = await loadSalesSection(normalizedPin);
  const windowStart = debtReadWindowStart(salesSection?.most_recent_sale_date ?? null);
  const docs = await ingestParcel(normalizedPin, { windowStart });
  const lienData = await getLienData(normalizedPin); // cached — count of ALL indexed docs
  const indexByPin = await siblingIndexPromise;
  const siblingValue = new Map(coParcels.map(c => [c.pin.replace(/\D/g, ""), c.estimatedValue ?? null]));
  const resolved = resolveState(
    reconcile(docs), docs,
    { pin: normalizedPin, value: ctx?.estimatedValue ?? null },
    { indexByPin, valueOf: (p: string) => siblingValue.get(p.replace(/\D/g, "")) ?? null, salesSection },
  );
  // Stage 3 maturity estimation — fallback ONLY where the paper is silent
  // (read-first precedence enforced inside). Zoning class comes from the
  // report; unknown zoning → no term estimate (never guess).
  applyMaturityEstimates(resolved.active, {
    residentialZoning: ctx?.isCommercial == null ? null : !ctx.isCommercial,
  });
  return {
    ...resolved,
    docs_total: lienData.documents?.length ?? docs.length,
    report_estimated_value: ctx?.estimatedValue ?? null,
    subject_is_commercial: ctx?.isCommercial ?? null,
  };
}

// ---------------------------------------------------------------------------
// Takeaway generation — the production prompt (attached spec) + validators.
const DEBT_TAKEAWAY_SYSTEM = `You write the "Debt Snapshot" takeaway for a property report. You receive a resolved debt snapshot JSON ("snap") — the exact object the report card renders. Return JSON only: {"title":"…one factual sentence…","rows":[{"tone":"good|caution|insight|bad","html":"…","chip":"Verify"|null}]}. 3–4 rows max. Only <b> tags in html.

GOVERNING RULE — Report-Data-First. Every figure you cite must be a value already in snap (or snap.report_estimated_value / snap.subject_is_commercial). No world knowledge, no fresh lookups, no re-derivation. If snap is silent, you are silent.

DEBT-SENSITIVITY GUARDRAILS:
1. Resolve state; never react to mere presence. A cleared_by_sale loan is history — never call it active debt. A "resolved" distress doc is NOT a live cloud. If foreclosure_active==false, never say "foreclosure", "pending litigation", or "clouds title" as a current condition.
2. Recorded amounts are not balances. Frame effective_amount as the recorded loan, never "the owner owes X today". No equity or payoff claims beyond snap.
3. Position is derived, not certified. Say "first position by recording order", never "guaranteed first lien". If extraction_gap==true, say so and soften — never a confident position beside a blank lender/amount.
4. Maturity uses the effective (modified) date. Never call a loan past due when a modification extended it. maturity_status at_maturity/past_maturity = calm caution watch-out; current = fine. maturity_source=="estimated" = the date is a term-based ESTIMATE, not a recorded maturity — always hedge with "est." and never assert past-due; maturity_status=="estimated_balloon_may_have_passed" = say the estimated balloon MAY have passed and to confirm the actual maturity — never a hard "past maturity". revolving==true = a line of credit with no fixed maturity ("revolving — renews; verify"), never a balloon date.
5. Blanket loans: suppress per-parcel leverage AND surface the cross-collateral fact. If blanket/suppress_ltv, never state a per-parcel LTV as meaningful or say "over-leveraged" — say the loan is cross-collateralized and, when blanket_pins is non-empty, that it also encumbers those parcels (a material condition: a buyer may not get a clean release of this parcel alone). You may note the per-parcel figure ONLY as an artifact that is not meaningful. Cite pool_ltv (combined loan-to-value across the pool) only if present; if pool_ltv is null, say combined leverage isn't computed rather than inventing one. Never sum a blanket loan as separate debt per parcel.
6. Judicial clearing is by court order with no recorded release — frame cleared_by_sale loans as extinguished by the sale AND note no recorded release exists (confirm at title).
7. Never mention property-tax liens — the report handles taxes elsewhere.
8. Multiple active liens: state the count and cite combined_recorded_debt (when present) as the combined RECORDED total. A lien_kind=="junior" loan ADDS to the debt (a second/home-equity) — never call it a refinance and never assume the first was paid off. A refi_suspect==true loan may have been replaced by the later similar-size loan but has NO recorded release — say "may be a refinance; confirm payoff", never assert it is gone. Debt is read from the anchor sale forward (anchor.date); a non_sale_transfers entry (e.g. a quit-claim) is a title/ownership change, NOT a sale — it cleared nothing and reset nothing. Never treat it as a sale or as clearing debt.

ROW ORDER (adapt to what snap says):
1. Live watch-item first: at_maturity/past_maturity → caution row + "Verify" chip: lender + effective_amount + status + modification's rate/maturity change + "no payoff or extension recorded" only if none is. If current → good/insight row on runway.
2. Position/priority → good when position==1 and no extraction_gap; mention cleared_by_sale loans as why the record looks busy but title is clear. extraction_gap → caution, softened.
3. Distress → good "no active distress" when foreclosure_active==false and no live liens; caution/bad only when genuinely active.
4. Context (insight): owner + acquisition + docs_total. Optional recorded-loan-to-value sentence ONLY if position==1, not suppress_ltv, report_estimated_value present — hedged.

TONES: good = clean first position / no active distress / extinguished prior liens. caution = at_maturity, past_maturity, inferred-verify, extraction_gap (calm, with "Verify" chip when action is needed). bad = ONLY foreclosure_active==true or a live in-force judgment/mechanics lien. insight = neutral context. Never color an at_maturity loan bad.

Title: one factual sentence carrying the single most important fact (e.g. clean first position + at-maturity watch-item together). Return valid JSON only, no markdown fences, no prose after the JSON.`;

/** Collect every number the model is allowed to cite, in normalized string form. */
export function collectSnapNumbers(snap: DebtSnap): Set<string> {
  const allowed = new Set<string>();
  const addNum = (n: number) => {
    if (!Number.isFinite(n)) return;
    allowed.add(String(n));
    if (Number.isInteger(n) && Math.abs(n) >= 1000) {
      allowed.add(n.toLocaleString("en-US"));
      if (n % 1000 === 0) allowed.add(String(n / 1000)); // $399K form
    }
  };
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "number") return addNum(v);
    if (typeof v === "string") {
      // dates → year/month/day parts + m/d/yyyy form
      const d = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (d) { allowed.add(d[1]); allowed.add(String(+d[2])); allowed.add(String(+d[3])); }
      for (const m of Array.from(v.matchAll(/\d[\d,.]*/g))) addNum(Number(m[0].replace(/,/g, "")));
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") return Object.values(v as object).forEach(walk);
  };
  walk(snap);
  // derived LTV (rounded %) is permitted when value present
  const amt = snap.active?.[0]?.effective_amount;
  if (snap.report_estimated_value && amt) {
    const pct = Math.round((amt / snap.report_estimated_value) * 100);
    for (const p of [pct - 1, pct, pct + 1]) allowed.add(String(p));
  }
  // pooled LTV (blanket): EXACT rendered % only (card shows round(pool_ltv*100)
  // — same-binding rule: cited and displayed values must be identical) + the
  // exact $M forms the card renders (fmtM: toFixed(2), trailing zeros trimmed).
  const poolLtv = snap.active?.[0]?.pool_ltv;
  if (poolLtv != null) allowed.add(String(Math.round(poolLtv * 100)));
  const asCardM = (n: number) => (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "");
  const poolValue = snap.active?.[0]?.pool_value;
  if (poolValue) allowed.add(asCardM(poolValue));
  if (amt) allowed.add(asCardM(amt));
  return allowed;
}

export function validateDebtTakeaway(snap: DebtSnap, parsed: any): { ok: boolean; reason?: string } {
  if (!parsed || typeof parsed.title !== "string" || !parsed.title.trim()) return { ok: false, reason: "missing title" };
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 2 || parsed.rows.length > 4) return { ok: false, reason: `rows ${parsed.rows?.length ?? 0}` };
  const tones = new Set(["good", "caution", "insight", "bad"]);
  const allowed = collectSnapNumbers(snap);
  const fullText = [parsed.title, ...parsed.rows.map((r: any) => String(r?.html ?? ""))].join(" ");
  for (const r of parsed.rows) {
    if (!tones.has(r?.tone)) return { ok: false, reason: `bad tone "${r?.tone}"` };
    if (typeof r?.html !== "string" || !r.html.trim()) return { ok: false, reason: "empty row html" };
    if (r.chip != null && r.chip !== "Verify") return { ok: false, reason: `bad chip "${r.chip}"` };
    if (r.tone === "bad" && !snap.foreclosure_active && !snap.liens.some(l => /live|in force/i.test(l.enforceability ?? ""))) {
      return { ok: false, reason: "bad tone without active distress" };
    }
  }
  // Guardrail 1 — no live-distress language when the state is resolved
  if (!snap.foreclosure_active) {
    for (const seg of [parsed.title, ...parsed.rows.map((r: any) => r.html)]) {
      const t = String(seg);
      if (/foreclos|lis pendens|litigation/i.test(t) && !/\b(no|none|zero|not|without|resolved|pre-\d{4}|historic)\b/i.test(t)) {
        return { ok: false, reason: "implies live distress while foreclosure_active=false" };
      }
    }
  }
  // Guardrail 4 — never "past due" when status isn't past_maturity
  if (snap.active[0]?.maturity_status !== "past_maturity" && /past due|overdue|years past/i.test(fullText)) {
    return { ok: false, reason: "past-due claim without past_maturity" };
  }
  // Guardrail 5 — blanket: "over-leveraged" never; LTV language allowed ONLY
  // when a pooled LTV actually exists in snap (then it must cite the pool).
  const primaryLien = snap.active[0];
  const isBlanket = !!(primaryLien?.suppress_ltv || primaryLien?.blanket);
  if (isBlanket && /over-?leverag/i.test(fullText)) {
    return { ok: false, reason: "over-leveraged claim on blanket loan" };
  }
  if (isBlanket && primaryLien?.pool_ltv == null && /\bLTV|loan-to-value/i.test(fullText)) {
    return { ok: false, reason: "LTV claim on blanket loan without pool_ltv" };
  }
  // Blanket + pool_ltv present: the per-parcel percentage may appear ONLY when
  // the same segment explicitly labels it an artifact / not meaningful; any
  // other %-figure in leverage/value context must be the EXACT pooled %.
  if (isBlanket && primaryLien?.pool_ltv != null) {
    const pooledPctStr = String(Math.round(primaryLien.pool_ltv * 100));
    const perPct = primaryLien.effective_amount && snap.report_estimated_value
      ? Math.round((primaryLien.effective_amount / snap.report_estimated_value) * 100) : null;
    for (const seg of [parsed.title, ...parsed.rows.map((r: any) => String(r.html))]) {
      for (const m of Array.from(String(seg).matchAll(/~?(\d[\d,.]*)\s*%/g))) {
        const n = m[1].replace(/,/g, "");
        if (n === pooledPctStr) continue;
        const isPerParcel = perPct != null && Math.abs(Number(n) - perPct) <= 1;
        const artifactLabeled = /artifact|not meaningful|isn'?t meaningful|no[t]? meaningful/i.test(String(seg));
        if (isPerParcel && !artifactLabeled) return { ok: false, reason: "per-parcel LTV presented without artifact label" };
        if (!isPerParcel && /valu|leverag|equity|worth|LTV|loan-to-value/i.test(String(seg))) {
          return { ok: false, reason: `non-pooled ratio "${m[0]}" in leverage context on blanket loan` };
        }
      }
    }
  }
  // Guardrail 7
  if (/\btax lien|property tax/i.test(fullText)) return { ok: false, reason: "tax lien mention" };
  // Full-date tracing — "July 31, 2026", "7/31/2026" style dates must be REAL
  // snap dates, not recombinations of allowed parts (day≤31 would slip past
  // the small-integer exemption below).
  const isoDates = new Set<string>();
  (function collectDates(v: unknown) {
    if (v == null) return;
    if (typeof v === "string") { const m = v.match(/^(\d{4}-\d{2}-\d{2})/); if (m) isoDates.add(m[1]); return; }
    if (Array.isArray(v)) return v.forEach(collectDates);
    if (typeof v === "object") return Object.values(v as object).forEach(collectDates);
  })(snap);
  const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  for (const m of Array.from(fullText.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/gi))) {
    if (!isoDates.has(iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]))) return { ok: false, reason: `untraceable date "${m[0]}"` };
  }
  for (const m of Array.from(fullText.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g))) {
    if (!isoDates.has(iso(+m[3], +m[1], +m[2]))) return { ok: false, reason: `untraceable date "${m[0]}"` };
  }
  // Guardrail 5 (structural): when a blanket loan has NO computed pool LTV,
  // no % figure may sit next to value/leverage/equity language — a pooled
  // ratio can't be invented. (With pool_ltv present, the % is traced above.)
  if (isBlanket && primaryLien?.pool_ltv == null) {
    for (const seg of [parsed.title, ...parsed.rows.map((r: any) => String(r.html))]) {
      if (/%/.test(seg) && /valu|leverag|equity|worth/i.test(seg)) return { ok: false, reason: "value-ratio wording on blanket loan" };
    }
  }
  // Number tracing — every numeric token must exist in snap (dates, amounts, %).
  // Small integers ≤ 31 pass freely (date parts, list counts) like the report's
  // other validators; everything else must trace.
  for (const m of Array.from(fullText.matchAll(/\$?\d[\d,]*(?:\.\d+)?%?K?/gi))) {
    const raw = m[0].replace(/[$%]/g, "");
    const isK = /k$/i.test(raw);
    const numStr = raw.replace(/k$/i, "");
    const n = Number(numStr.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (!isK && n <= 31 && Number.isInteger(n)) continue;
    const candidates = isK ? [String(n), String(n * 1000), (n * 1000).toLocaleString("en-US")] : [String(n), n.toLocaleString("en-US"), numStr];
    if (!candidates.some(c => allowed.has(c))) return { ok: false, reason: `untraceable number "${m[0]}"` };
  }
  return { ok: true };
}

/** Generate the validated debt takeaway from `snap`. Reject → retry once → null (fail closed). */
export async function generateDebtTakeaway(snap: DebtSnap): Promise<DebtTakeaway | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await client.messages.create({
        model: process.env.REPORT_MODEL || "claude-sonnet-5",
        max_tokens: 3000, // thinking tokens count against max_tokens on this model
        system: DEBT_TAKEAWAY_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(snap) }],
        ...({ thinking: { type: "adaptive" }, output_config: { effort: "low" } } as any),
      });
      const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
      if (!text || msg.stop_reason === "max_tokens") throw new Error(`Empty/truncated debt takeaway (stop_reason=${msg.stop_reason})`);
      // string-aware extraction — models sometimes append prose after the JSON
      const parsed = extractJson(text.replace(/^```json?\s*|```\s*$/g, ""));
      const check = validateDebtTakeaway(snap, parsed);
      if (check.ok) {
        return {
          title: parsed.title.trim(),
          rows: parsed.rows.map((r: any) => ({ tone: r.tone, html: sanitizeRowHtml(r.html.trim()), chip: r.chip ?? null })),
        };
      }
      console.warn(`[TAKEAWAY:debt] attempt ${attempt} rejected: ${check.reason} :: ${text.slice(0, 400)}`);
    } catch (err: any) {
      console.warn(`[TAKEAWAY:debt] attempt ${attempt} failed: ${err.message}`);
    }
  }
  return null;
}

/** String-aware first-JSON-object extraction (models append prose after JSON). */
function extractJson(s: string): any {
  const start = s.indexOf("{");
  if (start === -1) throw new Error("no JSON object");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error("unterminated JSON object");
}

// ---------------------------------------------------------------------------
/** Full pipeline: build snap, cache it, (re)generate the takeaway only when
 *  hash(snap) changed. Returns the persisted record. */
export async function refreshDebtSnapshot(
  pin: string,
  ctx?: {
    estimatedValue?: number | null;
    isCommercial?: boolean | null;
    coParcels?: Array<{ pin: string; estimatedValue?: number | null }> | null;
  },
): Promise<DebtSnapshotRecord> {
  const normalizedPin = pin.replace(/\D/g, "");
  const snap = await buildDebtSnap(normalizedPin, ctx);
  const snapHash = hashSnap(snap);
  const cached = await getCachedDebtSnapshot(normalizedPin);

  let takeaway = cached?.takeaway ?? null;
  let takeawayHash = cached?.takeawayHash ?? null;
  let generatedAt = cached?.generatedAt ?? null;
  const needsGeneration = takeawayHash !== snapHash && snap.docs_total > 0;
  if (needsGeneration) {
    takeaway = await generateDebtTakeaway(snap); // null = fail-closed sentinel for this hash
    takeawayHash = snapHash;
    generatedAt = new Date().toISOString();
  }
  console.log(`[debtSnapshot] ${normalizedPin}: hash=${snapHash} regenerated=${needsGeneration} active=${snap.active.length} cleared=${snap.cleared_by_sale.length} foreclosure_active=${snap.foreclosure_active}`);
  const rec = { pin: normalizedPin, snap, snapHash, takeaway, takeawayHash, generatedAt };
  await saveRecord(rec);
  return { ...rec, updatedAt: new Date().toISOString() };
}
