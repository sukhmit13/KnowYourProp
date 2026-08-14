---
name: Liens-section distress resolution
description: How lis pendens/foreclosure filings get resolved vs active in the Liens card, and the traps around sale anchors and dates
---

Rule: a distress filing recorded before the most recent GENUINE sale (assessor Sales section; quit-claim/nominal ≤$1k never counts) is resolved by sale; also resolved by explicit release (recorder isReleased — foreclosures needed this wired server-side, they were returned raw) or NEW financing after the filing (owner-agnostic — the lender required clean title to originate; mods/assignments/extensions of a pre-filing loan never count, and it displays soft: "financing implies clean title — verify", never as a hard dismissal). One shared resolver (`shared/lienDistress.ts`) feeds headline, section chip, and KPI so they can never disagree; KPI headline number = active count, resolved shows as a muted "N historical" sub-label.

**Why the staleness escape hatch:** assessor sale history often misses judicial/receiver transfers, so a hard "no sale → active forever" rule false-alarms on decades-old foreclosures. Old product behavior (2-yr stale) is kept as an explicit `staleYears` resolver option for foreclosures only.

**Traps:**
- `Date.parse` silently normalizes impossible dates (2020-02-31 → Mar 2) — validate calendar components with a round-trip check; an unparseable/impossible date must never resolve a filing (stays active) and an impossible sale date must never become an anchor.
- Recorder dates are `MM/DD/YYYY`, assessor sale dates ISO — the resolver parses both.
- `isProbablyCleared` was part of the old KPI contract; treat it as resolved or counts jump.
