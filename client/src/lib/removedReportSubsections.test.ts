import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("deleted City-Owned Lots stays out of report, export, and data-request code", () => {
  const removedFeature = /city[- ]owned[- ](?:lots|land)|cityOwnedLot|city-lot-(?:quarter|half)|aksk-kvfp/i;
  function checkDirectory(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["data", "cache", "node_modules"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) checkDirectory(file);
      else if (/\.(?:ts|tsx|mjs|css|html)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        assert.doesNotMatch(readFileSync(file, "utf8"), removedFeature, file);
      }
    }
  }
  for (const directory of ["client/src", "server", "shared", "script"]) checkDirectory(directory);
});