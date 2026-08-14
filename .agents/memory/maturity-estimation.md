---
name: Maturity estimation rules (Debt Snapshot Stage 3)
description: Safety rules for the fallback maturity estimator — read-first precedence, credit-line handling, legacy-cache suppression, soft past status.
---

# Maturity estimation (Debt Snapshot)

Pure estimator in `server/debtMaturityEstimate.ts`, applied in `buildDebtSnap` AFTER `resolveState` (positions/lien_kind final). Tests: `npx tsx server/debtMaturityEstimate.test.ts`.

**Rules (do not weaken):**
- **Recorded document wins, always.** Estimates run only when `maturity_source === "unknown"` and no effective date exists. "modification" provenance only when a mod actually supplied `new_maturity_date` — a rate/amount-only mod leaves the source "recorded".
- **Lines of credit are revolving** — never a term or balloon date. `is_credit_line` is a Stage 1 extraction flag; the tri-state matters: `undefined` = legacy cached extraction that predates the flag → **suppress all term estimates** for that doc (a cached LOC must never be ballooned). Estimates activate as docs are (re-)extracted.
- **An estimate never asserts hard past-due.** Soft status `estimated_balloon_may_have_passed`, `past_maturity` stays null; a modification recorded after the estimated balloon → never "may have passed". Display always hedges "est. · {basis}".
- **Extraction gap ≠ silent document.** Null maturity + low/medium confidence → "maturity not captured — verify", estimate marked low-confidence — on the primary tile AND secondary stack rows.
- **Zoning unknown → no term estimate** (residential/commercial keys off the report's zoning, never guessed). Terms: residential 30, residential junior 10, commercial balloon 7 (tunable), SBA 25.

**Why:** an invented "past maturity" or a ballooned HELOC in a paid report is a materially false distress claim; the architect review failed the first version on the legacy-cache LOC trap.
