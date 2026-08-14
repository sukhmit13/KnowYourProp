---
name: Auth & run ownership quirks
description: How to authenticate and ownership-check run-scoped API endpoints; email-casing pitfall.
---

- Session cookies can be blocked in iframe/preview contexts, so the app issues bearer tokens (localStorage `kyp_auth_token`). Any newly-authenticated endpoint must accept BOTH session cookie and `Authorization: Bearer` (resolve via `resolveUserFromToken`), like `/api/auth/me` does — cookie-only auth silently breaks iframe users.
- `runs.user_id` stores the owner EMAIL, and legacy accounts exist with the same email in different casing (e.g. `HetalUS@test.com` vs `hetalus@test.com`). Ownership checks must compare emails case-insensitively or valid owners get 404s.
- Return 404 (not 403) for non-owned runs so run IDs aren't enumerable.
- Duplicate accounts differing only in email case exist in BOTH dev and prod (an old exact-match seed check created lowercase twins). Login must resolve LOWER(email) ORDER BY id (oldest = original), and all user-scoped queries (runs, compare history, deletes) must compare LOWER(). Symptom when violated: "No saved runs yet" while data is intact.
- Most older run endpoints have NO auth check at all (e.g. listing-data); that is a known gap, not a pattern to copy — new endpoints, especially ones that trigger paid API calls, must be owner-gated plus in-flight lock + cooldown.
