import { chromium } from 'playwright';

const pin = '13-36-429-021-0000';
const pinParts = pin.split('-');

const browser = await chromium.launch({ 
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();

// Track navigation events
page.on('framenavigated', frame => {
  if (frame === page.mainFrame()) {
    console.log('Navigation to:', frame.url());
  }
});

// Track network requests
const requests = [];
page.on('request', req => {
  if (req.resourceType() === 'fetch' || req.resourceType() === 'xhr') {
    requests.push(`${req.method()} ${req.url()}`);
  }
});

try {
  // Try the pre-filled URL approach
  const url = `https://www.cookcountytreasurer.com/setsearchparameters.aspx?mode=PIN&searchpin=${pin}&isBusiness=false`;
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  console.log('Current URL after goto:', page.url());
  
  const bodyAfterGoto = await page.evaluate(() => document.body.innerText);
  console.log('Body length after goto:', bodyAfterGoto.length);
  console.log('Has "Total Amount Billed":', bodyAfterGoto.includes('Total Amount Billed'));
  
  // Check for PIN input fields
  const pinInput1 = await page.locator('#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN1').count();
  console.log('PIN1 input exists:', pinInput1);
  
  // Check button
  const btnCount = await page.locator('input[id*="cmdContinue"]').count();
  console.log('Continue button count:', btnCount);
  
  // If button exists, try clicking it
  if (btnCount > 0) {
    const btn = page.locator('input[id*="cmdContinue"]');
    const btnId = await btn.getAttribute('id');
    const btnValue = await btn.getAttribute('value');
    console.log('Button ID:', btnId, 'Value:', btnValue);
    
    // Try clicking and waiting for URL change
    console.log('Clicking continue...');
    await btn.click();
    await page.waitForTimeout(5000);
    console.log('URL after click + 5s wait:', page.url());
    
    const bodyAfterClick = await page.evaluate(() => document.body.innerText);
    console.log('Body length after click:', bodyAfterClick.length);
    console.log('Has "Total Amount Billed":', bodyAfterClick.includes('Total Amount Billed'));
  }
  
  console.log('\nXHR/Fetch requests made:');
  requests.forEach(r => console.log(' -', r));
} finally {
  await browser.close();
}
