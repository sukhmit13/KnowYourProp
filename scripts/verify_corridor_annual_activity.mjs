import assert from "node:assert/strict";
import { chromium } from "playwright";

// Synthetic data exists only in this intercepted test page; no auth bypass or app route.
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const [shell, accordion, main] = await Promise.all([
  fetch(origin).then(r => r.text()),
  fetch(`${origin}/src/components/report/AccordionSection.tsx`).then(r => r.text()),
  fetch(`${origin}/src/main.tsx`).then(r => r.text()),
]);
const react = accordion.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const dom = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(react && dom, "the managed Vite workflow must be running");
const html = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/corridor-check-entry.js"></script></body>');
const entry = `
import React from ${JSON.stringify(react)};
import ReactDOM from ${JSON.stringify(dom)};
import {AccordionSection} from "/src/components/report/AccordionSection.tsx";
import CorridorIntelligenceView from "/src/components/CorridorIntelligenceView.tsx";
import {NewBusinessLicensesSection} from "/src/components/report/NewBusinessLicensesSection.tsx";
import {buildScanSections} from "/src/components/report/scanBuilder.tsx";
import {compareCorridorLicenses} from "/@fs${process.cwd()}/shared/corridorLicenseComparison.ts";
import "/src/index.css";
import "/src/kyp-base.css";
const e=React.createElement;
window.React=React;
const record=(businessName,startDate)=>({businessName,address:"100 W Test Ave",startDate,licenseType:"Food",licenseCategory:"food",latitude:41.9,longitude:-87.6,distanceMiles:.1});
const comparison=compareCorridorLicenses([record("Original Cafe","2024-01-01"),record("Former Cafe","2025-01-01"),record("Current Cafe","2026-01-01")],new Date("2026-10-03T12:00:00Z"));
const kpis={permits:3,permitUnits:null,licenses:5,articles:1,zoningAppeals:2,dpdApplications:null};
const scan=buildScanSections({corridor:{kpis}}).find(s=>s.id==="corridor");
const card={key:"broadway",name:"Broadway",tier:1,tierLabel:"Primary",distanceMi:.01,onCorridor:false,blurb:"Test corridor",
licenses:[{name:"Current Cafe",address:"100 W Test Ave",date:"2026-01-01",tags:["Retail Food"]}],
construction:[],coverage:[{title:"Older article within the full year",source:"Example",url:"https://example.com/older",date:"2026-01-01",summary:"Older reporting retained."}],
zoning:[],dpdApplications:[],counts:{licenses:5,permits:3,articles:1,zoningAppeals:2,dpdApplications:null},licenseComparison:comparison};
const sources={permits:"available",licenses:"available",articles:"partial",zoningAppeals:"partial",dpdApplications:"unavailable"};
const current=[record("Current Cafe","2026-01-01"),...Array.from({length:8},(_,i)=>({...record("New License Name "+i,"2026-02-01"),address:(200+i*100)+" W Test Ave",licenseType:i%2?"Tavern":"Retail Food",licenseCategory:i%2?"liquor":"food",distanceMiles:.2+i*.02})),
{...record("Recurring Cafe","2026-01-01"),address:"2000 W Test Ave",distanceMiles:.9}];
const nearbyHistory=[record("Original Cafe","2024-01-01"),record("Former Cafe","2025-01-01"),
{...record("Recurring Cafe","2025-01-01"),address:"2000 W Test Ave"},...current];
const nearbyComparison=compareCorridorLicenses(nearbyHistory,new Date("2026-10-03T12:00:00Z"));
const nearbyData={licenses:current,totalCount:10,licenseCount:10,priorPeriodCount:2,changePct:400,radiusMiles:1,periodMonths:12,issuanceComparison:nearbyComparison};
const nearbyScan=buildScanSections({businessLicenses:nearbyData}).find(s=>s.id==="newBusinessLicenses");
const emptyData={...nearbyData,licenses:[],totalCount:0,licenseCount:0,issuanceComparison:compareCorridorLicenses(nearbyHistory.filter(r=>r.startDate<"2025-10-04"),new Date("2026-10-03T12:00:00Z"))};
function Fixture(){const [open,setOpen]=React.useState(true);return e("div",{style:{padding:24},className:"test-report"},
e("style",null,"@media(min-width:721px){.test-report{margin-left:210px}}"),
e(AccordionSection,{id:"corridor",index:21,order:21,eyebrow:scan.title,takeaway:scan.summary,verdict:"context",badge:scan.verdict.label,badgeTone:"c",open,onToggle:()=>setOpen(!open),onToggleOff:()=>{}},
e(CorridorIntelligenceView,{kpis,corridors:[card],sourceCoverage:sources})),
e("div",{id:"unknown"},e(CorridorIntelligenceView,{kpis,corridors:[{...card,key:"unknown",name:"Unknown history corridor",licenseComparison:null}],sourceCoverage:sources})),
e(AccordionSection,{id:"newBusinessLicenses",index:12,order:12,eyebrow:nearbyScan.title,takeaway:nearbyScan.takeaway,verdict:"context",badge:nearbyScan.verdict.label,open:true,onToggle:()=>{}},
e(NewBusinessLicensesSection,{data:nearbyData,isLoading:false,isError:false})),
e("div",{id:"nearby-empty"},e(NewBusinessLicensesSection,{data:emptyData,isLoading:false,isError:false})))}
ReactDOM.createRoot(document.getElementById("root")).render(e(Fixture));
`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
await page.route("**/corridor-check-entry.js", r => r.fulfill({ contentType: "application/javascript", body: entry }));
await page.route("**/corridor-check", r => r.fulfill({ contentType: "text/html", body: html }));
try {
  for (const width of [1280, 1024, 974, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}/corridor-check`);
    await page.locator('[data-testid="corridor-kpis"]').first().waitFor();
    const section = page.locator("#section-corridor");
    assert.equal(await section.locator(".badge").textContent(), "3 permits · 5 new licenses");
    if (width > 720) {
      const geometry = await section.locator(".kyp-acchd .mid").evaluate(el => {
        const s = getComputedStyle(el);
        return { height: el.clientHeight - parseFloat(s.paddingTop), line: parseFloat(s.lineHeight) };
      });
      assert.ok(geometry.height <= geometry.line + 1, `${width}px corridor header should stay one line`);
    }
    const comparison = section.locator('[data-testid="corridor-license-comparison-broadway"]');
    const ledger = comparison.locator(".kyp-ledger.cmp");
    assert.equal(await section.locator("table").count(), 0);
    assert.equal(await ledger.count(), 1);
    assert.equal(await ledger.locator(".kyp-lrow:not(.lhead)").count(), 6);
    assert.match(await ledger.innerText(), /Previously unseen addresses/);
    assert.match(await ledger.innerText(), /License issuances/);
    assert.doesNotMatch(await comparison.innerText(), /–<|\d{4}-\d{2}-\d{2}/);
    assert.match(await comparison.locator(".kyp-charttitle").innerText(), /Latest 12mo: Oct 2025–Oct 2026/i);
    assert.equal(await comparison.locator(".kyp-src").count(), 1);
    assert.match(await comparison.locator(".kyp-src").innerText(), /not net growth/);
    const columns = await ledger.locator(".kyp-lrow").evaluateAll(rows => rows.map(row => {
      const cells = [...row.children].map(cell => cell.getBoundingClientRect());
      return { grid: getComputedStyle(row).gridTemplateColumns, latestX: cells[1].x, priorX: cells[2].x, latestY: cells[1].y, priorY: cells[2].y };
    }));
    for (const row of columns) {
      assert.match(row.grid, /104px 104px$/, "period columns retain fixed widths");
      assert.equal(row.latestX, columns[0].latestX, "latest values align with their header");
      assert.equal(row.priorX, columns[0].priorX, "prior values align with their header");
      assert.equal(row.latestY, row.priorY, "period values must not stack on phones");
    }
    if (width === 390) {
      const labelWidth = await ledger.locator(".kyp-lrow:not(.lhead) .l").first().evaluate(el => el.clientWidth);
      assert.ok(labelWidth >= 60, "phone labels must retain room for readable words");
    }
    assert.match(await section.innerText(), /Former Cafe/);
    if (width === 1280 || width === 390) await comparison.screenshot({path:`/tmp/corridor-ledger-${width}.png`});
    assert.match(await section.innerText(), /past 12 months|last 12 mo|last 12 months/i);
    assert.doesNotMatch(await section.innerText(), /90 days/);
    assert.match(await page.locator("#unknown").innerText(), /Historical license comparison unavailable/i);
    const nearby = page.locator("#section-newBusinessLicenses");
    if (width === 390) {
      const titleWidth = await nearby.locator(".kyp-acchd .mid").evaluate(el => el.clientWidth);
      assert.ok(titleWidth >= 200, "phone header must retain readable title space rather than squeeze beside the badge");
    }
    assert.equal(await nearby.locator(".kyp-biz-heroes .bv").first().textContent(), "8");
    assert.match(await nearby.innerText(), /Different name at known address/);
    assert.match(await nearby.innerText(), /Former Cafe/);
    assert.doesNotMatch(await nearby.innerText(), /400%|business count change/);
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 6);
    await nearby.locator("button.kyp-morelink").click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 10);
    assert.match(await nearby.innerText(), /Additional license for previously observed business/);
    await nearby.locator("button.kyp-hbar").filter({hasText:"Liquor"}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 4, "license-mix filtering still works");
    await nearby.getByRole("button", {name:/^Different names at known addresses/}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 0, "history and license-mix filters intersect");
    assert.match(await nearby.innerText(), /No.*match.*filter/i);
    await nearby.getByRole("button", {name:/^Clear filters/}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 6);
    await nearby.getByRole("button", {name:/^Different names at known addresses/}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 1);
    assert.match(await nearby.innerText(), /Former Cafe/);
    await nearby.getByRole("button", {name:/^Recurring businesses/}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 1);
    assert.match(await nearby.innerText(), /Additional license for previously observed business/);
    await nearby.getByRole("button", {name:/^Previously unseen addresses/}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 6);
    await nearby.locator("button.kyp-morelink").filter({hasText:/Show all/}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 8);
    await nearby.getByRole("button", {name:/^All businesses/}).click();
    assert.equal(await nearby.locator(".kyp-biz-card").count(), 6, "changing history filter resets show-all");
    await nearby.scrollIntoViewIfNeeded();
    if (width === 1280 || width === 390) await nearby.screenshot({path:`/tmp/nearby-history-display-${width}.png`});
    assert.match(await page.locator("#nearby-empty").innerText(), /current observations: 0/);
    assert.equal(await page.locator("#nearby-empty table").count(), 1, "prior history stays visible when current observations are zero");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    assert.equal(overflow, false, `${width}px should not create horizontal page overflow`);
    if (width === 1280) await page.screenshot({ path: "/tmp/corridor-annual-comparison.png", fullPage: true });
    await section.locator(".kyp-acchd").click();
    assert.equal(await section.locator(".kyp-acchd").getAttribute("aria-expanded"), "false");
    console.log(`Corridor header, annual coverage and license comparison verified at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}