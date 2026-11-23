import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planoDeOrcamento, somaComoAprovado, totalDoPeriodoDaCampanha, diarioAprovadoDaCampanha } from "../../shared/adSetBudgetPlan";
import { pendenciasLocaisParaPublicar } from "../publishPreflight";
import { atualizarOrcamentoCampanha } from "../chatWorkspace";

// Formas reais lidas do banco de producao em 23/11 (so leitura).
const camp = (id: number, d: number, t: number, dias: number, budgets: unknown[], extra: Record<string, unknown> = {}) => ({
  id, projectId: 1, suggestedBudgetDaily: d, suggestedBudgetMonthly: t, durationDays: dias,
  adSets: JSON.stringify(budgets.map((budget, i) => ({ name: `Conjunto ${i + 1}`, budget }))),
  ...extra,
});

const C795 = camp(795, 90, 1260, 14, ["R$ 40/dia (100% do total)"]);
const C799 = camp(799, 6, 84, 14, ["R$ 6,00/dia", "R$ 2,00/dia", "R$ 2,00/dia"]);
const C814 = camp(814, 6, 84, 14, ["R$ 42/dia (50% do total)", "R$ 42/dia (50% do total)"]);
const C816 = camp(816, 6, 84, 14, [2000, 1500, 1500]);
const C748 = camp(748, 6, 180, 30, ["40%", "35%", "25%"]);
const C754 = camp(754, 50, 1500, 30, ["40%", "35%", "25%"]);
const C804 = camp(804, 6, 84, 14, ["R$ 6/dia (100% do total)"]);
const C817 = camp(817, 6, 84, 14, ["R$ 6,00/dia"]);
const C819 = camp(819, 12, 168, 14, ["R$ 6,00/dia", "R$ 6,00/dia"]);

test("816: '2000 | 1500 | 1500' daria ~R$ 167/dia contra R$ 6 aprovados; recusa", () => {
  const p = planoDeOrcamento(C816);
  assert.deepEqual(p.conjuntos.map((c) => c.diario), [67, 50, 50]);
  assert.equal(p.soma, 167);
  assert.equal(p.ok, false);
  assert.match(p.motivo!, /R\$ 167,00\/dia.*R\$ 6,00\/dia/);
});

test("814 (publicada): texto 'R$ 42/dia (50%)' com R$ 6 aprovados; o que iria para a Meta e outro valor; recusa", () => {
  const p = planoDeOrcamento(C814);
  assert.deepEqual(p.conjuntos.map((c) => c.calculado), [3, 3]);
  assert.ok(p.conjuntos.every((c) => /mostra R\$ 42,00\/dia, mas 50% do aprovado dá R\$ 3,00\/dia/.test(c.erro || "")));
  assert.equal(p.ok, false);
  // Corrigido o texto para o diario real, o piso faria 2 x R$ 6 = R$ 12 contra R$ 6: continua recusando.
  const corrigido = planoDeOrcamento(camp(814, 6, 84, 14, ["50%", "50%"]));
  assert.deepEqual(corrigido.conjuntos.map((c) => [c.calculado, c.diario, c.elevadoAoPiso]), [[3, 6, true], [3, 6, true]]);
  assert.equal(corrigido.soma, 12);
  assert.equal(corrigido.ok, false);
  assert.ok(corrigido.detalhes.every((d) => /elevado ao mínimo/.test(d)));
});

test("795: 'R$ 40/dia (100%)' com R$ 90 aprovados publicaria R$ 90 mostrando R$ 40; recusa", () => {
  const p = planoDeOrcamento(C795);
  assert.equal(p.conjuntos[0].calculado, 90);
  assert.equal(p.ok, false);
  assert.match(p.motivo!, /mostra R\$ 40,00\/dia, mas 100% do aprovado dá R\$ 90,00\/dia/);
});

test("799: diario explicito abaixo de R$ 6 e invalido; recusa antes de publicar", () => {
  const p = planoDeOrcamento(C799);
  assert.equal(p.ok, false);
  assert.match(p.motivo!, /abaixo do mínimo/);
  assert.equal(p.conjuntos.filter((c) => c.erro).length, 2);
});

test("748: 40/35/25% de R$ 6 viraria 3 x R$ 6 = R$ 18; recusa", () => {
  const p = planoDeOrcamento(C748);
  assert.equal(p.soma, 18);
  assert.equal(p.ok, false);
});

test("planos coerentes passam: 819, 817, 804 e 754 (arredondamento dentro da tolerancia)", () => {
  for (const c of [C819, C817, C804, C754]) {
    const p = planoDeOrcamento(c);
    assert.equal(p.ok, true, `${c.id}: ${p.motivo}`);
  }
  assert.equal(planoDeOrcamento(C754).soma, 51); // 20 + 18 + 13, tolerancia 1,50
});

test("sem orcamento aprovado nao publica (antes assumia 1000/30)", () => {
  const p = planoDeOrcamento({ adSets: JSON.stringify([{ budget: "100%" }]) });
  assert.equal(p.ok, false);
  assert.match(p.motivo!, /não tem orçamento diário aprovado/);
});

test("'/dia' ilegivel e erro, nao vira outro valor", () => {
  const p = planoDeOrcamento(camp(1, 6, 84, 14, ["seis reais/dia"]));
  assert.equal(p.ok, false);
  assert.match(p.motivo!, /inválido/);
});

test("diario aprovado sem suggestedBudgetDaily usa total / dias, nao / 30", () => {
  assert.equal(diarioAprovadoDaCampanha({ suggestedBudgetMonthly: 140, durationDays: 7 }), 20);
  assert.deepEqual(totalDoPeriodoDaCampanha({ suggestedBudgetDaily: 20, suggestedBudgetMonthly: 600, durationDays: 7 }), { diario: 20, dias: 7, total: 140 });
});

test("saida: usar a soma como aprovado (2 x R$ 6 com R$ 6 aprovados vira R$ 12/dia, R$ 168 em 14 dias); nunca em campanha publicada", () => {
  const rascunho = camp(900, 6, 84, 14, ["R$ 6,00/dia", "R$ 6,00/dia"]);
  assert.equal(planoDeOrcamento(rascunho).ok, false);
  const r = somaComoAprovado(rascunho);
  assert.ok(!("erro" in r));
  assert.deepEqual(r, { suggestedBudgetDaily: 12, suggestedBudgetMonthly: 168, soma: 12, dias: 14 });
  assert.ok(planoDeOrcamento({ ...rascunho, suggestedBudgetDaily: 12, suggestedBudgetMonthly: 168 }).ok);
  assert.ok("erro" in somaComoAprovado({ ...rascunho, metaCampaignId: "120" }));
  assert.ok("erro" in somaComoAprovado({ ...C814, metaCampaignId: null })); // texto divergente: corrigir antes
});

test("pre-checagem (tela, chat e MCP) lista orcamento_divergente com acao ajustar_orcamento", () => {
  const local = pendenciasLocaisParaPublicar(C816);
  const p = (local.pendencias ?? []).find((x: any) => x.tipo === "orcamento_divergente") as any;
  assert.ok(p, "pendencia de orcamento ausente");
  assert.equal(p.acao, "ajustar_orcamento");
  assert.equal(p.detalhes.length, 3);
  const ok = pendenciasLocaisParaPublicar(C819);
  assert.ok(!(ok.pendencias ?? []).some((x: any) => x.tipo === "orcamento_divergente"));
});

test("chat: usarSomaDosConjuntosComoAprovado grava o aprovado so no rascunho do dono", async () => {
  const gravado: any[] = [];
  const store: any = {
    getProjectsByUserId: async (u: number) => (u === 10 ? [{ id: 1 }] : []),
    getCampaignsByProjectId: async () => [],
    getCampaignById: async () => camp(814, 6, 84, 14, ["R$ 6,00/dia", "R$ 6,00/dia"]),
    updateCampaignField: async () => {},
    updateCampaign: async (id: number, data: any) => { gravado.push({ id, ...data }); },
  };
  const r: any = await atualizarOrcamentoCampanha(10, { campaignId: 814, usarSomaDosConjuntosComoAprovado: true }, store);
  assert.equal(r.ok, true);
  assert.equal(gravado[0].suggestedBudgetDaily, 12);
  assert.equal(gravado[0].suggestedBudgetMonthly, 168);
  const alheio: any = await atualizarOrcamentoCampanha(20, { campaignId: 814, usarSomaDosConjuntosComoAprovado: true }, store);
  assert.ok(alheio.erro);
  assert.equal(gravado.length, 1);
  const misturado: any = await atualizarOrcamentoCampanha(10, { campaignId: 814, usarSomaDosConjuntosComoAprovado: true, budgetDaily: "6" }, store);
  assert.ok(misturado.erro);
});

// Fonte: publishToMeta usa o plano (uma regra, uma implementacao) e a tela tem a saida.
const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
const MCP = readFileSync(new URL("../mcpServer.ts", import.meta.url), "utf8");

test("publishToMeta recusa pelo plano e tira o valor de cada conjunto do plano", () => {
  const ini = ROTA.indexOf("publishToMeta: protectedProcedure");
  const fim = ROTA.indexOf("daily_budget:", ini);
  const corpo = ROTA.slice(ini, fim);
  assert.match(corpo, /planoDeOrcamento\(c\)/);
  assert.match(corpo, /if \(!planoOrcamento\.ok\)/);
  assert.match(corpo, /const budgetDaily: number = conjuntoDoPlano\.diario/);
  // o calculo antigo inline (percentual x totalDaily) nao existe mais aqui
  assert.doesNotMatch(corpo, /Math\.round\(totalDaily \* pct\)/);
  assert.doesNotMatch(corpo, /currentAdSetBudget/);
});

test("tela tem a saida approveAdSetBudgetSum e o MCP nao grava diario x 30", () => {
  assert.match(ROTA, /approveAdSetBudgetSum: protectedProcedure/);
  assert.doesNotMatch(MCP, /dailyBudget \* 30/);
});

// Revisao Goldfish do diff (23/11), riscos 1, 3 e 5.
test("usar a soma como aprovado recusa conjunto em percentual (cada clique mudaria a soma)", () => {
  const c = camp(1, 10, 140, 14, ["20%", "40%", "40%"]);
  const r = somaComoAprovado(c);
  assert.ok("erro" in r && /valor diário fixo/.test(r.erro));
  const s = camp(2, 20, 280, 14, ["50%", "50%", "50%"]);
  assert.ok("erro" in somaComoAprovado(s));
});

test("texto do gerador arredondado ('R$ 16/dia (33%)' de R$ 50) nao e erro; legado sem /dia nao e comparado", () => {
  const p = planoDeOrcamento(camp(3, 50, 700, 14, ["R$ 16/dia (33% do total)", "R$ 17/dia (34% do total)", "R$ 16/dia (33% do total)"]));
  assert.ok(p.conjuntos.every((c) => !c.erro), p.detalhes.join(" | "));
  assert.equal(p.ok, true, p.motivo);
  const legado = planoDeOrcamento(camp(4, 50, 1500, 30, ["R$ 100 (33% do total)", "R$ 100 (33% do total)", "R$ 100 (34% do total)"]));
  assert.ok(legado.conjuntos.every((c) => !c.erro));
});

test("update_live_meta_campaign so reescreve o aprovado com um conjunto", () => {
  const ini = MCP.indexOf("caller.metaCampaigns.updateBudget({ adSetId: resolvedAdSetId");
  const trecho = MCP.slice(ini, ini + 1600);
  assert.match(trecho, /if \(qtdConjuntos === 1\)/);
  assert.match(trecho, /input\.dailyBudget \* dias/);
  assert.match(trecho, /o orcamento aprovado no MecProAI nao foi alterado/);
});
