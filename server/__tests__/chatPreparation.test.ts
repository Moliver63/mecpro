import test from "node:test";
import assert from "node:assert/strict";
import { prepareChatWithoutAI } from "../chatPreparation";
import type { ChatBriefingState } from "../chatBriefing";

const store = { async getProjectsByUserId(id: number) { assert.equal(id, 8); return [{ id: 7, name: "Loja" }]; } };

test("ordinary conversation does not access storage or start preparation", async () => {
  const state: ChatBriefingState = { briefing: {} };
  assert.equal(await prepareChatWithoutAI("qual o CTR?", state, 8, { async getProjectsByUserId() { throw new Error("unexpected query"); } }), null);
  assert.equal(state.preparation, undefined);
});

test("offline preparation reuses briefing without generating a campaign", async () => {
  const state: ChatBriefingState = { briefing: {} };
  assert.match((await prepareChatWithoutAI("Preparar campanha", state, 8, store))!, /Loja/);
  const reply = await prepareChatWithoutAI("Projeto: Loja\nOferta: Doces\nObjetivo: contatos\nPlataforma: Meta\nRegiao: Itajai\nPublico: moradores\nOrcamento total: 1500,00\nDuracao: 30\nWhatsApp: 47999999999\nFormato: carrossel", state, 8, store);
  assert.equal(state.briefing.projectId, 7);
  assert.equal(state.briefing.budget, 1500);
  assert.equal(state.briefing.objective, "leads");
  assert.equal(state.preparation?.status, "awaiting_ai");
  assert.match(reply!, /Nenhuma campanha foi criada/);
  assert.equal(state.lastCampaign, undefined);
  await prepareChatWithoutAI("/sair", state, 8, store);
  assert.equal(state.preparation, undefined);
  assert.equal(state.briefing.budget, 1500);
});

test("bad input is atomic and cannot select a foreign project or infer money", async () => {
  const state: ChatBriefingState = { briefing: { budget: 10 }, preparation: { status: "collecting" } };
  for (const message of ["Projeto: Privado\nOferta: outra", "Orcamento total: 1.500", "Duracao: 0", "publicar: sim"]) {
    assert.match((await prepareChatWithoutAI(message, state, 8, store))!, /Nao alterei/);
    assert.deepEqual(state.briefing, { budget: 10 });
  }
});

test("switching project discards previous offer and new project is only a preference", async () => {
  const state: ChatBriefingState = { briefing: { projectId: 1, projectName: "Outro", confirmedFacts: "190 m2" }, preparation: { status: "collecting" } };
  await prepareChatWithoutAI("Novo projeto: Padaria Aurora\nOferta: Paes", state, 8, store);
  assert.equal(state.briefing.createProject, true);
  assert.equal(state.briefing.projectId, undefined);
  assert.equal(state.briefing.confirmedFacts, undefined);
  assert.equal(state.briefing.productService, "Paes");
});
