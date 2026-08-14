// Inspect the actual form fields and actions
const baseUrl = 'https://www.cookcountytreasurer.com';
const searchUrl = `${baseUrl}/setsearchparameters.aspx`;

const getResp = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});
const html = await getResp.text();

// Find form action
const formAction = html.match(/<form[^>]+action="([^"]+)"/)?.[1] || 'NOT FOUND';
console.log('Form action:', formAction);

// Find all input fields with their names
const inputFields = [...html.matchAll(/<input[^>]+name="([^"]+)"[^>]*>/g)].map(m => {
  const name = m[1];
  const type = m[0].match(/type="([^"]+)"/)?.[1] || 'text';
  const id = m[0].match(/id="([^"]+)"/)?.[1] || '';
  return { name, type, id };
});
console.log('\nInput fields:');
inputFields.forEach(f => console.log(`  ${f.type.padEnd(10)} id="${f.id}" name="${f.name}"`));

// Check for reCAPTCHA
const hasRecaptcha = html.includes('recaptcha') || html.includes('g-recaptcha');
console.log('\nHas reCAPTCHA:', hasRecaptcha);
const recaptchaSiteKey = html.match(/data-sitekey="([^"]+)"/)?.[1];
console.log('reCAPTCHA site key:', recaptchaSiteKey || 'NOT FOUND');

// Check DevExpress callback URL
const dxCallback = html.match(/DXR\.axd\?r=([^'"&]+)/)?.[0] || 'NOT FOUND';
console.log('DevExpress callback:', dxCallback);

// Check for any redirect hints in script
const redirectScript = html.match(/yourpropertytaxoverviewresults/g);
console.log('Redirect to results page mentioned in HTML:', redirectScript ? redirectScript.length : 0, 'times');
