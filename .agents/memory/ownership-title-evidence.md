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

Owner-name lien searches belong with Ownership & Title, but they are separate from parcel-specific property claims and must not be counted as liens against the subject property.

**Why:** The user wants owner liens in the ownership section; matching a recorded owner's name does not prove the lien attaches to this parcel or even that the person/entity is the same.

**How to apply:** Keep the owner-name search and its identity/release caveats as a separate subsection; never roll its results into the property's active-lien count, title-clear badge, or payoff assertion.

Report status badges must distinguish an in-progress check from a completed inconclusive check: use “Checking” during an initial lookup or retry without verified data, and “Status unknown” only after the lookup settles without usable evidence. Retain a verified cached finding during refresh.

**Why:** A normal first report load showed “Status unknown” while Recorder records were still being fetched, which suggested the lookup had failed.

**How to apply:** Use the same pending-vs-settled distinction for future section headers and nested status badges. Do not let a missing response masquerade as a clean result or let a pending request mask an already supported adverse finding.

Water/utility debt checks belong under Ownership & Title. A current utility-account balance and a Chicago Full Payment Certificate are different evidence types, not interchangeable clearance claims.

**Why:** The user confirmed this placement. The City's certificate is official clearance for a particular property transfer; an account balance is only a billing finding, and additional charges or transfer-specific exceptions can affect clearance.

**How to apply:** Keep balances, recorded water liens, and issued certificates separate. Missing access stays unverified, never zero or paid in full. Verify a working balance-access method before promising automated address/PIN lookup; a manual link or public application portal does not establish that capability.

Official reference: https://www.chicago.gov/city/en/depts/fin/supp_info/utility-billing/full-payment-certificates.html (checked 2026-09-30).