---
name: Zoning history lookup (Legistar + ZBA)
description: Range-address matching rules and Legistar API quirks for the zoning-history feature
---

# Zoning history lookup

- **Ordinance titles use hyphenated range addresses.** City Council matter titles often write "520-22 N Claremont Ave" (abbreviated upper bound = 522) instead of a single house number. Never search Legistar by exact `"<num> <dir> <street>"` substring — search street-only and verify the house number locally with range-aware matching (parity-aware; abbreviated bounds borrow leading digits; reject cross-parity or >200-span ranges; `(?<![\d-])` guard so 1522 doesn't match 522).
- **Why:** exact-number substring silently returned zero results for properties rezoned under a range address.
- **How to apply:** helpers `houseNumberMatches`/`houseTokensMatch`/`addressesMatch` in the zoning-history module are exported for tests; reuse them for any address-vs-record matching (ZBA records share the same trap).
- **Verified co-parcels are searched too.** When assemblage detection passes (shared deed + adjacency — never owner-name match), companion addresses go along as `?alt=` params; the server groups targets by street and accepts any target's number or covering range. Dedupe merged Legistar rows by MatterId → GUID → file → title+date.
- **Councilmatic is the primary source.** Its City Council record pages preserve application text that gives richer zoning context than the Legistar matter API. Search Councilmatic first; use the official Legistar API only when Councilmatic returns no usable rows. Its search scraper splits on `<p class="h4">`, detects next-page links, and logs loudly if a results page parses to zero blocks. A 45s end-to-end deadline spans both sources so outages cannot stack timeouts.
- **Councilmatic’s page text can outlive its PDF links.** The embedded ordinance/application text may still include applicant contacts, attorney/law-office fields, and zoning districts even when the Councilmatic proxy PDF or old Legistar attachment is missing or expired. **Why:** older ordinance PDFs can return 404 while the page remains available. **How to apply:** enrich from the page text first, then merge any PDF-derived fields; only display contacts explicitly labeled as the applicant’s zoning attorney.
- **Application forms can name multiple current districts without hyphens.** Treat values such as `RS3 ... and RT4` as a multi-district map amendment (`RS-3 + RT-4 → RT-4`), not a single-zone change. **Why:** the form can describe one zoning lot spanning two districts. **How to apply:** preserve the listed districts and label the development/coach-house narrative as application context, never as proof of a separate variance or entitlement.
- **Legistar web API can go down platform-side.** `webapi.legistar.com/v1/chicago` has returned `"LegistarConnectionString setting is not set up in InSite for client: chicago"` for every query (seen Aug 2026). When zoning history is empty, check the raw API before blaming matching logic.
- Street suffixes are stripped during matching, so "N Claremont Ave" vs "N Claremont Pl" are indistinguishable — known accepted exposure.
