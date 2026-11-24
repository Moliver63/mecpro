/**
 * chatCortes.ts — sugestao de cortes inteligentes (Reels/Stories, Feed, quadrado) com previa e APROVACAO.
 *
 * Fluxo: o usuario anexa um video -> a ferramenta `sugerir_cortes` mede o video de verdade (cenas por ffmpeg,
 * silencios por ffmpeg, quadros por cena avaliados por um modelo de visao), propoe um trecho por formato e gera
 * uma PREVIA leve (360p) de cada corte. Nada final e processado. O usuario ve as previas e aprova pela tela
 * (POST /api/chat/cortes/:id/aprovar, autenticado) — a aprovacao NAO passa pelo modelo, entao ele nao pode se auto-aprovar.
 * So depois disso `adaptar_video` (com propostaId) gera os arquivos finais, e ainda assim nada vai a Meta.
 *
 * O que decide o corte e deterministico e testavel (escolherJanela). O modelo de visao so da notas por cena
 * (qualidade, gancho, posicao do assunto); sem visao, o corte usa so cenas/silencios e o servidor diz isso.
 */
import crypto from "node:crypto";
import {
  adaptarVideoArquivo, comArquivoTemporario, escolherModo, ESPECIFICACAO_META, ffmpegDisponivel, FORMATOS_DE_ANUNCIO,
  hashDoArquivo, rodar, sondarArquivo, type FormatoDeAnuncio, type SondaDeMidia,
} from "./chatMedia";
import type { DepsMidia, ImagemParaAnalise } from "./chatMediaTools";
import type { AvaliacaoDeCena } from "./chatVision";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Cena { inicioS: number; fimS: number }
export interface Silencio { inicioS: number; fimS: number }

export interface CorteProposto {
  formato: FormatoDeAnuncio;
  inicioS: number; fimS: number; duracaoS: number;
  modo: "cortar" | "preservar";
  /** Posicao horizontal do assunto (0..1) usada quando modo = cortar. */
  focoX: number;
  /** 0..10, media ponderada das cenas dentro da janela. null = sem modelo de visao. */
  pontuacao: number | null;
  motivo: string;
  previaUrl?: string;
  previaErro?: string;
}

export type StatusDaProposta = "proposta" | "aprovada" | "rejeitada" | "processada";

export interface PropostaDeCortes {
  id: string; userId: number; sessionId: number; videoUrl: string; sha: string; criadaEm: number;
  status: StatusDaProposta;
  cortes: CorteProposto[];
  aprovados: FormatoDeAnuncio[];
  analise: { duracaoS: number; cenas: number; cenasAvaliadas: number; provedorDeVisao: string | null; temAudio: boolean; silencios: number };
  limitacoes: string[];
}

// ── Armazenamento (memoria, 2 h) ─────────────────────────────────────────────

const TTL_PROPOSTA_MS = 2 * 60 * 60 * 1000;
const propostas = new Map<string, PropostaDeCortes>();
export function _limparPropostas(): void { propostas.clear(); }

function expurgar(agora: number): void {
  for (const [id, p] of propostas) if (agora - p.criadaEm > TTL_PROPOSTA_MS) propostas.delete(id);
  if (propostas.size > 300) { const velho = propostas.keys().next().value; if (velho !== undefined) propostas.delete(velho); }
}

/** Propostas ainda abertas (aguardando decisao) ou aprovadas e nao processadas, desta conversa e deste usuario. */
export function propostasDaSessao(userId: number, sessionId: number, agora = Date.now()): PropostaDeCortes[] {
  expurgar(agora);
  return [...propostas.values()].filter((p) => p.userId === userId && p.sessionId === sessionId && (p.status === "proposta" || p.status === "aprovada"));
}

export function obterProposta(userId: number, id: string): PropostaDeCortes | null {
  const p = propostas.get(id);
  return p && p.userId === userId ? p : null;
}

export type ResultadoDaDecisao = { ok: true; proposta: PropostaDeCortes } | { ok: false; erro: string };

/** Chamada SOMENTE pelo endpoint autenticado (clique do usuario). Nunca exposta como ferramenta do modelo. */
export function aprovarCortes(userId: number, id: string, formatos?: FormatoDeAnuncio[], agora = Date.now()): ResultadoDaDecisao {
  expurgar(agora);
  const p = obterProposta(userId, id);
  if (!p) return { ok: false, erro: "Proposta não encontrada ou expirada. Peça novas sugestões de corte." };
  if (p.status === "rejeitada") return { ok: false, erro: "Essa proposta foi recusada. Peça novas sugestões." };
  if (p.status === "processada") return { ok: false, erro: "Essa proposta já foi processada." };
  const disponiveis = p.cortes.map((c) => c.formato);
  const escolhidos = (formatos?.length ? formatos : disponiveis).filter((f, i, a) => disponiveis.includes(f) && a.indexOf(f) === i);
  if (!escolhidos.length) return { ok: false, erro: "Nenhum dos formatos escolhidos faz parte da proposta." };
  p.status = "aprovada";
  p.aprovados = escolhidos;
  return { ok: true, proposta: p };
}

export function rejeitarCortes(userId: number, id: string): ResultadoDaDecisao {
  const p = obterProposta(userId, id);
  if (!p) return { ok: false, erro: "Proposta não encontrada ou expirada." };
  if (p.status === "processada") return { ok: false, erro: "Essa proposta já foi processada." };
  p.status = "rejeitada";
  p.aprovados = [];
  return { ok: true, proposta: p };
}

/** Usada por adaptar_video: so devolve proposta APROVADA, do mesmo usuario, conversa e video. */
export function propostaAprovadaPara(userId: number, sessionId: number, id: string, videoUrl: string): { ok: true; proposta: PropostaDeCortes } | { ok: false; erro: string } {
  const p = obterProposta(userId, id);
  if (!p || p.sessionId !== sessionId || p.videoUrl !== videoUrl) return { ok: false, erro: "Proposta de cortes não encontrada para este vídeo. Use sugerir_cortes de novo." };
  if (p.status !== "aprovada") return { ok: false, erro: p.status === "rejeitada" ? "O usuário recusou esta proposta. Não processe; ofereça novas sugestões." : p.status === "processada" ? "Esta proposta já foi processada." : "O usuário ainda NÃO aprovou estes cortes. Mostre as prévias e aguarde a aprovação na tela. Nada foi processado." };
  return { ok: true, proposta: p };
}

export function marcarComoProcessada(id: string, formatosGerados: FormatoDeAnuncio[]): void {
  const p = propostas.get(id);
  if (!p) return;
  p.aprovados = p.aprovados.filter((f) => !formatosGerados.includes(f));
  if (!p.aprovados.length) p.status = "processada";
}

/** Resumo seguro para a tela (sem userId/sha). */
export function resumoDaProposta(p: PropostaDeCortes) {
  return {
    id: p.id, status: p.status, videoUrl: p.videoUrl, analise: p.analise, limitacoes: p.limitacoes,
    cortes: p.cortes.map((c) => ({ formato: c.formato, rotulo: FORMATOS_DE_ANUNCIO[c.formato].rotulo, usos: FORMATOS_DE_ANUNCIO[c.formato].usos, inicioS: c.inicioS, fimS: c.fimS, duracaoS: c.duracaoS, modo: c.modo, pontuacao: c.pontuacao, motivo: c.motivo, previaUrl: c.previaUrl ?? null, previaErro: c.previaErro ?? null })),
  };
}

// ── Medicao real com ffmpeg ──────────────────────────────────────────────────

/** Instantes de troca de cena (ffmpeg `select=gt(scene,limiar)`). */
export async function detectarCortesDeCena(caminho: string, limiar = 0.28): Promise<number[]> {
  const r = await rodar("ffmpeg", ["-v", "info", "-i", caminho, "-an", "-vf", `select='gt(scene,${limiar})',showinfo`, "-f", "null", "-"], { timeoutMs: 120000, maxStdout: 1024 });
  if (r.timeout) return [];
  const tempos: number[] = [];
  for (const m of r.stderr.matchAll(/pts_time:([0-9.]+)/g)) { const t = Number(m[1]); if (Number.isFinite(t)) tempos.push(t); }
  return tempos;
}

export function interpretarSilencios(stderr: string, duracaoS: number): Silencio[] {
  const out: Silencio[] = [];
  let aberto: number | null = null;
  for (const linha of stderr.split(/\r?\n/)) {
    const ini = linha.match(/silence_start:\s*(-?[0-9.]+)/);
    if (ini) { aberto = Math.max(0, Number(ini[1])); continue; }
    const fim = linha.match(/silence_end:\s*([0-9.]+)/);
    if (fim && aberto !== null) { out.push({ inicioS: aberto, fimS: Number(fim[1]) }); aberto = null; }
  }
  if (aberto !== null) out.push({ inicioS: aberto, fimS: duracaoS });
  return out;
}

export async function detectarSilencios(caminho: string, duracaoS: number): Promise<Silencio[]> {
  const r = await rodar("ffmpeg", ["-v", "info", "-i", caminho, "-vn", "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"], { timeoutMs: 120000, maxStdout: 1024 });
  return r.timeout ? [] : interpretarSilencios(r.stderr, duracaoS);
}

export async function extrairQuadroEm(caminho: string, tempoS: number): Promise<Buffer | null> {
  const r = await rodar("ffmpeg", ["-v", "error", "-ss", Math.max(0, tempoS).toFixed(2), "-i", caminho, "-frames:v", "1", "-vf", "scale='min(768,iw)':-2", "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { timeoutMs: 30000, maxStdout: 4 * 1024 * 1024 });
  return r.code === 0 && r.stdout.length > 200 && r.stdout[0] === 0xff && r.stdout[1] === 0xd8 ? r.stdout : null;
}

// ── Cenas e janela (puro, testavel) ──────────────────────────────────────────

/** Une cortes de cena em cenas, juntando as menores que `minS`, e limita a `max` cenas (junta a mais curta com a vizinha). */
export function montarCenas(cortes: number[], duracaoS: number, minS = 1.2, max = 10): Cena[] {
  const pontos = [0, ...[...new Set(cortes.map((t) => Math.round(t * 100) / 100))].filter((t) => t > 0 && t < duracaoS).sort((a, b) => a - b), duracaoS];
  let cenas: Cena[] = [];
  for (let i = 0; i < pontos.length - 1; i++) cenas.push({ inicioS: pontos[i], fimS: pontos[i + 1] });
  const juntar = (i: number) => { // junta a cena i com a vizinha mais curta
    const viz = i === 0 ? 1 : i === cenas.length - 1 ? i - 1 : (cenas[i - 1].fimS - cenas[i - 1].inicioS) <= (cenas[i + 1].fimS - cenas[i + 1].inicioS) ? i - 1 : i + 1;
    const [a, b] = viz < i ? [viz, i] : [i, viz];
    cenas.splice(a, 2, { inicioS: cenas[a].inicioS, fimS: cenas[b].fimS });
  };
  for (;;) {
    if (cenas.length <= 1) break;
    const dur = cenas.map((c) => c.fimS - c.inicioS);
    const menor = dur.indexOf(Math.min(...dur));
    if (dur[menor] < minS || cenas.length > max) juntar(menor); else break;
  }
  return cenas.length ? cenas : [{ inicioS: 0, fimS: duracaoS }];
}

/** Aproxima `t` do limite de silencio mais proximo (ate `tolS`), para nao cortar no meio da fala. Sem silencios, devolve t. */
export function ajustarParaSilencio(t: number, silencios: Silencio[], tolS = 1.2): number {
  if (!silencios.length || silencios.some((s) => t >= s.inicioS && t <= s.fimS)) return t;
  let melhor = t, menor = tolS + 1e-9;
  for (const s of silencios) for (const p of [s.inicioS, s.fimS]) { const d = Math.abs(p - t); if (d < menor) { menor = d; melhor = p; } }
  return melhor;
}

/** Duracao-alvo por formato. Heuristica de produto (Reels/Stories curtos; Feed um pouco mais), nao regra da Meta. */
export const ALVO_DE_DURACAO_S: Record<FormatoDeAnuncio, number> = { stories: 15, feed: 20, square: 15 };

export interface PontuacaoDaCena { nota: number | null; focoX: number | null }

export interface Janela { inicioS: number; fimS: number; pontuacao: number | null; focoX: number; inteiro: boolean }

/**
 * Escolhe o trecho de `alvoS` com a maior nota media, comecando em fronteira de cena (gancho forte na abertura vale mais)
 * e ajustando as pontas ao silencio mais proximo. Se o video ja cabe no alvo (ate 15% acima), devolve o video inteiro.
 */
export function escolherJanela(cenas: Cena[], notas: PontuacaoDaCena[], silencios: Silencio[], duracaoS: number, alvoS: number, gancho: Array<number | null> = []): Janela {
  const focoMedio = (ini: number, fim: number): number => {
    let soma = 0, peso = 0;
    cenas.forEach((c, i) => { const o = Math.min(fim, c.fimS) - Math.max(ini, c.inicioS); const f = notas[i]?.focoX; if (o > 0 && f != null) { soma += f * o; peso += o; } });
    return peso ? soma / peso : 0.5;
  };
  const media = (ini: number, fim: number): number | null => {
    let soma = 0, peso = 0;
    cenas.forEach((c, i) => { const o = Math.min(fim, c.fimS) - Math.max(ini, c.inicioS); const n = notas[i]?.nota; if (o > 0 && n != null) { soma += n * o; peso += o; } });
    return peso ? soma / peso : null;
  };
  if (duracaoS <= alvoS * 1.15) return { inicioS: 0, fimS: duracaoS, pontuacao: media(0, duracaoS), focoX: focoMedio(0, duracaoS), inteiro: true };
  let melhor: Janela | null = null, melhorValor = -Infinity;
  for (let i = 0; i < cenas.length; i++) {
    let ini = cenas[i].inicioS;
    if (ini + alvoS > duracaoS) ini = Math.max(0, duracaoS - alvoS); // ultima janela encosta no fim
    let fim = Math.min(duracaoS, ini + alvoS);
    const ini2 = ajustarParaSilencio(ini, silencios), fim2 = ajustarParaSilencio(fim, silencios);
    if (fim2 - ini2 >= alvoS * 0.7 && fim2 - ini2 <= alvoS * 1.3) { ini = ini2; fim = fim2; }
    const m = media(ini, fim);
    const g = gancho[i] ?? null;
    const valor = (m ?? 5) + (g != null ? g * 0.15 : 0); // abertura que prende pesa um pouco mais
    if (valor > melhorValor + 1e-9) { melhorValor = valor; melhor = { inicioS: ini, fimS: fim, pontuacao: m, focoX: focoMedio(ini, fim), inteiro: false }; }
  }
  return melhor ?? { inicioS: 0, fimS: Math.min(duracaoS, alvoS), pontuacao: null, focoX: 0.5, inteiro: false };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// ── sugerir_cortes ───────────────────────────────────────────────────────────

export interface DepsCortes extends DepsMidia {
  videoDoUsuario(userId: number, url: string): Promise<boolean>;
  /** Visao com cadeia de provedores. null = nenhum provedor respondeu. */
  avaliarCenas?(imagens: ImagemParaAnalise[], foco: string): Promise<{ avaliacoes: AvaliacaoDeCena[]; provedor: string } | null>;
}

const DURACAO_MAX_S = 240;
const TODOS: FormatoDeAnuncio[] = ["stories", "feed", "square"];

export async function sugerirCortes(userId: number, sessionId: number | null, args: Record<string, unknown>, deps: DepsCortes): Promise<Record<string, unknown>> {
  const agora = (deps.agora ?? Date.now)();
  expurgar(agora);
  if (!sessionId || !(await deps.sessaoDoUsuario(userId, sessionId))) return { ok: false, erro: "Conversa não encontrada. Peça ao usuário para anexar o vídeo de novo.", nadaFoiAlterado: true };
  const videoUrl = args.videoUrl;
  if (typeof videoUrl !== "string" || !(await deps.videoDoUsuario(userId, videoUrl))) return { ok: false, erro: "Esse vídeo não está entre os enviados por este usuário no chat. Nada foi alterado.", nadaFoiAlterado: true };
  const origem = (await deps.videosDaSessao(sessionId)).find((v) => v.url === videoUrl);
  if (!origem) return { ok: false, erro: "Esse vídeo não está guardado nesta conversa. Peça que anexe de novo.", nadaFoiAlterado: true };
  const brutos = Array.isArray(args.formatos) ? args.formatos : typeof args.formato === "string" ? [args.formato] : TODOS;
  const formatos = [...new Set(brutos.filter((f): f is FormatoDeAnuncio => f === "stories" || f === "feed" || f === "square"))];
  const usar = formatos.length ? formatos : TODOS;
  if (!(await ffmpegDisponivel())) return { ok: false, erro: "O servidor não tem processamento de vídeo disponível agora, então não consigo medir cenas nem gerar prévias. Nada foi alterado.", nadaFoiAlterado: true };
  const baixado = await deps.baixarVideo(videoUrl);
  if (baixado.ok === false) return { ok: false, erro: `${baixado.erro} Nada foi alterado.`, nadaFoiAlterado: true };
  const sha = hashDoArquivo(baixado.buffer);

  // Mesma proposta aberta para o mesmo video e formatos: devolve a existente (idempotente, sem novas previas).
  const existente = [...propostas.values()].find((p) => p.userId === userId && p.sessionId === sessionId && p.sha === sha && (p.status === "proposta" || p.status === "aprovada") && usar.every((f) => p.cortes.some((c) => c.formato === f)));
  if (existente) return respostaDaProposta(existente, true);

  const foco = typeof args.foco === "string" ? args.foco.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200) : "";
  return comArquivoTemporario(baixado.buffer, "mp4", async (caminho) => {
    const sonda = await sondarArquivo(caminho);
    if (!sonda || !sonda.temVideo) return { ok: false, erro: "Não consegui ler o vídeo; ele pode estar corrompido. Nada foi alterado.", nadaFoiAlterado: true };
    if (sonda.duracaoS > DURACAO_MAX_S) return { ok: false, erro: `Vídeo de ${Math.round(sonda.duracaoS)}s é longo demais para sugerir cortes aqui (limite ${DURACAO_MAX_S}s). Nada foi alterado.`, nadaFoiAlterado: true };
    const limitacoes: string[] = [];

    const [cortesDeCena, silencios] = await Promise.all([detectarCortesDeCena(caminho), sonda.temAudio ? detectarSilencios(caminho, sonda.duracaoS) : Promise.resolve([] as Silencio[])]);
    const cenas = montarCenas(cortesDeCena, sonda.duracaoS);
    if (!sonda.temAudio) limitacoes.push("O vídeo não tem áudio: os cortes não consideram fala.");
    else limitacoes.push("Os cortes evitam interromper a fala (pelos silêncios), mas não usam o conteúdo falado para escolher o trecho.");

    // Quadros: um por cena (no meio), avaliados por visao.
    const imagens: ImagemParaAnalise[] = [];
    for (let i = 0; i < cenas.length; i++) {
      const t = (cenas[i].inicioS + cenas[i].fimS) / 2;
      const jpeg = await extrairQuadroEm(caminho, t);
      if (jpeg) imagens.push({ id: `cena${i}`, jpeg });
    }
    let provedorDeVisao: string | null = null;
    const notas: PontuacaoDaCena[] = cenas.map(() => ({ nota: null, focoX: null }));
    const gancho: Array<number | null> = cenas.map(() => null);
    let avaliadas = 0;
    if (deps.avaliarCenas && imagens.length) {
      const av = await deps.avaliarCenas(imagens, foco || "anúncio no Meta Ads").catch(() => null);
      if (av) {
        provedorDeVisao = av.provedor;
        for (const a of av.avaliacoes) {
          const i = Number(a.id.replace("cena", ""));
          if (!Number.isInteger(i) || !notas[i]) continue;
          notas[i] = { nota: a.qualidade != null && a.gancho != null ? a.qualidade * 0.6 + a.gancho * 0.4 : a.qualidade ?? a.gancho, focoX: a.focoX };
          gancho[i] = a.gancho; avaliadas++;
        }
      }
    }
    if (!avaliadas) limitacoes.push("Nenhum modelo de visão respondeu: os cortes foram escolhidos só por cenas e silêncios (sem avaliar qualidade nem posição do assunto), e o enquadramento preserva o vídeo inteiro.");
    else if (avaliadas < cenas.length) limitacoes.push(`Só ${avaliadas} de ${cenas.length} cenas foram avaliadas pelo modelo de visão.`);

    const cortes: CorteProposto[] = [];
    for (const formato of usar) {
      const alvo = Math.min(ALVO_DE_DURACAO_S[formato], ESPECIFICACAO_META[formato].duracaoMaxS);
      const j = escolherJanela(cenas, notas, silencios, sonda.duracaoS, alvo, gancho);
      // Corta no assunto so quando a visao disse onde ele esta e o assunto fica concentrado; senao preserva tudo.
      const focos = notas.map((n) => n.focoX).filter((x): x is number => x != null);
      const concentrado = focos.length >= 2 ? Math.max(...focos) - Math.min(...focos) <= 0.25 : focos.length === 1;
      const modoBase = escolherModo(sonda, formato, "auto");
      const modo: "cortar" | "preservar" = modoBase === "cortar" || (avaliadas > 0 && concentrado && sonda.proporcao > FORMATOS_DE_ANUNCIO[formato].largura / FORMATOS_DE_ANUNCIO[formato].altura) ? "cortar" : "preservar";
      const duracao = r1(j.fimS - j.inicioS);
      const partes: string[] = [];
      partes.push(j.inteiro ? `o vídeo inteiro (${duracao}s) já cabe no tamanho ideal` : `trecho de ${duracao}s de ${r1(j.inicioS)}s a ${r1(j.fimS)}s`);
      if (j.pontuacao != null) partes.push(`nota média ${r1(j.pontuacao)}/10`);
      if (modo === "cortar") partes.push(sonda.proporcao > FORMATOS_DE_ANUNCIO[formato].largura / FORMATOS_DE_ANUNCIO[formato].altura ? `enquadrado no assunto (${Math.round(j.focoX * 100)}% da largura)` : "enquadramento central");
      else partes.push("vídeo inteiro visível sobre fundo desfocado, sem cortar nada");
      cortes.push({ formato, inicioS: r1(j.inicioS), fimS: r1(j.fimS), duracaoS: duracao, modo, focoX: Math.round(j.focoX * 1000) / 1000, pontuacao: j.pontuacao != null ? r1(j.pontuacao) : null, motivo: partes.join("; ") });
    }

    // Previas leves (360p). Falha numa previa nao derruba a proposta: o corte so fica sem previa e o usuario e avisado.
    const idBase = `${userId}|${sha}`;
    for (const c of cortes) {
      const r = await adaptarVideoArquivo(caminho, sonda, c.formato, c.modo, { inicioS: c.inicioS, duracaoS: c.duracaoS, focoX: c.focoX, reducao: 3 });
      if ("erro" in r) { c.previaErro = r.erro; continue; }
      const url = await deps.subirVideo(r.buffer, `previa-${hashDoArquivo(Buffer.from(`${idBase}|${c.formato}|${c.inicioS}`)).slice(0, 10)}-${c.formato}.mp4`).catch(() => null);
      if (url) { deps.registrarVideo(userId, url); c.previaUrl = url; } else c.previaErro = "Não consegui salvar a prévia agora.";
    }
    if (cortes.every((c) => !c.previaUrl)) limitacoes.push("Não foi possível gerar prévias em vídeo; os trechos sugeridos estão descritos por tempo.");

    const proposta: PropostaDeCortes = {
      id: crypto.randomBytes(6).toString("hex"), userId, sessionId, videoUrl, sha, criadaEm: agora, status: "proposta", cortes, aprovados: [],
      analise: { duracaoS: r1(sonda.duracaoS), cenas: cenas.length, cenasAvaliadas: avaliadas, provedorDeVisao, temAudio: sonda.temAudio, silencios: silencios.length },
      limitacoes,
    };
    propostas.set(proposta.id, proposta);
    return respostaDaProposta(proposta, false);
  });
}

function respostaDaProposta(p: PropostaDeCortes, reaproveitada: boolean): Record<string, unknown> {
  return {
    ok: true, propostaId: p.id, reaproveitada, processado: false, publicado: false, enviadoAMeta: false,
    ...resumoDaProposta(p),
    instrucao: "Apresente ao usuário, formato por formato, o trecho sugerido (início, fim, duração) e o motivo, e diga que as prévias leves estão na tela com os botões Aprovar e Recusar. NÃO processe nada ainda: o arquivo final só é gerado depois que o usuário aprovar na tela. Quando ele aprovar, chame adaptar_video com este propostaId e a videoUrl. Informe as limitações.",
  };
}

/** Usado por adaptar_video: converte um corte aprovado nos argumentos do processamento final. */
export function trechoDoCorte(c: CorteProposto) { return { inicioS: c.inicioS, duracaoS: c.duracaoS, focoX: c.focoX, modo: c.modo as "cortar" | "preservar" }; }
export type { SondaDeMidia };
