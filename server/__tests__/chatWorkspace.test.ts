import test from "node:test";
import assert from "node:assert/strict";
import { queryChatWorkspace, selectChatProject, nomesDeProjetoParecidos, atualizarOrcamentoCampanha, definirFotoDestaque } from "../chatWorkspace";

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
    async updateCampaignField() { throw new Error("nao deveria ser chamado neste teste (so leitura)"); },
  };
  const result = await queryChatWorkspace(7, { projectId: 1 }, store);
  assert.equal((result.campaigns as any[])[0].url, "/projects/1/campaign/result/10");
  assert.ok((await queryChatWorkspace(7, { projectId: 2, campaignId: 99 }, store)).erro);
  assert.equal(campaignReads, 0);
  assert.ok((await queryChatWorkspace(7, { projectId: 1, campaignId: 99 }, store)).erro);
});

// Achado real (missao "agente conversacional autonomo", 13/09): sem
// detalhe de criativos/conjuntos de anuncios na consulta, o modelo nao
// tinha como resolver "a fachada e a principal" (precisa saber os
// indices reais dos criativos existentes).
test("queryChatWorkspace com campaignId inclui indices de criativos e conjuntos de anuncios", async () => {
  const store = {
    async getProjectsByUserId() { return [{ id: 1, name: "Edu" }]; },
    async getCampaignsByProjectId() { return []; },
    async getCampaignById() {
      return {
        id: 10, projectId: 1, name: "Campanha", status: "draft", objective: "leads",
        creatives: JSON.stringify([{ headline: "Fachada do prédio", isFeaturedPhoto: false, feedImageUrl: "x.jpg" }, { headline: "Interior", isFeaturedPhoto: true }]),
        adSets: JSON.stringify([{ name: "Principal", budget: "10", audience: "Empresários" }]),
      };
    },
    async updateCampaignField() { throw new Error("nao deveria ser chamado (so leitura)"); },
  };
  const result = await queryChatWorkspace(1, { projectId: 1, campaignId: 10 }, store);
  const creatives = result.creatives as any[];
  assert.equal(creatives.length, 2);
  assert.equal(creatives[0].index, 0);
  assert.equal(creatives[0].headline, "Fachada do prédio");
  assert.equal(creatives[0].hasImage, true);
  assert.equal(creatives[1].isFeaturedPhoto, true);
  const adSets = result.adSets as any[];
  assert.equal(adSets[0].budget, "10");
});

// Achado real: o chat so tinha ferramenta de LEITURA e de CRIACAO — nao
// tinha nenhuma forma de editar uma campanha ja criada. O proprio
// SYSTEM_PROMPT ja admitia essa limitacao. Estas duas funcoes reaproveitam
// a mesma logica ja usada pelos procedimentos tRPC equivalentes.
test("atualizarOrcamentoCampanha atualiza o conjunto certo e respeita posse da campanha", async () => {
  const campanhaDoUsuario1 = { id: 50, projectId: 1, adSets: JSON.stringify([{ name: "Principal", budget: "10" }]) };
  const campanhaDeOutroUsuario = { id: 51, projectId: 999, adSets: JSON.stringify([{ name: "Principal", budget: "10" }]) };
  let campoAtualizado: string | null = null;
  let valorSalvo: string | null = null;
  const store = {
    async getProjectsByUserId(userId: number) { assert.equal(userId, 1); return [{ id: 1, name: "Edu" }]; },
    async getCampaignsByProjectId() { return []; },
    async getCampaignById(id: number) { return id === 50 ? campanhaDoUsuario1 : campanhaDeOutroUsuario; },
    async updateCampaignField(id: number, field: string, value: string) { campoAtualizado = field; valorSalvo = value; },
  };

const ok = await atualizarOrcamentoCampanha(1, { campaignId: 50, budgetDaily: "6" }, store);
  assert.equal((ok as any).ok, true);
  assert.equal(campoAtualizado, "adSets");
  assert.ok(valorSalvo && JSON.parse(valorSalvo)[0].budget === "6");

  // Campanha de outro usuário — não deve editar, mesmo com campaignId válido.
  const negado = await atualizarOrcamentoCampanha(1, { campaignId: 51, budgetDaily: "6" }, store);
  assert.ok((negado as any).erro);

  // Nenhum campo informado — erro claro, não silencioso.
  const semCampo = await atualizarOrcamentoCampanha(1, { campaignId: 50 }, store);
  assert.ok((semCampo as any).erro);
});

test("definirFotoDestaque marca o indice certo como destaque e desmarca os demais", async () => {
  const campanha = { id: 60, projectId: 1, creatives: JSON.stringify([{ headline: "A", isFeaturedPhoto: true }, { headline: "Fachada", isFeaturedPhoto: false }]) };
  let valorSalvo: string | null = null;
  const store = {
    async getProjectsByUserId() { return [{ id: 1, name: "Edu" }]; },
    async getCampaignsByProjectId() { return []; },
    async getCampaignById() { return campanha; },
    async updateCampaignField(_id: number, _field: string, value: string) { valorSalvo = value; },
  };

const ok = await definirFotoDestaque(1, { campaignId: 60, creativeIndex: 1 }, store);
  assert.equal((ok as any).ok, true);
  const salvo = JSON.parse(valorSalvo!);
  assert.equal(salvo[0].isFeaturedPhoto, false);
  assert.equal(salvo[1].isFeaturedPhoto, true);

  // Índice inexistente — erro claro, com a lista de opções disponíveis pro modelo perguntar de novo.
  const invalido = await definirFotoDestaque(1, { campaignId: 60, creativeIndex: 9 }, store);
  assert.ok((invalido as any).erro);
  assert.equal((invalido as any).fotosDisponiveis.length, 2);
});
