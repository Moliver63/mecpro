/**
 * chatMediaTools.ts — ferramentas do chat para entender e adaptar os anexos da conversa.
 *
 * `analisar_anexos`  (leitura): olha as fotos e os videos GUARDADOS NA CONVERSA DO USUARIO.
 *   Fotos: descricao visual, texto visivel, qualidade, proporcao. Videos: duracao, resolucao,
 *   proporcao, audio, cenas (quadros analisados) e fala (transcricao, quando o ambiente tem).
 *   O que nao puder ser analisado volta em `limitacoes`; nada e inventado.
 *
 * `adaptar_video`    (efeito: gera arquivos novos): converte um video do usuario para 9:16,
 *   4:5 e/ou 1:1 sem distorcer, confere a especificacao da Meta e guarda o resultado na conversa
 *   (so ele pode usar). Nao envia a Meta, nao publica, nao altera campanha.
 *
 * Regras de isolamento: so entram arquivos que estao nas sessoes DO PROPRIO usuario; URL
 * recebida de fora que nao conste ali e recusada.
 */
import {
  adaptarVideoArquivo, comArquivoTemporario, conferirEspecificacaoMeta, estimativaDeAdaptacaoS, extrairAudio, extrairQuadros,
  FORMATOS_DE_ANUNCIO, ffmpegDisponivel, formatosQueJaServem, hashDoArquivo, limitesDeMidia, reduzirImagem, sondarBuffer,
  type ConferenciaMeta, type FormatoDeAnuncio, type LimitesDeMidia, type ModoDeAdaptacao, type SondaDeMidia,
} from "./chatMedia";

export interface DescricaoDeImagem {
  id: string;
  descricao: string;
  elementos: string[];
  textoVisivel: string;
  qualidade: number | null;
  problemas: string[];
}

export interface ImagemParaAnalise { id: string; jpeg: Buffer }

export interface DepsMidia {
  sessaoDoUsuario(userId: number, sessionId: number): Promise<boolean>;
  fotosDaSessao(sessionId: number): Promise<Array<{ url: string; fileName: string }>>;
  videosDaSessao(sessionId: number): Promise<Array<{ url: string; fileName: string; sha?: string }>>;
  baixarFoto(url: string): Promise<Buffer | null>;
  baixarVideo(url: string): Promise<{ ok: true; buffer: Buffer; contentType: string } | { ok: false; erro: string }>;
  /** null = nenhum modelo de visao respondeu. */
  descreverImagens(imagens: ImagemParaAnalise[], foco: string): Promise<DescricaoDeImagem[] | null>;
  /** "indisponivel" quando o ambiente nao tem servico de transcricao configurado. */
  transcrever(audioMp3: Buffer): Promise<{ texto: string } | "indisponivel" | "falhou">;
  subirVideo(buffer: Buffer, nome: string): Promise<string | null>;
  registrarVideo(userId: number, url: string): void;
  persistirVideo(sessionId: number, video: { url: string; fileName: string; sha: string }): Promise<boolean>;
  limites?: LimitesDeMidia;
  agora?: () => number;
}

const MAX_FOTOS_POR_ANALISE = 6;
const MAX_VIDEOS_POR_ANALISE = 2;
const QUADROS_POR_VIDEO = 4;
const ORCAMENTO_DE_ANALISE_MS = 50_000;
const ORCAMENTO_DE_ADAPTACAO_S = 100;
const DURACAO_MAX_DA_ADAPTACAO_S = 240;
const TTL_CACHE_MS = 30 * 60 * 1000;

const cacheAnalise = new Map<string, { em: number; valor: unknown }>();
const cacheAdaptacao = new Map<string, { em: number; valor: unknown }>();
export function _limparCachesDeMidia(): void { cacheAnalise.clear(); cacheAdaptacao.clear(); }
function doCache<T>(c: Map<string, { em: number; valor: unknown }>, k: string, agora: number): T | null {
  const h = c.get(k);
  if (!h) return null;
  if (agora - h.em > TTL_CACHE_MS) { c.delete(k); return null; }
  return h.valor as T;
}
function guardar(c: Map<string, { em: number; valor: unknown }>, k: string, v: unknown, agora: number): void {
  c.set(k, { em: agora, valor: v });
  if (c.size > 200) { const velho = c.keys().next().value; if (velho !== undefined) c.delete(velho); }
}

function foco(args: Record<string, unknown>): string {
  return typeof args.foco === "string" ? args.foco.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200) : "";
}

function formatoDaImagem(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

async function jpegParaAnalise(buffer: Buffer): Promise<Buffer | null> {
  const reduzido = await reduzirImagem(buffer, 1024);
  if (reduzido) return reduzido;
  // Sem ffmpeg: so segue com JPEG pequeno (o servico de visao aceita JPEG direto).
  return formatoDaImagem(buffer) === "jpg" && buffer.length <= 1.5 * 1024 * 1024 ? buffer : null;
}

// ── analisar_anexos ──────────────────────────────────────────────────────────

export async function analisarAnexos(userId: number, sessionId: number | null, args: Record<string, unknown>, deps: DepsMidia): Promise<Record<string, unknown>> {
  const agora = deps.agora ?? Date.now;
  const inicio = agora();
  if (!sessionId || !(await deps.sessaoDoUsuario(userId, sessionId))) {
    return { ok: false, erro: "Não encontrei os anexos desta conversa. Peça ao usuário para anexar as fotos ou vídeos de novo no chat." };
  }
  const alvo = args.alvo === "fotos" || args.alvo === "videos" ? args.alvo : "todos";
  const pedidas = Array.isArray(args.urls) ? new Set(args.urls.filter((u): u is string => typeof u === "string")) : null;
  const [fotosTodas, videosTodos] = await Promise.all([
    alvo === "videos" ? [] : deps.fotosDaSessao(sessionId),
    alvo === "fotos" ? [] : deps.videosDaSessao(sessionId),
  ]);
  if (pedidas && pedidas.size) {
    const guardadas = new Set([...fotosTodas, ...videosTodos].map((a) => a.url));
    const estranhas = [...pedidas].filter((u) => !guardadas.has(u));
    if (estranhas.length) return { ok: false, erro: "Uma ou mais URLs não estão entre os anexos desta conversa. Nada foi analisado.", recusadas: estranhas.length };
  }
  const selecionar = <T extends { url: string }>(l: T[]) => (pedidas && pedidas.size ? l.filter((a) => pedidas.has(a.url)) : l);
  const fotos = selecionar(fotosTodas).slice(-MAX_FOTOS_POR_ANALISE);
  const videos = selecionar(videosTodos).slice(-MAX_VIDEOS_POR_ANALISE);
  if (!fotos.length && !videos.length) return { ok: false, erro: "Não há fotos nem vídeos anexados nesta conversa. Peça ao usuário para anexar." };

  const limitacoes: string[] = [];
  const contexto = foco(args);
  const chaveCache = (u: string) => `${userId}|${contexto}|${u}`;

  // Fotos: uma chamada de visao para todas (assim o modelo as compara e escolhe a melhor).
  const resultadoFotos: Array<Record<string, unknown>> = [];
  if (fotos.length) {
    const prontas: Array<{ id: string; item: { url: string; fileName: string }; buffer: Buffer; jpeg: Buffer | null; sonda: SondaDeMidia | null }> = [];
    for (let i = 0; i < fotos.length; i++) {
      const f = fotos[i];
      const buffer = await deps.baixarFoto(f.url);
      if (!buffer || !formatoDaImagem(buffer)) { resultadoFotos.push({ indice: i + 1, arquivo: f.fileName, url: f.url, analisada: false, motivo: "não consegui abrir o arquivo" }); continue; }
      const sonda = (await ffmpegDisponivel()) ? await sondarBuffer(buffer, "img") : null;
      prontas.push({ id: `foto-${i + 1}`, item: f, buffer, jpeg: await jpegParaAnalise(buffer), sonda });
    }
    const paraVer = prontas.filter((p) => p.jpeg);
    const emCache = paraVer.map((p) => doCache<DescricaoDeImagem>(cacheAnalise, chaveCache(p.item.url), agora()));
    const faltam = paraVer.filter((_, i) => !emCache[i]);
    let novas: DescricaoDeImagem[] | null = [];
    if (faltam.length) {
      novas = await deps.descreverImagens(faltam.map((p) => ({ id: p.id, jpeg: p.jpeg! })), contexto);
      if (novas) for (const d of novas) { const p = faltam.find((x) => x.id === d.id); if (p) guardar(cacheAnalise, chaveCache(p.item.url), d, agora()); }
    }
    if (faltam.length && !novas) limitacoes.push("O serviço de análise de imagens não respondeu agora; as fotos abaixo têm só os dados técnicos (tamanho e proporção), sem descrição do conteúdo.");
    const descricoes = new Map<string, DescricaoDeImagem>();
    paraVer.forEach((p, i) => { const d = emCache[i] ?? novas?.find((x) => x.id === p.id) ?? null; if (d) descricoes.set(p.id, d); });
    for (const p of prontas) {
      const d = descricoes.get(p.id) ?? null;
      resultadoFotos.push({
        indice: Number(p.id.split("-")[1]), arquivo: p.item.fileName, url: p.item.url, analisada: !!d,
        largura: p.sonda?.largura ?? null, altura: p.sonda?.altura ?? null, proporcao: p.sonda?.rotuloProporcao ?? null,
        formatosQueJaServem: p.sonda ? formatosQueJaServem(p.sonda) : [], tamanhoKB: Math.round(p.buffer.length / 1024),
        ...(d ? { descricao: d.descricao, elementos: d.elementos, textoVisivel: d.textoVisivel || null, qualidade: d.qualidade, problemas: d.problemas } : { motivo: p.jpeg ? "sem resposta do modelo de visão" : "arquivo grande demais para analisar neste ambiente" }),
      });
    }
    resultadoFotos.sort((a, b) => Number(a.indice) - Number(b.indice));
  }
  const analisadas = resultadoFotos.filter((f) => f.analisada);
  let melhorFoto: Record<string, unknown> | null = null;
  if (resultadoFotos.length > 1) {
    const pool = analisadas.length ? analisadas : resultadoFotos.filter((f) => f.largura);
    const ordenadas = [...pool].sort((a, b) => (Number(b.qualidade ?? 0) - Number(a.qualidade ?? 0)) || (Number(b.largura ?? 0) * Number(b.altura ?? 0) - Number(a.largura ?? 0) * Number(a.altura ?? 0)));
    const m = ordenadas[0];
    if (m) melhorFoto = { indice: m.indice, arquivo: m.arquivo, url: m.url, criterio: analisadas.length ? "qualidade e adequação vistas na análise visual" : "somente resolução (sem análise visual disponível)" };
  }

  // Videos
  const resultadoVideos: Array<Record<string, unknown>> = [];
  const temFfmpeg = await ffmpegDisponivel();
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const base: Record<string, unknown> = { indice: i + 1, arquivo: v.fileName, url: v.url };
    const guardado = doCache<Record<string, unknown>>(cacheAnalise, chaveCache(v.url), agora());
    if (guardado) { resultadoVideos.push(guardado); continue; }
    if (agora() - inicio > ORCAMENTO_DE_ANALISE_MS) { resultadoVideos.push({ ...base, analisado: false, motivo: "tempo esgotado nesta resposta; peça a análise deste vídeo separadamente" }); continue; }
    if (!temFfmpeg) { resultadoVideos.push({ ...base, analisado: false, motivo: "o servidor não tem processamento de vídeo disponível" }); limitacoes.push("Processamento de vídeo indisponível neste servidor: não é possível ler duração, cenas ou fala."); continue; }
    const baixado = await deps.baixarVideo(v.url);
    if (baixado.ok === false) { resultadoVideos.push({ ...base, analisado: false, motivo: baixado.erro }); continue; }
    const r = await comArquivoTemporario(baixado.buffer, "mp4", async (caminho) => {
      const { sondarArquivo } = await import("./chatMedia");
      const sonda = await sondarArquivo(caminho);
      if (!sonda || !sonda.temVideo) return { ...base, analisado: false, motivo: "não consegui ler o vídeo (arquivo corrompido ou formato inesperado)" };
      const quadros = await extrairQuadros(caminho, sonda.duracaoS, QUADROS_POR_VIDEO);
      let cenas: Array<Record<string, unknown>> = [];
      if (quadros.length) {
        const desc = await deps.descreverImagens(quadros.map((q, k) => ({ id: `q-${k}`, jpeg: q.jpeg })), contexto);
        if (desc) cenas = quadros.map((q, k) => { const d = desc.find((x) => x.id === `q-${k}`); return { tempoS: q.tempoS, descricao: d?.descricao ?? null, textoNaTela: d?.textoVisivel || null, elementos: d?.elementos ?? [] }; }).filter((c) => c.descricao);
      }
      const limVideo: string[] = [];
      if (!cenas.length) limVideo.push("Não consegui descrever as cenas (modelo de visão indisponível); só os dados técnicos estão disponíveis.");
      let fala: Record<string, unknown>;
      if (!sonda.temAudio) fala = { status: "sem_audio" };
      else if (sonda.duracaoS > 600) { fala = { status: "nao_analisada", motivo: "vídeo longo demais para transcrever" }; limVideo.push("Fala não transcrita: vídeo acima de 10 minutos."); }
      else {
        const audio = await extrairAudio(caminho);
        if (!audio) { fala = { status: "nao_analisada", motivo: "não consegui extrair o áudio" }; limVideo.push("Não consegui extrair o áudio para transcrever."); }
        else {
          const t = await deps.transcrever(audio);
          if (t === "indisponivel") { fala = { status: "indisponivel" }; limVideo.push("Transcrição de fala indisponível neste servidor: não sei o que é dito no vídeo."); }
          else if (t === "falhou") { fala = { status: "falhou" }; limVideo.push("A transcrição da fala falhou agora; não sei o que é dito no vídeo."); }
          else fala = { status: t.texto.trim() ? "transcrita" : "sem_fala_detectada", ...(t.texto.trim() ? { texto: t.texto.trim().slice(0, 3000) } : {}) };
        }
      }
      return {
        ...base, analisado: true, duracaoS: sonda.duracaoS, largura: sonda.largura, altura: sonda.altura, proporcao: sonda.rotuloProporcao,
        fps: sonda.fps, temAudio: sonda.temAudio, codec: sonda.codecVideo, formatosQueJaServem: formatosQueJaServem(sonda),
        tamanhoMB: Math.round((baixado.buffer.length / 1048576) * 10) / 10, quadrosAnalisados: cenas.length, cenas, fala,
        ...(limVideo.length ? { limitacoes: limVideo } : {}),
      };
    });
    if (r.analisado) guardar(cacheAnalise, chaveCache(v.url), r, agora());
    resultadoVideos.push(r);
  }
  for (const v of resultadoVideos) if (Array.isArray(v.limitacoes)) for (const l of v.limitacoes as string[]) if (!limitacoes.includes(l)) limitacoes.push(l);
  if (fotosTodas.length > fotos.length) limitacoes.push(`Analisei as ${fotos.length} fotos mais recentes de ${fotosTodas.length}.`);
  if (videosTodos.length > videos.length) limitacoes.push(`Analisei os ${videos.length} vídeos mais recentes de ${videosTodos.length}.`);

  return {
    ok: true, publicado: false, nadaFoiAlterado: true,
    fotos: resultadoFotos, ...(melhorFoto ? { melhorFoto } : {}), videos: resultadoVideos,
    limitacoes,
    instrucao: "Descreva ao usuário só o que consta neste resultado. Se algo está em limitacoes, diga que não pôde ser analisado em vez de supor.",
  };
}

// ── adaptar_video ────────────────────────────────────────────────────────────

const NOME_FORMATO: Record<FormatoDeAnuncio, string> = { stories: "stories-9x16", feed: "feed-4x5", square: "quadrado-1x1" };

export async function adaptarVideoDoChat(userId: number, sessionId: number | null, args: Record<string, unknown>, deps: DepsMidia & { videoDoUsuario(userId: number, url: string): Promise<boolean> }): Promise<Record<string, unknown>> {
  const agora = deps.agora ?? Date.now;
  const limites = deps.limites ?? limitesDeMidia();
  if (!sessionId || !(await deps.sessaoDoUsuario(userId, sessionId))) return { ok: false, erro: "Conversa não encontrada. Peça ao usuário para anexar o vídeo de novo.", nadaFoiAlterado: true };
  const brutos = Array.isArray(args.formatos) ? args.formatos : typeof args.formato === "string" ? [args.formato] : [];
  const formatos = [...new Set(brutos.filter((f): f is FormatoDeAnuncio => f === "stories" || f === "feed" || f === "square"))];
  if (!formatos.length) return { ok: false, erro: "Informe os formatos: stories (9:16, Stories e Reels), feed (4:5) e/ou square (1:1). Pergunte ao usuário se não disse.", nadaFoiAlterado: true };
  const modo: ModoDeAdaptacao = args.modo === "cortar" || args.modo === "preservar" ? args.modo : "auto";
  const videoUrl = args.videoUrl;
  if (typeof videoUrl !== "string" || !(await deps.videoDoUsuario(userId, videoUrl))) {
    return { ok: false, erro: "Esse vídeo não está entre os enviados por este usuário no chat. Peça que anexe o vídeo de novo. Nada foi alterado.", nadaFoiAlterado: true };
  }
  const guardados = await deps.videosDaSessao(sessionId);
  const origem = guardados.find((v) => v.url === videoUrl);
  if (!origem) return { ok: false, erro: "Esse vídeo não está guardado nesta conversa. Peça que anexe de novo. Nada foi alterado.", nadaFoiAlterado: true };
  if (!(await ffmpegDisponivel())) return { ok: false, erro: "O servidor não tem processamento de vídeo disponível agora, então não consigo adaptar o formato. Nada foi alterado.", nadaFoiAlterado: true };

  const baixado = await deps.baixarVideo(videoUrl);
  if (baixado.ok === false) return { ok: false, erro: `${baixado.erro} Nada foi alterado.`, nadaFoiAlterado: true };
  const sha = hashDoArquivo(baixado.buffer);

  return comArquivoTemporario(baixado.buffer, "mp4", async (caminho) => {
    const { sondarArquivo } = await import("./chatMedia");
    const sonda = await sondarArquivo(caminho);
    if (!sonda || !sonda.temVideo) return { ok: false, erro: "Não consegui ler o vídeo; ele pode estar corrompido. Nada foi alterado.", nadaFoiAlterado: true };
    if (sonda.duracaoS > DURACAO_MAX_DA_ADAPTACAO_S) return { ok: false, erro: `Vídeo de ${Math.round(sonda.duracaoS)}s é longo demais para adaptar aqui (limite ${DURACAO_MAX_DA_ADAPTACAO_S}s). Nada foi alterado.`, nadaFoiAlterado: true };

    const gerados: Array<Record<string, unknown>> = [];
    const pendentes: FormatoDeAnuncio[] = [];
    let gasto = 0;
    for (const formato of formatos) {
      const chave = `${userId}|${sha}|${formato}|${modo}`;
      const antigo = doCache<Record<string, unknown>>(cacheAdaptacao, chave, agora());
      if (antigo) { gerados.push({ ...antigo, reaproveitado: true }); continue; }
      const custo = estimativaDeAdaptacaoS(sonda.duracaoS);
      if (gasto > 0 && gasto + custo > ORCAMENTO_DE_ADAPTACAO_S) { pendentes.push(formato); continue; }
      gasto += custo;
      const r = await adaptarVideoArquivo(caminho, sonda, formato, modo);
      if ("erro" in r) { gerados.push({ formato, ok: false, erro: r.erro }); continue; }
      if (r.buffer.length > limites.videoBytes) { gerados.push({ formato, ok: false, erro: `O resultado passou do limite de ${Math.round(limites.videoBytes / 1048576)}MB.` }); continue; }
      const saidaSonda = r.sonda ?? (await sondarBuffer(r.buffer, "mp4"));
      if (!saidaSonda) { gerados.push({ formato, ok: false, erro: "O arquivo gerado não passou na verificação." }); continue; }
      const conferencia: ConferenciaMeta = conferirEspecificacaoMeta(saidaSonda, formato, r.buffer.length);
      const nome = `${(origem.fileName || "video").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[^\w\-]+/g, "-").slice(0, 60)}-${NOME_FORMATO[formato]}.mp4`;
      const url = await deps.subirVideo(r.buffer, nome);
      if (!url) { gerados.push({ formato, ok: false, erro: "Não consegui salvar o vídeo adaptado agora. Tente de novo." }); continue; }
      deps.registrarVideo(userId, url);
      const persistido = await deps.persistirVideo(sessionId, { url, fileName: nome, sha: hashDoArquivo(r.buffer) }).catch(() => false);
      const item = {
        formato, ok: true, url, arquivo: nome, usos: FORMATOS_DE_ANUNCIO[formato].usos, modo: r.modoUsado,
        largura: saidaSonda.largura, altura: saidaSonda.altura, proporcao: saidaSonda.rotuloProporcao, duracaoS: saidaSonda.duracaoS,
        tamanhoMB: Math.round((r.buffer.length / 1048576) * 10) / 10, temAudio: saidaSonda.temAudio, persistidoNaConversa: persistido,
        especificacaoMeta: conferencia,
      };
      guardar(cacheAdaptacao, chave, item, agora());
      gerados.push(item);
    }
    const ok = gerados.some((g) => g.ok);
    return {
      ok, publicado: false, enviadoAMeta: false, campanhaAlterada: false,
      origem: { arquivo: origem.fileName, duracaoS: sonda.duracaoS, proporcao: sonda.rotuloProporcao, largura: sonda.largura, altura: sonda.altura },
      adaptados: gerados, ...(pendentes.length ? { pendentes, aviso: `Para não estourar o tempo desta resposta, ficaram para depois: ${pendentes.join(", ")}. Peça de novo para gerar.` } : {}),
      message: ok
        ? "Vídeos adaptados e guardados nesta conversa. Mostre ao usuário o resultado de cada formato (e qualquer problema em especificacaoMeta) e pergunte qual vai em qual criativo. Para usar em um criativo: anexar_video_criativo com a URL adaptada. Nada foi publicado nem enviado à Meta."
        : "Nenhum formato pôde ser gerado. Explique o erro ao usuário.",
    };
  });
}
