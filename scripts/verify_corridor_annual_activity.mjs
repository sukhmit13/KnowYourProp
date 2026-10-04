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
function Fixture(){const [open,setOpen]=React.useState(true);return e("div",{style:{padding:24},className:"test-report"},
e("style",null,"@media(min-width:721px){.test-report{margin-left:210px}}"),
e(AccordionSection,{id:"corridor",index:21,order:21,eyebrow:scan.title,takeaway:scan.summary,verdict:"context",badge:scan.verdict.label,badgeTone:"c",open,onToggle:()=>setOpen(!open),onToggleOff:()=>{}},
e(CorridorIntelligenceView,{kpis,corridors:[card],sourceCoverage:sources})),
e("div",{id:"unknown"},e(CorridorIntelligenceView,{kpis,corridors:[{...card,key:"unknown",name:"Unknown history corridor",licenseComparison:null}],sourceCoverage:sources})))}
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
    const table = section.locator("table");
    assert.equal(await table.count(), 1);
    assert.match(await table.innerText(), /Previously unseen addresses/);
    assert.match(await section.innerText(), /Former Cafe/);
    assert.match(await section.innerText(), /past 12 months|last 12 mo|last 12 months/i);
    assert.doesNotMatch(await section.innerText(), /90 days/);
    assert.match(await page.locator("#unknown").innerText(), /Historical license comparison unavailable/i);
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