// ─── Debt Snapshot Stage 1: recorder-document ingest + extraction ───
// For each recorded document in a parcel's property-records list, produce a
// structured JSON object: fetch the file inside a live recorder session →
// use its PDF text layer if present (free) → fall back to Mistral OCR only
// for scans → extract fields with Claude. Results are cached forever by
// document number (recorded instruments are immutable).
//
// Stage 2 (reconciliation / lien-stack) will consume the array returned by
// ingestParcel(); for now it is logged.

import { db } from "./db";
import { recorderDocCache, type LienDocument } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getLienData } from "./lienSearch";

const EXTRACT_MODEL = "claude-haiku-4-5";
const OCR_MODEL = "mistral-ocr-latest";
const CONCURRENCY = 4; // OCR + LLM extraction workers
const MIN_TEXT_LAYER_CHARS = 100; // below this, treat the PDF as a scan → OCR

export interface ExtractedRecorderDoc {
  doc_number: string;
  doc_type: string;
  recording_date: string | null;
  execution_date: string | null;
  pins: string[];
  parties: { borrower: string | null; lender: string | null; assignor: string | null; assignee: string | null };
  amount: number | null;                     // LOAN principal from the doc body — NOT the index consideration
  index_consideration_amount: number | null; // consideration/transfer figure if the doc restates it
  interest_rate: number | null;              // annual %, e.g. 5.25
  maturity_date: string | null;
  modifies: {                                // null unless doc_type = modification/amendment
    references_doc: string | null;
    new_amount: number | null;
    new_maturity_date: string | null;
    new_interest_rate: number | null;
    summary: string | null;
  } | null;
  references_docs: string[];
  debtor_name: string | null;
  is_partial: boolean;
  is_blanket: boolean;
  /** Revolving/open-end instrument (HELOC, business LOC). Optional — older
   *  cached extractions predate this flag; absent = false. */
  is_credit_line?: boolean;
  extraction_confidence: "high" | "medium" | "low";
  /** "index" = index-only stub (pre-sale-window doc; never downloaded/OCR'd,
   *  never cached in recorder_doc_cache). */
  text_source: "text-layer" | "ocr" | "index";
  /** True only on index-only stubs built from the recorder index row. */
  index_only?: boolean;
}

// ─── Doc-type relevance filter ───────────────────────────────────────────────
// Only ingest the doc types the debt engine uses: mortgage, release,
// satisfaction, assignment, modification, subordination, deed, lis_pendens,
// foreclosure, notice_default, judgment_lien, tax_lien, mechanics_lien.
const RELEVANT_CATEGORIES = new Set([
  "mortgage", "release", "deed", "foreclosure", "litigation",
  "judgment", "federal_tax", "state_tax", "mechanic", "lien", "other_lien",
]);
const RELEVANT_TYPE_RE = /assign|modif|subordinat|satisfact|lis\s*pendens|notice\s*of\s*default/i;
const SKIP_TYPE_RE = /financing\s*stmt|\bucc\b|plat\s|survey|certificate\s*of\s*error/i;

export function isRelevantRecorderDoc(d: Pick<LienDocument, "documentType" | "category">): boolean {
  if (SKIP_TYPE_RE.test(d.documentType || "")) return false;
  return RELEVANT_CATEGORIES.has(d.category) || RELEVANT_TYPE_RE.test(d.documentType || "");
}

// ─── Cache ───────────────────────────────────────────────────────────────────
// Idempotent provisioning: guarantees the table exists in any environment
// (drizzle-kit push is blocked in this project by unrelated legacy tables).
let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db.execute(`CREATE TABLE IF NOT EXISTS recorder_doc_cache (
      doc_number text PRIMARY KEY,
      extraction jsonb NOT NULL,
      text_source text NOT NULL,
      created_at timestamp DEFAULT now()
    )` as any).then(() => undefined).catch(e => { tableReady = null; throw e; });
  }
  return tableReady;
}

async function cacheGet(docNumber: string): Promise<ExtractedRecorderDoc | null> {
  await ensureTable();
  const rows = await db.select().from(recorderDocCache).where(eq(recorderDocCache.docNumber, docNumber)).limit(1);
  return rows[0] ? (rows[0].extraction as ExtractedRecorderDoc) : null;
}

async function cacheSet(docNumber: string, doc: ExtractedRecorderDoc): Promise<void> {
  await ensureTable();
  await db.insert(recorderDocCache)
    .values({ docNumber, extraction: doc, textSource: doc.text_source })
    // last validated write wins — allows repairing an earlier bad extraction by re-ingesting
    .onConflictDoUpdate({ target: recorderDocCache.docNumber, set: { extraction: doc, textSource: doc.text_source } });
}

// ─── Extraction validation — never cache a malformed or misdirected object ──
const DOC_TYPES = new Set(["mortgage","release","satisfaction","assignment","modification","subordination","deed","lis_pendens","foreclosure","notice_default","judgment_lien","tax_lien","mechanics_lien","ucc","other"]);
const CONFIDENCES = new Set(["high","medium","low"]);
const normDocNum = (s: string) => (s || "").replace(/[^0-9A-Za-z]/g, "").replace(/^0+/, "");

function validateExtraction(obj: any, expectedDocNumber: string): asserts obj is ExtractedRecorderDoc {
  const fail = (why: string) => { throw new Error(`Invalid extraction for doc ${expectedDocNumber}: ${why}`); };
  if (!obj || typeof obj !== "object") fail("not an object");
  if (typeof obj.doc_number !== "string" || !obj.doc_number) fail("missing doc_number");
  if (normDocNum(obj.doc_number) !== normDocNum(expectedDocNumber)) fail(`doc_number mismatch ("${obj.doc_number}")`);
  if (!DOC_TYPES.has(obj.doc_type)) fail(`bad doc_type "${obj.doc_type}"`);
  if (obj.recording_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(obj.recording_date)) fail("bad recording_date");
  if (obj.execution_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(obj.execution_date)) fail("bad execution_date");
  if (!Array.isArray(obj.pins) || obj.pins.some((p: any) => typeof p !== "string")) fail("bad pins");
  if (!obj.parties || typeof obj.parties !== "object") fail("missing parties");
  for (const k of ["borrower","lender","assignor","assignee"]) {
    if (obj.parties[k] !== null && typeof obj.parties[k] !== "string") fail(`bad parties.${k}`);
  }
  if (obj.amount !== null && typeof obj.amount !== "number") fail("bad amount");
  if (obj.index_consideration_amount !== null && typeof obj.index_consideration_amount !== "number") fail("bad index_consideration_amount");
  if (obj.interest_rate !== null && typeof obj.interest_rate !== "number") fail("bad interest_rate");
  if (obj.maturity_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(obj.maturity_date)) fail("bad maturity_date");
  if (obj.modifies !== null) {
    if (typeof obj.modifies !== "object") fail("bad modifies");
    if (obj.modifies.references_doc !== null && typeof obj.modifies.references_doc !== "string") fail("bad modifies.references_doc");
    if (obj.modifies.new_amount !== null && typeof obj.modifies.new_amount !== "number") fail("bad modifies.new_amount");
    if (obj.modifies.new_maturity_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(obj.modifies.new_maturity_date)) fail("bad modifies.new_maturity_date");
    if (obj.modifies.new_interest_rate !== null && typeof obj.modifies.new_interest_rate !== "number") fail("bad modifies.new_interest_rate");
    if (obj.modifies.summary !== null && typeof obj.modifies.summary !== "string") fail("bad modifies.summary");
  }
  if (!Array.isArray(obj.references_docs) || obj.references_docs.some((r: any) => typeof r !== "string")) fail("bad references_docs");
  if (obj.debtor_name !== null && typeof obj.debtor_name !== "string") fail("bad debtor_name");
  if (typeof obj.is_partial !== "boolean" || typeof obj.is_blanket !== "boolean") fail("bad is_partial/is_blanket");
  obj.is_credit_line = obj.is_credit_line === true; // tolerate absence (older cached docs); coerce to boolean
  if (!CONFIDENCES.has(obj.extraction_confidence)) fail("bad extraction_confidence");
}

// ─── Text acquisition: PDF text layer first, Mistral OCR only for scans ─────
async function pdfTextLayer(bytes: Buffer): Promise<{ text: string; pages: number } | null> {
  try {
    const { PDFParse } = await import("pdf-parse") as any;
    const parser = new PDFParse({ data: bytes, verbosity: 0 });
    const result = await parser.getText();
    const text = (result.text as string) || "";
    const pages = Number(result.total ?? result.numpages ?? result.pages?.length ?? 1) || 1;
    return text ? { text, pages } : null;
  } catch {
    return null;
  }
}

async function mistralOcr(bytes: Buffer, isPdf: boolean): Promise<string> {
  if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY is not set");
  const { Mistral } = await import("@mistralai/mistralai");
  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  const b64 = bytes.toString("base64");
  const resp = await mistral.ocr.process({
    model: OCR_MODEL,
    document: isPdf
      ? { type: "document_url", documentUrl: `data:application/pdf;base64,${b64}` }
      : { type: "image_url", imageUrl: `data:image/png;base64,${b64}` },
  });
  const text = (resp.pages || []).map((p: any) => p.markdown).join("\n\n");
  if (!text.trim()) throw new Error("Mistral OCR returned no text");
  return text;
}

export async function getDocText(bytes: Buffer): Promise<{ text: string; source: "text-layer" | "ocr" }> {
  const isPdf = bytes.slice(0, 4).toString() === "%PDF";
  if (isPdf) {
    const layer = await pdfTextLayer(bytes);
    // A scanned instrument still carries a recorder stamp in the text layer, so a flat
    // char minimum misfires — require real per-page text density before skipping OCR.
    if (layer && layer.text.trim().length > Math.max(MIN_TEXT_LAYER_CHARS, 200 * layer.pages)) {
      return { text: layer.text, source: "text-layer" };
    }
  }
  return { text: await mistralOcr(bytes, isPdf), source: "ocr" };
}

// ─── Grounded extraction (prompt must stay as-is; null when absent) ─────────
const EXTRACTION_PROMPT = `You read ONE recorded real-estate instrument and output a JSON object. Ground EVERY field in the document text; if a field is not stated, use null — never guess an amount, party, rate, maturity, or date. Copy identifiers (doc numbers, PINs, amounts, dates, names) verbatim. CAPTURE EVERY REFERENCED DOC NUMBER (a release names the mortgage it satisfies; an assignment/modification names the mortgage it acts on). For a judgment/tax lien, extract debtor_name.
Output ONLY this JSON:
{ "doc_number": string, "doc_type": "mortgage|release|satisfaction|assignment|modification|subordination|deed|lis_pendens|foreclosure|notice_default|judgment_lien|tax_lien|mechanics_lien|ucc|other",
  "recording_date": "YYYY-MM-DD|null", "execution_date": "YYYY-MM-DD|null", "pins": [string],
  "parties": { "borrower": string|null, "lender": string|null, "assignor": string|null, "assignee": string|null },
  "amount": number|null, "index_consideration_amount": number|null, "interest_rate": number|null, "maturity_date": "YYYY-MM-DD|null",
  "modifies": { "references_doc": string|null, "new_amount": number|null, "new_maturity_date": "YYYY-MM-DD|null", "new_interest_rate": number|null, "summary": string|null } | null,
  "references_docs": [string], "debtor_name": string|null,
  "is_partial": boolean, "is_blanket": boolean, "is_credit_line": boolean, "extraction_confidence": "high|medium|low" }
Rules:
- "amount" is the LOAN principal stated in the document BODY (e.g. "secures a note in the principal amount of ..."), NOT the consideration/transfer-tax figure from the recording stamp or index. If the document restates a consideration or transfer figure that differs from the loan principal, put that figure in "index_consideration_amount". Never report a consideration amount as the loan amount.
- "interest_rate" is the annual rate as a number (e.g. 5.25 for 5.25%); null if not stated.
- "execution_date" is the date the instrument was signed/executed (often distinct from the recording date).
- "modifies" is null unless doc_type is modification (or an amendment acting on a prior instrument). When present: references_doc = the doc number of the instrument being modified; new_amount/new_maturity_date/new_interest_rate = the superseding terms this modification sets (null for any term it leaves unchanged); summary = one short sentence of what changed. Also include the referenced doc number(s) in references_docs.
- DEED docs — put the GRANTOR (seller) in "parties.assignor", the GRANTEE (new owner / buyer) in "parties.assignee", and the stated consideration / transfer-tax value in "index_consideration_amount". The ownership timeline reads these to know who owned the property when, and to test whether a transfer was arms-length.
- is_credit_line = true when the document says "line of credit," "revolving," "open-end," "maximum indebtedness/principal," "HELOC," or "equity line" — a revolving instrument, not a fixed-term loan.
- extraction_confidence = low if OCR text is garbled/sparse. is_blanket = true if the instrument names multiple PINs/properties. Never invent a reference number.`;

// The model sometimes appends commentary after the JSON object — take the
// first balanced {...} block only (string-aware brace counting).
function extractFirstJsonObject(raw: string, docNumber: string): string {
  const start = raw.indexOf("{");
  if (start === -1) throw new Error(`No JSON object in extraction output for doc ${docNumber}`);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }
  throw new Error(`Unbalanced JSON in extraction output for doc ${docNumber}`);
}

async function extractDoc(args: { docNumber: string; indexTypeHint?: string; indexDateHint?: string; text: string; ocrSource: "text-layer" | "ocr" }): Promise<ExtractedRecorderDoc> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: EXTRACT_MODEL, max_tokens: 1024, system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content:
      `DOC_NUMBER: ${args.docNumber}\nINDEX_TYPE_HINT: ${args.indexTypeHint ?? ""}\nINDEX_DATE_HINT: ${args.indexDateHint ?? ""}\nTEXT_SOURCE: ${args.ocrSource}\n\nDOCUMENT TEXT:\n${args.text}` }],
  });
  // Join all text blocks; fail hard on truncation or empty output rather than storing a bad extraction.
  if (msg.stop_reason === "max_tokens") throw new Error(`Extraction truncated for doc ${args.docNumber}`);
  const raw = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim().replace(/^```json\s*|\s*```$/g, "");
  if (!raw) throw new Error(`Empty extraction output for doc ${args.docNumber}`);
  const obj = JSON.parse(extractFirstJsonObject(raw, args.docNumber));
  obj.text_source = args.ocrSource;
  validateExtraction(obj, args.docNumber);
  return obj;
}

// ─── Public API ──────────────────────────────────────────────────────────────
export type RecorderIndexRow = Pick<LienDocument, "documentNumber" | "documentType" | "recordedDate" | "category"> & { amount?: number | null };

/**
 * Ingest one recorder document. `fetchBytes` supplies the document file —
 * recorder viewLinks carry session-scoped tokens, so bytes must be fetched
 * inside a live recorder session (ingestParcel wires this up).
 */
export async function ingestDoc(indexRow: RecorderIndexRow, fetchBytes: () => Promise<Buffer>): Promise<ExtractedRecorderDoc> {
  const cached = await cacheGet(indexRow.documentNumber); // recorder docs are immutable — cache forever
  if (cached) return cached;
  const bytes = await fetchBytes();
  const { text, source } = await getDocText(bytes);
  const doc = await extractDoc({
    docNumber: indexRow.documentNumber,
    indexTypeHint: indexRow.documentType,
    indexDateHint: indexRow.recordedDate,
    text,
    ocrSource: source,
  });
  // Deterministic backfill: the recorder index carries the consideration figure
  // even when the document body doesn't restate it (e.g. receiver's deeds).
  if (doc.index_consideration_amount == null && typeof indexRow.amount === "number" && indexRow.amount > 0) {
    doc.index_consideration_amount = indexRow.amount;
  }
  await cacheSet(indexRow.documentNumber, doc);
  return doc;
}

// ─── Session-scoped document download ───────────────────────────────────────
// The recorder's Document/Detail and Document/DisplayPdf URLs use hId tokens
// bound to the browsing session, so downloads click through the ResultByPin
// page exactly like server/recorder-scraper.mjs does. Downloads run on
// DOWNLOAD_CONCURRENCY parallel pages (each page owns its own click-through
// session); OCR + extraction run in parallel behind them.
// Identity check: DisplayPdf's dId parameter is the base64-encoded document
// number (with a nonstandard trailing padding char). Verify it decodes to the
// requested doc number so bytes are never attributed to the wrong instrument.
function displayPdfMatchesDoc(pdfUrl: string, docNumber: string): boolean {
  try {
    const dId = new URL(pdfUrl).searchParams.get("dId") || "";
    const b64 = dId.replace(/[^A-Za-z0-9+/=]/g, "").replace(/[0-9]$/, "");
    const decoded = Buffer.from(b64, "base64").toString("utf8").replace(/[^0-9A-Za-z]/g, "");
    return decoded.replace(/^0+/, "") === docNumber.replace(/^0+/, "");
  } catch {
    return false;
  }
}

const DOWNLOAD_CONCURRENCY = 4; // parallel recorder pages (mirrors the scraper's small tab cap)

async function downloadParcelDocs(pin: string, docNumbers: Set<string>): Promise<Map<string, Buffer>> {
  const { chromium } = await import("playwright");
  const { chromiumLaunchOverrides } = await import("./playwrightEnv");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    ...chromiumLaunchOverrides(chromium),
  });
  const out = new Map<string, Buffer>();
  const listUrl = `https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=${pin}`;
  const queue = Array.from(docNumbers);
  let next = 0;
  let workersReady = 0;
  try {
    const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) }, async () => {
      let page;
      try {
        page = await browser.newPage();
        await page.setExtraHTTPHeaders({
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        });
        await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(2000);
        workersReady++;
      } catch (e) {
        console.warn(`[docIngest] download worker failed to open ResultByPin — ${(e as Error).message}`);
        await page?.close().catch(() => {});
        return; // remaining docs stay in the shared queue for the other workers
      }
      try {
        while (next < queue.length) {
          const docNumber = queue[next++];
          try {
            // Find the row for this doc number and click its View link (session-token safe)
            // Exact cell match — doc numbers sit inside a <span>; substring matching could
            // click a different instrument whose number contains this one as a prefix.
            const row = page.locator(`xpath=//table//tr[.//td//span[normalize-space(text())="${docNumber}"]]`).first();
            if (await row.count() === 0) { console.warn(`[docIngest] ${docNumber}: row not found on ResultByPin`); continue; }
            await Promise.all([
              page.waitForLoadState("domcontentloaded"),
              row.locator("a").first().click(),
            ]);
            await page.waitForTimeout(1200);
            const pdfUrl = await page.evaluate(() => {
              const el = document.querySelector('iframe[src*="DisplayPdf"], a[href*="DisplayPdf"]') as HTMLIFrameElement | HTMLAnchorElement | null;
              return el ? ((el as HTMLIFrameElement).src || (el as HTMLAnchorElement).href) : null;
            });
            if (!pdfUrl) { console.warn(`[docIngest] ${docNumber}: no DisplayPdf link on detail page`); }
            else if (!displayPdfMatchesDoc(pdfUrl, docNumber)) {
              console.warn(`[docIngest] ${docNumber}: detail page serves a different instrument (${pdfUrl.slice(0, 80)}) — skipped`);
            }
            else {
              const resp = await page.request.get(pdfUrl, { timeout: 60000 });
              if (resp.ok()) {
                const bytes = Buffer.from(await resp.body());
                if (bytes.length > 500) out.set(docNumber, bytes);
                else console.warn(`[docIngest] ${docNumber}: DisplayPdf returned ${bytes.length} bytes — skipped`);
              } else console.warn(`[docIngest] ${docNumber}: DisplayPdf HTTP ${resp.status()}`);
            }
            // Return to the results list for the next click-through
            await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(800);
          } catch (e) {
            console.warn(`[docIngest] ${docNumber}: download failed — ${(e as Error).message}`);
          }
        }
      } finally {
        await page.close().catch(() => {});
      }
    });
    await Promise.all(workers);
    // Fail closed: if NO worker could even open the recorder results page,
    // the recorder site is unreachable — a "successful" empty download would
    // let the snapshot build a falsely clean debt picture. Throw instead.
    if (queue.length > 0 && workersReady === 0) {
      throw new Error(`recorder download failed: no worker could open ResultByPin for ${pin} (${queue.length} docs pending)`);
    }
  } finally {
    await browser.close();
  }
  return out;
}

export interface IngestParcelOpts {
  /** Read-window start (ISO): docs recorded before it are INDEX-ONLY stubs —
   *  no download/OCR/extraction. Null/undefined = no cutoff (full history).
   *  Computed from the Sales section's genuine-sale anchor − backward buffer
   *  (see server/debtReadWindow.ts) — never from OCR'd deeds. */
  windowStart?: string | null;
  /** Demand-driven union: doc numbers other sections need the BODY of
   *  (companion-parcel joint-acquisition deed, ownership-history deeds).
   *  Always fully ingested even when pre-window. */
  alwaysRead?: Iterable<string> | null;
}

/**
 * Ingest every relevant recorded document for a parcel. Returns the array of
 * structured docs (cached ones are instant; new ones are downloaded in one
 * recorder session on parallel pages, then OCR/extracted with limited
 * concurrency). With `opts.windowStart`, pre-window docs come back as
 * index-only stubs (counts/dates only) instead of being downloaded/OCR'd.
 */
export async function ingestParcel(pin: string, opts?: IngestParcelOpts): Promise<ExtractedRecorderDoc[]> {
  const { classifyIngest, indexOnlyStub } = await import("./debtReadWindow");
  const normalizedPin = pin.replace(/\D/g, "");
  const lienData = await getLienData(normalizedPin);
  const seen = new Set<string>();
  const rows = (lienData.documents || []).filter(d => {
    if (!d.documentNumber || seen.has(d.documentNumber)) return false;
    seen.add(d.documentNumber);
    return isRelevantRecorderDoc(d);
  });
  console.log(`[docIngest] ${normalizedPin}: ${rows.length} relevant docs of ${lienData.documents?.length ?? 0} indexed`);

  // Split cached vs uncached. Cached extractions are free — always use the
  // full extraction even for pre-window docs (better data at zero cost).
  const results: ExtractedRecorderDoc[] = [];
  const uncached: RecorderIndexRow[] = [];
  for (const row of rows) {
    const cached = await cacheGet(row.documentNumber);
    if (cached) results.push(cached);
    else uncached.push(row);
  }
  // Read-window split applies only to uncached docs. Stubs are NEVER written
  // to recorder_doc_cache — the cache holds real extractions only.
  const { read: toFetch, indexOnly } = classifyIngest(uncached, opts?.windowStart ?? null, opts?.alwaysRead);
  for (const row of indexOnly) results.push(indexOnlyStub(row));
  console.log(`[docIngest] ${normalizedPin}: ${results.length - indexOnly.length} cached, ${toFetch.length} to ingest, ${indexOnly.length} pre-window index-only (windowStart=${opts?.windowStart ?? "none"})`);

  if (toFetch.length > 0) {
    const bytesByDoc = await downloadParcelDocs(normalizedPin, new Set(toFetch.map(r => r.documentNumber)));
    // Limited-concurrency OCR + extraction over the downloaded bytes
    const queue = toFetch.filter(r => bytesByDoc.has(r.documentNumber));
    const missing = toFetch.filter(r => !bytesByDoc.has(r.documentNumber));
    if (missing.length) console.warn(`[docIngest] ${normalizedPin}: ${missing.length} docs had no downloadable file: ${missing.map(m => m.documentNumber).join(", ")}`);
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (idx < queue.length) {
        const row = queue[idx++];
        try {
          const doc = await ingestDoc(row, async () => bytesByDoc.get(row.documentNumber)!);
          results.push(doc);
        } catch (e) {
          console.error(`[docIngest] ${row.documentNumber}: extraction failed — ${(e as Error).message}`);
        }
      }
    });
    await Promise.all(workers);
  }

  console.log(`[docIngest] ${normalizedPin}: ${results.length} structured docs`, JSON.stringify(results, null, 2));
  return results;
}
