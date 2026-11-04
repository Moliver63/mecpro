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

import { createHash } from "node:crypto";

export const TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3/";
export const TIKTOK_BRASIL_LOCATION_ID = "3469034";

export interface ClienteTikTok {
  post<T = any>(path: string, body: Record<string, unknown>): Promise<T>;
  get<T = any>(path: string, params: Record<string, unknown>): Promise<T>;
  /** multipart/form-data (upload de arquivo). */
  postForm?<T = any>(path: string, campos: Record<string, string>, arquivo: { campo: string; nome: string; dados: Buffer; tipo: string }): Promise<T>;
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
    postForm: (path, campos, arquivo) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(campos)) f.append(k, v);
      f.append(arquivo.campo, new Blob([arquivo.dados], { type: arquivo.tipo }), arquivo.nome);
      return chamar(path, { method: "POST", headers: { "Access-Token": token }, body: f });
    },
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
  /** URLs https de imagens (9:16) para um anuncio em carrossel, no mesmo grupo dos videos. */
  imagens?: string[];
  /** Musica liberada para anuncio (obrigatoria no carrossel). Sem ela, busca na biblioteca da conta. */
  musicId?: string;
  /** mp3 https proprio (com direitos) para subir na biblioteca de musicas da conta. */
  musicUrl?: string;
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
  if (!e.videos?.length && !e.imagens?.length) p.push("Informe ao menos um video ou as imagens do carrossel.");
  else if ((e.videos?.length || 0) > 5) p.push("No maximo 5 videos por grupo.");
  if (e.imagens?.length) {
    if (e.imagens.length < 2 || e.imagens.length > 10) p.push("Carrossel precisa de 2 a 10 imagens.");
    e.imagens.forEach((u, i) => { if (!/^https:\/\//i.test(u)) p.push(`Imagem ${i + 1}: a URL precisa ser https.`); });
  }
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
  carrossel?: { adId: string; imageIds: string[] };
  avisos: string[];
}

/** Escolhe uma faixa utilizavel da lista de musicas do TikTok (campos variam; descarta as marcadas como indisponiveis). */
export function escolherMusica(lista: any[]): { id: string; nome: string } | null {
  const ok = (lista || []).filter((m) => m?.music_id && m?.available !== false && m?.is_valid !== false && !/invalid|unavailable|expired/i.test(String(m?.status || m?.music_status || "")) && !/FORBID/i.test(String(m?.copyright || "")));
  const m = ok[0];
  return m ? { id: String(m.music_id), nome: String(m.name || m.music_name || m.file_name || m.music_id) } : null;
}

export interface IdentidadeTikTok { identity_id: string; identity_type: string; identity_authorized_bc_id?: string; display_name?: string }

/** Todas as contas de TikTok autorizadas na conta de anuncios, a de nome parecido primeiro. */
export async function listarIdentidadesAutorizadas(c: ClienteTikTok, adv: string, nome: string, avisos: string[] = []): Promise<IdentidadeTikTok[]> {
  const todas: IdentidadeTikTok[] = [];
  for (const tipo of ["TT_USER", "BC_AUTH_TT", "AUTH_CODE"]) {
    try {
      const d: any = await c.get("identity/get/", { advertiser_id: adv, identity_type: tipo, page_size: 100 });
      for (const i of d?.identity_list || []) {
        if (i?.identity_id) todas.push({ identity_id: String(i.identity_id), identity_type: i.identity_type || tipo, identity_authorized_bc_id: i.identity_authorized_bc_id || i.bc_id, display_name: i.display_name });
      }
    } catch (err: any) { avisos.push(`Identidades ${tipo}: ${err.message}`); }
  }
  const alvo = nome.toLowerCase();
  const unicas = todas.filter((i, n) => todas.findIndex((o) => o.identity_id === i.identity_id) === n);
  return unicas.sort((a, b) => Number(String(b.display_name || "").toLowerCase().includes(alvo)) - Number(String(a.display_name || "").toLowerCase().includes(alvo)));
}

/** Erro de identidade sem permissao: vale tentar a proxima conta. */
export function erroDePermissaoDaIdentidade(msg: string): boolean {
  return /permission to manage videos|select another identity|identity/i.test(msg);
}

/** Campanha ja criada com o mesmo nome (evita duplicar numa nova tentativa). */
export async function acharCampanhaExistente(c: ClienteTikTok, adv: string, nome: string): Promise<{ campaignId: string; adGroupId: string } | null> {
  try {
    const d: any = await c.get("campaign/get/", { advertiser_id: adv, filtering: { campaign_name: nome }, page_size: 20 });
    const camp = (d?.list || []).find((x: any) => x?.campaign_name === nome);
    if (!camp?.campaign_id) return null;
    const g: any = await c.get("adgroup/get/", { advertiser_id: adv, filtering: { campaign_ids: [String(camp.campaign_id)] }, page_size: 20 });
    const grupo = (g?.list || [])[0];
    return grupo?.adgroup_id ? { campaignId: String(camp.campaign_id), adGroupId: String(grupo.adgroup_id) } : null;
  } catch { return null; }
}

export async function publicarCampanhaTikTok(c: ClienteTikTok, e: EntradaTikTok, passo: (m: string) => void = () => {}, fetchArquivo?: typeof fetch): Promise<ResultadoTikTok> {
  const avisos: string[] = [];
  const adv = e.advertiserId;

  // 1. Identidade: o TikTok nao aceita mais identidade personalizada; precisa ser
  //    uma conta de TikTok autorizada (TT_USER / BC_AUTH_TT / AUTH_CODE).
  passo("identidade");
  const identidades = await listarIdentidadesAutorizadas(c, adv, e.displayName, avisos);
  if (!identidades.length) throw new Error("Nenhuma conta de TikTok autorizada na conta de anuncios. No Ads Manager: Ativos > Identidades > autorizar uma conta de TikTok, e tente de novo.");
  let ident = identidades[0];
  let identityId = ident.identity_id;

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

  // 3-4. Campanha e grupo (reaproveita os que ja existem com o mesmo nome, sem duplicar)
  passo("campanha");
  let campaignId = "", adGroupId = "";
  const existente = await acharCampanhaExistente(c, adv, e.campaignName);
  if (existente) { campaignId = existente.campaignId; adGroupId = existente.adGroupId; avisos.push(`Reaproveitei a campanha ${campaignId}.`); }
  if (!campaignId) {
    const camp: any = await c.post("campaign/create/", {
      advertiser_id: adv, campaign_name: e.campaignName, objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_INFINITE", operation_status: "DISABLE",
    });
    campaignId = String(camp?.campaign_id || "");
    if (!campaignId) throw new Error("TikTok nao devolveu campaign_id.");
  }
  passo("grupo");
  if (!adGroupId) {
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
    adGroupId = String(grupo?.adgroup_id || "");
    if (!adGroupId) throw new Error("TikTok nao devolveu adgroup_id.");
  }

  // Cria o anuncio com a primeira conta autorizada que aceitar; erro de permissao tenta a proxima.
  const criarComIdentidade = async (montar: (id: IdentidadeTikTok) => Record<string, unknown>): Promise<any> => {
    const ordem = [ident, ...identidades.filter((x) => x.identity_id !== ident.identity_id)];
    let ultimoErro: any = null;
    for (const cand of ordem) {
      try {
        const ad = await c.post("ad/create/", { advertiser_id: adv, adgroup_id: adGroupId, creatives: [montar(cand)], operation_status: "DISABLE" } as any);
        ident = cand; identityId = cand.identity_id;
        return ad;
      } catch (err: any) {
        ultimoErro = err;
        if (!erroDePermissaoDaIdentidade(String(err?.message))) throw err;
        avisos.push(`Conta ${cand.display_name || cand.identity_id} (${cand.identity_type}) recusada: ${String(err.message).slice(0, 120)}`);
      }
    }
    throw new Error(`${ultimoErro.message} (contas testadas: ${ordem.map((x) => `${x.display_name || x.identity_id}/${x.identity_type}`).join(", ")})`);
  };

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

    const montar = (id: IdentidadeTikTok) => ({
      ad_name: `${e.campaignName} | V${i + 1}`.slice(0, 512),
      identity_type: id.identity_type, identity_id: id.identity_id,
      ...(id.identity_authorized_bc_id ? { identity_authorized_bc_id: id.identity_authorized_bc_id } : {}),
      ad_format: "SINGLE_VIDEO", video_id: videoId,
      ad_text: e.adText, call_to_action: e.callToAction, landing_page_url: e.landingPageUrl,
      ...(capaId ? { image_ids: [capaId] } : {}),
    });
    const ad = await criarComIdentidade(montar);
    const adId = String(ad?.ad_ids?.[0] || "");
    if (!adId) throw new Error(`TikTok nao devolveu ad_id do video ${i + 1}: ${JSON.stringify(ad).slice(0, 200)}`);
    ads.push({ adId, videoId });
  }

  // 6. Carrossel de imagens (opcional), no mesmo grupo, com o mesmo texto, botao e destino
  let carrossel: ResultadoTikTok["carrossel"];
  if (e.imagens?.length) {
    passo("carrossel");
    const imageIds: string[] = [];
    for (const [i, url] of e.imagens.entries()) {
      const img: any = await c.post("file/image/ad/upload/", { advertiser_id: adv, upload_type: "UPLOAD_BY_URL", image_url: url, file_name: `mecpro_carrossel_${Date.now()}_${i + 1}` });
      const id = Array.isArray(img) ? img[0]?.image_id : img?.image_id;
      if (!id) throw new Error(`Upload da imagem ${i + 1} sem image_id: ${JSON.stringify(img).slice(0, 200)}`);
      imageIds.push(String(id));
    }
    let musicId = e.musicId || "";
    if (!musicId && e.musicUrl) {
      // O TikTok so aceita UPLOAD_BY_FILE (multipart): baixa o mp3 e envia o arquivo.
      const res = await (fetchArquivo || fetch)(e.musicUrl);
      if (!res.ok) throw new Error(`Nao consegui baixar a musica (${res.status}).`);
      const dados = Buffer.from(await res.arrayBuffer());
      const assinatura = createHash("md5").update(dados).digest("hex");
      if (!c.postForm) throw new Error("Cliente sem upload multipart.");
      const nomeArq = `mecpro_musica_${Date.now()}.mp3`;
      const up: any = await c.postForm("file/music/upload/", { advertiser_id: adv, upload_type: "UPLOAD_BY_FILE", file_name: nomeArq, music_signature: assinatura, file_signature: assinatura }, { campo: "music_file", nome: nomeArq, dados, tipo: "audio/mpeg" });
      const id = Array.isArray(up) ? up[0]?.music_id : up?.music_id;
      if (!id) throw new Error(`Upload da musica sem music_id: ${JSON.stringify(up).slice(0, 300)}`);
      musicId = String(id); avisos.push(`Musica enviada: ${musicId}.`);
    }
    if (!musicId) {
      const d: any = await c.get("file/music/get/", { advertiser_id: adv, page_size: 50 });
      const lista = Array.isArray(d) ? d : d?.musics || d?.list || d?.music_list || [];
      const m = escolherMusica(lista);
      if (!m) throw new Error(`Carrossel exige musica e a biblioteca da conta nao devolveu nenhuma faixa utilizavel (resposta: ${JSON.stringify(d).slice(0, 300)}). Suba uma musica na Creative library e informe o musicId.`);
      musicId = m.id; avisos.push(`Musica usada no carrossel: ${m.nome} (${m.id}).`);
    }
    const montarCarrossel = (id: IdentidadeTikTok) => ({
      ad_name: `${e.campaignName} | Carrossel`.slice(0, 512),
      identity_type: id.identity_type, identity_id: id.identity_id,
      ...(id.identity_authorized_bc_id ? { identity_authorized_bc_id: id.identity_authorized_bc_id } : {}),
      ad_format: "CAROUSEL_ADS", image_ids: imageIds, music_id: musicId,
      ad_text: e.adText, call_to_action: e.callToAction, landing_page_url: e.landingPageUrl,
    });
    let ad: any;
    try { ad = await criarComIdentidade(montarCarrossel); }
    catch (err: any) {
      if (!/music/i.test(String(err?.message))) throw err;
      let resumo = "";
      try {
        const d: any = await c.get("file/music/get/", { advertiser_id: adv, page_size: 50 });
        resumo = (Array.isArray(d) ? d : d?.musics || d?.list || []).map((m: any) => `${m.music_id}/${m.name || m.file_name}/${m.copyright || "?"}`).join("; ");
      } catch (e2: any) { resumo = `lista indisponivel: ${e2.message}`; }
      throw new Error(`${err.message} Musica usada: ${musicId}. Biblioteca da conta: ${resumo}`);
    }
    const adId = String(ad?.ad_ids?.[0] || "");
    if (!adId) throw new Error(`TikTok nao devolveu ad_id do carrossel: ${JSON.stringify(ad).slice(0, 200)}`);
    carrossel = { adId, imageIds };
  }
  return { campaignId, adGroupId, identityId, ads, ...(carrossel ? { carrossel } : {}), avisos };
}
