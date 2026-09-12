import test from "node:test";
import assert from "node:assert/strict";
import { createChatSessionMiddleware } from "../chatSession";
import { briefingContext } from "../chatBriefing";

const sessionId = "12345678-1234-1234-1234-123456789012";
test("session persistence scopes every query to the authenticated account", async () => {
  const queries: Array<{ sql: string; params: any[] }> = [];
  let payload: any;
  let resolve!: () => void;
  const finished = new Promise<void>(r => { resolve = r; });
  const middleware = createChatSessionMiddleware(async () => ({ async query(sql: string, params: any[]) {
    queries.push({ sql, params });
    return { rowCount: 1, rows: sql.includes("RETURNING state") ? [{ state: { briefing: { budget: 84 } } }] : [] };
  } }));
  const res: any = { json(value: any) { payload = value; resolve(); }, on() {}, status() { return this; } };
  await middleware({ chatUserId: 7, body: { sessionId } }, res, (error?: unknown) => {
    assert.equal(error, undefined);
    const state = briefingContext.getStore()!;
    assert.equal(state.briefing.budget, 84);
    state.briefing.budget = 100;
    res.json({ resposta: "ok" });
  });
  await finished;
  assert.equal(payload.resposta, "ok");
  assert.ok(queries.every(q => q.params[0] === 7 && q.params[1] === sessionId));
  assert.equal(JSON.parse(queries.at(-1)!.params[3]).briefing.budget, 100);
});
test("busy session does not execute another conversation turn", async () => {
  let status = 0;
  let called = false;
  const res: any = { status(code: number) { status = code; return this; }, json() {} };
  const middleware = createChatSessionMiddleware(async () => ({ async query() { return { rows: [] }; } }));
  await middleware({ chatUserId: 7, body: { sessionId } }, res, () => { called = true; });
  assert.equal(status, 409);
  assert.equal(called, false);
});
test("malformed session is rejected before accessing storage", async () => {
  const middleware = createChatSessionMiddleware(async () => { throw new Error("must not access DB"); });
  let status = 0;
  const res: any = { status(code: number) { status = code; return this; }, json() {} };
  await middleware({ chatUserId: 7, body: { sessionId: "-".repeat(36) } }, res, () => assert.fail());
  assert.equal(status, 400);
});
