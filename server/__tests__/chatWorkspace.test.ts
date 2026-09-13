import test from "node:test";
import assert from "node:assert/strict";
import { queryChatWorkspace, selectChatProject, nomesDeProjetoParecidos } from "../chatWorkspace";

const projects = [{ id: 1, name: "Edu" }];
test("project selection requires an explicit existing or new choice", () => {
  assert.throws(() => selectChatProject(projects, {}));
  assert.equal(selectChatProject(projects, { projectId: 1 })?.id, 1);
  assert.throws(() => selectChatProject(projects, { projectId: 2 }));
  assert.throws(() => selectChatProject(projects, { projectId: 1, projectName: "Outro" }));
  assert.throws(() => selectChatProject(projects, { createProject: true, projectName: "Edu" }));
  assert.equal(selectChatProject(projects, { createProject: true, projectName: "Novo" }), null);
});

// Achado real (conversa colada por Michel, 13/09): a mesma propriedade
// fisica acumulou 3 projetos quase-identicos em conversas anteriores por
// pequena variacao de digitacao no nome — a deduplicacao so pegava nome
// EXATO. Casos abaixo replicam os nomes reais dessa conversa.
test("nomesDeProjetoParecidos detecta variacoes reais sem falso positivo entre negocios diferentes", () => {
  assert.equal(nomesDeProjetoParecidos("Sala Comercial Rua 902", "sala comercial da rua 902"), true);
  assert.equal(nomesDeProjetoParecidos("Morebem Imóveis — Sala Comercial Rua 902", "Morebem"), true);
  assert.equal(nomesDeProjetoParecidos("Sala Comercial Rua 902", "Sl comercial"), true);
  assert.equal(nomesDeProjetoParecidos("Sala Comercial Rua 902", "Padaria do João"), false);
  assert.equal(nomesDeProjetoParecidos("Clínica Odontológica Sorriso", "Loja de Roupas Elegance"), false);
});

test("selectChatProject avisa sobre projeto parecido ao criar um novo, sem bloquear nome exato ja coberto", () => {
  const existentesReais = [
    { id: 97, name: "Morebem Imóveis — Sala Comercial Rua 902" },
    { id: 103, name: "Sala Comercial Rua 902" },
    { id: 104, name: "sala comercial da rua 902" },
  ];
  assert.throws(
    () => selectChatProject(existentesReais, { createProject: true, projectName: "Sl comercial" }),
    /projeto parecido/
  );
  // Nome genuinamente diferente continua criando normalmente (retorna null).
  assert.equal(selectChatProject(existentesReais, { createProject: true, projectName: "Padaria do João" }), null);
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
