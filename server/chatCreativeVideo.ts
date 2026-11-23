/**
 * chatCreativeVideo.ts — video enviado no chat vira midia de um criativo do rascunho.
 *
 * Antes: `/api/chat/upload-video` guardava o video no Cloudinary e o chat so
 * recebia uma nota com o link ("voce nao consegue assistir"). Nenhuma ferramenta
 * do chat ligava o video a um criativo; so o MCP tinha `upload_creative_video`.
 *
 * Aqui nao ha logica de Meta nova. A ferramenta `anexar_video_criativo` chama os
 * MESMOS dois procedimentos que o MCP usa:
 *   1. `integrations.uploadVideoToMeta`  -> sobe o video na conta de anuncios da conexao
 *   2. `campaigns.updateCreativeImage`   -> grava videoId (e miniatura) no criativo do formato
 * Os dois ja passam pelo middleware de dono (campaignId do usuario).
 *
 * Regras:
 * - so aceita video que ESTE usuario enviou pelo chat (registro por usuario, URL do
 *   nosso Cloudinary na pasta chat-videos); URL de terceiros, de outro usuario ou
 *   qualquer outro host e recusada antes de qualquer download;
 * - so rascunho: campanha ja publicada nao tem criativo alterado;
 * - criativo escolhido por indice e formato explicitos (nunca por suposicao);
 * - a conta de anuncios do rascunho tem de estar escolhida e igual a da conexao
 *   (`exigirContaDoRascunho`), porque o video pertence a conta onde foi enviado;
 * - o rascunho so e tocado no passo 2; falha antes disso nao muda nada;
 * - nao publica, nao edita o video.
 */
import { exigirContaDoRascunho, campanhaJaPublicada, type DepsContaMeta } from "./metaAdAccountChoice";

export const LIMITE_VIDEO_BYTES = 100 * 1024 * 1024; // mesmo limite do /chat/upload-video
const TTL_REGISTRO_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_VIDEOS_POR_USUARIO = 30;
export const FORMATOS_VIDEO = ["feed", "stories", "square"] as const;
export type FormatoVideo = (typeof FORMATOS_VIDEO)[number];

// Registro em memoria: usuario -> (url -> instante). Preenchido por /chat/upload-video.
// Reiniciar o servidor limpa o registro; nesse caso o usuario reenvia o video.
const registro = new Map<number, Map<string, number>>();

export function registrarVideoDoChat(userId: number, url: string, agora = Date.now()): void {
  if (!Number.isSafeInteger(userId) || userId <= 0 || typeof url !== "string" || !url) return;
  let mapa = registro.get(userId);
  if (!mapa) { mapa = new Map(); registro.set(userId, mapa); }
  mapa.set(url, agora);
  if (mapa.size > MAX_VIDEOS_POR_USUARIO) {
    const maisAntigo = [...mapa.entries()].sort((a, b) => a[1] - b[1])[0];
    if (maisAntigo) mapa.delete(maisAntigo[0]);
  }
}

export function videoDoChatDoUsuario(userId: number, url: string, agora = Date.now()): boolean {
  const t = registro.get(userId)?.get(url);
  return typeof t === "number" && agora - t <= TTL_REGISTRO_MS;
}

export function limparRegistroDeVideosDoChat(): void { registro.clear(); }

/** URL de video do nosso Cloudinary, na pasta de videos do chat. Sem rede. */
export function urlDeVideoDoChatValida(url: unknown, env: { cloudName?: string; folder?: string } = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME, folder: process.env.CLOUDINARY_FOLDER,
}): boolean {
  if (typeof url !== "string" || url.length > 600) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com" || u.username || u.password || u.port) return false;
  if (!env.cloudName) return false;
  const base = `/${env.cloudName}/video/upload/`;
  if (!u.pathname.startsWith(base) || u.pathname.includes("..")) return false;
  const pasta = `${env.folder ? env.folder : "mecpro"}/chat-videos/`;
  return u.pathname.includes(`/${pasta}`);
}

export interface DepsVideoChat extends DepsContaMeta {
  baixar(url: string): Promise<{ ok: true; buffer: Buffer; contentType: string } | { ok: false; erro: string }>;
  /** integrations.uploadVideoToMeta */
  enviarParaMeta(userId: number, input: { videoBase64: string; fileName: string; mimeType: string }): Promise<{ videoId: string }>;
  /** campaigns.updateCreativeImage */
  gravarNoCriativo(userId: number, input: { campaignId: number; creativeIndex: number; format: FormatoVideo; videoId: string; videoThumbnailUrl?: string }): Promise<unknown>;
}

const EXT_POR_MIME: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-msvideo": "avi", "video/x-matroska": "mkv",
};

export async function anexarVideoAoCriativo(userId: number, args: Record<string, unknown>, deps: DepsVideoChat): Promise<Record<string, unknown>> {
  const campaignId = args.campaignId;
  if (typeof campaignId !== "number" || !Number.isSafeInteger(campaignId) || campaignId <= 0) return { ok: false, erro: "campaignId invalido." };
  const creativeIndex = args.creativeIndex;
  if (typeof creativeIndex !== "number" || !Number.isSafeInteger(creativeIndex) || creativeIndex < 0) return { ok: false, erro: "creativeIndex invalido. Use o index do criativo devolvido pela consulta da campanha." };
  const format = args.format as FormatoVideo;
  if (!FORMATOS_VIDEO.includes(format)) return { ok: false, erro: "Informe o formato do video: feed (4:5), stories (9:16, tambem Reels) ou square (1:1). Pergunte ao usuario; nao adivinhe." };

  const campaign = await deps.getCampaignById(campaignId);
  if (!campaign) return { ok: false, erro: "Campanha nao encontrada." };
  const projetos = await deps.getProjectsByUserId(userId);
  if (!projetos.some((p: any) => p.id === campaign.projectId)) return { ok: false, erro: "Campanha nao pertence a esta conta." };
  if (campanhaJaPublicada(campaign)) return { ok: false, erro: "Esta campanha ja foi publicada na Meta; nao altero os criativos dela por aqui. Nada foi alterado." };

  let criativos: any[];
  try { criativos = JSON.parse(campaign.creatives || "[]"); } catch { criativos = []; }
  if (!Array.isArray(criativos) || !criativos[creativeIndex]) {
    return { ok: false, erro: "Criativo nao encontrado nesse indice.", criativosDisponiveis: Array.isArray(criativos) ? criativos.map((c: any, index: number) => ({ index, headline: c?.headline || null })) : [] };
  }
  const criativo = criativos[creativeIndex];

  const videoUrl = args.videoUrl;
  if (!urlDeVideoDoChatValida(videoUrl) || !videoDoChatDoUsuario(userId, videoUrl as string)) {
    return { ok: false, erro: "Esse video nao esta entre os enviados por este usuario no chat. Peca que anexe o video de novo no chat. Nada foi alterado." };
  }
  let miniatura: string | undefined;
  if (args.videoThumbnailUrl !== undefined && args.videoThumbnailUrl !== null && args.videoThumbnailUrl !== "") {
    if (typeof args.videoThumbnailUrl !== "string" || !/^https:\/\//i.test(args.videoThumbnailUrl) || args.videoThumbnailUrl.length > 600) return { ok: false, erro: "videoThumbnailUrl precisa ser uma URL HTTPS." };
    miniatura = args.videoThumbnailUrl;
  }

  // A conta do rascunho e a da conexao tem de ser a mesma ANTES de gastar upload.
  const conta = await exigirContaDoRascunho(userId, campaign, deps);
  if (conta.ok === false) return { ok: false, erro: conta.erro, acao: conta.acao, ...(conta.contas ? { contas: conta.contas } : {}) };

  const baixado = await deps.baixar(videoUrl as string);
  if (baixado.ok === false) return { ok: false, erro: `${baixado.erro} Nada foi alterado no rascunho.`, rascunhoAlterado: false };
  const mime = baixado.contentType.split(";")[0].trim().toLowerCase();
  if (!EXT_POR_MIME[mime]) return { ok: false, erro: `Formato de video nao suportado (${mime || "desconhecido"}). Use MP4, MOV, WEBM, AVI ou MKV. Nada foi alterado.`, rascunhoAlterado: false };

  let videoId: string;
  try {
    const enviado = await deps.enviarParaMeta(userId, {
      videoBase64: baixado.buffer.toString("base64"),
      fileName: `chat-video-${campaignId}-${creativeIndex}-${format}.${EXT_POR_MIME[mime]}`,
      mimeType: mime,
    });
    videoId = String(enviado?.videoId || "");
  } catch (e: any) {
    return { ok: false, erro: `A Meta nao aceitou o video: ${String(e?.message || "erro desconhecido").slice(0, 200)}. O rascunho nao foi alterado.`, rascunhoAlterado: false };
  }
  if (!videoId) return { ok: false, erro: "A Meta nao devolveu o identificador do video. O rascunho nao foi alterado.", rascunhoAlterado: false };

  try {
    await deps.gravarNoCriativo(userId, { campaignId, creativeIndex, format, videoId, ...(miniatura ? { videoThumbnailUrl: miniatura } : {}) });
  } catch (e: any) {
    return { ok: false, erro: `O video foi enviado a Meta (videoId ${videoId}) mas nao consegui salva-lo no criativo: ${String(e?.message || "erro desconhecido").slice(0, 200)}. O rascunho continua como estava; tente de novo.`, videoId, rascunhoAlterado: false };
  }

  return {
    ok: true, campaignId, creativeIndex, format, videoId, publicado: false, rascunhoAlterado: true,
    criativo: { index: creativeIndex, headline: criativo?.headline || null },
    conta: conta.conta,
    miniatura: miniatura ? "informada" : "a do criativo, ou a da Meta na publicacao",
    message: `Video associado ao criativo ${creativeIndex} (${format}) na conta "${conta.conta.nome}". Nada foi publicado; publicar continua exigindo a confirmacao propria.`,
  };
}

// ── Dependencias reais ──────────────────────────────────────────────────────────

export async function baixarVideoDoCloudinary(url: string): Promise<{ ok: true; buffer: Buffer; contentType: string } | { ok: false; erro: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: "error" });
    if (!res.ok) return { ok: false, erro: `Nao consegui baixar o video enviado (status ${res.status}).` };
    const declarado = Number(res.headers.get("content-length") || 0);
    if (declarado > LIMITE_VIDEO_BYTES) return { ok: false, erro: "O video excede o limite de 100MB." };
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("video/")) return { ok: false, erro: "O arquivo enviado nao e um video." };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > LIMITE_VIDEO_BYTES) return { ok: false, erro: "O video excede o limite de 100MB." };
    if (buffer.byteLength < 100) return { ok: false, erro: "O video enviado esta vazio ou corrompido." };
    return { ok: true, buffer, contentType };
  } catch { return { ok: false, erro: "Nao consegui baixar o video enviado agora." }; }
}

export async function depsVideoChatPadrao(db: any, base: DepsContaMeta, injected?: any): Promise<DepsVideoChat> {
  const caller = async (userId: number) => {
    if (injected?.caller) return injected.caller;
    const user = await db.getUserById(userId);
    if (!user) throw new Error("Usuario indisponivel.");
    return (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
  };
  return {
    ...base,
    baixar: baixarVideoDoCloudinary,
    enviarParaMeta: async (userId, input) => (await caller(userId)).integrations.uploadVideoToMeta(input as any),
    gravarNoCriativo: async (userId, input) => (await caller(userId)).campaigns.updateCreativeImage(input as any),
  };
}
