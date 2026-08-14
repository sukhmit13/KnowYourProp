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
  
  // Wait for captcha token
  for (let i = 0; i < 20; i++) {
    const tokenLen = await page.evaluate(() => document.getElementById('GoogleCaptchaToken')?.value?.length || 0);
    if (tokenLen > 10) { console.log('Token populated, length:', tokenLen); break; }
    await page.waitForTimeout(500);
  }

  // Fill PIN
  for (let i = 0; i < 5; i++) {
    const loc = page.locator(`#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i + 1}`);
    if ((await loc.count()) > 0 && pinParts[i]) await loc.fill(pinParts[i]);
  }
  
  console.log('Clicking...');
  await page.locator('input[id*="cmdContinue"]').click();
  
  // Wait for URL to change to results page (not using waitForNavigation)
  try {
    await page.waitForURL('**/yourpropertytaxoverviewresults**', { timeout: 30000 });
    console.log('Navigated to results!');
  } catch (e) {
    console.log('waitForURL timeout, current URL:', page.url());
  }
  
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  console.log('Final URL:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Has results:', bodyText.includes('Total Amount Billed'));
  if (bodyText.includes('Total Amount Billed')) {
    const idx = bodyText.indexOf('Are Your Taxes Paid');
    console.log('Tax data:', bodyText.substring(idx, idx + 500));
  } else {
    console.log('Body text first 300:', bodyText.substring(0, 300));
  }
} finally {
  await browser.close();
}
