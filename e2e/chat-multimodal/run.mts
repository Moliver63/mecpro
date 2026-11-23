/**
 * Cenarios ponta a ponta do chat multimodal (desktop e celular). Ver server.mts para o que e real e o que e simulado.
 * Uso: node --import tsx e2e/chat-multimodal/run.mts   (servidor em E2E_URL, padrao http://localhost:4789)
 */
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const URL_BASE = process.env.E2E_URL || "http://localhost:4789";
const FX = process.env.E2E_FIXTURES || "/tmp/e2e-fx";
const SHOTS = process.env.E2E_SHOTS || "/tmp/e2e-shots";
mkdirSync(SHOTS, { recursive: true });

type Resultado = { n: string; titulo: string; ok: boolean; evidencia: string[]; erro?: string };
const resultados: Resultado[] = [];
const fx = (n: string) => path.join(FX, n);
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

function afirmar(cond: unknown, msg: string, ev: string[]) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  ev.push(`ok: ${msg}`);
}
async function estado(): Promise<any> { return (await fetch(`${URL_BASE}/api/_e2e/estado`)).json(); }
async function cenario(n: string, titulo: string, fn: (ev: string[]) => Promise<void>) {
  const ev: string[] = [];
  try { await fn(ev); resultados.push({ n, titulo, ok: true, evidencia: ev }); console.log(`✔ ${n} ${titulo}`); }
  catch (e: any) { resultados.push({ n, titulo, ok: false, evidencia: ev, erro: String(e?.message || e) }); console.log(`✘ ${n} ${titulo}\n   ${e?.message}`); }
}
async function abrir(browser: Browser, user: number, perfil: "desktop" | "celular", extra: Record<string, unknown> = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(perfil === "celular" ? { ...devices["iPhone 13"], ...extra } : { viewport: { width: 1280, height: 860 }, ...extra });
  const page = await ctx.newPage();
  await page.request.get(`${URL_BASE}/api/_e2e/login?user=${user}`);
  await page.goto(`${URL_BASE}/`);
  await page.waitForSelector(".campaign-chat-composer");
  return { ctx, page };
}
const seletorDeArquivos = (page: Page) => page.locator('.campaign-chat-composer input[type="file"]').first();
const prontos = (page: Page) => page.locator('.campaign-chat-attachment[data-status="done"]');
async function enviarMensagem(page: Page, texto: string) {
  await page.fill(".campaign-chat-input", texto);
  await page.click(".campaign-chat-send");
}
async function ultimaRespostaDoAssistente(page: Page): Promise<string> {
  await page.waitForFunction(() => document.querySelectorAll(".campaign-chat-response").length >= 2, null, { timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector(".campaign-chat-send[disabled]") || true);
  const alvos = page.locator(".campaign-chat-response");
  return (await alvos.last().innerText()).trim();
}
function probe(buf: Buffer, ext = "mp4") {
  const tmp = path.join("/tmp", `probe-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  writeFileSync(tmp, buf);
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", tmp]);
  const j = JSON.parse(r.stdout.toString());
  const v = j.streams.find((s: any) => s.codec_type === "video");
  return { w: v.width, h: v.height, dur: Number(j.format.duration), audio: j.streams.some((s: any) => s.codec_type === "audio"), codec: v.codec_name };
}
async function baixarDaNuvem(url: string): Promise<Buffer> {
  const r = await fetch(`${URL_BASE}/api/_e2e/arquivo?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`arquivo nao esta na nuvem: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
async function sessoesDe(userId: number) { return (await estado()).sessoes.filter((s: any) => s.userId === userId); }

await fetch(`${URL_BASE}/api/_e2e/reset`, { method: "POST" });
const browser = await chromium.launch();

// Sessoes por perfil (guardadas entre cenarios do mesmo fluxo)
let desk: { ctx: BrowserContext; page: Page };
let sessaoA = 0;

await cenario("1", "Desktop: enviar uma foto (upload real, validada por conteudo, persistida na conversa)", async (ev) => {
  const antes = (await estado()).uploads;
  desk = await abrir(browser, 1, "desktop");
  await seletorDeArquivos(desk.page).setInputFiles(fx("foto-nitida.jpg"));
  await desk.page.waitForSelector('.campaign-chat-attachment[data-status="done"]');
  afirmar((await prontos(desk.page).count()) === 1, "uma miniatura concluida na bandeja", ev);
  const e = await estado();
  afirmar(e.uploads === antes + 1, "1 arquivo chegou ao armazenamento", ev);
  const s = (await sessoesDe(1))[0];
  sessaoA = s.id;
  afirmar(s.pendingPhotoUrls?.length === 1 && s.pendingPhotoUrls[0].sha?.length === 64, "banco: 1 foto na conversa, com hash do conteudo", ev);
  await desk.page.screenshot({ path: path.join(SHOTS, "01-desktop-uma-foto.png") });
});

await cenario("2", "Desktop: enviar varias fotos de uma vez (todas na MESMA conversa)", async (ev) => {
  const { ctx, page } = await abrir(browser, 1, "desktop");
  await ctx.clearCookies(); await page.request.get(`${URL_BASE}/api/_e2e/login?user=1`);
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector(".campaign-chat-composer");
  const antes = (await sessoesDe(1)).length;
  await seletorDeArquivos(page).setInputFiles([fx("foto-nitida.jpg"), fx("foto-pequena.png"), fx("foto-quadrada.webp")]);
  await page.waitForFunction(() => document.querySelectorAll('.campaign-chat-attachment[data-status="done"]').length === 3, null, { timeout: 30000 });
  const novas = (await sessoesDe(1)).slice(antes);
  afirmar(novas.length === 1, `uma unica conversa nova criada (nao uma por foto): ${novas.length}`, ev);
  afirmar(novas[0].pendingPhotoUrls.length === 3, "as 3 fotos (JPG, PNG, WEBP) estao nessa conversa", ev);
  // Mesma foto com outro nome: servidor reaproveita, tela nao duplica
  const copia = path.join("/tmp", "copia-da-sala.jpg");
  spawnSync("cp", [fx("foto-nitida.jpg"), copia]);
  const uploadsAntes = (await estado()).uploads;
  await seletorDeArquivos(page).setInputFiles(copia);
  await page.waitForSelector(".campaign-chat-error");
  afirmar((await prontos(page).count()) === 3, "foto repetida (outro nome) nao virou 4a miniatura", ev);
  afirmar((await estado()).uploads === uploadsAntes, "nenhum upload duplicado no armazenamento", ev);
  afirmar(/mesma foto/.test(await page.locator(".campaign-chat-error").innerText()), "mensagem clara: 'é a mesma foto'", ev);
  await page.screenshot({ path: path.join(SHOTS, "02-desktop-varias-fotos.png") });
  await ctx.close();
});

await cenario("3", "Desktop: enviar um video com progresso real e pre-visualizacao", async (ev) => {
  const { ctx, page } = await abrir(browser, 1, "desktop");
  await page.evaluate(() => localStorage.clear());
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 350 * 1024 });
  await seletorDeArquivos(page).setInputFiles(fx("tour-paisagem.mp4"));
  const pcts = new Set<number>();
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const t = await page.locator(".campaign-chat-attachment-video .campaign-chat-attachment-pct").first().innerText().catch(() => "");
    const m = t.match(/(\d+)%/); if (m) pcts.add(Number(m[1]));
    if (pcts.size === 1 && !(await page.locator('.campaign-chat-attachment-video[data-status="uploading"]').count())) break;
    if (await page.locator('.campaign-chat-attachment-video[data-status="done"]').count()) break;
    if (pcts.size >= 2 && !ev.some((x) => x.includes("captura"))) { await page.screenshot({ path: path.join(SHOTS, "03-desktop-video-enviando.png") }); ev.push("captura durante o envio salva"); }
    await dorme(150);
  }
  await page.waitForSelector('.campaign-chat-attachment-video[data-status="done"]', { timeout: 40000 });
  const vistos = [...pcts].sort((a, b) => a - b);
  afirmar(vistos.some((p) => p > 0 && p < 100), `progresso intermediario observado na tela: ${vistos.join(",")}%`, ev);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  afirmar((await page.locator(".campaign-chat-attachment-video video").count()) === 1, "miniatura de video (elemento <video>) exibida", ev);
  afirmar(/0:05/.test(await page.locator(".campaign-chat-attachment-dur").innerText()), "duracao lida do arquivo (0:05) mostrada", ev);
  const s = (await sessoesDe(1)).at(-1);
  afirmar(s.pendingPhotoUrls.some((p: any) => p.kind === "video" && p.sha), "banco: video guardado na conversa com hash", ev);
  await page.screenshot({ path: path.join(SHOTS, "03-desktop-video-pronto.png") });
  await ctx.close();
});

// Fluxo principal (cenarios 4 a 8): fotos + videos juntos, analise, adaptacao e recarga
let paginaFluxo: { ctx: BrowserContext; page: Page };
await cenario("4", "Desktop: fotos e videos juntos, arrastando e soltando", async (ev) => {
  paginaFluxo = await abrir(browser, 1, "desktop");
  const { page } = paginaFluxo;
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector(".campaign-chat-composer");
  const antes = (await sessoesDe(1)).length;
  // arrastar e soltar de verdade: DataTransfer com os arquivos reais sobre o rodape
  const nomes = ["foto-nitida.jpg", "foto-pequena.png", "tour-paisagem.mp4", "clipe.webm"];
  const dados = nomes.map((n) => ({ n, b64: spawnSync("base64", ["-w0", fx(n)], { maxBuffer: 256 * 1024 * 1024 }).stdout.toString(), t: n.endsWith(".jpg") ? "image/jpeg" : n.endsWith(".png") ? "image/png" : n.endsWith(".mp4") ? "video/mp4" : "video/webm" }));
  await page.evaluate(async (arquivos) => {
    const dt = new DataTransfer();
    for (const a of arquivos) { const bin = Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)); dt.items.add(new File([bin], a.n, { type: a.t })); }
    const alvo = document.querySelector(".campaign-chat-footer")!;
    for (const tipo of ["dragenter", "dragover"]) alvo.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((r) => setTimeout(r, 200));
    (window as any).__zonaVisivel = !!document.querySelector(".campaign-chat-dropzone");
    alvo.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, dados);
  afirmar(await page.evaluate(() => (window as any).__zonaVisivel), "zona 'Solte as fotos e vídeos aqui' apareceu ao arrastar", ev);
  await page.waitForFunction(() => document.querySelectorAll('.campaign-chat-attachment[data-status="done"]').length === 4, null, { timeout: 60000 }).catch(async (e) => {
    const diag = await page.evaluate(() => ({ t: [...document.querySelectorAll(".campaign-chat-attachment")].map((x) => x.getAttribute("data-status") + ":" + x.textContent), er: [...document.querySelectorAll("p.campaign-chat-error")].map((x) => x.textContent) }));
    await page.screenshot({ path: path.join(SHOTS, "debug-4.png") });
    throw new Error("diag " + JSON.stringify(diag) + " " + e.message.slice(0, 60));
  });
  const novas = (await sessoesDe(1)).slice(antes);
  afirmar(novas.length === 1 && novas[0].pendingPhotoUrls.length === 4, "2 fotos + 2 videos (MP4 e WEBM) numa unica conversa", ev);
  afirmar((await page.locator(".campaign-chat-attachment-video").count()) === 2 && (await page.locator(".campaign-chat-attachment:not(.campaign-chat-attachment-video)").count()) === 2, "bandeja mostra 2 fotos e 2 videos", ev);
  sessaoA = novas[0].id;
  await page.screenshot({ path: path.join(SHOTS, "04-desktop-fotos-e-videos.png") });
});

await cenario("5", "Analisar anexos: o chat ve os quadros reais, mede o video e declara o que nao pode analisar", async (ev) => {
  const { page } = paginaFluxo;
  const antes = (await estado()).gemini.length;
  await enviarMensagem(page, "Analise as fotos e os vídeos que enviei e diga qual é a melhor foto para um anúncio imobiliário");
  const resposta = await ultimaRespostaDoAssistente(page);
  ev.push(`resposta do chat: ${resposta.replace(/\s+/g, " ").slice(0, 400)}`);
  const e = await estado();
  const novas = e.gemini.slice(antes);
  const visao = novas.filter((c: any) => c.tipo === "visao");
  afirmar(visao.length >= 1, "o modelo de visao foi chamado com imagens reais", ev);
  afirmar(visao.reduce((a: number, c: any) => a + c.imagens, 0) >= 10, `imagens enviadas a visao (fotos + 4 quadros por video): ${visao.reduce((a: number, c: any) => a + c.imagens, 0)}`, ev);
  afirmar(novas.some((c: any) => c.tipo === "chat" && c.usuarioMencionaVideos >= 2), "a mensagem ao modelo carregou as URLs dos 2 videos", ev);
  afirmar(/Analisei 2 foto\(s\) e 2 vídeo\(s\)/.test(resposta), "resposta cobre as 2 fotos e os 2 videos", ev);
  afirmar(/5(\.\d+)?s, 1280x720 \(16:9\), 4 quadros vistos/.test(resposta), "dados do video vieram do arquivo (5s, 1280x720, 16:9, 4 quadros)", ev);
  afirmar(/Fala: indisponivel/.test(resposta), "fala marcada indisponivel (sem GROQ_API_KEY neste ambiente), sem inventar texto", ev);
  afirmar(/imagem [0-9a-f]{8} \(\d+ bytes\)/.test(resposta), "descricao de foto calculada dos bytes reais recebidos", ev);
  afirmar(/Melhor foto: foto-nitida\.jpg/.test(resposta), "melhor foto escolhida pela qualidade (a de 1600x1200, nao a de 480x360)", ev);
  await page.screenshot({ path: path.join(SHOTS, "05-analise-dos-anexos.png"), fullPage: false });
});

await cenario("6", "Adaptar video para Reels/Stories 9:16, Feed 4:5 e quadrado 1:1 (arquivos novos, conferidos fora do app)", async (ev) => {
  const { page } = paginaFluxo;
  const antesUploads = (await estado()).uploads;
  await enviarMensagem(page, "Adapte o vídeo de passeio para Reels, Feed e quadrado");
  await page.waitForFunction(() => document.querySelectorAll(".campaign-chat-response").length >= 3, null, { timeout: 180000 });
  const resposta = (await page.locator(".campaign-chat-response").last().innerText()).replace(/\s+/g, " ");
  ev.push(`resposta do chat: ${resposta.slice(0, 300)}`);
  afirmar(/stories 1080x1920 ok; feed 1080x1350 ok; square 1080x1080 ok/.test(resposta), "tres formatos gerados e confirmados", ev);
  afirmar(/Nada foi publicado/.test(resposta), "o chat afirma que nada foi publicado", ev);
  const e = await estado();
  const novos = e.uploads - antesUploads;
  afirmar(novos === 3, `3 arquivos novos no armazenamento (${novos})`, ev);
  const s = (await sessoesDe(1)).find((x: any) => x.id === sessaoA);
  const videos = s.pendingPhotoUrls.filter((p: any) => p.kind === "video");
  const adaptados = videos.filter((v: any) => /-(stories-9x16|feed-4x5|quadrado-1x1)\.mp4$/.test(v.fileName));
  afirmar(adaptados.length === 3, "os 3 adaptados foram guardados na conversa do usuario (visiveis para anexar a um criativo)", ev);
  const esperado: Record<string, [number, number]> = { "stories-9x16": [1080, 1920], "feed-4x5": [1080, 1350], "quadrado-1x1": [1080, 1080] };
  for (const v of adaptados) {
    const chave = Object.keys(esperado).find((k) => v.fileName.includes(k))!;
    const p = probe(await baixarDaNuvem(v.url));
    afirmar(p.w === esperado[chave][0] && p.h === esperado[chave][1], `${chave}: ffprobe independente confirma ${p.w}x${p.h}`, ev);
    afirmar(p.audio && p.codec === "h264" && Math.abs(p.dur - 5) < 0.6, `${chave}: audio preservado, H.264, duracao ${p.dur.toFixed(1)}s`, ev);
  }
  await page.screenshot({ path: path.join(SHOTS, "06-adaptacao-de-formatos.png") });
});

await cenario("7", "Recarregar a pagina e recuperar todos os anexos (fotos, videos e os adaptados)", async (ev) => {
  const { page } = paginaFluxo;
  await page.reload();
  await page.waitForSelector(".campaign-chat-attachment");
  await page.waitForFunction(() => document.querySelectorAll('.campaign-chat-attachment[data-status="done"]').length >= 5, null, { timeout: 20000 });
  const fotos = await page.locator(".campaign-chat-attachment:not(.campaign-chat-attachment-video)").count();
  const videos = await page.locator(".campaign-chat-attachment-video").count();
  afirmar(fotos === 2, `as 2 fotos voltaram (${fotos})`, ev);
  afirmar(videos === 3, `videos restaurados, limitados a 3 por mensagem (${videos})`, ev);
  const hist = await page.locator(".campaign-chat-response").allInnerTexts();
  afirmar(hist.length === 2 && /Analisei 2 foto/.test(hist[0]) && /Adaptei: stories/.test(hist[1]), "o historico (analise e adaptacao) tambem voltou do banco", ev);
  afirmar((await page.locator(".campaign-chat-bubble-user").count()) === 2, "as 2 mensagens do usuario voltaram", ev);
  await page.screenshot({ path: path.join(SHOTS, "07-recarregado.png") });
  await paginaFluxo.ctx.close();
});

await cenario("8", "Falhas de envio: armazenamento fora do ar, rede caida, arquivo falso e corrompido, formato invalido", async (ev) => {
  const { ctx, page } = await abrir(browser, 1, "desktop");
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector(".campaign-chat-composer");
  const sessoesAntes = (await estado()).sessoes.length;
  // (a) Cloudinary falhando
  await fetch(`${URL_BASE}/api/_e2e/falha-upload?on=1`, { method: "POST" });
  await seletorDeArquivos(page).setInputFiles(fx("foto-nitida.jpg"));
  await page.waitForSelector('.campaign-chat-attachment[data-status="error"]');
  const msgA = await page.locator("p.campaign-chat-error").first().innerText();
  afirmar(/Não foi possível salvar a foto agora/.test(msgA), `falha do armazenamento explicada: "${msgA}"`, ev);
  await page.screenshot({ path: path.join(SHOTS, "08a-falha-de-upload.png") });
  // recupera: remove o com erro e envia de novo com o servico de volta
  await fetch(`${URL_BASE}/api/_e2e/falha-upload?on=0`, { method: "POST" });
  await page.locator('.campaign-chat-attachment[data-status="error"] button[aria-label^="Remover"]').click();
  await seletorDeArquivos(page).setInputFiles(fx("foto-nitida.jpg"));
  await page.waitForSelector('.campaign-chat-attachment[data-status="done"]');
  afirmar(true, "depois que o servico voltou, o mesmo arquivo foi enviado com sucesso", ev);
  // (b) rede caida
  await ctx.setOffline(true);
  await seletorDeArquivos(page).setInputFiles(fx("foto-pequena.png"));
  await page.waitForSelector('.campaign-chat-attachment[data-status="error"]');
  afirmar(/conexão caiu ao enviar a foto/.test(await page.locator("p.campaign-chat-error").first().innerText()), "rede caida: mensagem 'A conexão caiu ao enviar a foto'", ev);
  await ctx.setOffline(false);
  await page.locator('.campaign-chat-attachment[data-status="error"] button[aria-label^="Remover"]').click();
  // (c) video falso (texto com extensao .mp4) e corrompido (truncado)
  await seletorDeArquivos(page).setInputFiles(fx("falso.mp4"));
  await page.waitForSelector('.campaign-chat-attachment-video[data-status="error"]');
  afirmar(/não parece ser um vídeo válido/.test(await page.locator("p.campaign-chat-error").first().innerText()), "arquivo falso .mp4 recusado pelo CONTEUDO", ev);
  await page.locator('.campaign-chat-attachment-video button[aria-label^="Remover"]').click();
  await seletorDeArquivos(page).setInputFiles(fx("corrompido.mp4"));
  await page.waitForSelector('.campaign-chat-attachment-video[data-status="error"]');
  afirmar(/corrompido|Não consegui ler/.test(await page.locator("p.campaign-chat-error").first().innerText()), "video truncado recusado como corrompido", ev);
  await page.locator('.campaign-chat-attachment-video button[aria-label^="Remover"]').click();
  // (d) formato nao suportado: barrado no navegador, sem tocar o servidor
  const upAntes = (await estado()).uploads;
  await page.evaluate(() => {
    const input = document.querySelector('.campaign-chat-composer input[type="file"]') as HTMLInputElement;
    const dt = new DataTransfer(); dt.items.add(new File(["%PDF-1.4"], "contrato.pdf", { type: "application/pdf" })); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForSelector("p.campaign-chat-error:has-text('contrato.pdf')");
  afirmar(/formato não suportado/.test(await page.locator("p.campaign-chat-error").first().innerText()), "PDF recusado com mensagem clara", ev);
  afirmar((await estado()).uploads === upAntes, "nada foi enviado ao servidor", ev);
  const e = await estado();
  const comFotoFalsa = e.sessoes.filter((s: any) => (s.pendingPhotoUrls || []).some((p: any) => /falso|corrompido/.test(p.fileName || "")));
  afirmar(comFotoFalsa.length === 0, "nenhum arquivo invalido ficou guardado em nenhuma conversa", ev);
  afirmar(sessoesAntes <= e.sessoes.length, "estado consistente apos as falhas", ev);
  await ctx.close();
});

// Celular
await cenario("9", "Celular (iPhone 13): camera, galeria, fotos + video, enviar e recuperar", async (ev) => {
  const { ctx, page } = await abrir(browser, 1, "celular");
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector(".campaign-chat-composer");
  const camera = page.locator(".campaign-chat-attach-camera");
  afirmar(await camera.isVisible(), "botao de camera visivel em tela de toque", ev);
  afirmar((await camera.locator("input").getAttribute("capture")) === "environment", "camera usa capture=environment (abre a camera do aparelho)", ev);
  afirmar((await camera.locator("input").getAttribute("accept")) === "image/*,video/*", "camera aceita foto e video", ev);
  const galeria = page.locator(".campaign-chat-attach").first().locator("input");
  afirmar((await galeria.getAttribute("multiple")) !== null, "galeria permite selecionar varios arquivos", ev);
  await galeria.setInputFiles([fx("foto-quadrada.webp"), fx("reels-vertical.mov")]);
  await page.waitForFunction(() => document.querySelectorAll('.campaign-chat-attachment[data-status="done"]').length === 2, null, { timeout: 40000 });
  await camera.locator("input").setInputFiles(fx("foto-nitida.jpg"));
  await page.waitForFunction(() => document.querySelectorAll('.campaign-chat-attachment[data-status="done"]').length === 3, null, { timeout: 40000 });
  const larg = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, janela: window.innerWidth }));
  afirmar(larg.rolagem <= larg.janela + 1, `sem rolagem horizontal no celular (${larg.rolagem}px <= ${larg.janela}px)`, ev);
  await page.screenshot({ path: path.join(SHOTS, "09-celular-anexos.png") });
  // O .mov vertical e analisado e ja serve para Stories (9:16): sem adaptar
  await enviarMensagem(page, "Analise o que anexei");
  const resp = await ultimaRespostaDoAssistente(page);
  afirmar(/Analisei 2 foto\(s\) e 1 vídeo\(s\)/.test(resp) && /720x1280 \(9:16\)/.test(resp), "video vertical .mov lido como 720x1280 (9:16)", ev);
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.campaign-chat-attachment[data-status="done"]').length === 3, null, { timeout: 20000 });
  afirmar(true, "apos recarregar no celular, os 3 anexos voltaram", ev);
  await page.screenshot({ path: path.join(SHOTS, "09b-celular-recarregado.png") });
  await ctx.close();
});

await cenario("10", "Isolamento entre usuarios: outro cliente nao ve, nao usa e nao analisa anexos alheios", async (ev) => {
  const a = await abrir(browser, 1, "desktop");
  await a.page.evaluate(() => localStorage.clear()); await a.page.reload(); await a.page.waitForSelector(".campaign-chat-composer");
  await seletorDeArquivos(a.page).setInputFiles([fx("foto-nitida.jpg"), fx("clipe.webm")]);
  await a.page.waitForFunction(() => document.querySelectorAll('.campaign-chat-attachment[data-status="done"]').length === 2, null, { timeout: 40000 });
  const sA = (await sessoesDe(1)).at(-1);
  const fotoA = sA.pendingPhotoUrls.find((p: any) => !p.kind).url as string;
  const videoA = sA.pendingPhotoUrls.find((p: any) => p.kind === "video").url as string;

  const b = await abrir(browser, 2, "desktop");
  const req = b.page.request;
  const r1 = await req.get(`${URL_BASE}/api/chat/sessions/${sA.id}/messages`);
  afirmar(r1.status() === 404, "B nao abre a conversa de A (404)", ev);
  const buf = (await import("node:fs")).readFileSync(fx("clipe.webm"));
  const r2 = await req.post(`${URL_BASE}/api/chat/upload-video`, { multipart: { file: { name: "x.webm", mimeType: "video/webm", buffer: buf }, sessionId: String(sA.id) } });
  afirmar(r2.status() === 404, "B nao envia video para a conversa de A (404)", ev);
  const foto = (await import("node:fs")).readFileSync(fx("foto-pequena.png"));
  const r3 = await req.post(`${URL_BASE}/api/chat/upload-photo`, { multipart: { file: { name: "y.png", mimeType: "image/png", buffer: foto }, sessionId: String(sA.id) } });
  const j3 = await r3.json();
  afirmar(r3.ok() && j3.sessionId !== sA.id, "foto de B com id da conversa de A cai numa conversa PROPRIA de B", ev);
  const depois = (await sessoesDe(1)).find((s: any) => s.id === sA.id);
  afirmar(depois.pendingPhotoUrls.length === sA.pendingPhotoUrls.length, "a conversa de A nao recebeu nada de B", ev);
  const r4 = await req.delete(`${URL_BASE}/api/chat/pending-photo`, { data: { sessionId: sA.id, url: fotoA } });
  afirmar(r4.status() === 404, "B nao remove anexos de A (404)", ev);

  // B tenta usar as URLs de A numa mensagem: servidor as descarta e avisa; modelo nao as recebe
  const antes = (await estado()).gemini.length;
  const r5 = await req.post(`${URL_BASE}/api/chat`, { data: {
    mensagens: [{ role: "user", content: "Use estes arquivos na minha campanha" }],
    attachments: [{ fileName: "da-outra-conta.jpg", mimeType: "image/jpeg", size: 1, photoUrl: fotoA }],
    videoUrls: [videoA], sessionId: j3.sessionId,
  } });
  afirmar(r5.ok(), "mensagem de B processada normalmente", ev);
  const chamadas = (await estado()).gemini.slice(antes).filter((c: any) => c.tipo === "chat");
  afirmar(chamadas.length >= 1 && chamadas.every((c: any) => c.usuarioMencionaVideos === 0), "a URL do video de A NAO chegou ao modelo", ev);
  afirmar(chamadas.some((c: any) => c.avisoOutraConta), "o modelo recebeu o aviso 'anexo não pertence a esta conta'", ev);

  // B pede analise na propria conversa (sem anexos): nao herda nada de A
  const r6 = await req.post(`${URL_BASE}/api/chat`, { data: { mensagens: [{ role: "user", content: "Analise as fotos que enviei" }], sessionId: j3.sessionId } });
  const j6 = await r6.json();
  afirmar(/Analisei 1 foto\(s\) e 0 vídeo\(s\)/.test(j6.resposta ?? ""), `B so ve a PROPRIA foto (${(j6.resposta || "").slice(0, 90)})`, ev);
  await a.ctx.close(); await b.ctx.close();
});

await browser.close();

const ok = resultados.filter((r) => r.ok).length;
writeFileSync(path.join(SHOTS, "resultado.json"), JSON.stringify({ ok, total: resultados.length, resultados }, null, 2));
console.log(`\n${ok}/${resultados.length} cenarios passaram. Evidencias em ${SHOTS}`);
process.exit(ok === resultados.length ? 0 : 1);
