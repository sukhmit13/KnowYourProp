import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1600 } });
await p.goto('http://127.0.0.1:5000/run/474', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
await p.waitForTimeout(4000);
const sec = p.locator('#valuation-calculator-section');
await sec.scrollIntoViewIfNeeded();
await p.waitForTimeout(800);
// header + step1
console.log('header visible:', await p.getByTestId('noi-calc-header').isVisible().catch(()=>false));
console.log('step1 noi:', await p.getByTestId('text-step1-noi').textContent().catch(()=>'(none)'));
console.log('defaults note:', (await p.getByTestId('text-noi-defaults-note').textContent().catch(()=>''))?.trim());
await sec.screenshot({ path: '/tmp/noi_top.png' });
// simple card
const simpleVisible = await p.getByTestId('noi-simple-card').isVisible().catch(()=>false);
const advVisible = await p.getByTestId('noi-advanced-card').isVisible().catch(()=>false);
console.log('simple card:', simpleVisible, 'advanced card:', advVisible);
const simpleNoi = simpleVisible ? await p.getByTestId('text-noi-simple').textContent() : null;
// flip tier
await p.getByTestId(simpleVisible ? 'tier-advanced' : 'tier-simple').click();
await p.waitForTimeout(500);
const advNoi = await p.getByTestId('text-noi-advanced').textContent().catch(()=>null);
const simpleNoi2 = await p.getByTestId('text-noi-simple').textContent().catch(()=>null);
console.log('simple NOI:', simpleNoi ?? simpleNoi2, '| advanced NOI:', advNoi);
// statement screenshot
const stmt = p.locator('#noi-statement-section');
if (await stmt.count()) { await stmt.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await stmt.screenshot({ path: '/tmp/noi_stmt.png' }); }
// conventions panel
console.log('conventions panel:', await p.getByTestId('panel-dscr-conventions').isVisible().catch(()=>false));
console.log('dscr econ:', await p.getByTestId('text-dscr-economic').textContent().catch(()=>'(n/a)'));
console.log('dscr loan:', await p.getByTestId('text-dscr-loan-ratio').textContent().catch(()=>'(n/a — check applies)'));
console.log('glance secondary:', await p.getByTestId('text-dscr-loan-secondary').textContent().catch(()=>'(none)'));
const conv = p.getByTestId('panel-dscr-conventions');
if (await conv.count()) await conv.screenshot({ path: '/tmp/noi_conv.png' });
// purchase price present? if empty, coverage/conventions hidden — fill one
const pp = await p.getByTestId('input-purchase-price').inputValue().catch(()=>null);
console.log('purchase price:', JSON.stringify(pp));
if (pp === '') {
  await p.getByTestId('input-purchase-price').fill('820,000');
  await p.waitForTimeout(600);
  console.log('after price — conventions:', await p.getByTestId('panel-dscr-conventions').isVisible().catch(()=>false));
  console.log('after price — dscr loan:', await p.getByTestId('text-dscr-loan-ratio').textContent().catch(()=>'(n/a)'));
  console.log('after price — glance secondary:', await p.getByTestId('text-dscr-loan-secondary').textContent().catch(()=>'(none)'));
  const conv2 = p.getByTestId('panel-dscr-conventions');
  if (await conv2.count()) { await conv2.scrollIntoViewIfNeeded(); await conv2.screenshot({ path: '/tmp/noi_conv.png' }); }
  console.log('cap flag:', await p.getByTestId('flag-high-cap-rate').textContent().catch(()=>'(none)'));
}
await b.close();
