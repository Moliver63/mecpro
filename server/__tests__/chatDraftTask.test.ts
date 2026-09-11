import test from "node:test";
import assert from "node:assert/strict";
import { chatTaskContext, runChatDraftTask, type DraftTaskStore } from "../chatDraftTask";

function memoryStore(): DraftTaskStore {
  const rows = new Map<string, { id: number; result?: unknown; completed: boolean }>();
  return {
    async reserveMcpIdempotencyKey(user, tool, key) {
      const id = `${user}:${tool}:${key}`;
      const row = rows.get(id);
      if (row) return row.completed ? { kind: "cached_result", result: row.result } : { kind: "duplicate_in_progress" };
      const recordId = rows.size + 1;
      rows.set(id, { id: recordId, completed: false });
      return { kind: "proceed", recordId };
    },
    async completeMcpIdempotencyKey(id, result) {
      const row = [...rows.values()].find(row => row.id === id)!;
      row.result = result;
      row.completed = true;
    },
  };
}

test("concurrent calls execute once and replay the saved result", async () => {
  const store = memoryStore();
  let finish!: (value: number) => void;
  const pending = new Promise<number>(resolve => { finish = resolve; });
  let count = 0;
  await chatTaskContext.run({ key: "same-turn" }, async () => {
    const first = runChatDraftTask(1, () => { count++; return pending; }, 1000, store);
    await assert.rejects(runChatDraftTask(1, async () => { count++; return 2; }, 1000, store), /processamento/);
    finish(42);
    assert.equal(await first, 42);
    assert.equal(await runChatDraftTask(1, async () => { count++; return 3; }, 1000, store), 42);
  });
  assert.equal(count, 1);
});

test("timeout keeps reservation until background completion", async () => {
  const store = memoryStore();
  let finish!: (value: number) => void;
  const pending = new Promise<number>(resolve => { finish = resolve; });
  await chatTaskContext.run({ key: "slow" }, async () => {
    await assert.rejects(runChatDraftTask(1, () => pending, 5, store), /continua em processamento/);
    await assert.rejects(runChatDraftTask(1, async () => 2, 1000, store), /ainda esta/);
    finish(42);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await runChatDraftTask(1, async () => 3, 1000, store), 42);
    assert.equal(await runChatDraftTask(2, async () => 99, 1000, store), 99);
  });
});

test("uncertain execution failure does not automatically rerun", async () => {
  const store = memoryStore();
  await chatTaskContext.run({ key: "uncertain" }, async () => {
    await assert.rejects(runChatDraftTask(1, async () => { throw new Error("connection lost"); }, 1000, store), /connection lost/);
    await assert.rejects(runChatDraftTask(1, async () => 2, 1000, store), /processamento/);
  });
});
