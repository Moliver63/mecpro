import test from "node:test";
import assert from "node:assert/strict";
import { BillingCooldown, CONVERSATION_POLICY, localConversationReply, nullableOptionalFields } from "../chatReasoning";

test("optional null is represented in provider schema without relaxing required amounts", () => {
  const input = { type: "object", properties: { projectId: { type: "integer" }, budget: { type: "number", minimum: 1 } }, required: ["budget"], additionalProperties: false };
  const result = nullableOptionalFields(input);
  assert.deepEqual(result.properties.projectId.anyOf, [{ type: "integer" }, { type: "null" }]);
  assert.deepEqual(result.properties.budget, { type: "number", minimum: 1 });
  assert.equal(result.additionalProperties, false);
  assert.deepEqual(input.properties.projectId, { type: "integer" });
});

test("billing cooldown expires and a replacement key is not blocked", () => {
  let now = 0;
  const cooldown = new BillingCooldown(() => now, 100);
  cooldown.block("test-key-a");
  assert.equal(cooldown.available("test-key-a"), false);
  assert.equal(cooldown.available("test-key-b"), true);
  now = 100;
  assert.equal(cooldown.available("test-key-a"), true);
});

test("offline briefing reports only stored fields and performs no invented completion", () => {
  const reply = localConversationReply("resuma o briefing", { budget: 90, city: "Itajai", privateToken: "SECRET" });
  assert.match(reply, /90/);
  assert.match(reply, /Itajai/);
  assert.doesNotMatch(reply, /SECRET|Duracao/);
  assert.match(localConversationReply("qual o CTR da campanha?", {}), /nao confirmar/);
  assert.match(localConversationReply("briefing", {}), /nao ha/);
});

test("conversation policy separates explanation, evidence and authorized actions", () => {
  assert.match(CONVERSATION_POLICY, /Perguntas gerais/);
  assert.match(CONVERSATION_POLICY, /nao exija projeto/);
  assert.match(CONVERSATION_POLICY, /nao afirme ter pesquisado/);
  assert.match(CONVERSATION_POLICY, /autorizacao explicita/);
});
