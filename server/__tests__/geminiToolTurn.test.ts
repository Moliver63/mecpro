import test from "node:test";
import assert from "node:assert/strict";
import type { Content, GenerateContentResponse } from "@google/genai";
import { appendGeminiToolTurn } from "../ai-providers/geminiToolTurn";

test("preserves signed parts and returns all tool results in order", async () => {
  const content: Content = { role: "model", parts: [
    { text: "Planning", thoughtSignature: "opaque-text-signature" },
    { functionCall: { id: "a", name: "first", args: { value: 1 } }, thoughtSignature: "opaque-call-signature" },
    { functionCall: { id: "b", name: "second", args: {} } },
  ] };
  const history: Content[] = [];
  const executed: string[] = [];
  const handled = await appendGeminiToolTurn(history, { candidates: [{ content }] } as GenerateContentResponse,
    async (name, args) => { executed.push(name); return { name, args }; });
  assert.equal(handled, true);
  assert.equal(history[0], content);
  assert.deepEqual(executed, ["first", "second"]);
  assert.deepEqual(history[1].parts?.map(p => p.functionResponse?.id), ["a", "b"]);
  assert.equal(history[0].parts?.[1].thoughtSignature, "opaque-call-signature");
});

test("plain text does not execute tools or append tool history", async () => {
  const history: Content[] = [];
  assert.equal(await appendGeminiToolTurn(history,
    { candidates: [{ content: { role: "model", parts: [{ text: "Hello" }] } }] } as GenerateContentResponse,
    async () => { throw new Error("must not execute"); }), false);
  assert.equal(history.length, 0);
});
