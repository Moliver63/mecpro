/**
 * orcamentoDoRascunho.ts — uma unica verificacao do orcamento de um rascunho, usada
 * na geracao, na edicao (chat, tela, MCP) e antes de publicar.
 *
 * Revisao final 23/11: a soma dos conjuntos so era checada na publicacao. Rascunhos
 * nasciam e eram editados divergentes e o usuario descobria no ultimo clique. Aqui:
 *  - `verificarOrcamentoDoRascunho` junta o plano da publicacao (adSetBudgetPlan:
 *    diario por conjunto, soma x aprovado) com as regras por origem (metaBudgetRules:
 *    moeda, minimo da conta, recomendacao comercial);
 *  - `rebalancearConjuntos` redistribui o diario APROVADO entre os conjuntos, em reais
 *    inteiros (as colunas sao inteiras), sem nunca mudar o total.
 * Nada aqui aumenta orcamento.
 */
import { planoDeOrcamento, diarioAprovadoDaCampanha, PISO_DIARIO_POR_CONJUNTO, type PlanoDeOrcamento } from "./adSetBudgetPlan";
import { avaliarOrcamento, type AvisoDeOrcamento } from "./metaBudgetRules";
import { formatDailyBudget } from "./dailyBudget";

export type SituacaoDoOrcamento = "ok" | "divergente" | "sem_orcamento_aprovado" | "sem_conjuntos";

export interface VerificacaoDoOrcamento {
  situacao: SituacaoDoOrcamento;
  /** So `true` com situacao "ok" e sem aviso de bloqueio. */
  publicavel: boolean;
  aprovadoDiario: number | null;
  somaDiaria: number;
  dias: number;
  totalAutorizado: number | null;
  somaNoPeriodo: number;
  motivo?: string;
  detalhes: string[];
  avisos: AvisoDeOrcamento[];
  plano: PlanoDeOrcamento;
}

function dias(campaign: any): number {
  const n = Number(campaign?.durationDays);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export function verificarOrcamentoDoRascunho(
  campaign: any, opcoes: { moedaDaConta?: string | null; minimoDiarioDaConta?: number | null } = {},
): VerificacaoDoOrcamento {
  const plano = planoDeOrcamento(campaign);
  const aprovadoDiario = diarioAprovadoDaCampanha(campaign);
  const d = dias(campaign);
  const totalDeclarado = Number(campaign?.suggestedBudgetMonthly);
  const totalAutorizado = aprovadoDiario === null ? null : (Number.isFinite(totalDeclarado) && totalDeclarado > 0 ? totalDeclarado : aprovadoDiario * d);
  const base = { aprovadoDiario, somaDiaria: plano.soma, dias: d, totalAutorizado, somaNoPeriodo: Math.round(plano.soma * d * 100) / 100, detalhes: plano.detalhes, plano };

  if (plano.conjuntos.length === 0) {
    return { ...base, situacao: "sem_conjuntos", publicavel: false, motivo: "A campanha nao tem conjuntos de anuncios.", avisos: [] };
  }
  if (aprovadoDiario === null) {
    return { ...base, situacao: "sem_orcamento_aprovado", publicavel: false, motivo: "A campanha nao tem orcamento aprovado; sem ele a soma dos conjuntos nao tem base.", avisos: [] };
  }
  const { avisos } = avaliarOrcamento({
    orcamentoTotal: totalAutorizado ?? aprovadoDiario * d, dias: d, conjuntos: plano.conjuntos.length,
    moedaDaConta: opcoes.moedaDaConta ?? null, minimoDiarioDaConta: opcoes.minimoDiarioDaConta ?? null,
    orcamentosDiariosDosConjuntos: plano.ok ? plano.conjuntos.map((c) => c.diario) : undefined,
  });
  const bloqueioDeRegra = avisos.find((a) => a.severidade === "bloqueio");
  if (!plano.ok) {
    return { ...base, situacao: "divergente", publicavel: false, motivo: plano.motivo, avisos };
  }
  if (bloqueioDeRegra) {
    return { ...base, situacao: "divergente", publicavel: false, motivo: bloqueioDeRegra.mensagem, avisos };
  }
  return { ...base, situacao: "ok", publicavel: true, avisos };
}

/**
 * Redistribui o diario aprovado entre os conjuntos, em reais inteiros, mantendo a
 * proporcao que o rascunho ja tinha (ou igual, quando nao ha valor legivel). Cada
 * conjunto recebe antes o piso interno; o restante e dividido pelo peso (maior resto).
 * A soma fecha EXATAMENTE no aprovado. Se o aprovado nao comporta o piso em todos os
 * conjuntos, recusa: quem decide entre menos conjuntos ou mais verba e o usuario.
 */
export function rebalancearConjuntos(campaign: any): { ok: true; adSets: any[]; antes: string[]; depois: string[] } | { ok: false; erro: string } {
  const plano = planoDeOrcamento(campaign);
  const n = plano.conjuntos.length;
  if (n === 0) return { ok: false, erro: "A campanha nao tem conjuntos." };
  const aprovado = diarioAprovadoDaCampanha(campaign);
  if (aprovado === null) return { ok: false, erro: "A campanha nao tem orcamento aprovado." };
  if (!Number.isInteger(aprovado)) return { ok: false, erro: "O orcamento aprovado nao e inteiro em reais." };
  if (aprovado < PISO_DIARIO_POR_CONJUNTO * n) {
    return { ok: false, erro: `O orcamento aprovado (R$ ${aprovado}/dia) nao comporta ${n} conjunto(s) com o minimo interno de R$ ${PISO_DIARIO_POR_CONJUNTO}/dia cada. Reduza os conjuntos ou aprove um valor maior; o MecProAI nao aumenta o orcamento sozinho.` };
  }
  const pesosBrutos = plano.conjuntos.map((c) => (c.erro ? 0 : c.calculado));
  const somaPesos = pesosBrutos.reduce((a, b) => a + b, 0);
  const pesos = somaPesos > 0 ? pesosBrutos : pesosBrutos.map(() => 1);
  const total = pesos.reduce((a, b) => a + b, 0);
  const sobra = aprovado - PISO_DIARIO_POR_CONJUNTO * n;
  const quotas = pesos.map((p) => (p / total) * sobra);
  const base = quotas.map((q) => Math.floor(q));
  let faltam = sobra - base.reduce((a, b) => a + b, 0);
  const ordem = quotas.map((q, i) => ({ i, resto: q - Math.floor(q) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) { if (faltam <= 0) break; base[i]++; faltam--; }
  const valores = base.map((b) => b + PISO_DIARIO_POR_CONJUNTO);
  const lidos: any[] = Array.isArray(campaign?.adSets) ? campaign.adSets : (() => { try { return JSON.parse(campaign?.adSets || "[]"); } catch { return []; } })();
  const adSets = lidos.map((a, i) => { const { rawBudget: _r, ...resto } = a ?? {}; return { ...resto, budget: formatDailyBudget(valores[i]), _rebalanceado: true }; });
  return { ok: true, adSets, antes: lidos.map((a) => String(a?.budget ?? "sem valor")), depois: adSets.map((a) => a.budget) };
}

/** Frase curta para o usuario (chat, tela, MCP). */
export function resumoDoOrcamento(v: VerificacaoDoOrcamento): string {
  if (v.situacao === "ok") return `Orcamento dos conjuntos confere: R$ ${v.somaDiaria}/dia, dentro dos R$ ${v.aprovadoDiario}/dia aprovados.`;
  return `Orcamento dos conjuntos NAO confere e a publicacao fica bloqueada ate ajustar. ${v.motivo ?? ""}`.trim();
}
