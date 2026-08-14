---
name: Debt read-window ingest
description: OCR only post-sale-window recorder docs; pre-window docs are index-only stubs. Guardrails that must not be "simplified" away.
---

The debt engine only downloads/OCRs recorder documents recorded on/after `saleAnchor − 6 months`; older docs enter the pipeline as index-only stubs (`text_source:"index"`, `index_only:true`, never written to recorder_doc_cache).

**Why:** the resolver clears everything before the genuine sale anyway, and the sale anchor comes free from the assessor Sales section (no OCR). This cut first-build time roughly in proportion to pre-sale history length.

**How to apply / non-negotiable guardrails:**
- Buffer reaches BACKWARD 6mo — the purchase-money mortgage records around (often before) the deed; a strict "after sale" cutoff drops the current first lien.
- Tax / in-rem liens survive a sale → always fully ingested even pre-window.
- No genuine sale anchor (or unparseable date) → no cutoff, full ingest.
- Unknown/garbled index date → read the doc, never stub.
- The window is a DEBT-engine optimization only: `ingestParcel(pin, { alwaysRead })` is the demand-driven union hook for other sections (companion-parcel deeds, ownership history) — the window must never block them.
- Cached extractions are always used, even pre-window (free, better data).
- Downloads run on 4 parallel recorder pages sharing a queue; if ZERO workers can open ResultByPin, downloadParcelDocs THROWS (an empty "successful" download would build a falsely clean snapshot).
- Stubs flow through reconcile/resolveState as historical/resolved-by-sale (null borrower ⇒ cleared; pre-anchor distress ⇒ resolved) — verified by script/test-debt-window.ts.
