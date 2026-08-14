const searchUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';
const pin = '13-36-429-021-0000';

// GET the page
const getResp = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
  },
});
const html = await getResp.text();
const rawCookieHeader = getResp.headers.get('set-cookie') || '';
const sessionCookie = rawCookieHeader.split(';')[0];

// Find all DevExpress callback params
const dxHidden = [...html.matchAll(/id="([^"]+DXVBST|[^"]+DXState|[^"]+DXMobileChecksum)"\s+value="([^"]*)"/g)].map(m => ({ id: m[1], value: m[2].length }));
console.log('DevExpress hidden fields:', dxHidden);

// Check what the Continue button's name format is
const btnMatch = html.match(/<input[^>]+(?:cmdContinue)[^>]*>/);
console.log('\nContinue button HTML:', btnMatch?.[0]);

// Check DXR.axd callback URL - this might be the actual form submission endpoint
const dxrMatch = html.match(/DXR\.axd\?r=[^"'&]+/g);
console.log('\nDevExpress callback URLs:', dxrMatch?.slice(0, 5));

// Find the form's action attribute
const formAction = html.match(/<form[^>]+action="([^"]+)"/)?.[1];
console.log('\nForm action:', formAction);

// What does the callback URL respond with? Try a DXR POST
const dxUrl = 'https://www.cookcountytreasurer.com/DXR.axd?r=1_72,1_66,1_71-lVAmw';
const dxResp = await fetch(dxUrl, {
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Cookie': sessionCookie,
  },
});
console.log('\nDXR.axd status:', dxResp.status);
const dxContent = await dxResp.text();
console.log('DXR.axd content type:', dxResp.headers.get('content-type'));
console.log('DXR.axd response length:', dxContent.length);
console.log('DXR.axd first 200 chars:', dxContent.substring(0, 200));
