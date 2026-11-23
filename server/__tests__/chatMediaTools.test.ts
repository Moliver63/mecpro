process.env.DATABASE_URL ??= "postgres://x";
process.env.JWT_SECRET ??= "x".repeat(24);
process.env.SESSION_SECRET ??= "x".repeat(24);
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { analisarAnexos, adaptarVideoDoChat, _limparCachesDeMidia, type DepsMidia, type DescricaoDeImagem } from "../chatMediaTools";
import { comArquivoTemporario, sondarBuffer, hashDoArquivo, extrairQuadros } from "../chatMedia";
import { transcreverComGroq, urlDeFotoDoNossoCloudinary } from "../chatMediaDeps";
import { budgetChatRequest, COMPACT_CHAT_POLICY } from "../chatRequestBudget";
import { FERRAMENTAS_COM_EFEITO } from "../chatToolLedger";

const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const opcao = temFfmpeg ? {} : { skip: "ffmpeg/ffprobe indisponivel neste ambiente" };
const dir = mkdtempSync(path.join(os.tmpdir(), "chatmediatools-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

function ff(saida: string, args: string[]): Buffer {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args, path.join(dir, saida)]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return readFileSync(path.join(dir, saida));
}
const video169 = () => ff("v169.mp4", ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=4", "-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
const videoMudo = () => ff("mudo.mp4", ["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
const fotoNitida = () => ff("nitida.jpg", ["-f", "lavfi", "-i", "testsrc2=size=1600x1200:rate=1:duration=1", "-frames:v", "1"]);
const fotoPequena = () => ff("pequena.jpg", ["-f", "lavfi", "-i", "color=c=gray:size=320x240:rate=1:duration=1", "-frames:v", "1"]);

const sha8 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 8);

interface Estado {
  sessoes: Map<number, number>; // sessionId -> userId
  fotos: Map<number, Array<{ url: string; fileName: string }>>;
  videos: Map<number, Array<{ url: string; fileName: string; sha?: string }>>;
  arquivos: Map<string, Buffer>;
  enviados: Array<{ nome: string; buffer: Buffer }>;
  registrados: Array<{ userId: number; url: string }>;
  persistidos: Array<{ sessionId: number; url: string; sha: string }>;
  descreveu: Array<Array<{ id: string; jpeg: Buffer }>>;
  falhaUpload: boolean;
  visao: "ok" | "fora";
  fala: "texto" | "indisponivel" | "falhou";
}
function montar(): { deps: DepsMidia & { videoDoUsuario(u: number, url: string): Promise<boolean> }; e: Estado } {
  const e: Estado = { sessoes: new Map(), fotos: new Map(), videos: new Map(), arquivos: new Map(), enviados: [], registrados: [], persistidos: [], descreveu: [], falhaUpload: false, visao: "ok", fala: "indisponivel" };
  const deps = {
    sessaoDoUsuario: async (u: number, s: number) => e.sessoes.get(s) === u,
    fotosDaSessao: async (s: number) => e.fotos.get(s) ?? [],
    videosDaSessao: async (s: number) => e.videos.get(s) ?? [],
    baixarFoto: async (url: string) => e.arquivos.get(url) ?? null,
    baixarVideo: async (url: string) => (e.arquivos.has(url) ? { ok: true as const, buffer: e.arquivos.get(url)!, contentType: "video/mp4" } : { ok: false as const, erro: "Não consegui baixar o vídeo enviado agora." }),
    // Descritor "de verdade" para o teste: descreve o que realmente recebeu (hash dos bytes do quadro), nada pre-roteirizado.
    descreverImagens: async (imgs: Array<{ id: string; jpeg: Buffer }>): Promise<DescricaoDeImagem[] | null> => {
      e.descreveu.push(imgs);
      if (e.visao === "fora") return null;
      return imgs.map((i) => ({ id: i.id, descricao: `imagem ${sha8(i.jpeg)}`, elementos: [`bytes:${i.jpeg.length}`], textoVisivel: "", qualidade: i.jpeg.length > 15000 ? 8 : 3, problemas: [] }));
    },
    transcrever: async () => (e.fala === "texto" ? { texto: "Olá, conheça nosso apartamento de dois quartos." } : e.fala),
    subirVideo: async (buffer: Buffer, nome: string) => { if (e.falhaUpload) return null; e.enviados.push({ nome, buffer }); return `https://res.cloudinary.com/demo/video/upload/mecpro/chat-videos/${sha8(buffer)}.mp4`; },
    registrarVideo: (userId: number, url: string) => { e.registrados.push({ userId, url }); },
    persistirVideo: async (sessionId: number, v: { url: string; fileName: string; sha: string }) => { e.persistidos.push({ sessionId, url: v.url, sha: v.sha }); return true; },
    videoDoUsuario: async (u: number, url: string) => e.registrados.some((r) => r.userId === u && r.url === url) || [...e.sessoes].some(([s, dono]) => dono === u && (e.videos.get(s) ?? []).some((v) => v.url === url)),
  };
  return { deps, e };
}
const U_A = 1, U_B = 2, S_A = 10, S_B = 20;
const URL_V = "https://res.cloudinary.com/demo/video/upload/mecpro/chat-videos/a.mp4";
const URL_F1 = "https://res.cloudinary.com/demo/image/upload/mecpro/f1.jpg";
const URL_F2 = "https://res.cloudinary.com/demo/image/upload/mecpro/f2.jpg";
beforeEach(() => _limparCachesDeMidia());

test("analisar_anexos (foto + video juntos): le o video de verdade e descreve quadros reais", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  const v = video169();
  e.arquivos.set(URL_V, v); e.arquivos.set(URL_F1, fotoNitida());
  e.fotos.set(S_A, [{ url: URL_F1, fileName: "sala.jpg" }]);
  e.videos.set(S_A, [{ url: URL_V, fileName: "tour.mp4" }]);
  e.fala = "texto";
  const r: any = await analisarAnexos(U_A, S_A, { foco: "anúncio imobiliário" }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.publicado, false);
  const vid = r.videos[0];
  assert.equal(vid.analisado, true);
  assert.deepEqual([vid.largura, vid.altura, vid.proporcao, vid.temAudio], [1280, 720, "16:9", true]);
  assert.ok(vid.duracaoS >= 3.8 && vid.duracaoS <= 4.3);
  assert.equal(vid.quadrosAnalisados, 4);
  // Os quadros que chegaram ao descritor sao os mesmos que extraimos independentemente do arquivo.
  const esperados = await comArquivoTemporario(v, "mp4", (c) => extrairQuadros(c, 4, 4));
  const recebidos = e.descreveu.find((l) => l.some((i) => i.id.startsWith("q-")))!;
  assert.deepEqual(recebidos.map((q) => sha8(q.jpeg)), esperados.map((q) => sha8(q.jpeg)), "o modelo viu os quadros reais do arquivo");
  assert.deepEqual(vid.cenas.map((c: any) => c.descricao), esperados.map((q) => `imagem ${sha8(q.jpeg)}`));
  assert.equal(new Set(vid.cenas.map((c: any) => c.descricao)).size, 4, "quadros de instantes diferentes");
  assert.equal(vid.fala.status, "transcrita");
  assert.match(vid.fala.texto, /apartamento/);
  // Foto: dimensoes reais lidas do arquivo e descricao do conteudo real recebido.
  const f = r.fotos[0];
  assert.equal(f.analisada, true);
  assert.deepEqual([f.largura, f.altura, f.proporcao], [1600, 1200, "1.33:1"]);
  assert.equal(r.limitacoes.length, 0);
});

test("analisar_anexos: o que nao da para analisar vem em limitacoes (fala indisponivel, visao fora do ar)", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  e.arquivos.set(URL_V, video169()); e.arquivos.set(URL_F1, fotoNitida());
  e.fotos.set(S_A, [{ url: URL_F1, fileName: "sala.jpg" }]);
  e.videos.set(S_A, [{ url: URL_V, fileName: "tour.mp4" }]);
  e.fala = "indisponivel"; e.visao = "fora";
  const r: any = await analisarAnexos(U_A, S_A, {}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.videos[0].analisado, true, "dados tecnicos continuam");
  assert.deepEqual(r.videos[0].cenas, []);
  assert.equal(r.videos[0].fala.status, "indisponivel");
  assert.equal(r.fotos[0].analisada, false);
  assert.equal(r.fotos[0].descricao, undefined, "nada inventado");
  const todas = r.limitacoes.join(" | ");
  assert.match(todas, /análise de imagens não respondeu/i);
  assert.match(todas, /não sei o que é dito/i);
  assert.match(todas, /descrever as cenas/i);
});

test("analisar_anexos: video sem audio e marcado sem_audio; video que nao baixa nao derruba a resposta", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  e.arquivos.set(URL_V, videoMudo());
  e.videos.set(S_A, [{ url: URL_V, fileName: "mudo.mp4" }, { url: "https://res.cloudinary.com/demo/video/upload/mecpro/chat-videos/sumiu.mp4", fileName: "sumiu.mp4" }]);
  const r: any = await analisarAnexos(U_A, S_A, { alvo: "videos" }, deps);
  assert.equal(r.videos.find((v: any) => v.arquivo === "mudo.mp4").fala.status, "sem_audio");
  const falho = r.videos.find((v: any) => v.arquivo === "sumiu.mp4");
  assert.equal(falho.analisado, false);
  assert.match(falho.motivo, /baixar/);
});

test("analisar_anexos: escolhe a melhor foto pela analise; sem analise cai para resolucao e diz isso", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  const nitida = fotoNitida(), pequena = fotoPequena();
  e.arquivos.set(URL_F1, pequena); e.arquivos.set(URL_F2, nitida);
  e.fotos.set(S_A, [{ url: URL_F1, fileName: "pequena.jpg" }, { url: URL_F2, fileName: "nitida.jpg" }]);
  const r: any = await analisarAnexos(U_A, S_A, { alvo: "fotos" }, deps);
  assert.equal(r.melhorFoto.url, URL_F2);
  assert.match(r.melhorFoto.criterio, /qualidade/);
  _limparCachesDeMidia(); e.visao = "fora";
  const r2: any = await analisarAnexos(U_A, S_A, { alvo: "fotos" }, deps);
  assert.equal(r2.melhorFoto.url, URL_F2, "pela resolucao");
  assert.match(r2.melhorFoto.criterio, /somente resolução/);
});

test("analisar_anexos: nao reanalisa o mesmo anexo (cache) e respeita o foco", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  e.arquivos.set(URL_F1, fotoNitida());
  e.fotos.set(S_A, [{ url: URL_F1, fileName: "a.jpg" }]);
  await analisarAnexos(U_A, S_A, { foco: "loja" }, deps);
  await analisarAnexos(U_A, S_A, { foco: "loja" }, deps);
  assert.equal(e.descreveu.length, 1, "segunda analise saiu do cache");
});

test("isolamento: outro usuario nao enxerga nem analisa anexos de uma conversa que nao e dele", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A); e.sessoes.set(S_B, U_B);
  e.arquivos.set(URL_V, video169()); e.arquivos.set(URL_F1, fotoNitida());
  e.fotos.set(S_A, [{ url: URL_F1, fileName: "a.jpg" }]);
  e.videos.set(S_A, [{ url: URL_V, fileName: "a.mp4" }]);
  // B tenta usar a conversa de A
  const r1: any = await analisarAnexos(U_B, S_A, {}, deps);
  assert.equal(r1.ok, false);
  assert.equal(e.descreveu.length, 0, "nenhum arquivo de A foi aberto");
  // B na propria conversa pede URLs de A
  const r2: any = await analisarAnexos(U_B, S_B, { urls: [URL_F1, URL_V] }, deps);
  assert.equal(r2.ok, false);
  assert.equal(r2.recusadas, 2);
  assert.equal(e.descreveu.length, 0);
  // B sem anexos na propria conversa: nada para analisar (nao herda os de A)
  const r3: any = await analisarAnexos(U_B, S_B, {}, deps);
  assert.equal(r3.ok, false);
  // adaptar: B nao adapta video de A, nem pela conversa de A nem pela dele
  for (const [u, s] of [[U_B, S_A], [U_B, S_B]] as const) {
    const a: any = await adaptarVideoDoChat(u, s, { videoUrl: URL_V, formatos: ["stories"] }, deps);
    assert.equal(a.ok, false); assert.equal(a.nadaFoiAlterado, true);
  }
  assert.equal(e.enviados.length, 0);
  // sem sessao
  assert.equal(((await analisarAnexos(U_A, null, {}, deps)) as any).ok, false);
});

test("adaptar_video: gera 9:16, 4:5 e 1:1 de verdade, confere Meta, guarda para o usuario e nao publica", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  const origem = video169();
  e.arquivos.set(URL_V, origem);
  e.videos.set(S_A, [{ url: URL_V, fileName: "tour imóvel.mp4" }]);
  const r: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, formatos: ["stories", "feed", "square"] }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.publicado, false); assert.equal(r.enviadoAMeta, false); assert.equal(r.campanhaAlterada, false);
  assert.equal(e.enviados.length, 3, "tres arquivos novos subiram");
  const alvo: Record<string, [number, number]> = { stories: [1080, 1920], feed: [1080, 1350], square: [1080, 1080] };
  for (const item of r.adaptados) {
    assert.equal(item.ok, true, JSON.stringify(item));
    const enviado = e.enviados.find((x) => x.nome.includes({ stories: "stories-9x16", feed: "feed-4x5", square: "quadrado-1x1" }[item.formato as string]!))!;
    assert.ok(enviado, "o arquivo enviado corresponde ao formato");
    const s = await sondarBuffer(enviado.buffer, "mp4");
    assert.deepEqual([s?.largura, s?.altura], alvo[item.formato], "o arquivo ENVIADO tem as dimensoes certas");
    assert.equal(s?.temAudio, true);
    assert.deepEqual([item.largura, item.altura], alvo[item.formato]);
    assert.equal(item.especificacaoMeta.ok, true, item.especificacaoMeta.problemas.join("; "));
    assert.ok(item.persistidoNaConversa);
    assert.ok(e.registrados.some((x) => x.userId === U_A && x.url === item.url), "registrado como video deste usuario");
    assert.ok(e.persistidos.some((x) => x.sessionId === S_A && x.url === item.url && x.sha === hashDoArquivo(enviado.buffer)));
    assert.ok(!/[^\w\-.]/.test(item.arquivo), "nome seguro");
  }
  assert.equal(r.adaptados.find((a: any) => a.formato === "stories").modo, "preservar", "16:9 -> 9:16 nao corta a cena");
  // Aviso de Stories: o clipe de 4s nao passa de 15s, entao sem aviso de duracao
  assert.ok(!r.adaptados.find((a: any) => a.formato === "stories").especificacaoMeta.avisos.some((x: string) => /15s/.test(x)));
});

test("adaptar_video: repetir o pedido reaproveita o arquivo (sem upload duplicado)", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  e.arquivos.set(URL_V, videoMudo());
  e.videos.set(S_A, [{ url: URL_V, fileName: "m.mp4" }]);
  const a: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, formatos: ["square"] }, deps);
  const b: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, formatos: ["square"] }, deps);
  assert.equal(a.ok && b.ok, true);
  assert.equal(e.enviados.length, 1);
  assert.equal(b.adaptados[0].reaproveitado, true);
  assert.equal(a.adaptados[0].url, b.adaptados[0].url);
});

test("adaptar_video: falha de upload nao deixa nada registrado nem persistido", opcao, async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  e.arquivos.set(URL_V, videoMudo());
  e.videos.set(S_A, [{ url: URL_V, fileName: "m.mp4" }]);
  e.falhaUpload = true;
  const r: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, formatos: ["stories"] }, deps);
  assert.equal(r.ok, false);
  assert.match(r.adaptados[0].erro, /salvar/);
  assert.equal(e.registrados.length, 0);
  assert.equal(e.persistidos.length, 0);
  // depois que o servico volta, o mesmo pedido funciona (falha nao fica em cache)
  e.falhaUpload = false;
  const ok: any = await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, formatos: ["stories"] }, deps);
  assert.equal(ok.ok, true);
});

test("adaptar_video: entradas invalidas sao recusadas antes de baixar ou processar", async () => {
  const { deps, e } = montar();
  e.sessoes.set(S_A, U_A);
  e.videos.set(S_A, [{ url: URL_V, fileName: "m.mp4" }]);
  let baixou = 0;
  const contando = { ...deps, baixarVideo: async (u: string) => { baixou++; return deps.baixarVideo(u); } };
  assert.equal(((await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V, formatos: ["tv"] }, contando)) as any).ok, false);
  assert.equal(((await adaptarVideoDoChat(U_A, S_A, { videoUrl: URL_V }, contando)) as any).ok, false);
  assert.equal(((await adaptarVideoDoChat(U_A, S_A, { videoUrl: "https://evil.example/x.mp4", formatos: ["feed"] }, contando)) as any).ok, false);
  assert.equal(baixou, 0);
});

test("transcricao: sem chave = indisponivel; com chave envia so o audio e devolve o texto; erro = falhou", async () => {
  const audio = Buffer.alloc(5000, 1);
  assert.equal(await transcreverComGroq(audio, {} as any), "indisponivel");
  let visto: { url?: string; auth?: string; campos?: string[] } = {};
  const ok = await transcreverComGroq(audio, { GROQ_API_KEY: "gsk_teste" } as any, (async (url: any, init: any) => {
    visto = { url: String(url), auth: init.headers.Authorization, campos: [...(init.body as FormData).keys()] };
    return new Response(JSON.stringify({ text: "olá mundo" }), { status: 200 });
  }) as any);
  assert.deepEqual(ok, { texto: "olá mundo" });
  assert.match(visto.url!, /groq\.com\/openai\/v1\/audio\/transcriptions/);
  assert.deepEqual(visto.campos!.sort(), ["file", "model", "response_format", "temperature"]);
  assert.equal(await transcreverComGroq(audio, { GROQ_API_KEY: "k" } as any, (async () => new Response("x", { status: 500 })) as any), "falhou");
  assert.equal(await transcreverComGroq(audio, { GROQ_API_KEY: "k" } as any, (async () => { throw new Error("rede"); }) as any), "falhou");
});

test("foto so vale se for do nosso Cloudinary", () => {
  assert.equal(urlDeFotoDoNossoCloudinary("https://res.cloudinary.com/demo/image/upload/a.jpg", "demo"), true);
  assert.equal(urlDeFotoDoNossoCloudinary("https://res.cloudinary.com/outra/image/upload/a.jpg", "demo"), false);
  assert.equal(urlDeFotoDoNossoCloudinary("http://res.cloudinary.com/demo/a.jpg", "demo"), false);
  assert.equal(urlDeFotoDoNossoCloudinary("https://res.cloudinary.com.evil.io/demo/a.jpg", "demo"), false);
  assert.equal(urlDeFotoDoNossoCloudinary("https://user@res.cloudinary.com/demo/a.jpg", "demo"), false);
  assert.equal(urlDeFotoDoNossoCloudinary("https://res.cloudinary.com/demo/../x.jpg", "demo"), false);
});

test("catalogo: ferramentas de midia existem nos dois formatos, adaptar_video tem efeito (livro) e entra no Groq quando a conversa pede", async () => {
  const { ferramentasGroq } = await import("../chat");
  const nomes = ferramentasGroq.map((t: any) => t.function.name);
  assert.ok(nomes.includes("analisar_anexos") && nomes.includes("adaptar_video"));
  assert.ok(FERRAMENTAS_COM_EFEITO.has("adaptar_video"));
  assert.ok(!FERRAMENTAS_COM_EFEITO.has("analisar_anexos"), "analisar e leitura");
  const sys = [{ role: "system", content: COMPACT_CHAT_POLICY }];
  const a = budgetChatRequest([...sys, { role: "user", content: "analisa as fotos que enviei e escolhe a melhor" }], ferramentasGroq, 5400);
  assert.ok(a.tools.some((t: any) => t.function.name === "analisar_anexos"));
  const b = budgetChatRequest([...sys, { role: "user", content: "adapta esse vídeo para Reels e Feed" }], ferramentasGroq, 5400);
  assert.ok(b.tools.some((t: any) => t.function.name === "adaptar_video"));
  assert.ok(!b.tools.some((t: any) => t.function.name === "publicar_campanha"));
});
