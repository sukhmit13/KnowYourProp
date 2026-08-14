import { createServer } from 'node:http';

const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');
const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';
const apiKey = process.env.TWOCAPTCHA_API_KEY;
const siteKey = '6LeTmyQjAAAAAEhRppknk5bHMrlS4MPey-a2ZZ8O';

// GET search page with full browser headers
console.log('Step 1: GET search page...');
const getResp = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  },
});

// Get ALL cookies from response
const allCookies = [];
for (const [name, value] of getResp.headers.entries()) {
  if (name.toLowerCase() === 'set-cookie') {
    allCookies.push(value.split(';')[0]);
  }
}
console.log('All cookies:', allCookies);

const html = await getResp.text();
const viewstate = html.match(/id="__VIEWSTATE"\s+value="([^"]*)"/)?.[1] ?? '';
const vstgen = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/)?.[1] ?? '';
const evval = html.match(/id="__EVENTVALIDATION"\s+value="([^"]*)"/)?.[1] ?? '';
console.log('VIEWSTATE length:', viewstate.length, '| VSTGEN:', vstgen, '| EVVAL length:', evval.length);

// Get 2captcha token
console.log('\nStep 2: 2captcha...');
const submitResp = await fetch(`https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&version=v3&action=submit_v3&min_score=0.5&googlekey=${siteKey}&pageurl=${encodeURIComponent(searchUrl)}&json=1`);
const submitData = await submitResp.json();
console.log('Submit:', submitData.status, submitData.request.substring(0, 20));
const taskId = submitData.request;

let captchaToken = null;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const resultData = await (await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`)).json();
  if (resultData.status === 1) { captchaToken = resultData.request; break; }
  if (resultData.request !== 'CAPCHA_NOT_READY') { console.error('Error:', resultData); break; }
  console.log(`  Poll ${i+1}: not ready`);
}
if (!captchaToken) { console.error('No token'); process.exit(1); }
console.log('Token obtained, length:', captchaToken.length);

// POST with all cookies
const cookieStr = allCookies.join('; ');
console.log('\nStep 3: POST with cookies:', cookieStr);

const formData = new URLSearchParams();
formData.set('__LASTFOCUS', '');
formData.set('__EVENTTARGET', '');
formData.set('__EVENTARGUMENT', '');
formData.set('__VIEWSTATE', viewstate);
formData.set('__VIEWSTATEGENERATOR', vstgen);
// Omit __VIEWSTATEENCRYPTED since browser doesn't send it unless set
formData.set('__EVENTVALIDATION', evval);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN1', pinParts[0]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN2', pinParts[1]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN3', pinParts[2]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN4', pinParts[3]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN5', pinParts[4]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$cmdContinue', 'Continue');
formData.set('ctl00$ContentPlaceHolder1$PIN', '');
formData.set('ctl00$ContentPlaceHolder1$SearchType', 'PIN');
formData.set('ctl00$ContentPlaceHolder1$GoogleCaptchaPublicKey', siteKey);
formData.set('GoogleCaptchaToken', captchaToken);

const postResp = await fetch(searchUrl, {
  method: 'POST',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': searchUrl,
    'Cookie': cookieStr,
    'Origin': 'https://www.cookcountytreasurer.com',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',
  },
  body: formData.toString(),
  redirect: 'follow',
});

const resultHtml = await postResp.text();
console.log('\nPOST result URL:', postResp.url);
console.log('HTML length:', resultHtml.length);
console.log('Has "Total Amount Billed":', resultHtml.includes('Total Amount Billed'));
console.log('Has "Are Your Taxes Paid":', resultHtml.includes('Are Your Taxes Paid'));
console.log('Error page?', postResp.url.includes('Error.aspx'));

if (!resultHtml.includes('Total Amount Billed')) {
  // Log first part of body text
  const text = resultHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  console.log('\nFirst 1000 chars of text:', text.substring(0, 1000));
}
