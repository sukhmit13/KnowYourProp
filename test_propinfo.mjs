const pin = '13364290210000';
const baseUrl = 'https://www.cookcountypropertyinfo.com';

// Try to find the API endpoint by looking at the search page
const getResp = await fetch(`${baseUrl}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
  }
});

const html = await getResp.text();
console.log('Page length:', html.length);

// Look for API endpoints in scripts
const apiUrls = [...html.matchAll(/["'](\/api\/[^"']+)["']/g)].map(m => m[1]);
console.log('API URLs found:', apiUrls.slice(0, 20));

// Check for PIN search endpoint
const pinSearch = html.match(/pin.*?search|search.*?pin|taxbill|tax.?bill|billamt/gi);
console.log('PIN/tax mentions:', pinSearch?.slice(0, 10));

// Try direct PIN lookup
const pinUrl = `${baseUrl}/portal/Property/PropertyTaxSearch?pin=${pin}`;
const pinResp = await fetch(pinUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/html',
  }
});
console.log('\nPIN search status:', pinResp.status, pinResp.url);
const pinText = await pinResp.text();
console.log('Response length:', pinText.length);
console.log('Has tax data:', pinText.includes('Total') || pinText.includes('billed') || pinText.includes('Billed'));
console.log('First 500:', pinText.substring(0, 500));
