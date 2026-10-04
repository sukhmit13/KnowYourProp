---
name: News coverage takeaway
description: Site-specific news section — AI takeaway with report-data-first verification; XSS + validator rules.
---
The News & Media Coverage section (formerly Site-Specific Coverage) has a cached AI takeaway with a different shape than crime/hmda: `{section:{title,rows},articles[],meta[]}` stored in `runs.news_takeaway`.

**Rules that must hold:**
- `section.rows` is exactly `[insight verdict, caution caveat]`; rows.html is the ONLY model field rendered as HTML — it is server-sanitized (escape everything, restore bare `<b>` only) before persistence. Never widen the allowlist or render other model fields raw.
- Verification is parcel-tier only, three-state with `no_update` default, text must start "As of", "appears" never "did", and `source_anchor` must be one of the report's own section anchors. Report facts (licenses, listing status) are bound in code — the model never fetches.
- coParcelAddress from the POST body is ONLY an extra article-search term (sanitized), never a data source.
- Fail-closed: zero articles → no model call, section renders nothing; generation failure → client falls back to the plain article list (real data, no AI).

## Address identity before property attribution

Every publisher's property-news result must contain the subject's normalized street number, direction, and street in article-owned title or snippet text. A quoted, site-limited Google News search is not evidence that the returned article concerns the searched parcel.

**Why:** Google returned a redevelopment story about a different street, which was labeled “This parcel” and then compared with the subject property's licenses and permits.

**How to apply:** filter all property-news source hits before assigning parcel tiers or generating takeaways. Reject old cached takeaways lacking article-owned address evidence, including their derived section claims; do not merely hide a bad article while keeping its aggregate verdict.

**Why:** article titles are untrusted external RSS text inside the model context — prompt injection into persisted HTML is the attack path the sanitizer closes.

**Prod republish:** `ALTER TABLE runs ADD COLUMN IF NOT EXISTS news_takeaway jsonb, ADD COLUMN IF NOT EXISTS news_takeaway_generated_at timestamp;`

## Neighborhood News pipeline (same section family)
- Two-stage: batched LLM extraction per article (title+summary only — no body fetch) → code-side address-normalized dedup vs nearby-construction permits → validated takeaway.
- Anti-fabrication rule: extracted addresses/unit counts must literally occur in the article text or get dropped in code (never trust extraction output alone); one output per input id.
- Cached in runs.neighborhood_news_takeaway (+_generated_at). **Prod needs the same psql ALTER at republish** alongside hmda/news columns.
- Takeaway null = fail closed; client falls back to the old plain layout.
