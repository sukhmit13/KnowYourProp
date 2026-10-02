import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerProfessionalRecordRoutes } from "./professionalRecordRoutes";

test("private and public routes use separate access checks and reject malformed evidence", async t => {
  const app = express();
  app.use(express.json());
  const checked: boolean[] = [];
  registerProfessionalRecordRoutes(app, async (req, res, publicView) => {
    checked.push(publicView);
    if (req.params.id === "unauthorized") { res.status(401).json({ message: "Sign in" }); return null; }
    if (req.params.id === "not-owned") { res.status(404).json({ message: "Not found" }); return null; }
    if (publicView && req.params.id === "unpaid") { res.status(403).json({ message: "Not purchased" }); return null; }
    return { address: "1 N TEST ST" };
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const post = (path: string, body: unknown = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await post("/api/runs/unauthorized/professional-record")).status, 401);
  assert.equal((await post("/api/runs/not-owned/professional-record")).status, 404);
  assert.equal((await post("/api/public/run/unpaid/professional-record")).status, 403);
  assert.equal((await post("/api/runs/allowed/professional-record", { taxAppealData: [null] })).status, 400);
  assert.equal((await post("/api/runs/allowed/professional-record", { permitData: { permits: "not an array" } })).status, 400);
  const response = await post("/api/public/run/paid/professional-record", { city: "Evanston", zbaData: { cases: [{ representativeRaw: "Forged Board name" }] } });
  assert.equal(response.status, 200);
  const record = await response.json();
  assert.deepEqual(record.groups, []);
  assert.equal(record.sourceCoverage.zba.status, "unavailable");
  assert.deepEqual(checked, [false, false, true, false, false, true]);
});