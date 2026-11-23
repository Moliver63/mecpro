import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertInputOwnership, assertCampaignOwner, assertProjectOwner, type OwnershipStore } from "../ownership";

// Achado da auditoria de 23/11: rotas da tela (tRPC) liam e gravavam campanha
// e projeto de outro cliente pelo numero. MCP e chat ja conferiam o dono.

const A = { id: 10, role: "user" };
const B = { id: 20, role: "user" };
const ADMIN = { id: 99, role: "superadmin" };

const store: OwnershipStore = {
  async getProjectById(id) {
    return ({ 1: { id: 1, userId: 10 }, 2: { id: 2, userId: 20 } } as any)[id] ?? null;
  },
  async getCampaignById(id) {
    return ({ 100: { id: 100, projectId: 1 }, 200: { id: 200, projectId: 2 } } as any)[id] ?? null;
  },
};

async function recusa(p: Promise<unknown>) {
  await assert.rejects(p, (e: any) => e instanceof TRPCError && e.code === "NOT_FOUND");
}

test("campanha de outro cliente pelo numero: NOT_FOUND", async () => {
  await recusa(assertInputOwnership(store, B, { campaignId: 100 }));
  await recusa(assertCampaignOwner(store, B, 100));
});

test("projeto de outro cliente pelo numero: NOT_FOUND", async () => {
  await recusa(assertInputOwnership(store, B, { projectId: 1 }));
  await recusa(assertProjectOwner(store, B, 1));
});

test("inexistente e alheio dao a mesma resposta (nao revela existencia)", async () => {
  const msgs: string[] = [];
  for (const id of [100, 999]) {
    try { await assertInputOwnership(store, B, { campaignId: id }); } catch (e: any) { msgs.push(`${e.code}:${e.message}`); }
  }
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0], msgs[1]);
});

test("dono continua acessando a propria campanha e o proprio projeto", async () => {
  await assertInputOwnership(store, A, { campaignId: 100 });
  await assertInputOwnership(store, A, { projectId: 1 });
  await assertInputOwnership(store, A, { campaignId: 100, projectId: 1 });
});

test("propria campanha com o projeto (perfil) de outro cliente: NOT_FOUND", async () => {
  // publishToMeta lia o perfil pelo input.projectId sem conferir o projeto da campanha.
  await recusa(assertInputOwnership(store, B, { campaignId: 200, projectId: 1 }));
  // propria campanha + outro projeto proprio que nao e o dela tambem recusa
  const store2: OwnershipStore = { ...store, async getProjectById(id) { return id === 3 ? { id: 3, userId: 20 } : store.getProjectById(id); } };
  await recusa(assertInputOwnership(store2, B, { campaignId: 200, projectId: 3 }));
});

test("ids de plataforma (string), zero e entrada sem ids passam sem consulta", async () => {
  let consultas = 0;
  const contador: OwnershipStore = {
    async getProjectById(id) { consultas++; return store.getProjectById(id); },
    async getCampaignById(id) { consultas++; return store.getCampaignById(id); },
  };
  await assertInputOwnership(contador, B, { campaignId: "120250547022170375" });
  await assertInputOwnership(contador, B, { campaignId: 0, projectId: 0 });
  await assertInputOwnership(contador, B, undefined);
  await assertInputOwnership(contador, B, { id: 100 });
  await assertInputOwnership(contador, B, [100]);
  assert.equal(consultas, 0);
});

test("admin e superadmin mantem o acesso administrativo", async () => {
  await assertInputOwnership(store, ADMIN, { campaignId: 100, projectId: 1 });
  await assertInputOwnership(store, { id: 98, role: "admin" }, { projectId: 2 });
});

test("middleware tRPC com getRawInput barra antes do resolver rodar", async () => {
  const t = initTRPC.context<{ user: any }>().create();
  let rodou = 0;
  const protegido = t.procedure.use(async ({ ctx, next, getRawInput }) => {
    await assertInputOwnership(store, ctx.user, await getRawInput());
    return next();
  });
  const app = t.router({
    get: protegido.input(z.object({ campaignId: z.number() })).query(() => { rodou++; return "ok"; }),
  });
  await recusa(app.createCaller({ user: B }).get({ campaignId: 100 }));
  assert.equal(rodou, 0, "o resolver nao pode rodar para campanha alheia");
  assert.equal(await app.createCaller({ user: A }).get({ campaignId: 100 }), "ok");
});

// Fonte: as duas instancias de protectedProcedure usam a checagem, e as rotas
// cujo id vem como `id` conferem explicitamente.
const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
const TRPC = readFileSync(new URL("../_core/trpc.ts", import.meta.url), "utf8");

function blocoDe(fonte: string, inicio: RegExp, tamanho = 600): string {
  const m = fonte.match(inicio);
  assert.ok(m && m.index !== undefined, `nao achei ${inicio}`);
  return fonte.slice(m!.index!, m!.index! + tamanho);
}

test("protectedProcedure de router.ts e de trpc.ts chamam assertInputOwnership", () => {
  assert.match(blocoDe(ROTA, /export const protectedProcedure = /), /assertInputOwnership\([^)]*await getRawInput\(\)\)/);
  assert.match(blocoDe(TRPC, /export const protectedProcedure = /), /assertInputOwnership\([^)]*await getRawInput\(\)\)/);
});

test("campaigns.get, projects.get, projects.update e projects.delete conferem o dono", () => {
  const camp = blocoDe(ROTA, /const campaignsRouter = router\(\{/, 20000);
  assert.match(blocoDe(camp, /\n  get: protectedProcedure/, 300), /assertCampaignOwner/);
  const proj = blocoDe(ROTA, /const projectsRouter = router\(\{/, 2500);
  assert.match(blocoDe(proj, /\n  get: protectedProcedure/, 300), /assertProjectOwner/);
  assert.match(blocoDe(proj, /\n  update: protectedProcedure/, 400), /assertProjectOwner/);
  assert.match(blocoDe(proj, /\n  delete: protectedProcedure/, 300), /assertProjectOwner/);
});
