const baseUrl = 'https://www.cookcountypropertyinfo.com';

const getResp = await fetch(`${baseUrl}`, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

const html = await getResp.text();

// Extract script src URLs
const scripts = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]).filter(s => s.includes('.js'));
console.log('Scripts:', scripts.slice(0, 15));

// Look for taxbill URL
const taxbillMatch = html.match(/taxbill[^"'<>]*/gi);
console.log('Taxbill mentions:', taxbillMatch?.slice(0, 5));

// Look for API/AJAX calls
const ajaxCalls = [...html.matchAll(/(?:url|href|action)\s*[:=]\s*["']([^"']+)["']/gi)]
  .map(m => m[1]).filter(u => u.includes('tax') || u.includes('pin') || u.includes('property'));
console.log('Tax/PIN URLs:', ajaxCalls.slice(0, 10));

// Look for the PIN search form action
const formAction = html.match(/<form[^>]+>/g);
console.log('Forms:', formAction?.slice(0, 5));
