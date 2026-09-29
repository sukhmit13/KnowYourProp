---
name: Ownership & Title evidence
description: Evidence and wording rules for the unified ownership, sale, debt, and title-status report section.
---

Debt facts in Ownership & Title must come from the reconciled debt snapshot, never directly from raw recorder mortgage rows. A missing snapshot is an explicit unresolved state, not permission to infer active debt. Failed title searches also remain unknown rather than becoming clear title.

**Why:** Raw mortgage rows do not apply releases, sale-based clearing, lien position, or extraction confidence. Presenting them as active debt can turn historical instruments into apparent current obligations.

**How to apply:** Preserve original-recorded-principal wording (never balance), maximum-indebtedness wording for revolving lines, confidence gates for rate/maturity, and explicit verification caveats for inferred refinance or probable-clearance states. Keep released/probably-cleared filings visible as muted history with the best available release evidence.

Cross-collateralization must be a **loan-specific, valid-PIN evidence claim**, never inferred from raw OCR PIN count, an extraction boolean, loan amount, or the owner's companion parcels. A malformed OCR PIN can count as a second raw string while the Recorder index only assigns the loan to the subject parcel. Distinguish "only one PIN identified in available records" from proof that a loan could not cover any other property.

**Why:** A single-parcel bank mortgage was depicted as blanket debt because the OCR extraction held a malformed second PIN; its companion parcel's Recorder index did not list that mortgage. Optional AI takeaways and old cached snapshots can repeat the error after the deterministic calculation is fixed.

**How to apply:** Normalize and validate 10-/14-digit Cook County PINs before counting distinct collateral. Bind each loan's displayed PINs to its own instrument/index evidence; fail closed if a resolved blanket flag disagrees with the supported PIN set. Bump the snapshot schema when collateral rules change, and never reuse a takeaway against a changed or empty snapshot. If current loans have mixed scopes, suppress ambiguous cross-collateral language in the optional takeaway while per-loan records remain explicit.