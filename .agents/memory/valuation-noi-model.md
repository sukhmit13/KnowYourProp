---
name: Valuation NOI model
description: Transparent NOI build-up in the valuation calculator — one model, tier/mode rules, dual DSCR conventions.
---

# Valuation calculator — transparent NOI (V1)

- NOI on the rental path is BUILT from a full statement (`computeNoiModel` in `client/src/lib/valuation.ts`): income (resi rent from NOI Basis, commercial rent only when Cook class 212 / 5xx / commercialData, other income) − vacancy (5% resi / 10% comm) = EGI − full opex (taxes from record, insurance est., 6% EGI mgmt imputed, R&M $1,250/unit, utilities $750/unit, reserves $250/unit) = NOI. **Never** rent − taxes − insurance — that was the fake-15%-cap bug.
- **One NOI everywhere**: `selectedNoi`/`noiSource` (`noi_model:<basis>`) computed once in the calculator IIFE and read by Step 1, Glance, Coverage, How, and the save payload (`valuation.noiModel`). Negative build-up: statement shows −$X honestly; metrics floor at $0 with explicit notes in Step 1 / Simple / NOI bar.
- **Why:** Simple and Advanced are *views* of the same model (Simple = collapsed + chips; Advanced = editable lines) — the NOI must be identical in both, or trust dies. Manual escapes: NOI Basis "enter directly", listing-stated NOI, and the T-12 override (`valuationManualNoi`) — override wins but is always flagged "manual — not from the lines" in every surface (Simple card shows the manual amount, not the model's).
- Composition from property CLASS (what exists), never zoning (what's allowed).
- Two DSCR conventions, one source: economic (NOI ÷ ADS, primary, 1.25× floor) + DSCR-loan ratio (gross rent ÷ PITIA, 1–4 unit non-SBA no-commercial only, `computeDscrLoanRatio`). PITIA must reuse the SAME `valuationAnnualTaxes/Insurance` state as the statement lines.
- Line-level rent override (`noiResiRentOverride`) feeds BOTH the statement and the DSCR-loan numerator.
- Tier default: purchase price filled → Advanced; mode = a single static "Analyzing as: Investor · buy-to-lease" indicator — NEVER a segmented control with disabled "coming soon" options (spec red flag; reintroduce a real selector only when V2 modes exist).
- Step order = build before judge: 1 Enter the Deal (purchase + financing ONLY) · 2 Income → NOI · 3 Glance · 4 Coverage · 5 How. The rent-basis selector lives in Step 2 (statement rent row / Simple card / direct- and listing-NOI cards) — never duplicated in Step 1. Step 2 gates on `showIncomeStep` (all rental paths), not just the model path, so the basis escape hatches always stay reachable.
- **How to apply:** any future NOI consumer (AI report, PDF, new modes) must read the saved `noiModel` block / snapshot ref, never re-derive rent − taxes − insurance; daycare cashflow path is separate and untouched.
