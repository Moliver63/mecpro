/**
 * chatMedia.ts — processamento real de fotos e videos enviados no chat.
 *
 * Auditoria 23/11 (chat multimodal): o chat guardava fotos e videos no Cloudinary,
 * mas so as fotos eram "vistas" (na geracao da campanha) e o video era uma URL que
 * o modelo nao entendia ("voce nao consegue assistir"). Aqui ficam as pecas que
 * faltavam, todas sem rede propria (ffmpeg/ffprobe locais) e com dependencias
 * injetaveis para teste:
 *
 * - validar o CONTEUDO do arquivo (assinatura + ffprobe), nao so o mime declarado;
 * - sondar video (duracao, resolucao com rotacao, audio, codecs);
 * - extrair quadros para analise visual;
 * - adaptar para 9:16 / 4:5 / 1:1 sem distorcer (corte central ou fundo desfocado);
 * - conferir as especificacoes da Meta por posicionamento;
 * - limites tecnicos configuraveis por ambiente.
 *
 * Nada aqui publica, envia a Meta ou grava em banco.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// ── Limites (configuraveis por variavel de ambiente) ─────────────────────────

export interface LimitesDeMidia {
  fotoBytes: number;
  videoBytes: number;
  videoDuracaoMaxS: number;
  fotosPorConversa: number;
  videosPorMensagem: number;
}

function inteiroDoEnv(nome: string, padrao: number, min: number, max: number, env: NodeJS.ProcessEnv): number {
  const n = Number(env[nome]);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : padrao;
}

export function limitesDeMidia(env: NodeJS.ProcessEnv = process.env): LimitesDeMidia {
  return {
    fotoBytes: inteiroDoEnv("CHAT_MAX_FOTO_MB", 6, 1, 25, env) * 1024 * 1024,
    videoBytes: inteiroDoEnv("CHAT_MAX_VIDEO_MB", 100, 5, 500, env) * 1024 * 1024,
    videoDuracaoMaxS: inteiroDoEnv("CHAT_MAX_VIDEO_SEGUNDOS", 600, 5, 3600, env),
    fotosPorConversa: inteiroDoEnv("CHAT_MAX_FOTOS", 10, 1, 30, env),
    videosPorMensagem: inteiroDoEnv("CHAT_MAX_VIDEOS", 3, 1, 10, env),
  };
}

// ── Assinatura do arquivo ────────────────────────────────────────────────────

export type ContainerDeVideo = "mp4" | "mov" | "webm" | "mkv" | "avi";

/** Reconhece o container pelos primeiros bytes. Nao confia em mime nem em extensao. */
export function detectarContainerDeVideo(b: Buffer): ContainerDeVideo | null {
  if (b.length >= 12 && b.subarray(4, 8).toString("ascii") === "ftyp") {
    const marca = b.subarray(8, 12).toString("ascii");
    return marca === "qt  " ? "mov" : "mp4";
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // EBML: webm e mkv. "webm" aparece no DocType nos primeiros bytes.
    return b.subarray(0, Math.min(b.length, 64)).toString("latin1").includes("webm") ? "webm" : "mkv";
  }
  if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "AVI ") return "avi";
  return null;
}

export const MIME_POR_CONTAINER: Record<ContainerDeVideo, string> = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo",
};

// ── Processos externos (sem shell) ───────────────────────────────────────────

export interface ResultadoProcesso { code: number | null; stdout: Buffer; stderr: string; timeout: boolean }

// Binarios: ffmpeg/ffprobe do sistema quando existem (FFMPEG_PATH/FFPROBE_PATH tem prioridade); senao os pacotes
// ffmpeg-static/ffprobe-static (instalados com o npm install), para funcionar no Render nativo sem Dockerfile.
const resolvidos = new Map<string, string>();
export function _limparBinariosResolvidos(): void { resolvidos.clear(); }
export function resolverBinario(cmd: string, env: NodeJS.ProcessEnv = process.env): string {
  if (cmd !== "ffmpeg" && cmd !== "ffprobe") return cmd;
  const doEnv = (cmd === "ffmpeg" ? env.FFMPEG_PATH : env.FFPROBE_PATH)?.trim();
  if (doEnv) return doEnv;
  const guardado = resolvidos.get(cmd);
  if (guardado) return guardado;
  let achado = cmd;
  const noSistema = spawnSync(cmd, ["-version"], { stdio: "ignore", timeout: 5000 });
  if (noSistema.status !== 0) {
    try {
      const req = createRequire(import.meta.url);
      const caminho: string | null = cmd === "ffmpeg" ? req("ffmpeg-static") : req("ffprobe-static")?.path;
      if (caminho && existsSync(caminho)) achado = caminho;
    } catch { /* pacote ausente: segue com o nome (ffmpegDisponivel() dira que nao ha) */ }
  }
  resolvidos.set(cmd, achado);
  return achado;
}

export function rodar(cmd: string, args: string[], opts: { timeoutMs: number; maxStdout?: number }): Promise<ResultadoProcesso> {
  cmd = resolverBinario(cmd);
  return new Promise((resolve) => {
    let filho;
    try { filho = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }); }
    catch { return resolve({ code: null, stdout: Buffer.alloc(0), stderr: "spawn falhou", timeout: false }); }
    const saida: Buffer[] = [];
    let tam = 0;
    let err = "";
    let timeout = false;
    const teto = opts.maxStdout ?? 64 * 1024 * 1024;
    const timer = setTimeout(() => { timeout = true; filho.kill("SIGKILL"); }, opts.timeoutMs);
    filho.stdout.on("data", (c: Buffer) => { tam += c.length; if (tam <= teto) saida.push(c); else filho.kill("SIGKILL"); });
    filho.stderr.on("data", (c: Buffer) => { if (err.length < 8000) err += c.toString("utf8"); });
    filho.on("error", () => { clearTimeout(timer); resolve({ code: null, stdout: Buffer.concat(saida), stderr: err || "processo indisponivel", timeout }); });
    filho.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout: Buffer.concat(saida), stderr: err, timeout }); });
  });
}

let disponibilidade: Promise<boolean> | null = null;
/** ffmpeg e ffprobe estao instalados neste ambiente? (resultado em cache) */
export function ffmpegDisponivel(): Promise<boolean> {
  if (!disponibilidade) {
    disponibilidade = Promise.all([
      rodar("ffmpeg", ["-version"], { timeoutMs: 5000, maxStdout: 4096 }),
      rodar("ffprobe", ["-version"], { timeoutMs: 5000, maxStdout: 4096 }),
    ]).then(([a, b]) => a.code === 0 && b.code === 0);
  }
  return disponibilidade;
}
export function _reiniciarCacheDeFfmpeg(): void { disponibilidade = null; }

export async function comArquivoTemporario<T>(buffer: Buffer, extensao: string, fn: (caminho: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chatmedia-"));
  const caminho = path.join(dir, `entrada.${extensao.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin"}`);
  try {
    await fs.writeFile(caminho, buffer);
    return await fn(caminho);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Sonda ────────────────────────────────────────────────────────────────────

export interface SondaDeMidia {
  duracaoS: number;
  largura: number;
  altura: number;
  fps: number | null;
  temAudio: boolean;
  codecVideo: string | null;
  codecAudio: string | null;
  proporcao: number;
  rotuloProporcao: string;
  temVideo: boolean;
}

const REFERENCIAS: Array<[string, number]> = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9], ["1.91:1", 1.91]];

/** "9:16", "4:5", "1:1"... quando a proporcao esta a menos de 2% de uma conhecida; senao "L:A" reduzido. */
export function rotuloDeProporcao(largura: number, altura: number): string {
  if (!(largura > 0) || !(altura > 0)) return "desconhecida";
  const r = largura / altura;
  const perto = REFERENCIAS.find(([, v]) => Math.abs(r - v) / v < 0.02);
  if (perto) return perto[0];
  return r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
}

function fracao(txt: unknown): number | null {
  if (typeof txt !== "string") return null;
  const [a, b] = txt.split("/").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const v = a / b;
  return v > 0 && v < 1000 ? Math.round(v * 100) / 100 : null;
}

/** Interpreta a saida JSON do ffprobe. Aplica a rotacao (video de celular vertical vem "deitado" com rotate=90). */
export function interpretarSonda(json: any): SondaDeMidia | null {
  const streams: any[] = Array.isArray(json?.streams) ? json.streams : [];
  const v = streams.find((s) => s?.codec_type === "video" && s?.disposition?.attached_pic !== 1);
  const a = streams.find((s) => s?.codec_type === "audio");
  let largura = Number(v?.width) || 0;
  let altura = Number(v?.height) || 0;
  const rot = Number((v?.side_data_list || []).find((d: any) => d?.rotation !== undefined)?.rotation ?? v?.tags?.rotate ?? 0);
  if (Math.abs(rot) % 180 === 90) [largura, altura] = [altura, largura];
  const duracao = Number(json?.format?.duration ?? v?.duration);
  return {
    temVideo: !!v && largura > 0 && altura > 0,
    duracaoS: Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao * 100) / 100 : 0,
    largura, altura,
    fps: fracao(v?.avg_frame_rate) ?? fracao(v?.r_frame_rate),
    temAudio: !!a,
    codecVideo: v?.codec_name ?? null,
    codecAudio: a?.codec_name ?? null,
    proporcao: largura > 0 && altura > 0 ? largura / altura : 0,
    rotuloProporcao: rotuloDeProporcao(largura, altura),
  };
}

export async function sondarArquivo(caminho: string): Promise<SondaDeMidia | null> {
  const r = await rodar("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", caminho], { timeoutMs: 20000, maxStdout: 2 * 1024 * 1024 });
  if (r.code !== 0) return null;
  try { return interpretarSonda(JSON.parse(r.stdout.toString("utf8"))); } catch { return null; }
}

export async function sondarBuffer(buffer: Buffer, extensao: string): Promise<SondaDeMidia | null> {
  return comArquivoTemporario(buffer, extensao, sondarArquivo);
}

// ── Validacao do conteudo ────────────────────────────────────────────────────

export type ValidacaoDeVideo =
  | { ok: true; container: ContainerDeVideo; sonda: SondaDeMidia | null; sondado: boolean }
  | { ok: false; erro: string };

/**
 * Confere que o arquivo e mesmo um video reproduzivel: assinatura reconhecida, ffprobe acha um
 * fluxo de video, duracao dentro do limite. Sem ffprobe no ambiente, so a assinatura e conferida
 * (`sondado: false`) e quem chama deve dizer isso.
 */
export async function validarVideoEnviado(buffer: Buffer, limites: LimitesDeMidia = limitesDeMidia()): Promise<ValidacaoDeVideo> {
  const container = detectarContainerDeVideo(buffer);
  if (!container) return { ok: false, erro: "O arquivo não parece ser um vídeo válido (MP4, MOV, WEBM, AVI ou MKV). Confira se não está corrompido." };
  if (buffer.length > limites.videoBytes) return { ok: false, erro: `Vídeo muito grande: o limite é ${Math.round(limites.videoBytes / 1048576)}MB.` };
  if (!(await ffmpegDisponivel())) return { ok: true, container, sonda: null, sondado: false };
  const sonda = await sondarBuffer(buffer, container);
  if (!sonda || !sonda.temVideo) return { ok: false, erro: "Não consegui ler esse vídeo: o arquivo está corrompido ou não tem imagem. Tente exportar de novo e enviar." };
  if (sonda.duracaoS > limites.videoDuracaoMaxS) return { ok: false, erro: `Vídeo longo demais (${Math.round(sonda.duracaoS)}s). O limite é ${limites.videoDuracaoMaxS}s.` };
  return { ok: true, container, sonda, sondado: true };
}

/**
 * Mesma validacao, lendo do ARQUIVO (upload em disco): so os primeiros bytes vao para a memoria.
 * Pedido de Michel (25/11): processar video grande sem sobrecarregar os 512 MB do Render.
 */
export async function validarVideoEmArquivo(caminho: string, tamanhoBytes: number, limites: LimitesDeMidia = limitesDeMidia()): Promise<ValidacaoDeVideo> {
  const cabecalho = Buffer.alloc(64);
  const fh = await fs.open(caminho, "r");
  try { await fh.read(cabecalho, 0, 64, 0); } finally { await fh.close(); }
  const container = detectarContainerDeVideo(cabecalho);
  if (!container) return { ok: false, erro: "O arquivo não parece ser um vídeo válido (MP4, MOV, WEBM, AVI ou MKV). Confira se não está corrompido." };
  if (tamanhoBytes > limites.videoBytes) return { ok: false, erro: `Vídeo muito grande: o limite é ${Math.round(limites.videoBytes / 1048576)}MB.` };
  if (!(await ffmpegDisponivel())) return { ok: true, container, sonda: null, sondado: false };
  const sonda = await sondarArquivo(caminho);
  if (!sonda || !sonda.temVideo) return { ok: false, erro: "Não consegui ler esse vídeo: o arquivo está corrompido ou não tem imagem. Tente exportar de novo e enviar." };
  if (sonda.duracaoS > limites.videoDuracaoMaxS) return { ok: false, erro: `Vídeo longo demais (${Math.round(sonda.duracaoS)}s). O limite é ${limites.videoDuracaoMaxS}s.` };
  return { ok: true, container, sonda, sondado: true };
}

// ── Quadros ──────────────────────────────────────────────────────────────────

export interface Quadro { tempoS: number; jpeg: Buffer }

/** Extrai `n` quadros espalhados pelo video (no meio de cada trecho), reduzidos a no maximo 768px de largura. */
export async function extrairQuadros(caminho: string, duracaoS: number, n = 4): Promise<Quadro[]> {
  const total = Math.max(1, Math.min(8, n));
  const quadros: Quadro[] = [];
  for (let i = 0; i < total; i++) {
    const t = duracaoS > 0 ? Math.max(0, duracaoS * ((i + 0.5) / total)) : 0;
    const r = await rodar("ffmpeg", ["-v", "error", "-ss", t.toFixed(2), "-i", caminho, "-frames:v", "1",
      "-vf", "scale='min(768,iw)':-2", "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { timeoutMs: 30000, maxStdout: 4 * 1024 * 1024 });
    if (r.code === 0 && r.stdout.length > 200 && r.stdout[0] === 0xff && r.stdout[1] === 0xd8) quadros.push({ tempoS: Math.round(t * 10) / 10, jpeg: r.stdout });
  }
  return quadros;
}

/** Extrai o audio em MP3 mono de 16 kHz (para transcricao). Devolve null se nao houver audio utilizavel. */
export async function extrairAudio(caminho: string): Promise<Buffer | null> {
  const r = await rodar("ffmpeg", ["-v", "error", "-i", caminho, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", "mp3", "-"], { timeoutMs: 120000, maxStdout: 24 * 1024 * 1024 });
  return r.code === 0 && r.stdout.length > 1000 ? r.stdout : null;
}

// ── Formatos publicitarios ───────────────────────────────────────────────────

export type FormatoDeAnuncio = "stories" | "feed" | "square";
export const FORMATOS_DE_ANUNCIO: Record<FormatoDeAnuncio, { largura: number; altura: number; rotulo: string; usos: string }> = {
  stories: { largura: 1080, altura: 1920, rotulo: "9:16", usos: "Stories e Reels" },
  feed: { largura: 1080, altura: 1350, rotulo: "4:5", usos: "Feed" },
  square: { largura: 1080, altura: 1080, rotulo: "1:1", usos: "Feed quadrado" },
};

/** Quais formatos o arquivo ja atende sem nenhuma adaptacao (proporcao a menos de 1%). */
export function formatosQueJaServem(sonda: Pick<SondaDeMidia, "proporcao">): FormatoDeAnuncio[] {
  return (Object.keys(FORMATOS_DE_ANUNCIO) as FormatoDeAnuncio[]).filter((f) => {
    const alvo = FORMATOS_DE_ANUNCIO[f].largura / FORMATOS_DE_ANUNCIO[f].altura;
    return sonda.proporcao > 0 && Math.abs(sonda.proporcao - alvo) / alvo < 0.01;
  });
}

export type ModoDeAdaptacao = "auto" | "preservar" | "cortar";

/**
 * Escolhe como adaptar. `cortar`: preenche o quadro e corta as sobras (centralizado).
 * `preservar`: o video inteiro fica visivel sobre um fundo desfocado do proprio video (nada e cortado).
 * `auto`: corta quando a perda e pequena (a proporcao de origem difere menos de 12% do alvo),
 * preserva quando cortar tiraria muito da cena. Em nenhum modo a imagem e esticada.
 */
export function escolherModo(sonda: Pick<SondaDeMidia, "proporcao">, formato: FormatoDeAnuncio, modo: ModoDeAdaptacao): "cortar" | "preservar" {
  if (modo === "cortar" || modo === "preservar") return modo;
  const f = FORMATOS_DE_ANUNCIO[formato];
  const alvo = f.largura / f.altura;
  const diferenca = Math.abs(sonda.proporcao - alvo) / alvo;
  return diferenca <= 0.12 ? "cortar" : "preservar";
}

export function filtroDeAdaptacao(formato: FormatoDeAnuncio, modo: "cortar" | "preservar", focoX = 0.5, reducao = 1): string {
  // reducao 3 gera a previa em 360p (1080/3, 1920/3, 1350/3 sao inteiros e pares).
  const W = Math.round(FORMATOS_DE_ANUNCIO[formato].largura / reducao), H = Math.round(FORMATOS_DE_ANUNCIO[formato].altura / reducao);
  const fx = Math.max(0, Math.min(1, Number.isFinite(focoX) ? focoX : 0.5));
  // Fundo em ~1/4 da resolucao, com dimensoes PARES (1350/4 = 337,5 quebrava o 4:5).
  const bw = Math.round(W / 8) * 2, bh = Math.round(H / 8) * 2;
  // Corte centrado no assunto (focoX 0..1), nunca para fora do quadro; focoX 0.5 = corte central de antes.
  if (modo === "cortar") return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='max(0,min(iw-${W},iw*${fx.toFixed(3)}-${W}/2))':y='(ih-${H})/2',setsar=1,format=yuv420p`;
  return [
    "split[a][b]",
    // Fundo desfocado calculado em 1/4 da resolucao e ampliado: mesmo aspecto, ~3x mais rapido (medido: 20s de video em ~11s).
    `[a]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=6:2,scale=${W}:${H},setsar=1[bg]`,
    `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`,
    "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p",
  ].join(";");
}

export interface VideoAdaptado { buffer: Buffer; modoUsado: "cortar" | "preservar"; sonda: SondaDeMidia | null }

/** Gera o MP4 (H.264 + AAC, faststart) no formato pedido a partir do arquivo de origem. */
export interface TrechoDoCorte { inicioS: number; duracaoS: number; focoX?: number; /** 1 = qualidade final; 3 = previa leve (360p). */ reducao?: number }

export async function adaptarVideoArquivo(entrada: string, sondaOrigem: SondaDeMidia, formato: FormatoDeAnuncio, modo: ModoDeAdaptacao = "auto", trecho?: TrechoDoCorte): Promise<VideoAdaptado | { erro: string }> {
  const modoUsado = escolherModo(sondaOrigem, formato, modo);
  const previa = (trecho?.reducao ?? 1) > 1;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chatmedia-out-"));
  const saida = path.join(dir, `saida-${formato}.mp4`);
  try {
    // -ss antes de -i: busca rapida e exata com re-codificacao; -t limita a duracao do trecho aprovado.
    const corte = trecho && trecho.duracaoS > 0 ? ["-ss", Math.max(0, trecho.inicioS).toFixed(2)] : [];
    const duracao = trecho && trecho.duracaoS > 0 ? ["-t", trecho.duracaoS.toFixed(2)] : [];
    const args = ["-v", "error", "-y", ...corte, "-i", entrada, ...duracao, "-filter_complex", filtroDeAdaptacao(formato, modoUsado, trecho?.focoX, trecho?.reducao ?? 1),
      "-c:v", "libx264", ...(previa ? ["-preset", "ultrafast", "-crf", "30", "-maxrate", "900k", "-bufsize", "1800k"] : ["-preset", "veryfast", "-crf", "23", "-maxrate", "8M", "-bufsize", "16M"]), "-r", String(Math.min(30, Math.round(sondaOrigem.fps || 30))),
      ...(sondaOrigem.temAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"]),
      "-movflags", "+faststart", saida];
    // filter_complex precisa de um fluxo de entrada rotulado; o filtro de corte nao tem rotulos, entao usa -vf.
    const usaVf = modoUsado === "cortar";
    if (usaVf) { const i = args.indexOf("-filter_complex"); args[i] = "-vf"; }
    const r = await rodar("ffmpeg", args, { timeoutMs: 240000 });
    if (r.timeout) return { erro: "A adaptação demorou demais e foi interrompida." };
    if (r.code !== 0) return { erro: "Não consegui adaptar esse vídeo (formato de origem não suportado pelo conversor)." };
    const buffer = await fs.readFile(saida);
    return { buffer, modoUsado, sonda: await sondarArquivo(saida) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Especificacoes da Meta ───────────────────────────────────────────────────

/** Mesmos numeros de client/src/components/MetaPlacementValidator.ts (um unico entendimento de especificacao). */
export const ESPECIFICACAO_META: Record<FormatoDeAnuncio, { minLargura: number; minAltura: number; duracaoMinS: number; duracaoMaxS: number; duracaoRecomendadaS?: number; tamanhoMaxMB: number }> = {
  stories: { minLargura: 500, minAltura: 889, duracaoMinS: 1, duracaoMaxS: 60, duracaoRecomendadaS: 15, tamanhoMaxMB: 4000 },
  feed: { minLargura: 600, minAltura: 600, duracaoMinS: 1, duracaoMaxS: 240, tamanhoMaxMB: 4000 },
  square: { minLargura: 600, minAltura: 600, duracaoMinS: 1, duracaoMaxS: 240, tamanhoMaxMB: 4000 },
};

export interface ConferenciaMeta { ok: boolean; problemas: string[]; avisos: string[] }

export function conferirEspecificacaoMeta(sonda: SondaDeMidia, formato: FormatoDeAnuncio, tamanhoBytes: number): ConferenciaMeta {
  const e = ESPECIFICACAO_META[formato];
  const alvo = FORMATOS_DE_ANUNCIO[formato];
  const problemas: string[] = [];
  const avisos: string[] = [];
  const esperada = alvo.largura / alvo.altura;
  if (!sonda.temVideo) problemas.push("O arquivo não tem imagem de vídeo.");
  if (sonda.proporcao > 0 && Math.abs(sonda.proporcao - esperada) / esperada >= 0.01) problemas.push(`Proporção ${sonda.rotuloProporcao}; o formato ${formato} pede ${alvo.rotulo}.`);
  if (sonda.largura < e.minLargura || sonda.altura < e.minAltura) problemas.push(`Resolução ${sonda.largura}x${sonda.altura} abaixo do mínimo ${e.minLargura}x${e.minAltura}.`);
  if (sonda.duracaoS < e.duracaoMinS) problemas.push(`Duração ${sonda.duracaoS}s abaixo do mínimo de ${e.duracaoMinS}s.`);
  if (sonda.duracaoS > e.duracaoMaxS) problemas.push(`Duração ${Math.round(sonda.duracaoS)}s acima do máximo de ${e.duracaoMaxS}s para ${formato}.`);
  if (tamanhoBytes > e.tamanhoMaxMB * 1048576) problemas.push(`Arquivo acima de ${e.tamanhoMaxMB}MB.`);
  if (e.duracaoRecomendadaS && sonda.duracaoS > e.duracaoRecomendadaS && sonda.duracaoS <= e.duracaoMaxS) avisos.push(`Stories são exibidos em trechos de ${e.duracaoRecomendadaS}s; acima disso a Meta divide o vídeo em cartões.`);
  if (sonda.codecVideo && sonda.codecVideo !== "h264") avisos.push(`Codec de vídeo ${sonda.codecVideo}; H.264 é o mais aceito pela Meta.`);
  if (!sonda.temAudio) avisos.push("O vídeo não tem áudio; boa parte do público assiste com som, mas isso não impede a publicação.");
  return { ok: problemas.length === 0, problemas, avisos };
}

export function hashDoArquivo(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Reduz uma foto para no maximo `lado` px (JPEG), para caber na analise visual. Sem ffmpeg, devolve null. */
export async function reduzirImagem(buffer: Buffer, lado = 1024): Promise<Buffer | null> {
  if (!(await ffmpegDisponivel())) return null;
  return comArquivoTemporario(buffer, "img", async (caminho) => {
    const r = await rodar("ffmpeg", ["-v", "error", "-i", caminho, "-frames:v", "1", "-vf", `scale='min(${lado},iw)':'min(${lado},ih)':force_original_aspect_ratio=decrease`, "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { timeoutMs: 20000, maxStdout: 4 * 1024 * 1024 });
    return r.code === 0 && r.stdout.length > 200 ? r.stdout : null;
  });
}

/** Tempo estimado (s) para adaptar um video: ~0,6x a duracao + abertura (medido em 2 nucleos). */
export function estimativaDeAdaptacaoS(duracaoS: number): number {
  return Math.ceil(duracaoS * 0.6 + 3);
}
