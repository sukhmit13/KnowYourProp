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
  
  // Track ALL requests and responses
  const networkLog = [];
  page.on('request', req => {
    if (req.method() === 'POST' || req.url().includes('search') || req.url().includes('tax') || req.url().includes('DXR') || req.url().includes('aspx')) {
      networkLog.push(`REQ ${req.method()} ${req.url().substring(0, 120)}`);
    }
  });
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('aspx') || url.includes('DXR') || url.includes('search')) {
      networkLog.push(`RESP ${resp.status()} ${url.substring(0, 120)}`);
    }
  });

  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
  console.log('Page loaded, URL:', page.url());

  // Fill PIN fields
  for (let i = 0; i < 5; i++) {
    const locator = page.locator(`#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i + 1}`);
    if ((await locator.count()) > 0 && pinParts[i]) {
      await locator.fill(pinParts[i]);
      await page.waitForTimeout(100);
    }
  }

  console.log('Clicking Continue...');
  await page.locator('input[id*="cmdContinue"]').click();
  
  // Wait and watch what happens for 15 seconds
  await page.waitForTimeout(15000);
  
  console.log('\nFinal URL:', page.url());
  
  console.log('\nNetwork log:');
  networkLog.forEach(l => console.log(' ', l));
  
  // Check the page content after click
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\nBody text length:', bodyText.length);
  const hasResults = bodyText.includes('Total Amount Billed') || bodyText.includes('Are Your Taxes Paid');
  console.log('Has results:', hasResults);
  if (hasResults) {
    const idx = bodyText.indexOf('Are Your Taxes Paid');
    console.log('Results section:', bodyText.substring(idx, idx + 1000));
  } else {
    console.log('Body text (first 500):', bodyText.substring(0, 500));
    
    // Check if the PIN values are still in the fields (meaning form wasn't submitted)
    const pinValues = await page.evaluate(() => {
      const vals = [];
      for (let i = 1; i <= 5; i++) {
        const el = document.getElementById(`ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i}`);
        vals.push(el ? el.value : 'NOT FOUND');
      }
      return vals;
    });
    console.log('PIN field values after click:', pinValues);
    
    // Check captcha status
    const captchaStatus = await page.evaluate(() => {
      const tokenField = document.getElementById('GoogleCaptchaToken');
      return { tokenValue: tokenField?.value?.length || 0 };
    });
    console.log('Captcha token field length:', captchaStatus.tokenValue);
  }
} finally {
  await browser.close();
}
