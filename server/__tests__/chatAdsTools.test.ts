import { test } from "node:test";
import assert from "node:assert/strict";
import { adsTurn, queryChatAds, publishChatAds } from "../chatAdsTools";

function fixture() {
  let calls = 0;
  let reservation: any;
  // `creatives` com imagem entrou em 15/10: `publishChatAds` passou a checar as
  // pendencias locais ANTES de emitir o token de confirmacao, e campanha sem
  // imagem nenhuma nao e publicavel. O fixture nunca tinha `creatives` porque o
  // codigo antigo nao olhava os criativos antes do token — e era justamente
  // esse o defeito: o token era emitido para campanha impossivel de publicar.
  const campaign = {
    id: 12, projectId: 4, name: "Teste", adSets: '[{"budget":50}]',
    creatives: JSON.stringify([{ headline: "Planejamento financeiro com quem entende", description: "Fale com a equipe", copy: "Converse com um especialista sobre o seu caso e receba um plano.", feedImageUrl: "https://res.cloudinary.com/x/a.png" }]),
  };
  const db = {
    getCampaignById: async () => campaign,
    getProjectById: async () => ({ userId: 1 }),
    getUserById: async () => ({ id: 1 }),
    getCampaignMetricsDaily: async () => [],
    reserveMcpIdempotencyKey: async () => {
      if (reservation) return reservation;
      reservation = { kind: "duplicate_in_progress" };
      return { kind: "proceed", recordId: 1 };
    },
    completeMcpIdempotencyKey: async (_id: number, result: any) => { reservation = { kind: "cached_result", result }; },
    publish: async () => { calls++; return { ok: true }; },
    caller: { unified: { getFullReport: async () => ({ meta: { configured: false } }) } },
  };
  return { db, campaign, calls: () => calls };
}
const options = { campaignId: 12, pageId: "123", linkUrl: "https://example.com" };

test("automatic page resolution preserves confirmation and ownership", async () => {
  const f = fixture();
  let pageId = "123";
  let lookups = 0;
  let sent: any;
  const deps = { ...f.db,
    listPages: async () => { lookups++; return { ok: true, pages: [{ pageId, name: "Empresa" }] }; },
    publish: async (_user: number, value: any) => { sent = value; return { ok: true }; },
  };
  const input = { campaignId: 12, linkUrl: options.linkUrl };
  await publishChatAds(2, input, deps);
  assert.equal(lookups, 0);
  const preview = await publishChatAds(1, input, deps);
  assert.equal(preview.pageName, "Empresa");
  assert.equal(preview.confirmationRequired, true);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  pageId = "456";
  assert.equal((await adsTurn.run({ message }, () => publishChatAds(1, input, deps))).confirmationRequired, true);
  assert.equal(sent, undefined);
  pageId = "123";
  await adsTurn.run({ message }, () => publishChatAds(1, { ...input, pageId }, deps));
  assert.equal(sent.pageId, "123");
});

test("multiple or missing pages cannot reserve or publish", async () => {
  const f = fixture();
  let pages = [{ pageId: "123", name: "A" }, { pageId: "456", name: "B" }];
  let reservations = 0;
  const deps = { ...f.db,
    listPages: async () => ({ ok: true, pages }),
    reserveMcpIdempotencyKey: async () => { reservations++; throw new Error("unexpected"); },
  };
  const input = { ...options, pageId: "" };
  assert.equal((await publishChatAds(1, input, deps)).paginas.length, 2);
  pages = [];
  assert.match((await publishChatAds(1, input, deps)).erro, /Nenhuma Pagina/);
  assert.equal(reservations, 0);
  assert.equal(f.calls(), 0);
});

test("metrics enforce ownership, period and no-data semantics", async () => {
  const { db } = fixture();
  assert.ok((await queryChatAds("consultar_metricas_campanha", { campaignId: 12 }, 2, db)).erro);
  assert.ok((await queryChatAds("consultar_metricas_campanha", { campaignId: 12, days: 91 }, 1, db)).erro);
  assert.equal((await queryChatAds("consultar_metricas_campanha", { campaignId: 12 }, 1, db)).status, "no_data");
  assert.ok((await queryChatAds("consultar_relatorio_anuncios", { platforms: ["fake"] }, 1, db)).erro);
  const result = await queryChatAds("consultar_relatorio_anuncios", {}, 1, db);
  assert.equal(result.report.meta.configured, false);
});

test("publication requires current exact confirmation and executes once", async () => {
  const f = fixture();
  const preview = await adsTurn.run({ message: "pode publicar" }, () => publishChatAds(1, options, f.db));
  assert.equal(preview.confirmationRequired, true);
  assert.equal(f.calls(), 0);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  await adsTurn.run({ message }, () => Promise.all([publishChatAds(1, options, f.db), publishChatAds(1, options, f.db)]));
  assert.equal(f.calls(), 1);
  await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  assert.equal(f.calls(), 1);
});

test("changed budget invalidates confirmation; foreign campaigns and implicit destinations denied", async () => {
  const f = fixture();
  const preview = await publishChatAds(1, options, f.db);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  f.campaign.adSets = '[{"budget":100}]';
  const result = await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  assert.equal(result.confirmationRequired, true);
  assert.equal((await publishChatAds(2, options, f.db)).ok, false);
  assert.equal((await publishChatAds(1, { ...options, linkUrl: undefined }, f.db)).ok, false);
  assert.equal(f.calls(), 0);
});

test("uncertain publication never reopens reservation", async () => {
  const f = fixture();
  f.db.publish = async () => { throw new Error("network"); };
  const preview = await publishChatAds(1, options, f.db);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  const retry = await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  assert.match(retry.erro, /ja solicitada/);
});

// Achado real (15/10, campanha 799): o chat mandou o Michel clicar em Publicar
// numa campanha que o servidor ia recusar por falta de imagem nos criativos. A
// checagem existia dentro de `publicarCampanhaNaMeta`, mas rodava DEPOIS do
// token de confirmacao: ele confirmaria pra receber a recusa, e a reserva de
// idempotencia seria gasta no caminho.
test("campanha sem imagem e recusada antes do token, sem gastar reserva", async () => {
  const f = fixture();
  let reservas = 0;
  const deps = {
    ...f.db,
    getCampaignById: async () => ({ id: 12, projectId: 4, name: "Teste", adSets: '[{"budget":50}]', creatives: "[]" }),
    reserveMcpIdempotencyKey: async () => { reservas++; return { kind: "proceed", recordId: 1 }; },
  };
  const r: any = await publishChatAds(1, options, deps);
  assert.equal(r.ok, false);
  assert.match(r.erro, /Nenhuma imagem encontrada/);
  assert.equal(r.confirmationRequired, undefined, "nao pede confirmacao do impossivel");
  assert.doesNotMatch(String(r.erro), /CONFIRMAR PUBLICACAO/, "nao emite token");
  assert.equal(reservas, 0, "nao reserva idempotencia para pendencia local");
});

test("campanha sem conjunto de anuncios tambem para antes do token", async () => {
  const f = fixture();
  const deps = { ...f.db, getCampaignById: async () => ({ id: 12, projectId: 4, name: "Teste", adSets: "[]", creatives: "[]" }) };
  const r: any = await publishChatAds(1, options, deps);
  assert.match(r.erro, /conjuntos de anúncios/);
});

// A outra metade: falha que NAO tocou na Meta precisa liberar a reserva, senao a
// campanha fica trancada pra sempre neste caminho — `reserveMcpIdempotencyKey`
// devolve `cached_result` em toda tentativa seguinte, e "sem imagem" viraria a
// resposta eterna mesmo depois de a imagem existir.
test("pendencia local no publish libera a reserva em vez de cachear", async () => {
  const f = fixture();
  let completou = 0;
  let liberou = 0;
  const deps = {
    ...f.db,
    completeMcpIdempotencyKey: async () => { completou++; },
    failMcpIdempotencyKey: async () => { liberou++; },
    publish: async () => ({ ok: false, erro: "Nenhuma imagem encontrada nos criativos", antesDeTocarNaMeta: true }),
  };
  const preview = await publishChatAds(1, options, deps);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)![0];
  const r: any = await adsTurn.run({ message }, () => publishChatAds(1, options, deps));
  assert.equal(r.ok, false);
  assert.equal(liberou, 1, "falha pre-Meta libera a reserva");
  assert.equal(completou, 0, "e nao cacheia como resultado final");
});

// Conservador por omissao: sem a marca, assume que a Meta pode ter sido tocada.
test("falha sem a marca pre-Meta mantem a reserva", async () => {
  const f = fixture();
  let completou = 0;
  let liberou = 0;
  const deps = {
    ...f.db,
    completeMcpIdempotencyKey: async () => { completou++; },
    failMcpIdempotencyKey: async () => { liberou++; },
    publish: async () => ({ ok: false, erro: "Meta recusou o anuncio" }),
  };
  const preview = await publishChatAds(1, options, deps);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)![0];
  await adsTurn.run({ message }, () => publishChatAds(1, options, deps));
  assert.equal(completou, 1, "sem a marca, o resultado e final");
  assert.equal(liberou, 0);
});
