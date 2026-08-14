---
name: Owner intel & IL SOS access
description: Access constraints for tracing owners behind LLCs — ilsos.gov blocks datacenter IPs; ScrapingBee is the only runtime path.
---

**Rule:** Any automated Illinois Secretary of State lookup must go through ScrapingBee — ilsos.gov (Akamai) returns 403 for this repl's datacenter IP even with real-browser Playwright. Replit agent-side webFetch CAN reach ilsos.gov, but that's not available at app runtime.

**Why:** Verified July 30, 2026 while building the Owner Intelligence card. ScrapingBee monthly quota (1,000 calls) was exhausted at the time; it resets ~1st of each month. `LOOPNET_PROXY_URL` secret is not a parseable proxy URL and didn't help.

**How to apply:** For SOS entity scraping (registered agent, managers/members), use ScrapingBee with render_js (businessentitysearch is an SPA), cache results by normalized entity name, and fail loudly to a manual-search link when quota is out. The entity classifier and lookup-link builders live in `shared/ownerIntel.ts`; treasurer links must use the `mode=PIN&searchpin=<hyphenated-pin>&isBusiness=false` format.
