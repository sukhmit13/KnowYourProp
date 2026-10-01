import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import ts from "typescript";

// Render the actual live components with isolated evidence, without bypassing auth.
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const source = readFileSync("client/src/pages/RunDetail.tsx", "utf8");
const ast = ts.createSourceFile("RunDetail.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["SOURCE_LOGOS", "PLATE_TONES", "domainOf", "SOURCE_DOMAINS",
  "publisherDomain", "safeUrl", "newsFmtD", "LogoTile", "NewsArchCard"]);
const newsStatements = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  ? names.has(node.name?.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(ast))));
const newsJs = ts.transpileModule(newsStatements.map(n => n.getText(ast)).join("\n"), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
let revealStatement;
function findReveal(node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === "revealAnchor")) {
    revealStatement = node.getText(ast);
  }
  ts.forEachChild(node, findReveal);
}
findReveal(ast);
assert.ok(revealStatement, "Real report reveal handler found");
const revealJs = ts.transpileModule(revealStatement, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const [shell, component, main] = await Promise.all([
  fetch(base, {signal:AbortSignal.timeout(20_000)}).then(r => r.text()),
  fetch(`${base}/src/components/CorridorIntelligenceView.tsx`, {signal:AbortSignal.timeout(20_000)}).then(r => r.text()),
  fetch(`${base}/src/main.tsx`, {signal:AbortSignal.timeout(20_000)}).then(r => r.text()),
]);
const reactPath = component.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const domPath = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(reactPath && domPath, "Live transformed Vite dependencies found");
const entry = `
import React from ${JSON.stringify(reactPath)};
import ReactDOM from ${JSON.stringify(domPath)};
import CorridorIntelligenceView from "/src/components/CorridorIntelligenceView.tsx";
import {AccordionSection} from "/src/components/report/AccordionSection.tsx";
import {DevelopmentSection} from "/src/components/report/DevelopmentSection.tsx";
import {NewBusinessLicensesSection} from "/src/components/report/NewBusinessLicensesSection.tsx";
import {formatNewsDate} from "/src/lib/newsDate.ts";
import "/src/index.css";
import "/src/kyp-base.css";
const {useState,useEffect,useCallback}=React;
${newsJs}
const coverage=[
 {title:"Nine-story apartment building proposed for Broadway in Edgewater",url:"https://blockclubchicago.org/test",source:"Block Club Chicago",date:"2026-03-04",summary:"The development would replace a single-story retail strip.",corridor:{key:"broadway",name:"Broadway",tier:1}},
 {title:"Broadway adds three restaurants in six months",url:"https://chicago.eater.com/test",source:"Eater Chicago",date:"2026-01-22",summary:"Three new licenses issued on the corridor."}
];
const construction=[
 {address:"5520 N Broadway",date:"Mar 2026",use:"Multifamily",units:48,stories:6,parking:12,cost:9200000,distanceMi:.08,architect:"Hartshorne Plunkard Architecture",gc:"Norcon Inc",cityClass:null},
 {address:"5240 N Broadway",date:"Nov 2025",use:"Commercial",units:null,stories:2,parking:null,cost:640000,distanceMi:.21,architect:null,gc:"Reliable Builders LLC",cityClass:null},
];
const corridors=[
 {key:"broadway",name:"Broadway",tier:1,tierLabel:"Primary",distanceMi:0,onCorridor:true,blurb:"North-south retail spine through Edgewater and Uptown",
 licenses:[{name:"Rice Street Coffee Co",address:"5618 N Broadway",date:"Aug 2026",tags:["Retail Food Establishment","Limited Business"]},{name:"Broadway Bagel Bar",address:"5240 N Broadway",date:"Mar 2026",tags:["Retail Food Establishment","Outdoor Patio"]}],
 construction,coverage,zoning:[{address:"5526 N Broadway",kind:"Special Use",zone:"B3-5",status:"Approved",date:"May 2026",caseNo:"22-26",distanceMi:.1,use:"Special use"}],
 dpdApplications:[{address:"5801 N Broadway",applicationType:"Planned Development",status:"Under review",hearingDate:"2026-03-01",applicant:"Partners",proposal:"143 units",applicationUrl:null,hearingUrl:"https://www.chicago.gov/",distanceMi:.34}],
 counts:{licenses:2,permits:2,zoningAppeals:1,dpdApplications:1,articles:2}},
 {key:"clark_street",name:"Clark Street",tier:1,tierLabel:"Primary",distanceMi:.38,onCorridor:false,blurb:"Major north-south corridor through Andersonville",
 licenses:[],construction:[],coverage:[],zoning:[],dpdApplications:[],counts:{licenses:0,permits:0,zoningAppeals:0,dpdApplications:0,articles:0}}
];
const kpis={permits:2,permitUnits:"~48 units",licenses:2,articles:2,zoningAppeals:1,dpdApplications:1};
const licenses={licenses:[
 {businessName:"Rice Street Coffee Co",address:"5618 N Broadway",licenseType:"Retail Food Establishment",licenseCategory:"food",startDate:"2026-08-01",distanceMiles:.1,latitude:41.98,longitude:-87.659,corridor:{key:"broadway",name:"Broadway",tier:1}},
 {businessName:"Side Street Shop",address:"1108 W Catalpa Ave",licenseType:"Limited Business",licenseCategory:"other",startDate:"2026-06-01",distanceMiles:.2,latitude:41.98,longitude:-87.661,corridor:null}],
 totalCount:2,licenseCount:2,priorPeriodCount:1,changePct:100,radiusMiles:1,periodMonths:12};
function Fixture(){
 const [accOpen,setAccOpen]=useState({corridor:true});
 const [accHidden,setAccHidden]=useState({newBusinessLicenses:true,development:true});
 const [index,setIndex]=useState(22);
 window.corridorFixtureSetIndex=setIndex;
 ${revealJs}
 useEffect(()=>{const h=e=>revealAnchor(e.detail);window.addEventListener("kyp-reveal-anchor",h);return()=>window.removeEventListener("kyp-reveal-anchor",h)},[revealAnchor]);
 const row=(id,label,content,number)=>React.createElement(AccordionSection,{id,index:number,eyebrow:label,takeaway:label,open:!!accOpen[id],hidden:!!accHidden[id],onToggle:()=>setAccOpen(s=>({...s,[id]:!s[id]})),verdict:"context"},content);
 return React.createElement("div",{className:"kyp-report",style:{maxWidth:1100,margin:"20px auto",padding:"0 12px"}},
 React.createElement("div",{className:"kyp-acc"},
 row("corridor","Corridor Intelligence",React.createElement("div",{id:"print-section-corridor-news"},React.createElement(CorridorIntelligenceView,{kpis,corridors,renderNewsArticle:(a,testid)=>React.createElement(NewsArchCard,{a,testid})})),index),
 row("newBusinessLicenses","New Business Licenses",React.createElement("div",{id:"section-new-business-licenses"},React.createElement(NewBusinessLicensesSection,{data:licenses,isLoading:false,isError:false})),20),
 row("development","Nearby Development & Construction",React.createElement(DevelopmentSection,{permitLoading:false,permitError:false,dpdData:{developments:[],dpdApplications:[]},dpdLoading:false,zbaData:{approvals:[],upcoming:[]},zbaLoading:false,radiusMi:.5,onRadiusChange:()=>{},renderLogo:()=>null}),24)));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Fixture));
`;
const fixture = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/corridor-qa-entry.js"></script></body>');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
await page.route("**/corridor-qa-entry.js", route => route.fulfill({contentType:"application/javascript",body:entry}));
await page.route("**/corridor-qa", route => route.fulfill({contentType:"text/html",body:fixture}));
try {
  for (const width of [1200, 390]) {
    console.log(`Checking corridor at ${width}px`);
    await page.setViewportSize({width,height:1000});
    await page.goto(`${base}/corridor-qa`);
    const root = page.locator('[data-testid="corridor-intelligence"]');
    await root.locator(".subwrap").first().waitFor();
    assert.equal(await root.locator(".kyp-block").count(), 5);
    assert.equal(await root.locator(".kyp-subhead .n").count(), 0, "Corridors are unnumbered");
    assert.equal(await root.locator(".kyp-corrrow[data-testid]").count(), 6);
    assert.equal(await root.locator(".kyp-liccat").count(), 4, "Every category retained");
    assert.equal(await root.locator(".kyp-archrow").count(), 2);
    assert.equal(await root.locator(".kyp-archlogo, .kyp-archthumb").count(), 2);
    assert.equal(await root.locator(".kyp-archsum").count(), 2, "News summaries retained");
    assert.equal(await root.locator(".kyp-pro").count(), 3);
    assert.equal(await root.locator("a a").count(), 0, "No nested anchors");
    const architect = root.getByRole("link", {name:"Hartshorne Plunkard Architecture",exact:true});
    const destination = new URL(await architect.getAttribute("href"), base);
    assert.equal(destination.searchParams.get("view"), "architect-rankings");
    assert.equal(destination.searchParams.get("search"), "Hartshorne Plunkard Architecture");
    await root.getByRole("link", {name:"Rice Street Coffee Co",exact:true}).click();
    await page.waitForFunction(()=>document.getElementById("section-new-business-licenses")?.offsetParent !== null);
    const tagged = page.locator('[data-testid="row-license-0"] .kyp-corridor');
    await tagged.waitFor();
    assert.equal(await tagged.textContent(), "Broadway");
    assert.equal(await page.locator('[data-testid="row-license-1"] .kyp-corridor').count(), 0);
    await root.getByRole("link", {name:"5520 N Broadway",exact:true}).click();
    await page.waitForFunction(()=>document.getElementById("development-permits")?.offsetParent !== null);
    assert.equal(await page.locator("#section-development").evaluate(el=>el.classList.contains("hidden")),false);
    await page.evaluate(()=>window.corridorFixtureSetIndex(31));
    assert.equal(await root.locator(".kyp-subhead .n").count(), 0);
    const geometry = await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth,
      columns:getComputedStyle(document.querySelector(".subwrap .kyp-twocol")).gridTemplateColumns.split(" ").length,
      rollupColumns:getComputedStyle(document.querySelector(".kyp-blocks.five")).gridTemplateColumns.split(" ").length,
      rowFont:getComputedStyle(document.querySelector(".kyp-corrrow .m")).fontSize,
    }));
    assert.equal(geometry.overflow,false);
    assert.equal(geometry.columns,width===390?1:2);
    assert.equal(geometry.rowFont,"12.5px");
    await page.screenshot({path:`/tmp/corridor-section-${width}.png`,fullPage:true});
    console.log(`Corridor live-component checks passed at ${width}px`,geometry);
  }
  assert.deepEqual(errors,[]);
} finally {
  await browser.close();
}