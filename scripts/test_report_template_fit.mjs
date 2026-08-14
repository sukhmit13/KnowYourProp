// Worst-case fit test for the fixed insight-report template.
// Renders 8 findings + 3 steps + all fields at their validation LIMITS
// and asserts the .page content still fits the 1056px Letter page.
// Run: node scripts/test_report_template_fit.mjs
import { chromium } from 'playwright';
import { register } from 'node:module';

// Load the TS module via tsx
const { renderInsightReport, validateInsightReportContent } = await import('tsx/esm/api').then(async (api) => {
  const unregister = api.register();
  const mod = await import('../server/insightReportTemplate.ts');
  unregister();
  return mod;
});

const fill = (n, seed = 'Confirm the exact recorded position with counsel before relying on it. ') => {
  let s = '';
  while (s.length < n) s += seed;
  return s.slice(0, n).trimEnd() + '.';
};

const content = validateInsightReportContent({
  property_line: fill(159),
  our_take: { headline: fill(99), body: fill(419) },
  metadata: {
    last_sold: { value: '$4,780,000', date: '12/31/2025' },
    zoning: { value: 'B3-1' },
    property_taxes: { value: '$125,084', year: '2024' },
    title_status: { value: 'Flagged', flagged: true },
    landmark: { value: 'Not Designated' },
  },
  findings: Array.from({ length: 8 }, (_, i) => ({
    status: ['red', 'yellow', 'green'][i % 3],
    title: fill(109),
    body: fill(269),
  })),
  steps: Array.from({ length: 3 }, () => ({ title: fill(59), body: fill(209) })),
  sources: fill(419),
});

const html = renderInsightReport('2418 N MILWAUKEE AVE, CHICAGO, IL, 60647', 'August 3, 2026', content);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.setContent(html, { waitUntil: 'networkidle' });
const h = await page.evaluate(() => document.querySelector('.page').scrollHeight);
await page.screenshot({ path: 'screenshots/report_worstcase_fit.jpg', fullPage: true, type: 'jpeg', quality: 75 });
await browser.close();

console.log(`worst-case .page scrollHeight: ${h}px (budget 1056px)`);
if (h > 1056) {
  console.error(`FAIL — overflows by ${h - 1056}px; tighten LIMITS in server/insightReportTemplate.ts`);
  process.exit(1);
}
console.log('PASS — worst-case content fits one Letter page');
