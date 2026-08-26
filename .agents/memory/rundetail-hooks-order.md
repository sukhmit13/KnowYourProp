---
name: RunDetail hook placement
description: Where new React hooks must go in the report page component to avoid hooks-order crashes.
---

The report detail page component has early returns (loading skeleton, redirect for missing run) partway through its body. Any new `useMemo`/`useQuery`/`useState` must be inserted **above** those early returns, or React throws "Rendered more hooks than during the previous render" and the whole report error-boundaries.

**Why:** hooks after a conditional return only run on some renders; the crash only appears once data loads, so it's easy to miss in a quick check.

Derived display values must also appear **after every data/loading variable they read**. Minification obscures temporal-dead-zone errors, turning an out-of-order reference into messages like `Cannot access 'lr' before initialization`.

**Why:** report values are declared across a long component body. A render-time derived value can run before a later hook result is initialized, crashing only signed-in users who reach a report.

**How to apply:** when adding derived view-model hooks for a new section, place them with the other hooks near the top-level hook cluster (search for the loading-skeleton `if (isRunLoading)` block and insert before it). Keep any plain derived value beneath the hooks/data it consumes. Also: authenticated fetches in this client must attach the bearer token from localStorage (`kyp_auth_token`) — cookie sessions alone don't cover iframe/preview contexts.
