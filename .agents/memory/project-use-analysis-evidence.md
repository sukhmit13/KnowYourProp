---
name: Project-use analysis evidence
description: User-requested scope, classification, and ranking rules for Project Use Analysis
---

Project Use Analysis uses one ZIP/community-area control for its area-scoped panels. Radius-only uses must not display that control. Its body presents numbers, source classifications, and evidence limitations rather than takeaway prose.

**Why:** The user requested a common structure across project uses and explicitly removed duplicate controls and interpretive sentences.

**How to apply:** Preserve the shared geographic selection when adding panels, keep license and Google Maps competitors separate, and put each subsection's scope and source information once at its end.

Ranks are contextual, not verdicts. The ranked input must equal the displayed metric from the same source. Community-area childcare supply and enhanced demographics come from different extracts despite both citing ACS; do not substitute one count for the other.

**Why:** Ranking the enhanced demographic count beside the supply count would silently rank a different measurement. Joining existing supply values for the supply rank preserves the demographic record without pretending the extracts agree.

**How to apply:** Keep each extract's original record and denominator. Rank supply using supply inputs, demographic metrics using demographic inputs, and suppress an unverified rank rather than attach it to a different displayed value.

The labor-force delta bands at 5 and 12 percentage points are a deliberate user-approved exception to the outside-authority color rule. Their footer must identify them as the product's own planning convention, not a published standard.

**Why:** The user requested those existing cut points and the explicit disclaimer while retaining the published childcare-supply classification logic.

**How to apply:** Do not present these bands as an official childcare-access or Census classification, and do not introduce additional local thresholds without clear attribution.

The supplied Project Use Analysis HTML examples are visual references, not replacements for audited source definitions when those disagree.

**Why:** The domain-panel audit found example ranks and cut points that described a different measurement from the live provider. Matching an illustrative screenshot's numbers would silently change the meaning of the report.

**How to apply:** Check the provider's actual ranked input, denominator and classification rules before implementing a mockup. Preserve those semantics and disclose planning estimates or partial inventory coverage rather than imply independently observed counts.

Do not substitute a sum of a partial ZIP inventory for the official Cook County EV series just to fill an unavailable chart.

**Why:** The legacy EV builder's ZIP-derived county aggregate and the official county observations are different coverage sets, even though both can be labeled Cook County.

**How to apply:** Keep the county series tied to official county observations. An unavailable series is preferable to a silently substituted narrower geography when changing EV ingest or refresh behavior.

Gas Station Project Use Analysis must include historical EV registration trends, not just nearby charging stations.

**Why:** The user confirmed that gas-station research should pair nearby charging infrastructure with EV adoption history, rather than show charging locations alone.

**How to apply:** Preserve that project-use scope when revising the panel layout. Registration counts describe vehicles, not the number of households that own EVs.