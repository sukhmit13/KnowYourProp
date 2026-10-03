import assert from "node:assert/strict";
import { chromium } from "playwright";

// Only this intercepted browser fixture contains synthetic records. No QA
// endpoint or authentication bypass is added to the running application.
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
  .replace("</body>", '<script type="module" src="/nearby-lists-entry.js"></script></body>');
const entry = `
import React from ${JSON.stringify(react)};
import ReactDOM from ${JSON.stringify(dom)};
import {AccordionSection} from "/src/components/report/AccordionSection.tsx";
import {ProjectUseBusinessList,ProjectUseGoogleMaps} from "/src/components/report/ProjectUseAnalysisSpine.tsx";
import {EVChargingTable} from "/src/components/report/ProjectUseDomainPanels.tsx";
import "/src/index.css";
import "/src/kyp-base.css";
const e=React.createElement;
const names=["Test Filling Station","Test Hotel","Test Bar","Test Dispensary","Test Grocery Store","Test Licensed Shop"];
const nearby=names.map((name,i)=>({name,address:(i+1)+" Sample Avenue, Chicago, IL",distance:i===5?null:.3,meta:["License record"],testId:"nearby-"+i}));
const places=Array.from({length:13},(_,i)=>({name:"Test Competitor "+(i+1),address:(i+1)+" Example Street",distanceMiles:.5,rating:4.6,reviewsCount:i===0?0:17}));
const stations=[
 {id:"a",name:"Test Charging Station",address:"1 Example Street",distanceMiles:.3,evNetwork:"Network A",evLevel2Count:2,dcFastCount:0,accessDays:"24 hours",dateLastConfirmed:"2026-01-01"},
 {id:"a",name:"Test Charging Station",address:"1 Example Street",distanceMiles:.3,evNetwork:"Network B",evLevel2Count:2,dcFastCount:0,accessDays:"Public",dateLastConfirmed:"2026-02-02"},
 {id:"b",name:"Second Station Record",address:"1 Example Street",distanceMiles:.3,evNetwork:"Network C",evLevel2Count:3,dcFastCount:1},
 {id:"u",name:"Very Long Charging Station Name With International Corporate Campus Visitor Parking And Public Electric Vehicle Charging Infrastructure",address:"2 Example Street With A Long Building And Parking Garage Address",distanceMiles:null,evLevel2Count:null,dcFastCount:0},
 ...Array.from({length:10},(_,i)=>({id:"extra-"+i,name:"Extra Charging Station "+(i+1),address:(i+3)+" Example Street",distanceMiles:2,evLevel2Count:1,dcFastCount:0})),
 {id:"outside",name:"Outside Radius Station",address:"99 Other Street",distanceMiles:4},
];
function Fixture(){
 const [state,setState]=React.useState({key:"initial",evMode:"ready"});
 window.setNearbyFixture=value=>setState(s=>({...s,...value}));
 const row=(id,index,title,child)=>e(AccordionSection,{id,index,eyebrow:title,open:true,onToggle:()=>{},verdict:"context",takeaway:"Nearby list presentation check"},child);
 return e("div",{className:"kyp-report",style:{maxWidth:1100,margin:"20px auto",padding:"0 12px"}},
  row("nearby",1,"Nearby places",e("div",{id:"nearby-places"},e(ProjectUseBusinessList,{rows:nearby,listKey:state.key}))),
  row("competitors",2,"Nearby competitors",e("div",{id:"nearby-competitors"},e(ProjectUseGoogleMaps,{confirmed:true,data:{places,count:places.length,searchTerm:state.key}}))),
  row("ev",3,"EV charging stations",e("div",{id:"nearby-ev"},e(EVChargingTable,{stations:state.evMode==="empty"?[]:stations,loading:state.evMode==="loading",error:state.evMode==="error",onRetry:()=>window.evRetried=true}))),
  row("control",4,"Unchanged record styles",e("div",{id:"unchanged-control",className:"kyp-biz-card"},e("b",null,"Other Record Name"),e("span",{className:"kyp-biz-distance"},"2025")))
 );
}
ReactDOM.createRoot(document.getElementById("root")).render(e(Fixture));
`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("**/nearby-lists-entry.js", route => route.fulfill({ contentType: "application/javascript", body: entry }));
await page.route("**/nearby-lists-check", route => route.fulfill({ contentType: "text/html", body: html }));
const rowSelector = ".kyp-project-use-nearby-row";
try {
  for (const width of [1200, 860, 640, 520, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/nearby-lists-check`);
    await page.locator("#nearby-ev").locator(rowSelector).first().waitFor();
    assert.equal(await page.locator("#nearby-places").locator(rowSelector).count(), 6);
    assert.equal(await page.locator("#nearby-competitors").locator(rowSelector).count(), 10);
    assert.equal(await page.locator("#nearby-ev").locator(rowSelector).count(), 12, "All EV sites remain visible");
    assert.equal(await page.locator("#nearby-ev table").count(), 0, "EV stations no longer use the tiny-name table");
    const evText = await page.locator("#nearby-ev").innerText();
    assert.match(evText, /Network A.*Network B.*Network C/);
    assert.match(evText, /Level 2[^0-9]*5/);
    assert.match(evText, /DC fast[^0-9]*1/i);
    assert.match(evText, /24 hours.*Public/);
    assert.doesNotMatch(evText, /Outside Radius Station/);
    assert.match(evText, /distance unknown/);
    for (const selector of ["#nearby-places", "#nearby-competitors", "#nearby-ev"]) {
      const fonts = await page.locator(selector).locator(rowSelector).first().evaluate(row => {
        const size = cls => getComputedStyle(row.querySelector(cls)).fontSize;
        return {
          name: size(".kyp-project-use-nearby-name"),
          address: size(".kyp-project-use-nearby-address"),
          meta: size(".kyp-project-use-nearby-meta"),
          distance: size(".kyp-project-use-nearby-distance"),
          weight: getComputedStyle(row.querySelector(".kyp-project-use-nearby-name")).fontWeight,
          padding: getComputedStyle(row).paddingTop,
        };
      });
      assert.deepEqual(fonts, { name: "13.5px", address: "11.5px", meta: "11.5px", distance: "11px", weight: "600", padding: "9px" });
      const hrefs = await page.locator(selector).locator(`${rowSelector} a`).evaluateAll(links => links.map(link => link.href));
      assert.ok(hrefs.every(href => href.startsWith("https://www.google.com/maps/")));
    }
    assert.equal(await page.locator("#unchanged-control").evaluate(n => getComputedStyle(n).paddingTop), "12px");
    assert.equal(await page.locator("#unchanged-control .kyp-biz-distance").evaluate(n => getComputedStyle(n).fontSize), "10px");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No document overflow");
    assert.equal(await page.locator(rowSelector).evaluateAll(rows => rows.some(row => row.scrollWidth > row.clientWidth + 1)), false, "No long-name row overflow");
    await page.locator("#nearby-competitors").getByRole("button", { name: /Show all 13/ }).click();
    assert.equal(await page.locator("#nearby-competitors").locator(rowSelector).count(), 13);
    await page.locator("#nearby-competitors").getByRole("button", { name: /Show less/ }).click();
    assert.equal(await page.locator("#nearby-competitors").locator(rowSelector).count(), 10);
    await page.locator("#nearby-competitors").getByRole("button", { name: /Show all 13/ }).click();
    await page.evaluate(() => window.setNearbyFixture({ key: "different-use" }));
    await page.waitForFunction(() => document.querySelectorAll("#nearby-competitors .kyp-project-use-nearby-row").length === 10);
    await page.locator("#section-ev").screenshot({ path: `/tmp/nearby-ev-${width}.png` });
    await page.locator("#section-nearby").screenshot({ path: `/tmp/nearby-places-${width}.png` });
    await page.evaluate(() => window.setNearbyFixture({ evMode: "error" }));
    await page.locator("#nearby-ev").getByRole("alert").waitFor();
    await page.locator("#nearby-ev").getByRole("button", { name: "Retry" }).click();
    assert.equal(await page.evaluate(() => window.evRetried), true);
    await page.evaluate(() => window.setNearbyFixture({ evMode: "empty" }));
    await page.waitForFunction(() => document.querySelector("#nearby-ev").textContent.includes("No EV charging station rows"));
    await page.evaluate(() => window.setNearbyFixture({ evMode: "loading" }));
    await page.locator("#nearby-ev").getByRole("status", { name: "Loading EV charging stations" }).waitFor();
    console.log(`PASS nearby places, competitors and EV: ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}