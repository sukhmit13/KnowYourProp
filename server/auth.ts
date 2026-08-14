import { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, pool } from "./db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { notifyTeamLogin } from "./loginAlerts";
import { isTeamAccount } from "./teamAccounts";

// Single-session tokens: a fresh random token is generated and stored on the
// user row at every login/registration. Only the most recent token resolves,
// so logging in on a new device automatically invalidates every other device.
export async function rotateUserToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.update(users).set({ sessionToken: token }).where(eq(users.id, userId));
  return token;
}

// Team accounts keep one stable token shared across devices so logging in on
// a new device never invalidates the others.
export async function getOrCreateStableToken(userId: number): Promise<string> {
  const [u] = await db.select({ sessionToken: users.sessionToken }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.sessionToken) return u.sessionToken;
  return rotateUserToken(userId);
}

export async function resolveUserFromToken(token: string): Promise<Express.User | null> {
  try {
    if (!token || token.length < 32) return null;
    const [u] = await db.select().from(users).where(eq(users.sessionToken, token)).limit(1);
    if (!u || !u.sessionToken) return null;
    // Constant-time compare (the indexed lookup already matched, this guards edge cases)
    const a = Buffer.from(token);
    const b = Buffer.from(u.sessionToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return {
      id: u.id,
      email: u.email,
      plan: u.plan,
      stripeCustomerId: u.stripeCustomerId,
      stripeSubscriptionId: u.stripeSubscriptionId,
      trialReportsRemaining: u.trialReportsRemaining ?? null,
    };
  } catch {
    return null;
  }
}

// Destroy every cookie-based session for this user except the current one, so
// "one login per account" also applies to devices authenticated via cookie.
export async function destroyOtherSessions(userId: number, currentSid: string | undefined): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM "session" WHERE sess->'passport'->>'user' = $1 AND sid <> $2`,
      [String(userId), currentSid ?? ''],
    );
  } catch (err) {
    console.error('[auth] Failed to clear other sessions:', err);
  }
}

const PgStore = connectPgSimple(session);

// Create session table manually — connect-pg-simple's createTableIfMissing uses
// __dirname internally which is not available in the ESM production build.
export async function ensureSessionTable(pool: import("pg").Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      plan: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      trialReportsRemaining: number | null;
    }
  }
}

export function setupAuth(app: Express) {
  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: false }),
      secret: process.env.SESSION_SECRET || "parcel-screener-secret-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: true, // Replit always serves over HTTPS
        sameSite: 'none', // Allow cross-site POST requests (needed in Replit canvas iframe)
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        // ORDER BY id: legacy duplicate accounts exist differing only in email
        // casing — always resolve to the ORIGINAL (oldest) account so users
        // keep their run history regardless of which twin matches.
        const [user] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${email.toLowerCase()}`).orderBy(users.id).limit(1);
        if (!user) return done(null, false, { message: "No account found with that email." });
        if (!user.passwordHash) return done(null, false, { message: "This account uses Google sign-in. Click \"Sign in with Google\" instead." });
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return done(null, false, { message: "Incorrect password." });
        return done(null, {
          id: user.id,
          email: user.email,
          plan: user.plan,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
          trialReportsRemaining: user.trialReportsRemaining ?? null,
        });
      } catch (err) {
        return done(err);
      }
    })
  );

  // Google OAuth — only registered when credentials are configured, so the
  // rest of auth keeps working in environments without them.
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: "/api/auth/google/callback",
          // Build the absolute callback URL from X-Forwarded headers so the
          // same code works on the dev preview domain and knowyourprop.com.
          proxy: true,
          // CSRF protection: session-backed state param, verified on callback.
          state: true,
        },
        async (_accessToken, _refreshToken, profile: Profile, done) => {
          try {
            const email = profile.emails?.[0]?.value?.toLowerCase();
            if (!email) return done(null, false, { message: "Google did not provide an email address." });
            // Only trust the email if Google asserts it is verified — otherwise
            // an attacker could register an unverified Google account with a
            // victim's email and take over their existing account here.
            const emailVerified =
              (profile.emails?.[0] as { verified?: boolean } | undefined)?.verified === true ||
              (profile as any)._json?.email_verified === true;
            if (!emailVerified) return done(null, false, { message: "Your Google email address is unverified. Verify it with Google, then try again." });

            // 1) Already linked to this Google account
            let [user] = await db.select().from(users).where(eq(users.googleId, profile.id)).limit(1);

            // 2) Existing email/password account with the same email — link it
            //    (oldest account wins, matching the LocalStrategy convention)
            if (!user) {
              const [byEmail] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${email}`).orderBy(users.id).limit(1);
              if (byEmail) {
                await db.update(users).set({ googleId: profile.id }).where(eq(users.id, byEmail.id));
                user = byEmail;
              }
            }

            // 3) Brand-new user
            if (!user) {
              [user] = await db.insert(users).values({
                email,
                passwordHash: null,
                googleId: profile.id,
                plan: "free",
              }).returning();
            }

            return done(null, {
              id: user.id,
              email: user.email,
              plan: user.plan,
              stripeCustomerId: user.stripeCustomerId,
              stripeSubscriptionId: user.stripeSubscriptionId,
              trialReportsRemaining: user.trialReportsRemaining ?? null,
            });
          } catch (err) {
            return done(err as Error);
          }
        },
      ),
    );
  }

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!user) return done(null, false);
      done(null, {
        id: user.id,
        email: user.email,
        plan: user.plan,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        trialReportsRemaining: user.trialReportsRemaining ?? null,
      });
    } catch (err) {
      done(err);
    }
  });
}

export function registerAuthRoutes(app: Express) {
  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, stripeCustomerId, stripeSubscriptionId, plan: requestedPlan } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    try {
      const [existing] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${email.toLowerCase()}`).limit(1);
      if (existing) return res.status(409).json({ error: "An account with that email already exists." });

      const passwordHash = await bcrypt.hash(password, 12);
      const allowedPlans = ["free", "single_report", "subscriber"];
      const plan = stripeSubscriptionId
        ? "subscriber"
        : allowedPlans.includes(requestedPlan)
          ? requestedPlan
          : "free";

      const [newUser] = await db.insert(users).values({
        email: email.toLowerCase(),
        passwordHash,
        plan,
        stripeCustomerId: stripeCustomerId || null,
        stripeSubscriptionId: stripeSubscriptionId || null,
      }).returning();

      req.login(
        {
          id: newUser.id,
          email: newUser.email,
          plan: newUser.plan,
          stripeCustomerId: newUser.stripeCustomerId,
          stripeSubscriptionId: newUser.stripeSubscriptionId,
          trialReportsRemaining: newUser.trialReportsRemaining ?? null,
        },
        async (err) => {
          if (err) return res.status(500).json({ error: "Login after registration failed." });
          const token = await rotateUserToken(newUser.id);
          res.json({ id: newUser.id, email: newUser.email, plan: newUser.plan, trialReportsRemaining: newUser.trialReportsRemaining ?? null, token });
        }
      );
    } catch (err: any) {
      res.status(500).json({ error: "Registration failed." });
    }
  });

  // Login
  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: { message?: string }) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials." });
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        // Team accounts: multi-device — keep the stable token, leave other
        // sessions alive. Everyone else: single active session per account —
        // rotate the token (invalidates Bearer tokens on other devices) and
        // destroy other cookie sessions.
        let token: string;
        if (isTeamAccount(user.email)) {
          token = await getOrCreateStableToken(user.id);
        } else {
          token = await rotateUserToken(user.id);
          await destroyOtherSessions(user.id, req.session?.id);
        }
        notifyTeamLogin(user.email);
        res.json({ id: user.id, email: user.email, plan: user.plan, trialReportsRemaining: user.trialReportsRemaining ?? null, token });
      });
    })(req, res, next);
  });

  // Google OAuth: kick off the redirect to Google's consent screen
  app.get("/api/auth/google", (req: Request, res: Response, next: NextFunction) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ error: "Google sign-in is not configured." });
    }
    passport.authenticate("google", { scope: ["email", "profile"] })(req, res, next);
  });

  // Google OAuth: callback — establish session + bearer token, then bounce
  // back to the SPA with the token in the URL hash (never sent to servers/logs).
  app.get("/api/auth/google/callback", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("google", (err: any, user: Express.User | false, info: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        const msg = encodeURIComponent(info?.message || "Google sign-in failed.");
        return res.redirect(`/#oauth_error=${msg}`);
      }
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        let token: string;
        if (isTeamAccount(user.email)) {
          token = await getOrCreateStableToken(user.id);
        } else {
          token = await rotateUserToken(user.id);
          await destroyOtherSessions(user.id, req.session?.id);
        }
        notifyTeamLogin(user.email);
        res.redirect(`/#oauth_token=${token}`);
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout(() => res.json({ ok: true }));
  });

  // Current user — accepts session cookie OR Bearer token (for iframe contexts where cookies are blocked)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (req.user) {
      return res.json({ id: req.user.id, email: req.user.email, plan: req.user.plan, trialReportsRemaining: req.user.trialReportsRemaining ?? null });
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const user = await resolveUserFromToken(token);
      if (user) {
        return res.json({ id: user.id, email: user.email, plan: user.plan, trialReportsRemaining: user.trialReportsRemaining ?? null });
      }
    }
    return res.status(401).json({ error: "Not authenticated." });
  });
}
