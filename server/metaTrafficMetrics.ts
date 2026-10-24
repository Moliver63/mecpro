/**
 * Metricas de trafego REAL a partir de uma linha de insights da Meta.
 *
 * Pedido do Michel (24/10, campanha 804 da Shadia): o relatorio mostrava so
 * `clicks`, que na Meta e "todos os cliques" (curtir, expandir imagem, abrir
 * comentario, clicar no nome da Pagina). Numa campanha de trafego isso infla a
 * leitura: CTR de 3,7% "todos os cliques" nao diz quantas pessoas foram ao
 * site. As duas metricas que respondem isso:
 *
 *  - cliques no link: campo `inline_link_clicks` (fallback: acao `link_click`);
 *  - visualizacoes da pagina de destino: acao `landing_page_view` — so conta
 *    quando a pagina CARREGOU e o pixel disparou; sem pixel no site fica 0, e
 *    isso e informacao, nao erro.
 *
 * Puro, sem rede: o router pede os campos e chama isto em cada linha.
 */

export const CAMPOS_DE_TRAFEGO_META = "inline_link_clicks";

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function acao(row: any, tipo: string): number {
  const a = Array.isArray(row?.actions) ? row.actions.find((x: any) => x?.action_type === tipo) : null;
  return numero(a?.value);
}

export function trafegoDaLinha(row: any): { linkClicks: number; landingPageViews: number } {
  const inline = row?.inline_link_clicks;
  return {
    linkClicks: inline !== undefined && inline !== null && inline !== "" ? numero(inline) : acao(row, "link_click"),
    landingPageViews: acao(row, "landing_page_view"),
  };
}

/** Taxas derivadas. Zero quando o denominador e zero, nunca NaN/Infinity. */
export function taxasDeTrafego(t: { impressions: number; spend: number; linkClicks: number; landingPageViews: number }) {
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  return {
    linkCtr: div(t.linkClicks, t.impressions) * 100,
    costPerLinkClick: div(t.spend, t.linkClicks),
    costPerLandingPageView: div(t.spend, t.landingPageViews),
    // De cada 100 cliques no link, quantos viraram pagina carregada. Baixo
    // indica site lento, link quebrado ou pixel ausente.
    landingPageViewRate: div(t.landingPageViews, t.linkClicks) * 100,
  };
}
