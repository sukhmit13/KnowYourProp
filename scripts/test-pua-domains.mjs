import assert from "node:assert/strict";
import { chromium } from "playwright";

// Render real report components with isolated source fixtures; no app auth bypass,
// billing calls, production records, or new application routes are used.
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const text = async path => {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, `Preview serves ${path}`);
  return response.text();
};
const [shell, spine, main] = await Promise.all([
  text("/"), text("/src/components/report/ProjectUseAnalysisSpine.tsx"), text("/src/main.tsx"),
]);
const reactPath = spine.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const domPath = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(reactPath && domPath);
const entry = `
import React from ${JSON.stringify(reactPath)};
import ReactDOM from ${JSON.stringify(domPath)};
import {AccordionSection,KypSubhead} from "/src/components/report/AccordionSection.tsx";
import {ProjectUseAreaControl,ProjectUseGoogleMaps} from "/src/components/report/ProjectUseAnalysisSpine.tsx";
import {FoodAccessPanel,GroceryLicenseList,SeniorPopulationPanel,VehicleOwnershipPanel,EVRegistrationTrends,EVChargingTable,HotelShortTermRentalGroup,LicensedBusinessPanel} from "/src/components/report/ProjectUseDomainPanels.tsx";
import "/src/index.css";
import "/src/kyp-base.css";
const h=React.createElement;
const grocery={storeCount:2,stores:[
 {name:"Store A",address:"100 W Chicago Ave",squareFeet:20000,distance:0.4},
 {name:"Store B",address:"200 W Chicago Ave",squareFeet:35000,distance:1.2},
 {name:"Store C",address:"300 W Chicago Ave",squareFeet:null,distance:2.1}
],sources:{dataSource:"Chicago Data Portal — Grocery Store Status",dataYear:"2024"}};
const senior={communityArea:"West Town",communityNumber:24,totalPopulation:42210,population65Plus:4812,pct65Plus:11.4,
 seniorsLivingAlone:1906,pctSeniorsLivingAlone:39.6,age65to74:2410,age75to84:1359,age85Plus:1043,
 seniorDemandLevel:"high",comparedToCityAvg:"Above city average",citywideRank:12,rankDescription:"Top 20 in Chicago (#12 of 77)"};
const vehicle={communityArea:"West Town",communityNumber:24,totalHouseholds:1000,noVehicle:200,oneVehicle:400,twoVehicles:300,
 threePlusVehicles:100,avgVehiclesPerHousehold:1.32,pctNoVehicle:20,pctWithVehicle:80,autoDependencyLevel:"moderate",comparedToCityAvg:"Near city average"};
const ev={zipCode:"60612",lastUpdated:"2026-01-17",sourceUrl:"https://www.ilsos.gov/departments/vehicles/statistics/electric.html",
 cookCountyData:[{year:2025,month:1,count:10000},{year:2025,month:3,count:12000}],
 zipCodeData:[{year:2025,month:1,count:20},{year:2025,month:3,count:35}]};
const stations=[
 {name:"Charging A",address:"100 W Chicago Ave",distanceMiles:0.4,evNetwork:"Network A",evLevel2Count:2,dcFastCount:0,accessDays:"24 hours",dateLastConfirmed:"2026-01-05"},
 {name:"Charging B",address:"100 W Chicago Ave",distanceMiles:0.4,evNetwork:"Network B",evLevel2Count:3,dcFastCount:1,accessDays:"Business hours",dateLastConfirmed:"2025-12-01"},
 {name:"Unknown distance",address:"200 W Chicago Ave",distanceMiles:null,evNetwork:null,evLevel2Count:null,dcFastCount:null,accessDays:null,dateLastConfirmed:null}
];
const licenses={locations:[{id:1,name:"Business A",address:"100 W Chicago Ave",distanceMiles:0.2},
 {id:2,name:"Business B",address:"200 W Chicago Ave",distanceMiles:0.8}]};
const google={places:[],count:0,avgRating:null,searchTerm:"fixture",status:"complete"};
function Fixture(){
 const [type,setType]=React.useState("grocery"),[scope,setScope]=React.useState("zip"),[index,setIndex]=React.useState(17);
 const [scenario,setScenario]=React.useState("normal");
 window.puaDomainType=setType;window.puaDomainIndex=setIndex;window.puaDomainScenario=setScenario;
 const props={loading:false,scope,areaLabel:scope==="zip"?"60612":"West Town"};
 const groceryData=scenario==="no-data"?null:scenario==="zero"?{...grocery,storeCount:0,stores:[]}:
 scope==="zip"?grocery:{...grocery,storeCount:4,stores:[...grocery.stores,{name:"Store D",address:"400 W Chicago Ave",squareFeet:40000,distance:0.6}]};
 const body=[];
 const heading=(number,label)=>h(KypSubhead,{key:"head-"+number,subsection:number},h("span",{className:"lbl"},label));
 if(type==="grocery"||type==="senior")body.push(h(ProjectUseAreaControl,{key:"scope",value:scope,onChange:setScope,zipCode:"60612",communityArea:"West Town",ward:27}));
 if(type==="grocery"){
  body.push(heading(1,"Food Access"),h(FoodAccessPanel,{key:"food",...props,data:groceryData}),
   heading(2,"Licensed Grocery Stores"),h(GroceryLicenseList,{key:"gro-list",...props,data:groceryData,coordinatesAvailable:true}));
 }else if(type==="senior"){
  const s=scope==="zip"?{...senior,zipCode:"60612",citywideRank:5,rankDescription:"Top 20% in Chicago (#5 of 55 ZIP codes)"}:senior;
  body.push(heading(1,"Senior Population"),h(SeniorPopulationPanel,{key:"senior",...props,data:s}));
 }else if(type==="auto"){
  body.push(heading(1,"Vehicle Ownership"),h(VehicleOwnershipPanel,{key:"vehicle",data:vehicle,loading:false,areaLabel:"West Town"}),
   heading(2,"EV Registration Trends"),h(EVRegistrationTrends,{key:"ev",data:ev,loading:false,zipCode:"60612"}));
 }else if(type==="gas"){
  body.push(heading(1,"Licensed Filling Stations"),h(LicensedBusinessPanel,{key:"gas",data:licenses,loading:false,category:"Filling stations",source:"Chicago Business Licenses",radius:3,listKey:"gas"}),
   heading(2,"EV Charging"),h(EVChargingTable,{key:"charging",stations,loading:false}));
 }else if(type==="hotel"){
  body.push(heading(1,"Licensed Hotels"),h(LicensedBusinessPanel,{key:"hotel",data:licenses,loading:false,category:"Hotels",source:"Chicago Business Licenses",radius:3,listKey:"hotel"}),
   h(HotelShortTermRentalGroup,{key:"rentals",counts:{totalFound:2,within1Mile:0,within2Miles:1,within3Miles:2}}));
 }else{
  body.push(heading(1,type==="coffee"?"Coffee shops":"Restaurants"),h(LicensedBusinessPanel,{key:"food-business",data:licenses,loading:false,category:type==="coffee"?"Coffee shops":"Restaurants",source:"Chicago Business Licenses",listKey:type}));
 }
 const last=["grocery","auto","gas"].includes(type)?3:2;
 body.push(heading(last,"Google Maps Competitors"),h(ProjectUseGoogleMaps,{key:"google",data:google,confirmed:true}));
 return h("div",{className:"kyp-report",style:{maxWidth:1100,margin:"20px auto"}},
  h("div",{className:"kyp-acc"},h(AccordionSection,{id:"domains",index,order:17,eyebrow:"Project Use Analysis",takeaway:type,
    verdict:"context",open:true,onToggle:()=>{},badge:"Source records"},...body)));
}
ReactDOM.createRoot(document.getElementById("root")).render(h(Fixture));
`;
const fixture = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/pua-domain-qa-entry.js"></script></body>');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ timezoneId: "America/Chicago" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("**/pua-domain-qa-entry.js", route => route.fulfill({ contentType: "application/javascript", body: entry }));
await page.route("**/pua-domain-qa", route => route.fulfill({ contentType: "text/html", body: fixture }));
try {
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`${base}/pua-domain-qa`);
    const root = page.locator("#section-domains");
    await root.locator(".kyp-subhead").first().waitFor();
    for (const type of ["grocery", "senior", "auto", "gas", "hotel", "restaurant", "coffee"]) {
      await page.evaluate(type => window.puaDomainType(type), type);
      await page.waitForFunction(type => document.querySelector("#section-domains .tk")?.textContent === type, type);
      const expected = ["grocery", "auto", "gas"].includes(type) ? 3 : 2;
      assert.deepEqual(await root.locator(".kyp-subhead .n").allTextContents(), Array.from({ length: expected }, (_, i) => `17.${i + 1}`));
      assert.equal(await root.locator(".kyp-accbody .kyp-accbody").count(), 0);
      assert.equal(await root.locator("a a").count(), 0);
      assert.equal(await root.locator(".kyp-seg").count(), ["grocery", "senior"].includes(type) ? 1 : 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${type} horizontal overflow at ${width}px`);
      if (type === "grocery") {
        assert.match(await root.locator(".kyp-band.on").textContent(), /Limited access/);
        assert.match(await root.textContent(), /0\.4 mi/);
        await root.getByRole("button", { name: "West Town", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".kyp-band.on")?.textContent.includes("Good access"));
        assert.equal(await root.locator(".kyp-biz-card").count(), 4);
        await root.getByRole("button", { name: "ZIP 60612", exact: true }).click();
      }
      if (type === "senior") {
        assert.equal(await root.locator(".kyp-hbar").count(), 3);
        assert.equal(await root.locator(".kyp-blocks.four > .kyp-block").count(), 4);
        assert.equal(await root.locator(".kyp-block.slate .chip.rank").count(), 1);
        assert.match(await root.locator(".chip.rank").textContent(), /55/);
        await root.getByRole("button", { name: "West Town", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".chip.rank")?.textContent.includes("77"));
        assert.match(await root.locator(".chip.rank").textContent(), /living.alone|share/i);
        await root.getByRole("button", { name: "ZIP 60612", exact: true }).click();
      }
      if (type === "auto") {
        await page.waitForFunction(() => document.querySelectorAll("#section-domains .recharts-line-dots circle").length === 4);
        assert.equal(await root.locator(".recharts-line-dots circle").count(), 4, "isolated monthly observations remain visible without drawing across a missing month");
        await root.locator(".kyp-twochart .recharts-surface").first().waitFor();
        assert.equal(await root.locator(".kyp-twochart .recharts-surface").count(), 2);
        assert.equal(await root.locator(".kyp-band.slate").count(), 3);
        const columns = await root.locator(".kyp-twochart").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        assert.equal(columns, width === 390 ? 1 : 2);
        const axes = await root.locator(".kyp-twochart .recharts-yAxis").allTextContents();
        assert.equal(axes.length, 2);
        assert.notEqual(axes[0], axes[1], "County and ZIP have independent Y-axis ranges");
      }
      if (type === "gas") {
        assert.equal(await root.locator(".kyp-dtab th").count(), 7);
        assert.equal(await root.locator(".kyp-dtab tbody tr").count(), 2);
        const row = await root.locator(".kyp-dtab tbody tr").first().textContent();
        assert.match(row, /Network A/); assert.match(row, /Network B/);
        assert.match(row, /1\/5\/2026|Jan 5, 2026|2026-01-05/);
        assert.match(row, /12\/1\/2025|Dec 1, 2025|2025-12-01/);
      }
      if (type === "hotel") assert.equal(await root.locator(".subwrap .kyp-subhead .n").count(), 0);
      if (["grocery", "senior", "auto", "gas"].includes(type)) {
        await page.screenshot({ path: `/tmp/pua29c-${type}-${width}.png`, fullPage: true });
        await page.screenshot({ path: `/tmp/pua29c-${type}-${width}-top.png` });
      }
    }
    await page.evaluate(() => { window.puaDomainType("grocery"); window.puaDomainIndex(23); });
    await page.waitForFunction(() => document.querySelector(".kyp-subhead .n")?.textContent === "23.1");
    assert.deepEqual(await root.locator(".kyp-subhead .n").allTextContents(), ["23.1", "23.2", "23.3"]);
    await page.evaluate(() => window.puaDomainScenario("zero"));
    await page.waitForFunction(() => document.querySelector(".kyp-band.on")?.textContent.includes("Food desert"));
    await page.evaluate(() => window.puaDomainScenario("no-data"));
    await page.waitForFunction(() => document.querySelector("#section-domains")?.textContent.includes("not available"));
    assert.equal(await root.locator(".kyp-band.on").count(), 0);
    console.log(`29c real domain component checks passed at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}