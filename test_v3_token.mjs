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
  
  console.log('Loading search page...');
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
  
  // Wait up to 10 seconds for the reCAPTCHA v3 token to be populated
  console.log('Waiting for reCAPTCHA v3 token...');
  let tokenValue = '';
  for (let i = 0; i < 20; i++) {
    tokenValue = await page.evaluate(() => {
      const field = document.getElementById('GoogleCaptchaToken');
      return field ? field.value : '';
    });
    if (tokenValue && tokenValue.length > 10) break;
    await page.waitForTimeout(500);
    console.log(`  attempt ${i+1}: token length = ${tokenValue.length}`);
  }
  
  console.log('Token value length:', tokenValue.length);
  if (tokenValue.length > 10) {
    console.log('Token (first 50 chars):', tokenValue.substring(0, 50));
    console.log('reCAPTCHA v3 token successfully generated!');
  } else {
    console.log('Token NOT generated (likely bot detection via reCAPTCHA v3 score)');
  }
} finally {
  await browser.close();
}
