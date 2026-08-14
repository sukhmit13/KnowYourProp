import { chromium } from 'playwright';

const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');
const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
  console.log('Page loaded');
  
  // Check token FIRST before doing anything
  const tokenBefore = await page.evaluate(() => document.getElementById('GoogleCaptchaToken')?.value?.length || 0);
  console.log('Token length before PIN fill:', tokenBefore);
  
  // Fill PIN FIRST
  for (let i = 0; i < 5; i++) {
    const loc = page.locator(`#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i + 1}`);
    if ((await loc.count()) > 0 && pinParts[i]) await loc.fill(pinParts[i]);
  }
  
  // Check token after PIN fill
  const tokenAfterPin = await page.evaluate(() => document.getElementById('GoogleCaptchaToken')?.value?.length || 0);
  console.log('Token length after PIN fill:', tokenAfterPin);
  
  // Now wait for token if not populated
  for (let i = 0; i < 20; i++) {
    const tokenLen = await page.evaluate(() => document.getElementById('GoogleCaptchaToken')?.value?.length || 0);
    if (tokenLen > 10) { console.log('Token populated, length:', tokenLen); break; }
    if (i === 19) console.log('Token never populated');
    await page.waitForTimeout(500);
  }

  console.log('Clicking...');
  await page.locator('input[id*="cmdContinue"]').click();
  
  try {
    await page.waitForURL('**/yourpropertytaxoverviewresults**', { timeout: 30000 });
    console.log('SUCCESS: Navigated to results!');
  } catch (e) {
    console.log('waitForURL timeout, current URL:', page.url());
    // Check what happened
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Body text first 300:', bodyText.substring(0, 300));
  }
} finally {
  await browser.close();
}
