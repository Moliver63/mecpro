/**
 * tiktokOrcamentoMinimo.ts — valor minimo aceitavel no TikTok Ads, na moeda da conta.
 *
 * Achado real (24/11, campanha 824): o chat tentou publicar com R$ 6/dia. O TikTok exige
 * orcamento diario do grupo de anuncios ACIMA de US$ 20 (campanha acima de US$ 50; o MecProAI
 * cria a campanha sem limite, entao vale o do grupo). A ajuda oficial so da o valor em dolar:
 * https://ads.tiktok.com/help/article/budget . Aqui o minimo vira moeda da conta pela cotacao
 * do dia, com folga, e o publicador recusa ANTES de criar qualquer coisa.
 */
import type { ClienteTikTok } from "./tiktokPublicar";

export const MINIMO_GRUPO_USD = 20;
/** Folga sobre a cotacao: o cambio do TikTok nao e o mesmo da API publica. */
export const FOLGA_CAMBIO = 1.05;
const URL_COTACAO = "https://open.er-api.com/v6/latest/USD";
const CACHE_MS = 12 * 60 * 60 * 1000;
/** Reserva quando a cotacao nao responde. Sobrescreve com TIKTOK_COTACAO_USD_<MOEDA>. */
const COTACAO_RESERVA: Record<string, number> = { USD: 1, BRL: 6.2, EUR: 1, MXN: 21, ARS: 1500, CLP: 1000, COP: 4500 };

export interface MinimoTikTok { moeda: string; minimo: number; cotacao: number; fonte: "api" | "reserva" | "dolar" }

let cache: { em: number; taxas: Record<string, number> } | null = null;
export function limparCacheCotacao(): void { cache = null; }

export async function cotacaoDoDolar(moeda: string, doFetch: typeof fetch = fetch, agora = Date.now()): Promise<{ cotacao: number; fonte: MinimoTikTok["fonte"] } | null> {
  const m = moeda.toUpperCase();
  if (m === "USD") return { cotacao: 1, fonte: "dolar" };
  if (!cache || agora - cache.em > CACHE_MS) {
    try {
      const r = await doFetch(URL_COTACAO, { signal: AbortSignal.timeout(5000) });
      const j: any = await r.json();
      if (j?.rates && typeof j.rates === "object") cache = { em: agora, taxas: j.rates };
    } catch { /* cai na reserva */ }
  }
  const daApi = Number(cache?.taxas?.[m]);
  if (daApi > 0) return { cotacao: daApi, fonte: "api" };
  const doEnv = Number(process.env[`TIKTOK_COTACAO_USD_${m}`]);
  if (doEnv > 0) return { cotacao: doEnv, fonte: "reserva" };
  return COTACAO_RESERVA[m] ? { cotacao: COTACAO_RESERVA[m], fonte: "reserva" } : null;
}

/** Valor inteiro na moeda da conta que passa com folga no "acima de US$ 20". */
export function minimoNaMoeda(cotacao: number, usd = MINIMO_GRUPO_USD): number {
  return Math.ceil(usd * cotacao * FOLGA_CAMBIO);
}

export async function moedaDaConta(c: ClienteTikTok, adv: string): Promise<string | null> {
  try {
    const d: any = await c.get("advertiser/info/", { advertiser_ids: [adv], fields: ["currency"] });
    const lista = Array.isArray(d) ? d : d?.list;
    const moeda = String(lista?.[0]?.currency || "").toUpperCase();
    return moeda || null;
  } catch { return null; }
}

/** Minimo diario do grupo na moeda da conta; null se nao der para saber (nao bloqueia). */
export async function minimoDiarioTikTok(c: ClienteTikTok, adv: string, doFetch: typeof fetch = fetch): Promise<MinimoTikTok | null> {
  const moeda = (await moedaDaConta(c, adv)) || "BRL";
  const cot = await cotacaoDoDolar(moeda, doFetch);
  if (!cot) return null;
  return { moeda, minimo: minimoNaMoeda(cot.cotacao), cotacao: cot.cotacao, fonte: cot.fonte };
}

/** Fonte oficial: https://ads.tiktok.com/help/article/budget (consultada em 25/11/2026). */
export const MINIMOS_OFICIAIS_USD = { diarioGrupo: 20, diarioCampanha: 50, vitalicioCampanha: 50 } as const;

export interface DetalheMinimo {
  moeda: string;
  cotacao: number;
  fonteCotacao: MinimoTikTok["fonte"];
  /** Nivel que vale para o MecProAI: ele cria a campanha SEM orcamento proprio (infinito), entao vale o do grupo. */
  nivelAplicado: "grupo";
  grupoDiario: { usd: number; estimativaNaMoeda: number; comMargemDe5pct: number };
  campanhaDiaria: { usd: number; estimativaNaMoeda: number; vale: false; motivo: string };
  vitalicio: { regra: string };
  /** O valor que a API do TikTok aceita so aparece na resposta dela ao criar; nao ha consulta previa. */
  observacao: string;
}

/** Os minimos oficiais, por nivel e na moeda da conta. Somente calculo: nao altera nem sugere alterar o orcamento. */
export function detalharMinimo(m: MinimoTikTok): DetalheMinimo {
  const est = (usd: number) => Math.round(usd * m.cotacao * 100) / 100;
  return {
    moeda: m.moeda,
    cotacao: m.cotacao,
    fonteCotacao: m.fonte,
    nivelAplicado: "grupo",
    grupoDiario: { usd: MINIMOS_OFICIAIS_USD.diarioGrupo, estimativaNaMoeda: est(MINIMOS_OFICIAIS_USD.diarioGrupo), comMargemDe5pct: m.minimo },
    campanhaDiaria: { usd: MINIMOS_OFICIAIS_USD.diarioCampanha, estimativaNaMoeda: est(MINIMOS_OFICIAIS_USD.diarioCampanha), vale: false, motivo: "O MecProAI cria a campanha sem orcamento proprio; o limite diario fica no grupo de anuncios." },
    vitalicio: { regra: "Orcamento vitalicio do grupo = dias de veiculacao (incluindo os passados) x minimo diario do grupo." },
    observacao: "A ajuda oficial so informa os valores em dolar e a conversao e do TikTok; o valor exato na moeda da conta so aparece na resposta da API ao criar o grupo. Por isso o MecProAI confere antes, com margem de 5%, e nunca altera o orcamento por conta propria.",
  };
}

export function textoMinimo(m: MinimoTikTok): string {
  const simbolo = m.moeda === "BRL" ? "R$ " : `${m.moeda} `;
  return `${simbolo}${m.minimo}/dia (o TikTok exige mais de US$ ${MINIMO_GRUPO_USD}/dia por grupo de anuncios${m.moeda === "USD" ? "" : `; cotacao ${m.cotacao.toFixed(2)}${m.fonte === "reserva" ? " de reserva" : " do dia"}, com folga de 5%`})`;
}

export class OrcamentoAbaixoDoMinimo extends Error {
  constructor(public valor: number, public min: MinimoTikTok) {
    super(`Orcamento diario ${valor} abaixo do minimo aceito pelo TikTok: ${textoMinimo(min)}. Nada foi criado no TikTok.`);
  }
}
