---
name: Socrata SoQL quirks
description: Field names, API behaviors, and pitfalls for Chicago Data Portal datasets used in this project.
---

## Key datasets
- `53t8-wyrc` — Grocery Store Status (Chicago-only, no city filter needed)
  - Fields: `store_name`, `address`, `zip_code`, `latitude`, `longitude`, `community_area` (number), `community_area_name` (text), `square_feet`
  - No `city`, `state`, `new_store` fields
- `r5kz-chrr` — Business Licenses
  - Fields: `id` (formatted `license_number-YYYYMMDD`), `doing_business_as_name`, `address`, `city`, `state`, `zip_code`, `latitude`, `longitude`, `community_area` (number), `community_area_name` (text), `neighborhood` (text), `license_description`, `license_number`
  - `community_area_name` is available directly — no lookup table needed
  - Filter active: `license_status='AAI'`
- `fi3z-jc3f` — Alternative Fuel Locations (EV stations)
  - Filter: `fuel_type_code='ELEC' AND status_code='E'`
- `ydr8-5enu` — Building Permits
  - `street_name` already includes the street suffix (for example, `WABASH AVE`)
  - There is no separate `suffix` column; selecting it makes Socrata reject the entire query with HTTP 400

## SoQL pitfalls
- **Do NOT use `$order=:id`** — not supported on all datasets, causes HTTP 400
- **Apostrophe escaping**: use `''` (doubled single quotes), NOT `\'` (backslash)
  - Example: `"Children''s Services Facility License"` in SoQL
- **Pagination**: `$offset` + `$limit` without `$order` works fine for these slow-changing datasets
- **Quotes in WHERE**: `city='CHICAGO'` works; `city = 'CHICAGO'` (with spaces) also works

**Why:** These were discovered through HTTP 400 failures. Invalid ordering, escaping, or even one nonexistent selected field causes the whole dataset request to fail rather than omitting that field.

## Cook County sale/parcel neighborhood joins
The parcel-sales feed exposes neighborhood identifiers with a township prefix; the parcel-universe feed exposes the neighborhood's short numeric identifier separately from its township name. Probe both live feeds before changing a ZIP-to-sales join, and do not compare their raw neighborhood strings directly.

**Why:** A citywide sales query timed out, while a superficially successful ZIP-level join could otherwise yield all-zero charts by silently mismatching the two identifiers.
**How to apply:** For sales trends or comparable-sales geography changes, verify the actual identifiers and filter to the requested ZIP before computing counts or prices. Treat undocumented assessor class codes as unknown rather than guessing their housing category.

Cook County assessor parcel ZIPs are often ZIP+4; exact equality against a five-digit ZIP returns no rows, while a bounded prefix range preserves the neighborhood set. Grouping parcels by ZIP and neighborhood has highly variable latency, approaching or exceeding the upstream timeout even when the sales queries are quick.

**Why:** Equality misses ZIP+4 rows, and repeated uncached group queries dominate latency.
**How to apply:** Preserve the ZIP+4 prefix and city filter, verify neighborhood sets against the live feed when changing the query, and use a shared successful-result cache across server instances. Never convert an unknown neighborhood mapping into a zero-sales result.
