---
name: Companion Parcel / assemblage detection
description: Safety rules for the assemblage (Companion Parcel) section — trigger gate, confidence hedging, debt-scope claims.
---

# Companion Parcel / assemblage

Detection + takeaway are pure and templated in `shared/assemblage.ts` (tests: `npx tsx script/test-assemblage.ts`). Deliberately NOT LLM-generated — confidence language is safety-critical.

**Rules (do not weaken):**
- Trigger gate = verified shared acquisition doc number (must appear in an actual sale history — never trust the `matchReason` string alone) AND adjacency (sequential PIN or same-block address). Bare owner-name match must NEVER trigger.
- Common control across a personal↔LLC/trust line is always "likely — confirm", never "exact"/certain. `unclear` (owner unresolved) must say unclear everywhere, including the separated branch — an early version leaked "likely same owner" there.
- Debt claims are gated on the subject's resolved Debt Snapshot: no snapshot → PIN-only framing with no cross-collateralization claim; `blanket` → caution row. Companion debt is never aggregated; companion chip wording depends on whether its lien data loaded.

**Why:** an over-asserted ownership/debt claim in a paid title-adjacent report is a liability; the architect review specifically failed the first version on all three points above.

**How to apply:** the co-parcel story lives inside the Sale History section (assemblage rows folded into the sale takeaway + a nested `#asmb-double-lot` panel below the shared-deed row); any new surface mentioning a co-parcel must be a thin link there (one home, no duplicated analysis). The panel must render even when no priced sale survives the timeline filter, and the subject card's "single-PIN financing" wording is gated on `debt_scope === 'single_pin'`. Real-world quirk: separation quit-claims often aren't in CCAO sale history, so `separated` may be false even when true — fine, it's optional enrichment.
