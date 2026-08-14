---
name: Incentives single hierarchy
description: Location-Based Incentives renders as ONE availability→type hierarchy; rules for keeping badges, counts, and cards in sync.
---

The Location Based Incentives section uses a single organizing hierarchy: availability (Likely Relevant / Needs Confirmation / Not Applicable) then incentive type. Three states only; Not Applicable is grey, never red, and collapses behind a dashed toggle.

**Rules:**
- Glance counts, group headers, and cards must all derive from the same computed map (`incMeta` in RunDetail + `checkerAvail`/`checkerTypeGroup` for config-driven programs). Never hardcode or separately re-derive counts — they drift.
- Eligibility conclusions live in the section/checker logic; the hierarchy layer only groups and displays. Don't invent new eligibility states when restyling.
- Layout uses CSS flex `order`. Likely/Confirm groups (1000/2000): stateBase + strength + type*50 + idx, where strength 0 = location-confirmed (hand-built cards, checker in_area/requirement) and strength 400 = generic potentially-eligible checkers (+25 offset). Not Applicable keeps legacy 3000 + type*100 because its type labels sit at 3100–3500. Print CSS flattens flex to block, so `order` does NOT apply in print — print grouping is a known gap (open task).
- Within-group priority (Aug 2026 user request): confirmed programs (Authorized, In Area, Eligible by Zoning) must rank above generic Potentially Eligible.

**Why:** user spec (Aug 2026) explicitly required "every program has one home" after three competing structures (glance buckets, thematic sections, availability list) caused duplicate/contradictory displays.
