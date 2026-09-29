---
name: Development report parity
description: Decisions and pitfalls when aligning development report history with published history.
---

The published report history is the reference for the test account during development review. Publishing code or schema does not synchronize account or report records between Replit's separate development and production databases. A one-time replacement is not an ongoing sync.

**Why:** The user previously checked unfinished changes by publishing repeatedly, so the published reports became the records they cared about. Matching emails did not mean matching histories. Numeric run IDs can identify different reports in the two databases, including IDs belonging to other development users; an ID-preserving copy can overwrite unrelated data.

**How to apply:** If refreshing the development copy, read production without writing to it; match or remap run IDs deliberately, include linked context and chat records, and verify non-target accounts remain intact. Do not assume the current development copy will stay current as new published reports arrive. Get informed consent before replacing any development-only records.