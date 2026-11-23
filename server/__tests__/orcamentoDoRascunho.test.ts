import { test } from "node:test";
import assert from "node:assert/strict";
import { verificarOrcamentoDoRascunho, rebalancearConjuntos } from "../../shared/orcamentoDoRascunho";
import { atualizarOrcamentoCampanha } from "../chatWorkspace";
import { pendenciasLocaisParaPublicar } from "../publishPreflight";
import { ajustarRascunhoCampanha } from "../campaignDraftEdit";

const conj = (...b: string[]) => b.map((budget, i) => ({ name: `C${i + 1}`, budget }));
const camp = (adSets: any[], extra: Record<string, unknown> = {}) => ({
  id: 5, projectId: 1, publishStatus: "draft", suggestedBudgetDaily: 30, suggestedBudgetMonthly: 300, durationDays: 10,
  adSets: JSON.stringify(adSets), creatives: "[]", ...extra,
} as any);

test("orcamento: varios conjuntos com valores diferentes que fecham no aprovado ficam ok", () => {
  const v = verificarOrcamentoDoRascunho(camp(conj("R$ 15,00/dia", "R$ 10,00/dia", "R$ 5,00/dia")));
  // 5 < piso interno de 6: o plano eleva ao piso e a soma passa de 30, entao diverge.
  assert.equal(v.situacao, "divergente");
  const ok = verificarOrcamentoDoRascunho(camp(conj("R$ 14,00/dia", "R$ 10,00/dia", "R$ 6,00/dia")));
  assert.equal(ok.situacao, "ok"); assert.equal(ok.publicavel, true); assert.equal(ok.somaDiaria, 30);
});

test("orcamento: soma acima do aprovado, percentuais que nao fecham e sem conjuntos/sem aprovado", () => {
  assert.equal(verificarOrcamentoDoRascunho(camp(conj("R$ 20,00/dia", "R$ 20,00/dia"))).situacao, "divergente");
  assert.equal(verificarOrcamentoDoRascunho(camp(conj("50%", "50%"))).situacao, "ok");
  assert.equal(verificarOrcamentoDoRascunho(camp([])).situacao, "sem_conjuntos");
  assert.equal(verificarOrcamentoDoRascunho(camp(conj("50%"), { suggestedBudgetDaily: null, suggestedBudgetMonthly: null })).situacao, "sem_orcamento_aprovado");
});

test("orcamento: arredondamento de centavos (R$ 1000 em 30 dias, 2 conjuntos) nao vira falso bloqueio", () => {
  const v = verificarOrcamentoDoRascunho(camp(conj("R$ 17,00/dia", "R$ 16,00/dia"), { suggestedBudgetDaily: 33, suggestedBudgetMonthly: 1000, durationDays: 30 }));
  assert.equal(v.situacao, "ok");
  assert.equal(v.somaNoPeriodo, 990);
});

test("orcamento: redistribuir mantem a proporcao, fecha exatamente no aprovado e nunca sobe o total", () => {
  const c = camp(conj("R$ 40,00/dia", "R$ 20,00/dia", "R$ 20,00/dia"), { suggestedBudgetDaily: 31, suggestedBudgetMonthly: 310 });
  const r = rebalancearConjuntos(c);
  assert.equal(r.ok, true);
  if (r.ok === true) {
    const valores = r.adSets.map((a) => Number(String(a.budget).replace(/[^\d,]/g, "").replace(",", ".")));
    assert.equal(valores.reduce((a, b) => a + b, 0), 31);
    assert.ok(valores.every((v) => v >= 6));
    assert.ok(valores[0] >= valores[1], "o maior conjunto continua maior");
    assert.equal(verificarOrcamentoDoRascunho({ ...c, adSets: JSON.stringify(r.adSets) }).situacao, "ok");
  }
});

test("orcamento: aprovado que nao comporta o piso nao e aumentado; devolve erro claro", () => {
  const r = rebalancearConjuntos(camp(conj("R$ 2,00/dia", "R$ 2,00/dia", "R$ 2,00/dia"), { suggestedBudgetDaily: 10, suggestedBudgetMonthly: 100 }));
  assert.equal(r.ok, false);
  if (r.ok === false) assert.match(r.erro, /nao aumenta o orcamento sozinho/);
});

test("orcamento: conta em outra moeda nao compara com a referencia em reais", () => {
  const v = verificarOrcamentoDoRascunho(camp(conj("50%", "50%"), { suggestedBudgetDaily: 8, suggestedBudgetMonthly: 80 }), { moedaDaConta: "USD", minimoDiarioDaConta: 1 });
  assert.ok(!v.avisos.some((a) => a.codigo === "abaixo_da_recomendacao_comercial"));
  assert.ok(v.avisos.some((a) => a.codigo === "moeda_diferente_de_brl"));
});

// ── Fluxo real de edicao (chat) e a porta de publicacao ─────────────────────
function lojaDeTeste(inicial: any) {
  const estado = { ...inicial };
  return {
    estado,
    store: {
      getProjectsByUserId: async () => [{ id: 1, name: "P" }],
      getCampaignsByProjectId: async () => [estado],
      getCampaignById: async () => estado,
      updateCampaignField: async (_id: number, campo: string, valor: string) => { (estado as any)[campo] = valor; },
    } as any,
  };
}

test("edicao no chat: R$ 100, depois R$ 200, depois R$ 100 vale o ultimo e o chat recebe a situacao do orcamento", async () => {
  const { estado, store } = lojaDeTeste(camp(conj("R$ 15,00/dia", "R$ 15,00/dia"), { suggestedBudgetDaily: 100, suggestedBudgetMonthly: 1000, durationDays: 10 }));
  const orc = (v: number) => atualizarOrcamentoCampanha(1, { campaignId: 5, adSetIndex: 0, budgetDaily: String(v) }, store) as Promise<any>;
  await orc(100); await orc(200);
  const r3 = await orc(100);
  assert.equal(JSON.parse(estado.adSets)[0].budget, "R$ 100,00/dia");
  assert.equal(r3.orcamento.publicavel, false, "100 + 15 passa de 100 aprovados");
  assert.match(r3.message, /ATENCAO/);
});

test("edicao no chat: redistribuir dentro do aprovado resolve a divergencia e libera a publicacao local", async () => {
  const { estado, store } = lojaDeTeste(camp(conj("R$ 90,00/dia", "R$ 15,00/dia"), { suggestedBudgetDaily: 60, suggestedBudgetMonthly: 600 }));
  assert.ok(pendenciasLocaisParaPublicar(estado).pendencias?.some((p: any) => p.tipo === "orcamento_divergente"), "a porta de publicacao recusa antes");
  const r: any = await atualizarOrcamentoCampanha(1, { campaignId: 5, redistribuirNoOrcamentoAprovado: true }, store);
  assert.equal(r.ok, true);
  assert.equal(r.orcamento.publicavel, true);
  assert.ok(!pendenciasLocaisParaPublicar(estado).pendencias?.some((p: any) => p.tipo === "orcamento_divergente"));
  assert.equal(estado.suggestedBudgetDaily, 60, "o aprovado nao foi alterado");
});

test("edicao por MCP/tela: ajustarRascunhoCampanha avisa quando a soma diverge", () => {
  const r = ajustarRascunhoCampanha(camp(conj("R$ 15,00/dia", "R$ 15,00/dia")), { adSetBudgetsDaily: [25, 25] }, (() => ({ ok: true })) as any);
  assert.ok(!r.erro);
  assert.equal((r.relatorio as any).verificacaoDoOrcamento.publicavel, false);
  assert.ok(((r.relatorio as any).avisos as string[]).some((a) => /NAO confere/.test(a)));
});

test("orcamento: segmentos distintos (clinica, curso, e-commerce) seguem a mesma regra de soma", () => {
  for (const [nome, aprovado, dias] of [["clinica", 40, 7], ["curso", 90, 30], ["ecommerce", 25, 15]] as const) {
    const c = camp(conj(`R$ ${Math.floor(aprovado / 2)},00/dia`, `R$ ${aprovado - Math.floor(aprovado / 2)},00/dia`), { suggestedBudgetDaily: aprovado, suggestedBudgetMonthly: aprovado * dias, durationDays: dias });
    const v = verificarOrcamentoDoRascunho(c);
    assert.equal(v.situacao, "ok", nome); assert.equal(v.somaDiaria, aprovado, nome);
    const errado = verificarOrcamentoDoRascunho(camp(conj(`R$ ${aprovado},00/dia`, `R$ 10,00/dia`), { suggestedBudgetDaily: aprovado, suggestedBudgetMonthly: aprovado * dias, durationDays: dias }));
    assert.equal(errado.publicavel, false, nome);
  }
});

test("Goldfish: soma acima do aprovado nunca e publicavel (12 com 7+6) e mensal defasado nao bloqueia", () => {
  const acima = verificarOrcamentoDoRascunho(camp(conj("R$ 7,00/dia", "R$ 6,00/dia"), { suggestedBudgetDaily: 12, suggestedBudgetMonthly: 360, durationDays: 30 }));
  assert.equal(acima.publicavel, false);
  const velho = verificarOrcamentoDoRascunho(camp(conj("R$ 6,00/dia", "R$ 6,00/dia"), { suggestedBudgetDaily: 12, suggestedBudgetMonthly: 100, durationDays: 30 }));
  assert.equal(velho.situacao, "ok");
});
