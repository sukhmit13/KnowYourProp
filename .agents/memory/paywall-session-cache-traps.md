---
name: Paywall / session / cache traps
description: Why paying team users "hit paywalls" — stale cached bundles, single-session kicks, /preview funnel, z-index over dropdown
---

# "Subscriber sees paywall" triage order

When a subscriber reports paywalls or broken UI, check in this order — all four have happened:

1. **Stale cached frontend bundle.** Before Aug 2026 the server sent no Cache-Control; Safari/Chrome kept months-old copies (old design + old bugs). Now: hashed `/assets` immutable, everything else `no-cache`; plus a prod-only `/api` middleware sends `Clear-Site-Data: "cache"` once per build (cookie `kyp_build`). Safari may ignore Clear-Site-Data — a `?v=N` query-string URL is the reliable escape hatch. The sidebar footer shows a `build <timestamp>` stamp (`__BUILD_ID__` via Vite define) — a screenshot instantly proves stale vs current.
2. **Single-session kick.** Non-team accounts: every login rotates the bearer token and destroys other cookie sessions — the kicked device silently looks logged out, and locked pages used to show pay buttons (now they show a sign-in prompt when user is null). Team accounts (server/teamAccounts.ts list) are exempt: stable shared token, multi-device.
   Client session revalidation must clear a previously confirmed user only on an explicit authentication rejection (401/403). Network failures, rate limits, deploy restarts, and 5xx responses preserve the last confirmed state; overlapping focus checks ignore stale responses.
3. **/preview funnel shows a paywall to everyone.** Search flows route to `/preview?address=...`; paid users must never land there. Home.handleSearch short-circuits paid users to proceedWithSearch; AddressPreview bounces paid users to `/` with `sessionStorage.pendingAddress`, which Home consumes. The most-recent-run auto-redirect must stay suppressed while pendingAddress exists or it races run creation.
4. **Pointer-events z-index trap.** On the signed-in Home layout, a later sibling section at the same z-index sat on top of the suggestion dropdown and swallowed all clicks (paid layout only — logged-out tests passed). Suggestion buttons also select on mousedown/touchstart with a ref guard, and address inputs have `autoComplete="off"` so browser autofill can't cover the list.

**Testing gotchas:** dev session cookies are Secure-only — Playwright over http is effectively logged out unless you put the bearer token in `localStorage.kyp_auth_token`. Run-create now accepts Bearer too (Aug 2026 — cookie-only auth made signed-in users in the iframe preview hit "Sign in required" on run creation; any new authed endpoint must accept both).

**Why:** several separate root causes masqueraded as one "paywall bug" for days; fixing them out of order wasted republish cycles. Treating every failed session check as logout also made ordinary transient server failures look like revoked access.
