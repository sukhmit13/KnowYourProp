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

## Captcha HTTP API parameters

2Captcha's direct v3 HTTP API takes `min_score`, not the `score` alias found in some SDK examples.

**Why:** the existing direct request used the SDK-style name. Official HTTP API documentation specifies `min_score`; a solved token alone does not establish that the county accepted it.

**How to apply:** use the direct API documentation when changing request parameters, and verify the resulting county response independently. Do not treat a captcha solver's success as proof of a retrieved bill.

## Visually ordinary county headings are not ordinary spaces

The Treasurer results page can use non-breaking spaces in its tax-year headings while showing valid installment amounts. Browser navigation callbacks receive URL objects, not strings; a rejected wait can make a scrape appear to have reached the results page before its bill section has rendered. A payment-status word alone is not evidence that a bill was parsed.

**Why:** A live county response contained several complete tax years, but literal-space year parsing returned no amounts and cached an incidental delinquency keyword as if retrieval had succeeded.

**How to apply:** Test parsers with live-response-shaped whitespace and both installment lines, wait for the visible bill section before reading it, and only treat an actual amount or parsed tax year as usable. Existing status-only cache entries must be eligible for a retry instead of living for the verified-bill TTL.