---
name: Public page availability
description: Public page delivery and database-backed session failures in production
---

Serve public production documents and static assets independently of database-backed session middleware. Keep API requests on the authenticated route stack.

**Why:** A transient production database connection timeout propagated through the session store to `GET /`, returning a 500 for the homepage and failing deployment health checks even though the static client was available.

**How to apply:** When adding global middleware or changing production routing, verify anonymous and cookie-bearing page requests can still load without a database connection; authenticated API operations must continue to fail explicitly when the database is unavailable. Startup may still be delayed by database initialization, so do not mistake this mitigation for a database connectivity repair.