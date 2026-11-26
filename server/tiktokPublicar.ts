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

import { minimoDiarioTikTok, OrcamentoAbaixoDoMinimo } from "./tiktokOrcamentoMinimo";
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { configDoObjetivo, type ObjetivoMecPro } from "./tiktokObjetivos";
import { diagnosticarPixels } from "./tiktokDiagnostico";
import { comPastaTemporaria, depsVideoPadrao, md5DoArquivo, nomeNoTikTok, prepararVideo, proporcaoAceita, type DepsVideo, type Enquadramento, type VideoPreparado } from "./tiktokVideo";

export const TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3/";
export const TIKTOK_BRASIL_LOCATION_ID = "3469034";

export interface ClienteTikTok {
  post<T = any>(path: string, body: Record<string, unknown>): Promise<T>;
  get<T = any>(path: string, params: Record<string, unknown>): Promise<T>;
  /** multipart/form-data (upload de arquivo). Blob de arquivo (fs.openAsBlob) e enviado em stream. */
  postForm?<T = any>(path: string, campos: Record<string, string>, arquivo: { campo: string; nome: string; dados: Buffer | Blob; tipo: string }): Promise<T>;
}

/**
 * Erro original da API, inteiro (pedido de Michel, 25/11: "registrar os erros originais").
 * Antes a mensagem era cortada em 400 caracteres no chat e a causa do caso 828 se perdeu.
 */
export class ErroTikTok extends Error {
  constructor(public path: string, public code: number | string, public mensagemOriginal: string, public requestId?: string, public dados?: unknown) {
    super(`TikTok [${path}] ${code}: ${mensagemOriginal}`);
    this.name = "ErroTikTok";
  }
  paraRegistro() {
    return { path: this.path, code: this.code, message: this.mensagemOriginal, request_id: this.requestId, data: this.dados };
  }
}

export function criarClienteTikTok(token: string, fetchImpl: typeof fetch = fetch): ClienteTikTok {
  async function chamar(path: string, init: RequestInit, url = TIKTOK_BASE + path) {
    const res = await fetchImpl(url, init);
    let corpo: any;
    try { corpo = await res.json(); } catch { throw new Error(`TikTok [${path}] HTTP ${res.status} sem JSON`); }
    if (Number(corpo?.code) !== 0) throw new ErroTikTok(path, corpo?.code ?? res.status, String(corpo?.message || JSON.stringify(corpo)), corpo?.request_id, corpo?.data);
    return corpo.data;
  }
  return {
    post: (path, body) => chamar(path, {
      method: "POST", headers: { "Content-Type": "application/json", "Access-Token": token }, body: JSON.stringify(body),
    }),
    postForm: (path, campos, arquivo) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(campos)) f.append(k, v);
      f.append(arquivo.campo, arquivo.dados instanceof Blob ? arquivo.dados : new Blob([new Uint8Array(arquivo.dados)], { type: arquivo.tipo }), arquivo.nome);
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
  /** Objetivo do rascunho. Sem ele, trafego (comportamento antigo do MCP). Vendas exigem Pixel. */
  objetivo?: ObjetivoMecPro;
  pixelId?: string;
  /** Evento de otimizacao (SHOPPING = compra). Padrao conforme o objetivo. */
  optimizationEvent?: string;
  /** pixelId veio do salvo no projeto (se nao existir mais, escolhe de novo em vez de travar). */
  pixelSalvo?: boolean;
  /** Videos ja preparados pela validacao previa (tiktokValidacao). Sem eles, prepara aqui. */
  videosPreparados?: VideoPreparado[];
  enquadramento?: Enquadramento;
}

/** Confere antes de chamar a API. Devolve os problemas; vazio = pode seguir. */
export function conferirEntradaTikTok(e: Partial<EntradaTikTok>): string[] {
  const p: string[] = [];
  if (!e.advertiserId || !/^\d+$/.test(e.advertiserId)) p.push("Advertiser ID do TikTok ausente ou invalido.");
  if (!e.campaignName || e.campaignName.length < 3) p.push("Nome da campanha muito curto.");
  if (!(Number(e.dailyBudgetReais) > 0)) p.push("Orcamento diario deve ser maior que zero.");
  else if (Number(e.dailyBudgetReais) > 500) p.push("Orcamento diario acima de R$ 500: confirme com o usuario e reduza.");
  if (!e.landingPageUrl || !/^https:\/\//i.test(e.landingPageUrl)) p.push("A pagina de destino precisa ser https.");
  if (e.musicUrl && !/^https:\/\//i.test(e.musicUrl)) p.push("A URL da musica precisa ser https.");
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

/** Proporcoes que o TikTok aceita em video: 9:16, 1:1 e 16:9 (tolerancia de 2%). */
const PROPORCOES_TIKTOK: Record<"9:16" | "1:1" | "16:9", number> = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 };
export function proporcaoAceitaNoTikTok(w: number, h: number): boolean {
  const r = w / h;
  return Object.values(PROPORCOES_TIKTOK).some((p) => Math.abs(r - p) / p <= 0.02);
}
export function proporcaoMaisProxima(w: number, h: number): "9:16" | "1:1" | "16:9" {
  const r = w / h;
  return (Object.entries(PROPORCOES_TIKTOK) as Array<["9:16" | "1:1" | "16:9", number]>)
    .sort((a, b) => Math.abs(Math.log(r / a[1])) - Math.abs(Math.log(r / b[1])))[0][0];
}
/** Versao Cloudinary na proporcao pedida (pad preto, H.264). Fora do Cloudinary devolve null. */
export function urlNaProporcao(url: string, alvo: "9:16" | "1:1" | "16:9"): string | null {
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/);
  if (!m) return null;
  const tam = { "9:16": "w_1080,h_1920", "1:1": "w_1080,h_1080", "16:9": "w_1920,h_1080" }[alvo];
  const resto = m[2].replace(/^(?:[a-z]{1,3}_[^/]*\/)+(?=v\d+\/|[^/]+$)/i, "");
  return `${m[1]}c_pad,b_black,${tam},vc_h264,f_mp4/${resto}`;
}

export function ehNomeDuplicado(erro: unknown): boolean {
  return /duplicat\w* material name|material name.*(?:exist|duplicat)/i.test(String((erro as any)?.message ?? erro));
}

/** Nome igual ao do arquivo (sem extensao e sem caixa); cai no parcial so se nao houver igual. */
export function acharVideoPorNomeExato(lista: any[], nome: string): string | null {
  const base = (x: unknown) => String(x || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const alvo = base(nome);
  const igual = (lista || []).find((v) => base(v?.file_name || v?.video_name) === alvo);
  return igual ? String(igual.video_id) : acharVideoPorNome(lista, nome);
}

/** "IMG_7994.mov" -> "IMG_7994_mecpro_<tempo>.mov" */
export function nomeUnico(nome: string, agora = Date.now()): string {
  const m = nome.match(/^(.*?)(\.[a-z0-9]+)?$/i)!;
  return `${m[1]}_mecpro_${agora.toString(36)}${m[2] || ""}`;
}

/** Biblioteca de videos da conta, ate 5 paginas de 100. */
export async function listarBibliotecaDeVideos(c: ClienteTikTok, adv: string): Promise<any[]> {
  const todos: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const d: any = await c.get("file/video/ad/search/", { advertiser_id: adv, page, page_size: 100 });
    const lista = d?.list || [];
    todos.push(...lista);
    const total = Number(d?.page_info?.total_page || 1);
    if (!lista.length || page >= total) break;
  }
  return todos;
}

export interface ResultadoTikTok {
  campaignId: string; adGroupId: string; identityId: string;
  ads: Array<{ adId: string; videoId: string }>;
  carrossel?: { adId: string; imageIds: string[] };
  avisos: string[];
}

const TIKTOK_MAX_MUSIC_BYTES = 10 * 1024 * 1024;

/** Lê o stream com limite para não baixar arquivos arbitrariamente grandes. */
export async function lerMusicaComLimite(res: Response, limite = TIKTOK_MAX_MUSIC_BYTES): Promise<Buffer> {
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > limite) throw new Error("A musica excede o limite de 10 MB do TikTok.");
  if (!res.body) {
    const dados = Buffer.from(await res.arrayBuffer());
    if (dados.length > limite) throw new Error("A musica excede o limite de 10 MB do TikTok.");
    return dados;
  }
  const reader = res.body.getReader(); const partes: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > limite) { await reader.cancel(); throw new Error("A musica excede o limite de 10 MB do TikTok."); }
      partes.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(partes.map((parte) => Buffer.from(parte)), total);
}

/** Aceita MP3 com tag ID3 ou início de frame MPEG. */
export function pareceMp3(dados: Buffer): boolean {
  if (dados.length < 3) return false;
  if (dados.subarray(0, 3).toString("ascii") === "ID3") return true;
  return dados[0] === 0xff && (dados[1] & 0xe0) === 0xe0;
}

export function extrairListaMusicas(d: any): any[] {
  if (Array.isArray(d)) return d;
  return d?.musics || d?.list || d?.music_list || d?.music_list_info || [];
}

/** ad/create exige music_id; material_id não é substituto. */
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
const normalizarNome = (x: unknown) => String(x ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Campanha com o mesmo nome. Achado real 24/11 (campanha 824): a campanha existia SEM grupo, a
 * busca devolvia null e o create batia em "Campaign name already exists". Agora a campanha volta
 * mesmo sem grupo (adGroupId vazio) e o grupo e criado dentro dela.
 */
export async function acharCampanhaExistente(c: ClienteTikTok, adv: string, nome: string): Promise<{ campaignId: string; adGroupId: string; objectiveType?: string } | null> {
  try {
    const d: any = await c.get("campaign/get/", { advertiser_id: adv, filtering: { campaign_name: nome }, page_size: 20 });
    const alvo = normalizarNome(nome);
    const camp = (d?.list || []).find((x: any) => normalizarNome(x?.campaign_name) === alvo);
    if (!camp?.campaign_id) return null;
    const g: any = await c.get("adgroup/get/", { advertiser_id: adv, filtering: { campaign_ids: [String(camp.campaign_id)] }, page_size: 20 }).catch(() => null);
    const grupo = (g?.list || [])[0];
    return { campaignId: String(camp.campaign_id), adGroupId: grupo?.adgroup_id ? String(grupo.adgroup_id) : "", ...(camp.objective_type ? { objectiveType: String(camp.objective_type) } : {}) };
  } catch { return null; }
}

export function ehNomeDeCampanhaExistente(erro: unknown): boolean {
  return /campaign name already exists|name already exist/i.test(String((erro as any)?.message ?? erro));
}

/** "Nome" -> "Nome · 24/11 14h05" (horario de Brasilia), dentro do limite de 512 do TikTok. */
export function nomeDeCampanhaUnico(nome: string, agora = new Date()): string {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agora);
  const p = (t: string) => f.find((x) => x.type === t)?.value || "";
  return `${nome.slice(0, 480)} · ${p("day")}/${p("month")} ${p("hour")}h${p("minute")}`;
}

/** Falha de rede ou do gateway do TikTok (504/502/503 sem JSON): o envio pode ter ate concluido la. */
export function ehErroTransitorio(erro: unknown): boolean {
  return /HTTP 5\d\d sem JSON|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|UND_ERR/i.test(String((erro as any)?.message ?? erro));
}

/** Esperas entre tentativas (ms). Os testes zeram. */
export const ESPERA_REENVIO_VIDEO = { ms: [2000, 6000] as number[] };

/**
 * Upload com ate 2 reenvios quando o TikTok responde 5xx sem JSON (caso 828, 26/11: HTTP 504).
 * Antes de reenviar, confere a biblioteca: se o 504 veio depois de o TikTok ter gravado o video
 * (nome exato do MecProAI), devolve o id existente em vez de duplicar. Outros erros nao sao tentados de novo.
 * Devolve o resultado da API, ou o video_id (string) quando reaproveitou.
 */
async function enviarComReenvio(enviar: (nome: string) => Promise<any>, nome: string, carregarBiblioteca: () => Promise<any[]>, avisos: string[], rotulo: string): Promise<any> {
  for (let t = 0; ; t++) {
    try { return await enviar(nome); }
    catch (erro) {
      if (!ehErroTransitorio(erro) || t >= ESPERA_REENVIO_VIDEO.ms.length) throw erro;
      await new Promise((r) => setTimeout(r, ESPERA_REENVIO_VIDEO.ms[t]));
      const lista = await carregarBiblioteca().catch(() => [] as any[]);
      const existente = acharVideoPorNomeExato(lista, nome);
      if (existente && nomeIgual(nome, lista, existente)) {
        avisos.push(`O TikTok demorou a responder no envio de "${rotulo}", mas o video ja estava na biblioteca; reaproveitei.`);
        return existente;
      }
      avisos.push(`O TikTok respondeu com erro temporario no envio de "${rotulo}"; tentei de novo (${t + 2}a vez).`);
    }
  }
}

/** Sobe um video preparado: por URL (Cloudinary) ou por arquivo local em stream (FFmpeg). */
async function subirVideo(c: ClienteTikTok, adv: string, prep: VideoPreparado, nome: string, carregarBiblioteca: () => Promise<any[]>, avisos: string[]): Promise<string> {
  const enviar = async (file_name: string): Promise<any> => {
    if (prep.urlFinal) return c.post("file/video/ad/upload/", { advertiser_id: adv, upload_type: "UPLOAD_BY_URL", video_url: prep.urlFinal, file_name });
    if (prep.arquivoLocal && c.postForm) {
      const assinatura = await md5DoArquivo(prep.arquivoLocal);
      return c.postForm("file/video/ad/upload/", { advertiser_id: adv, upload_type: "UPLOAD_BY_FILE", video_signature: assinatura, file_name },
        { campo: "video_file", nome: file_name, dados: await openAsBlob(prep.arquivoLocal, { type: "video/mp4" }), tipo: "video/mp4" });
    }
    throw new Error(`Video "${prep.nome}" sem URL nem arquivo pronto para enviar.`);
  };
  let up: any;
  try {
    up = await enviarComReenvio(enviar, nome, carregarBiblioteca, avisos, prep.nome);
    if (typeof up === "string") return up;
  } catch (erro) {
    if (!ehNomeDuplicado(erro)) throw erro;
    const existente = acharVideoPorNomeExato(await carregarBiblioteca(), nome);
    if (existente && nomeIgual(nome, await carregarBiblioteca(), existente)) {
      avisos.push(`"${prep.nome}" ja tinha sido enviado com esta mesma adaptacao; reaproveitei.`);
      return existente;
    }
    up = await enviar(nomeUnico(nome));
  }
  const id = Array.isArray(up) ? up[0]?.video_id : up?.video_id;
  if (!id) throw new Error(`Upload de "${prep.nome}" sem video_id: ${JSON.stringify(up).slice(0, 200)}`);
  return String(id);
}

/** O reaproveitamento so vale com nome EXATO (o nosso nome deterministico), nunca parcial. */
function nomeIgual(nome: string, lista: any[], videoId: string): boolean {
  const base = (x: unknown) => String(x || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
  return (lista || []).some((v) => String(v?.video_id) === videoId && base(v?.file_name || v?.video_name) === base(nome));
}

export async function publicarCampanhaTikTok(c: ClienteTikTok, e: EntradaTikTok, passo: (m: string) => void = () => {}, fetchArquivo?: typeof fetch, depsVideo?: DepsVideo): Promise<ResultadoTikTok> {
  const avisos: string[] = [];
  const adv = e.advertiserId;

  // 0. Valor minimo aceitavel (24/11): recusa antes de criar ou subir qualquer coisa.
  passo("orcamento");
  const min = await minimoDiarioTikTok(c, adv);
  if (min && !(e.dailyBudgetReais >= min.minimo)) throw new OrcamentoAbaixoDoMinimo(e.dailyBudgetReais, min);

  // 1. Identidade: o TikTok nao aceita mais identidade personalizada; precisa ser
  //    uma conta de TikTok autorizada (TT_USER / BC_AUTH_TT / AUTH_CODE).
  passo("identidade");
  const identidades = await listarIdentidadesAutorizadas(c, adv, e.displayName, avisos);
  if (!identidades.length) throw new Error("Nenhuma conta de TikTok autorizada na conta de anuncios. No Ads Manager: Ativos > Identidades > autorizar uma conta de TikTok, e tente de novo.");
  let ident = identidades[0];
  let identityId = ident.identity_id;

  // 1b. Objetivo real (nunca troca vendas por trafego sozinho) e Pixel com o evento de otimizacao.
  passo("objetivo");
  const cfg = configDoObjetivo(e.objetivo || "traffic", e.optimizationEvent);
  let pixelId = "";
  if (cfg.precisaPixel) {
    const vp = await diagnosticarPixels(c, adv, cfg.optimizationEvent!, e.pixelId, new Date(), { pedidoEhSalvo: e.pixelSalvo === true });
    avisos.push(...vp.avisos);
    if (!vp.ok) throw new Error(`${vp.problema?.mensagem} ${vp.problema?.instrucoes.join(" ") || ""} Nada foi criado no TikTok.`.replace(/\s+/g, " "));
    pixelId = vp.escolhido!.pixelId;
  }

  // 2. Videos -> video_id. Cada video e conferido e adaptado ANTES (tiktokVideo.prepararVideo):
  //    proporcao, resolucao, codec e tamanho. O nome no TikTok e deterministico (fonte + adaptacao),
  //    entao "Duplicated material name" so pode ser o MESMO arquivo nosso, e ai ele e reaproveitado.
  //    Achado real 24/11 (828): reaproveitar pelo nome original (IMG_7994.mov) pegou um material que o
  //    TikTok recusou no anuncio; nome original nao identifica o arquivo, por isso deixou de ser usado.
  passo("videos");
  const videoIds: string[] = [];
  const capas: Array<string | undefined> = [];
  let biblioteca: any[] | null = null;
  for (const [i, v] of e.videos.entries()) {
    if (v.videoId) { videoIds.push(v.videoId); capas.push(undefined); continue; }
    if (v.nomeNaBiblioteca) {
      biblioteca = biblioteca ?? await listarBibliotecaDeVideos(c, adv);
      const id = acharVideoPorNomeExato(biblioteca!, v.nomeNaBiblioteca);
      if (!id) throw new Error(`Video "${v.nomeNaBiblioteca}" nao esta na biblioteca de criativos do TikTok.`);
      videoIds.push(id); capas.push(undefined); continue;
    }
    const dv = depsVideo || depsVideoPadrao;
    // Usa o MESMO plano mostrado na previa; so refaz quando ainda falta importar para o Cloudinary.
    const daPrevia = e.videosPreparados?.[i] && e.videosPreparados[i].origem === v.videoUrl ? e.videosPreparados[i] : null;
    let prep: VideoPreparado & { problemas?: string[]; correcoes?: string[] } = daPrevia && (daPrevia.urlFinal || !daPrevia.plano?.transformar)
      ? daPrevia
      : await prepararVideo({ url: v.videoUrl!, nome: v.nome }, { enquadramento: e.enquadramento, executar: true }, dv);
    if (prep === daPrevia && prep.urlFinal && prep.plano?.transformar && !(await dv.aguardar(prep.urlFinal))) {
      throw new Error(`O Cloudinary nao terminou de adaptar "${prep.nome}" a tempo. Tente de novo em alguns minutos.`);
    }
    if (prep.problemas?.length) throw new Error(`Video "${prep.nome}": ${prep.problemas.join(" ")}`);
    if (prep !== daPrevia) avisos.push(...(prep.correcoes || []));
    const nome = nomeNoTikTok(prep);
    const carregar = async () => (biblioteca = biblioteca ?? await listarBibliotecaDeVideos(c, adv));
    let id: string;
    if (!prep.urlFinal && prep.plano?.transformar) {
      // Sem Cloudinary: FFmpeg em arquivo temporario e envio em stream; a pasta some ao fim.
      if (!dv.adaptarLocal) throw new Error(`Nao ha como adaptar "${prep.nome}" neste servidor (sem Cloudinary e sem FFmpeg).`);
      const plano = prep.plano;
      id = await comPastaTemporaria(async (pasta) => {
        const arquivo = await dv.adaptarLocal!(prep.origem, pasta, plano, prep.sonda?.temAudio ?? true, e.enquadramento || "preservar");
        return subirVideo(c, adv, { ...prep, arquivoLocal: arquivo }, nome, carregar, avisos);
      });
      avisos.push(`"${prep.nome}" adaptado com FFmpeg no servidor (${plano.proporcao}, ${plano.largura}x${plano.altura}).`);
    } else {
      id = await subirVideo(c, adv, prep, nome, carregar, avisos);
    }
    videoIds.push(id); capas.push(prep.capaUrl);
  }

  // 2b. Conferencia final no TikTok (largura/altura do material ja processado). Se ainda estiver fora
  //     das proporcoes aceitas, para aqui com o motivo exato, antes de criar campanha.
  passo("proporcao");
  for (const [i, videoId] of videoIds.entries()) {
    const info: any = await c.get("file/video/ad/info/", { advertiser_id: adv, video_ids: [videoId] }).catch(() => null);
    const item = (Array.isArray(info) ? info : info?.list)?.[0];
    const w = Number(item?.width), h = Number(item?.height);
    if (!(w > 0 && h > 0) || proporcaoAceita(w, h)) continue;
    const origem = e.videos[i];
    const url = origem?.videoUrl ? urlNaProporcao(origem.videoUrl, proporcaoMaisProxima(w, h)) : null;
    if (!url) throw new Error(`O video ${i + 1} ficou em ${w}x${h} no TikTok; o TikTok so aceita 9:16, 1:1 ou 16:9. Envie o video nessa proporcao.`);
    const up: any = await c.post("file/video/ad/upload/", { advertiser_id: adv, upload_type: "UPLOAD_BY_URL", video_url: url, file_name: nomeUnico(`mecpro_corrigido_${i + 1}.mp4`) });
    const novo = Array.isArray(up) ? up[0]?.video_id : up?.video_id;
    if (!novo) throw new Error(`Nao consegui reenviar o video ${i + 1} na proporcao certa.`);
    videoIds[i] = String(novo);
    avisos.push(`Video ${i + 1} chegou ao TikTok em ${w}x${h}; reenviei na proporcao ${proporcaoMaisProxima(w, h)}.`);
  }

  // 3-4. Campanha e grupo (reaproveita os que ja existem com o mesmo nome, sem duplicar)
  passo("campanha");
  let campaignId = "", adGroupId = "";
  let existente = await acharCampanhaExistente(c, adv, e.campaignName);
  let nomeDoGrupo = e.campaignName;
  if (existente?.objectiveType && existente.objectiveType !== cfg.objectiveType) {
    // Campanha antiga com o mesmo nome e outro objetivo (ex.: tentativa de trafego): nao reaproveita.
    avisos.push(`Ja existe "${e.campaignName}" no TikTok com objetivo ${existente.objectiveType} (pausada); criei uma nova com ${cfg.objectiveType}.`);
    existente = null;
    nomeDoGrupo = nomeDeCampanhaUnico(e.campaignName);
  }
  if (existente) {
    campaignId = existente.campaignId; adGroupId = existente.adGroupId;
    avisos.push(adGroupId
      ? `Reaproveitei a campanha ${campaignId} e o grupo ${adGroupId}, que ja existiam com este nome; o orcamento do grupo e o que ja estava nele.`
      : `Reaproveitei a campanha ${campaignId}, que ja existia com este nome, e criei o grupo dentro dela.`);
  }
  if (!campaignId) {
    const criar = (campaign_name: string) => c.post("campaign/create/", {
      advertiser_id: adv, campaign_name, objective_type: cfg.objectiveType,
      budget_mode: "BUDGET_MODE_INFINITE", operation_status: "DISABLE",
    });
    let camp: any;
    try {
      camp = await criar(nomeDoGrupo);
    } catch (erro) {
      // Nome ocupado por uma campanha que a busca nao devolve (excluida, ou criada fora do MecProAI):
      // cria com nome unico em vez de parar.
      if (!ehNomeDeCampanhaExistente(erro)) throw erro;
      nomeDoGrupo = nomeDeCampanhaUnico(e.campaignName);
      camp = await criar(nomeDoGrupo);
      avisos.push(`Ja havia no TikTok uma campanha chamada "${e.campaignName}"; criei como "${nomeDoGrupo}".`);
    }
    campaignId = String(camp?.campaign_id || "");
    if (!campaignId) throw new Error("TikTok nao devolveu campaign_id.");
  }
  passo("grupo");
  if (!adGroupId) {
    const grupo: any = await c.post("adgroup/create/", {
      advertiser_id: adv, campaign_id: campaignId, adgroup_name: `${nomeDoGrupo} | Grupo`.slice(0, 512),
      promotion_type: "WEBSITE",
      placement_type: "PLACEMENT_TYPE_NORMAL", placements: ["PLACEMENT_TIKTOK"],
      location_ids: [TIKTOK_BRASIL_LOCATION_ID], languages: ["pt"],
      age_groups: e.ageGroups?.length ? e.ageGroups : ["AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"],
      budget_mode: "BUDGET_MODE_DAY", budget: Number(e.dailyBudgetReais.toFixed(2)),
      schedule_type: "SCHEDULE_FROM_NOW", schedule_start_time: inicioTikTok(e.inicio),
      billing_event: cfg.billingEvent, optimization_goal: cfg.optimizationGoal, bid_type: "BID_TYPE_NO_BID", pacing: "PACING_MODE_SMOOTH",
      ...(pixelId ? { pixel_id: pixelId, optimization_event: cfg.optimizationEvent } : {}),
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
      // Capa do proprio video adaptado (mesmas dimensoes); sem ela, a capa automatica do TikTok.
      let capaUrl = capas[i];
      if (!capaUrl) {
        const info: any = await c.get("file/video/ad/info/", { advertiser_id: adv, video_ids: [videoId] });
        capaUrl = (Array.isArray(info) ? info : info?.list)?.[0]?.video_cover_url;
      }
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
      const dados = await lerMusicaComLimite(res);
      if (!pareceMp3(dados)) throw new Error("O arquivo indicado não parece ser MP3; o TikTok exige MP3 para música de carrossel.");
      const assinatura = createHash("md5").update(dados).digest("hex");
      if (!c.postForm) throw new Error("Cliente sem upload multipart.");
      const nomeArq = `mecpro_musica_${Date.now()}.mp3`;
      const up: any = await c.postForm("file/music/upload/", { advertiser_id: adv, music_scene: "CAROUSEL_ADS", upload_type: "UPLOAD_BY_FILE", file_name: nomeArq, music_signature: assinatura, file_signature: assinatura }, { campo: "music_file", nome: nomeArq, dados, tipo: "audio/mpeg" });
      const item = Array.isArray(up) ? up[0] : up, id = item?.music_id;
      if (!id) throw new Error(`Upload sem music_id para anúncio (campos retornados: ${Object.keys(item || {}).join(", ") || "nenhum"}).`);
      musicId = String(id); avisos.push(`Musica enviada para carrossel: ${musicId}.`);
    }
    if (!musicId) {
      const d: any = await c.get("file/music/get/", { advertiser_id: adv, music_scene: "CAROUSEL_ADS", search_type: "SEARCH_BY_SOURCE", sources: ["USER"], page_size: 50 });
      const lista = extrairListaMusicas(d);
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
        const d: any = await c.get("file/music/get/", { advertiser_id: adv, music_scene: "CAROUSEL_ADS", search_type: "SEARCH_BY_SOURCE", sources: ["USER"], page_size: 50 });
        resumo = extrairListaMusicas(d).map((m: any) => `${m.music_id || "(sem music_id)"}/${m.name || m.music_name || m.file_name || "sem nome"}/${m.copyright || "?"}`).join("; ");
      } catch (e2: any) { resumo = `lista indisponivel: ${e2.message}`; }
      throw new Error(`${err.message} Musica usada: ${musicId}. Biblioteca da conta: ${resumo}`);
    }
    const adId = String(ad?.ad_ids?.[0] || "");
    if (!adId) throw new Error(`TikTok nao devolveu ad_id do carrossel: ${JSON.stringify(ad).slice(0, 200)}`);
    carrossel = { adId, imageIds };
  }
  return { campaignId, adGroupId, identityId, ads, ...(carrossel ? { carrossel } : {}), avisos };
}

export type StatusTikTok = "ENABLE" | "DISABLE";

/** Ativa ou pausa anuncios, grupo e campanha (idempotente: repetir nao tem efeito extra). */
export async function mudarStatusTikTok(
  c: ClienteTikTok, adv: string, ids: { campaignId: string; adGroupId: string; adIds: string[] }, status: StatusTikTok,
): Promise<{ anuncios: number; grupo: string; campanha: string }> {
  if (ids.adIds.length) await c.post("ad/status/update/", { advertiser_id: adv, ad_ids: ids.adIds, operation_status: status });
  await c.post("adgroup/status/update/", { advertiser_id: adv, adgroup_ids: [ids.adGroupId], operation_status: status });
  await c.post("campaign/status/update/", { advertiser_id: adv, campaign_ids: [ids.campaignId], operation_status: status });
  return { anuncios: ids.adIds.length, grupo: ids.adGroupId, campanha: ids.campaignId };
}
