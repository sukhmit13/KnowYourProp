// Standalone Playwright scraper for Cook County Treasurer
// Run as child process: node treasurer-scraper.mjs <pin>
// Output: JSON result on stdout

const pin = process.argv[2];
if (!pin) {
  process.stdout.write(JSON.stringify({ error: 'No PIN provided' }));
  process.exit(1);
}

const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';
const pinParts = pin.split('-');
const RECAPTCHA_SITE_KEY = '6LeTmyQjAAAAAEhRppknk5bHMrlS4MPey-a2ZZ8O';
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;

async function solveRecaptchaV3() {
  if (!TWOCAPTCHA_API_KEY) {
    process.stderr.write('[scraper] No TWOCAPTCHA_API_KEY, skipping\n');
    return null;
  }

  process.stderr.write('[scraper] Submitting reCAPTCHA v3 to 2captcha...\n');
  const submitUrl = `https://2captcha.com/in.php?key=${TWOCAPTCHA_API_KEY}&method=userrecaptcha&googlekey=${RECAPTCHA_SITE_KEY}&pageurl=${encodeURIComponent(searchUrl)}&version=v3&action=submit_v3&score=0.7&json=1`;

  let submitRes;
  try {
    submitRes = await fetch(submitUrl);
  } catch (e) {
    process.stderr.write(`[scraper] 2captcha submit error: ${e.message}\n`);
    return null;
  }

  if (!submitRes.ok) {
    process.stderr.write(`[scraper] 2captcha HTTP error: ${submitRes.status}\n`);
    return null;
  }

  const submitJson = await submitRes.json();
  if (submitJson.status !== 1) {
    process.stderr.write(`[scraper] 2captcha error: ${JSON.stringify(submitJson)}\n`);
    return null;
  }

  const captchaId = submitJson.request;
  process.stderr.write(`[scraper] 2captcha id: ${captchaId}\n`);

  // Poll for result (every 5s, up to 120s)
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resultUrl = `https://2captcha.com/res.php?key=${TWOCAPTCHA_API_KEY}&action=get&id=${captchaId}&json=1`;
    let resultRes;
    try {
      resultRes = await fetch(resultUrl);
      const resultJson = await resultRes.json();
      if (resultJson.status === 1) {
        process.stderr.write(`[scraper] 2captcha solved! token length: ${resultJson.request.length}\n`);
        return resultJson.request;
      }
      if (resultJson.request !== 'CAPCHA_NOT_READY') {
        process.stderr.write(`[scraper] 2captcha error: ${JSON.stringify(resultJson)}\n`);
        return null;
      }
    } catch (e) {
      process.stderr.write(`[scraper] poll error: ${e.message}\n`);
    }
    process.stderr.write(`[scraper] 2captcha poll ${i + 1}: not ready\n`);
  }

  process.stderr.write('[scraper] 2captcha timed out\n');
  return null;
}

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  process.stderr.write(`[scraper] Loading page...\n`);
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
  process.stderr.write(`[scraper] Page loaded at: ${page.url()}\n`);

  // Solve captcha
  const captchaToken = await solveRecaptchaV3();
  process.stderr.write(`[scraper] Captcha token: ${captchaToken ? 'obtained (' + captchaToken.length + ' chars)' : 'none'}\n`);

  // Fill PIN fields
  for (let i = 0; i < 5; i++) {
    const locator = page.locator(`#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i + 1}`);
    if ((await locator.count()) > 0 && pinParts[i]) {
      await locator.fill(pinParts[i]);
    }
  }
  process.stderr.write(`[scraper] PIN fields filled\n`);

  if (captchaToken) {
    // Only intercept the specific form POST — NOT all requests.
    // A broad '**/*' pattern captures WebSocket upgrades on the results page,
    // and calling route.continue() on a WS connection crashes the browser context.
    await page.route('**/setsearchparameters.aspx', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const postData = request.postData() || '';
        let newBody = postData;
        if (postData.includes('g-recaptcha-response')) {
          newBody = postData.replace(/g-recaptcha-response=[^&]*/g, `g-recaptcha-response=${encodeURIComponent(captchaToken)}`);
        } else {
          newBody = postData + `&g-recaptcha-response=${encodeURIComponent(captchaToken)}`;
        }
        process.stderr.write(`[scraper] Intercepted POST, injecting token (original: ${postData.length}, new: ${newBody.length})\n`);
        await route.continue({ postData: newBody });
      } else {
        await route.continue();
      }
    });
    process.stderr.write(`[scraper] Route intercept set up\n`);
  }

  process.stderr.write(`[scraper] Clicking Continue...\n`);

  // Wait for navigation concurrently with the click so we don't miss the redirect.
  // waitForURL handles the full navigation cycle cleanly without polling.
  const [navResult] = await Promise.allSettled([
    page.waitForURL(url => url.includes('yourpropertytax') || url.includes('Error.aspx'), { timeout: 60000 }),
    page.locator('input[id*="cmdContinue"]').click(),
  ]);

  // Remove the route intercept — we only needed it for the form POST.
  // Leaving it active on the results page can cause issues with subsequent requests.
  await page.unroute('**/setsearchparameters.aspx').catch(() => {});

  const finalUrl = page.url();
  process.stderr.write(`[scraper] After click, URL: ${finalUrl} (nav: ${navResult.status})\n`);

  if (!finalUrl.includes('yourpropertytax')) {
    process.stderr.write(`[scraper] FAILED - did not reach results page\n`);
    process.stdout.write(JSON.stringify({ error: 'Did not reach results page', url: finalUrl }));
    process.exit(0);
  }

  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch { }
  await page.waitForTimeout(1000);

  // page.evaluate(innerText) gives the exact visible text the browser renders,
  // preserving newlines at block boundaries — which parseTreasurerText relies on.
  // The previous crash ("Target page closed") was caused by the broad page.route('**/*')
  // intercepting WebSocket upgrades; that's now fixed with the narrower route above,
  // so innerText is safe to use again.
  let bodyText;
  try {
    bodyText = await page.evaluate(() => document.body.innerText);
  } catch (evalErr) {
    process.stderr.write(`[scraper] page.evaluate failed: ${evalErr.message}, falling back to page.content()...\n`);
    // Fallback: strip HTML manually, handling <td> cells with newlines so
    // parseTreasurerText block patterns still work on the table-based layout.
    const html = await page.content();
    bodyText = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<\/?(?:div|p|tr|td|th|li|h[1-6]|section|article|header|footer|table|thead|tbody|tfoot|ul|ol|blockquote|pre)[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#160;/g, ' ')
      .replace(/[^\S\n]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  process.stderr.write(`[scraper] Got body text (${bodyText.length} chars)\n`);
  process.stdout.write(JSON.stringify({ success: true, bodyText }));
} catch (err) {
  process.stderr.write(`[scraper] Error: ${err.message}\n`);
  process.stdout.write(JSON.stringify({ error: err.message }));
} finally {
  await browser.close();
}
