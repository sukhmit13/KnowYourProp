---
name: Server-side report PDF export
description: Decisions and pitfalls for the Playwright-rendered PDF report (server/reportPdf.ts).
---

- The PDF is a purpose-built document rendered by headless Chromium (`page.pdf`), NOT a print of the SPA. Data is gathered cache-first (geocode_cache, PIN resolver, getPropertyTax) so it stays close to the web report.
- **Why hardened:** the stored insight-report HTML is embedded via `srcdoc` iframe. Architect flagged SSRF risk — so the render page uses `page.route` with a host allowlist (Google Fonts + api.mapbox.com only), `sandbox="allow-same-origin"` on the iframe, a 90s browser kill-timer, and a promise-chain semaphore so only one Chromium renders at a time.
- Stored insight HTML varies by template generation and can be TALLER than the nominal 1056px page. Never assume 1056: measure `.page` (fallback body) scrollHeight in-browser and scale to fit the printable box (~700×930px inside 0.55/0.6in margins), else the exec-summary page clips mid-card.
- Access rule: owner-gated via `loadOwnedRun` + subscriber-or-purchased, mirroring the insight-report endpoints.
- Full-detail sections gather in parallel with per-section fail-soft that must render an explicit "unavailable" line — never silent omission (architect fails reviews on silent drops). Incentive grouping: `not_applicable` belongs with `not_in_area` (unavailable), NOT the manual-check bucket. Listing section renders the stored snapshot only — never a live paid fetch from the PDF path.
- Cold-cache data sources (architect rankings Socrata fetch) can time out on the first render after a restart; the fail-soft line covers it and the next render succeeds from cache.

## Full-coverage lessons (Aug 2026)
- Internal route reuse beats reimplementing fetchers: the combined permits/violations route returns keys `permits`/`violations` (the `permitsData`/`violationsData` names are the Philadelphia branch only). Always verify a route's actual response keys from a live log before rendering — silent key mismatches render as "unavailable"/"Not in zone" (traffic route uses latestCount/roadName/latestDate; MMRP uses inMmrpZone).
- Zero is not "unavailable": aggregation routes that swallow per-source failures into zero-valued objects must set an `apiError` flag when every source failed, and the PDF must render "unavailable" for flagged results.
- Every gather promise goes through soft() which now also enforces a 25s per-source timeout — live Socrata calls inside the render request otherwise have no bound before the 90s browser kill timer.
