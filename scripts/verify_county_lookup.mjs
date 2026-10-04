import assert from "node:assert/strict";
import { chromium } from "playwright";

// Exercise the real hooks in an intercepted fixture, never bypassing app authentication.
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const [shell, hooks, main] = await Promise.all([
  fetch(origin).then(r => r.text()),
  fetch(`${origin}/src/hooks/use-runs.ts`).then(r => r.text()),
  fetch(`${origin}/src/main.tsx`).then(r => r.text()),
]);
const react = hooks.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const query = hooks.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/@tanstack_react-query\.js[^"']*)["']/)?.[1];
const dom = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(react && query && dom, "managed Vite dependencies must be available");
const html = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/county-check-entry.js"></script></body>');
const entry = `
import React from ${JSON.stringify(react)};
import ReactDOM from ${JSON.stringify(dom)};
import {QueryClient,QueryClientProvider} from ${JSON.stringify(query)};
import {useReportCountyRecords} from "/src/hooks/use-runs.ts";
import {CountyLookupStatus} from "/src/components/report/CountyLookupStatus.tsx";
import "/src/index.css";
import "/src/kyp-base.css";
const e=React.createElement;
const client=new QueryClient({defaultOptions:{queries:{retryDelay:10,refetchOnWindowFocus:false}}});
function Fixture(){
 const [address,setAddress]=React.useState("3900 W FULLERTON AVE, CHICAGO, IL, 60647");
 const [coords,setCoords]=React.useState(false);
 const [manual,setManual]=React.useState(null);
 const records=useReportCountyRecords(address,coords?41.924571:undefined,coords?-87.724405:undefined,manual,"chicago");
 const retry=()=>records.state.retry==="tax"?records.propertyTax.refetch():records.pinLookup.refetch();
 return e("div",{style:{padding:24,maxWidth:700}},
  e("h2",{"data-testid":"status"},records.state.label),
  e("div",{"data-testid":"pin"},records.pin||""),
  e("div",{"data-testid":"lookup-pin"},records.lookupData?.pin||""),
  e("div",{"data-testid":"tax"},records.propertyTax.data?.totalAnnualTaxAmount??""),
  e(CountyLookupStatus,{state:records.state,onRetry:retry}),
  e("button",{onClick:()=>setCoords(true)},"Add coordinates"),
  e("button",{onClick:()=>setManual("17123456780000")},"Manual PIN"),
  e("button",{onClick:()=>{setAddress("100 W TEST AVE, CHICAGO, IL, 60601");setManual(null)}},"Switch parcel"));
}
ReactDOM.createRoot(document.getElementById("root")).render(e(QueryClientProvider,{client},e(Fixture)));
`;
const browser = await chromium.launch({headless:true});
try {
  for (const mode of ["success", "transient", "pin-error", "pin-null", "tax-error", "tax-error-payload"]) {
    const page = await browser.newPage({viewport:{width:390,height:874}});
    const errors=[];
    page.on("pageerror",err=>errors.push(err.message));
    let failPin=mode==="pin-error", failTax=mode.startsWith("tax-error"), pinRequests=0;
    const taxPins=[];
    await page.route("**/county-check-entry.js",r=>r.fulfill({contentType:"application/javascript",body:entry}));
    await page.route("**/county-check",r=>r.fulfill({contentType:"text/html",body:html}));
    await page.route("**/api/pins/resolve", async r=>{
      pinRequests++;
      const body=r.request().postDataJSON();
      const status=failPin||(mode==="transient"&&pinRequests===1)?500:200;
      const pin=mode==="pin-null"||body.address.startsWith("100 ")?null:"13263240350000";
      await r.fulfill({status,contentType:"application/json",body:JSON.stringify(status===500?{error:"Lookup failed"}:{pin,confidence:pin?"high":"none",source:"assessor_api"})});
    });
    await page.route("**/api/property-tax",async r=>{
      const pin=r.request().postDataJSON().pin;
      taxPins.push(pin);
      await r.fulfill({status:failTax&&mode!=="tax-error-payload"?500:200,contentType:"application/json",body:JSON.stringify(failTax?{error:"Tax source unavailable"}:{pin,totalAnnualTaxAmount:12345,paymentStatus:"current"})});
    });
    await page.goto(`${origin}/county-check`);
    if(mode==="pin-error"){
      await page.getByRole("button",{name:"Retry PIN lookup"}).waitFor();
      assert.equal(await page.getByTestId("status").textContent(),"PIN lookup failed");
      assert.equal(taxPins.length,0,"never fetch taxes without a PIN");
      failPin=false;
      await page.getByRole("button",{name:"Retry PIN lookup"}).click();
    }else if(mode==="pin-null"){
      await page.getByRole("button",{name:"Retry PIN lookup"}).waitFor();
      assert.equal(await page.getByTestId("status").textContent(),"PIN not resolved");
      assert.equal(taxPins.length,0);
      await page.getByRole("button",{name:"Manual PIN",exact:true}).click();
    }else if(mode.startsWith("tax-error")){
      await page.getByRole("button",{name:"Retry tax lookup"}).waitFor();
      assert.equal(await page.getByTestId("status").textContent(),"Tax lookup failed");
      failTax=false;
      await page.getByRole("button",{name:"Retry tax lookup"}).click();
    }
    await page.waitForFunction(()=>document.querySelector('[data-testid="tax"]').textContent==="12345");
    assert.equal(await page.getByTestId("status").textContent(),"Record loaded");
    if(mode==="success"){
      assert.equal(taxPins[0],"13263240350000","resolved PIN starts taxes without a state-copy effect");
      await page.getByRole("button",{name:"Add coordinates"}).click();
      await page.waitForFunction(()=>document.querySelector('[data-testid="tax"]').textContent==="12345");
      await page.getByRole("button",{name:"Manual PIN",exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[data-testid="pin"]').textContent==="17123456780000");
      await page.waitForFunction(()=>document.querySelector('[data-testid="tax"]').textContent==="12345");
      assert.ok(taxPins.includes("17123456780000"),"manual override must load its own tax records");
      assert.equal(await page.getByTestId("lookup-pin").textContent(),"","manual override must not display another parcel's assessment history");
      const before=taxPins.length;
      await page.getByRole("button",{name:"Switch parcel"}).click();
      await page.getByRole("button",{name:"Retry PIN lookup"}).waitFor();
      assert.equal(await page.getByTestId("pin").textContent(),"");
      assert.equal(await page.getByTestId("tax").textContent(),"");
      assert.equal(taxPins.length,before,"a new unresolved address must not fetch the prior parcel's PIN");
      await page.screenshot({path:"/tmp/county-lookup-status-phone.png"});
    }
    if(mode==="transient")assert.ok(pinRequests>=2,"transient PIN failure retries automatically");
    assert.deepEqual(errors,[]);
    console.log(`County lookup verified: ${mode}`);
    await page.close();
  }
} finally {await browser.close();}