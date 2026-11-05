// -- Funil de trafego normalizado entre Meta, Google e TikTok -----------------
// Cada plataforma chama "clique" uma coisa diferente, entao comparar cpc entre
// elas engana. Na Meta, `clicks` inclui curtir, comentar e expandir, e
// `linkClicks` e quem clicou no destino. No Google, `clicks` ja e o clique no
// anuncio que leva ao destino. No TikTok, fontes de terceiros (Supermetrics,
// Funnel) descrevem `clicks` como "cliques que levaram ao destino" e colocam
// todos os toques em `engagements` — leitura NAO confirmada na documentacao da
// TikTok, que nao pode ser consultada, e por isso declarada em `observacoes`.
//
// O degrau que de fato compara as plataformas e o custo por visualizacao da
// pagina: e o unico que mede ter levado uma pessoa ate o site. Onde a
// plataforma nao fornece o degrau, o campo e null — nunca zero, que seria lido
// como "ninguem chegou".

export type DegrausDoFunil = {
  cliquesTotais: number | null;
  cliquesNoDestino: number | null;
  visualizacoesDaPagina: number | null;
  conversoes: number | null;
  leads: number | null;
};

export type FunilDeTrafego = DegrausDoFunil & {
  custoPorCliqueNoDestino: number | null;
  custoPorVisualizacaoDaPagina: number | null;
  custoPorConversao: number | null;
  observacoes: string;
};

export const PLATAFORMAS_COM_FUNIL = ["meta", "google", "tiktok"] as const;
export type PlataformaComFunil = (typeof PLATAFORMAS_COM_FUNIL)[number];

const numeroOuNulo = (v: any): number | null =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);

const DEGRAUS: Record<PlataformaComFunil, (totals: any, plataforma: any) => DegrausDoFunil> = {
  meta: (t) => ({
    cliquesTotais: numeroOuNulo(t.clicks),
    cliquesNoDestino: numeroOuNulo(t.linkClicks),
    visualizacoesDaPagina: numeroOuNulo(t.landingPageViews),
    conversoes: numeroOuNulo(t.purchases),
    leads: numeroOuNulo(t.leads),
  }),
  google: (t) => ({
    // O Google Ads nao expoe visualizacao de pagina neste relatorio, e seu
    // `clicks` ja e clique que leva ao destino: nao existe um "clique total"
    // equivalente ao da Meta, entao fica null em vez de repetir o mesmo numero.
    cliquesTotais: null,
    cliquesNoDestino: numeroOuNulo(t.clicks),
    visualizacoesDaPagina: null,
    conversoes: numeroOuNulo(t.conversions),
    leads: null,
  }),
  tiktok: (t, plataforma) => {
    const funil = plataforma?.metricasDeFunil || {};
    const pagina = funil.landing_page_view ?? funil.total_landing_page_view;
    return {
      cliquesTotais: numeroOuNulo(funil.engagements),
      cliquesNoDestino: numeroOuNulo(t.clicks),
      visualizacoesDaPagina: numeroOuNulo(pagina),
      conversoes: numeroOuNulo(t.conversions),
      leads: null,
    };
  },
};

const OBSERVACOES: Record<PlataformaComFunil, string> = {
  meta: "cliquesTotais inclui interacoes sociais; cliquesNoDestino = link_click; visualizacoesDaPagina exige o pixel no site.",
  google: "o clicks do Google Ads ja e clique que leva ao destino; a API nao expoe visualizacao de pagina neste relatorio, por isso null.",
  tiktok: "mapear clicks como clique no destino vem de fontes de terceiros, nao da documentacao da TikTok; cliquesTotais e visualizacoesDaPagina dependem da sondagem em diagnostico.sondagemDeMetricas.",
};

const custo = (gasto: number, degrau: number | null): number | null =>
  degrau !== null && degrau > 0 ? gasto / degrau : null;

export function montarFunil(nome: PlataformaComFunil, plataforma: any): FunilDeTrafego {
  const totals = plataforma?.totals || {};
  const degraus = DEGRAUS[nome](totals, plataforma);
  const gasto = Number(totals.spend || 0);
  return {
    ...degraus,
    custoPorCliqueNoDestino: custo(gasto, degraus.cliquesNoDestino),
    custoPorVisualizacaoDaPagina: custo(gasto, degraus.visualizacoesDaPagina),
    custoPorConversao: custo(gasto, degraus.conversoes),
    observacoes: OBSERVACOES[nome],
  };
}

// Anexa `funil` a cada plataforma do relatorio que trouxe totais. Plataforma
// ausente, nao configurada ou que voltou com erro e deixada intacta: um funil
// zerado ali seria lido como desempenho ruim, e nao como ausencia de dado.
export function aplicarFunil(report: Record<string, any>): Record<string, any> {
  for (const nome of PLATAFORMAS_COM_FUNIL) {
    const plataforma = report?.[nome];
    if (!plataforma || plataforma.error || !plataforma.totals) continue;
    plataforma.funil = montarFunil(nome, plataforma);
  }
  return report;
}
