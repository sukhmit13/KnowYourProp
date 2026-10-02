import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import ts from "typescript";

// Real components, synthetic evidence confined to this intercepted browser page.
// No authentication bypass or QA route is added to the application.
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const [shell, accordion, main] = await Promise.all([
  fetch(base).then(r => r.text()),
  fetch(`${base}/src/components/report/AccordionSection.tsx`).then(r => r.text()),
  fetch(`${base}/src/main.tsx`).then(r => r.text()),
]);
const react = accordion.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const dom = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(react && dom);
const html = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/professional-qa-entry.js"></script></body>');
const entry = `
import React from ${JSON.stringify(react)};
import ReactDOM from ${JSON.stringify(dom)};
import {ProfessionalRecordSection} from "/src/components/report/ProfessionalRecordSection.tsx";
import {AccordionSection} from "/src/components/report/AccordionSection.tsx";
import "/src/index.css";
import "/src/kyp-base.css";
const e=(name,role,date,extra={})=>({name,key:name,role,lastSeen:date,lastSeenPrecision:"day",recordCount:1,facts:["1 record here"],...extra});
const keys=["contractors","design","expediters","zoningAttorneys","taxAttorneys","lenders"];
const es=[
 e("Test Contractor Company","Owner as General Contractor","2026-08-10",{facts:["2 records here","owner self-performed"]}),
 e("Test Architecture Studio","Self-Certified Architect","2026-07-09",{firm:"Test Studio",discoveryUrl:"/discovery?view=architect-rankings&search=Test%20Studio"}),
 e("Test Expediter","Permit Expediter","2025-11-21"),
 e("Test Board Representative","Board representative","2024-09-12",{outcome:"DENIED"}),
 e("Test Appeal Attorney","Tax appeal attorney","2023",{lastSeenPrecision:"year",outcome:"2 OF 3 DECREASED"}),
 e("Test Recorded Lender","Recorded mortgagee","2018-06",{lastSeenPrecision:"month",position:"Prior",facts:["$150,000 original recorded principal","release on record"]}),
];
const full={groups:keys.map((key,i)=>({key,label:key,entries:i===3?[es[i],e("Verified Representative","Zoning attorney","2025-10-09",{outcome:"GRANTED",tag:"ARDC verified"})]:[es[i]]})),totalNames:7,groupCount:6,firstYear:2018,lastYear:2026,sourceCoverage:{permits:{status:"available"}}};
function Fixture(){
 const [state,setState]=React.useState({data:full,index:25});
 window.setProfessionalFixture=(value)=>setState(s=>({...s,...value}));
 window.professionalFull=full;
 return React.createElement("div",{className:"kyp-report",style:{maxWidth:1100,margin:"20px auto",padding:"0 12px"}},
  React.createElement("div",{className:"kyp-acc"},
   React.createElement(AccordionSection,{id:"professionals",index:state.index,eyebrow:"Professional Record",open:true,onToggle:()=>{},verdict:"context",takeaway:"Everyone on the public record who has worked on this address, by profession."},
    React.createElement(ProfessionalRecordSection,{data:state.data,loading:state.loading,error:state.error}))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Fixture));
`;
const run = readFileSync("client/src/pages/RunDetail.tsx", "utf8");
assert.match(run, /"news", "professionals"\]/);
assert.match(run, /professionals: \{ title: "Professional Record"/);
assert.match(run, /id: 'professional-record', label: 'Professional Record'/);
assert.ok(run.indexOf("const professionalSources = useMemo") < run.indexOf("if (isRunLoading)"));
assert.match(run, /<AccordionSection \{\.\.\.accProps\("professionals"\)\}>/);
const targetSource = run.slice(run.indexOf("const getPrintTarget ="), run.indexOf("// When printing with the insight report"));
const loopSource = run.slice(run.indexOf("allSectionIds.forEach(sectionId => {"), run.indexOf("const developmentRoot ="));
const printJs = ts.transpileModule(`${targetSource}\nconst selectedMarketChild=false;\n${loopSource}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("**/professional-qa-entry.js", route => route.fulfill({ contentType: "application/javascript", body: entry }));
await page.route("**/professional-qa", route => route.fulfill({ contentType: "text/html", body: html }));
try {
  for (const width of [1200, 860, 640, 520, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/professional-qa`);
    const root = page.locator("#print-section-professional-record");
    await root.locator(".kyp-biz-card.pro").first().waitFor();
    assert.equal(await root.locator("section").count(), 6);
    assert.deepEqual(await root.locator(".n").allTextContents(), ["25.1","25.2","25.3","25.4","25.5","25.6"]);
    assert.equal(await root.locator(".kyp-block").count(), 3);
    assert.equal(await root.locator(".kyp-src p").count(), 1);
    assert.equal(await root.locator(".kyp-biz-card.pro").count(), 7);
    assert.equal(await root.locator(".kyp-biz-card.pro a").count(), 1);
    assert.equal(await root.locator(".kyp-block.grn,.kyp-block.orange,.kyp-block.red,.kyp-pill.good,.kyp-pill.bad,.kyp-pill.watch").count(), 0);
    assert.equal(await root.locator(".kyp-pill.ind").filter({ hasText: "DENIED" }).count(), 1);
    assert.equal(await root.locator(".kyp-pill.ind").filter({ hasText: "GRANTED" }).count(), 1);
    assert.match(await root.innerText(), /2 OF 3 DECREASED/);
    assert.doesNotMatch(await root.innerText(), /success rate|win rate|\d+%/i);
    assert.equal(await root.getByRole("link").getAttribute("href"), "/discovery?view=architect-rankings&search=Test%20Studio");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const facts = await root.locator(".kyp-biz-cardmeta").evaluateAll(nodes => nodes.map(n => n.querySelectorAll(".f").length));
    assert.ok(facts.every(n => n <= 2));
    if (width <= 520) {
      const ownLine = await root.locator(".kyp-biz-card.pro").evaluateAll(cards => cards.every(card =>
        card.querySelector(".kyp-biz-distance").getBoundingClientRect().top >= card.querySelector(".kyp-professional-identity").getBoundingClientRect().bottom - 1));
      assert.equal(ownLine, true, "Phone dates stay below identity/role");
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `/tmp/professional-record-${width}.png`, fullPage: true });
    await page.screenshot({ path: `/tmp/professional-record-top-${width}.png` });
    await page.evaluate(() => window.setProfessionalFixture({ index: 8 }));
    await root.locator(".n", { hasText: "8.6" }).waitFor();
    await page.evaluate(() => {
      const full = window.professionalFull;
      window.setProfessionalFixture({ data: { ...full, groups: [full.groups[0]], totalNames: 1, groupCount: 1, firstYear: 2026, lastYear: 2026 } });
    });
    await page.waitForFunction(() => document.querySelectorAll(".kyp-biz-card.pro").length === 1);
    assert.equal(await root.locator("section").count(), 1);
    assert.equal(await root.locator(".n").innerText(), "08.1");
    assert.equal(await root.locator(".kyp-block").count(), 3);
    assert.equal(await root.locator(".kyp-src p").count(), 1);
    assert.doesNotMatch(await root.innerText(), /Lenders|Permit Expediters|No .* on record/);
    await page.screenshot({ path: `/tmp/professional-record-thin-${width}.png`, fullPage: true });
    for (const selected of [[], ["professional-record"]]) {
      const excluded = await page.evaluate(({ selected, printJs }) => {
        new Function("selectedSections", "allSectionIds", printJs)(selected, ["professional-record"]);
        return document.getElementById("print-section-professional-record").closest(".kyp-accrow").classList.contains("print-exclude");
      }, { selected, printJs });
      assert.equal(excluded, selected.length === 0);
    }
    await root.evaluate(el => el.closest(".kyp-accrow").classList.remove("print-exclude"));
    await page.evaluate(() => window.setProfessionalFixture({ data: undefined, loading: true }));
    await root.getByRole("status").waitFor();
    assert.equal(await root.locator(".kyp-block").count(), 0);
    await page.evaluate(() => window.setProfessionalFixture({ loading: false, error: true }));
    await root.getByRole("alert").waitFor();
    assert.match(await root.innerText(), /could not be loaded/i);
    assert.equal(await root.locator(".kyp-block").count(), 0);
    console.log(`Professional Record checks passed at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }