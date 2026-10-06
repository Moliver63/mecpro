import test, { before } from "node:test";
import assert from "node:assert/strict";
import { auditCarouselCreatives } from "../carouselAudit";

// Correcao de 06/10: este arquivo inteiro nao rodava. Importar
// campaignPublish.ts no topo puxa `./_core/router` e `./db`, e
// `_core/env.ts` valida o ambiente com Zod no load do modulo — sem
// DATABASE_URL/JWT_SECRET/SESSION_SECRET o import estourava ZodError antes
// do primeiro teste. Resultado: quatro testes de guarda do caminho que
// GASTA DINHEIRO (campanha inexistente, campanha de outro usuario, campanha
// sem conjuntos) estavam mortos, e a suite reportava isso como "1 falha"
// generica de arquivo em vez de cobertura ausente.
//
// Vinha sendo descartado como "ZodError de env no sandbox". Era isso, mas
// nao era so isso: o efeito era perder a cobertura.
//
// Correcao pela convencao que o repo ja usa (ver chatPrecision.test.ts):
// envs minimos de teste num `before` e import dinamico depois. Nenhuma
// mudanca em codigo de producao. Nao conecta em banco nenhum: `getDb()` so
// cria o Pool quando chamado, e estes testes injetam as duas leituras de
// banco por `deps` — nunca tocam no modulo real.
//
// A URL e deliberadamente localhost e os segredos sao literais de teste:
// se algum dia alguem fizer este teste tocar banco de verdade, ele falha
// em localhost em vez de alcancar producao.
let publicarCampanhaNaMeta: typeof import("../campaignPublish").publicarCampanhaNaMeta;
before(async () => {
  process.env.DATABASE_URL   ??= "postgres://localhost:5432/mecpro_test";
  process.env.JWT_SECRET     ??= "campaign-publish-test-secret-0123456789";
  process.env.SESSION_SECRET ??= "campaign-publish-test-secret-0123456789";
  ({ publicarCampanhaNaMeta } = await import("../campaignPublish"));
});

// Achado real (missao "agente conversacional autonomo", Fase 2 — 13/09):
// publicar_campanha reaproveita a MESMA orquestracao ja usada pelo
// publish_campaign do MCP (auditoria de carrossel, resolucao de imagem,
// chamada real na Meta). Os testes abaixo cobrem so os caminhos de
// VALIDACAO que acontecem ANTES de qualquer chamada de rede — nunca
// testam a publicacao de verdade (a missao pede explicitamente pra nao
// publicar nenhuma campanha real durante testes automatizados).

test("publicarCampanhaNaMeta recusa campanha inexistente sem tentar nada mais", async () => {
  const resultado = await publicarCampanhaNaMeta(1, { campaignId: 999, pageId: "123" }, {
    getCampaignById: async () => null,
    getProjectById: async () => null,
  });
  assert.equal(resultado.ok, false);
  assert.match((resultado as any).erro, /não encontrada/i);
});

test("publicarCampanhaNaMeta recusa campanha de outro usuario", async () => {
  const resultado = await publicarCampanhaNaMeta(1, { campaignId: 50, pageId: "123" }, {
    getCampaignById: async () => ({ id: 50, projectId: 10, adSets: "[]", creatives: "[]" }) as any,
    getProjectById: async () => ({ id: 10, userId: 999 }) as any, // dono diferente do userId=1 chamando
  });
  assert.equal(resultado.ok, false);
  assert.match((resultado as any).erro, /não pertence/i);
});

test("publicarCampanhaNaMeta recusa campanha sem conjuntos de anuncios gerados", async () => {
  const resultado = await publicarCampanhaNaMeta(1, { campaignId: 50, pageId: "123" }, {
    getCampaignById: async () => ({ id: 50, projectId: 10, adSets: "[]", creatives: "[]" }) as any,
    getProjectById: async () => ({ id: 10, userId: 1 }) as any,
  });
  assert.equal(resultado.ok, false);
  assert.match((resultado as any).erro, /conjuntos de anúncios/i);
});

// Achado real durante o teste: importar campaignPublish.ts (que precisa
// de appRouter pra publicar de verdade) e exercitar o caminho que chega
// na auditoria expõe um efeito colateral não-determinístico em algo que
// _core/router.ts importa (tentativa assíncrona de conexão com banco,
// que falha com ECONNREFUSED em ambiente de teste sem banco real —
// mesmo sem NENHUMA chamada de rede no código deste teste). Em vez de
// investigar/mexer num arquivo de 14 mil+ linhas só pra viabilizar este
// teste, a mesma auditoria é testada diretamente do módulo leve
// (carouselAudit.ts, sem depender de appRouter) — prova exatamente a
// mesma lógica que publicarCampanhaNaMeta usa por dentro, sem a
// fragilidade de importar o roteador tRPC inteiro num teste unitário.
test("auditCarouselCreatives (usada por publicarCampanhaNaMeta) reprova copy fraca/repetida", () => {
  const resultado = auditCarouselCreatives([
    { headline: "Oi", feedImageUrl: "a.jpg" },
    { headline: "Oi", feedImageUrl: "b.jpg" },
  ]);
  assert.equal(resultado.ok, false);
  assert.ok(resultado.issues.length > 0);
});
