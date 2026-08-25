---
name: Historic ZBA timeline archive
description: How the ZBA resolution index serves both complete property history and five-year attorney rankings.
---

The ZBA resolution index must retain every dated resolution currently linked by the City, even when historic rows have no ward assignment. Property timelines are address-based and need those older decisions; attorney rankings remain a separate five-year view.

**Why:** Geocoding every historical case makes a broad archive rebuild needlessly slow, while applying the ward-resolution safety floor across those intentionally un-geocoded rows falsely rejects an otherwise healthy ranking refresh.

**How to apply:** Keep archive collection and ranking consumption separate. Reuse prior ward matches where possible, only resolve wards for new recent ranking rows, and calculate ward-quality safeguards against that recent subset. Present archive coverage as partial whenever the City does not establish an earlier complete source.

When merging the historic signed-resolution archive with the current monthly ZBA feed, identify duplicate final actions by case number, canonical address, and decision status—not by meeting date. Preserve a historic continuation and later approval as separate events.

**Why:** The monthly feed can assign a fallback twentieth-of-month date while the signed resolution uses the actual meeting date; date-based merging duplicates one final action, while collapsing only by case would erase meaningful procedural history.

**How to apply:** Prefer the signed-resolution record for a matching final decision. Keep the date in the historic-only event identity so multiple continuation/final milestones for one case remain visible.