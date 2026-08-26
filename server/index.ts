import "./playwrightEnv"; // must come first — see that file
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { setupAuth, registerAuthRoutes, ensureSessionTable } from "./auth";
import { clearBadTaxCacheRecords } from "./propertyTax";
import { scheduleRidershipRefresh } from "./ridershipRefresh";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { runs } from "@shared/schema";
import { isNull, sql } from "drizzle-orm";

async function backfillRunOwners() {
  try {
    // Assign any legacy runs (no user_id) to the primary account
    await db.update(runs).set({ userId: 'test@test.com' }).where(isNull(runs.userId));
    // Assign any legacy compare history (no user_id) to the primary account
    const { compareHistory } = await import('@shared/schema');
    await db.update(compareHistory).set({ userId: 'test@test.com' }).where(isNull(compareHistory.userId));
  } catch (e: any) {
    console.error('[backfill] run owner backfill failed:', e.message);
  }
}

// Prevent unhandled promise rejections and uncaught exceptions from crashing the server
process.on('unhandledRejection', (reason: any) => {
  console.error('[unhandledRejection]', reason?.message ?? reason, reason?.stack ?? '');
});
process.on('uncaughtException', (err: Error) => {
  console.error('[uncaughtException]', err.message, err.stack);
});

const app = express();
const httpServer = createServer(app);

// Trust Replit's reverse proxy so secure session cookies work correctly in production
app.set('trust proxy', 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Never log auth response bodies — they contain live session tokens.
        if (path.startsWith("/api/auth")) {
          logLine += " :: [auth response redacted]";
        } else {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log('DATABASE_URL not set — skipping Stripe init', 'stripe');
    return;
  }
  try {
    log('Initializing Stripe schema...', 'stripe');
    await runMigrations({ databaseUrl, schema: 'stripe' });
    log('Stripe schema ready', 'stripe');

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const webhook = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    log(`Webhook configured: ${webhook?.url || 'unknown'}`, 'stripe');

    stripeSync.syncBackfill()
      .then(() => log('Stripe backfill complete', 'stripe'))
      .catch((err: any) => log(`Stripe backfill error: ${err.message}`, 'stripe'));
  } catch (err: any) {
    log(`Stripe init failed: ${err.message}`, 'stripe');
  }
}

app.post('/api/stripe/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature' });
  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    const rawBody = req.rawBody as Buffer;
    if (!rawBody) return res.status(400).json({ error: 'No raw body available' });
    await WebhookHandlers.processWebhook(rawBody, sig);
    res.status(200).json({ received: true });
  } catch (err: any) {
    log(`Webhook error: ${err.message}`, 'stripe');
    res.status(400).json({ error: 'Webhook processing error' });
  }
});

async function seedTeamAccounts() {
  try {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const TEAM_ACCOUNTS = [
      { email: 'test@test.com',       password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'sudinsr@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'sudinus@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'hetalsr@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'hetalus@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'amandasr@test.com',   password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'amandaus@test.com',   password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'aseemsr@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'aseemUS@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'gaurisr@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'gaurius@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'mullinsr@test.com',   password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'mullinus@test.com',   password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'marshallsr@test.com', password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'marshallus@test.com', password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'daesr@test.com',      password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'daeus@test.com',      password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'sirishsr@test.com',   password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'sirishus@test.com',   password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'kerrysr@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'kerryus@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'kevinsr@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'kevinus@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'benjysr@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
      { email: 'benjyus@test.com',    password: 'Chicago2026!', plan: 'subscriber'    },
    ];
    for (const acct of TEAM_ACCOUNTS) {
      const emailLower = acct.email.toLowerCase();
      // Case-INSENSITIVE existence check — the exact-match version of this
      // check created lowercase duplicate accounts alongside legacy
      // mixed-case ones, orphaning their run history.
      const existing = await db.select({ id: users.id }).from(users).where(sql`LOWER(${users.email}) = ${emailLower}`);
      if (existing.length === 0) {
        const passwordHash = await bcrypt.hash(acct.password, 12);
        await db.insert(users).values({ email: emailLower, passwordHash, plan: acct.plan });
        log(`Seeded account: ${emailLower}`, 'express');
      } else {
        // Always ensure plan is correct — account may have been created with wrong plan
        await db.update(users).set({ plan: acct.plan }).where(sql`LOWER(${users.email}) = ${emailLower}`);
        log(`Account exists: ${emailLower}`, 'express');
      }
    }
  } catch (err: any) {
    log(`Seed accounts error: ${err.message}`, 'express');
  }
}

(async () => {
  const { pool } = await import("./db");
  await ensureSessionTable(pool).catch(err => log(`Session table init error: ${err.message}`, 'express'));
  setupAuth(app);

  // One-time browser-cache purge for clients stuck on a stale cached bundle.
  // This must run for the document request itself, not only /api: a broken
  // bundle can fail before React mounts and therefore before it makes an API
  // request. The build cookie prevents repeat purges after recovery.
  if (process.env.NODE_ENV === "production") {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const crypto = await import("crypto");
      const indexHtml = fs.readFileSync(path.resolve(import.meta.dirname, "public", "index.html"));
      const buildId = crypto.createHash("sha1").update(indexHtml).digest("hex").slice(0, 12);
      app.use((req: Request, res: Response, next: NextFunction) => {
        const cookies = req.headers.cookie || "";
        if (!cookies.includes(`kyp_build=${buildId}`)) {
          res.setHeader("Clear-Site-Data", '"cache"');
          res.append(
            "Set-Cookie",
            `kyp_build=${buildId}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
          );
        }
        next();
      });
      log(`Cache-bust middleware active (build ${buildId})`, 'express');
    } catch (err: any) {
      log(`Cache-bust middleware skipped: ${err.message}`, 'express');
    }
  }

  registerAuthRoutes(app);
  await seedTeamAccounts();
  await registerRoutes(httpServer, app).catch(err => log(`Route registration error: ${err}`, 'express'));

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[error] ${req.method} ${req.path} →`, err);
    res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  backfillRunOwners().catch(err => log(`Run owner backfill error: ${err}`, 'express'));
  initStripe().catch(err => log(`Stripe init error: ${err}`, 'stripe'));
  clearBadTaxCacheRecords().catch(err => log(`Tax cache cleanup error: ${err}`, 'express'));
  scheduleRidershipRefresh();

  const { scheduleDataRefresh } = await import('./dataRefresh.js');
  scheduleDataRefresh();
})();
