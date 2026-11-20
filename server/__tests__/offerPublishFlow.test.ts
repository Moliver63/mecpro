import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCampaignFacts } from "../campaignFactGuard";
import { assertCampaignPublishIntegrity } from "../campaignPublishIntegrity";
import { pendenciasLocaisParaPublicar } from "../publishPreflight";
import { resolverDivergenciaNoRascunho } from "../offerDivergenceFix";
import { collectOutgoingCreativeTexts, verificarTextosDeSaida } from "../metaOutgoingTextGuard";
import { adsTurn, publishChatAds } from "../chatAdsTools";

const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
const MCP = readFileSync(new URL("../mcpServer.ts", import.meta.url), "utf8");

// Oferta confirmada das campanhas 799 e 814 (projeto 49): uma aula por R$ 19,90,
// acesso por 7 dias, pagamento unico, sem renovacao automatica. As copies abaixo
// seguem esse formato; as campanhas reais nao sao lidas nem alteradas.
function factsAula(objective = "leads") {
  return buildCampaignFacts({
    input: {
      productName: "Aula de autoconhecimento com Realidade Virtual",
      productService: "Aula completa de autoconhecimento",
      productPrice: "R$ 19,90",
      name: "Shadia Hasan | Aula R$ 19,90",
      objective,
      extraContext: "Pagamento único via PIX, boleto ou cartão. Sem renovação automática.",
    },
    clientProfile: { productService: "Aula de autoconhecimento com exercícios práticos e Realidade Virtual. Acesso por 7 dias." },
    segment: "infoprodutos",
  });
}

const IMG = { feedImageUrl: "https://example.com/a.jpg" };
const criativoOk = (extra: Record<string, unknown> = {}) => ({
  headline: "Aula de autoconhecimento por R$ 19,90",
  description: "Acesso por 7 dias",
  copy: "Uma aula com exercícios práticos e Realidade Virtual. Pagamento único, sem renovação automática.",
  cta: "Quero participar",
  needsReview: false,
  ...IMG,
  ...extra,
});

function campanha(creatives: any[], objective = "leads", id = 814) {
  return {
    id, projectId: 49, name: "Shadia Hasan | Aula", objective,
    adSets: '[{"name":"Conjunto 1","budget":50}]',
    aiResponse: JSON.stringify({ campaignFacts: factsAula(objective) }),
    creatives: JSON.stringify(creatives),
  };
}

test("814: campanha aprovada e coerente com a oferta passa no pre-voo e na integridade", () => {
  const c = campanha([criativoOk(), criativoOk({ headline: "7 dias de acesso à aula por R$ 19,90" })], "leads", 814);
  assert.equal(pendenciasLocaisParaPublicar(c).pendencias?.some((p) => p.tipo === "oferta_divergente"), false);
  assert.doesNotThrow(() => assertCampaignPublishIntegrity(c, { headline: "Aula por R$ 19,90", cta: "Quero participar" }));
});

test("814: criativo ja aprovado (needsReview=false) e revalidado no servidor com o texto enviado", () => {
  const c = campanha([criativoOk()]);
  // O formulario de publicacao manda um texto que nao esta no criativo salvo.
  assert.throws(
    () => assertCampaignPublishIntegrity(c, { headline: "Aula grátis de autoconhecimento" }),
    /CAMPAIGN_INTEGRITY[\s\S]*grátis/,
  );
  assert.throws(() => assertCampaignPublishIntegrity(c, { description: "Acesso por 30 dias" }), /prazo de acesso/);
});

test("799: pre-voo lista campo, trecho, motivo e sugestao; rascunho nao e alterado", () => {
  const criativos = [
    criativoOk(),
    criativoOk({ headline: "Aula grátis", cta: "Acessar aula grátis" }),
    criativoOk({ carouselCards: [{ headline: "Aula única", description: "ok" }, { headline: "Sem pagar nada", description: "Venha agora" }] }),
  ];
  const c = campanha(criativos, "leads", 799);
  const antes = JSON.stringify(c);
  const r1 = pendenciasLocaisParaPublicar(c);
  const r2 = pendenciasLocaisParaPublicar(c);
  assert.equal(JSON.stringify(c), antes, "pre-voo e so leitura: abrir ou fechar a previa nao muda o rascunho");
  assert.deepEqual(r1, r2);
  const p = r1.pendencias!.find((x) => x.tipo === "oferta_divergente")!;
  assert.ok(p, "deve haver pendencia de oferta divergente");
  const d = p.divergencias!;
  const headline = d.find((x) => x.criativo === 1 && x.caminho === "headline")!;
  assert.equal(headline.trecho, "grátis");
  assert.equal(headline.campoRotulo, "Criativo 2 · Título");
  assert.match(headline.motivoTexto, /gratuidade/);
  assert.equal(headline.sugestao?.replaceWith, "por R$ 19,90");
  assert.ok(d.some((x) => x.criativo === 1 && x.caminho === "cta"));
  const card = d.find((x) => x.criativo === 2 && x.caminho === "carouselCards[1].headline")!;
  assert.ok(card, "cartao do carrossel apontado com campo e indice");
  assert.match(card.campoRotulo, /card 2/);
  assert.equal(r1.ok, false);
  assert.deepEqual(p.criativos, [1, 2]);
});

test("aplicar sugestao so salva o texto daquele campo (nao aprova nem publica)", () => {
  const c = campanha([criativoOk({ headline: "Aula grátis", needsReview: false }), criativoOk()], "leads", 799);
  const r = resolverDivergenciaNoRascunho(c, { criativo: 0, caminho: "headline", modo: "sugestao" });
  assert.equal(r.ok, true);
  assert.equal(r.creatives![0].headline, "Aula por R$ 19,90");
  assert.deepEqual({ ...r.creatives![0], headline: "" }, { ...JSON.parse(c.creatives)[0], headline: "" }, "outros campos intactos");
  assert.deepEqual(r.creatives![1], JSON.parse(c.creatives)[1], "outros criativos intactos");
  const depois = { ...c, creatives: JSON.stringify(r.creatives) };
  assert.equal(pendenciasLocaisParaPublicar(depois).pendencias?.some((p) => p.tipo === "oferta_divergente"), false);
});

test("edicao manual grava o texto digitado e recusa caminho invalido, vazio e nao-texto", () => {
  const c = campanha([criativoOk({ headline: "Aula grátis" })], "leads", 799);
  const ok = resolverDivergenciaNoRascunho(c, { criativo: 0, caminho: "headline", modo: "manual", novoTexto: "Conheça a aula completa" });
  assert.equal(ok.ok, true);
  assert.equal(ok.creatives![0].headline, "Conheça a aula completa");
  assert.equal(resolverDivergenciaNoRascunho(c, { criativo: 0, caminho: "headline", modo: "manual", novoTexto: "   " }).ok, false);
  assert.equal(resolverDivergenciaNoRascunho(c, { criativo: 0, caminho: "__proto__.x", modo: "manual", novoTexto: "x" }).ok, false);
  assert.equal(resolverDivergenciaNoRascunho(c, { criativo: 0, caminho: "needsReview", modo: "manual", novoTexto: "x" }).ok, false);
  assert.equal(resolverDivergenciaNoRascunho(c, { criativo: 9, caminho: "headline", modo: "manual", novoTexto: "x" }).ok, false);
});

test("sem fato confirmado para trocar: pede confirmacao da oferta em vez de inventar", () => {
  const semPreco = {
    id: 5, projectId: 1, name: "Consultoria", objective: "leads", adSets: "[{}]",
    aiResponse: JSON.stringify({ campaignFacts: buildCampaignFacts({ input: { productName: "Consultoria financeira", objective: "leads" }, clientProfile: {}, segment: "servicos" }) }),
    creatives: JSON.stringify([criativoOk({ headline: "Diagnóstico grátis para sua empresa", description: "Fale conosco", copy: "Consultoria para pequenas empresas.", cta: "Quero saber mais" })]),
  };
  const p = pendenciasLocaisParaPublicar(semPreco).pendencias!.find((x) => x.tipo === "oferta_divergente")!;
  assert.equal(p.divergencias![0].sugestao, null);
  assert.equal(p.divergencias![0].precisaConfirmarOferta, true);
  assert.equal(resolverDivergenciaNoRascunho(semPreco, { criativo: 0, caminho: "headline", modo: "sugestao" }).ok, false);
});

test("texto final enviado a Meta e revalidado: reescrita depois da aprovacao e barrada", () => {
  const c = campanha([criativoOk()]);
  // Persona/auditoria transformaram o titulo depois da integridade dos criativos.
  const r = verificarTextosDeSaida(c, [
    { path: "headline", text: "Aula grátis para você" },
    { path: "description", text: "Conheça a oferta" },
    { path: "message", text: "Aula por R$ 19,90. Acesso por 7 dias." },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /headline/);
  assert.equal(verificarTextosDeSaida(c, [{ path: "description", text: "Conheça a oferta" }]).ok, true);
  assert.equal(verificarTextosDeSaida(c, [{ path: "description", text: "Condições especiais hoje" }]).ok, false, "fallback antigo de vendas");
});

test("corpo do criativo: coleta titulo, texto, carrossel e variacoes; ignora token, link e nome interno", () => {
  const body = {
    name: "MecPro | interno",
    access_token: "segredo",
    object_story_spec: {
      page_id: "1",
      link_data: {
        message: "Texto principal", name: "Titulo", description: "Descricao", link: "https://x.com",
        child_attachments: [{ name: "Card 1", description: "D1", link: "https://x.com", picture: "https://x.com/p.jpg" }],
        call_to_action: { type: "LEARN_MORE" },
      },
    },
    asset_feed_spec: { bodies: [{ text: "Corpo A" }, { text: "Corpo B" }], titles: [{ text: "Titulo A" }] },
  };
  const textos = collectOutgoingCreativeTexts(body).map((t) => t.text).sort();
  assert.deepEqual(textos, ["Card 1", "Corpo A", "Corpo B", "D1", "Descricao", "Texto principal", "Titulo", "Titulo A"].sort());
  assert.ok(!JSON.stringify(textos).includes("segredo"));
});

// Chat: usa Meta simulada (`publish`) e reserva em memoria.
function fixtureChat(creatives: any[]) {
  let calls = 0;
  let reservas = 0;
  let reservation: any;
  const campaign = { ...campanha(creatives, "leads", 12) };
  const db = {
    getCampaignById: async () => campaign,
    getProjectById: async () => ({ userId: 1 }),
    getUserById: async () => ({ id: 1 }),
    getCampaignMetricsDaily: async () => [],
    reserveMcpIdempotencyKey: async () => {
      reservas++;
      if (reservation) return reservation;
      reservation = { kind: "duplicate_in_progress" };
      return { kind: "proceed", recordId: 1 };
    },
    completeMcpIdempotencyKey: async (_id: number, result: any) => { reservation = { kind: "cached_result", result }; },
    failMcpIdempotencyKey: async () => { reservation = undefined; },
    publish: async () => { calls++; return { ok: true }; },
    caller: { unified: { getFullReport: async () => ({ meta: { configured: false } }) } },
  };
  return { db, calls: () => calls, reservas: () => reservas };
}
const optsChat = { campaignId: 12, pageId: "123", linkUrl: "https://example.com" };

test("chat: divergencia de oferta recusa antes do token e sem gastar reserva", async () => {
  const f = fixtureChat([criativoOk({ headline: "Aula grátis" })]);
  const r: any = await publishChatAds(1, optsChat, f.db);
  assert.equal(r.ok, false);
  assert.notEqual(r.confirmationRequired, true);
  assert.ok(r.pendencias.some((p: any) => p.tipo === "oferta_divergente"));
  assert.equal(f.reservas(), 0);
  assert.equal(f.calls(), 0);
});

test("chat: 814 valida exige confirmacao explicita e clique duplo publica uma vez", async () => {
  const f = fixtureChat([criativoOk()]);
  const previa: any = await adsTurn.run({ message: "pode publicar" }, () => publishChatAds(1, optsChat, f.db));
  assert.equal(previa.confirmationRequired, true);
  assert.equal(f.calls(), 0, "a previa nao publica");
  const previa2: any = await adsTurn.run({ message: "pode publicar" }, () => publishChatAds(1, optsChat, f.db));
  assert.equal(previa2.confirmationRequired, true, "abrir a previa de novo nao consome nada");
  const message = previa.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  await adsTurn.run({ message }, () => Promise.all([publishChatAds(1, optsChat, f.db), publishChatAds(1, optsChat, f.db)]));
  assert.equal(f.calls(), 1);
  await adsTurn.run({ message }, () => publishChatAds(1, optsChat, f.db));
  assert.equal(f.calls(), 1, "nova tentativa nao duplica");
});

test("chat: editar o rascunho depois da previa invalida a confirmacao", async () => {
  const f = fixtureChat([criativoOk()]);
  const previa: any = await publishChatAds(1, optsChat, f.db);
  const message = previa.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  const alterado = { ...f.db, getCampaignById: async () => campanha([criativoOk({ headline: "Aula por R$ 19,90 hoje" })], "leads", 12) };
  const r: any = await adsTurn.run({ message }, () => publishChatAds(1, optsChat, alterado));
  assert.equal(r.confirmationRequired, true);
});

test("MCP: publish_campaign valida e exige token ANTES de reservar a idempotencyKey", () => {
  const i = MCP.indexOf('registerTool(\n    "publish_campaign"');
  assert.ok(i > 0);
  const bloco = MCP.slice(i, i + 12000);
  const iToken = bloco.indexOf("confirmationToken");
  const iPreflight = bloco.indexOf("preflightMcp(campaign)");
  const iReserva = bloco.indexOf('reserveMcpIdempotencyKey(userId, "publish_campaign"');
  assert.ok(iToken > 0 && iPreflight > 0 && iReserva > 0);
  assert.ok(iPreflight < iReserva, "pre-voo antes da reserva");
  assert.ok(bloco.indexOf("input.confirmationToken !== token") < iReserva, "token conferido antes da reserva");
  assert.match(bloco, /Nada foi publicado/);
});

test("publishToMeta (tela): reserva anti-duplicidade antes do status e revalida o texto final", () => {
  const i = ROTA.indexOf("publishToMeta: protectedProcedure");
  const bloco = ROTA.slice(i, i + 260000);
  assert.ok(bloco.indexOf('"ui_meta_publish"') > 0);
  assert.ok(bloco.indexOf('"ui_meta_publish"') < bloco.indexOf('publishStatus: "processing"'), "reserva antes de escrever status");
  assert.match(bloco, /duplicate_in_progress/);
  assert.match(bloco, /liberarReservaUi/);
  const iGate = bloco.indexOf("assertOutgoingMetaTexts(c, [");
  assert.ok(iGate > 0, "gate dos textos auditados");
  assert.ok(iGate < bloco.indexOf("}/campaigns`"), "gate roda antes de criar a campanha na Meta");
  const iUltima = bloco.indexOf("collectOutgoingCreativeTexts(creativeBody)");
  assert.ok(iUltima > 0, "gate de ultima linha presente");
  assert.ok(iUltima < bloco.indexOf("}/adcreatives`", iUltima), "ultima linha antes de enviar o criativo");
});

test("goldfish: ultima linha so bloqueia promessa comercial; texto de sistema de carrossel nao orfana a Meta", () => {
  const c = campanha([criativoOk()]);
  const corpo = [{ path: "child_attachments[9].description", text: "Últimas unidades" }, { path: "child_attachments[8].description", text: "Lazer exclusivo" }];
  assert.equal(verificarTextosDeSaida(c, corpo, { somenteOferta: true }).ok, true);
  assert.equal(verificarTextosDeSaida(c, [{ path: "child_attachments[1].name", text: "Aula grátis" }], { somenteOferta: true }).ok, false);
  assert.match(ROTA, /collectOutgoingCreativeTexts\(creativeBody\), \{ somenteOferta: true \}/);
});

test("goldfish: edicao manual so em campo de copy (nunca URL ou id)", () => {
  const c = campanha([criativoOk({ imageUrl: "https://example.com/x.jpg" })]);
  assert.equal(resolverDivergenciaNoRascunho(c, { criativo: 0, caminho: "imageUrl", modo: "manual", novoTexto: "https://evil.com" }).ok, false);
  assert.equal(resolverDivergenciaNoRascunho(c, { criativo: 0, caminho: "feedImageUrl", modo: "manual", novoTexto: "x" }).ok, false);
});
