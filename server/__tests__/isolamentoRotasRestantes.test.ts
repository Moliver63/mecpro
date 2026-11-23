import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertInputOwnership, assertCompetitorOwner, jobVslDoUsuario, type OwnershipStore } from "../ownership";
import { assinaturaAsaasDoUsuario } from "../asaasOwnership";

// Auditoria 23/11, rodada 2: brechas restantes depois do middleware de
// campaignId/projectId. Concorrentes, notificacoes, Pix de assinatura, jobs de
// video e tres rotas Express.

const A = { id: 10, role: "user" };
const B = { id: 20, role: "user" };
const ADMIN = { id: 99, role: "admin" };

const store: OwnershipStore = {
  async getProjectById(id) { return ({ 1: { id: 1, userId: 10 }, 2: { id: 2, userId: 20 }, 3: { id: 3, userId: 10 } } as any)[id] ?? null; },
  async getCampaignById(id) { return ({ 100: { id: 100, projectId: 1 } } as any)[id] ?? null; },
  async getCompetitorById(id) { return ({ 500: { id: 500, projectId: 1 }, 600: { id: 600, projectId: 2 } } as any)[id] ?? null; },
};

async function recusa(p: Promise<unknown>) {
  await assert.rejects(p, (e: any) => e instanceof TRPCError && e.code === "NOT_FOUND");
}

test("concorrente de outro cliente por competitorId: NOT_FOUND (analyze, reanalyze, estimateSpend...)", async () => {
  await recusa(assertInputOwnership(store, B, { competitorId: 500 }));
  await recusa(assertInputOwnership(store, B, { competitorId: 500, projectId: 2 }));
  await recusa(assertCompetitorOwner(store, B, 500));
});

test("concorrente proprio passa; com projeto diferente do dele, recusa", async () => {
  await assertInputOwnership(store, A, { competitorId: 500, projectId: 1 });
  await assertCompetitorOwner(store, A, 500);
  // projeto 3 tambem e de A, mas o concorrente 500 e do projeto 1
  await recusa(assertInputOwnership(store, A, { competitorId: 500, projectId: 3 }));
});

test("concorrente inexistente e alheio dao a mesma resposta", async () => {
  const msgs: string[] = [];
  for (const id of [600, 9999]) {
    try { await assertCompetitorOwner(store, A, id); } catch (e: any) { msgs.push(`${e.code}:${e.message}`); }
  }
  assert.deepEqual(msgs, ["NOT_FOUND:Concorrente não encontrado.", "NOT_FOUND:Concorrente não encontrado."]);
});

test("sem getCompetitorById no store, fecha (nao abre)", async () => {
  const semConcorrente: OwnershipStore = { getProjectById: store.getProjectById, getCampaignById: store.getCampaignById };
  await recusa(assertInputOwnership(semConcorrente, A, { competitorId: 500 }));
});

test("admin mantem o acesso administrativo a concorrentes", async () => {
  await assertInputOwnership(store, ADMIN, { competitorId: 600, projectId: 2 });
  await assertCompetitorOwner(store, ADMIN, 600);
});

test("middleware tRPC com competitorId barra antes do resolver", async () => {
  const t = initTRPC.context<{ user: any }>().create();
  let rodou = 0;
  const protegido = t.procedure.use(async ({ ctx, next, getRawInput }) => {
    await assertInputOwnership(store, ctx.user, await getRawInput());
    return next();
  });
  const app = t.router({
    reanalyze: protegido.input(z.object({ competitorId: z.number(), projectId: z.number() })).mutation(() => { rodou++; return "ok"; }),
  });
  await recusa(app.createCaller({ user: B }).reanalyze({ competitorId: 500, projectId: 2 }));
  assert.equal(rodou, 0);
  assert.equal(await app.createCaller({ user: A }).reanalyze({ competitorId: 500, projectId: 1 }), "ok");
});

test("Pix de assinatura: so a referencia gravada pelo MecProAI para o proprio usuario", () => {
  for (const ref of ["user_12_premium", "user_12", "mecpro_uid_12", "mecpro_annual_uid_12_vip", "12"]) {
    assert.equal(assinaturaAsaasDoUsuario(ref, 12), true, ref);
  }
  for (const ref of ["user_1_premium", "user_123_premium", "mecpro_uid_1", "mecpro_uid_120", "mecpro_annual_uid_1_vip", "121", "wallet-12-1", "", null, undefined, 12]) {
    assert.equal(assinaturaAsaasDoUsuario(ref as any, 12), false, String(ref));
  }
  assert.equal(assinaturaAsaasDoUsuario("user_1_premium", 0), false);
});

test("job de video so do proprio usuario (mecpro_<id>_)", () => {
  assert.equal(jobVslDoUsuario("mecpro_12_1795400000000", 12), true);
  assert.equal(jobVslDoUsuario("mecpro_12_reels_9_16_1795400000000", 12), true);
  assert.equal(jobVslDoUsuario("mecpro_1_1795400000000", 12), false);
  assert.equal(jobVslDoUsuario("mecpro_120_1795400000000", 12), false);
  assert.equal(jobVslDoUsuario("mecpro_12", 12), false);
  assert.equal(jobVslDoUsuario("../status/mecpro_12_1", 12), false);
  assert.equal(jobVslDoUsuario(undefined, 12), false);
});

// Fonte: as rotas corrigidas chamam a checagem antes de ler ou gravar.
const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
const VSL = readFileSync(new URL("../_core/vslRouter.ts", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../_core/index.ts", import.meta.url), "utf8");
const DB = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
const MKT = readFileSync(new URL("../marketplace.ts", import.meta.url), "utf8");

function trecho(fonte: string, inicio: string, tamanho: number): string {
  const i = fonte.indexOf(inicio);
  assert.ok(i >= 0, `nao achei: ${inicio}`);
  return fonte.slice(i, i + tamanho);
}
function antes(texto: string, primeiro: RegExp, depois: RegExp) {
  const a = texto.search(primeiro), b = texto.search(depois);
  assert.ok(a >= 0, `ausente: ${primeiro}`);
  assert.ok(b >= 0, `ausente: ${depois}`);
  assert.ok(a < b, `${primeiro} tem de vir antes de ${depois}`);
}

test("competitors.delete e competitors.update conferem o dono antes de gravar", () => {
  const comp = trecho(ROTA, "const competitorsRouter = router({", 60000);
  antes(trecho(comp, "\n  delete: protectedProcedure", 400), /assertCompetitorOwner\(/, /db\.deleteCompetitor\(/);
  const upd = trecho(comp, "\n  update: protectedProcedure", 1800);
  antes(upd, /assertCompetitorOwner\(db as any, ctx\.user as any, input\.id\)/, /db\.updateCompetitor\(/);
});

test("notifications.markRead so marca a notificacao do proprio usuario", () => {
  assert.match(trecho(ROTA, "const notificationsRouter = router({", 600), /markNotificationReadForUser\(input\.id, ctx\.user\.id\)/);
  assert.match(trecho(DB, "export async function markNotificationReadForUser", 400), /eq\(notifications\.userId, userId\)/);
});

test("subscriptions.getCheckoutPix confere a assinatura antes de buscar pagamento e Pix", () => {
  const pix = trecho(ROTA, "getCheckoutPix: protectedProcedure", 2500);
  antes(pix, /assinaturaAsaasDoUsuario\(subData\?\.externalReference, ctx\.user\.id\)/, /v3\/payments\?subscription=/);
});

test("vsl.jobStatus e vsl.deleteJob conferem o dono do job antes de chamar o servico", () => {
  antes(trecho(VSL, "jobStatus: protectedProcedure", 500), /assertJobDoUsuario\(input\.jobId, ctx\.user\.id\)/, /callVslService\(/);
  antes(trecho(VSL, "deleteJob: protectedProcedure", 500), /assertJobDoUsuario\(input\.jobId, ctx\.user\.id\)/, /callVslService\(/);
});

test("Express: /api/campaigns/:id e /api/competitors/status conferem o dono; /api/diag/meta sem chave padrao", () => {
  antes(trecho(INDEX, "app.get('/api/campaigns/:id'", 1400), /assertCampaignOwner\(/, /res\.json\(\{\s*id:/);
  antes(trecho(INDEX, "app.get('/api/competitors/status'", 1800), /assertCompetitorOwner\(/, /FROM scraped_ads/);
  const diag = trecho(INDEX, "app.get('/api/diag/meta'", 1600);
  assert.doesNotMatch(diag, /process\.env\.DEBUG_TOKEN \|\| 'mecpro-diag-2026'/);
  assert.match(diag, /sessaoDeAdmin\(req\)/);
  antes(diag, /if \(!autorizado\)\s*\{\s*return res\.status\(403\)/, /FROM api_integrations/);
});

test("Express: /api/webhook/asaas/status (depositos de todos) so com sessao de admin", () => {
  antes(trecho(INDEX, "app.get('/api/webhook/asaas/status'", 1500), /if \(!\(await sessaoDeAdmin\(req\)\)\) return res\.status\(403\)/, /FROM media_budget/);
  assert.match(trecho(INDEX, "async function sessaoDeAdmin", 600), /ehAdmin\(usuario\)/);
});

test("Express: POST /api/marketplace/order exige admin antes de gravar pedido pago", () => {
  const ordem = trecho(MKT, 'router.post("/order"', 1500);
  antes(ordem, /status\(401\)/, /createMarketplaceOrder\(/);
  antes(ordem, /if \(!ehAdmin\(quem\)\) return res\.status\(403\)/, /createMarketplaceOrder\(/);
  antes(ordem, /ehAdmin\(quem\)/, /incrementListingConversions\(/);
});
