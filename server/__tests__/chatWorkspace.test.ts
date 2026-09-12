import test from "node:test";
import assert from "node:assert/strict";
import { queryChatWorkspace, selectChatProject } from "../chatWorkspace";

const projects = [{ id: 1, name: "Edu" }];
test("project selection requires an explicit existing or new choice", () => {
  assert.throws(() => selectChatProject(projects, {}));
  assert.equal(selectChatProject(projects, { projectId: 1 })?.id, 1);
  assert.throws(() => selectChatProject(projects, { projectId: 2 }));
  assert.throws(() => selectChatProject(projects, { projectId: 1, projectName: "Outro" }));
  assert.throws(() => selectChatProject(projects, { createProject: true, projectName: "Edu" }));
  assert.equal(selectChatProject(projects, { createProject: true, projectName: "Novo" }), null);
});
test("workspace consult is scoped to user and selected project", async () => {
  let campaignReads = 0;
  const store = {
    async getProjectsByUserId(userId: number) { assert.equal(userId, 7); return projects; },
    async getCampaignsByProjectId(id: number) { assert.equal(id, 1); return [{ id: 10, name: "Teste", projectId: 1 }]; },
    async getCampaignById() { campaignReads++; return { id: 99, projectId: 2, name: "Privada" }; },
  };
  const result = await queryChatWorkspace(7, { projectId: 1 }, store);
  assert.equal((result.campaigns as any[])[0].url, "/projects/1/campaign/result/10");
  assert.ok((await queryChatWorkspace(7, { projectId: 2, campaignId: 99 }, store)).erro);
  assert.equal(campaignReads, 0);
  assert.ok((await queryChatWorkspace(7, { projectId: 1, campaignId: 99 }, store)).erro);
});
