import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const [shell,hooks,main] = await Promise.all(["/", "/src/hooks/use-runs.ts", "/src/main.tsx"].map(p=>fetch(origin+p).then(r=>r.text())));
const react=hooks.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const query=hooks.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/@tanstack_react-query\.js[^"']*)["']/)?.[1];
const dom=main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(react&&query&&dom);
const html=shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/,"").replace("</body>",'<script type="module" src="/listing-check-entry.js"></script></body>');
const entry=`
import React from ${JSON.stringify(react)};
import ReactDOM from ${JSON.stringify(dom)};
import {QueryClient,QueryClientProvider} from ${JSON.stringify(query)};
import {useListingSnapshot,useGenerateListingSnapshot} from "/src/hooks/use-runs.ts";
import {useAutoListingCheck} from "/src/hooks/use-auto-listing-check.ts";
localStorage.setItem("kyp_auth_token","synthetic-test-token");
const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
window.fixtureClient=client; const e=React.createElement;
function Fixture(){
 const [id,setId]=React.useState(1); const [enabled,setEnabled]=React.useState(!location.search.includes("locked"));
 const [tick,setTick]=React.useState(0);
 const saved=useListingSnapshot(id,enabled); const generate=useGenerateListingSnapshot(id);
 useAutoListingCheck({runId:id,enabled,fetched:saved.isFetched,hasSnapshot:!!saved.data,loadError:saved.isError,pending:generate.isPending,lookupError:generate.isError,generate:generate.mutate});
 return e("div",{},e("div",{"data-testid":"snapshot"},saved.data?.statusLabel||""),
  e("div",{"data-testid":"status"},generate.isError?"failed":generate.isPending?"checking":saved.isError?"load-failed":"idle"),
  e("button",{onClick:()=>setEnabled(true)},"Unlock report"),
  e("button",{onClick:()=>setId(2)},"Next report"),
  e("button",{onClick:()=>setTick(tick+1)},"Rerender"),
  e("button",{onClick:()=>saved.isError?saved.refetch():generate.mutate({force:!!saved.data})},"Retry"));
}
ReactDOM.createRoot(document.getElementById("root")).render(e(React.StrictMode,{},e(QueryClientProvider,{client},e(Fixture))));
`;
const snapshot=id=>({status:"active",statusLabel:`run-${id}`,checkedAt:"2026-10-04T09:00:00Z",claims:[]});
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ["auto","cached","not-found","locked","get-error","post-error","switch"]){
  const page=await browser.newPage();const posts=[];let getFailure=mode==="get-error",postFailure=mode==="post-error";let releaseOld;
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/listing-check-entry.js",r=>r.fulfill({contentType:"application/javascript",body:entry}));
  await page.route("**/listing-check?*",r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route("**/api/runs/*/listing-snapshot",async r=>{
   assert.equal(r.request().headers().authorization,"Bearer synthetic-test-token");
   const id=Number(r.request().url().match(/runs\/(\d+)/)[1]);
   const post=r.request().method()==="POST";
   if(post){posts.push({id,body:r.request().postDataJSON()});if(mode==="switch"&&id===1)await new Promise(resolve=>releaseOld=resolve);}
   const failed=post?postFailure:getFailure;
   const body=failed?{message:"Temporary lookup failure"}:post?snapshot(id):mode==="cached"?snapshot(id):mode==="not-found"?{...snapshot(id),status:"not_found"}:null;
   await r.fulfill({status:failed?502:200,contentType:"application/json",body:JSON.stringify(body)});
  });
  await page.goto(`${origin}/listing-check?mode=${mode}`);
  if(mode==="locked"){
   await page.waitForTimeout(100);assert.equal(posts.length,0);
   await page.getByRole("button",{name:"Unlock report"}).click();
  }else if(mode==="get-error"){
   await page.waitForFunction(()=>document.querySelector('[data-testid="status"]').textContent==="load-failed");
   assert.equal(posts.length,0);getFailure=false;await page.getByRole("button",{name:"Retry",exact:true}).click();
  }else if(mode==="post-error"){
   await page.waitForFunction(()=>document.querySelector('[data-testid="status"]').textContent==="failed");
   for(let i=0;i<3;i++)await page.getByRole("button",{name:"Rerender"}).click();
   assert.equal(posts.length,1,"no paid retry loop after a failed automatic check");
   postFailure=false;await page.getByRole("button",{name:"Retry",exact:true}).click();
  }else if(mode==="switch"){
   await page.waitForFunction(()=>document.querySelector('[data-testid="status"]').textContent==="checking");
   await page.getByRole("button",{name:"Next report"}).click();
   await page.waitForFunction(()=>document.querySelector('[data-testid="snapshot"]').textContent==="run-2");
   releaseOld();
   await page.waitForFunction(()=>window.fixtureClient.getQueryData(["/api/runs",1,"listing-snapshot"])?.statusLabel==="run-1");
   assert.equal(await page.getByTestId("snapshot").textContent(),"run-2","old completion must not overwrite new report");
   assert.equal(posts.length,2);
  }
  if(mode!=="switch")await page.waitForFunction(()=>document.querySelector('[data-testid="snapshot"]').textContent==="run-1");
  if(["cached","not-found"].includes(mode))assert.equal(posts.length,0,"saved snapshots prevent another paid lookup");
  else if(!["post-error","switch"].includes(mode))assert.equal(posts.length,1,"exactly one automatic request, including StrictMode");
  for(const p of posts)assert.equal(p.body.force,false,"automatic checks must reuse server caches");
  assert.deepEqual(errors,[]);console.log("Listing check verified:",mode);await page.close();
 }
}finally{await browser.close();}