import test from "node:test";
import assert from "node:assert/strict";
import { missingCampaignIntake, CAMPAIGN_INTAKE_POLICY } from "../chatIntake";
import { queryChatWorkspace } from "../chatWorkspace";
import { CONVERSATION_POLICY } from "../chatReasoning";
import { COMPACT_CHAT_POLICY } from "../chatRequestBudget";

test("intake groups missing fields without repeating confirmed facts", () => {
  assert.ok(missingCampaignIntake({}).length > 3);
  const missing = missingCampaignIntake({ budget: 1500, durationDays: 30, objective: "leads", city: "Itajai" }).join(" ");
  assert.doesNotMatch(missing, /Orcamento|Duracao|Objetivo|Cidade/);
  assert.match(missing, /Produto/);
  assert.ok(CONVERSATION_POLICY.includes(CAMPAIGN_INTAKE_POLICY));
  assert.ok(COMPACT_CHAT_POLICY.includes(CAMPAIGN_INTAKE_POLICY));
});

test("workspace offers owned projects and three distinct campaign actions", async () => {
  const store = {
    async getProjectsByUserId(id: number) { assert.equal(id, 8); return [{ id: 7, name: "Loja" }]; },
    async getCampaignsByProjectId(id: number) { assert.equal(id, 7); return [{ id: 9, name: "Oferta", suggestedBudgetDaily: 50, durationDays: 30 }]; },
    async getCampaignById() { return { id: 9, projectId: 7, name: "Oferta" }; },
    async updateCampaignField() { throw new Error("read only"); },
  };
  assert.deepEqual((await queryChatWorkspace(8, {}, store)).options, ["existing_project", "new_project"]);
  const result = await queryChatWorkspace(8, { projectId: 7 }, store);
  assert.deepEqual(result.options, ["new_campaign", "use_as_template", "edit_campaign"]);
  assert.equal((result.campaigns as any[])[0].durationDays, 30);
  assert.equal((result.campaigns as any[])[0].suggestedBudgetDaily, 50);
  assert.ok((await queryChatWorkspace(8, { projectId: 10 }, store)).erro);
  assert.match(String((await queryChatWorkspace(8, { projectId: 7, campaignId: 9 }, store)).templatePolicy), /nao importe fotos/i);
  store.getCampaignsByProjectId = async () => [];
  assert.deepEqual((await queryChatWorkspace(8, { projectId: 7 }, store)).options, ["new_campaign"]);
});
