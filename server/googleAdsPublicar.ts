/**
 * googleAdsPublicar.ts — conferencia da campanha de Pesquisa do Google antes de
 * chamar o publishToGoogle. Pura: sem rede e sem banco, para ser testada.
 *
 * Diferente do criador da tela (que ajusta o texto), aqui nada e cortado em
 * silencio: titulo acima de 30 ou descricao acima de 90 e RECUSADO com o texto
 * e o tamanho, para quem escreveu decidir como encurtar.
 */
import { GOOGLE_DESCRICAO_MAX, GOOGLE_TITULO_MAX, limparTextoGoogle } from "../shared/googleAdsTexto";

export type AnuncioPesquisa = { headlines: string[]; descriptions: string[]; finalUrl: string };

export type EntradaPesquisa = {
  campaignName: string;
  dailyBudgetReais: number;
  durationDays?: number;
  keywords: string[];
  negativeKeywords?: string[];
  ads: AnuncioPesquisa[];
};

export const GOOGLE_PESQUISA_MIN_TITULOS = 3;
export const GOOGLE_PESQUISA_MAX_TITULOS = 15;
export const GOOGLE_PESQUISA_MIN_DESCRICOES = 2;
export const GOOGLE_PESQUISA_MAX_DESCRICOES = 4;
/** Teto de seguranca por dia, em reais. Acima disso a ferramenta recusa e pede outra decisao. */
export const GOOGLE_ORCAMENTO_DIARIO_MAX = 500;

/** Lista de problemas; vazia quando a campanha pode ser publicada. */
export function conferirCampanhaPesquisa(e: EntradaPesquisa): string[] {
  const p: string[] = [];
  if (!String(e.campaignName ?? "").trim()) p.push("nome da campanha vazio");
  if (!(e.dailyBudgetReais > 0)) p.push("orcamento diario deve ser maior que zero");
  if (e.dailyBudgetReais > GOOGLE_ORCAMENTO_DIARIO_MAX) p.push(`orcamento diario acima de R$ ${GOOGLE_ORCAMENTO_DIARIO_MAX}: confirme o valor`);
  if (e.durationDays !== undefined && !(Number.isInteger(e.durationDays) && e.durationDays > 0)) p.push("duracao deve ser um numero inteiro de dias");
  if (!e.keywords?.length) p.push("sem palavras-chave: anuncio de Pesquisa nao aparece sem elas");
  if (!e.ads?.length) p.push("nenhum anuncio informado");

  e.ads?.forEach((ad, i) => {
    const n = `anuncio ${i + 1}`;
    const titulos = (ad.headlines ?? []).map(limparTextoGoogle).filter(Boolean);
    const descricoes = (ad.descriptions ?? []).map(limparTextoGoogle).filter(Boolean);
    if (titulos.length < GOOGLE_PESQUISA_MIN_TITULOS) p.push(`${n}: minimo de ${GOOGLE_PESQUISA_MIN_TITULOS} titulos`);
    if (titulos.length > GOOGLE_PESQUISA_MAX_TITULOS) p.push(`${n}: maximo de ${GOOGLE_PESQUISA_MAX_TITULOS} titulos`);
    if (descricoes.length < GOOGLE_PESQUISA_MIN_DESCRICOES) p.push(`${n}: minimo de ${GOOGLE_PESQUISA_MIN_DESCRICOES} descricoes`);
    if (descricoes.length > GOOGLE_PESQUISA_MAX_DESCRICOES) p.push(`${n}: maximo de ${GOOGLE_PESQUISA_MAX_DESCRICOES} descricoes`);
    titulos.forEach((t) => { if (t.length > GOOGLE_TITULO_MAX) p.push(`${n}: titulo com ${t.length} caracteres (maximo ${GOOGLE_TITULO_MAX}): "${t}"`); });
    descricoes.forEach((d) => { if (d.length > GOOGLE_DESCRICAO_MAX) p.push(`${n}: descricao com ${d.length} caracteres (maximo ${GOOGLE_DESCRICAO_MAX}): "${d}"`); });
    if (new Set(titulos.map((t) => t.toLowerCase())).size !== titulos.length) p.push(`${n}: titulos repetidos`);
    try {
      const u = new URL(String(ad.finalUrl ?? "").trim());
      if (u.protocol !== "https:") p.push(`${n}: a URL final deve ser https`);
    } catch { p.push(`${n}: URL final invalida`); }
  });
  return p;
}

/** YYYYMMDD no fuso de Sao Paulo, somando `dias`. */
export function dataGoogle(base: Date, dias = 0): string {
  const d = new Date(base.getTime() + dias * 86_400_000);
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/-/g, "");
  return partes;
}
