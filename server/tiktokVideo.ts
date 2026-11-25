/**
 * tiktokVideo.ts — confere e adapta video para anuncio no TikTok, sem carregar o arquivo na memoria.
 *
 * Especificacao oficial (TikTok Auction In-Feed, video enviado, nao Spark):
 * https://ads.tiktok.com/help/article/video-ads-specifications
 *  - proporcao 9:16 (recomendada), 16:9 ou 1:1;
 *  - resolucao minima 540x960 (9:16), 960x540 (16:9), 640x640 (1:1);
 *  - .mp4, .mov, .mpeg, .3gp ou .avi; ate 500 MB; ate 10 minutos; bitrate >= 516 kbps.
 * O codec nao e especificado; HEVC/VP9/AV1 de celular sao convertidos para H.264 + AAC por seguranca.
 *
 * Como nao sobrecarrega o Render (512 MB):
 *  - a sonda e o ffprobe lendo a URL (so o cabecalho do arquivo trafega, nada vai para a memoria);
 *  - a adaptacao e uma transformacao do Cloudinary (feita la, entregue por URL para o TikTok baixar);
 *  - video fora do Cloudinary e importado pelo proprio Cloudinary (upload remoto por URL);
 *  - sem Cloudinary, cai no FFmpeg local em ARQUIVO temporario (download em stream, limite de 500 MB),
 *    e o envio ao TikTok e por arquivo em stream (fs.openAsBlob), nunca por Buffer inteiro.
 *
 * Achado real (24/11, campanha 828): o ad/create recusou com "All videos must have a 16:9, 9:16,
 * or 1:1 aspect ratio, and images must be recommended sizes". A capa tambem passa a sair do video
 * ja adaptado (mesmas dimensoes), em vez da capa automatica do TikTok.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { interpretarSonda, rodar, type SondaDeMidia } from "./chatMedia";

export type ProporcaoTikTok = "9:16" | "1:1" | "16:9";
export type Enquadramento = "preservar" | "preencher";

export const ESPEC_TIKTOK = {
  proporcoes: { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 } as Record<ProporcaoTikTok, number>,
  minimo: { "9:16": [540, 960], "16:9": [960, 540], "1:1": [640, 640] } as Record<ProporcaoTikTok, [number, number]>,
  alvo: { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080] } as Record<ProporcaoTikTok, [number, number]>,
  maxBytes: 500 * 1024 * 1024,
  maxDuracaoS: 600,
  minBitrate: 516_000,
  codecsSemConversao: ["h264"],
};

export interface SondaRemota extends SondaDeMidia { bytes: number | null; bitrate: number | null }

/** ffprobe direto na URL: le so o cabecalho (moov) do arquivo, sem baixar o video para a memoria. */
export async function sondarVideoRemoto(url: string): Promise<SondaRemota | null> {
  const r = await rodar("ffprobe", ["-v", "error", "-rw_timeout", "15000000", "-print_format", "json", "-show_streams", "-show_format", url], { timeoutMs: 30000, maxStdout: 2 * 1024 * 1024 });
  if (r.code !== 0) return null;
  try {
    const json = JSON.parse(r.stdout.toString("utf8"));
    const s = interpretarSonda(json);
    if (!s) return null;
    const bytes = Number(json?.format?.size), bitrate = Number(json?.format?.bit_rate);
    return { ...s, bytes: bytes > 0 ? bytes : null, bitrate: bitrate > 0 ? bitrate : null };
  } catch { return null; }
}

export function proporcaoAceita(w: number, h: number): ProporcaoTikTok | null {
  if (!(w > 0 && h > 0)) return null;
  const r = w / h;
  return (Object.entries(ESPEC_TIKTOK.proporcoes) as Array<[ProporcaoTikTok, number]>).find(([, p]) => Math.abs(r - p) / p <= 0.02)?.[0] ?? null;
}

/** Proporcao aceita mais proxima. No feed do TikTok, qualquer video em pe vai para 9:16. */
export function proporcaoAlvo(w: number, h: number, posicionamento: "tiktok" | "automatico" = "tiktok"): ProporcaoTikTok {
  const r = w / h;
  if (posicionamento === "tiktok" && r < 0.9) return "9:16";
  return (Object.entries(ESPEC_TIKTOK.proporcoes) as Array<[ProporcaoTikTok, number]>)
    .sort((a, b) => Math.abs(Math.log(r / a[1])) - Math.abs(Math.log(r / b[1])))[0][0];
}

export interface PlanoDeVideo {
  /** Bloqueios que mudariam o conteudo (ex.: video longo demais): nao corrige sozinho. */
  problemas: string[];
  /** Correcoes tecnicas que nao mudam a estrategia: feitas automaticamente. */
  correcoes: string[];
  avisos: string[];
  proporcao: ProporcaoTikTok;
  largura: number; altura: number;
  mudarProporcao: boolean;
  converterCodec: boolean;
  reduzirTamanho: boolean;
  transformar: boolean;
}

export function planejarVideo(s: SondaRemota, opcoes: { posicionamento?: "tiktok" | "automatico"; enquadramento?: Enquadramento } = {}): PlanoDeVideo {
  const problemas: string[] = [], correcoes: string[] = [], avisos: string[] = [];
  const posic = opcoes.posicionamento || "tiktok";
  if (!s.temVideo) problemas.push("O arquivo nao tem faixa de video legivel.");
  if (s.duracaoS > ESPEC_TIKTOK.maxDuracaoS) problemas.push(`O video tem ${Math.round(s.duracaoS)} s; o TikTok aceita ate 10 minutos. Corte o video antes (cortar muda o conteudo, entao nao faco sozinho).`);
  const aceita = proporcaoAceita(s.largura, s.altura);
  const proporcao = aceita ?? proporcaoAlvo(s.largura, s.altura, posic);
  const mudarProporcao = !aceita;
  if (mudarProporcao) {
    correcoes.push(`Proporcao ${s.rotuloProporcao} (${s.largura}x${s.altura}) nao e aceita; adapto para ${proporcao} ${opcoes.enquadramento === "preencher" ? "preenchendo o quadro com corte centrado no assunto" : "sem cortar a imagem (fundo desfocado do proprio video)"}.`);
  }
  const [minW, minH] = ESPEC_TIKTOK.minimo[proporcao];
  let [largura, altura] = mudarProporcao ? ESPEC_TIKTOK.alvo[proporcao] : [s.largura, s.altura];
  if (!mudarProporcao && (largura < minW || altura < minH)) {
    [largura, altura] = ESPEC_TIKTOK.alvo[proporcao];
    correcoes.push(`Resolucao ${s.largura}x${s.altura} abaixo do minimo do TikTok (${minW}x${minH}); amplio para ${largura}x${altura}.`);
    avisos.push("Ampliar nao recupera nitidez: se tiver o arquivo original em resolucao maior, prefira ele.");
  }
  const converterCodec = !!s.codecVideo && !ESPEC_TIKTOK.codecsSemConversao.includes(s.codecVideo.toLowerCase());
  if (converterCodec) correcoes.push(`Codec ${s.codecVideo} convertido para H.264 (audio AAC), o formato mais compativel do TikTok.`);
  const reduzirTamanho = !!s.bytes && s.bytes > ESPEC_TIKTOK.maxBytes;
  if (reduzirTamanho) correcoes.push(`Arquivo com ${Math.round(s.bytes! / 1048576)} MB (limite 500 MB): recomprimo mantendo a qualidade visual.`);
  if (s.bitrate && s.bitrate < ESPEC_TIKTOK.minBitrate) avisos.push(`Bitrate de ${Math.round(s.bitrate / 1000)} kbps abaixo do recomendado (516 kbps): o TikTok pode recusar ou exibir com baixa qualidade.`);
  if (!s.temAudio) avisos.push("Video sem audio: no TikTok, anuncio com som costuma render mais.");
  const transformar = mudarProporcao || converterCodec || reduzirTamanho || largura !== s.largura || altura !== s.altura;
  return { problemas, correcoes, avisos, proporcao, largura, altura, mudarProporcao, converterCodec, reduzirTamanho, transformar };
}

// ── Cloudinary ───────────────────────────────────────────────────────────────

const RE_CLOUDINARY = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/;
export const ehVideoDoCloudinary = (url: string) => RE_CLOUDINARY.test(url);

/** Tira transformacoes ja aplicadas (ex.: vc_h264,f_mp4/) e devolve "v123/pasta/arquivo.ext". */
function caminhoOriginal(resto: string): string {
  return resto.replace(/^(?:[a-z]{1,3}_[^/]*\/)+(?=v\d+\/|[^/]+$)/i, "");
}

/** URL do video adaptado (feito no Cloudinary). Audio preservado em AAC; qualidade automatica alta. */
export function urlCloudinaryAdaptada(url: string, plano: Pick<PlanoDeVideo, "largura" | "altura" | "mudarProporcao" | "transformar">, enquadramento: Enquadramento = "preservar"): string | null {
  const m = url.match(RE_CLOUDINARY);
  if (!m) return null;
  const resto = caminhoOriginal(m[2]).replace(/\.[a-z0-9]+$/i, ".mp4");
  const tam = `w_${plano.largura},h_${plano.altura}`;
  const quadro = !plano.mudarProporcao ? `c_scale,${tam}` : enquadramento === "preencher" ? `c_fill,g_auto,${tam}` : `c_pad,b_blurred:400:15,${tam}`;
  return `${m[1]}${quadro},vc_h264,ac_aac,q_auto:good,f_mp4/${resto}`;
}

/** Capa JPG tirada do proprio video adaptado (mesmas dimensoes; "images must be recommended sizes"). */
export function urlCapaDoVideo(urlAdaptada: string, segundo = 1): string | null {
  const m = urlAdaptada.match(RE_CLOUDINARY);
  if (!m) return null;
  const [transform, ...caminho] = m[2].split("/");
  const semFormato = transform.replace(/,?vc_h264|,?ac_aac|,?f_mp4/g, "");
  return `${m[1]}so_${segundo},${semFormato},f_jpg/${caminho.join("/").replace(/\.[a-z0-9]+$/i, ".jpg")}`;
}

/**
 * Transformacao sob demanda de video grande devolve 423 enquanto o Cloudinary processa. Espera ficar
 * pronta antes de entregar a URL ao TikTok (que desistiria do download).
 */
export async function aguardarUrlPronta(url: string, doFetch: typeof fetch = fetch, opcoes: { tentativas?: number; intervaloMs?: number } = {}): Promise<boolean> {
  const tentativas = opcoes.tentativas ?? 18, intervalo = opcoes.intervaloMs ?? 5000;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await doFetch(url, { method: "HEAD", signal: AbortSignal.timeout(20000) });
      if (r.ok) return true;
      if (r.status !== 423 && r.status !== 420 && r.status < 500) return false;
    } catch { /* tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, intervalo));
  }
  return false;
}

/** Importa um video de URL de terceiros para o Cloudinary pelo proprio Cloudinary (o servidor nao baixa). */
export async function importarNoCloudinary(urlRemota: string, doFetch: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return null;
  const folder = env.CLOUDINARY_FOLDER ? `${env.CLOUDINARY_FOLDER}/tiktok-videos` : "mecpro/tiktok-videos";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");
  const form = new FormData();
  form.append("file", urlRemota); form.append("folder", folder); form.append("api_key", key);
  form.append("timestamp", String(timestamp)); form.append("signature", signature);
  const r = await doFetch(`https://api.cloudinary.com/v1_1/${cloud}/video/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(300000) });
  const d: any = await r.json().catch(() => ({}));
  return r.ok && d?.secure_url ? String(d.secure_url) : null;
}

// ── FFmpeg local (sem Cloudinary) ────────────────────────────────────────────

export function filtroFfmpeg(w: number, h: number, mudarProporcao: boolean, enquadramento: Enquadramento): string {
  if (!mudarProporcao) return `scale=${w}:${h},setsar=1,format=yuv420p`;
  if (enquadramento === "preencher") return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p`;
  const bw = Math.round(w / 8) * 2, bh = Math.round(h / 8) * 2;
  return [
    "split[a][b]",
    `[a]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=6:2,scale=${w}:${h},setsar=1[bg]`,
    `[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg]`,
    "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p",
  ].join(";");
}

/** Baixa em stream para arquivo, com teto de bytes (nunca guarda o video inteiro na memoria). */
export async function baixarParaArquivo(url: string, destino: string, limiteBytes = ESPEC_TIKTOK.maxBytes * 2, doFetch: typeof fetch = fetch): Promise<number> {
  const r = await doFetch(url, { signal: AbortSignal.timeout(600000) });
  if (!r.ok || !r.body) throw new Error(`Nao consegui baixar o video (HTTP ${r.status}).`);
  const declarado = Number(r.headers.get("content-length") || 0);
  if (declarado > limiteBytes) throw new Error(`Video com ${Math.round(declarado / 1048576)} MB acima do limite de processamento.`);
  let total = 0;
  const limitado = Readable.fromWeb(r.body as any).on("data", (c: Buffer) => {
    total += c.length;
    if (total > limiteBytes) limitado.destroy(new Error("Video acima do limite de processamento."));
  });
  await pipeline(limitado, createWriteStream(destino));
  return total;
}

export async function md5DoArquivo(caminho: string): Promise<string> {
  const h = createHash("md5");
  await pipeline(createReadStream(caminho), h);
  return h.digest("hex");
}

/** Converte com FFmpeg em arquivo temporario. Quem chama remove a pasta (via comPastaTemporaria). */
export async function adaptarComFfmpeg(entrada: string, saida: string, plano: PlanoDeVideo, temAudio: boolean, enquadramento: Enquadramento = "preservar"): Promise<void> {
  const filtro = filtroFfmpeg(plano.largura, plano.altura, plano.mudarProporcao, enquadramento);
  const complexo = filtro.includes("[");
  const args = ["-v", "error", "-y", "-i", entrada, complexo ? "-filter_complex" : "-vf", filtro,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-maxrate", "8M", "-bufsize", "16M", "-threads", "2",
    ...(temAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"]), "-movflags", "+faststart", saida];
  const r = await rodar("ffmpeg", args, { timeoutMs: 15 * 60000, maxStdout: 1024 * 1024 });
  if (r.timeout) throw new Error("A adaptacao do video demorou demais e foi interrompida.");
  if (r.code !== 0) throw new Error(`O FFmpeg nao conseguiu adaptar o video: ${r.stderr.slice(0, 300)}`);
}

export async function comPastaTemporaria<T>(fn: (pasta: string) => Promise<T>): Promise<T> {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "tiktok-video-"));
  try { return await fn(pasta); } finally { await fs.rm(pasta, { recursive: true, force: true }).catch(() => {}); }
}

// ── Preparacao completa ──────────────────────────────────────────────────────

export interface VideoPreparado {
  nome: string;
  origem: string;
  /** URL que o TikTok baixa (UPLOAD_BY_URL). Ausente quando o envio e por arquivo local. */
  urlFinal?: string;
  /** Arquivo local pronto (fallback FFmpeg); o envio e UPLOAD_BY_FILE em stream. */
  arquivoLocal?: string;
  capaUrl?: string;
  sonda: SondaRemota | null;
  plano: PlanoDeVideo | null;
  /** Identifica fonte + transformacao: nome no TikTok deterministico, reenvio vira reaproveitamento seguro. */
  assinatura: string;
}

export interface DepsVideo {
  sondar(url: string): Promise<SondaRemota | null>;
  importar(url: string): Promise<string | null>;
  aguardar(url: string): Promise<boolean>;
  /** Sem Cloudinary: baixa a origem e adapta com FFmpeg, tudo em arquivo (devolve o caminho pronto). */
  adaptarLocal?(origem: string, pasta: string, plano: PlanoDeVideo, temAudio: boolean, enquadramento: Enquadramento): Promise<string>;
}

export async function adaptarLocalPadrao(origem: string, pasta: string, plano: PlanoDeVideo, temAudio: boolean, enquadramento: Enquadramento): Promise<string> {
  const entrada = path.join(pasta, "origem"), saida = path.join(pasta, "tiktok.mp4");
  await baixarParaArquivo(origem, entrada);
  await adaptarComFfmpeg(entrada, saida, plano, temAudio, enquadramento);
  await fs.rm(entrada, { force: true });
  return saida;
}

export const depsVideoPadrao: DepsVideo = { sondar: sondarVideoRemoto, importar: (u) => importarNoCloudinary(u), aguardar: (u) => aguardarUrlPronta(u), adaptarLocal: adaptarLocalPadrao };

/** So converte o codec (H.264 + AAC), sem mexer em tamanho: usado quando a sonda falha. */
export function urlCloudinaryH264(url: string): string | null {
  const m = url.match(RE_CLOUDINARY);
  if (!m) return null;
  return `${m[1]}vc_h264,ac_aac,f_mp4/${caminhoOriginal(m[2]).replace(/\.[a-z0-9]+$/i, ".mp4")}`;
}

/**
 * Sonda, planeja e devolve a URL pronta para o TikTok. Nao cria nada no TikTok.
 * `executar=false` (validacao previa) so planeja; `true` tambem importa/espera a transformacao.
 */
export async function prepararVideo(fonte: { url: string; nome?: string }, opcoes: { posicionamento?: "tiktok" | "automatico"; enquadramento?: Enquadramento; executar?: boolean }, deps: DepsVideo = depsVideoPadrao): Promise<VideoPreparado & { problemas: string[]; correcoes: string[]; avisos: string[] }> {
  const nome = fonte.nome || path.basename(new URL(fonte.url).pathname) || "video";
  const enquadramento = opcoes.enquadramento || "preservar";
  const sonda = await deps.sondar(fonte.url);
  const base = { nome, origem: fonte.url, sonda, plano: null as PlanoDeVideo | null };
  if (!sonda) {
    // Sem sonda, o video do Cloudinary vai ao menos em H.264 (HEVC de iPhone nao segue cru; Goldfish 25/11).
    const h264 = urlCloudinaryH264(fonte.url);
    return { ...base, urlFinal: h264 || fonte.url, assinatura: assinar(fonte.url, "sem-sonda"), problemas: [], correcoes: h264 ? [`"${nome}" enviado em H.264 por seguranca.`] : [],
      avisos: [`Nao consegui ler as caracteristicas de "${nome}" antes do envio; o TikTok confere no upload e eu confiro de novo depois dele.`] };
  }
  const plano = planejarVideo(sonda, opcoes);
  const assinatura = assinar(fonte.url, `${plano.largura}x${plano.altura}:${plano.mudarProporcao}:${enquadramento}`);
  const saida = { ...base, plano, assinatura, problemas: [...plano.problemas], correcoes: [...plano.correcoes], avisos: [...plano.avisos] };
  if (plano.problemas.length) return saida;
  let urlCloud = ehVideoDoCloudinary(fonte.url) ? fonte.url : null;
  if (!urlCloud && plano.transformar && opcoes.executar) {
    urlCloud = await deps.importar(fonte.url);
    if (urlCloud) saida.correcoes.push(`Importei "${nome}" para o Cloudinary para adaptar sem usar a memoria do servidor.`);
  }
  if (!plano.transformar) return { ...saida, urlFinal: fonte.url, capaUrl: urlCloud ? urlCapaDoVideo(urlCloudinaryAdaptada(urlCloud, plano, enquadramento)!) || undefined : undefined };
  if (!urlCloud) {
    // Sem Cloudinary: quem publica cai no FFmpeg local (arquivo temporario + envio em stream).
    return { ...saida, avisos: [...saida.avisos, `"${nome}" sera adaptado com FFmpeg no servidor (sem Cloudinary disponivel).`] };
  }
  const urlFinal = urlCloudinaryAdaptada(urlCloud, plano, enquadramento)!;
  if (opcoes.executar && !(await deps.aguardar(urlFinal))) {
    saida.problemas.push(`O Cloudinary nao terminou de adaptar "${nome}" a tempo. Tente de novo em alguns minutos.`);
  }
  return { ...saida, urlFinal, capaUrl: urlCapaDoVideo(urlFinal) || undefined };
}

function assinar(url: string, extra: string): string {
  return createHash("sha1").update(`${url}|${extra}`).digest("hex").slice(0, 10);
}

/** Nome do arquivo no TikTok: deterministico (mesma fonte e transformacao = mesmo nome). */
export function nomeNoTikTok(v: Pick<VideoPreparado, "nome" | "assinatura" | "plano">): string {
  const base = v.nome.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 60);
  const sufixo = v.plano ? `_${v.plano.proporcao.replace(":", "x")}` : "";
  return `mecpro_${v.assinatura}_${base}${sufixo}.mp4`;
}
