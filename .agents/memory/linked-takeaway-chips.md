---
name: Linked takeaway jump chips
description: Site-wide pattern for jump chips on takeaway bullets and how AI bullets get anchors without server changes
---

Takeaway bullets (`.crm-cn`) can carry a jump chip (`renderJump(anchorId)` in RunDetail) that opens the target collapsible and smooth-scrolls to an element id (`jumpTargets` map: anchor id → label + `setSectionOpen` opener; ids get `scroll-margin-top:90px` in index.css).

**Key decision:** AI takeaway bullets (crime/transit/schools) map to anchors client-side from their code-validated `metric` field — no `section` field was added to the server schema.
**Why:** works with already-cached takeaways (no regeneration/billing), stays deterministic, zero server changes.
**How to apply:** for a new AI section, add a `metricAnchor(m)` mapper + anchor ids; for hardcoded takeaways (Dev Potential, Property Tax) author `renderJump('anchor-id')` directly. Chips are `display:none` in print.

Related: attorney "tacard" in Appeal History is the template for future professional summary cards (e.g. contractors under Permit History) — parcel/activity-only stats, neutral toward the professional, disclaimer + single neutral public-records link, never a ranking.
