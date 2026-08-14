# Chicago Eligibility Screener

## Overview

A public web application for Chicago-only eligibility screening, designed to help users assess project eligibility for various local programs and incentives. Users can input a Chicago address or a property listing URL, which the system then geocodes, performs geographic lookups (e.g., TIF districts, zoning), and allows for the creation of multiple project scenarios. The application is completely public and requires no authentication. Key capabilities include support for property listing URLs from major real estate sites, comprehensive geographic analysis, and tools for investment analysis and demographic insights. The project aims to empower users with self-service project analysis for Chicago properties.

## User Preferences

Preferred communication style: Simple, everyday language.
Property info display: Hide fields entirely if data cannot be populated (don't show "Not available").
Deployment: Always suggest publishing to production at the end of every task/change.
UI/UX parity: There are NO account-level UI/UX differences. Every account sees the identical interface and flow; the ONLY difference is that non-subscribers (non-team members) hit the payment step. Subscribers/team accounts must never see paywalls, preview funnels, or reduced UI.

## System Architecture

### Frontend
The frontend is built with React and TypeScript, using Vite for fast development and bundling. It employs Wouter for client-side routing, TanStack React Query for efficient data fetching and state management, and shadcn/ui (built on Radix UI and Tailwind CSS) for a modern, accessible user interface. Animations are handled by Framer Motion, and forms are managed with React Hook Form, integrated with Zod for validation. The styling uses a custom Tailwind CSS theme with a Chicago-inspired color palette.

### Backend
The backend utilizes Node.js with Express.js and TypeScript, exposing RESTful API endpoints. It includes a custom IP-based rate limiter (20 requests/minute) and leverages the @turf/turf library for geospatial processing, specifically for point-in-polygon spatial queries.

### Data Layer
PostgreSQL serves as the primary database, accessed via Drizzle ORM for type-safe queries and schema management. Database migrations are handled with Drizzle Kit. Key tables include `runs` for storing analysis sessions, `scenarios` for project-specific details, and `geocode_cache` for performance optimization.

### Geographic Services
The application integrates with the U.S. Census Geocoder API for address geocoding. Geocode results are cached in `geocode_cache`: the interactive geocode route uses a 7-day freshness gate and re-fetches stale entries live, while the insight-report evidence builder deliberately reads the cache at any age (`getGeocodeAnyAge`) because it has no re-fetch path and stale zoning/coordinates are still valid — do not unify these two lookups. Zoning lookups employ a hybrid approach: first using Cook County Assessor data for parcel centroids, then querying the Chicago GIS ArcGIS REST API. A local GeoJSON file (`chicago_zoning.geojson`) acts as a fallback. Spatial data for TIF districts and historic landmarks are stored as GeoJSON files. Transit-Oriented Development (TOD) checks are performed against predefined CTA and Metra routes.

### Address Matching System
The PIN resolution system uses a multi-tier approach to match addresses to Cook County PINs:
1. **Address Points (78yw-iddh)**: Exact address matching from Cook County's address point database
2. **Parcel Addresses (3723-97qp)**: Range matching for addresses within larger parcels (e.g., 148 S California maps to parcel at 134 S California)
3. **Commercial API**: For commercial/industrial properties
4. **Exempt Parcel Lookup**: For non-profits, government, and religious properties

Key features:
- Leading-digit search pattern to find addresses on the same street block (e.g., "1%" finds 100-199)
- Deduplication by PIN to handle multi-year parcel records
- Confidence scoring: 95% for exact match, max(60, 95-diff) for range matches within 100 address numbers
- Timeout protection with fetchWithTimeout helper (8000ms default) to prevent API hangs
- PIN lookup cache stored in `pin_lookup_cache` table for performance

### Property Memory Context (Canonical Evidence Layer)
One `property_context` object per run, stored in the `property_contexts` table (JSONB), auto-created when a run is created. It is the canonical, source-linked input for later AI prompts (one-pager generation) — prompts consume structured facts from it, never chat history.
- **Identity**: `report_id` = run ID; `property_id` = Cook County PIN when cached, else normalized address; optional `canonical_property_key` for grouping runs of the same property later
- **Shape** (types + Zod in `shared/propertyContext.ts`): 7 sections (`title_distress`, `zoning_use`, `taxes_assessment`, `physical_constraints`, `sale_history`, `market_demand`, `property_linked_professionals`), each with `{facts, derived, mini_summary, confidence, eligible_for_onepager, notes}`; plus `property_snapshot`, `ui_context`, `onepager_context`, `source_index`, `status`, `run_version`, `context_version`, `extraction_status`, `source_coverage_status`
- **Validation rules** (enforced on write + checked by `validatePropertyContext`): a fact is verified only with ≥1 valid source reference; a derived metric is verified only if all input facts are verified (source refs are unioned from inputs); broken `source_ref_ids` are rejected; unverify cascades to dependent derived metrics
- **Utilities**: `server/propertyContext.ts` (create/get, snapshot & identity updates, add source refs/facts/derived/professionals, verify/unverify, mini-summary & eligibility placeholders, validation). All writes serialized per run via an in-process lock (`withRunLock`); batch writes via `applyContextBatch`
- **Extraction**: `server/propertyContextExtraction.ts` — `extractPropertyContext(runId)` populates the 7 sections from ALREADY-CACHED sources only (geocode/pin/tax/lien caches read directly from DB tables — never via helpers that spawn Playwright on miss; LoopNet/Peerspace/rentcast caches; local landmark GeoJSON with coordinates only to avoid the live city-API fallback; zoning reference; run record manual fields). Wipe-and-rewrite per run, preserving linked professionals and their source refs. Runs automatically inside POST `/api/runs/:id/insight-report/generate` in a try/catch that never blocks report generation
- **Prompt integration**: populated sections flow into the report prompt automatically (whole context is JSON-serialized); `reportLogic.ts` SOURCE OF TRUTH block instructs the model not to double-count sections vs raw evidence and to prefer verified structured facts on conflict
- **Inspection**: dev-only `GET /api/property-context/:runId` (gated behind NODE_ENV=development — contexts hold owner/lien data on guessable run ids) returns `{context, validation}`; writes are server-internal only
- **Test harness**: `npx tsx scripts/test_property_context.ts <runId>` exercises all utilities and rules, then resets that run's context to empty

### Property Information & Analysis
Property characteristics are sourced from the Cook County Assessor's Improvement Characteristics API, with provisions for manual data entry when API data is unavailable, especially for commercial properties. Historic landmark status is determined using the Chicago Landmarks & Historic Resources Survey GeoJSON, including a buffer check for proximity. Vehicle ownership and senior population analyses utilize ACS 5-Year Estimates, providing demographic insights relevant to specific project types.

### Valuation Calculator
Available on every property page with investment analysis features:
- **Loan Types**: FHA/VA (5% down, 30yr), SBA (Business + Real Estate), Conventional (20% down, 30yr)
- **SBA Loan Logic**: Shows separate Business and Real Estate purchase price inputs with auto-calculated terms:
  - RE = $0: Business only (10% down, 10yr amortization)
  - RE ≥ 51% of total OR RE > Business: Both at 10% down, 25yr amortization
  - RE < Business: Split terms (RE at 25yr, Business at 10yr)
  - Business uses separate interest rate (prime + 2.75% = 10.25% default)
  - Real estate uses SBA 504 rate (6.0% default for 25yr)
  - All inputs are user-editable (down %, term, rate)
- **NOI Options**: Dropdown from Quick Cashflow Calculator for Day Care projects, manual input otherwise
- **Metrics**: DSCR, Cap Rate, ROI (Cash-on-Cash Return)

### AI Insight Reports
One-page AI-generated acquisition memo per run (`/api/runs/:id/insight-report/generate`). Key mechanics:
- **Evidence package**: `buildInsightReportEvidence` assembles all data blocks (zoning, TIF, opportunity zone, taxes, liens, rental/lease/hourly markets, incentives, competitors, etc.) and runs a 21-entry coverage checklist; missing sections are logged and appended as a `[COVERAGE WARNING …]` note (never blocks generation). Dev-only inspection endpoint: `GET /api/runs/:id/insight-report/evidence`.
- **Valuation fidelity**: the Valuation Calculator's full state (incl. SBA splits, rental-derived NOI with source tag, and computed DSCR/cap rate/ROI snapshot) is saved into `reportContext.valuation` and emitted as a `funnel.valuation` block in the report prompt. PATCH `/api/runs/:id/report-context` is zod-validated (400 on malformed payloads).
- **Stale flag**: saved report content is stamped with `generatedForProjectType`; the report page shows a banner prompting regeneration when the run's project type has changed since generation (legacy reports without the stamp never show the banner).

### Discovery Pages & Demographic Trends
Dedicated "Discovery" pages highlight key insights, such as top community areas based on childcare needs. Area detail pages provide granular data on childcare deserts, SBIF eligibility, and NMTC coverage. Demographic trends are presented with side-by-side comparisons of 2010 and 2023 data from ACS estimates, visualized with charts for comparable metrics.

### Build System
Development uses `tsx` for TypeScript execution with hot reloading. Production builds leverage esbuild for server bundling and Vite for client bundling.

## External Dependencies

### Database
- **PostgreSQL**: Primary data storage.
- **Drizzle ORM**: Type-safe database interactions.

### External APIs
- **U.S. Census Geocoder**: For address geocoding.
- **Chicago GIS ArcGIS REST API**: For zoning lookups.
- **Cook County Assessor's Improvement Characteristics API**: For property building characteristics.
- **Apify (memo23~apify-loopnet-search-cheerio)**: LoopNet commercial for-lease market data by ZIP code. Requires `APIFY_API_TOKEN` env var. Runs async actor (~130s first request), results cached 7 days. Route: `/api/loopnet`. Returns count, avg $/SF/yr, median sqft, per-listing details. Falls back to empty if token missing.
- **Apify (apify~playwright-scraper)**: Peerspace hourly space market data. Renders Peerspace's React SPA in headless Chrome with RESIDENTIAL proxy to bypass Cloudflare. Requires `APIFY_API_TOKEN`. Runs async (~2-3 min first request), results cached 7 days. Route: `/api/peerspace`. Returns count, avg $/hr, per-venue title/capacity/url/price. Shown in "Hourly Space Market (Peerspace)" subsection alongside LoopNet. `server/peerspace.ts`.

### Key NPM Packages
- **@turf/turf**: Geospatial analysis.
- **@tanstack/react-query**: Data fetching and caching.
- **drizzle-zod**: Zod schema generation for database.
- **framer-motion**: Animations.
- **date-fns**: Date utilities.

### UI Framework & Design System
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-built UI components.
- **Lucide React**: Icon library.
- **Design System (Veraset)**: Flat, brutalist-inspired design language
  - **Colors**: Primary=#000000 (black), Background=#FFFFFF (white), Secondary=#E5DDD5 (beige), Accent=#C4FF00 (neon yellow)
  - **Typography**: Headlines = Space Mono (monospace), Body = Inter (sans-serif)
  - **Borders**: All border-radius forced to 0 globally via CSS, no shadows (box-shadow: none !important)
  - **Cards**: Flat with `border border-border`, no shadows or gradients
  - **Sidebar**: Black (bg-foreground) background, flat navigation
  - **Mobile**: All pages include hamburger menu toggle for sidebar (hidden md:block pattern)
  - **Badges**: Neutral only — `bg-foreground text-background` (highlighted/active), `bg-secondary text-foreground border border-border` (neutral), `bg-secondary text-muted-foreground border border-border` (inactive/N/A)
  - **Status Banners**: All statuses use `bg-secondary border-border` (flat neutral) — no colored backgrounds; meaning conveyed via icons (CheckCircle2/AlertTriangle/XCircle) and text weight
  - **No semantic colors**: All `text-green-*`, `text-red-*`, `text-amber-*`, `text-emerald-*`, `bg-emerald-*`, `bg-red-*`, `bg-amber-*` removed from all pages; only `text-foreground`, `text-muted-foreground`, `bg-foreground`, `bg-secondary` used
  - **No dark: classes**: All `dark:*` Tailwind classes removed; light-only theme
  - **No legacy colors**: All bg-gray-*, text-gray-*, text-indigo-*, text-purple-*, shadow-md/lg/xl removed from pages and components
  - **CSS Variables**: Defined in `client/src/index.css`, Tailwind tokens in `tailwind.config.ts`
  - **Report section-card headers**: All CardTitles on RunDetail/AddressPreview use the `.chead` class (end of `index.css`) — JetBrains Mono uppercase eyebrow with a 10px indigo square via `::before`; no leading icons; hairline divider comes from shadcn CardHeader's default `border-b`. Ward card: mono "WARD N" kicker, Instrument Serif name, indigo (`--ref-blue`) icons/links, address split into 2 lines. Zoning card: pill-shaped R/C/I flags (green dot/check = allowed, muted gray = not), stacked 2-col spec grid, allowed-use chips on `--indigo-soft` (#ecedf9), PIN/address in `.mono-pin` pill. Both pages support URL-hash deep-linking (scroll-to-id on load).