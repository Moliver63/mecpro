// -- TikTok Ads: relatorio sincrono (GET, nao POST) ---------------------------
// /open_api/v1.3/report/integrated/get/ aceita SOMENTE GET com os parametros na
// query string. Um POST com body JSON recebe uma pagina HTML de erro do gateway
// e o res.json() estoura com "Unexpected token '<', \"<!DOCTYPE \"...", que foi
// exatamente o sintoma que cegou os relatorios de TikTok. data_level e
// obrigatorio quando dimensions inclui campaign_id. dimensions e metrics vao
// como strings JSON. Mesma forma que ja funciona em campaignRanking.
export async function tikTokReportGet(params: {
  advertiserId: string;
  accessToken?: string;
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  reportType?: string;
  dataLevel?: string;
  pageSize?: number;
  timeoutMs?: number;
}): Promise<any[]> {
  if (!params.accessToken) throw new Error("TikTok Ads sem access token salvo.");
  const query = new URLSearchParams({
    advertiser_id: String(params.advertiserId),
    report_type: params.reportType || "BASIC",
    data_level: params.dataLevel || "AUCTION_CAMPAIGN",
    dimensions: JSON.stringify(params.dimensions),
    metrics: JSON.stringify(params.metrics),
    start_date: params.startDate,
    end_date: params.endDate,
    page_size: String(params.pageSize ?? 100),
  });
  const resp = await fetch(
    `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${query.toString()}`,
    {
      headers: { "Access-Token": params.accessToken },
      signal: AbortSignal.timeout(params.timeoutMs ?? 15000),
    },
  );
  const raw = await resp.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `TikTok Ads respondeu HTTP ${resp.status} em formato nao-JSON: ${raw.slice(0, 160)}`,
    );
  }
  if (data.code !== 0) throw new Error(data.message || `Erro TikTok Ads API (code ${data.code})`);
  return (data.data?.list || []) as any[];
}

// Metricas de funil cujos nomes exatos na API v1.3 NAO foram confirmados na
// documentacao da TikTok: as paginas do portal so renderizam por JavaScript e
// ads.tiktok.com redireciona para elas. Fontes de terceiros (Supermetrics,
// Funnel) indicam que `engagements` e o "Clicks (All)" (todos os toques) e que
// existe um contador de "Landing page views (website)", sem dar a grafia da
// API. Em vez de adivinhar, cada candidata e sondada em uma chamada isolada e o
// que a API responder vai para o diagnostico do relatorio. Quando souber quais
// existem, reduza esta lista as que valem.
export const TIKTOK_METRICAS_DE_FUNIL_CANDIDATAS = [
  "engagements",
  "landing_page_view",
  "total_landing_page_view",
];

export type TikTokTentativaDeRelatorio = {
  ok: boolean;
  reportType: string;
  dimensions: string[];
  metrics: string[];
  linhas: number;
  rows: any[];
  erro?: string;
};

// Igual a tikTokReportGet, mas nunca lanca: devolve o que aconteceu. Serve para
// as chamadas acessorias do relatorio (quebras e sondagens), onde uma falha nao
// pode derrubar o resumo e o motivo dela precisa ficar visivel em vez de ser
// engolido por um .catch(() => []).
export async function tikTokReportTentar(params: {
  advertiserId: string;
  accessToken?: string;
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  reportType?: string;
  dataLevel?: string;
  pageSize?: number;
  timeoutMs?: number;
}): Promise<TikTokTentativaDeRelatorio> {
  const base = {
    ok: false,
    reportType: params.reportType || "BASIC",
    dimensions: params.dimensions,
    metrics: params.metrics,
    linhas: 0,
    rows: [] as any[],
  };
  try {
    const rows = await tikTokReportGet(params);
    return { ...base, ok: true, linhas: rows.length, rows };
  } catch (e: any) {
    return { ...base, erro: String(e?.message || "erro desconhecido").slice(0, 200) };
  }
}
