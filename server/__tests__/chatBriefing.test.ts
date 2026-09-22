import test from "node:test";
import assert from "node:assert/strict";
import { briefingContext, mergeChatBriefing, campaignResultText, generationErrorText, isLastCampaignLinkRequest } from "../chatBriefing";

test("briefing retains known fields and replaces total budget without multiplying again", () => {
  const previous = { projectId: 97, platform: "meta", objective: "leads", budget: 84, durationDays: 14, ageMin: 30, ageMax: 60, whatsapp: "47999465824" };
  const next = mergeChatBriefing(previous, { budget: 100, unknown: "ignored" });
  assert.deepEqual(next, { ...previous, budget: 100 });
  assert.equal(previous.budget, 84);
});
test("explicit new project clears old ID without losing campaign settings", () => {
  const next = mergeChatBriefing({ projectId: 97, objective: "leads", budget: 100 }, { createProject: true, projectName: "Morebem locp1" });
  assert.equal(next.projectId, undefined);
  assert.equal(next.budget, 100);
  const selected = mergeChatBriefing(next, { projectId: 101 });
  assert.equal(selected.createProject, false);
  assert.equal(selected.projectName, undefined);
});
test("null clears a field and invalid numeric updates do not corrupt it", () => {
  assert.deepEqual(mergeChatBriefing({ budget: 100, city: "BC" }, { budget: NaN, city: null }), { budget: 100 });
});
test("successful result contains authoritative ID/link and no publication claim", () => {
  const text = campaignResultText({ id: 775, projectId: 97, name: "Sala", url: "/projects/97/campaign/result/775", photoCount: 5, coverFileName: "fachada.jpg" });
  assert.match(text, /775/);
  assert.match(text, /Fotos encaminhadas ao gerador: 5/);
  assert.match(text, /fachada.jpg/);
  assert.match(text, /Nada foi publicado/);
});
test("fact errors do not ask users to approve invented claims or change project", () => {
  const text = generationErrorText("FACT_CONFLICT: escritorio");
  assert.match(text, /briefing foi mantido|briefing continua guardado/);
  assert.doesNotMatch(text, /escritorio/);
  assert.equal(generationErrorText("Informe a capa"), "Informe a capa");
});
test("last-link requests do not accidentally regenerate", () => {
  assert.equal(isLastCampaignLinkRequest("me mostra o link"), true);
  assert.equal(isLastCampaignLinkRequest("gerar nova e mandar link"), false);
  assert.equal(isLastCampaignLinkRequest("link da campanha 773"), false);
});
test("concurrent conversations have isolated briefing context", async () => {
  await Promise.all([97, 101].map(projectId => briefingContext.run({ briefing: { projectId } }, async () => {
    await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(briefingContext.getStore()?.briefing.projectId, projectId);
  })));
});
