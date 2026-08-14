// Same environment as the server would use
process.env.NODE_ENV = 'development';

import { chromium } from 'playwright';

const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');
const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';

// Run it twice in parallel (simulating concurrent requests)
async function scrape(id) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    console.log(`[${id}] Loading search page...`);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
    console.log(`[${id}] Page loaded`);

    for (let i = 0; i < 5; i++) {
      const locator = page.locator(`#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i + 1}`);
      if ((await locator.count()) > 0 && pinParts[i]) await locator.fill(pinParts[i]);
    }
    console.log(`[${id}] PIN filled`);

    // Watch requests
    page.on('request', req => {
      if (req.method() === 'POST' || req.url().includes('yourpropertytax') || req.url().includes('aspx')) {
        console.log(`[${id}] REQ ${req.method()} ${req.url().substring(0, 100)}`);
      }
    });
    page.on('response', resp => {
      if (resp.url().includes('yourpropertytax') || resp.url().includes('aspx')) {
        console.log(`[${id}] RESP ${resp.status()} ${resp.url().substring(0, 100)}`);
      }
    });

    await page.locator('input[id*="cmdContinue"]').click();
    console.log(`[${id}] Clicked`);

    try {
      await page.waitForURL('**/yourpropertytaxoverviewresults**', { timeout: 30000 });
      console.log(`[${id}] SUCCESS: navigated to results`);
    } catch (e) {
      console.log(`[${id}] waitForURL timeout, current URL:`, page.url());
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(`[${id}] Has results:`, bodyText.includes('Total Amount Billed'));
    console.log(`[${id}] Body first 200:`, bodyText.substring(0, 200));
  } finally {
    await browser.close();
  }
}

// Run single scrape, not parallel
await scrape(1);
