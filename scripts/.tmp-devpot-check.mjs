import { chromium } from 'playwright';
const base = 'http://127.0.0.1:5000';
const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@test.com', password: 'Chicago2026!' }) });
const { token } = await res.json();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
await page.addInitScript(t => localStorage.setItem('kyp_auth_token', t), token);
await page.goto(base + '/run/447', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(15000);
const expand = page.getByText('Expand All', { exact: false }).first();
if (await expand.count()) { await expand.click(); await page.waitForTimeout(6000); }
const shot = async (sel, name) => {
  const el = page.locator(sel).first();
  if (await el.count()) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await el.screenshot({ path: `/tmp/${name}.png` }); console.log('shot', name); }
  else console.log('MISSING', sel);
};
await shot('[data-testid="dev-potential-takeaway"]', 'cur-dev-takeaway');
await shot('[data-testid="dev-rental-economics"]', 'cur-rental-econ');
await shot('#far-analysis', 'cur-far');
await browser.close();
