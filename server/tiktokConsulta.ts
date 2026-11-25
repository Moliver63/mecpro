/**
 * tiktokConsulta.ts — situacao de uma campanha no TikTok Ads (somente leitura).
 * campaign/get, adgroup/get e ad/get filtrados pela campanha: status, revisao e configuracao.
 */
import type { ClienteTikTok } from "./tiktokPublicar";

export interface SituacaoTikTok {
  campanha: { id: string; nome: string; objetivo: string; status: string; situacao?: string } | null;
  grupos: Array<{ id: string; nome: string; status: string; situacao?: string; orcamentoDiario?: number; otimizacao?: string; evento?: string; pixelId?: string }>;
  anuncios: Array<{ id: string; nome: string; status: string; situacao?: string; destino?: string; videoId?: string; motivoRecusa?: string }>;
}

const lista = (d: any): any[] => (Array.isArray(d) ? d : d?.list || []);

export async function consultarCampanhaTikTok(c: ClienteTikTok, adv: string, campaignId: string): Promise<SituacaoTikTok> {
  const filtro = { campaign_ids: [campaignId] };
  const [camps, grupos, ads] = await Promise.all([
    c.get("campaign/get/", { advertiser_id: adv, filtering: filtro, page_size: 10 }),
    c.get("adgroup/get/", { advertiser_id: adv, filtering: filtro, page_size: 20 }),
    c.get("ad/get/", { advertiser_id: adv, filtering: filtro, page_size: 50 }),
  ]);
  const camp = lista(camps)[0];
  return {
    campanha: camp ? { id: String(camp.campaign_id), nome: String(camp.campaign_name), objetivo: String(camp.objective_type || ""), status: String(camp.operation_status || ""), situacao: camp.secondary_status } : null,
    grupos: lista(grupos).map((g) => ({
      id: String(g.adgroup_id), nome: String(g.adgroup_name), status: String(g.operation_status || ""), situacao: g.secondary_status,
      orcamentoDiario: g.budget_mode === "BUDGET_MODE_DAY" ? Number(g.budget) : undefined,
      otimizacao: g.optimization_goal, evento: g.optimization_event, pixelId: g.pixel_id ? String(g.pixel_id) : undefined,
    })),
    anuncios: lista(ads).map((a) => ({
      id: String(a.ad_id), nome: String(a.ad_name), status: String(a.operation_status || ""), situacao: a.secondary_status,
      destino: a.landing_page_url, videoId: a.video_id, motivoRecusa: a.reject_reason || a.review_reject_reason || undefined,
    })),
  };
}

export function resumoDaSituacao(s: SituacaoTikTok): string {
  if (!s.campanha) return "Campanha nao encontrada nesta conta do TikTok.";
  const linhas = [`Campanha ${s.campanha.nome} (${s.campanha.id}): ${s.campanha.objetivo}, ${s.campanha.status}${s.campanha.situacao ? ` / ${s.campanha.situacao}` : ""}`];
  for (const g of s.grupos) linhas.push(`Grupo ${g.nome} (${g.id}): ${g.status}${g.situacao ? ` / ${g.situacao}` : ""}${g.orcamentoDiario ? `, ${g.orcamentoDiario}/dia` : ""}${g.otimizacao ? `, otimiza ${g.otimizacao}${g.evento ? ` (${g.evento})` : ""}` : ""}`);
  for (const a of s.anuncios) linhas.push(`Anuncio ${a.nome} (${a.id}): ${a.status}${a.situacao ? ` / ${a.situacao}` : ""}${a.motivoRecusa ? ` | recusa: ${a.motivoRecusa}` : ""}`);
  if (!s.anuncios.length) linhas.push("Sem anuncios nesta campanha.");
  return linhas.join("\n");
}
