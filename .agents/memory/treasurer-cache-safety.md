---
name: Treasurer cache safety
description: Preserve verified Cook County Treasurer bill data when a later scraper attempt returns no usable result.
---

Treat an empty or unknown Treasurer scrape as a failed refresh, not a clean tax record, whenever the cache already has a usable bill or payment history.

**Why:** Treasurer CAPTCHA or page-format failures can produce an unknown status with no tax years. Overwriting a verified cache with that payload makes the report lose its tax amount and paid-status history, even though the source data had previously been retrieved.

**How to apply:** Preserve the last verified bill, payment status, tax years, and verification timestamp on unusable refreshes. The UI must show an explicit unknown/unavailable state only when no verified tax data exists; never silently omit the tax-bill section.

## Refresh acknowledgments

A tax refresh response can acknowledge a background lookup without verifying a new bill. Keep prior evidence visible and distinguish “lookup started” from “data refreshed.”

**Why:** a Treasurer browser lookup can outlast the HTTP request deadline; synchronous manual refreshes timed out while their scrape was still running.

**How to apply:** use the background lookup for manual retries too, poll while it is pending, and never label a successful request as a successfully retrieved bill before source verification.