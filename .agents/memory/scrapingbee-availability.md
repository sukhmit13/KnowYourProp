---
name: ScrapingBee availability
description: Distinguish ScrapingBee quota exhaustion from invalid credentials before requesting a replacement key.
---

ScrapingBee can return HTTP 401 for exhausted monthly call allowance, not only invalid authentication.

**Why:** a working, recognized API key returned “Monthly API calls limit reached” during county retrieval troubleshooting. Replacing the key was not the demonstrated remedy.

**How to apply:** inspect a safely redacted provider error message, never just its HTTP status. Verify available quota before relying on ScrapingBee as an alternate network path, and do not claim a captcha-rejected county portal lookup returned a bill.