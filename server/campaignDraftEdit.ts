import { aplicarEdicaoDeTexto, type AuditorDeSegmento, type CampoDeTexto } from "./chatCreativeEdit";
import { diagnosticarRevisao, descreverDiagnostico, factsDaCampanha } from "./creativeReview";
import { formatDailyBudget } from "../shared/dailyBudget";

/**
 * Ajuste de RASCUNHO de campanha, sem tocar na Meta.
 *
 * Pedido real (20/10, campanha 799 da Shadia Hasan): orcamento por conjunto,
 * orcamento total, copy de um criativo e reexecutar a revisao, mantendo
 * rascunho. O MCP so tinha ferramentas de imagem, foto destaque e edicao de
 * campanha JA PUBLICADA (`update_live_meta_campaign`); o chat tem
 * `atualizar_orcamento_campanha` e `editar_criativo`, mas nao mexe no
 * orcamento total nem em gancho/roteiro. Puro: recebe a campanha e devolve o
 * que gravar; quem chama grava.
 *
 * Recusa campanha ja enviada a Meta: rascunho e o unico estado em que editar
 * aqui nao diverge do que esta rodando.
 */

const CAMPOS_DO_RASCUNHO: readonly CampoDeTexto[] = ["headline", "description", "copy", "cta", "hook", "pain", "solution", "script"];
const MINIMO_META_POR_CONJUNTO = 5.11; // mesmo valor de publishToMeta (router.ts)

export interface EdicaoDeCriativo {
  index: number;
  headline?: string; description?: string; copy?: string; cta?: string;
  hook?: string; pain?: string; solution?: string; script?: string;
  complianceNotes?: string;
}

export interface EntradaRascunho {
  /** Indices dos conjuntos que FICAM, na ordem atual. Os outros saem do rascunho. Aplicado antes de adSetBudgetsDaily. */
  keepAdSetIndexes?: number[];
  adSetBudgetsDaily?: number[];
  suggestedBudgetDaily?: number;
  suggestedBudgetMonthly?: number;
  creativeEdits?: EdicaoDeCriativo[];
  /**
   * Indices de criativos que o USUARIO aprovou explicitamente apesar do score
   * baixo. Mesma regra do chat (`aprovar_revisao_criativo`, decisao "So score
   * baixo"): so libera quando o unico motivo e score < 75. Aplicado depois das
   * edicoes de texto.
   */
  approveLowScoreCreatives?: number[];
  strategyReplacements?: Array<{ from: string; to: string }>;
  forbiddenTerms?: string[];
}

export interface ResultadoRascunho {
  erro?: string;
  detalhes?: unknown;
  /** Colunas a gravar. So as que mudaram. */
  patch?: { adSets?: string; creatives?: string; strategy?: string; suggestedBudgetDaily?: number; suggestedBudgetMonthly?: number };
  relatorio?: Record<string, unknown>;
}

function json<T>(texto: unknown, padrao: T): T {
  try { return texto ? JSON.parse(String(texto)) : padrao; } catch { return padrao; }
}

function valorEmReais(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
}

/** Troca texto so dentro de valores string do JSON, contando quantas trocas. */
function substituirEmStrings(valor: any, trocas: Array<{ from: string; to: string }>, contagem: number[]): any {
  if (typeof valor === "string") {
    let s = valor;
    trocas.forEach((t, i) => {
      const partes = s.split(t.from);
      if (partes.length > 1) { contagem[i] += partes.length - 1; s = partes.join(t.to); }
    });
    return s;
  }
  if (Array.isArray(valor)) return valor.map((v) => substituirEmStrings(v, trocas, contagem));
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, substituirEmStrings(v, trocas, contagem)]));
  return valor;
}

/** Trechos que citam dinheiro, pra quem chamou ver o que o "resumo" ainda diz. */
function mencoesDeValor(texto: string, limite = 12): string[] {
  const achados: string[] = [];
  const re = /R\$\s?\d[\d.,]*(?:\s*\/\s*(?:dia|m[eê]s))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) && achados.length < limite) {
    const ini = Math.max(0, m.index - 50);
    achados.push(texto.slice(ini, m.index + m[0].length + 30).replace(/\s+/g, " ").trim());
  }
  return achados;
}

function termosResiduais(valor: unknown, termos: string[]): Record<string, string[]> {
  const achados: Record<string, string[]> = {};
  const visitar = (v: unknown, caminho: string) => {
    if (typeof v === "string") {
      const baixo = v.toLowerCase();
      for (const t of termos) if (t && baixo.includes(t.toLowerCase())) (achados[t] ||= []).push(caminho);
    } else if (Array.isArray(v)) v.forEach((x, i) => visitar(x, `${caminho}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visitar(x, caminho ? `${caminho}.${k}` : k);
  };
  visitar(valor, "");
  return achados;
}

export function ajustarRascunhoCampanha(campaign: any, entrada: EntradaRascunho, auditarSegmento: AuditorDeSegmento, agora: () => Date = () => new Date()): ResultadoRascunho {
  const status = String(campaign?.publishStatus || "draft");
  if (campaign?.metaCampaignId || campaign?.publishedAt || (status !== "draft" && status !== "error" && status !== "failed")) {
    return { erro: `Campanha ${campaign?.id} ja foi enviada a Meta (status ${status}). Rascunho nao se edita aqui; use update_live_meta_campaign.` };
  }

  const patch: NonNullable<ResultadoRascunho["patch"]> = {};
  const avisos: string[] = [];
  const alteracoes: string[] = [];
  const facts = factsDaCampanha(campaign);

  // ── Orcamento por conjunto ────────────────────────────────────────────────
  let adSets: any[] = json(campaign.adSets, []);
  // Pedido real (20/10, 799): R$ 6/dia em 3 conjuntos da R$ 2 cada, abaixo do
  // minimo de publicacao; o Michel escolheu ficar com UM conjunto a R$ 6.
  if (entrada.keepAdSetIndexes !== undefined) {
    const k = entrada.keepAdSetIndexes;
    const unicos = Array.isArray(k) ? [...new Set(k)] : [];
    if (!unicos.length || unicos.length !== k.length || !unicos.every((i) => Number.isSafeInteger(i) && i >= 0 && i < adSets.length)) {
      return { erro: `keepAdSetIndexes precisa listar ao menos um conjunto existente, sem repetir (ha ${adSets.length}: 0 a ${adSets.length - 1}).` };
    }
    const removidos = adSets.map((a: any, i: number) => ({ a, i })).filter((x) => !unicos.includes(x.i));
    adSets = unicos.sort((a, b) => a - b).map((i) => adSets[i]);
    if (removidos.length) {
      alteracoes.push(...removidos.map((x) => `conjunto ${x.i} (${x.a?.name || "sem nome"}) removido do rascunho`));
      patch.adSets = JSON.stringify(adSets);
    }
  }
  if (entrada.adSetBudgetsDaily !== undefined) {
    const v = entrada.adSetBudgetsDaily;
    if (!Array.isArray(v) || v.length !== adSets.length || !v.every(valorEmReais)) {
      return { erro: `adSetBudgetsDaily precisa ter ${adSets.length} valor(es) em reais, um por conjunto, na ordem.` };
    }
    v.forEach((valor, i) => {
      const antes = adSets[i].budget;
      adSets[i] = { ...adSets[i], budget: formatDailyBudget(valor), _edited: true };
      delete adSets[i].rawBudget;
      alteracoes.push(`conjunto ${i} (${adSets[i].name || "sem nome"}): ${antes ?? "sem valor"} -> ${adSets[i].budget}`);
    });
    patch.adSets = JSON.stringify(adSets);
    const abaixo = v.map((valor, i) => ({ valor, i })).filter((x) => x.valor < MINIMO_META_POR_CONJUNTO);
    if (abaixo.length) {
      avisos.push(`Conjunto(s) ${abaixo.map((x) => x.i).join(", ")} abaixo do minimo de R$ ${MINIMO_META_POR_CONJUNTO.toFixed(2).replace(".", ",")}/dia por conjunto que a publicacao exige: o rascunho fica salvo, mas publicar vai ser recusado ate subir o valor ou reduzir o numero de conjuntos.`);
    }
  }

  // ── Orcamento total ──────────────────────────────────────────────────────
  if (entrada.suggestedBudgetDaily !== undefined) {
    if (!valorEmReais(entrada.suggestedBudgetDaily)) return { erro: "suggestedBudgetDaily invalido." };
    patch.suggestedBudgetDaily = entrada.suggestedBudgetDaily;
    alteracoes.push(`orcamento diario da campanha: ${campaign.suggestedBudgetDaily ?? "sem valor"} -> ${entrada.suggestedBudgetDaily}`);
  }
  if (entrada.suggestedBudgetMonthly !== undefined) {
    if (!valorEmReais(entrada.suggestedBudgetMonthly)) return { erro: "suggestedBudgetMonthly invalido." };
    patch.suggestedBudgetMonthly = entrada.suggestedBudgetMonthly;
    alteracoes.push(`orcamento total/mensal da campanha: ${campaign.suggestedBudgetMonthly ?? "sem valor"} -> ${entrada.suggestedBudgetMonthly}`);
  }
  if (entrada.adSetBudgetsDaily) {
    const soma = Math.round(entrada.adSetBudgetsDaily.reduce((a, b) => a + b, 0) * 100) / 100;
    const diario = patch.suggestedBudgetDaily ?? campaign.suggestedBudgetDaily;
    if (typeof diario === "number" && Math.abs(soma - diario) > 0.009) {
      avisos.push(`Soma dos conjuntos (R$ ${soma}) difere do orcamento diario da campanha (R$ ${diario}).`);
    }
  }

  // ── Criativos ────────────────────────────────────────────────────────────
  const creatives: any[] = json(campaign.creatives, []);
  for (const edicao of entrada.creativeEdits || []) {
    const i = edicao?.index;
    if (!Number.isSafeInteger(i) || i < 0 || !creatives[i]) return { erro: `Criativo ${i} nao existe nesta campanha (ha ${creatives.length}).` };
    const aplicado = aplicarEdicaoDeTexto(creatives[i], edicao as any, CAMPOS_DO_RASCUNHO, facts, auditarSegmento, agora);
    if ("erro" in aplicado) return { erro: `Criativo ${i}: ${aplicado.erro}`, detalhes: (aplicado as any).conflitos };
    let novo = aplicado.creative;
    if (typeof edicao.complianceNotes === "string" && edicao.complianceNotes.trim()) {
      novo = { ...novo, complianceNotes: edicao.complianceNotes.trim().slice(0, 300) };
    }
    creatives[i] = novo;
    alteracoes.push(`criativo ${i}: ${Object.keys(aplicado.mudancas).join(", ")}${edicao.complianceNotes ? ", complianceNotes" : ""}`);
  }
  if (entrada.creativeEdits?.length) patch.creatives = JSON.stringify(creatives);

  // ── Aprovacao de score baixo (pedido real 21/10, 799: "Aprovo os 4") ─────
  if (entrada.approveLowScoreCreatives !== undefined) {
    const lista = entrada.approveLowScoreCreatives;
    if (!Array.isArray(lista) || !lista.every((i) => Number.isSafeInteger(i) && i >= 0 && creatives[i])) {
      return { erro: `approveLowScoreCreatives tem indice inexistente (ha ${creatives.length} criativos).` };
    }
    const recusados: string[] = [];
    let aprovouAlgum = false;
    for (const i of [...new Set(lista)]) {
      const c = creatives[i];
      if (c?.needsReview !== true) continue;
      const d = diagnosticarRevisao(c, facts);
      if (!d.liberavelPorAprovacao) { recusados.push(descreverDiagnostico(i, d)); continue; }
      creatives[i] = { ...c, needsReview: false, reviewApprovedAt: agora().toISOString(), reviewApprovedBy: "user_via_mcp", reviewApprovalReason: "score_baixo", reviewApprovedScore: c.finalScore ?? null };
      alteracoes.push(`criativo ${i}: score ${d.score} aprovado pelo usuario`);
      aprovouAlgum = true;
    }
    if (recusados.length) avisos.push(...recusados.map((r) => `Nao aprovado (so score baixo e aprovavel): ${r}`));
    if (aprovouAlgum) patch.creatives = JSON.stringify(creatives);
  }

  // ── Resumo (strategy) ────────────────────────────────────────────────────
  const strategyBruta = String(campaign.strategy || "");
  let strategyFinal = strategyBruta;
  if (entrada.strategyReplacements?.length) {
    const trocas = entrada.strategyReplacements.filter((t) => t && typeof t.from === "string" && t.from && typeof t.to === "string");
    const contagem = trocas.map(() => 0);
    const parsed = json<any>(strategyBruta, null);
    strategyFinal = parsed !== null
      ? JSON.stringify(substituirEmStrings(parsed, trocas, contagem))
      : String(substituirEmStrings(strategyBruta, trocas, contagem));
    trocas.forEach((t, i) => alteracoes.push(`resumo: "${t.from}" -> "${t.to}" (${contagem[i]}x)`));
    if (strategyFinal !== strategyBruta) patch.strategy = strategyFinal;
  }

  // ── Revisao de todos os criativos, depois das mudancas ───────────────────
  const revisao = creatives.map((c: any, index: number) => {
    const d = diagnosticarRevisao(c, facts);
    return {
      index, headline: c?.headline || null, score: d.score,
      precisaRevisao: c?.needsReview === true,
      motivos: c?.needsReview === true ? d.motivos : [],
      ...(c?.needsReview === true ? { descricao: descreverDiagnostico(index, d) } : {}),
      aprovavelNoChat: c?.needsReview === true && d.liberavelPorAprovacao,
    };
  });

  const termos = (entrada.forbiddenTerms || []).filter((t) => typeof t === "string" && t.trim());
  return {
    patch,
    relatorio: {
      alteracoes, avisos,
      revisao,
      resumoOrcamento: {
        conjuntos: adSets.map((a: any, i: number) => ({ index: i, name: a?.name || null, budget: a?.budget || null })),
        suggestedBudgetDaily: patch.suggestedBudgetDaily ?? campaign.suggestedBudgetDaily ?? null,
        suggestedBudgetMonthly: patch.suggestedBudgetMonthly ?? campaign.suggestedBudgetMonthly ?? null,
        durationDays: campaign.durationDays ?? null,
      },
      valoresCitadosNoResumo: mencoesDeValor(strategyFinal),
      ...(termos.length ? { termosResiduais: termosResiduais({ creatives, strategy: json(strategyFinal, strategyFinal) }, termos) } : {}),
      factsSnapshot: facts ? "presente" : "AUSENTE: a publicacao vai exigir regenerar o rascunho",
      enviadoAMeta: false,
    },
  };
}
