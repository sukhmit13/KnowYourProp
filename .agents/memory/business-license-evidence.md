---
name: Business license evidence
description: Chicago application-type semantics and limits on claims about business openings.
---

Treat Chicago `ISSUE` as an initial application for a license, not proof that the business itself is newly opened. An existing operator can obtain an additional license. Grouping licenses by name and address prevents multiple counts within a period, but does not establish first-ever operation at that location.

**Why:** Chicago's official Business Licenses dataset distinguishes initial license applications (`ISSUE`) from renewals (`RENEW`), relocations (`C_LOC`), capacity changes (`C_CAPA`), expansions (`C_EXPA`), and activity changes (`C_SBA`). These are license transactions, not independently verified opening dates. `AAI` means issued; it does not alone establish unexpired licensing or current operation.

The user confirmed that established businesses appear among these records and explicitly wants new license activity distinguished from new business openings.

**How to apply:** Describe ISSUE-only results as new license issuances or businesses receiving new licenses. Claims of new businesses, openings, or formation require additional historical evidence. Keep the nearby issuance scope separate from address-level license history, where renewals are intentionally relevant.

Corridor comparisons must distinguish increasing issuance activity from increasing numbers of businesses. Different names receiving licenses at the same street address may represent turnover, renaming, or co-tenancy; do not count them as proof of net additions.

**Why:** The user explicitly said the question is “if there is an increasing number of new businesses,” not simply whether new businesses are coming, and wants successive names at the same address checked.

**How to apply:** Compare equal annual windows, deduplicate issuances, show recurring names and address-level observations separately, and surface possible name changes with prior names. Use equal historical lookback for both periods. Without closure and operating-status evidence, do not claim net operating-business growth.

Source: https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr