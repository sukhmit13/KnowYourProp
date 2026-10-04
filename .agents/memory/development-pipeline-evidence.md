---
name: Development pipeline evidence
description: Source limitations and honest counting for the merged nearby-development report
---

The Chicago permit feed used here does not supply the structured unit count assumed by the supplied development mock. Permit units are read from descriptions; retain estimate notation and never describe an 18-month issued-permit window as verified active construction.

**Why:** the mock's source claim contradicted the actual feed. Many real nearby permits have no readable unit count, so reporting their missing units as zero would be misleading.

**How to apply:** preserve unit provenance, distinguish readable observed counts from a complete total, and disclose missing-unit addresses. Do not restore the mock's structured-field wording without verifying a new source.

Keep the collapsed development header concise: label the count “known units” rather than appending a sentence about unreadable counts and unknown-unit addresses. Retain estimate notation and the issued-permit time window; detailed coverage limitations belong in the expanded content.

**Why:** The user asked to avoid a multi-line header and explicitly suggested “known units” as the compact qualification.

**How to apply:** Qualify the count inline without implying complete totals or active construction.

Finite-window Plan Commission coverage is intentionally incomplete. Observed proposal counts can remain useful with a clear incomplete-coverage label, but they are not guaranteed lower bounds.

**Why:** a missing later-stage application can replace a larger earlier-stage ZBA estimate when it becomes available, reducing the deduplicated estimate.

**How to apply:** keep authoritative totals unknown when coverage is incomplete; distinguish observed estimates from complete totals and never equate a partial empty result with no activity. News and display-only ward evidence must not change arithmetic address identity.