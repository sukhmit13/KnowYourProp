---
name: Listing snapshot lookup
description: Active-listing AI web-search pitfalls — stale MLS aggregator trap, Redfin access blocks, prompt rules that fixed false "delisted".
---

The Active Listing feature is an Anthropic web-search call (no deterministic scraper decides status).

**Stale MLS trap:** aggregators (realty.com, compass, atproperties, xome) republish old MLS records forever and sometimes label them "for sale". A property re-listed under a NEW MLS number can be reported "Sold 2017" because the old page is fetchable and the new Redfin/Zillow page is not. Fix (Aug 2026, in the prompt): require site-limited searches (redfin/zillow/loopnet/crexi), treat the HIGHEST MLS number as current, never mix price/date fields across listings, never call a >18-month-old page "active" without current confirmation, and accept listing-site search-result metadata as sufficient evidence of "active" (those sites block fetches).

**Why:** false "Delisted" on genuinely active listings (user-reported, reproduced); first prompt fix overcorrected and stamped a stale 2017 page "Active" until the MLS-recency rules were added.

**Access facts:** Redfin (pages + stingray API) 403s datacenter IPs AND the residential proxy (bot challenge). The LOOPNET_PROXY_URL secret is host:port:user:pass format (nonstandard — must reformat before use).

**How to apply:** treat listing-site search metadata as the only reliable status evidence for fetch-blocked sites; a newer MLS number alone is recency evidence, never status evidence. Test prompt changes multiple times — output varies run to run.
