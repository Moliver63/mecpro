process.env.DATABASE_URL ??= "postgres://x";
process.env.JWT_SECRET ??= "x".repeat(24);
process.env.SESSION_SECRET ??= "x".repeat(24);
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ajustarParaSilencio, aprovarCortes, _limparPropostas, detectarCortesDeCena, detectarSilencios, escolherJanela, interpretarSilencios,
  montarCenas, propostaAprovadaPara, propostasDaSessao, rejeitarCortes, sugerirCortes, type DepsCortes,
} from "../chatCortes";
import { adaptarVideoDoChat, _limparCachesDeMidia } from "../chatMediaTools";
import { comArquivoTemporario, sondarBuffer } from "../chatMedia";
import { avaliarImagensComCadeia, configsDeVisao, interpretarAvaliacoes, chamarVisaoOpenAI } from "../chatVision";
import { SaudeDosProvedores } from "../chatProviderChain";

const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const opcao = temFfmpeg ? {} : { skip: "ffmpeg/ffprobe indisponivel neste ambiente" };
const dir = mkdtempSync(path.join(os.tmpdir(), "chatcortes-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

/** Video real de 40 s, 4 cenas visualmente distintas de 10 s; audio com silencio de 19 a 21 s. */
function videoDeQuatroCenas(): Buffer {
  const cena = (_i: number, fonte: string) => ["-f", "lavfi", "-t", "10", "-i", fonte];
  const saida = path.join(dir, "quatro.mp4");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y",
    ...cena(0, "color=c=red:size=1280x720:rate=25"), ...cena(1, "testsrc2=size=1280x720:rate=25"), ...cena(2, "mandelbrot=size=1280x720:rate=25"), ...cena(3, "color=c=blue:size=1280x720:rate=25"),
    "-f", "lavfi", "-i", "sine=frequency=440:duration=40",
    "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v];[4:a]volume='if(between(t,19,21),0,1)':eval=frame[a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", saida]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return readFileSync(saida);
}

test("cenas: mede cortes e silencios de verdade num video com 4 cenas", opcao, async () => {
  const buf = videoDeQuatroCenas();
  await comArquivoTemporario(buf, "mp4", async (caminho) => {
    const cortes = await detectarCortesDeCena(caminho);
    for (const esperado of [10, 20, 30]) assert.ok(cortes.some((t) => Math.abs(t - esperado) < 0.6), `corte perto de ${esperado}s em ${cortes.join(",")}`);
    const silencios = await detectarSilencios(caminho, 40);
    assert.ok(silencios.some((s) => s.inicioS > 18 && s.inicioS < 20 && s.fimS > 20 && s.fimS < 22), `silencio de 19 a 21 s em ${JSON.stringify(silencios)}`);
    const cenas = montarCenas(cortes, 40);
    assert.equal(cenas.length, 4, "4 cenas");
  });
});

test("escolherJanela: pega o trecho de maior nota, cabe no alvo e respeita silencio; video curto fica inteiro", () => {
  const cenas = [0, 10, 20, 30].map((i) => ({ inicioS: i, fimS: i + 10 }));
  const notas = [{ nota: 3, focoX: 0.2 }, { nota: 4, focoX: 0.3 }, { nota: 9, focoX: 0.8 }, { nota: 5, focoX: 0.5 }];
  const j = escolherJanela(cenas, notas, [], 40, 10);
  assert.equal(j.inicioS, 20); assert.equal(j.fimS, 30); assert.ok(Math.abs(j.focoX - 0.8) < 1e-9); assert.equal(j.inteiro, false);
  const curto = escolherJanela([{ inicioS: 0, fimS: 8 }], [{ nota: 5, focoX: null }], [], 8, 15);
  assert.equal(curto.inteiro, true); assert.equal(curto.fimS, 8);
  assert.equal(ajustarParaSilencio(19.4, [{ inicioS: 19, fimS: 21 }]), 19.4, "dentro do silencio nao mexe");
  assert.equal(ajustarParaSilencio(21.5, [{ inicioS: 19, fimS: 21 }]), 21, "puxa para o fim do silencio mais proximo");
  assert.equal(ajustarParaSilencio(30, [{ inicioS: 19, fimS: 21 }]), 30, "longe de silencio: mantem");
  assert.deepEqual(interpretarSilencios("silence_start: 1.5\nsilence_end: 3.0 | silence_duration: 1.5\nsilence_start: 9", 12), [{ inicioS: 1.5, fimS: 3 }, { inicioS: 9, fimS: 12 }]);
});

// ── Fluxo completo com arquivos reais ────────────────────────────────────────

const U_A = 1, U_B = 2, S_A = 10;
const URL_V = "https://res.cloudinary.com/demo/video/upload/mecpro/chat-videos/quatro.mp4";

function montar(buf: Buffer, visao: "ok" | "fora" = "ok") {
  const enviados: Array<{ nome: string; buffer: Buffer }> = [];
  const registrados: Array<{ userId: number; url: string }> = [];
  const arquivos = new Map<string, Buffer>([[URL_V, buf]]);
  const chamadasVisao: number[] = [];
  const deps: DepsCortes = {
    sessaoDoUsuario: async (u, s) => u === U_A && s === S_A,
    fotosDaSessao: async () => [],
    videosDaSessao: async (s) => (s === S_A ? [{ url: URL_V, fileName: "tour.mp4" }] : []),
    baixarFoto: async () => null,
    baixarVideo: async (url) => (arquivos.has(url) ? { ok: true as const, buffer: arquivos.get(url)!, contentType: "video/mp4" } : { ok: false as const, erro: "x" }),
    descreverImagens: async () => null,
    transcrever: async () => "indisponivel",
    subirVideo: async (buffer, nome) => { enviados.push({ nome, buffer }); const url = `https://res.cloudinary.com/demo/video/upload/mecpro/${enviados.length}-${nome}`; arquivos.set(url, buffer); return url; },
    registrarVideo: (userId, url) => { registrados.push({ userId, url }); },
    persistirVideo: async () => true,
    videoDoUsuario: async (u, url) => u === U_A && (url === URL_V || registrados.some((r) => r.userId === u && r.url === url)),
    // "Modelo de visao" que descreve o que RECEBEU: a nota depende dos pixels (a cena 2, mandelbrot, e a mais rica em detalhe = maior arquivo JPEG).
    avaliarCenas: async (imgs) => {
      chamadasVisao.push(imgs.length);
      if (visao === "fora") return null;
      const maior = Math.max(...imgs.map((i) => i.jpeg.length));
      return { provedor: "visao:teste", avaliacoes: imgs.map((i) => ({ id: i.id, descricao: `frame ${i.jpeg.length} bytes`, elementos: [], textoVisivel: "", problemas: [], qualidade: 4 + (6 * i.jpeg.length) / maior, gancho: 3 + (7 * i.jpeg.length) / maior, focoX: 0.7 })) };
    },
  };
  return { deps, enviados, registrados, arquivos, chamadasVisao };
}
beforeEach(() => { _limparPropostas(); _limparCachesDeMidia(); });

test("sugerir_cortes: mede, pontua por visao, gera PREVIAS leves e nao processa nada final", opcao, async () => {
  const { deps, enviados, chamadasVisao } = montar(videoDeQuatroCenas());
  const r: any = await sugerirCortes(U_A, S_A, { videoUrl: URL_V }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.status, "proposta"); assert.equal(r.processado, false); assert.equal(r.publicado, false); assert.equal(r.enviadoAMeta, false);
  assert.equal(r.analise.cenas, 4); assert.equal(r.analise.cenasAvaliadas, 4); assert.equal(r.analise.provedorDeVisao, "visao:teste");
  assert.deepEqual(chamadasVisao, [4], "uma chamada de visao com um quadro por cena");
  assert.equal(r.cortes.length, 3);
  const stories = r.cortes.find((c: any) => c.formato === "stories");
  assert.ok(stories.duracaoS <= 15.5 && stories.duracaoS >= 10, `duracao ${stories.duracaoS}`);
  assert.ok(stories.motivo.length > 10);
  // previas: 3 arquivos pequenos e REAIS em 360p
  assert.equal(enviados.length, 3);
  const dims: Record<string, [number, number]> = { stories: [360, 640], feed: [360, 450], square: [360, 360] };
  for (const c of r.cortes) {
    assert.ok(c.previaUrl, `previa de ${c.formato}`);
    const buf = enviados.find((e) => e.nome.includes(`-${c.formato}.mp4`))!.buffer;
    const s = await sondarBuffer(buf, "mp4");
    assert.deepEqual([s!.largura, s!.altura], dims[c.formato], `previa ${c.formato} em ${dims[c.formato]}`);
    assert.ok(Math.abs(s!.duracaoS - c.duracaoS) < 0.6, `previa dura ${s!.duracaoS}s, corte ${c.duracaoS}s`);
    assert.ok(buf.length < (c.duracaoS * 900_000 / 8) * 1.3 + 100_000, `previa leve, limitada a ~900 kbps (${buf.length} bytes em ${c.duracaoS}s)`);
  }
  // Chamar de novo devolve a MESMA proposta, sem novas previas.
  const de_novo: any = await sugerirCortes(U_A, S_A, { videoUrl: URL_V }, deps);
  assert.equal(de_novo.propostaId, r.propostaId); assert.equal(de_novo.reaproveitada, true); assert.equal(enviados.length, 3);
});

test("aprovacao: sem aprovar, adaptar_video recusa; so o dono aprova; depois gera o arquivo final no trecho aprovado", opcao, async () => {
  const { deps, enviados } = montar(videoDeQuatroCenas());
  const r: any = await sugerirCortes(U_A, S_A, { videoUrl: URL_V, formatos: ["stories", "square"] }, deps);
  const previas = enviados.length;
  // 1) modelo tenta processar sem aprovacao
  const antes: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, propostaId: r.propostaId }, deps);
  assert.equal(antes.ok, false); assert.match(antes.erro, /NÃO aprovou/); assert.equal(antes.nadaFoiAlterado, true);
  assert.equal(enviados.length, previas, "nada processado sem aprovacao");
  // 2) outro usuario nao enxerga nem aprova
  assert.equal(aprovarCortes(U_B, r.propostaId).ok, false);
  assert.equal(propostasDaSessao(U_B, S_A).length, 0);
  assert.equal(propostasDaSessao(U_A, S_A).length, 1);
  // 3) dono aprova so o stories
  const ap = aprovarCortes(U_A, r.propostaId, ["stories"]);
  assert.equal(ap.ok, true);
  const corte = r.cortes.find((c: any) => c.formato === "stories");
  const final: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, propostaId: r.propostaId }, deps);
  assert.equal(final.ok, true, JSON.stringify(final));
  assert.equal(final.adaptados.length, 1, "so o formato aprovado");
  const g = final.adaptados[0];
  assert.equal(g.formato, "stories"); assert.equal(g.largura, 1080); assert.equal(g.altura, 1920);
  assert.ok(Math.abs(g.duracaoS - corte.duracaoS) < 0.6, `final dura ${g.duracaoS}s, aprovado ${corte.duracaoS}s`);
  assert.deepEqual(g.corteAprovado, { inicioS: corte.inicioS, fimS: Math.round((corte.inicioS + corte.duracaoS) * 10) / 10 });
  assert.equal(final.publicado, false); assert.equal(final.enviadoAMeta, false);
  assert.equal(enviados.length, previas + 1, "um unico arquivo final alem das previas");
  // 4) o arquivo final e MESMO do trecho aprovado: o brilho medio do quadro em 1 s do final bate com o do original em inicio+1 s
  //    e difere do original em 1 s quando o corte nao comeca na primeira cena.
  const lumaEm = (b: Buffer, t: number) => {
    const f = path.join(dir, `l-${Math.random().toString(36).slice(2)}.mp4`); writeFileSync(f, b);
    const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", f, "-frames:v", "1", "-vf", "scale=1:1,format=gray", "-f", "rawvideo", "-"]);
    return r.stdout[0];
  };
  const original = videoDeQuatroCenas();
  const lFinal = lumaEm(enviados.at(-1)!.buffer, 1), lTrecho = lumaEm(original, corte.inicioS + 1), lInicio = lumaEm(original, 1);
  assert.ok(Math.abs(lFinal - lTrecho) <= 25, `final (${lFinal}) parece o trecho aprovado (${lTrecho})`);
  if (corte.inicioS >= 10) assert.ok(Math.abs(lFinal - lInicio) > 5 || Math.abs(lTrecho - lInicio) <= 5, "nao e a primeira cena por engano");
  // 5) o square nao foi aprovado: continua pendente e nao pode ser processado
  assert.equal(propostaAprovadaPara(U_A, S_A, r.propostaId, URL_V).ok, false, "proposta ja consumida pelo formato aprovado");
});

test("recusa: proposta recusada nunca e processada", opcao, async () => {
  const { deps, enviados } = montar(videoDeQuatroCenas());
  const r: any = await sugerirCortes(U_A, S_A, { videoUrl: URL_V, formatos: ["feed"] }, deps);
  const n = enviados.length;
  assert.equal(rejeitarCortes(U_B, r.propostaId).ok, false);
  assert.equal(rejeitarCortes(U_A, r.propostaId).ok, true);
  const t: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, propostaId: r.propostaId }, deps);
  assert.equal(t.ok, false); assert.match(t.erro, /recusou/);
  assert.equal(enviados.length, n);
  assert.equal(aprovarCortes(U_A, r.propostaId).ok, false, "recusada nao volta a ser aprovada");
});

test("sem modelo de visao: ainda sugere por cenas/silencios, diz a limitacao e preserva o video inteiro", opcao, async () => {
  const { deps } = montar(videoDeQuatroCenas(), "fora");
  const r: any = await sugerirCortes(U_A, S_A, { videoUrl: URL_V, formatos: ["stories"] }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.analise.cenasAvaliadas, 0); assert.equal(r.analise.provedorDeVisao, null);
  assert.ok(r.limitacoes.some((l: string) => /Nenhum modelo de visão respondeu/.test(l)));
  assert.equal(r.cortes[0].modo, "preservar"); assert.equal(r.cortes[0].pontuacao, null);
});

test("isolamento: video de outro usuario ou fora da conversa e recusado sem baixar nada", opcao, async () => {
  const { deps, enviados } = montar(videoDeQuatroCenas());
  const outro: any = await sugerirCortes(U_B, S_A, { videoUrl: URL_V }, deps);
  assert.equal(outro.ok, false); assert.equal(outro.nadaFoiAlterado, true);
  const naoEh: any = await sugerirCortes(U_A, S_A, { videoUrl: "https://res.cloudinary.com/demo/video/upload/mecpro/de-outro.mp4" }, deps);
  assert.equal(naoEh.ok, false);
  assert.equal(enviados.length, 0);
});

// ── Cadeia de visao ──────────────────────────────────────────────────────────

const img = [{ id: "a", jpeg: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]) }, { id: "b", jpeg: Buffer.from([0xff, 0xd8, 0xff, 4, 5, 6]) }];
const JSON_OK = JSON.stringify([{ id: "a", descricao: "sala", elementos: ["sofa"], textoVisivel: "", qualidade: 8, problemas: [], gancho: 7, focoX: 0.4 }, { id: "b", descricao: "cozinha", elementos: [], textoVisivel: "", qualidade: 6, problemas: [], gancho: 5, focoX: 2 }]);

test("visao: interpreta JSON de qualquer provedor (com cerca de codigo, ids invalidos, notas fora da faixa)", () => {
  const l = interpretarAvaliacoes("```json\n" + JSON_OK + "\n```", img);
  assert.equal(l.length, 2); assert.equal(l[1].focoX, 1, "focoX limitado a 0..1");
  assert.deepEqual(interpretarAvaliacoes("nao e json", img), []);
  assert.deepEqual(interpretarAvaliacoes(JSON.stringify([{ id: "zzz", descricao: "x" }]), img), [], "id que nao foi enviado e ignorado");
  assert.equal(interpretarAvaliacoes("Aqui vai:\n" + JSON_OK, img).length, 2, "acha o array no meio do texto");
});

test("visao: configuracao por ambiente (so provedores com chave, ordem configuravel)", () => {
  assert.deepEqual(configsDeVisao({}).map((c) => c.id), []);
  const env = { GEMINI_API_KEY: "g", NVIDIA_API_KEY: "n", GROQ_API_KEY: "q" } as NodeJS.ProcessEnv;
  assert.deepEqual(configsDeVisao(env).map((c) => c.id), ["visao:gemini", "visao:nvidia", "visao:groq"]);
  assert.deepEqual(configsDeVisao({ ...env, CHAT_VISION_PROVIDERS: "groq,gemini" }).map((c) => c.id), ["visao:groq", "visao:gemini"]);
  assert.equal(configsDeVisao(env)[1].baseUrl, "https://integrate.api.nvidia.com/v1");
});

test("visao: fallback automatico Gemini -> NVIDIA -> Groq, com circuito e sem vazar chave", async () => {
  const env = { GEMINI_API_KEY: "g", NVIDIA_API_KEY: "nvapi-SEGREDO", GROQ_API_KEY: "q" } as NodeJS.ProcessEnv;
  const chamadas: string[] = [];
  const doFetch = async (url: string, init?: any) => {
    chamadas.push(url);
    const corpo = JSON.parse(init.body);
    assert.equal(corpo.messages[0].content.filter((c: any) => c.type === "image_url").length, 2, "mesmo pedido com as 2 imagens");
    if (url.includes("nvidia")) return new Response("indisponivel", { status: 503 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON_OK } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  };
  const saude = new SaudeDosProvedores();
  const eventos: string[] = [];
  const r = await avaliarImagensComCadeia(img, "imoveis", true, {
    env, doFetch: doFetch as any, saude,
    chamarGemini: async () => { throw new Error("Gemini 403 key=AIzaSEGREDO"); },
    aoRegistrar: (e) => eventos.push(`${e.provedor}:${e.ok}`),
  });
  assert.ok(r); assert.equal(r!.provedor, "visao:groq"); assert.equal(r!.avaliacoes.length, 2);
  assert.deepEqual(eventos, ["visao:gemini:false", "visao:nvidia:false", "visao:groq:true"]);
  assert.deepEqual(r!.falhas.map((f) => f.id), ["visao:gemini", "visao:nvidia"]);
  assert.ok(chamadas[0].startsWith("https://integrate.api.nvidia.com/v1/chat/completions") && chamadas[1].startsWith("https://api.groq.com/openai/v1/chat/completions"));
  // todos fora do formato = null (a ferramenta diz que nao analisou)
  const nada = await avaliarImagensComCadeia(img, "", false, { env: { GROQ_API_KEY: "q" } as any, doFetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: "desculpe" } }] }), { status: 200 })) as any, saude: new SaudeDosProvedores() });
  assert.equal(nada, null);
  // sem nenhuma chave: null sem chamar rede
  assert.equal(await avaliarImagensComCadeia(img, "", false, { env: {} as any, saude: new SaudeDosProvedores() }), null);
});

test("visao: chamada OpenAI-compativel envia imagem em base64 e le o uso de tokens", async () => {
  const cfg = configsDeVisao({ NVIDIA_API_KEY: "k" } as any)[0];
  let visto: any;
  const r = await chamarVisaoOpenAI(cfg, img, "instr", (async (url: string, init: any) => { visto = { url, auth: init.headers.Authorization, corpo: JSON.parse(init.body) }; return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }), { status: 200 }); }) as any);
  assert.deepEqual(r.tokens, { entrada: 7, saida: 3 });
  assert.equal(visto.auth, "Bearer k"); assert.equal(visto.corpo.model, "nvidia/nemotron-nano-12b-v2-vl");
  assert.match(visto.corpo.messages[0].content[2].image_url.url, /^data:image\/jpeg;base64,/);
});

// ── Binarios de video ────────────────────────────────────────────────────────
import { resolverBinario, _limparBinariosResolvidos } from "../chatMedia";

test("binarios: usa o do sistema, aceita FFMPEG_PATH e cai nos pacotes estaticos quando o sistema nao tem", () => {
  _limparBinariosResolvidos();
  assert.equal(resolverBinario("ffmpeg", { FFMPEG_PATH: "/opt/ff/ffmpeg" } as any), "/opt/ff/ffmpeg");
  assert.equal(resolverBinario("ls"), "ls", "outros comandos passam direto");
  // Simula "sistema sem ffmpeg" com PATH vazio: deve achar o pacote estatico (instalado como dependencia).
  const path0 = process.env.PATH;
  try {
    process.env.PATH = "/nonexistent";
    _limparBinariosResolvidos();
    const f = resolverBinario("ffmpeg"), p = resolverBinario("ffprobe");
    assert.match(f, /ffmpeg-static/); assert.match(p, /ffprobe-static/);
    assert.equal(spawnSync(f, ["-version"]).status, 0); assert.equal(spawnSync(p, ["-version"]).status, 0);
  } finally { process.env.PATH = path0; _limparBinariosResolvidos(); }
});

test("visao: Groq usa modelo com visao atual e manda no maximo 3 imagens por chamada; erro traz o motivo sem a chave", async () => {
  const { avaliarImagensComCadeia, configsDeVisao } = await import("../chatVision");
  const { SaudeDosProvedores } = await import("../chatProviderChain");
  const env = { GROQ_API_KEY: "gsk_segredo", CHAT_VISION_PROVIDERS: "openrouter,groq", OPENROUTER_API_KEY: "or_segredo" } as any;
  const cfgGroq = configsDeVisao(env).find((c) => c.id === "visao:groq")!;
  assert.equal(cfgGroq.modelo, "qwen/qwen3.8-27b");
  assert.equal(cfgGroq.maxImagens, 3);
  const imagens = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, jpeg: Buffer.from([0xff, 0xd8, i]) }));
  const lotes: number[] = [];
  const falhas: string[] = [];
  const doFetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (url.includes("openrouter")) return new Response(JSON.stringify({ error: { message: "No endpoints found matching your data policy (or_segredo)" } }), { status: 404 });
    const ids = body.messages[0].content.filter((c: any) => c.type === "text" && /^Imagem id=/.test(c.text)).map((c: any) => c.text.match(/id=(\w+)/)[1]);
    lotes.push(ids.length);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ids.map((id: string) => ({ id, descricao: "ok", elementos: [], textoVisivel: "", qualidade: 7, problemas: [] }))) } }] }));
  };
  const r = await avaliarImagensComCadeia(imagens as any, "", false, { env, doFetch: doFetch as any, saude: new SaudeDosProvedores(), aoRegistrar: (e) => { if (e.erro) falhas.push(e.erro); } });
  assert.equal(r?.provedor, "visao:groq");
  assert.equal(r?.avaliacoes.length, 5);
  assert.deepEqual(lotes, [3, 2]);
  assert.ok(falhas.some((f) => /data policy/.test(f)), "motivo do OpenRouter registrado");
  assert.ok(falhas.every((f) => !/or_segredo/.test(f)), "chave nao vaza no log");
});
