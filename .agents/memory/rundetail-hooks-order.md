---
name: RunDetail hook placement
description: Where new React hooks must go in the report page component to avoid hooks-order crashes.
---

The report detail page component has early returns (loading skeleton, redirect for missing run) partway through its body. Any new `useMemo`/`useQuery`/`useState` must be inserted **above** those early returns, or React throws "Rendered more hooks than during the previous render" and the whole report error-boundaries.

**Why:** hooks after a conditional return only run on some renders; the crash only appears once data loads, so it's easy to miss in a quick check.

**How to apply:** when adding derived view-model hooks for a new section, place them with the other hooks near the top-level hook cluster (search for the loading-skeleton `if (isRunLoading)` block and insert before it). Also: authenticated fetches in this client must attach the bearer token from localStorage (`kyp_auth_token`) — cookie sessions alone don't cover iframe/preview contexts.
