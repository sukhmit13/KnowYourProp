const pin = '13364290210000';
const baseUrl = 'https://www.cookcountypropertyinfo.com';

// GET the main page first
const getResp = await fetch(baseUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});
const cookies = (getResp.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ');
const html = await getResp.text();

const viewstate = html.match(/id="__VIEWSTATE"\s+value="([^"]*)"/)?.[1] || '';
const vstgen = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/)?.[1] || '';
const evval = html.match(/id="__EVENTVALIDATION"\s+value="([^"]*)"/)?.[1] || '';

console.log('VIEWSTATE length:', viewstate.length, 'VSTGEN:', vstgen);

// The site uses "executeQuery()" JS function - let's look at the bundle for the PIN search API
const bundleResp = await fetch(`${baseUrl}/Scripts/bundle.min.js`, {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
const bundle = await bundleResp.text();

// Find function calls and URLs in bundle
const urlMatches = [...bundle.matchAll(/["'](\/[^"']+\.aspx[^"']*)["']/g)].map(m => m[1]);
console.log('\nASPX URLs in bundle:');
urlMatches.forEach(u => console.log(' ', u));

// Look for PIN search function
const pinFuncMatch = bundle.match(/(?:executeQuery|PINSearch|taxbill)[^{]*\{[^}]{0,500}/gi);
console.log('\nPIN search functions in bundle:', pinFuncMatch?.slice(0, 3));
