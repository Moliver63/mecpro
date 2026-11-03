/**
 * googleAdsVideo.ts — envio de video para o YouTube pela propria Google Ads API
 * (YouTubeVideoUploadService), sem conectar o YouTube nem pedir outro escopo OAuth.
 *
 * Fluxo (https://developers.google.com/google-ads/api/docs/assets/upload-videos):
 *   1. abrir sessao resumable  -> URL de envio
 *   2. enviar os bytes em blocos
 *   3. consultar o estado ate PROCESSED  -> video_id do YouTube
 *   4. criar o asset de video (assets:mutate) -> resource name usado na campanha
 *
 * Sem canal informado, o video vai para um canal gerenciado pelo Google e fica
 * NAO LISTADO, que e o que anuncio precisa. PUBLIC so existe para canal de marca.
 * Funciona para Performance Max e Demand Gen; anuncio de Pesquisa nao leva video.
 */
import { GOOGLE_ADS_API_VERSION_VIDEO, urlDoCliente, urlUploadDeVideo } from "./googleAdsApi";

export type ContextoGoogleAds = {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
};

export type DependenciasVideo = {
  fetchImpl?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
};

export type EntradaVideo = {
  titulo: string;
  descricao?: string;
  /** 24 caracteres, comeca com UC. So com login de usuario; omitido = canal gerenciado pelo Google. */
  canalId?: string;
  /** PUBLIC so vale com canalId (canal de marca). */
  privacidade?: "UNLISTED" | "PUBLIC";
  /** Video feito por IA deve ser declarado. Padrao: true (os videos do MecProAI sao gerados). */
  conteudoGenerativo?: boolean;
};

export const TITULO_VIDEO_MAX = 100;
export const DESCRICAO_VIDEO_MAX = 5000;
export const VIDEO_TAMANHO_MAX_BYTES = 256 * 1024 * 1024;
const BLOCO_MAX_BYTES = 8 * 1024 * 1024;

export class ErroVideoGoogle extends Error {
  /** Preenchido quando o arquivo ja foi enviado: permite retomar sem reenviar o video. */
  public uploadResourceName?: string;
  constructor(public etapa: "validacao" | "download" | "sessao" | "envio" | "processamento" | "asset", mensagem: string) {
    super(`[video Google / ${etapa}] ${mensagem}`);
  }
}

const apenasDigitos = (v: string) => String(v ?? "").replace(/\D/g, "");

function cabecalhos(ctx: ContextoGoogleAds, extra: Record<string, string> = {}): Record<string, string> {
  const login = apenasDigitos(ctx.loginCustomerId ?? "");
  return {
    Authorization: `Bearer ${ctx.accessToken}`,
    "developer-token": ctx.developerToken,
    ...(login ? { "login-customer-id": login } : {}),
    ...extra,
  };
}

/** Confere titulo, descricao, canal e privacidade antes de gastar uma chamada. */
export function validarEntradaVideo(e: EntradaVideo): EntradaVideo {
  const titulo = String(e.titulo ?? "").trim();
  const descricao = String(e.descricao ?? "").trim();
  if (!titulo) throw new ErroVideoGoogle("validacao", "titulo obrigatorio");
  if (titulo.length > TITULO_VIDEO_MAX) throw new ErroVideoGoogle("validacao", `titulo passa de ${TITULO_VIDEO_MAX} caracteres (${titulo.length})`);
  if (descricao.length > DESCRICAO_VIDEO_MAX) throw new ErroVideoGoogle("validacao", `descricao passa de ${DESCRICAO_VIDEO_MAX} caracteres`);
  if (/[<>]/.test(titulo + descricao)) throw new ErroVideoGoogle("validacao", "titulo e descricao nao aceitam < nem >");
  if (e.canalId && !/^UC[\w-]{22}$/.test(e.canalId)) throw new ErroVideoGoogle("validacao", "canalId deve ter 24 caracteres e comecar com UC");
  const privacidade = e.privacidade ?? "UNLISTED";
  if (privacidade === "PUBLIC" && !e.canalId) {
    throw new ErroVideoGoogle("validacao", "PUBLIC so existe para canal de marca; sem canalId o video fica NAO LISTADO");
  }
  return { ...e, titulo, descricao, privacidade };
}

/** Corpo da criacao do upload (nomes snake_case, como no exemplo do Google). */
export function montarCorpoDoUpload(customerId: string, e: EntradaVideo) {
  const v = validarEntradaVideo(e);
  return {
    customer_id: apenasDigitos(customerId),
    you_tube_video_upload: {
      video_title: v.titulo,
      ...(v.descricao ? { video_description: v.descricao } : {}),
      ...(v.canalId ? { channel_id: v.canalId } : {}),
      video_privacy: v.privacidade,
      video_content_metadata: {
        generative_content_disclosure: v.conteudoGenerativo === false ? "NON_GENERATIVE_CONTENT" : "GENERATIVE_CONTENT",
      },
    },
  };
}

/** Etapa 1: abre a sessao resumable e devolve a URL de envio. */
export async function iniciarSessaoDeUpload(
  ctx: ContextoGoogleAds, e: EntradaVideo, tamanhoBytes: number, dep: DependenciasVideo = {},
): Promise<{ uploadUrl: string; granularidade: number }> {
  const f = dep.fetchImpl ?? fetch;
  if (!(tamanhoBytes > 0)) throw new ErroVideoGoogle("sessao", "arquivo vazio");
  if (tamanhoBytes > VIDEO_TAMANHO_MAX_BYTES) throw new ErroVideoGoogle("sessao", "arquivo maior que 256 MB");
  const resp = await f(urlUploadDeVideo(ctx.customerId), {
    method: "POST",
    headers: cabecalhos(ctx, {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(tamanhoBytes),
    }),
    body: JSON.stringify(montarCorpoDoUpload(ctx.customerId, e)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new ErroVideoGoogle("sessao", `HTTP ${resp.status} (${GOOGLE_ADS_API_VERSION_VIDEO}): ${txt.slice(0, 400)}`);
  }
  const uploadUrl = resp.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new ErroVideoGoogle("sessao", "resposta sem x-goog-upload-url");
  const gran = Number(resp.headers.get("x-goog-upload-chunk-granularity"));
  return { uploadUrl, granularidade: Number.isFinite(gran) && gran > 0 ? gran : 256 * 1024 };
}

/** Tamanho de bloco: maior multiplo da granularidade que cabe em 8 MB (minimo, uma granularidade). */
export function tamanhoDoBloco(granularidade: number): number {
  const g = Math.max(1, Math.floor(granularidade));
  return Math.max(g, Math.floor(BLOCO_MAX_BYTES / g) * g);
}

/** Etapa 2: envia os bytes em blocos; o ultimo leva "upload, finalize". Devolve o resource name do upload. */
export async function enviarBytes(
  ctx: ContextoGoogleAds, uploadUrl: string, dados: Uint8Array, granularidade: number, dep: DependenciasVideo = {},
): Promise<string> {
  const f = dep.fetchImpl ?? fetch;
  const bloco = tamanhoDoBloco(granularidade);
  let offset = 0;
  let ultima: any = null;
  while (offset < dados.length) {
    const fim = Math.min(offset + bloco, dados.length);
    const final = fim >= dados.length;
    const resp = await f(uploadUrl, {
      method: "PUT",
      headers: cabecalhos(ctx, {
        "X-Goog-Upload-Offset": String(offset),
        "X-Goog-Upload-Command": final ? "upload, finalize" : "upload",
        "Content-Length": String(fim - offset),
      }),
      body: dados.subarray(offset, fim) as any,
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new ErroVideoGoogle("envio", `HTTP ${resp.status} no byte ${offset}: ${txt.slice(0, 300)}`);
    }
    if (final) ultima = await resp.json().catch(() => null);
    offset = fim;
  }
  const nome = ultima?.resourceName ?? ultima?.resource_name;
  if (!nome) throw new ErroVideoGoogle("envio", "envio concluido sem resourceName na resposta");
  return String(nome);
}

/** Etapa 3: consulta o estado ate PROCESSED. Devolve o video_id (11 caracteres). */
export async function aguardarProcessamento(
  ctx: ContextoGoogleAds, uploadResourceName: string,
  opcoes: { tentativas?: number; intervaloMs?: number } = {}, dep: DependenciasVideo = {},
): Promise<string> {
  const f = dep.fetchImpl ?? fetch;
  const esperar = dep.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tentativas = opcoes.tentativas ?? 30;
  const intervalo = opcoes.intervaloMs ?? 10_000;
  if (!/^customers\/\d+\/youTubeVideoUploads\/[\w-]+$/.test(uploadResourceName)) {
    throw new ErroVideoGoogle("processamento", `resource name inesperado: ${uploadResourceName}`);
  }
  const query =
    "SELECT you_tube_video_upload.resource_name, you_tube_video_upload.video_id, you_tube_video_upload.state " +
    `FROM you_tube_video_upload WHERE you_tube_video_upload.resource_name = '${uploadResourceName}'`;
  let estado = "";
  for (let i = 0; i < tentativas; i++) {
    const resp = await f(urlDoCliente(ctx.customerId, "googleAds:search", GOOGLE_ADS_API_VERSION_VIDEO), {
      method: "POST",
      headers: cabecalhos(ctx, { "Content-Type": "application/json" }),
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new ErroVideoGoogle("processamento", `HTTP ${resp.status}: ${txt.slice(0, 300)}`);
    }
    const j: any = await resp.json();
    const linha = j.results?.[0]?.youTubeVideoUpload ?? j.results?.[0]?.you_tube_video_upload;
    estado = String(linha?.state ?? "");
    const videoId = String(linha?.videoId ?? linha?.video_id ?? "");
    if (estado === "PROCESSED" && videoId) return videoId;
    if (["FAILED", "REJECTED", "UNAVAILABLE"].includes(estado)) {
      throw new ErroVideoGoogle("processamento", `o YouTube terminou o upload em estado ${estado}`);
    }
    await esperar(intervalo);
  }
  throw new ErroVideoGoogle("processamento", `ainda em ${estado || "sem estado"} depois de ${tentativas} consultas; tente de novo mais tarde com o mesmo upload`);
}

/** Etapa 4: cria o asset de video. Devolve customers/{id}/assets/{id}. */
export async function criarAssetDeVideo(
  ctx: ContextoGoogleAds, nome: string, videoId: string, dep: DependenciasVideo = {},
): Promise<string> {
  const f = dep.fetchImpl ?? fetch;
  if (!/^[\w-]{11}$/.test(videoId)) throw new ErroVideoGoogle("asset", `video_id invalido: ${videoId}`);
  const resp = await f(urlDoCliente(ctx.customerId, "assets:mutate", GOOGLE_ADS_API_VERSION_VIDEO), {
    method: "POST",
    headers: cabecalhos(ctx, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      operations: [{ create: { name: nome.slice(0, 128), youtubeVideoAsset: { youtubeVideoId: videoId } } }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new ErroVideoGoogle("asset", `HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const j: any = await resp.json();
  const rn = j.results?.[0]?.resourceName ?? j.results?.[0]?.resource_name;
  if (!rn) throw new ErroVideoGoogle("asset", "assets:mutate sem resourceName");
  return String(rn);
}

/** Baixa o video de uma URL https publica, com teto de tamanho. */
export async function baixarVideo(url: string, dep: DependenciasVideo = {}): Promise<Uint8Array> {
  const f = dep.fetchImpl ?? fetch;
  let u: URL;
  try { u = new URL(url); } catch { throw new ErroVideoGoogle("download", "URL invalida"); }
  if (u.protocol !== "https:") throw new ErroVideoGoogle("download", "use uma URL https");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(u.hostname) || u.hostname.endsWith(".internal")) {
    throw new ErroVideoGoogle("download", "endereco interno nao permitido");
  }
  const resp = await f(u.toString(), { signal: AbortSignal.timeout(120_000), redirect: "error" });
  if (!resp.ok) throw new ErroVideoGoogle("download", `HTTP ${resp.status}`);
  const declarado = Number(resp.headers.get("content-length"));
  if (declarado > VIDEO_TAMANHO_MAX_BYTES) throw new ErroVideoGoogle("download", "arquivo maior que 256 MB");
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.length > VIDEO_TAMANHO_MAX_BYTES) throw new ErroVideoGoogle("download", "arquivo maior que 256 MB");
  return buf;
}

export type ResultadoVideo = { uploadResourceName: string; youtubeVideoId: string; assetResourceName: string };

/** Fluxo completo: baixa, envia, espera o processamento e cria o asset. */
export async function enviarVideoParaOGoogle(
  ctx: ContextoGoogleAds,
  fonte: { url: string } | { bytes: Uint8Array },
  entrada: EntradaVideo,
  dep: DependenciasVideo & { tentativas?: number; intervaloMs?: number } = {},
): Promise<ResultadoVideo> {
  validarEntradaVideo(entrada);
  const bytes = "bytes" in fonte ? fonte.bytes : await baixarVideo(fonte.url, dep);
  const { uploadUrl, granularidade } = await iniciarSessaoDeUpload(ctx, entrada, bytes.length, dep);
  const uploadResourceName = await enviarBytes(ctx, uploadUrl, bytes, granularidade, dep);
  return retomarVideoDoGoogle(ctx, uploadResourceName, entrada.titulo, dep);
}

/** Etapas 3 e 4 para um upload ja enviado (retomada depois de tempo esgotado). */
export async function retomarVideoDoGoogle(
  ctx: ContextoGoogleAds, uploadResourceName: string, nomeDoAsset: string,
  dep: DependenciasVideo & { tentativas?: number; intervaloMs?: number } = {},
): Promise<ResultadoVideo> {
  try {
    const youtubeVideoId = await aguardarProcessamento(ctx, uploadResourceName, { tentativas: dep.tentativas, intervaloMs: dep.intervaloMs }, dep);
    const assetResourceName = await criarAssetDeVideo(ctx, nomeDoAsset, youtubeVideoId, dep);
    return { uploadResourceName, youtubeVideoId, assetResourceName };
  } catch (e) {
    if (e instanceof ErroVideoGoogle) e.uploadResourceName = uploadResourceName;
    throw e;
  }
}
