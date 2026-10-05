---
name: Business license evidence
description: Chicago application-type semantics and limits on claims about business openings.
---

Treat Chicago `ISSUE` as an initial application for a license, not proof that the business itself is newly opened. An existing operator can obtain an additional license. Grouping licenses by name and address prevents multiple counts within a period, but does not establish first-ever operation at that location.

**Why:** Chicago's official Business Licenses dataset distinguishes initial license applications (`ISSUE`) from renewals (`RENEW`), relocations (`C_LOC`), capacity changes (`C_CAPA`), expansions (`C_EXPA`), and activity changes (`C_SBA`). These are license transactions, not independently verified opening dates. `AAI` means issued; it does not alone establish unexpired licensing or current operation.

The user confirmed that established businesses appear among these records and explicitly wants new license activity distinguished from new business openings.

**How to apply:** Describe ISSUE-only results as new license issuances or businesses receiving new licenses. Claims of new businesses, openings, or formation require additional historical evidence. Keep the nearby issuance scope separate from address-level license history, where renewals are intentionally relevant.

Both Corridor Intelligence and New License Issuances Nearby must distinguish increasing issuance activity from increasing numbers of businesses. Different names receiving licenses at the same street address may represent turnover, renaming, or co-tenancy; do not count them as proof of net additions.

**Why:** The user explicitly said the question is “if there is an increasing number of new businesses,” not simply whether new businesses are coming, and wants successive names at the same address checked. They repeated that replacing businesses at the same addresses is not an increase and required the same logic in the nearby category.

**How to apply:** Compare equal annual windows, deduplicate issuances, show recurring names and address-level observations separately, and surface possible name changes with prior names. Use equal historical lookback for both periods. Without closure and operating-status evidence, do not claim net operating-business growth.

When starting with nearby competitors, check each location's prior same-use business history before calling it an addition.

**Why:** The user confirmed that a new daycare license at an address previously occupied by a daycare must be considered as a possible replacement, just as in the existing additions-versus-replacements analysis.

**How to apply:** Match the selected project use in both current competitors and prior location records. Keep additional locations, possible replacements, established operators, and insufficient-history cases distinct. A replacement daycare is not automatically added childcare capacity; any capacity change needs separate evidence.

Display competitor-history classifications as tags within Nearby Competitors, keeping their geographic scope separate from area-level demand and supply.

**Why:** The user specified “just tag and display that info in the nearby competitors” and emphasized that site-radius competitors are not the same geography as ZIP-code or community-area childcare data.

**How to apply:** Enrich the existing competitor list rather than widening it to the entire ZIP code. Show each location's evidence-backed history and keep historical area-level childcare totals unchanged unless a separate, compatible geographic and capacity analysis supports an update.

Use both existing Google Places and nearby-license/daycare lists as starting points for retrospective license-history lookup; do not prioritize or restructure one as the main list.

**Why:** The user clarified: “We just need to use both of those lists as a way to backtrack into the new business license history and find out when they started,” then determine whether each is an additional business of the selected project use or a replacement. They rejected the proposed extra matching/status treatment.

**How to apply:** Keep both lists intact and enrich their business rows with earliest observed licensing at that location and evidence-backed addition/replacement history for the selected use. Resolve identities internally without adding unmatched-source or inferred operating-status tags. Use Google's explicit closed status where applicable; do not infer closure from absence in either source. Insufficient history must not become a confirmed start date or addition.

For a clear prior same-use operator sequence at the same location, use “Replacement,” not “Possible replacement.” A completed search with no earlier same-use operator supports an addition label scoped to the available City license history.

**Why:** The user explicitly requested definite replacement/addition tags based on checking the address's prior same-use license records.

**How to apply:** Separate predecessors from simultaneous tenants and distinct suites before labeling a replacement. Do not turn incomplete retrieval or missing historical coverage into a claim that a business never existed there, and do not call a licensing date a company formation or verified opening date.

Preserve both insight views: business arrivals/turnover and changing offerings, alongside commercial occupancy/expansion. Do not discard a new operator simply because it enters an existing commercial space.

**Why:** During brainstorming, the user explicitly agreed that “we should totally have both” after distinguishing changes in the business mix from growth in occupied or newly created commercial locations.

**How to apply:** Keep these two questions separate when developing business insights. Retain possible replacements as useful activity, without labeling them net additions. Occupancy, vacancy, closure, cuisine, and demographic conclusions require evidence beyond initial license applications.

Source: https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr