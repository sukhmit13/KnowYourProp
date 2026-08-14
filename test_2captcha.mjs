// Test 2captcha reCAPTCHA v3 solving via REST API
const apiKey = process.env.TWOCAPTCHA_API_KEY;
const siteKey = '6LeTmyQjAAAAAEhRppknk5bHMrlS4MPey-a2ZZ8O';
const pageUrl = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';

if (!apiKey) { console.error('No TWOCAPTCHA_API_KEY'); process.exit(1); }

console.log('API key present (length:', apiKey.length, ')');

// Step 1: Submit task to 2captcha
const submitUrl = `https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&version=v3&action=submit_v3&min_score=0.5&googlekey=${siteKey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
console.log('Submitting reCAPTCHA v3 task to 2captcha...');
const submitResp = await fetch(submitUrl);
const submitData = await submitResp.json();
console.log('Submit response:', JSON.stringify(submitData));

if (submitData.status !== 1) {
  console.error('Failed to submit task:', submitData);
  process.exit(1);
}

const taskId = submitData.request;
console.log('Task ID:', taskId);

// Step 2: Poll for result (up to 120s)
let token = null;
for (let i = 0; i < 24; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const resultUrl = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`;
  const resultResp = await fetch(resultUrl);
  const resultData = await resultResp.json();
  console.log(`Poll attempt ${i+1}:`, JSON.stringify(resultData));
  
  if (resultData.status === 1) {
    token = resultData.request;
    break;
  } else if (resultData.request !== 'CAPCHA_NOT_READY') {
    console.error('Error:', resultData);
    break;
  }
}

if (token) {
  console.log('\n✓ Token obtained! Length:', token.length);
  console.log('First 80 chars:', token.substring(0, 80));
} else {
  console.error('\n✗ Failed to get token');
}
