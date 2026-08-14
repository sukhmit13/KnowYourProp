import { chromium } from 'playwright';

const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');
const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';
const apiKey = process.env.TWOCAPTCHA_API_KEY;
const siteKey = '6LeTmyQjAAAAAEhRppknk5bHMrlS4MPey-a2ZZ8O';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  
  // Start solving captcha in parallel while loading the page
  console.log('Loading page and solving captcha in parallel...');
  const [, captchaToken] = await Promise.all([
    page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 }),
    (async () => {
      const submitResp = await fetch(`https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&version=v3&action=submit_v3&min_score=0.5&googlekey=${siteKey}&pageurl=${encodeURIComponent(searchUrl)}&json=1`);
      const submitData = await submitResp.json();
      if (submitData.status !== 1) throw new Error('2captcha submit failed: ' + JSON.stringify(submitData));
      console.log('2captcha task ID:', submitData.request);
      
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const resultData = await (await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${submitData.request}&json=1`)).json();
        if (resultData.status === 1) return resultData.request;
        if (resultData.request !== 'CAPCHA_NOT_READY') throw new Error('2captcha error: ' + resultData.request);
        console.log(`  captcha poll ${i+1}: not ready`);
      }
      throw new Error('2captcha timeout');
    })()
  ]);
  
  console.log('Page loaded, captcha token obtained (length:', captchaToken.length, ')');
  console.log('Page URL after load:', page.url());
  
  // Inject the captcha token into the hidden field
  await page.evaluate((token) => {
    const field = document.getElementById('GoogleCaptchaToken');
    if (field) field.value = token;
  }, captchaToken);
  
  // Fill in PIN fields
  for (let i = 0; i < 5; i++) {
    const locator = page.locator(`#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i + 1}`);
    if ((await locator.count()) > 0 && pinParts[i]) {
      await locator.fill(pinParts[i]);
    }
  }
  console.log('PIN fields filled');
  
  // Click Continue and wait for navigation
  const [navigation] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
    page.locator('input[id*="cmdContinue"]').click(),
  ]);
  
  const finalUrl = page.url();
  console.log('After submit URL:', finalUrl);
  
  if (finalUrl.includes('Error.aspx')) {
    console.log('Got Error.aspx');
    // Try waiting longer
    await page.waitForTimeout(3000);
    console.log('Final URL after wait:', page.url());
  } else if (finalUrl.includes('yourpropertytaxoverviewresults')) {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body.innerText);
    console.log('\nResults page text (first 2000 chars):');
    console.log(text.substring(0, 2000));
  }
  
} finally {
  await browser.close();
}
