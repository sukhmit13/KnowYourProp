const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');
const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';
const apiKey = process.env.TWOCAPTCHA_API_KEY;
const siteKey = '6LeTmyQjAAAAAEhRppknk5bHMrlS4MPey-a2ZZ8O';

// Step 1: GET search page
console.log('Step 1: GET search page...');
const getResp = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  },
});
const html = await getResp.text();
const rawCookieHeader = getResp.headers.get('set-cookie') || '';
const sessionCookie = rawCookieHeader.split(';')[0];
const viewstate = html.match(/id="__VIEWSTATE"\s+value="([^"]*)"/)?.[1] ?? '';
const vstgen = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/)?.[1] ?? '';
const evval = html.match(/id="__EVENTVALIDATION"\s+value="([^"]*)"/)?.[1] ?? '';
console.log('Cookie:', sessionCookie);
console.log('VIEWSTATE length:', viewstate.length);

// Step 2: Solve reCAPTCHA v3
console.log('\nStep 2: Submit to 2captcha...');
const submitUrl = `https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&version=v3&action=submit_v3&min_score=0.5&googlekey=${siteKey}&pageurl=${encodeURIComponent(searchUrl)}&json=1`;
const submitResp = await fetch(submitUrl);
const submitText = await submitResp.text();
console.log('2captcha submit response:', submitText.substring(0, 200));

let submitData;
try { submitData = JSON.parse(submitText); } catch(e) {
  console.error('Not JSON, trying text parse:', submitText);
  process.exit(1);
}

if (submitData.status !== 1) { console.error('Submit failed'); process.exit(1); }

const taskId = submitData.request;
console.log('Task ID:', taskId);

let captchaToken = null;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const resultUrl = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`;
  const resultResp = await fetch(resultUrl);
  const resultText = await resultResp.text();
  
  let resultData;
  try { resultData = JSON.parse(resultText); } catch(e) {
    console.log(`Poll ${i+1}: non-JSON response:`, resultText.substring(0, 100));
    continue;
  }
  
  console.log(`Poll ${i+1}: status=${resultData.status}, req=${String(resultData.request).substring(0, 30)}`);
  
  if (resultData.status === 1) {
    captchaToken = resultData.request;
    break;
  } else if (resultData.request !== 'CAPCHA_NOT_READY') {
    console.error('Error:', resultData.request);
    break;
  }
}

if (!captchaToken) { console.error('No token'); process.exit(1); }
console.log('\nToken obtained! Length:', captchaToken.length);

// Step 3: POST with token
console.log('\nStep 3: POST form...');
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
formData.set('ctl00$ContentPlaceHolder1$GoogleCaptchaPublicKey', siteKey);
formData.set('GoogleCaptchaToken', captchaToken);

const postResp = await fetch(searchUrl, {
  method: 'POST',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': searchUrl,
    'Cookie': sessionCookie,
    'Origin': 'https://www.cookcountytreasurer.com',
  },
  body: formData.toString(),
  redirect: 'follow',
});

const resultHtml = await postResp.text();
console.log('POST status:', postResp.status, '| URL:', postResp.url);
console.log('HTML length:', resultHtml.length);
console.log('Has "Total Amount Billed":', resultHtml.includes('Total Amount Billed'));
console.log('Has "Are Your Taxes Paid":', resultHtml.includes('Are Your Taxes Paid'));
console.log('Redirected to results page:', postResp.url.includes('yourpropertytaxoverviewresults'));

if (resultHtml.includes('Total Amount Billed')) {
  // Extract text
  const text = resultHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const idx = text.indexOf('Are Your Taxes Paid');
  console.log('\n--- Tax section ---');
  console.log(text.substring(idx, idx + 3000));
} else {
  // Check error
  const text = resultHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const searchIdx = text.indexOf('Search By Property Index Number');
  console.log('\n--- Search form content (no results) ---');
  console.log(text.substring(searchIdx, searchIdx + 1000));
}
