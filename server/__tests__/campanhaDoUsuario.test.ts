import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { carregarCampanhaDoUsuario } from "../campanhaDoUsuario";

const fonte = {
  async getCampaignById(id: number) {
    return id === 817 ? { id: 817, projectId: 49, creatives: "[]" } : null;
  },
  async getProjectById(id: number) {
    return id === 49 ? { id: 49, userId: 2 } : null;
  },
};

test("dono do projeto carrega a campanha", async () => {
  const campanha = await carregarCampanhaDoUsuario(fonte, 817, 2);
  assert.equal(campanha.id, 817);
});

test("outra conta recebe FORBIDDEN, sem saber se a campanha existe", async () => {
  await assert.rejects(() => carregarCampanhaDoUsuario(fonte, 817, 99), (e: any) => e.code === "FORBIDDEN");
});

test("campanha inexistente responde NOT_FOUND", async () => {
  await assert.rejects(() => carregarCampanhaDoUsuario(fonte, 1, 2), (e: any) => e.code === "NOT_FOUND");
});

test("sem usuario na sessao responde UNAUTHORIZED", async () => {
  await assert.rejects(() => carregarCampanhaDoUsuario(fonte, 817, undefined), (e: any) => e.code === "UNAUTHORIZED");
});

test("projeto sumido conta como sem acesso", async () => {
  const semProjeto = { ...fonte, async getProjectById() { return null; } };
  await assert.rejects(() => carregarCampanhaDoUsuario(semProjeto, 817, 2), (e: any) => e.code === "FORBIDDEN");
});

const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");

function corpoDo(nome: string): string {
  const inicio = ROTA.indexOf(`\n  ${nome}: protectedProcedure`);
  assert.ok(inicio >= 0, `${nome} nao encontrado no router`);
  const proximo = ROTA.slice(inicio + 1).search(/\n  \w+: \w*[Pp]rocedure/);
  return ROTA.slice(inicio, proximo < 0 ? undefined : inicio + 1 + proximo);
}

for (const nome of ["updateCreativeImage", "setFeaturedPhoto", "enhanceCreativeImage"]) {
  test(`${nome} confere o dono antes de gravar midia`, () => {
    const corpo = corpoDo(nome);
    assert.match(corpo, /carregarCampanhaDoUsuario\(db, input\.campaignId, ctx\.user\?\.id\)/);
    assert.doesNotMatch(corpo, /db\.getCampaignById\(input\.campaignId\)/);
  });
}
