import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTreasurerSearchForm, openTreasurerSearchBrowser, treasurerProxyConfig } from "./treasurerBrowser.mjs";

test("proxy formats are handled without including credentials in the server address", () => {
  const expected = { server: "http://proxy.example:8000", username: "user", password: "pass:word" };
  assert.deepEqual(treasurerProxyConfig("proxy.example:8000:user:pass:word"), expected);
  assert.deepEqual(treasurerProxyConfig("http://proxy.example:8000:user:pass:word"), expected);
  assert.deepEqual(treasurerProxyConfig("http://user:pass%3Aword@proxy.example:8000"), expected);
  assert.deepEqual(treasurerProxyConfig(" user:pass%3Aword@proxy.example:8000 "), expected);
  assert.equal(treasurerProxyConfig(undefined), undefined);
  assert.throws(() => treasurerProxyConfig("private-invalid-config"), /invalid format/);
});

test("search readiness waits for the actual PIN fields, not network idle", async () => {
  const calls = [];
  await loadTreasurerSearchForm({
    goto: async (_, opts) => { calls.push(opts.waitUntil); return { status: () => 200 }; },
    locator: selector => ({ waitFor: async opts => calls.push([selector, opts.state]) }),
  }, "https://www.cookcountytreasurer.com/setsearchparameters.aspx");
  assert.equal(calls[0], "commit");
  assert.equal(calls.length, 6);
  assert.match(calls[5][0], /txtPIN5$/);
  assert.equal(calls[5][1], "visible");
});

test("manual refresh reuses the background job instead of waiting past the HTTP deadline", () => {
  const source = readFileSync("server/propertyTax.ts", "utf8");
  assert.match(source, /const shouldBackgroundScrape = needsTreasurerScrape \|\| backgroundScrapes\.has\(normalizedPin\)/);
  assert.doesNotMatch(source, /forceRefresh only — synchronous scrape/);
  assert.match(readFileSync("script/build.ts", "utf8"), /cp\("server\/treasurerBrowser\.mjs", "dist\/treasurerBrowser\.mjs"\)/);
});

test("v3 captcha requests use the HTTP API's min_score parameter, not the SDK alias", () => {
  const source = readFileSync("server/treasurer-scraper.mjs", "utf8");
  assert.match(source, /&min_score=0\.7&json=1/);
  assert.doesNotMatch(source, /&score=/);
});

test("proxy authentication failure is explicit and does not wait for nonexistent PIN fields", async () => {
  await assert.rejects(loadTreasurerSearchForm({
    goto: async () => ({ status: () => 407 }),
    locator: () => { throw new Error("must not try form fields"); },
  }, "https://www.cookcountytreasurer.com/setsearchparameters.aspx"), /HTTP 407/);
});

test("a failed direct connection uses the optional proxy and closes failed browsers", async () => {
  const proxies = [], closed = [];
  const opened = await openTreasurerSearchBrowser({
    launch: async opts => {
      const index = proxies.length; proxies.push(opts.proxy);
      return {
        close: async () => closed.push(index),
        newPage: async () => ({
          setViewportSize: async () => {},
          goto: async () => { if (!index) throw new Error("direct connection timeout"); return { status: () => 200 }; },
          locator: () => ({ waitFor: async () => {} }),
        }),
      };
    },
  }, "proxy.example:8000:user:pass", "https://www.cookcountytreasurer.com/setsearchparameters.aspx");
  assert.equal(proxies[0], undefined);
  assert.equal(proxies[1].server, "http://proxy.example:8000");
  assert.deepEqual(closed, [0]);
  await opened.browser.close();
  assert.deepEqual(closed, [0, 1]);
});