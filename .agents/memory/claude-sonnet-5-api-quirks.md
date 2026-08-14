---
name: claude-sonnet-5 API quirks
description: Behavior changes in the claude-sonnet-5 model vs claude-sonnet-4-5 that break naive Messages API calls
---

- `temperature` is rejected: the API returns 400 "`temperature` is deprecated for this model." Omit the parameter entirely.
- The model emits a leading `thinking` block by default on complex tasks, and thinking tokens COUNT AGAINST `max_tokens`. A budget that fit the old model's plain output will silently truncate (stop_reason `max_tokens`) or even return zero text blocks.
- **How to apply:** never read `response.content[0].text` — filter/join all `type === 'text'` blocks; give generous `max_tokens` headroom (2x the expected output); and treat `stop_reason === 'max_tokens'` or empty text as a hard error rather than saving partial output.
- **Why:** during the insight-report refactor, an 8000-token cap produced one all-thinking/empty response and one mid-tag-truncated HTML that was silently saved.
- Full report generation takes ~90–150s; HTTP clients may time out while the server still finishes and saves — refetch via GET rather than assuming failure.
- `thinking: {type:"enabled", budget_tokens}` is rejected (400). Use `thinking: {type:"adaptive"}` + `output_config: {effort:"low"|"medium"}` to cap the silent thinking phase — cut a ~12K-token thinking preamble to ~4K and halved wall time on the insight report. Neither field is in the SDK types yet; spread a small untyped extras object rather than casting the whole request.
- The default (uncapped) thinking phase can consume the ENTIRE max_tokens and return zero text blocks even at 16000 — the generous-headroom rule applies to thinking, not just output.
