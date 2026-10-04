---
name: County lookup delivery evidence
description: Distinguish a resolved parcel in the server cache from successful delivery to the report and from a verified Treasurer bill.
---

A resolved PIN in the server cache is not proof that the browser received it or started the tax lookup. Assessor characteristics returned by the tax endpoint are not proof that a Treasurer bill was retrieved.

**Why:** A report showed taxes as “Not checked” even though the parcel had a high-confidence cached PIN. A separate endpoint check returned Assessor records immediately while the Treasurer scraper was still running.

**How to apply:** Diagnose resolution, delivery, downstream tax requests, and background Treasurer completion separately. Do not claim a bill was verified from a successful HTTP response or populated Assessor fields alone.

## Independent county results

Assessor property characteristics and Treasurer tax bills should be two separate results associated with the same PIN.

**Why:** the user explicitly said, “There should be two separate things, but it's all associated with the PIN.”

**How to apply:** do not make lot/building information or development calculations contingent on bill retrieval. Show source-specific completeness and errors, and distinguish missing dataset coverage for exempt parcels from a county connection failure. An EX classification alone does not verify a zero bill or payment status.