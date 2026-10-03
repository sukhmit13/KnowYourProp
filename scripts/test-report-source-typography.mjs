import assert from "node:assert/strict";
import { chromium } from "playwright";

// Browser-only fixture: production styles/components without an auth bypass.
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const [shell, accordion, main] = await Promise.all([
  fetch(base).then(r => r.text()),
  fetch(`${base}/src/components/report/AccordionSection.tsx`).then(r => r.text()),
  fetch(`${base}/src/main.tsx`).then(r => r.text()),
]);
const react = accordion.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const dom = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(react && dom, "Production React modules are available");
const html = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/source-typography-entry.js"></script></body>');
const entry = `
import React from ${JSON.stringify(react)};
import ReactDOM from ${JSON.stringify(dom)};
import {ProfessionalRecordSection} from "/src/components/report/ProfessionalRecordSection.tsx";
import {NewConstructionSection} from "/src/components/report/NewConstructionSection.tsx";
import {AccordionSection} from "/src/components/report/AccordionSection.tsx";
import "/src/index.css";
import "/src/kyp-base.css";
const e=React.createElement;
const data={groups:[{key:"taxAttorneys",label:"Tax appeal attorneys",entries:[{name:"Test Attorney",key:"test",role:"Tax appeal attorney",lastSeen:"2025",lastSeenPrecision:"year",recordCount:1,facts:["1 record here"]}]}],totalNames:1,groupCount:1,firstYear:2025,lastYear:2025,sourceCoverage:{permits:{status:"available"}}};
function row(id,index,title,children){return e(AccordionSection,{id,index,eyebrow:title,open:true,onToggle:()=>{},verdict:"context",takeaway:"Source typography check"},children);}
ReactDOM.createRoot(document.getElementById("root")).render(
  e("div",{className:"kyp-report",style:{maxWidth:1000,margin:"20px auto",padding:"0 16px"}},
    row("news",24,"News",e("div",null,
      e("p",{id:"normal-body"},"Ordinary section text must retain its existing size."),
      e("div",{className:"kyp-src",id:"news-source"},"Neighborhood development items are matched to permit records by address. Sources: ",
        e("a",{href:"#source"},"Original reporting"),e("span",null," · Coverage can precede permit filings.")))),
    row("professionals",25,"Professional Record",e(ProfessionalRecordSection,{data})),
    row("construction",26,"New Construction",e(NewConstructionSection,{isLoading:false,isError:true})),
    row("nested",27,"Nested explanatory note",e("div",{className:"kyp-src"},
      e("p",null,"Scope: records describe the surrounding area, not this address."),
      e("p",null,"Source: ",e("span",null,"Public records")," · ",e("a",{href:"#source"},"View dataset"))))
  ));
`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("**/source-typography-entry.js", route => route.fulfill({ contentType: "application/javascript", body: entry }));
await page.route("**/source-typography-check", route => route.fulfill({ contentType: "text/html", body: html }));
try {
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/source-typography-check`);
    await page.locator("#print-section-professional-record .kyp-src p").waitFor();
    for (const media of ["screen", "print"]) {
      await page.emulateMedia({ media });
      const notes = await page.locator(".kyp-src, .kyp-src p, .kyp-src span, .kyp-src a").evaluateAll(nodes =>
        nodes.map(n => ({ tag: n.tagName, fontSize: getComputedStyle(n).fontSize, lineHeight: getComputedStyle(n).lineHeight })));
      assert.ok(notes.length >= 12);
      for (const note of notes) {
        assert.equal(note.fontSize, "11.5px", `${width}px ${media}: ${note.tag}`);
        assert.ok(parseFloat(note.lineHeight) >= 16, "Comfortable source-note line spacing");
      }
      assert.notEqual(await page.locator("#normal-body").evaluate(n => getComputedStyle(n).fontSize), "11.5px", "Body text is unchanged");
    }
    await page.emulateMedia({ media: "screen" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal overflow");
    await page.screenshot({ path: `/tmp/report-source-typography-${width}.png`, fullPage: true });
    console.log(`PASS source notes: ${width}px, screen and print`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}