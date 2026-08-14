import { ReplitConnectors } from "@replit/connectors-sdk";

// ── Team login email alerts ──
// Sends a short email to the owner whenever a team member signs in on the
// live site. Fire-and-forget: a failure here must never block or fail login.

const ALERT_RECIPIENT = "sukhmitkalsi@gmail.com";
// Only alert in production — dev/preview logins (including automated tests)
// would be noise.
const ENABLED = process.env.NODE_ENV === "production";
// Don't alert on the owner's own account.
const EXCLUDED = new Set(["test@test.com"]);

export function notifyTeamLogin(email: string): void {
  if (!ENABLED) return;
  const lower = email.toLowerCase();
  if (EXCLUDED.has(lower)) return;
  if (!lower.endsWith("@test.com")) return; // team accounts only

  const when = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });

  // Fire and forget — never await this in the login path.
  (async () => {
    try {
      const connectors = new ReplitConnectors();
      await connectors.proxy("resend", "/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "KnowYourProp <onboarding@resend.dev>",
          to: [ALERT_RECIPIENT],
          subject: `Team login: ${lower}`,
          text: `${lower} signed in to KnowYourProp on ${when} (Chicago time).`,
        }),
      });
    } catch (err: any) {
      console.error(`[login-alert] Failed to send alert for ${lower}: ${err?.message || err}`);
    }
  })();
}
