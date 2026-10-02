import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

// Real component and current saved observations, without sign-in or app-route changes.
const source = JSON.parse(fs.readFileSync("server/data/ev_registrations.json", "utf8"));
const data = { zipCode: "60622", cookCountyData: source.cookCountyMonthly,
  zipCodeData: source.byZipCode["60622"], sourceUrl: source.sourceUrl, lastUpdated: source.lastUpdated };
const built = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {EVRegistrationTrends} from '@/components/report/ProjectUseDomainPanels';
    createRoot(document.getElementById('root')).render(
      <EVRegistrationTrends loading={false} zipCode="60622" data={${JSON.stringify(data)}}/>);`,
    resolveDir: process.cwd(), sourcefile: "ev-current-fixture.tsx", loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  alias: { "@": path.join(process.cwd(), "client/src") },
  define: { "process.env.NODE_ENV": '"production"' },
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${fs.readFileSync("client/src/kyp-base.css", "utf8")}</style>
      <main class="kyp-report"><div class="kyp-body" id="root"></div></main>`);
    await page.addScriptTag({ content: built.outputFiles[0].text });
    await page.waitForTimeout(500);
    const text = await page.locator("#root").textContent();
    assert.match(text, /49,576/);
    assert.match(text, /1,183/);
    assert.match(text, /Sep\/2026/);
    assert.equal(await page.locator(".recharts-surface").count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.screenshot({ path: `/tmp/ev-current-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log("Current September EV observations render correctly on desktop and mobile");
} finally { await browser.close(); }