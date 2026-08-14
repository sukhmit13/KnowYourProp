---
name: Metra station name matching
description: GTFS stop names vs RTAMS survey names differ; how the ridership lookup resolves them
---

The Metra ridership dataset (RTAMS 2018 survey) and the GTFS stops feed use different station names ("Western Ave" vs "Western Avenue (Grand)", "Glen/N. Glenview" vs "North Glenview"). The `/api/metra-ridership` endpoint resolves this with: exact lookup → explicit `METRA_GTFS_ALIASES` table → normalization-based fuzzy match (abbreviation expansion + parenthetical handling).

**Why:** Ambiguous base names ("Western Avenue", "95th St.") map to two distinct physical stations on different lines; guessing by ridership size attaches wrong data. Ambiguity without a unique parenthetical hint must 404, never guess.

**How to apply:** If GTFS or the survey data is refreshed, re-audit all GTFS stop names against the endpoint (238 of 241 should resolve; Ravinia Park, Museum Campus/11th St., Peterson/Ridge legitimately lack 2018 survey entries) and update the alias table. Every alias target must exist in the dataset's `byName` index.

## Line-level monthly data (current)
RTAMS "Metra Monthly Ridership by Line / by Fare Zone" is the fresh (monthly) source — line-level only, no station counts. rtams.org is CloudFront-blocked for datacenter IPs (like ilsos.gov): fetch via browser-based fetcher (truncates ~50KB) or ScrapingBee; CSV paths change each update month, so re-resolve the download URL from the dataset page. CSV LONGNAME values differ from GTFS route names ("Milwaukee District North Line" vs "Milwaukee North") — mapping lives in the generated `metra_line_ridership.json`. Station fare zones come from GTFS stops.txt `zone_id`; key by stop_id, not display name. Metra brand line colors are a deliberate exception to the 2-series indigo/orange chart rule (same as CTA rail).
