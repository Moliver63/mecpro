/**
 * tiktokPublicar.ts — cria campanha de TRAFEGO no TikTok Ads (Marketing API v1.3),
 * sempre PAUSADA: campanha, grupo e anuncios nascem DISABLE; nada gasta ate o
 * usuario ativar no Ads Manager.
 *
 * Substitui o fluxo antigo do publishToTikTok, que tinha defeitos:
 *  - lia o video_id no lugar errado (o upload nunca anexava o video);
 *  - usava upload_type PULL_FROM_URL (o valor e UPLOAD_BY_URL);
 *  - mandava location_ids ["BR"] (o TikTok quer o ID numerico: Brasil = 3469034);
 *  - criava o grupo de anuncios ATIVO;
 *  - nao informava a identidade (perfil autor), obrigatoria em anuncio de video.
 * Todas as chamadas devolvem o erro do TikTok sem mascarar, para ajuste rapido.
 */

export const TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3/";
export const TIKTOK_BRASIL_LOCATION_ID = "3469034";

export interface ClienteTikTok {
  post<T = any>(path: string, body: Record<string, unknown>): Promise<T>;
  get<T = any>(path: string, params: Record<string, unknown>): Promise<T>;
}

export function criarClienteTikTok(token: string, fetchImpl: typeof fetch = fetch): ClienteTikTok {
  async function chamar(path: string, init: RequestInit, url = TIKTOK_BASE + path) {
    const res = await fetchImpl(url, init);
    let corpo: any;
    try { corpo = await res.json(); } catch { throw new Error(`TikTok [${path}] HTTP ${res.status} sem JSON`); }
    if (Number(corpo?.code) !== 0) throw new Error(`TikTok [${path}] ${corpo?.code}: ${corpo?.message || JSON.stringify(corpo)}`);
    return corpo.data;
  }
  return {
    post: (path, body) => chamar(path, {
      method: "POST", headers: { "Content-Type": "application/json", "Access-Token": token }, body: JSON.stringify(body),
    }),
    get: (path, params) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) q.set(k, typeof v === "string" ? v : JSON.stringify(v));
      return chamar(path, { method: "GET", headers: { "Access-Token": token } }, `${TIKTOK_BASE}${path}?${q}`);
    },
  };
}

export interface EntradaVideo { videoId?: string; videoUrl?: string; nomeNaBiblioteca?: string; nome?: string }
export interface EntradaTikTok {
  advertiserId: string;
  campaignName: string;
  dailyBudgetReais: number;
  landingPageUrl: string;
  adText: string;
  callToAction: string;
  videos: EntradaVideo[];
  displayName: string;
  ageGroups?: string[];
  inicio?: Date;
}

/** Confere antes de chamar a API. Devolve os problemas; vazio = pode seguir. */
export function conferirEntradaTikTok(e: Partial<EntradaTikTok>): string[] {
  const p: string[] = [];
  if (!e.advertiserId || !/^\d+$/.test(e.advertiserId)) p.push("Advertiser ID do TikTok ausente ou invalido.");
  if (!e.campaignName || e.campaignName.length < 3) p.push("Nome da campanha muito curto.");
  if (!(Number(e.dailyBudgetReais) > 0)) p.push("Orcamento diario deve ser maior que zero.");
  else if (Number(e.dailyBudgetReais) > 500) p.push("Orcamento diario acima de R$ 500: confirme com o usuario e reduza.");
  if (!e.landingPageUrl || !/^https:\/\//i.test(e.landingPageUrl)) p.push("A pagina de destino precisa ser https.");
  if (!e.adText || e.adText.trim().length < 3) p.push("Texto do anuncio ausente.");
  else if (e.adText.length > 100) p.push(`Texto do anuncio com ${e.adText.length} caracteres: o limite do TikTok e 100.`);
  if (!e.videos?.length) p.push("Informe ao menos um video.");
  else if (e.videos.length > 5) p.push("No maximo 5 videos por grupo.");
  e.videos?.forEach((v, i) => {
    if (!v.videoId && !v.videoUrl && !v.nomeNaBiblioteca) p.push(`Video ${i + 1}: informe videoId, videoUrl ou nomeNaBiblioteca.`);
    if (v.videoUrl && !/^https:\/\//i.test(v.videoUrl)) p.push(`Video ${i + 1}: a URL precisa ser https.`);
  });
  if (!e.displayName || e.displayName.trim().length < 2) p.push("Nome de exibicao do anuncio ausente.");
  return p;
}

/** Horario de inicio no formato do TikTok (UTC), pelo menos 15 min a frente. */
export function inicioTikTok(agora = new Date()): string {
  const d = new Date(agora.getTime() + 15 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** Procura o video na biblioteca pelo nome do arquivo (sem extensao, sem caixa). */
export function acharVideoPorNome(lista: any[], nome: string): string | null {
  const alvo = nome.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const achados = (lista || []).filter((v) => String(v?.file_name || v?.video_name || "").toLowerCase().replace(/\.[a-z0-9]+$/, "").includes(alvo));
  return achados.length ? String(achados[0].video_id) : null;
}

export interface ResultadoTikTok {
  campaignId: string; adGroupId: string; identityId: string;
  ads: Array<{ adId: string; videoId: string }>;
  avisos: string[];
}

export async function publicarCampanhaTikTok(c: ClienteTikTok, e: EntradaTikTok, passo: (m: string) => void = () => {}): Promise<ResultadoTikTok> {
  const avisos: string[] = [];
  const adv = e.advertiserId;

  // 1. Identidade (perfil que aparece como autor do anuncio)
  passo("identidade");
  let identityId = "";
  try {
    const d: any = await c.get("identity/get/", { advertiser_id: adv });
    const lista: any[] = d?.identity_list || [];
    const achada = lista.find((i) => i.identity_type === "CUSTOMIZED_USER" && String(i.display_name || "").toLowerCase() === e.displayName.toLowerCase())
      || lista.find((i) => i.identity_type === "CUSTOMIZED_USER");
    if (achada) identityId = String(achada.identity_id);
  } catch (err: any) { avisos.push(`Nao consegui listar identidades: ${err.message}`); }
  if (!identityId) {
    const novo: any = await c.post("identity/create/", { advertiser_id: adv, display_name: e.displayName.slice(0, 40) });
    identityId = String(novo?.identity_id || "");
    if (!identityId) throw new Error("TikTok nao devolveu identity_id ao criar a identidade.");
  }

  // 2. Videos -> video_id (biblioteca por nome, ou upload por URL)
  passo("videos");
  const videoIds: string[] = [];
  let biblioteca: any[] | null = null;
  for (const [i, v] of e.videos.entries()) {
    if (v.videoId) { videoIds.push(v.videoId); continue; }
    if (v.nomeNaBiblioteca) {
      if (!biblioteca) {
        const d: any = await c.get("file/video/ad/search/", { advertiser_id: adv, page_size: 100 });
        biblioteca = d?.list || [];
      }
      const id = acharVideoPorNome(biblioteca!, v.nomeNaBiblioteca);
      if (!id) throw new Error(`Video "${v.nomeNaBiblioteca}" nao esta na biblioteca de criativos do TikTok.`);
      videoIds.push(id); continue;
    }
    const up: any = await c.post("file/video/ad/upload/", {
      advertiser_id: adv, upload_type: "UPLOAD_BY_URL", video_url: v.videoUrl, file_name: v.nome || `mecpro_${Date.now()}_${i + 1}`,
    });
    const id = Array.isArray(up) ? up[0]?.video_id : up?.video_id;
    if (!id) throw new Error(`Upload do video ${i + 1} sem video_id: ${JSON.stringify(up).slice(0, 200)}`);
    videoIds.push(String(id));
  }

  // 3. Campanha (orcamento fica no grupo)
  passo("campanha");
  const camp: any = await c.post("campaign/create/", {
    advertiser_id: adv, campaign_name: e.campaignName, objective_type: "TRAFFIC",
    budget_mode: "BUDGET_MODE_INFINITE", operation_status: "DISABLE",
  });
  const campaignId = String(camp?.campaign_id || "");
  if (!campaignId) throw new Error("TikTok nao devolveu campaign_id.");

  // 4. Grupo de anuncios, PAUSADO
  passo("grupo");
  const grupo: any = await c.post("adgroup/create/", {
    advertiser_id: adv, campaign_id: campaignId, adgroup_name: `${e.campaignName} | Grupo`.slice(0, 512),
    promotion_type: "WEBSITE",
    placement_type: "PLACEMENT_TYPE_NORMAL", placements: ["PLACEMENT_TIKTOK"],
    location_ids: [TIKTOK_BRASIL_LOCATION_ID], languages: ["pt"],
    age_groups: e.ageGroups?.length ? e.ageGroups : ["AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"],
    budget_mode: "BUDGET_MODE_DAY", budget: Number(e.dailyBudgetReais.toFixed(2)),
    schedule_type: "SCHEDULE_FROM_NOW", schedule_start_time: inicioTikTok(e.inicio),
    billing_event: "CPC", optimization_goal: "CLICK", bid_type: "BID_TYPE_NO_BID", pacing: "PACING_MODE_SMOOTH",
    operation_status: "DISABLE",
  });
  const adGroupId = String(grupo?.adgroup_id || "");
  if (!adGroupId) throw new Error("TikTok nao devolveu adgroup_id.");

  // 5. Anuncios (um por video), PAUSADOS
  passo("anuncios");
  const ads: ResultadoTikTok["ads"] = [];
  for (const [i, videoId] of videoIds.entries()) {
    let capaId = "";
    try {
      const info: any = await c.get("file/video/ad/info/", { advertiser_id: adv, video_ids: [videoId] });
      const capaUrl = (Array.isArray(info) ? info : info?.list)?.[0]?.video_cover_url;
      if (capaUrl) {
        const img: any = await c.post("file/image/ad/upload/", { advertiser_id: adv, upload_type: "UPLOAD_BY_URL", image_url: capaUrl, file_name: `mecpro_capa_${Date.now()}_${i + 1}` });
        capaId = String(img?.image_id || "");
      }
    } catch (err: any) { avisos.push(`Capa do video ${i + 1}: ${err.message}`); }

    const criativo: Record<string, unknown> = {
      ad_name: `${e.campaignName} | V${i + 1}`.slice(0, 512),
      identity_type: "CUSTOMIZED_USER", identity_id: identityId,
      ad_format: "SINGLE_VIDEO", video_id: videoId,
      ad_text: e.adText, call_to_action: e.callToAction, landing_page_url: e.landingPageUrl,
    };
    if (capaId) criativo.image_ids = [capaId];
    const ad: any = await c.post("ad/create/", { advertiser_id: adv, adgroup_id: adGroupId, creatives: [criativo], operation_status: "DISABLE" } as any);
    const adId = String(ad?.ad_ids?.[0] || "");
    if (!adId) throw new Error(`TikTok nao devolveu ad_id do video ${i + 1}: ${JSON.stringify(ad).slice(0, 200)}`);
    ads.push({ adId, videoId });
  }
  return { campaignId, adGroupId, identityId, ads, avisos };
}
