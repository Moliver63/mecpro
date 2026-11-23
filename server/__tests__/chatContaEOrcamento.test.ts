import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  selecionarContaMetaDaSessao, aplicarContaDaSessaoAoRascunho, contaDoRascunho, fraseDaEscolha, normalizarContasMeta,
  type ContaMeta, type DepsContaMeta, type SessaoDeConta, type ContaDaSessao,
} from "../metaAdAccountChoice";
import { avaliarOrcamento, minimoDaContaEmUnidadePrincipal, RECOMENDACAO_COMERCIAL_BRL_POR_CONJUNTO_DIA } from "../../shared/metaBudgetRules";
import { evaluateCampaignQualityGates } from "../../shared/campaignQualityGate";

// F5/F6 (auditoria 23/11): contas listadas e escolhidas ANTES de existir rascunho,
// sem campaignId, isoladas por usuario; regras de orcamento com a origem de cada numero.

const conta = (id: string, nome: string, extra: Partial<ContaMeta> = {}): ContaMeta =>
  ({ id, nome, status: 1, ativa: true, moeda: "BRL", origem: "direta", ...extra });
const C1 = conta("11111", "Conta Morebem");
const C2 = conta("22222", "Conta Cliente", { origem: "portfolio", portfolio: "BM Teste" });
const C_INATIVA = conta("33333", "Conta Suspensa", { status: 2, ativa: false });

function ambiente(opts: { contas?: ContaMeta[]; conexao?: string | null; completa?: boolean; dono?: number; publicada?: boolean } = {}) {
  const campaign: any = {
    id: 12, projectId: 4, name: "Rascunho", publishStatus: opts.publicada ? "success" : "draft", metaCampaignId: opts.publicada ? "9" : null,
    creatives: "[]", aiResponse: JSON.stringify({ campaignFacts: { x: 1 } }),
  };
  const estado = { conexao: opts.conexao === undefined ? null : opts.conexao, trocas: [] as string[], listagensPorUsuario: [] as number[] };
  const contas = opts.contas ?? [C1, C2];
  const deps: DepsContaMeta = {
    getCampaignById: async (id) => (id === 12 ? { ...campaign } : null),
    getProjectsByUserId: async (u) => (u === (opts.dono ?? 1) ? [{ id: 4 }] : [{ id: 99 }]),
    updateCampaignField: async (_i, _f, v) => { campaign.aiResponse = v; },
    listarContas: async (u) => { estado.listagensPorUsuario.push(u); return { ok: true, contas, completa: opts.completa }; },
    contaDaConexao: async () => estado.conexao,
    selecionarNaConexao: async (_u, id) => { estado.trocas.push(id); estado.conexao = id; },
  };
  let guardada: ContaDaSessao | null = null;
  const sessao: SessaoDeConta = { obter: () => guardada, gravar: (c) => { guardada = c; } };
  return { campaign, estado, deps, sessao, guardada: () => guardada };
}

// ── F5 ──────────────────────────────────────────────────────────────────────────

test("F5: lista as contas sem campaignId, so do usuario autenticado, sem gravar nem trocar nada", async () => {
  const a = ambiente();
  const r: any = await selecionarContaMetaDaSessao(7, {}, a.deps, "", a.sessao);
  assert.equal(r.ok, true);
  assert.deepEqual(r.contas.map((c: any) => c.nome), ["Conta Morebem", "Conta Cliente"]);
  assert.deepEqual(a.estado.listagensPorUsuario, [7], "a consulta e feita para o usuario que perguntou");
  assert.equal(a.guardada(), null);
  assert.deepEqual(a.estado.trocas, []);
  assert.equal(contaDoRascunho(a.campaign), null);
});

test("F5: uma unica conta e usada e dita, sem pedir escolha e sem mexer na conexao", async () => {
  const a = ambiente({ contas: [C1], conexao: null });
  const r: any = await selecionarContaMetaDaSessao(1, {}, a.deps, "", a.sessao);
  assert.equal(r.unicaContaDisponivel, true);
  assert.equal(a.guardada()?.id, C1.id);
  assert.deepEqual(a.estado.trocas, []);
});

test("F5: lista possivelmente incompleta ou conexao em outra conta nao escolhe sozinha", async () => {
  const incompleta = ambiente({ contas: [C1], conexao: C1.id, completa: false });
  await selecionarContaMetaDaSessao(1, {}, incompleta.deps, "", incompleta.sessao);
  assert.equal(incompleta.guardada(), null);
  const outraConexao = ambiente({ contas: [C1], conexao: C2.id });
  await selecionarContaMetaDaSessao(1, {}, outraConexao.deps, "", outraConexao.sessao);
  assert.equal(outraConexao.guardada(), null);
});

test("F5: escolher exige a frase do usuario, que vale so para aquele usuario e aquela conta", async () => {
  const a = ambiente();
  const sem: any = await selecionarContaMetaDaSessao(1, { adAccountId: C2.id }, a.deps, "sim, essa", a.sessao);
  assert.equal(sem.ok, false); assert.equal(sem.confirmationRequired, true);
  assert.match(sem.erro, new RegExp(fraseDaEscolha(1, 0, C2.id)));
  assert.equal(a.guardada(), null);
  const outroUsuario: any = await selecionarContaMetaDaSessao(1, { adAccountId: C2.id }, a.deps, fraseDaEscolha(2, 0, C2.id), a.sessao);
  assert.equal(outroUsuario.ok, false);
  const outraConta: any = await selecionarContaMetaDaSessao(1, { adAccountId: C2.id }, a.deps, fraseDaEscolha(1, 0, C1.id), a.sessao);
  assert.equal(outraConta.ok, false);
  const certa: any = await selecionarContaMetaDaSessao(1, { adAccountId: C2.id }, a.deps, fraseDaEscolha(1, 0, C2.id), a.sessao);
  assert.equal(certa.ok, true);
  assert.equal(a.guardada()?.id, C2.id);
  assert.deepEqual(a.estado.trocas, [], "so a criacao do rascunho troca a conexao");
});

test("F5: conta fora da lista autorizada, inativa ou em formato invalido e rejeitada", async () => {
  const a = ambiente({ contas: [C1, C_INATIVA] });
  for (const id of ["99999", "act_99999"]) {
    const r: any = await selecionarContaMetaDaSessao(1, { adAccountId: id }, a.deps, fraseDaEscolha(1, 0, id.replace("act_", "")), a.sessao);
    assert.equal(r.ok, false); assert.match(r.erro, /autorizadas/);
  }
  const inativa: any = await selecionarContaMetaDaSessao(1, { adAccountId: C_INATIVA.id }, a.deps, fraseDaEscolha(1, 0, C_INATIVA.id), a.sessao);
  assert.equal(inativa.ok, false); assert.match(inativa.erro, /nao esta ativa/);
  const lixo: any = await selecionarContaMetaDaSessao(1, { adAccountId: "abc; DROP" }, a.deps, "", a.sessao);
  assert.equal(lixo.ok, false);
  assert.equal(a.guardada(), null);
});

test("F5: ao criar o rascunho a conta da conversa entra como SUGESTAO: conexao intacta, nao confirmada, resto do aiResponse preservado", async () => {
  const a = ambiente({ conexao: C1.id });
  a.sessao.gravar({ id: C2.id, nome: C2.nome, moeda: "BRL", escolhidaEm: "x" });
  const r = await aplicarContaDaSessaoAoRascunho(1, 12, a.sessao, a.deps);
  assert.equal(r.status, "sugerida");
  assert.deepEqual(a.estado.trocas, [], "a conexao Meta nao muda na sugestao");
  assert.equal(contaDoRascunho(a.campaign)?.id, C2.id);
  assert.equal(contaDoRascunho(a.campaign)?.confirmada, false);
  assert.deepEqual(JSON.parse(a.campaign.aiResponse).campaignFacts, { x: 1 }, "o resto do aiResponse e preservado");
});

test("F5: sem escolha nada acontece; escolha que perdeu a autorizacao e descartada; campanha publicada ou alheia nao muda", async () => {
  const sem = ambiente();
  assert.deepEqual(await aplicarContaDaSessaoAoRascunho(1, 12, sem.sessao, sem.deps), { status: "sem_escolha" });
  const perdida = ambiente({ contas: [C1] });
  perdida.sessao.gravar({ id: C2.id, nome: C2.nome, moeda: "BRL", escolhidaEm: "x" });
  const r1 = await aplicarContaDaSessaoAoRascunho(1, 12, perdida.sessao, perdida.deps);
  assert.equal(r1.status, "falhou");
  assert.equal(perdida.guardada(), null);
  const pub = ambiente({ publicada: true });
  pub.sessao.gravar({ id: C1.id, nome: C1.nome, moeda: "BRL", escolhidaEm: "x" });
  assert.equal((await aplicarContaDaSessaoAoRascunho(1, 12, pub.sessao, pub.deps)).status, "falhou");
  assert.deepEqual(pub.estado.trocas, []);
  const alheia = ambiente({ dono: 5 });
  alheia.sessao.gravar({ id: C1.id, nome: C1.nome, moeda: "BRL", escolhidaEm: "x" });
  assert.equal((await aplicarContaDaSessaoAoRascunho(1, 12, alheia.sessao, alheia.deps)).status, "falhou");
  assert.deepEqual(alheia.estado.trocas, []);
  assert.equal(contaDoRascunho(alheia.campaign), null);
});

test("F5: o chat despacha sem campaignId para a escolha da conversa e aplica a conta ao criar o rascunho", () => {
  const fonte = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  assert.match(fonte, /limpos\.campaignId === undefined/);
  assert.match(fonte, /selecionarContaMetaDaSessao\(userId, limpos, deps, mensagem, sessaoDeConta\(estado\)\)/);
  assert.match(fonte, /aplicarContaDaSessaoAoRascunho\(userId, campanha\.id/);
  assert.doesNotMatch(fonte, /PARAMETROS_CONTA_META = \{[\s\S]*?required: \["campaignId"\]/);
  // O modelo nao grava a conta por atualizar_briefing: o campo nao esta na lista de campos aceitos.
  const briefing = readFileSync(new URL("../chatBriefing.ts", import.meta.url), "utf8");
  assert.doesNotMatch(briefing.slice(0, briefing.indexOf("export function campaignResultText")), /strings = \[[^\]]*metaAdAccount/);
});

test("F5: o minimo diario da conta vem da API, na unidade principal da moeda", () => {
  assert.equal(minimoDaContaEmUnidadePrincipal("600", "BRL"), 6);
  assert.equal(minimoDaContaEmUnidadePrincipal(100, "USD"), 1);
  assert.equal(minimoDaContaEmUnidadePrincipal("150", "JPY"), 150);
  assert.equal(minimoDaContaEmUnidadePrincipal(undefined, "BRL"), null);
  assert.equal(minimoDaContaEmUnidadePrincipal("0", "BRL"), null);
  const lista = normalizarContasMeta([{ id: "act_11111", name: "A", account_status: 1, currency: "BRL", min_daily_budget: "600" }], []);
  assert.equal(lista[0].minimoDiario, 6);
});

// ── F6 ──────────────────────────────────────────────────────────────────────────

test("F6: a recomendacao comercial nao e apresentada como exigencia da Meta e o valor pedido nunca sobe", () => {
  const r = avaliarOrcamento({ orcamentoTotal: 180, dias: 30, conjuntos: 3 });
  assert.equal(r.diarioPedido, 6);
  const rec = r.avisos.find((a) => a.codigo === "abaixo_da_recomendacao_comercial");
  assert.ok(rec);
  assert.equal(rec!.origem, "recomendacao_comercial");
  assert.match(rec!.mensagem, /nao e exigencia da Meta/);
  assert.match(rec!.mensagem, /nao foi alterado/);
  assert.equal(r.avisos.some((a) => a.origem === "api_meta" && a.severidade !== "info"), false);
  assert.equal(RECOMENDACAO_COMERCIAL_BRL_POR_CONJUNTO_DIA, 5.11);
});

test("F6: o piso da conta so aparece com origem api_meta quando a API informou", () => {
  const com = avaliarOrcamento({ orcamentoTotal: 150, dias: 30, conjuntos: 1, moedaDaConta: "BRL", minimoDiarioDaConta: 6 });
  const aviso = com.avisos.find((a) => a.codigo === "abaixo_do_minimo_da_conta");
  assert.equal(aviso?.origem, "api_meta");
  assert.match(aviso!.mensagem, /alguns objetivos exigem mais/i);
  const sem = avaliarOrcamento({ orcamentoTotal: 150, dias: 30, conjuntos: 1 });
  assert.ok(sem.avisos.some((a) => a.codigo === "minimo_da_conta_indisponivel" && a.severidade === "info"));
  assert.equal(sem.avisos.some((a) => a.codigo === "abaixo_do_minimo_da_conta"), false);
  const ok = avaliarOrcamento({ orcamentoTotal: 900, dias: 30, conjuntos: 3, minimoDiarioDaConta: 6 });
  assert.equal(ok.avisos.some((a) => a.severidade !== "info"), false);
});

test("F6: conta em outra moeda nao recebe a referencia em reais", () => {
  const r = avaliarOrcamento({ orcamentoTotal: 60, dias: 30, conjuntos: 3, moedaDaConta: "USD" });
  assert.ok(r.avisos.some((a) => a.codigo === "moeda_diferente_de_brl"));
  assert.equal(r.avisos.some((a) => a.codigo === "abaixo_da_recomendacao_comercial"), false);
});

test("F6: a soma dos conjuntos nunca passa do total autorizado (regra interna, bloqueio)", () => {
  const dentro = avaliarOrcamento({ orcamentoTotal: 900, dias: 30, conjuntos: 3, orcamentosDiariosDosConjuntos: [10, 10, 10] });
  assert.equal(dentro.avisos.some((a) => a.codigo === "soma_dos_conjuntos_excede_o_total"), false);
  const fora = avaliarOrcamento({ orcamentoTotal: 900, dias: 30, conjuntos: 3, orcamentosDiariosDosConjuntos: [10, 10, 10.5] });
  const aviso = fora.avisos.find((a) => a.codigo === "soma_dos_conjuntos_excede_o_total");
  assert.equal(aviso?.severidade, "bloqueio");
  assert.equal(aviso?.origem, "regra_interna");
  // Uma casa de arredondamento nao vira falso bloqueio.
  const borda = avaliarOrcamento({ orcamentoTotal: 100, dias: 3, conjuntos: 3, orcamentosDiariosDosConjuntos: [11.11, 11.11, 11.11] });
  assert.equal(borda.avisos.some((a) => a.codigo === "soma_dos_conjuntos_excede_o_total"), false);
});

test("F6: o portao de publicacao fala em recomendacao do MecProAI, nao em minimo da Meta, e usa o piso da conta quando existe", () => {
  const perfil = { companyName: "X", niche: "servicos", productService: "limpeza", targetAudience: "familias", whatsapp: "47999990000" };
  const base = { action: "publish", objective: "leads", platform: "meta", budget: 180, duration: 30, adSetsCount: 3, creativesCount: 1, factValidationStatus: "passed", metaPublishConfirmed: true } as any;
  const texto = (r: any) => JSON.stringify(r);
  const semConta = texto(evaluateCampaignQualityGates(base, perfil, { name: "p" }));
  assert.match(semConta, /Recomendacao do MecProAI/);
  assert.doesNotMatch(semConta, /minimo recomendado pela Meta/);
  const comConta = texto(evaluateCampaignQualityGates({ ...base, metaMinDailyPerAdSet: 7, metaAccountCurrency: "BRL" }, perfil, { name: "p" }));
  assert.match(comConta, /conta de anuncios informa minimo diario de 7\.00/);
});

test("revisao final: a conta da conversa nunca vira autorizacao automatica nem troca a conexao ao gerar o rascunho", () => {
  const chat = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  assert.doesNotMatch(chat, /usadaNaCampanha/);
  assert.match(chat, /apenas como SUGESTAO/);
  assert.match(chat, /Ainda NAO confirmada para esta campanha/);
  const choice = readFileSync(new URL("../metaAdAccountChoice.ts", import.meta.url), "utf8");
  const trecho = choice.slice(choice.indexOf("export async function aplicarContaDaSessaoAoRascunho"), choice.indexOf("export async function exigirContaDoRascunho"));
  assert.doesNotMatch(trecho, /aplicar\(/, "a sugestao nao chama o caminho que troca a conexao");
});

test("Goldfish: tolerancia de centavos nao bloqueia soma correta de conjuntos arredondados", () => {
  const ok = avaliarOrcamento({ orcamentoTotal: 1000, dias: 30, conjuntos: 2, orcamentosDiariosDosConjuntos: [17, 17] });
  assert.equal(ok.avisos.some((a) => a.codigo === "soma_dos_conjuntos_excede_o_total"), false);
  const estoura = avaliarOrcamento({ orcamentoTotal: 1000, dias: 30, conjuntos: 2, orcamentosDiariosDosConjuntos: [30, 30] });
  assert.equal(estoura.avisos.some((a) => a.codigo === "soma_dos_conjuntos_excede_o_total"), true);
});
