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

## SoQL pitfalls
- **Do NOT use `$order=:id`** — not supported on all datasets, causes HTTP 400
- **Apostrophe escaping**: use `''` (doubled single quotes), NOT `\'` (backslash)
  - Example: `"Children''s Services Facility License"` in SoQL
- **Pagination**: `$offset` + `$limit` without `$order` works fine for these slow-changing datasets
- **Quotes in WHERE**: `city='CHICAGO'` works; `city = 'CHICAGO'` (with spaces) also works

**Why:** These were discovered through HTTP 400 failures. The `$order=:id` bug and apostrophe escaping were the root causes of the initial grocery/day-care refresh failures.
