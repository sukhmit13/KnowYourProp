import assert from "node:assert/strict";
import { chromium } from "playwright";

// Isolated evidence fixtures render the real Vite components without signing in,
// changing application routes, or bypassing the report's access controls.
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
async function liveText(path) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, `Live preview serves ${path}`);
  return response.text();
}
const [shell, component, main] = await Promise.all([
  liveText("/"),
  liveText("/src/components/report/ProjectUseAnalysisSpine.tsx"),
  liveText("/src/main.tsx"),
]);
const reactPath = component.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const domPath = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(reactPath && domPath, "Live Vite dependency imports found");

const entry = `
import React from ${JSON.stringify(reactPath)};
import ReactDOM from ${JSON.stringify(domPath)};
import {AccordionSection,KypSubhead} from "/src/components/report/AccordionSection.tsx";
import {DaycareAnalysis} from "/src/components/report/DaycareAnalysis.tsx";
import {ProjectUseBusinessList,ProjectUseCountBlocks,ProjectUseGoogleMaps} from "/src/components/report/ProjectUseAnalysisSpine.tsx";
import "/src/index.css";
import "/src/kyp-base.css";
const {useState}=React;
const zip={
  status:"underserved",childrenUnder5:1396,licensedSlots:712,centerSlots:596,familyHomeSlots:116,childrenPerSlot:1396/712,
  sources:{childrenSource:"ACS",childrenYear:2023,childcareSource:"INCCRRA",childcareYear:2024}
};
const community={...zip,childrenUnder5:1696,licensedSlots:1112,centerSlots:996,familyHomeSlots:116,childrenPerSlot:1696/1112};
const enhanced={
  childrenUnder5:1396,children0to2:612,children3to4:784,pct0to2:43.8,pct3to4:56.2,
  parentsInLaborForce0to5:992,parentsInLaborForcePct0to5:71,parentsInLaborForce6to17:1520,parentsInLaborForcePct6to17:78,laborForceDelta:7,
  ranks:{childrenUnder5:{rank:14,total:55,sourceValue:1396},pct0to2:{rank:31,total:55},laborForceDelta:{rank:22,total:55},parentsInLaborForcePct0to5:{rank:18,total:55}},comparisonTotal:55
};
const enhancedCommunity={...enhanced,childrenUnder5:1696,children0to2:700,children3to4:996,pct0to2:41.3,pct3to4:58.7,
  ranks:Object.fromEntries(Object.entries(enhanced.ranks).map(([key,rank])=>[key,{...rank,total:77,...(key==="childrenUnder5"?{sourceValue:1696}:{})}])),comparisonTotal:77
};
const rows=Array.from({length:14},(_,i)=>({name:"Licensed business "+i,address:(100+i)+" W Chicago Ave",distanceMiles:i===13?null:(i+1)/10}));
const places=Array.from({length:12},(_,i)=>({name:"Maps business "+i,address:(100+i)+" W Chicago Ave",distanceMiles:i===11?null:(i+1)/20,rating:4.5,reviewsCount:i===0?0:20+i,url:i===0?"https://www.google.com/maps/place/?q=place_id:fixture":null}));
const google={places,count:12,avgRating:4.5,searchTerm:"day care",status:"complete"};
window.puaSaves=[];
function Fixture(){
  const [scope,setScope]=useState("zip"),[type,setType]=useState("daycare"),[index,setIndex]=useState(17);
  const [scenario,setScenario]=useState("normal"),[site,setSite]=useState({buildingSqFt:4980,landSqFt:7250,stories:2});
  window.puaSetType=setType;window.puaSetIndex=setIndex;window.puaSetScenario=setScenario;
  const selected=scope==="zip"?zip:community;
  const access=scenario==="no-slots"?{...selected,status:"desert",licensedSlots:0,centerSlots:0,familyHomeSlots:0,childrenPerSlot:null}:selected;
  const ccap=scenario==="no-comparison"?{pct_slots_ccap:62}:scenario==="zero-comparison"?{pct_slots_ccap:0,citywide_pct_ccap:0}:{pct_slots_ccap:62,citywide_pct_ccap:55};
  const bar=React.createElement(React.Fragment,null,
    React.createElement(KypSubhead,{subsection:1},React.createElement("span",{className:"lbl"},"Licensed Competitors")),
    React.createElement(ProjectUseCountBlocks,{counts:[{value:5,label:"Within 1 mile"},{value:9,label:"Within 2 miles"},{value:14,label:"Within 3 miles"}]}),
    React.createElement(ProjectUseBusinessList,{listKey:"bar",rows:rows.map(r=>({name:r.name,address:r.address,distance:r.distanceMiles}))}),
    React.createElement("div",{className:"kyp-src"},"Source: Chicago business-license records; names link to Maps searches."),
    React.createElement(KypSubhead,{subsection:2},React.createElement("span",{className:"lbl"},"Google Maps Competitors")),
    React.createElement(ProjectUseGoogleMaps,{data:{...google,searchTerm:"bar"},confirmed:true}));
  const daycare=React.createElement(DaycareAnalysis,{
    scope,onScopeChange:setScope,areaData:access,enhancedData:scope==="zip"?enhanced:enhancedCommunity,capacityData:ccap,
    zipCode:"60612",communityArea:"West Town",ward:27,nearbyData:{locations:rows,totalFound:14,within1Mile:5,within2Miles:9,within3Miles:14},
    googleData:google,googleConfirmed:true,googleSearchTerm:"day care",...site,buildingSource:"Assessor record",landSource:"Assessor record",runId:314,
    updateProperty:async payload=>{window.puaSaves.push(payload);setSite({
      buildingSqFt:payload.data.manualBuildingSqFt,landSqFt:payload.data.manualLandSqFt,stories:payload.data.manualStories
    });}
  });
  return React.createElement("div",{className:"kyp-report",style:{maxWidth:1100,margin:"20px auto"}},
    React.createElement("div",{className:"kyp-acc"},
      React.createElement(AccordionSection,{id:"analysis",index,order:17,eyebrow:"Project Use Analysis",takeaway:type==="daycare"?"Day Care Center":"Bar / Tavern",verdict:"context",open:true,onToggle:()=>{},badge:"Source records"},
        type==="daycare"?daycare:bar)));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Fixture));
`;
const fixture = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/pua-qa-entry.js"></script></body>');
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.route("**/pua-qa-entry.js", route => route.fulfill({contentType:"application/javascript",body:entry}));
await page.route("**/pua-qa", route => route.fulfill({contentType:"text/html",body:fixture}));
try {
  for (const width of [1200,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(`${base}/pua-qa`);
    const root=page.locator("#section-analysis");
    await root.locator(".kyp-subhead").first().waitFor();
    assert.deepEqual(await root.locator(".kyp-subhead .n").allTextContents(), Array.from({length:7},(_,i)=>`17.${i+1}`));
    assert.equal(await root.locator(".kyp-seg").count(),1);
    assert.equal(await root.locator(".kyp-accbody .kyp-accbody").count(),0,"No duplicated report body inset");
    assert.equal(await root.locator(".kyp-input").count(),3,"Correction form is always present");
    assert.equal(await root.locator("a a").count(),0);
    assert.equal(await root.locator(".chip.rank").count(),4,"All four context ranks are present");
    assert.equal(await root.locator(".kyp-block.slate .chip.rank").count(),4,"Ranks never inherit verdict colors");
    const initialCards=await root.locator(".kyp-biz-card").count();
    await root.getByRole("button",{name:/Show all 14/}).click();
    assert.equal(await root.locator(".kyp-biz-card").count(),initialCards+4);
    await root.getByRole("button",{name:/Show all 12/}).click();
    assert.equal(await root.locator(".kyp-biz-card").count(),initialCards+6);
    assert.match(await root.textContent(),/0 reviews/);
    await root.getByRole("button",{name:"West Town",exact:true}).click();
    assert.equal(await root.getByRole("button",{name:"West Town",exact:true}).getAttribute("aria-pressed"),"true");
    assert.match(await root.textContent(),/1,696/);
    assert.match(await root.textContent(),/of 77/);
    await root.getByRole("button",{name:"ZIP 60612",exact:true}).click();
    assert.match(await root.textContent(),/of 55/);
    await page.evaluate(()=>window.puaSetScenario("no-comparison"));
    await page.waitForFunction(()=>!document.querySelector("#print-section-childcare-capacity")?.textContent.includes("Chicago average"));
    const ccap=root.locator("#print-section-childcare-capacity");
    assert.doesNotMatch(await ccap.textContent(),/55%/);
    await page.evaluate(()=>window.puaSetScenario("zero-comparison"));
    await page.waitForFunction(()=>document.querySelector("#print-section-childcare-capacity")?.textContent.includes("0%"));
    assert.match(await ccap.textContent(),/0%/);
    await page.evaluate(()=>window.puaSetScenario("no-slots"));
    await page.waitForFunction(()=>document.querySelector("#section-analysis")?.textContent.includes("Childcare desert"));
    assert.match(await root.textContent(),/Childcare desert/);
    await page.evaluate(()=>window.puaSetScenario("normal"));
    const inputs=root.locator(".kyp-input");
    await inputs.nth(0).fill("6000");
    await inputs.nth(1).fill("9000");
    await inputs.nth(2).fill("3");
    const save=root.getByRole("button",{name:/Update capacity|Save Building Details|Save details|Save changes/i});
    await save.click();
    await page.waitForFunction(()=>window.puaSaves.length>0);
    const payload=await page.evaluate(()=>window.puaSaves.at(-1));
    assert.deepEqual(payload,{id:314,data:{manualBuildingSqFt:6000,manualLandSqFt:9000,manualStories:3}});
    await inputs.nth(0).fill("7000");
    await root.getByRole("button",{name:/Cancel/i}).click();
    assert.equal(await inputs.nth(0).inputValue(),"6000");
    const geometry=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth,
      bands4:getComputedStyle(document.querySelector(".kyp-bands.b4")).gridTemplateColumns.split(" ").length,
      fields:getComputedStyle(document.querySelector(".kyp-fields")).gridTemplateColumns.split(" ").length,
    }));
    assert.equal(geometry.overflow,false);
    assert.equal(geometry.bands4,width===390?2:4);
    assert.equal(geometry.fields,width===390?1:3);
    await page.screenshot({path:`/tmp/pua-daycare-${width}.png`,fullPage:true});
    await page.evaluate(()=>window.puaSetIndex(23));
    await page.waitForFunction(()=>document.querySelector(".kyp-subhead .n")?.textContent==="23.1");
    assert.deepEqual(await root.locator(".kyp-subhead .n").allTextContents(),Array.from({length:7},(_,i)=>`23.${i+1}`));
    await page.evaluate(()=>window.puaSetType("bar"));
    await page.waitForFunction(()=>document.querySelectorAll(".kyp-subhead").length===2);
    assert.deepEqual(await root.locator(".kyp-subhead .n").allTextContents(),["23.1","23.2"]);
    assert.equal(await root.locator(".kyp-seg").count(),0,"No area selector on a radius-only use");
    await page.screenshot({path:`/tmp/pua-bar-${width}.png`,fullPage:true});
    console.log(`PUA live-component and interaction checks passed at ${width}px`,geometry);
  }
  assert.deepEqual(errors,[]);
} finally {
  await browser.close();
}