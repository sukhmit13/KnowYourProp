const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');
const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';

// GET the page
const getResp = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
  },
});

const rawCookies = getResp.headers.getSetCookie?.() || 
  (getResp.headers.get('set-cookie') || '').split(', ').filter(Boolean);
const html = await getResp.text();

// Extract form fields
const viewstate = html.match(/id="__VIEWSTATE"\s+value="([^"]*)"/)?.[1] || '';
const vstgen = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/)?.[1] || '';
const evval = html.match(/id="__EVENTVALIDATION"\s+value="([^"]*)"/)?.[1] || '';
const captchaKey = html.match(/id="ContentPlaceHolder1_GoogleCaptchaPublicKey"\s+value="([^"]*)"/)?.[1] || '';

console.log('Got VIEWSTATE length:', viewstate.length);
console.log('reCAPTCHA public key:', captchaKey);
console.log('Raw cookies:', rawCookies.length > 0 ? rawCookies : 'NONE');

// Build cookie string
const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

// POST with correct field names and a dummy token
const formData = new URLSearchParams();
formData.set('__LASTFOCUS', '');
formData.set('__EVENTTARGET', '');
formData.set('__EVENTARGUMENT', '');
formData.set('__VIEWSTATE', viewstate);
formData.set('__VIEWSTATEGENERATOR', vstgen);
formData.set('__VIEWSTATEENCRYPTED', '');
formData.set('__EVENTVALIDATION', evval);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN1', pinParts[0]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN2', pinParts[1]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN3', pinParts[2]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN4', pinParts[3]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN5', pinParts[4]);
formData.set('ctl00$ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$cmdContinue', 'Continue');
formData.set('ctl00$ContentPlaceHolder1$PIN', '');
formData.set('ctl00$ContentPlaceHolder1$SearchType', 'PIN');
formData.set('ctl00$ContentPlaceHolder1$GoogleCaptchaPublicKey', captchaKey);
formData.set('GoogleCaptchaToken', '');

console.log('\nPOSTing with corrected field names...');
const postResp = await fetch(searchUrl, {
  method: 'POST',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': searchUrl,
    'Cookie': cookieStr,
    'Origin': 'https://www.cookcountytreasurer.com',
    'Connection': 'keep-alive',
  },
  body: formData.toString(),
  redirect: 'follow',
});

const resultHtml = await postResp.text();
console.log('POST status:', postResp.status, 'Result URL:', postResp.url);
console.log('Result HTML length:', resultHtml.length);
console.log('Has "Total Amount Billed":', resultHtml.includes('Total Amount Billed'));
console.log('Has "Are Your Taxes Paid":', resultHtml.includes('Are Your Taxes Paid'));

// Check for error messages
const captchaError = resultHtml.includes('captcha') || resultHtml.includes('Captcha') || resultHtml.includes('robot');
console.log('Has CAPTCHA error in response:', captchaError);

// Extract text content
const textContent = resultHtml
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
  
const idx = textContent.indexOf('Your Property Tax Overview');
if (idx !== -1) {
  console.log('\nProperty Tax section:', textContent.substring(idx, idx + 2000));
} else {
  console.log('\nText content around search form:');
  const searchIdx = textContent.indexOf('Search By Property Index Number');
  console.log(textContent.substring(Math.max(0, searchIdx - 100), searchIdx + 500));
}
