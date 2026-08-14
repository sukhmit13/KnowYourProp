// MUST be imported before anything that imports `playwright` (ESM imports are
// hoisted, so this lives in its own module imported first from server/index.ts).
//
// Why: the deployed bundle ships browsers in ./playwright-browsers (that's how
// the spawned recorder/tax scrapers find them — lienSearch.ts sets the same
// env var on its child processes). In-process Playwright users (recorder doc
// ingest, report PDF export) resolve browser paths from the DEFAULT cache
// (~/.cache/ms-playwright), which is NOT shipped to production — so in prod
// they fail with "Executable doesn't exist". Pointing the env var at the
// shipped folder before playwright loads fixes every in-process launch.
import { existsSync, readdirSync } from "fs";
import path from "path";

const workspaceBrowsersPath = path.join(process.cwd(), "playwright-browsers");
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(workspaceBrowsersPath)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = workspaceBrowsersPath;
}

/**
 * Launch options that always find a working Chromium.
 * Playwright's default resolution fails in production when neither the
 * ms-playwright cache nor ./playwright-browsers ships with the deployment.
 * Fallback order:
 *   1. Playwright's own resolution (dev, or wherever browsers ARE installed)
 *   2. any chromium under ./playwright-browsers or ./.cache/ms-playwright
 *   3. REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE — the Nix-provided Chromium the
 *      Replit platform guarantees in both dev and production images
 * Returns {} when the default works, else { executablePath }.
 */
export function chromiumLaunchOverrides(chromium: { executablePath(): string }): { executablePath?: string } {
  try {
    if (existsSync(chromium.executablePath())) return {};
  } catch { /* fall through to candidates */ }
  const roots = [
    path.join(process.cwd(), "playwright-browsers"),
    path.join(process.cwd(), ".cache", "ms-playwright"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!/^chromium(_headless_shell)?-/.test(dir)) continue;
      for (const cand of [
        path.join(root, dir, "chrome-linux64", "chrome"),
        path.join(root, dir, "chrome-linux", "chrome"),
        path.join(root, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        path.join(root, dir, "chrome-headless-shell-linux", "chrome-headless-shell"),
      ]) {
        if (existsSync(cand)) return { executablePath: cand };
      }
    }
  }
  const nix = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (nix && existsSync(nix)) return { executablePath: nix };
  return {}; // let Playwright throw its own descriptive error
}
