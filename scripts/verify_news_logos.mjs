// Exercise the production news JSX at its actual tile sizes.
// Run against the managed workflow: node scripts/verify_news_logos.mjs
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
import { transform } from "esbuild";
import { chromium } from "playwright";

const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const source = await fs.readFile("client/src/pages/RunDetail.tsx", "utf8");
const ast = ts.createSourceFile("RunDetail.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  const node = ast.statements.find(item => item.name?.text === name
    || item.declarationList?.declarations.some(d => d.name.getText(ast) === name));
  assert(node, `Missing production declaration: ${name}`);
  return node.getText(ast);
}
const [main, component] = await Promise.all([
  fetch(`${origin}/src/main.tsx`).then(r => r.text()),
  fetch(`${origin}/src/components/HMDAStats.tsx`).then(r => r.text()),
]);
const reactPath = component.match(/from "([^"]*\/react\.js\?[^"]+)"/)?.[1];
const rootPath = main.match(/from "([^"]*\/react-dom_client\.js\?[^"]+)"/)?.[1];
assert(reactPath && rootPath, "Vite React dependency paths not found");
const names = ["SOURCE_LOGOS", "PLATE_TONES", "domainOf", "SOURCE_DOMAINS", "publisherDomain",
  "safeUrl", "newsStateLabel", "newsVClass", "newsStatusCls", "newsGoCorridor",
  "LogoTile", "NewsArchCard", "NewsSiteCard", "NewsDevCard"];
const jsx = `
import React from "${reactPath}";
import ReactDOM from "${rootPath}";
const {useState} = React;
const {createRoot} = ReactDOM;
const newsFmtD = date => date;
${names.map(declaration).join("\n")}
const publishers = [
  ["dwell.com", "Dwell"], ["chicago.eater.com", "Eater Chicago"],
  ["chicagoyimby.com", "Chicago YIMBY"], ["theinfatuation.com", "The Infatuation"],
  ["chicagobusiness.com", "Crain's Chicago Business"], ["chicagotribune.com", "Chicago Tribune"],
  ["chicagoreader.com", "Chicago Reader"], ["therealdeal.com", "The Real Deal"],
  ["blockclubchicago.org", "Block Club Chicago"], ["suntimes.com", "Chicago Sun-Times"],
  ["wbez.org", "WBEZ"], ["bisnow.com", "Bisnow"], ["archpaper.com", "The Architect's Newspaper"],
  ["timeout.com", "Time Out Chicago"], ["chicagomag.com", "Chicago Magazine"],
  ["chicago.urbanize.city", "Urbanize Chicago"]
];
const rows = publishers.map(([dom, source]) => ({
  url: "https://" + dom + "/article", source, title: source + " — publisher icon check",
  date: "Sep 30, 2026", tier: "parcel", stage: "proposed", stageLabel: "Proposed"
}));
createRoot(document.getElementById("root")).render(<main>
  <section id="archive">{rows.map((a, i) => <NewsArchCard key={i} a={a} testid={"publisher-" + i}/>)}</section>
  <section id="site"><NewsSiteCard m={rows[2]} g={{}} idx={0} lead/></section>
  <section id="development"><NewsDevCard p={rows[3]} testid="development-icon"/></section>
  <section id="aggregator"><NewsArchCard a={{...rows[2],url:"https://news.google.com/articles/example"}}/></section>
</main>);
`;
const compiled = await transform(jsx, { loader: "tsx", format: "esm", jsx: "transform" });
const html = `<!doctype html><html><head><link rel="stylesheet" href="/src/index.css">
<link rel="stylesheet" href="/src/kyp-base.css">
<style>body{margin:0;background:#fff}main{max-width:900px;margin:auto;padding:20px}section{margin-bottom:24px}</style>
</head><body><div id="root"></div><script type="module">${compiled.code}</script></body></html>`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1040, height: 1050 } });
const errors = [];
page.on("pageerror", e => { errors.push(e.message); console.error("Browser:", e.message); });
await page.route("**/news-logo-check", r => r.fulfill({ contentType: "text/html", body: html }));
// Dwell is unchanged and still uses the favicon service. Keep this check offline/deterministic.
const dwellResponse = await fetch("https://www.google.com/s2/favicons?domain=dwell.com&sz=128");
assert(dwellResponse.ok);
const dwell = Buffer.from(await dwellResponse.arrayBuffer());
await page.route("https://www.google.com/s2/favicons?domain=dwell.com&sz=128",
  r => r.fulfill({ contentType: "image/png", body: dwell }));
async function checkTiles() {
  await page.waitForFunction(() => [...document.querySelectorAll(".kyp-archlogo img")]
    .every(img => img.complete && img.naturalWidth > 0));
  const tiles = await page.locator(".kyp-archlogo").evaluateAll(es => es.map(el => {
    const img = el.querySelector("img"), box = el.getBoundingClientRect(), image = img.getBoundingClientRect();
    return {width:box.width,height:box.height,imageWidth:image.width,imageHeight:image.height};
  }));
  assert.equal(tiles.length, 19);
  for (const t of tiles) {
    assert.equal(t.width, t.height, "Keep square tiles");
    assert.ok(t.imageWidth >= 30 && t.imageHeight >= 8, "Artwork remains visible");
    assert.ok(t.imageWidth <= t.width && t.imageHeight <= t.height, "Artwork fits without distortion");
  }
  assert.equal(tiles[16].width, 88, "Preserve lead-story tile size");
}
try {
  await page.goto(`${origin}/news-logo-check`);
  await page.locator("#aggregator img").waitFor();
  await checkTiles();
  const srcs = await page.locator("#archive img").evaluateAll(es => es.map(e => e.getAttribute("src")));
  assert.equal(srcs.filter(s => s.endsWith("-icon.png")).length, 11);
  assert.equal(srcs[1], "/logos/eater.svg", "Eater is unchanged");
  assert.match(srcs[0], /domain=dwell.com/, "Dwell is unchanged");
  assert.equal(await page.locator("#aggregator img").getAttribute("src"), "/logos/yimby-icon.png");
  assert.equal(await page.locator("#development img").getAttribute("src"), "/logos/infatuation-icon.png");
  assert.equal(await page.locator("#archive .kyp-archread").count(), 16, "Publisher links remain");
  await page.screenshot({ path: "/tmp/news-logos-desktop.png", fullPage: true });
  await page.setViewportSize({width:390,height:844});
  await checkTiles();
  await page.screenshot({path:"/tmp/news-logos-mobile.png",fullPage:true});
  const yimby = await fs.readFile("client/public/logos/yimby-icon.png");
  const favicon = "https://www.google.com/s2/favicons?domain=chicagoyimby.com&sz=128";
  await page.route("**/logos/yimby-icon.png", r => r.abort());
  await page.route(favicon, r => r.fulfill({contentType:"image/png",body:yimby}));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="publisher-2"] img')?.src.includes("google.com"));
  await page.unroute(favicon);
  await page.route(favicon, r => r.abort());
  await page.reload();
  await page.locator('[data-testid="publisher-2"] .tsrc').waitFor();
  assert.equal(await page.locator('[data-testid="publisher-2"] .tsrc').textContent(), "Chicago YIMBY");
  assert.deepEqual(errors, []);
  console.log("News logo checks passed: 11 compact assets, unchanged Eater/Dwell, all row variants, lead sizing, mobile, publisher mapping and both fallback states.");
} finally {
  await browser.close();
}