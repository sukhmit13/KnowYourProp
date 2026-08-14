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
  await page.waitForTimeout(2000);
  
  // Check what's available globally for reCAPTCHA
  const captchaInfo = await page.evaluate(() => {
    const tokenField = document.getElementById('GoogleCaptchaToken');
    const keyField = document.getElementById('ContentPlaceHolder1_GoogleCaptchaPublicKey');
    const hasGrecaptcha = typeof window.grecaptcha !== 'undefined';
    const hasGrecaptchaEnterprise = typeof window.grecaptcha !== 'undefined' && typeof window.grecaptcha.enterprise !== 'undefined';
    return {
      tokenValue: tokenField ? tokenField.value : 'FIELD NOT FOUND',
      siteKey: keyField ? keyField.value : 'FIELD NOT FOUND',
      hasGrecaptcha,
      hasGrecaptchaEnterprise,
      captchaKeys: Object.keys(window).filter(k => k.toLowerCase().includes('captcha'))
    };
  });
  
  console.log('reCAPTCHA info:', JSON.stringify(captchaInfo, null, 2));
  
  // Try to look at the page JS to find reCAPTCHA integration
  const scripts = await page.$$eval('script', els => 
    els.map(el => ({ src: el.src, textLen: el.textContent ? el.textContent.length : 0 }))
  );
  console.log('\nScripts on page:');
  scripts.filter(s => s.src && s.src.includes('captcha') || s.src && s.src.includes('recaptcha')).forEach(s => {
    console.log(' CAPTCHA script:', s.src);
  });
  
  // Look at inline script content for captcha
  const inlineScripts = await page.$$eval('script:not([src])', els => 
    els.map(el => el.textContent || '').filter(t => t.includes('captcha') || t.includes('Captcha'))
  );
  console.log('\nInline scripts with captcha:', inlineScripts.length);
  inlineScripts.forEach(s => console.log(' SCRIPT:', s.substring(0, 500)));
} finally {
  await browser.close();
}
