import assert from "node:assert/strict";
import { formatNewsDate } from "./newsDate";

assert.equal(formatNewsDate("2026-07-09"), "Jul 9, 2026");
assert.equal(formatNewsDate("2026-07-09T07:00:00.000Z"), "Jul 9, 2026");
assert.equal(formatNewsDate(""), "");
assert.equal(formatNewsDate("not a date"), "");
console.log("News archive date formatting checks passed");