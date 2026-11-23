/**
 * adSetBudgetPlan.ts — o diario de cada conjunto exatamente como a publicacao
 * manda para a Meta, e a soma comparada com o diario aprovado.
 *
 * Achado real (auditoria de 23/11). O calculo morava inline em `publishToMeta`
 * e nada comparava a soma dos conjuntos com o diario aprovado:
 *   - 816: conjuntos "2000 | 1500 | 1500" com R$ 6/dia aprovados viravam
 *     ~R$ 67 + 50 + 50 = R$ 167/dia (numero acima de 100 = mensal / 30).
 *   - 814 (publicada): "R$ 42/dia (50% do total)" x 2 com R$ 6/dia: o
 *     percentual vence, R$ 3 cada, elevado em silencio ao piso de R$ 6 =
 *     R$ 12/dia, o dobro do aprovado.
 *   - 795: "R$ 40/dia (100%)" com R$ 90; 799: R$ 6 + 2 + 2 com R$ 6.
 * A validacao antecipada usava outro parser ("R$ 42/dia (50%)" virava 42 la
 * e 3 aqui). Agora as duas usam esta funcao (regra 8 do checklist Goldfish:
 * uma regra, uma implementacao).
 *
 * As regras por conjunto sao as mesmas de antes (fix 80f9f2e e 13/08/2026:
 * numero puro 0-100 = percentual). O que muda e que a divergencia entre a
 * soma e o aprovado vira pendencia que bloqueia a publicacao, em vez de
 * gasto diferente do aprovado sem aviso.
 */
import { parseDailyBudget } from "./dailyBudget";

/** Piso que a publicacao aplica por conjunto (Meta exige R$ 5,11). */
export const PISO_DIARIO_POR_CONJUNTO = 6;

export type OrigemDoValor =
  | "diario_explicito"
  | "percentual"
  | "reais_mensal"
  | "numero_percentual"
  | "numero_mensal"
  | "divisao_igual";

export interface ConjuntoDoPlano {
  indice: number;
  nome: string;
  bruto: string;
  /** Valor que vai para a Meta, em reais por dia (depois do piso). */
  diario: number;
  /** Valor antes do piso. */
  calculado: number;
  origem: OrigemDoValor;
  elevadoAoPiso: boolean;
  erro?: string;
}

export interface PlanoDeOrcamento {
  conjuntos: ConjuntoDoPlano[];
  /** Diario aprovado da campanha; null quando a campanha nao tem orcamento. */
  aprovadoDiario: number | null;
  soma: number;
  tolerancia: number;
  ok: boolean;
  /** Frase pronta para o usuario quando `ok` e false. */
  motivo?: string;
  /** Uma linha por conjunto, para listar na pendencia/erro. */
  detalhes: string[];
}

function numeroPositivo(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function reais(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

/**
 * Diario aprovado: `suggestedBudgetDaily`; sem ele, total do periodo
 * (`suggestedBudgetMonthly`, que guarda o total do periodo) / `durationDays`.
 */
export function diarioAprovadoDaCampanha(campaign: any): number | null {
  const diario = numeroPositivo(campaign?.suggestedBudgetDaily);
  if (diario !== null) return diario;
  const total = numeroPositivo(campaign?.suggestedBudgetMonthly);
  if (total === null) return null;
  const dias = numeroPositivo(campaign?.durationDays) ?? 30;
  return Math.round(total / dias);
}

function lerConjuntos(campaign: any): any[] {
  const bruto = campaign?.adSets;
  if (Array.isArray(bruto)) return bruto;
  try { const v = JSON.parse(bruto || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function planoDeOrcamento(campaign: any): PlanoDeOrcamento {
  const adSets = lerConjuntos(campaign);
  const aprovado = diarioAprovadoDaCampanha(campaign);
  // Base dos percentuais = diario aprovado. As regras de texto do conjunto
  // sao as antigas: "R$ X" sem "/dia" e numero acima de 100 continuam lidos
  // como mensal / 30 (formato legado de rascunhos antigos). Se isso der um
  // valor diferente do aprovado, a soma diverge e a publicacao recusa com a
  // lista, em vez de publicar outro valor. Sem diario aprovado nao ha base e
  // o plano nao e publicavel (o calculo antigo usava 1000/30).
  const base = aprovado ?? 0;
  const conjuntos: ConjuntoDoPlano[] = adSets.map((adSet: any, indice: number) => {
    const bruto = String(adSet?.budget ?? "");
    const nome = String(adSet?.name || `Conjunto ${indice + 1}`);
    const pct = bruto.match(/(\d+(?:\.\d+)?)\s*%/);
    const terminaEmDia = /\/dia\s*$/i.test(bruto);
    const explicito = terminaEmDia ? parseDailyBudget(bruto) : null;
    let calculado: number;
    let origem: OrigemDoValor;
    let erro: string | undefined;
    if (terminaEmDia && explicito === null) {
      erro = `orçamento diário inválido ("${bruto}")`;
      calculado = 0; origem = "diario_explicito";
    } else if (explicito !== null) {
      calculado = explicito; origem = "diario_explicito";
    } else if (pct) {
      calculado = Math.max(1, Math.round(base * (parseFloat(pct[1]) / 100))); origem = "percentual";
      // O texto pode mostrar um valor em reais que nao e o que vai para a
      // Meta (795: "R$ 40/dia (100% do total)" com R$ 90 aprovados publica
      // R$ 90). Quem aprova le o R$; a divergencia vira erro do conjunto.
      const mostrado = bruto.match(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
      if (mostrado) {
        const valorMostrado = parseDailyBudget(mostrado[1]);
        if (valorMostrado !== null && Math.abs(valorMostrado - calculado) > 0.5) {
          erro = `o texto mostra ${reais(valorMostrado)}/dia, mas ${pct[1]}% do aprovado dá ${reais(calculado)}/dia`;
        }
      }
    } else if (/R\$[\s]?([\d.,]+)/.test(bruto)) {
      const m = bruto.match(/R\$[\s]?([\d.,]+)/)!;
      const mensal = parseFloat((m[1] || "100").replace(/\./g, "").replace(",", "."));
      calculado = Math.max(1, Math.round(mensal / 30)); origem = "reais_mensal";
    } else if (/^[\d.]+$/.test(bruto)) {
      const n = parseFloat(bruto);
      if (n > 0 && n <= 100) { calculado = Math.max(1, Math.round(base * (n / 100))); origem = "numero_percentual"; }
      else { calculado = Math.max(1, Math.round(n / 30)); origem = "numero_mensal"; }
    } else {
      calculado = Math.max(1, Math.round(base / (adSets.length || 4))); origem = "divisao_igual";
    }
    let diario = calculado;
    let elevadoAoPiso = false;
    if (!erro && diario < PISO_DIARIO_POR_CONJUNTO) {
      if (origem === "diario_explicito") {
        erro = `${reais(diario)}/dia está abaixo do mínimo de ${reais(PISO_DIARIO_POR_CONJUNTO)}/dia por conjunto`;
      } else {
        diario = PISO_DIARIO_POR_CONJUNTO;
        elevadoAoPiso = true;
      }
    }
    return { indice, nome, bruto, diario, calculado, origem, elevadoAoPiso, erro };
  });

  const soma = Math.round(conjuntos.reduce((s, c) => s + (c.erro ? 0 : c.diario), 0) * 100) / 100;
  const tolerancia = 0.5 * Math.max(conjuntos.length, 1);
  const detalhes = conjuntos.map((c) => {
    const valor = c.erro ? c.erro : `${reais(c.diario)}/dia${c.elevadoAoPiso ? ` (calculado ${reais(c.calculado)}, elevado ao mínimo de ${reais(PISO_DIARIO_POR_CONJUNTO)})` : ""}`;
    return `${c.nome}: "${c.bruto || "sem valor"}" → ${valor}`;
  });

  let motivo: string | undefined;
  const comErro = conjuntos.filter((c) => c.erro);
  if (conjuntos.length === 0) {
    motivo = undefined; // "sem conjuntos" ja e pendencia propria
  } else if (aprovado === null) {
    motivo = "A campanha não tem orçamento diário aprovado. Defina o orçamento antes de publicar.";
  } else if (comErro.length) {
    motivo = `Há conjunto com orçamento inválido: ${comErro.map((c) => `${c.nome} (${c.erro})`).join("; ")}.`;
  } else if (Math.abs(soma - aprovado) > tolerancia) {
    motivo = `A soma dos conjuntos (${reais(soma)}/dia) não bate com o orçamento diário aprovado (${reais(aprovado)}/dia). ` +
      `Ajuste o orçamento de cada conjunto (digite no formato "R$ 6/dia") ou use a soma como orçamento aprovado; nada foi enviado à Meta.`;
  }
  const ok = conjuntos.length > 0 ? motivo === undefined : true;
  return { conjuntos, aprovadoDiario: aprovado, soma, tolerancia, ok, motivo, detalhes };
}

/**
 * Saida da pendencia "orcamento_divergente" quando a soma dos conjuntos e o
 * valor que o usuario quer (ex.: dois conjuntos de R$ 6 com R$ 6 aprovados):
 * o diario aprovado passa a ser a soma e o total do periodo, soma x dias.
 * So para rascunho (campanha sem metaCampaignId) e sem conjunto invalido.
 * Nunca e aplicado sozinho: tela, chat e MCP so chamam com pedido explicito.
 */
export function somaComoAprovado(campaign: any): { erro: string } | { suggestedBudgetDaily: number; suggestedBudgetMonthly: number; soma: number; dias: number } {
  if (campaign?.metaCampaignId) return { erro: "Campanha já publicada: o orçamento aprovado não é alterado por aqui." };
  const plano = planoDeOrcamento(campaign);
  if (plano.conjuntos.length === 0) return { erro: "A campanha não tem conjuntos de anúncios." };
  const invalidos = plano.conjuntos.filter((c) => c.erro);
  if (invalidos.length) return { erro: `Corrija antes o orçamento inválido: ${invalidos.map((c) => `${c.nome} (${c.erro})`).join("; ")}.` };
  const dias = numeroPositivo(campaign?.durationDays) ?? 30;
  return {
    // Colunas inteiras no banco (schema.ts): reais sem centavos. O
    // arredondamento cabe na tolerancia de R$ 0,50 por conjunto.
    suggestedBudgetDaily: Math.round(plano.soma),
    suggestedBudgetMonthly: Math.round(plano.soma * dias),
    soma: plano.soma,
    dias,
  };
}

/**
 * Total do periodo que a campanha realmente gasta: diario aprovado x dias.
 * Preferido a ler `suggestedBudgetMonthly` para exibir: em 23/11, 308 de 707
 * campanhas tinham essa coluna diferente de diario x dias (205 gravadas como
 * diario x 30 com outra duracao).
 */
export function totalDoPeriodoDaCampanha(campaign: any): { diario: number; dias: number; total: number } | null {
  const diario = diarioAprovadoDaCampanha(campaign);
  if (diario === null) return null;
  const dias = numeroPositivo(campaign?.durationDays) ?? 30;
  return { diario, dias, total: Math.round(diario * dias * 100) / 100 };
}
