import test from "node:test";
import assert from "node:assert/strict";
import { parseDailyBudget, formatDailyBudget } from "../../shared/dailyBudget";
import { atualizarOrcamentoCampanha, selectChatProject } from "../chatWorkspace";

test("daily budget is explicit and round trips without becoming monthly or percentage", () => {
  for (const [raw, expected] of [["6", 6], ["R$ 6,50", 6.5], ["6.50", 6.5], ["1.000,00", 1000], [6, 6]] as const) {
    assert.equal(parseDailyBudget(raw), expected);
    assert.equal(parseDailyBudget(formatDailyBudget(expected)), expected);
  }
  for (const raw of ["6%", "R$ 180/mes", "-6", "0", "6 reais ou 10", "1e3", "6,123", NaN, Infinity, true, ""]) assert.equal(parseDailyBudget(raw), null);
});
test("invalid edit never writes and cannot default to a different ad set", async () => {
  let writes = 0;
  const store = {
    async getProjectsByUserId() { return [{ id: 1 }]; },
    async getCampaignById() { return { id: 2, projectId: 1, adSets: '[{"budget":"10"}]' }; },
    async getCampaignsByProjectId() { return []; },
    async updateCampaignField() { writes++; },
  };
  for (const patch of [{ budgetDaily: "6%" }, { budgetDaily: "-5" }, { budgetDaily: "6", adSetIndex: "oops" }, { budgetDaily: "6", adSetIndex: true }, { objective: "anything" }]) {
    assert.ok((await atualizarOrcamentoCampanha(1, { campaignId: 2, ...patch }, store)).erro);
  }
  assert.equal(writes, 0);
});
test("similar project can be explicitly confirmed, exact duplicate still blocked", () => {
  const projects = [{ id: 1, name: "Morebem Sala Comercial" }];
  assert.throws(() => selectChatProject(projects, { createProject: true, projectName: "Morebem" }));
  assert.equal(selectChatProject(projects, { createProject: true, projectName: "Morebem", confirmDistinctProject: true }), null);
  assert.throws(() => selectChatProject(projects, { createProject: true, projectName: projects[0].name, confirmDistinctProject: true }));
});
