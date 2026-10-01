---
name: Accordion order migrations
description: Avoid prematurely completing saved report-order migrations during frontend hot reloads.
---

Mark a new per-run section-order migration complete only after its intended placement is actually present. Once applied, preserve later manual reordering.

**Why:** Fast Refresh can preserve the old accordion state while rerunning persistence effects. An unconditional marker write can then prevent an existing custom order from migrating on the next reload.

**How to apply:** When changing default report ordering, account for saved orders and gate a new migration marker on the applied placement rather than merely on the persistence effect running.