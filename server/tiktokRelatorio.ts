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
