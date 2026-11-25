/**
 * Permissoes do TikTok Ads (25/11): "TikTok [pixel/list/] 40001: advertiser does not grant you
 * /pixel/list/:GET permission". Cada cenario de falha com a sua classificacao e instrucao.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classificarErroTikTok, diagnosticarPixels, diagnosticarTikTok, disparosDoEvento, permissaoDoEndpoint, resumoDoDiagnostico } from "../tiktokDiagnostico";
import { ErroTikTok, type ClienteTikTok } from "../tiktokPublicar";
import { validarPublicacaoTikTok } from "../tiktokValidacao";
import { lerRespostaTokenAds } from "../tiktokMarketingAuth";
import { publicarNoTikTokDoChat, limparPropostasTikTok, diagnosticarTikTokDoChat, type DepsTikTokChat } from "../chatTikTok";

const ERRO_REAL = new ErroTikTok("pixel/list/", 40001, "advertiser does not grant you /pixel/list/:GET permission", "REQ1");

// Conta falsa configuravel: cada endpoint devolve dado ou lanca o erro indicado.
function conta(respostas: Record<string, any>): ClienteTikTok & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    get: async (path: string) => {
      chamadas.push(path);
      const r = respostas[path];
      if (r instanceof Error) throw r;
      if (r === undefined) throw new Error("inesperado " + path);
      return typeof r === "function" ? r() : r;
    },
    post: async (p: string) => { chamadas.push(p); throw new Error("diagnostico nao cria nada: " + p); },
  } as any;
}
const okBase = {
  "oauth2/advertiser/get/": { list: [{ advertiser_id: "7620542434560344082" }] },
  "advertiser/info/": { list: [{ currency: "BRL" }] },
  "campaign/get/": { list: [] },
  "identity/get/": { identity_list: [{ identity_id: "I1", identity_type: "TT_USER" }] },
  "file/video/ad/search/": { list: [] },
};
const PIXEL_OK = { pixels: [{ pixel_id: "P1", pixel_name: "Shadia", activity_status: "ACTIVE", events: [{ event_type: "SHOPPING", name: "Purchase" }] }] };
const STATS_OK = { list: [{ pixel_id: "P1", stats: [{ event_type: "SHOPPING", count: 12 }] }] };
const ADV = "7620542434560344082";

// ── Classificacao de erros ───────────────────────────────────────────────────

test("caso real 828: 40001 'does not grant you /pixel/list/:GET' = falta de permissao do APP (Measurement), de autorizacao", () => {
  const p = classificarErroTikTok(ERRO_REAL);
  assert.equal(p.tipo, "permissao_api");
  assert.equal(p.endpoint, "/pixel/list/:GET");
  assert.match(p.permissao!, /Measurement/);
  assert.equal(p.deAutorizacao, true);
  assert.ok(p.instrucoes.some((i) => /Scope of permission/.test(i)));
  assert.ok(p.instrucoes.some((i) => /nova autorizacao gera um token/.test(i)), "token antigo nao ganha a permissao");
  assert.ok(p.instrucoes.some((i) => /vendas continuam vendas/.test(i)));
  assert.ok(!p.instrucoes.join(" ").match(/trafego como alternativa|publique como trafego/i));
});

test("token invalido/expirado e conta nao autorizada sao separados da falta de permissao", () => {
  assert.equal(classificarErroTikTok(new ErroTikTok("campaign/get/", 40105, "The access token is invalid or expired.")).tipo, "token_invalido");
  assert.equal(classificarErroTikTok(new Error("TikTok [ad/get/] 40100: Access token has expired")).tipo, "token_invalido");
  assert.equal(classificarErroTikTok(new ErroTikTok("campaign/get/", 40002, "No permission to operate advertiser 123")).tipo, "conta_nao_autorizada");
  assert.equal(classificarErroTikTok(new ErroTikTok("campaign/get/", 40002, "advertiser_id 999 does not exist")).tipo, "conta_nao_autorizada");
  assert.equal(classificarErroTikTok(new Error("TikTok [x] 50000: system busy")).tipo, "outro");
  assert.equal(classificarErroTikTok(new ErroTikTok("report/integrated/get/", 40001, "The access token lacks the required scope")).tipo, "permissao_api");
});

test("grupo de permissao por endpoint", () => {
  assert.match(permissaoDoEndpoint("/pixel/list/"), /Measurement/);
  assert.match(permissaoDoEndpoint("/pixel/event/stats/"), /Measurement/);
  assert.equal(permissaoDoEndpoint("/campaign/create/"), "Ads Management");
  assert.equal(permissaoDoEndpoint("/file/video/ad/upload/"), "Creative Management");
  assert.equal(permissaoDoEndpoint("/advertiser/info/"), "Ad Account Management");
  assert.equal(permissaoDoEndpoint("/report/integrated/get/"), "Reporting");
});

// ── Pixel e eventos ──────────────────────────────────────────────────────────

test("Pixel inexistente, Pixel sem evento, varios Pixels (ambiguo) e evento sem atividade", async () => {
  const semPixel = await diagnosticarPixels(conta({ "pixel/list/": { pixels: [] } }), ADV, "SHOPPING");
  assert.equal(semPixel.problema!.tipo, "pixel_inexistente");
  assert.ok(semPixel.problema!.instrucoes.some((i) => /Events API pelo servidor com event_id/.test(i)));

  const semEvento = await diagnosticarPixels(conta({ "pixel/list/": { pixels: [{ pixel_id: "P1", pixel_name: "Site", events: [{ event_type: "ON_WEB_DETAIL" }] }] }, "pixel/event/stats/": {} }), ADV, "SHOPPING");
  assert.equal(semEvento.problema!.tipo, "pixel_sem_evento");
  assert.match(semEvento.problema!.instrucoes[0], /Purchase/);

  const dois = { pixels: [{ pixel_id: "P1", pixel_name: "A", events: [{ name: "Purchase" }] }, { pixel_id: "P2", pixel_name: "B", events: [{ name: "CompletePayment" }] }] };
  const amb = await diagnosticarPixels(conta({ "pixel/list/": dois, "pixel/event/stats/": {} }), ADV, "SHOPPING");
  assert.equal(amb.problema!.tipo, "pixel_ambiguo");
  const escolhido = await diagnosticarPixels(conta({ "pixel/list/": dois, "pixel/event/stats/": {} }), ADV, "SHOPPING", "P2");
  assert.equal(escolhido.ok, true);
  assert.equal(escolhido.escolhido!.pixelId, "P2");

  const parado = await diagnosticarPixels(conta({ "pixel/list/": PIXEL_OK, "pixel/event/stats/": { list: [{ pixel_id: "P1", stats: [{ event_type: "SHOPPING", count: 0 }] }] } }), ADV, "SHOPPING");
  assert.equal(parado.ok, true, "sem atividade nao bloqueia sozinho");
  assert.equal(parado.problema!.tipo, "evento_sem_atividade");
  assert.equal(parado.escolhido!.disparos30d, 0);

  const errado = await diagnosticarPixels(conta({ "pixel/list/": PIXEL_OK, "pixel/event/stats/": STATS_OK }), ADV, "SHOPPING", "P9");
  assert.equal(errado.problema!.tipo, "pixel_inexistente");
});

test("Pixel com o evento e atividade: ok, com disparos de 30 dias", async () => {
  const r = await diagnosticarPixels(conta({ "pixel/list/": PIXEL_OK, "pixel/event/stats/": STATS_OK }), ADV, "SHOPPING");
  assert.equal(r.ok, true);
  assert.equal(r.problema, undefined);
  assert.equal(r.escolhido!.disparos30d, 12);
});

test("sem permissao para a ATIVIDADE (pixel/event/stats) avisa, nao bloqueia", async () => {
  const r = await diagnosticarPixels(conta({ "pixel/list/": PIXEL_OK, "pixel/event/stats/": new ErroTikTok("pixel/event/stats/", 40001, "advertiser does not grant you /pixel/event/stats/:GET permission") }), ADV, "SHOPPING");
  assert.equal(r.ok, true);
  assert.ok(r.avisos.some((a) => /Sem permissao para ler a atividade/.test(a)));
});

test("disparos: le formatos diferentes de pixel/event/stats", () => {
  assert.equal(disparosDoEvento({ list: [{ event: "PURCHASE", event_count: 3 }, { event: "SHOPPING", count: 2 }] }, ["SHOPPING", "PURCHASE"]), 5);
  assert.equal(disparosDoEvento({}, ["SHOPPING"]), null);
});

// ── Diagnostico completo ─────────────────────────────────────────────────────

test("diagnostico 828 (permissao de Pixel faltando): tudo ok menos Measurement; pronto para trafego, nao para vendas; nada criado", async () => {
  const c = conta({ ...okBase, "pixel/list/": ERRO_REAL });
  const d = await diagnosticarTikTok(c, ADV, { app: { appId: "app", secret: "s" } });
  assert.equal(d.contaAutorizada, true);
  assert.deepEqual(d.capacidades.map((x) => x.ok), [true, true, true, true, false]);
  assert.deepEqual(d.pronto, { trafego: true, vendas: false });
  assert.equal(d.problemas.length, 1);
  assert.equal(d.problemas[0].tipo, "permissao_api");
  assert.ok(!c.chamadas.some((p) => /create|update|upload/.test(p)), "so leitura");
  const txt = resumoDoDiagnostico(d);
  assert.match(txt, /FALHA Pixel e eventos/);
  assert.match(txt, /Measurement/);
});

test("diagnostico: conta fora da lista autorizada do app e token invalido", async () => {
  const fora = await diagnosticarTikTok(conta({ ...okBase, "oauth2/advertiser/get/": { list: [{ advertiser_id: "111" }] }, "pixel/list/": PIXEL_OK, "pixel/event/stats/": STATS_OK }), ADV, { app: { appId: "a", secret: "s" } });
  assert.equal(fora.contaAutorizada, false);
  assert.equal(fora.problemas[0].tipo, "conta_nao_autorizada");
  assert.equal(fora.pronto.trafego, false);
  const expirado = new ErroTikTok("x", 40105, "Access token is invalid");
  const tok = await diagnosticarTikTok(conta(Object.fromEntries([...Object.keys(okBase), "pixel/list/"].map((k) => [k, expirado]))), ADV, { app: { appId: "a", secret: "s" } });
  assert.ok(tok.problemas.every((p) => p.tipo === "token_invalido"));
  assert.equal(tok.problemas.length, 1, "o mesmo problema aparece uma vez");
});

test("diagnostico sem app_id/secret no servidor: nao confere a lista, mas testa o resto", async () => {
  const d = await diagnosticarTikTok(conta({ ...okBase, "pixel/list/": PIXEL_OK, "pixel/event/stats/": STATS_OK }), ADV);
  assert.equal(d.contaAutorizada, null);
  assert.deepEqual(d.pronto, { trafego: true, vendas: true });
});

// ── Validacao: autorizacao nunca vira trafego ────────────────────────────────

const depsVal = { minimo: async () => ({ moeda: "BRL", minimo: 124, cotacao: 5.6, fonte: "api" as const }), urlSegura: async () => true, pagina: async () => ({ ok: true, status: 200 }), video: { sondar: async () => null, importar: async () => null, aguardar: async () => true } };
const entrada828 = { advertiserId: ADV, campaignName: "Campanha Shadia Hasan - Black Friday · #828", dailyBudgetReais: 124, landingPageUrl: "https://shadiahasan.com/cursos", adText: "Liberte-se dos medos que te paralisam", callToAction: "SHOP_NOW", displayName: "Shadia Hasan", objetivo: "sales" as const, videos: [{ videoUrl: "https://res.cloudinary.com/d/video/upload/v1/a.mp4", nome: "a.mp4" }] };

test("validacao 828: falta de permissao de Pixel bloqueia com a instrucao certa e NAO vira trafego nem com autorizarTrafego", async () => {
  const c = conta({ ...okBase, "pixel/list/": ERRO_REAL });
  const v = await validarPublicacaoTikTok(c, entrada828, depsVal);
  assert.equal(v.ok, false);
  assert.equal(v.problemas[0].tipo, "permissao_api");
  assert.ok(v.bloqueios.some((b) => /Measurement/.test(b) && /Scope of permission/.test(b)));
  assert.ok(!v.bloqueios.some((b) => /Nao troco vendas por trafego/.test(b)), "nao fala em trafego: o problema e de autorizacao");
  const forcado = await validarPublicacaoTikTok(conta({ ...okBase, "pixel/list/": ERRO_REAL }), { ...entrada828, autorizarTrafego: true }, depsVal);
  assert.equal(forcado.objetivo.objectiveType, "WEB_CONVERSIONS", "autorizacao se corrige; vendas continuam vendas");
  assert.equal(forcado.ok, false);
});

test("validacao: sem identidade por falta de permissao mostra a permissao, nao 'autorize uma identidade'", async () => {
  const negado = new ErroTikTok("identity/get/", 40001, "advertiser does not grant you /identity/get/:GET permission");
  const v = await validarPublicacaoTikTok(conta({ ...okBase, "identity/get/": negado, "pixel/list/": PIXEL_OK, "pixel/event/stats/": STATS_OK }), entrada828, depsVal);
  assert.ok(v.problemas.some((p) => p.tipo === "permissao_api" && p.permissao === "Ads Management"));
});

// ── Chat ─────────────────────────────────────────────────────────────────────

function depsChat(over: Partial<DepsTikTokChat> = {}, c: ClienteTikTok = conta({ ...okBase, "pixel/list/": ERRO_REAL })) {
  const salvos: Array<[number, string]> = [];
  const d: DepsTikTokChat = {
    campanha: async () => ({ id: 828, projectId: 49, name: "Campanha Shadia Hasan - Black Friday", objective: "sales", suggestedBudgetDaily: 124, creatives: "[]" }),
    projeto: async () => ({ id: 49, userId: 2, name: "Shadia Hasan" }),
    perfil: async () => ({ websiteUrl: "https://shadiahasan.com/cursos", companyName: "Shadia Hasan", tiktokPixelId: null }),
    integracao: async () => ({ isActive: true, accessToken: "tok", accountId: ADV }),
    videosDaSessao: async () => [{ url: "https://res.cloudinary.com/d/video/upload/v1/a.mp4", fileName: "a.mp4" }],
    reservar: async () => ({ kind: "proceed", recordId: 1 }), concluir: async () => {}, falhar: async () => {},
    publicar: async () => { throw new Error("nao devia publicar"); },
    conferir: () => [], salvarIds: async () => {},
    salvarPixel: async (pid, px) => { salvos.push([pid, px]); return true; },
    validar: (_t, e) => validarPublicacaoTikTok(c, e, depsVal),
    ...over,
  };
  return { d, salvos };
}

test("chat 828: previa explica a permissao que falta, como reconectar, e nunca oferece trafego", async () => {
  limparPropostasTikTok();
  const { d } = depsChat();
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 828, confirmado: false }, d);
  assert.match(r.perguntaParaOUsuario, /Ainda nao da para publicar/);
  assert.match(r.perguntaParaOUsuario, /Measurement/);
  assert.match(r.perguntaParaOUsuario, /settings\/tiktok/);
  assert.doesNotMatch(r.perguntaParaOUsuario, /autorizo trafego|como TRAFEGO/i);
});

test("chat: varios Pixels pergunta qual; o escolhido fica salvo no projeto", async () => {
  limparPropostasTikTok();
  const dois = { pixels: [{ pixel_id: "P1", pixel_name: "A", events: [{ name: "Purchase" }] }, { pixel_id: "P2", pixel_name: "B", events: [{ name: "Purchase" }] }] };
  const c = conta({ ...okBase, "pixel/list/": dois, "pixel/event/stats/": {} });
  const { d, salvos } = depsChat({}, c);
  const p: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 828, confirmado: false }, d);
  assert.match(p.perguntaParaOUsuario, /Ha 2 Pixels/);
  assert.equal(p.previa.pixelsDaConta.length, 2);
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 828, confirmado: false, pixelId: "P2" }, d);
  assert.deepEqual(salvos, [[49, "P2"]]);
  assert.match(r.previa.pixel, /B \(P2\)/);
});

test("chat: diagnosticar_tiktok confere dono do rascunho e usa o Pixel salvo", async () => {
  let pixelUsado: string | undefined = "x";
  const deps = {
    campanha: async () => ({ projectId: 49 }), projeto: async () => ({ userId: 2 }), perfil: async () => ({ tiktokPixelId: "P7" }),
    integracao: async () => ({ accessToken: "t", accountId: ADV }),
    diagnosticar: async (_t: string, _a: string, px?: string) => { pixelUsado = px; return { texto: "ok", dados: {} }; },
  };
  assert.deepEqual(await diagnosticarTikTokDoChat(2, { campaignId: 828 }, deps), { diagnostico: "ok", dados: {} });
  assert.equal(pixelUsado, "P7");
  assert.match(String((await diagnosticarTikTokDoChat(9, { campaignId: 828 }, deps)).erro), /nao encontrado/);
});

// ── OAuth e superficies ──────────────────────────────────────────────────────

test("OAuth: le os ids de permissao concedidos (scope) sem guardar segredo", () => {
  const t = lerRespostaTokenAds({ code: 0, data: { access_token: "tok", advertiser_ids: ["1"], scope: [4, 5, 9] } });
  assert.deepEqual(t.escopos, [4, 5, 9]);
  assert.equal(lerRespostaTokenAds({ code: 0, data: { access_token: "tok", advertiser_ids: ["1"] } }).escopos, undefined);
});

test("superficies: ferramentas MCP e do chat existem; callback troca o codigo fora do popup; migracao aditiva", () => {
  const mcp = readFileSync(new URL("../mcpServer.ts", import.meta.url), "utf8");
  for (const t of ["diagnose_tiktok_ads", "list_tiktok_pixels", "set_tiktok_pixel", "tiktok_reauthorize_link", "validate_tiktok_campaign"]) assert.match(mcp, new RegExp(`"${t}"`), t);
  const chat = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  assert.equal((chat.match(/=== "diagnosticar_tiktok"/g) || []).length, 3, "nos tres provedores");
  const cb = readFileSync(new URL("../../client/src/pages/TikTokOAuthCallback.tsx", import.meta.url), "utf8");
  assert.match(cb, /!window\.opener && state && exchange/);
  const mig = readFileSync(new URL("../_core/migrations.ts", import.meta.url), "utf8");
  assert.match(mig, /ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS "tiktokPixelId" varchar\(40\)/);
});
