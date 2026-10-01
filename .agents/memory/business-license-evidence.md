---
name: Business license evidence
description: Chicago application-type semantics and limits on claims about business openings.
---

Treat Chicago `ISSUE` as an initial application for a license, not proof that the business itself is newly opened. An existing operator can obtain an additional license. Grouping licenses by name and address prevents multiple counts within a period, but does not establish first-ever operation at that location.

**Why:** Chicago's official Business Licenses dataset distinguishes initial license applications (`ISSUE`) from renewals (`RENEW`), relocations (`C_LOC`), capacity changes (`C_CAPA`), expansions (`C_EXPA`), and activity changes (`C_SBA`). These are license transactions, not independently verified opening dates. `AAI` means issued; it does not alone establish unexpired licensing or current operation.

**How to apply:** Describe ISSUE-only results as new license issuances or businesses receiving new licenses. Claims of new businesses, openings, or formation require additional historical evidence. Keep the nearby issuance scope separate from address-level license history, where renewals are intentionally relevant.

Source: https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr