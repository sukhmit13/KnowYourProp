import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import ts from "typescript";

// Exercise live Vite components without bypassing report authentication.
// Sample evidence is confined to this browser fixture, never saved to the app.
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const runDetail = readFileSync("client/src/pages/RunDetail.tsx", "utf8");
const ast = ts.createSourceFile("RunDetail.tsx", runDetail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const logoNames = new Set(["SOURCE_LOGOS", "PLATE_TONES", "domainOf", "SOURCE_DOMAINS", "publisherDomain", "LogoTile"]);
const logoStatements = ast.statements.filter((node) => {
  if (ts.isFunctionDeclaration(node)) return logoNames.has(node.name?.text);
  return ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => logoNames.has(declaration.name.getText(ast)));
});
const logoJs = ts.transpileModule(logoStatements.map((node) => node.getText(ast)).join("\n"), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const [shell, transformedComponent, transformedMain] = await Promise.all([
  fetch(base).then((r) => r.text()),
  fetch(`${base}/src/components/report/DevelopmentSection.tsx`).then((r) => r.text()),
  fetch(`${base}/src/main.tsx`).then((r) => r.text()),
]);
const reactModule = transformedComponent.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const domModule = transformedMain.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(reactModule && domModule, "Vite dependency imports were found");
const entry = `
import React from ${JSON.stringify(reactModule)};
import ReactDOM from ${JSON.stringify(domModule)};
import {DevelopmentSection} from "/src/components/report/DevelopmentSection.tsx";
import {AccordionSection} from "/src/components/report/AccordionSection.tsx";
import "/src/index.css";
import "/src/kyp-base.css";
const {useState}=React;
${logoJs}
const permits=Array.from({length:15},(_,i)=>({
  permitNumber:"permit-"+i,address:(5520+i*2)+" N BROADWAY",
  category:i<10?"multifamily":"singleFamily",issueDate:"2026-07-01",
  distanceMiles:.05+i*.04,units:i<10?4:1,reportedCost:412000,
  corridor:{key:"broadway",name:"Broadway",tier:2},
  ...(i===0?{contractorName:"Alpha & Sons",architectName:"Design Studio"}:
     i===1?{contractorName:"GC Only"}:i===2?{architectName:"Architect Only"}:{})
}));
const permitData={permits,subject:{totalPermits:55,medianReportedCost:412000,permittedUnits:48,byCategory:{multifamily:37,singleFamily:14,commercial:4},annual:{"2026":{total:18},"2025":{total:20},"2024":{total:17}}},trend:{suppressed:false,current12Months:18,prior12Months:8,changePct:125},communityBenchmark:{name:"Edgewater",totalPermits:40}};
function Fixture(){
  const [radius,setRadius]=useState(.5);
   const [index,setIndex]=useState(22);
  window.developmentFixtureSetIndex=setIndex;
  const application={id:"application",address:"5801 N Broadway",applicant:"Broadway Partners",proposal:"A mixed-use development with 187 dwelling units.",applicationType:"Map amendment",status:"Plan Commission application",hearingDate:"2026-10-15",hearingUrl:"https://www.chicago.gov/",units:187,distanceMi:.7,corridor:{name:"Broadway"}};
   const pipeline={unitsUnderConstruction:48,activePermitCount:7,permitUnitsUnknownAddressCount:4,potentialUnits:radius===1?187:120,commercialProposals:3,permitUnitsSource:"description",sourceCoverage:{permits:{status:"available"},dpdApplications:{status:"available"},zbaActivity:{status:"available"},news:{status:"available"}}};
  const response={pipeline,dpdApplications:radius===1?[application]:[],developments:[
    {id:"article",stage:2,source:"blockclub",title:"Nine-story apartment building proposed for Broadway in Edgewater",address:"5520 N Broadway",url:"https://blockclubchicago.org/test",status:"Proposed",pipelineStage:"permitted",units:64,stories:9,developer:"Broadway Partners",publishDate:"2026-07-01",corridor:{name:"Broadway"}}
  ],sourceCoverage:pipeline.sourceCoverage};
  const zbaData={zbaActivity:{recentApprovals:[{caseNumber:"22-26",address:"5526 N Broadway",decision:"APPROVED",subject:"Special use to establish 12 dwelling units in a three-story building.",meetingMonth:"July 2026",lat:41.98,lon:-87.66,corridor:{name:"Broadway"}}],upcomingCases:[]},sourceCoverage:pipeline.sourceCoverage};
  return React.createElement("div",{className:"kyp-report",style:{maxWidth:1100,margin:"20px auto",padding:"0 12px"}},
    React.createElement("div",{className:"kyp-acc"},
      React.createElement(AccordionSection,{id:"development",index,eyebrow:"Nearby Development & Construction",takeaway:"Units under construction and in the approval pipeline nearby.",open:true,onToggle:()=>{},verdict:"context",badge:"~48 units"},
         React.createElement(DevelopmentSection,{pipelineData:response,permitData,permitLoading:false,permitError:false,subjectUnits:20,dpdData:response,dpdLoading:false,dpdError:false,zbaData,zbaLoading:false,zbaError:false,radiusMi:radius,onRadiusChange:setRadius,ward:48,lat:41.98,lon:-87.66,renderLogo:item=>React.createElement(LogoTile,{url:item.url,source:"Block Club Chicago"})}))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Fixture));
`;
const fixtureHtml = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/development-qa-entry.js"></script></body>');
const printSnippetSource = runDetail.slice(runDetail.indexOf("const developmentRoot = document.getElementById('print-section-upcoming-developments');"),
  runDetail.indexOf("// Exclude incentive sub-sections"));
const printSnippet = ts.transpileModule(printSnippetSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
assert.ok(printSnippet.includes("permitsSelected"));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/development-qa-entry.js", (route) => route.fulfill({ contentType: "application/javascript", body: entry }));
await page.route("**/development-qa", (route) => route.fulfill({ contentType: "text/html", body: fixtureHtml }));
try {
  for (const width of [1200, 860, 640, 520, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/development-qa`);
    await page.locator("#development-news .kyp-archrow").waitFor();
    assert.equal(await page.locator(".kyp-src").count(), 5);
    assert.equal(await page.locator(".kyp-src > p").count(), 10, "Every section note has scope and source paragraphs");
    assert.equal(await page.locator('#development-pipeline > .kyp-src').count(), 1);
    assert.equal(await page.locator('[data-testid="development-pipeline"] .kyp-block').count(), 1);
    assert.equal(await page.locator('[data-testid="development-proposals"] .kyp-block.slate').count(), 2);
    assert.equal(await page.locator('[data-testid="development-pipeline"] .bv + div > .bl').count(), 1, "Count block keeps its text wrapper");
    assert.equal(await page.locator('#development-permits .kyp-biz-heroes .kyp-block').count(), 4);
    assert.equal(await page.locator('#development-permits .kyp-block.slate').filter({ hasText: "+125%" }).count(), 1);
    assert.match(await page.locator('[data-testid="development-pipeline"] .bd').innerText(), /7 permits · 4 with no unit count/);
    assert.match(await page.locator('#development-permits .kyp-construction-notes').innerText(), /2\.4× the subject’s 20/);
    assert.doesNotMatch(await page.locator('#print-section-upcoming-developments').innerText(), /not added together|12-month trend:|Corridor tags require|storeys/);
    assert.equal(await page.locator(".kyp-hbar").count(), 6);
    assert.equal(await page.locator('[data-testid^="row-new-construction-"]').count(), 12);
    assert.equal(await page.locator(".kyp-pro").count(), 4);
    const gcLink = page.getByRole("link", { name: "Alpha & Sons", exact: true });
    assert.equal(await gcLink.getAttribute("href"), "/discovery?view=gc-rankings&search=Alpha%20%26%20Sons");
    assert.equal(await page.getByRole("link", { name: "Design Studio", exact: true }).getAttribute("href"),
      "/discovery?view=architect-rankings&search=Design%20Studio");
    await page.getByRole("button", { name: /Show all 15 nearby permits/ }).click();
    assert.equal(await page.locator('[data-testid^="row-new-construction-"]').count(), 15);
    await page.getByRole("button", { name: "Show fewer ↑" }).click();
    await page.getByRole("button", { name: "Single family" }).click();
    assert.equal(await page.locator('[data-testid^="row-new-construction-"]').count(), 5);
    await page.getByRole("button", { name: "Single family" }).click();
    await page.getByRole("button", { name: "1 mile", exact: true }).click();
    await page.getByText("A mixed-use development with 187 dwelling units.").waitFor();
    assert.equal(await page.locator("#development-proposed .kyp-biz-card").count(), 1);
    await page.evaluate(() => window.developmentFixtureSetIndex(31));
    await page.locator("#development-proposed .n", { hasText: "31.2" }).waitFor();
    assert.match(await page.locator(".kyp-alsoin").innerText(), /31\.1/);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      zbaColumns: getComputedStyle(document.querySelector(".kyp-twocol")).gridTemplateColumns.split(" ").length,
      pipelineColumns: getComputedStyle(document.querySelector('[data-testid="development-pipeline"]')).gridTemplateColumns.split(" ").length,
      proposalColumns: getComputedStyle(document.querySelector('[data-testid="development-proposals"]')).gridTemplateColumns.split(" ").length,
      heroColumns: getComputedStyle(document.querySelector(".kyp-biz-heroes")).gridTemplateColumns.split(" ").length,
      footerMargins: [...document.querySelectorAll(".kyp-src p+p")].map(p => ({
        left: getComputedStyle(p).marginLeft, top: getComputedStyle(p).marginTop,
      })),
      corridor: getComputedStyle(document.querySelector(".kyp-corridor")).color,
      logo: document.querySelector(".kyp-archlogo img")?.naturalWidth > 0,
    }));
    assert.equal(geometry.overflow, false, "No horizontal overflow");
    assert.equal(geometry.zbaColumns, width <= 640 ? 1 : 2);
    assert.equal(geometry.pipelineColumns, 1);
    assert.equal(geometry.proposalColumns, 2);
    assert.equal(geometry.heroColumns, width <= 520 ? 1 : width <= 860 ? 2 : 4);
    assert.ok(geometry.footerMargins.every(margin => margin.left === "0px" && margin.top === "5px"));
    assert.equal(geometry.logo, true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `/tmp/development-section-${width}.png`, fullPage: true });
    await page.screenshot({ path: `/tmp/development-section-top-${width}.png` });
    for (const selected of [["new-construction"], ["upcoming-developments"], ["new-construction", "upcoming-developments"], []]) {
      const visible = await page.evaluate(({ snippet, selected }) => {
        new Function("selectedSections", snippet)(selected);
        return {
          rootExcluded: document.getElementById("print-section-upcoming-developments").classList.contains("print-exclude"),
          permitsExcluded: document.getElementById("development-permits").classList.contains("print-exclude"),
          newsExcluded: document.getElementById("development-news").classList.contains("print-exclude"),
        };
      }, { snippet: printSnippet, selected });
      assert.equal(visible.rootExcluded, selected.length === 0);
      assert.equal(visible.permitsExcluded, !selected.includes("new-construction"));
      assert.equal(visible.newsExcluded, !selected.includes("upcoming-developments"));
    }
    console.log(`Development browser checks passed at ${width}px`, geometry);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}