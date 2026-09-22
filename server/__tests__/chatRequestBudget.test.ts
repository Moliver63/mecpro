import test from "node:test";
import assert from "node:assert/strict";
import { budgetChatMessages, estimatedChatTokens } from "../chatRequestBudget";
import { completeGeminiText } from "../geminiResponse";

test("budget preserves briefing, last request and full current tool transaction", () => {
  const history = [
    { role: "system", content: "policy" },
    { role: "system", content: '{"projectId":7,"budget":1500}' },
    { role: "user", content: "old".repeat(5000) },
    { role: "assistant", content: "old answer" },
    { role: "user", content: "gere agora" },
    { role: "assistant", tool_calls: [{ id: "a" }, { id: "b" }] },
    { role: "tool", tool_call_id: "a", content: "result A" },
    { role: "tool", tool_call_id: "b", content: "result B" },
  ];
  const before = structuredClone(history);
  const result = budgetChatMessages(history, [{ name: "gerar" }], 500);
  assert.deepEqual(result, [history[0], history[1], ...history.slice(4)]);
  assert.ok(estimatedChatTokens({ messages: result, tools: [{ name: "gerar" }] }) <= 500);
  assert.deepEqual(history, before);
});

test("oversized current request fails without silently removing facts or tool results", () => {
  assert.throws(() => budgetChatMessages([{ role: "user", content: "x".repeat(10000) }], [], 100), /chat_context_too_large/);
  assert.throws(() => budgetChatMessages([{ role: "system", content: "policy" }], []), /missing_user/);
});

test("Gemini rewrite joins text parts but excludes thoughts and incomplete responses", () => {
  assert.equal(completeGeminiText({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private" }, { text: "first" }, { text: "second" }] } }] }), "firstsecond");
  for (const finishReason of ["MAX_TOKENS", "SAFETY", undefined]) {
    assert.throws(() => completeGeminiText({ candidates: [{ finishReason, content: { parts: [{ text: "partial" }] } }] }), /incomplete/);
  }
  assert.throws(() => completeGeminiText({ candidates: [{ finishReason: "STOP" }] }), /EMPTY/);
});
