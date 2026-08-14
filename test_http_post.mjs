// Test direct HTTP POST to Cook County Treasurer (bypassing browser/reCAPTCHA)
const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');
const baseUrl = 'https://www.cookcountytreasurer.com';
const searchUrl = `${baseUrl}/setsearchparameters.aspx`;

// Step 1: GET the search page to get cookies + hidden form fields
console.log('Step 1: GET search page...');
const getResp = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  },
  redirect: 'follow',
});

const cookies = getResp.headers.get('set-cookie') || '';
const html = await getResp.text();

// Extract hidden fields
const viewstate = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1] || '';
const vstgen = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/)?.[1] || '';
const evval = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/)?.[1] || '';

console.log('GET status:', getResp.status, '| Cookies length:', cookies.length);
console.log('VIEWSTATE length:', viewstate.length);
console.log('VIEWSTATEGENERATOR:', vstgen);
console.log('EVENTVALIDATION length:', evval.length);

if (!viewstate) {
  console.log('No VIEWSTATE found! HTML snippet:', html.substring(0, 500));
  process.exit(1);
}

// Build cookie header from Set-Cookie
const cookieStr = cookies.split(', ').map(c => c.split(';')[0]).join('; ');

// Step 2: POST with PIN fields
const formData = new URLSearchParams();
formData.set('__VIEWSTATE', viewstate);
formData.set('__VIEWSTATEGENERATOR', vstgen);
formData.set('__EVENTVALIDATION', evval);
formData.set('__EVENTTARGET', '');
formData.set('__EVENTARGUMENT', '');
formData.set('ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN1', pinParts[0]);
formData.set('ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN2', pinParts[1]);
formData.set('ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN3', pinParts[2]);
formData.set('ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN4', pinParts[3]);
formData.set('ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$txtPIN5', pinParts[4]);
formData.set('ContentPlaceHolder1$ASPxPanel1$SearchByPIN1$cmdContinue', 'Continue');

console.log('\nStep 2: POST with PIN fields...');
const postResp = await fetch(searchUrl, {
  method: 'POST',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': searchUrl,
    'Cookie': cookieStr,
  },
  body: formData.toString(),
  redirect: 'follow',
});

const resultHtml = await postResp.text();
console.log('POST status:', postResp.status, '| URL:', postResp.url);
console.log('Result HTML length:', resultHtml.length);
console.log('Has "Total Amount Billed":', resultHtml.includes('Total Amount Billed'));
console.log('Has "Are Your Taxes Paid":', resultHtml.includes('Are Your Taxes Paid'));
console.log('\nFirst 2000 chars of result:');
// Extract text-like content
const textContent = resultHtml
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
console.log(textContent.substring(0, 2000));
