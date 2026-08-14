---
name: AI takeaway guardrails
description: Pattern for cached AI-written report summaries (pilot: crime section) — server-derived inputs, deterministic validators, fail closed.
---

Rule: any AI-phrased "takeaway" persisted into a report must (1) be generated from **server-derived** data only — the POST is a trigger, client numbers are never trusted; (2) pass deterministic validators before caching: number tracing (every output number must exist in the input object or an explicit whitelist), bullet `metric` must resolve against a canonical metric→favor map computed in code (unresolvable → reject), favor compared unconditionally, banned safety-verdict phrases; (3) fail CLOSED — reject → one retry → persist a `headline: null` sentinel (with dataHash) so failures render nothing and don't re-bill per page view.

**Why:** Two architect reviews failed earlier versions: client-supplied prompt data enabled fabricated cached takeaways + paid-call abuse, and an optional favor check let bullets cite fake metrics with arbitrary tone. The user's spec explicitly requires "the model never computes or supplies a number."

**How to apply:** Reusable generator lives in `server/takeaway.ts` (`generateTakeaway(section, data, metricFavors)`); add new sections by adding a system prompt + building the pre-computed data object and canonical favor map in the route. Cost guards: dataHash short-circuit, 10-min per-run cooldown on the cached record, in-process in-flight lock. Bullets carry markdown `**bold**`; client renders via split('**').

Additional lessons (later section rollouts):
- Number tracing must also collect numbers embedded in data STRINGS (a bus route named "80 Irving Park" was rejected as untraceable) — but then NEVER put free-form user text like the address into the model's data object, or its digits get whitelisted and dilute anti-fabrication.
- Never render bullet text as raw HTML — model output is untrusted (stored XSS); render markdown bold by splitting into React text nodes.
- Cookie-authenticated POSTs that trigger paid model calls need a same-origin/Origin-header guard, or a hostile page can burn the user's model budget via CSRF.
- Production DB must receive the same takeaway-column ALTERs as dev before republish, and never commit verification scripts containing test credentials.
- Regulated-data sections (HMDA) need a deterministic output-boundary term blocklist (protected classes) in the validator — prompt rules alone are not a control; and any REQUIRED bullet (e.g. commercial-zoning caveat) must be code-appended if the model drops it, since the validator only enforces 2–4 bullets.
- Geocode-cache lookups by run.address need lowercasing (rows store normalized lowercase addresses) and the any-age getter — the 7-day-fresh getter silently misses and drops zoning/tract inputs.
- Fair-housing sections (People Profile / demographics): three-tier design — Tier A market-economic rated freely; Tier B (languages, ballot measures) only as neutral business-ops framing; Tier C (race/ethnicity, partisan lean) confined to a plain-text "reported, not rated" context note. The rated-content blocklist must be a COMPREHENSIVE lexicon (aliases: "people of color", "left-wing", "diverse", "segregat…"), not a handful of terms — architect failed a first version for gaps. Do NOT ban language names (Spanish/Polish) — they're legitimate Tier B content. Number tracing there uses an EMPTY baseline (no generic whitelist). Persist a null-takeaway record on generation EXCEPTIONS too, or the 10-min cooldown never engages and retries re-bill.
- Verifying owner-gated endpoints: never log in as the user's real test account — login rotates the token and kicks their session. Register a scratch user, clone the run row to it via SQL, verify, then delete both.
