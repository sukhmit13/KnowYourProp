---
name: Recorder doc ingest (Debt Snapshot Stage 1)
description: Cook County recorder document download + OCR + extraction pipeline quirks
---

- Recorder `Document/Detail` and `Document/DisplayPdf` URLs carry session-scoped `hId` tokens — stored viewLinks 302 to /Home/UnAuthorized outside a live browser session. Downloads must click through ResultByPin rows in Playwright and fetch via `page.request` (shares session cookies).
- `DisplayPdf?dId=` is the base64-encoded document number with a nonstandard trailing char replacing `=` padding — decode it to verify the detail page serves the requested instrument before attributing bytes.
- Scanned instruments still have a PDF text layer (recorder stamp), so a flat >100-char check wrongly skips OCR → empty lender/amount at low confidence. Require per-page density (~200 chars/page) before trusting the text layer.
- claude-haiku-4-5 appends prose after the JSON object — parse the first balanced `{...}` (string-aware brace count), and validate the full shape + doc_number match before caching (cache is permanent; use upsert so a bad row can be repaired by re-ingest).
- Result-row doc numbers sit inside `<td><span>` — use exact xpath text match, not hasText substring (prefix collisions click the wrong instrument).
- **`npm run db:push` is unusable here**: drizzle-kit wants to drop legacy tables (`session`, `rentcast_cache`) that exist in the DB but not in shared/schema.ts. Apply new tables/constraints with direct SQL; recorderDocIngest self-provisions its table with CREATE TABLE IF NOT EXISTS (covers production at republish).
- Stage 2 reconcile (`server/debtReconcile.ts`) is pure/deterministic; all reference matching must normalize doc numbers (real releases write refs like "87 084 781") and treat normalized-key collisions as unmatched. Extracted PINs are OCR-noisy ("B13-327-027-0000") — scope by the recorder index doc list, never by extracted pins.
- Old mortgages legitimately lack releases (foreclosure filings, pre-sale liens) — Stage 2 keeps them active by design; Stage 2.5 (`server/debtResolveState.ts`) clears prior-owner liens on arms-length OR judicial transfers.
- Judicial-deed detection: never put bare "trustee" in the grantor-text regex (Chicago land trusts make "as Trustee under Trust No..." a routine non-judicial grantor) — trustee sales only via deed_subtype. Purchase-money guard must be scoped to the CURRENT acquisition, or prior owners' same-day-as-deed loans can never clear.
- resolveState/reconcile are pure — annotate copies, never the caller's stack/doc objects (test-enforced).
- Stage 3: card view-model lives in shared/debtCardModel.ts and the takeaway is generated from the SAME snap (server/debtSnapshot.ts); debt_snapshot_cache self-provisions; takeaway regenerates only when hash(snap) changes (report cross-refs excluded from the hash). POST /api/debt-snapshot requires cookie/bearer auth + global concurrency cap 2 — it triggers the paid ingest pipeline. Client rebuilds only when the recorder index was re-scraped after the cached snapshot.
- Blanket detection is LOAN-scoped (pool = body pins ∪ recorder-index pins, never the owner's portfolio) and index-only — never scrape/OCR sibling parcels for it. Canonicalize pins to 14 digits (10-digit forms + "0000"; drop others) or a truncated body pin false-positives as blanket. Pool LTV is null-with-note unless EVERY pool pin is valued.
- JS trap: destructuring `valueOf` from an options object grabs Object.prototype.valueOf when absent — use an own-property check for callbacks named after Object.prototype members.
- Takeaway validator: trace FULL dates ("July 5, 2026", "7/5/2026") against snap's ISO dates — day-part ≤31 exemptions would otherwise let recombined dates through; blanket loans reject any %-plus-value/leverage wording, not just the "LTV" label.

## Blanket render + takeaway validator (same-binding rules)
- Blanket card renders cross-collateral strip + per-parcel LTV struck as "artifact" + pooled LTV cell (live only when pool_ltv non-null); per-parcel leverage is never presented as meaningful.
- Validator same-binding: pooled % must be the EXACT card value (round(pool_ltv*100), no ±1); $M figures only in the card's fmtM form. Per-parcel % allowed only when the same segment labels it artifact/not meaningful. **Why:** review found ±1 tolerance let the takeaway disagree with the card, and derived-number whitelisting alone let a 295% per-parcel LTV pass as meaningful.

## Playwright in production deployments
- Deployed images do NOT ship the workspace's browser dirs (.cache/ms-playwright, ./playwright-browsers) — in-process chromium.launch fails with "Executable doesn't exist" only in prod while dev works.
- Fix: server/playwrightEnv.ts — imported first in index.ts; `chromiumLaunchOverrides(chromium)` falls back to workspace browser dirs, then REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE (Nix chromium the platform guarantees in prod). Pass its spread into every in-process launch (doc ingest, report PDF).
- **Why:** two "publish + refresh" rounds looked like a frontend cache issue but were this server-side launch failure silently falling back to the legacy card.

## Sales-section ownership anchor (Stage 2.5)
Lien clearing is anchored to the report's Sales section (MyDec sale history), never to non-sale deeds — a quit-claim with a recorded consideration once wrongly cleared a live mortgage.
**Why:** MyDec excludes nominal transfers, so it is the trustworthy "genuine sale" source; but it can also be INCOMPLETE (court-ordered sales sometimes missing).
**How to apply:** keep the safeguards when touching resolveState: (1) a judicial deed newer than the sales anchor overrides it; (2) anchor-deed match requires doc-number match or recording within ~180 days of the sale date, else deed details stay unknown; (3) refi/junior classification compares each later lien against ALL earlier unreleased liens, not just the adjacent one; (4) no salesSection ⇒ deed-derived behavior must stay bit-identical (tests depend on it). Any snap-shape change must bump the hashSnap `pv:` version.
