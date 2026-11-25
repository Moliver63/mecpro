/**
 * Auditoria TikTok Ads (25/11): video, URL de destino, objetivos com Pixel, validacao previa,
 * erros originais, consulta e o caso real Shadia Hasan Black Friday (#828).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizarUrlDeDestino, mesmaPagina, paginaResponde } from "../tiktokUrl";
import { configDoObjetivo, interpretarPixels, normalizarObjetivo, validarPixel } from "../tiktokObjetivos";
import { planejarVideo, urlCloudinaryAdaptada, urlCapaDoVideo, prepararVideo, proporcaoAlvo, nomeNoTikTok, sondarVideoRemoto, filtroFfmpeg, aguardarUrlPronta, type SondaRemota } from "../tiktokVideo";
import { limparTextoDoAnuncio, validarPublicacaoTikTok, type DepsValidacao } from "../tiktokValidacao";
import { criarClienteTikTok, ErroTikTok, publicarCampanhaTikTok, type ClienteTikTok } from "../tiktokPublicar";
import { consultarCampanhaTikTok, resumoDaSituacao } from "../tiktokConsulta";
import { validarVideoEmArquivo } from "../chatMedia";

const sonda = (o: Partial<SondaRemota> = {}): SondaRemota => ({
  temVideo: true, duracaoS: 30, largura: 1080, altura: 1920, fps: 30, temAudio: true, codecVideo: "h264", codecAudio: "aac",
  proporcao: 1080 / 1920, rotuloProporcao: "9:16", bytes: 30e6, bitrate: 6e6, ...o,
});

// ── URL de destino ───────────────────────────────────────────────────────────

test("URL: https, UTMs acrescentadas sem apagar parametros do cliente nem UTM existente", () => {
  const r = normalizarUrlDeDestino("shadiahasan.com/cursos?cupom=BF&utm_source=instagram");
  const u = new URL(r.url);
  assert.equal(u.protocol, "https:");
  assert.equal(u.searchParams.get("cupom"), "BF", "parametro do cliente preservado");
  assert.equal(u.searchParams.get("utm_source"), "instagram", "UTM do cliente nao e sobrescrita");
  assert.equal(u.searchParams.get("utm_campaign"), "__CAMPAIGN_NAME__");
  assert.equal(u.searchParams.get("utm_content"), "__CID_NAME__");
  assert.ok(r.correcoes.some((c) => /https/.test(c)));
  assert.equal(normalizarUrlDeDestino("http://a.com").url.startsWith("https://a.com"), true);
  assert.ok(normalizarUrlDeDestino("http://localhost:3000").problemas.length > 0);
  assert.ok(normalizarUrlDeDestino("").problemas.length > 0);
});

test("URL: mesma pagina ignora UTMs e barra final", () => {
  assert.ok(mesmaPagina("https://a.com/cursos/?utm_source=x", "https://A.com/cursos"));
  assert.equal(mesmaPagina("https://a.com/cursos", "https://a.com/outra"), false);
});

test("URL: pagina responde (HEAD, cai no GET quando HEAD e recusado), nunca lanca", async () => {
  const chamadas: string[] = [];
  const f = (async (_u: string, init: any) => { chamadas.push(init.method); return new Response(null, { status: init.method === "HEAD" ? 405 : 200 }); }) as any;
  const publico = async () => true;
  assert.deepEqual(await paginaResponde("https://a.com", f, publico), { ok: true, status: 200 });
  assert.deepEqual(chamadas, ["HEAD", "GET"]);
  const fora = (async () => { throw new Error("ECONNREFUSED"); }) as any;
  assert.equal((await paginaResponde("https://a.com", fora, publico)).ok, false);
});

// ── Objetivos e Pixel ────────────────────────────────────────────────────────

test("objetivos: vendas = WEB_CONVERSIONS/CONVERT/OCPM com compra; leads = FORM; trafego e alcance sem Pixel", () => {
  assert.deepEqual(
    [configDoObjetivo("sales").objectiveType, configDoObjetivo("sales").optimizationGoal, configDoObjetivo("sales").billingEvent, configDoObjetivo("sales").optimizationEvent],
    ["WEB_CONVERSIONS", "CONVERT", "OCPM", "SHOPPING"]);
  assert.equal(configDoObjetivo("leads").optimizationEvent, "FORM");
  assert.equal(configDoObjetivo("traffic").precisaPixel, false);
  assert.deepEqual([configDoObjetivo("awareness").objectiveType, configDoObjetivo("awareness").billingEvent], ["REACH", "CPM"]);
  assert.equal(normalizarObjetivo("OUTCOME_SALES"), "sales");
  assert.equal(normalizarObjetivo("branding"), "awareness");
  assert.equal(normalizarObjetivo("engagement"), null, "sem equivalente: nao inventa");
});

const clientePixel = (pixels: any[] | Error): ClienteTikTok => ({
  get: async () => { if (pixels instanceof Error) throw pixels; return { pixels }; },
  post: async () => ({}),
} as any);

test("Pixel: com Purchase/CompletePayment confirma; sem o evento, bloqueia com o motivo", async () => {
  const ok = await validarPixel(clientePixel([{ pixel_id: "P1", pixel_name: "Site", activity_status: "ACTIVE", events: [{ name: "Purchase" }] }]), "1", "SHOPPING");
  assert.equal(ok.ok, true);
  const sem = await validarPixel(clientePixel([{ pixel_id: "P1", pixel_name: "Site", events: [{ event_type: "ON_WEB_DETAIL" }] }]), "1", "SHOPPING");
  assert.equal(sem.ok, false);
  assert.match(sem.bloqueio!, /nao tem o evento "Compra/);
  const nenhum = await validarPixel(clientePixel([]), "1", "SHOPPING");
  assert.match(nenhum.bloqueio!, /nao tem Pixel/);
  const errado = await validarPixel(clientePixel([{ pixel_id: "P1", pixel_name: "Site", events: [] }]), "1", "SHOPPING", "P9");
  assert.match(errado.bloqueio!, /P9 nao esta nesta conta/);
  const semEventos = await validarPixel(clientePixel([{ pixel_id: "P1", pixel_name: "Site", events: [] }]), "1", "SHOPPING");
  assert.equal(semEventos.ok, true, "API sem lista de eventos: nao bloqueia, avisa");
  assert.ok(semEventos.avisos.some((a) => /Nao consegui confirmar/.test(a)));
});

test("Pixel: le o formato da API de forma tolerante (pixels/list, status inativo)", () => {
  const ps = interpretarPixels({ list: [{ pixel_id: 7, pixel_code: "C7", activity_status: "INACTIVE", event_list: [{ event_code: "CompletePayment" }] }] });
  assert.deepEqual(ps[0], { pixelId: "7", nome: "C7", ativo: false, eventos: ["COMPLETEPAYMENT"] });
});

// ── Video ────────────────────────────────────────────────────────────────────

test("video: 9:16 H.264 dentro da especificacao passa sem transformar", () => {
  const p = planejarVideo(sonda());
  assert.equal(p.transformar, false);
  assert.equal(p.proporcao, "9:16");
});

test("video: iPhone HEVC 4:3 vira 1:1 H.264; 3:4 vai para 9:16 no feed; 16:9 baixo sobe para 1920x1080", () => {
  const a = planejarVideo(sonda({ largura: 1440, altura: 1080, codecVideo: "hevc", proporcao: 4 / 3, rotuloProporcao: "1.33:1" }));
  assert.equal(a.mudarProporcao, true);
  assert.equal(a.converterCodec, true);
  assert.equal(proporcaoAlvo(1080, 1440), "9:16");
  const b = planejarVideo(sonda({ largura: 854, altura: 480, proporcao: 854 / 480, rotuloProporcao: "16:9" }));
  assert.deepEqual([b.mudarProporcao, b.largura, b.altura], [false, 1920, 1080]);
  assert.ok(b.avisos.some((x) => /Ampliar nao recupera/.test(x)));
});

test("video: mais de 10 min bloqueia (cortar muda o conteudo); mais de 500 MB recomprime; bitrate baixo avisa", () => {
  assert.ok(planejarVideo(sonda({ duracaoS: 700 })).problemas.length > 0);
  assert.equal(planejarVideo(sonda({ bytes: 600 * 1048576 })).reduzirTamanho, true);
  assert.ok(planejarVideo(sonda({ bitrate: 300_000 })).avisos.some((x) => /516 kbps/.test(x)));
});

test("video: URL do Cloudinary preserva enquadramento (pad desfocado) ou preenche com corte no assunto; audio AAC", () => {
  const p = planejarVideo(sonda({ largura: 1440, altura: 1080, proporcao: 4 / 3, rotuloProporcao: "1.33:1" }));
  const base = "https://res.cloudinary.com/d/video/upload/vc_h264,f_mp4/v17/mecpro/chat-videos/x.mov";
  assert.equal(urlCloudinaryAdaptada(base, p), "https://res.cloudinary.com/d/video/upload/c_pad,b_blurred:400:15,w_1080,h_1080,vc_h264,ac_aac,q_auto:good,f_mp4/v17/mecpro/chat-videos/x.mp4");
  assert.match(urlCloudinaryAdaptada(base, p, "preencher")!, /c_fill,g_auto,w_1080,h_1080/);
  assert.equal(urlCloudinaryAdaptada("https://outro.com/x.mp4", p), null);
  assert.equal(urlCapaDoVideo(urlCloudinaryAdaptada(base, p)!), "https://res.cloudinary.com/d/video/upload/so_1,c_pad,b_blurred:400:15,w_1080,h_1080,q_auto:good,f_jpg/v17/mecpro/chat-videos/x.jpg");
});

test("video: transformacao grande em processamento (423) e esperada antes de ir ao TikTok", async () => {
  let n = 0;
  const f = (async () => new Response(null, { status: n++ < 2 ? 423 : 200 })) as any;
  assert.equal(await aguardarUrlPronta("https://x", f, { intervaloMs: 1 }), true);
  assert.equal(await aguardarUrlPronta("https://x", (async () => new Response(null, { status: 404 })) as any, { intervaloMs: 1 }), false);
});

test("video: fora do Cloudinary e importado pelo proprio Cloudinary (servidor nao baixa) so na execucao", async () => {
  const importados: string[] = [];
  const deps = { sondar: async () => sonda({ largura: 1440, altura: 1080, proporcao: 4 / 3, rotuloProporcao: "1.33:1" }), importar: async (u: string) => { importados.push(u); return "https://res.cloudinary.com/d/video/upload/v1/mecpro/tiktok-videos/y.mp4"; }, aguardar: async () => true };
  const previa = await prepararVideo({ url: "https://drive.exemplo.com/y.mp4" }, { executar: false }, deps);
  assert.equal(importados.length, 0, "a validacao nao importa nada");
  const pronto = await prepararVideo({ url: "https://drive.exemplo.com/y.mp4" }, { executar: true }, deps);
  assert.equal(importados.length, 1);
  assert.match(pronto.urlFinal!, /c_pad.*\/v1\/mecpro\/tiktok-videos\/y\.mp4$/);
  assert.match(nomeNoTikTok(pronto), /^mecpro_[0-9a-f]{10}_y_1x1\.mp4$/);
  assert.equal(nomeNoTikTok(pronto), nomeNoTikTok(await prepararVideo({ url: "https://drive.exemplo.com/y.mp4" }, { executar: true }, deps)), "nome deterministico");
  assert.ok(previa.correcoes.length > 0);
});

test("video: filtro FFmpeg (sem Cloudinary) mantem o quadro inteiro com fundo desfocado, ou corta no modo preencher", () => {
  assert.match(filtroFfmpeg(1080, 1920, true, "preservar"), /boxblur.*overlay/);
  assert.match(filtroFfmpeg(1080, 1920, true, "preencher"), /crop=1080:1920/);
  assert.equal(filtroFfmpeg(1920, 1080, false, "preservar"), "scale=1920:1080,setsar=1,format=yuv420p");
});

test("video real (ffprobe): sonda do arquivo e validacao em disco, sem carregar na memoria", { skip: spawnSync("ffmpeg", ["-version"]).status !== 0 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-teste-"));
  try {
    const arq = path.join(dir, "v.mp4");
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x480:rate=25:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", arq]);
    assert.equal(r.status, 0, String(r.stderr));
    const s = await sondarVideoRemoto(arq);
    assert.equal(s!.largura, 640);
    assert.equal(planejarVideo(s!).proporcao, "1:1", "4:3 vai para 1:1");
    const st = await fs.stat(arq);
    const v = await validarVideoEmArquivo(arq, st.size);
    assert.equal(v.ok, true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// ── Texto ────────────────────────────────────────────────────────────────────

test("texto: tira link, # e @ e encurta para 100 sem cortar palavra", () => {
  const r = limparTextoDoAnuncio("Black Friday da #ShadiaHasan com @shadia: acesse https://shadiahasan.com/bf e garanta sua vaga no curso de autoconhecimento com desconto especial hoje");
  assert.ok(!/[#@]|https?:/.test(r.texto));
  assert.ok(r.texto.length <= 100);
  assert.ok(!r.texto.endsWith(" "));
  assert.equal(r.correcoes.length, 3);
});

// ── Validacao previa ─────────────────────────────────────────────────────────

function contaFalsa(opts: { pixels?: any[]; identidades?: boolean } = {}): ClienteTikTok {
  const criados: string[] = [];
  return {
    get: async (path: string, params: any) => {
      if (path === "identity/get/") return opts.identidades === false ? { identity_list: [] } : params.identity_type === "TT_USER" ? { identity_list: [{ identity_id: "I1", identity_type: "TT_USER", display_name: "Shadia Hasan" }] } : { identity_list: [] };
      if (path === "pixel/list/") return { pixels: opts.pixels ?? [{ pixel_id: "P1", pixel_name: "Shadia", activity_status: "ACTIVE", events: [{ event_type: "SHOPPING" }] }] };
      throw new Error("inesperado " + path);
    },
    post: async (p: string) => { criados.push(p); throw new Error("validacao nao pode criar nada: " + p); },
  } as any;
}
const depsVal = (o: Partial<DepsValidacao> = {}): DepsValidacao => ({
  minimo: async () => ({ moeda: "BRL", minimo: 126, cotacao: 5.7, fonte: "api" }),
  urlSegura: async () => true,
  pagina: async () => ({ ok: true, status: 200 }),
  video: { sondar: async () => sonda({ largura: 1440, altura: 1080, codecVideo: "hevc", proporcao: 4 / 3, rotuloProporcao: "1.33:1" }), importar: async () => null, aguardar: async () => true },
  ...o,
});
// Caso real: Shadia Hasan Black Friday (#828), sessao 28, 24/11.
const shadia828 = {
  advertiserId: "7620542434560344082", campaignName: "Campanha Shadia Hasan - Black Friday · #828", dailyBudgetReais: 126,
  landingPageUrl: "https://shadiahasan.com/cursos", adText: "Liberte-se dos medos que te paralisam", callToAction: "SHOP_NOW", displayName: "Shadia Hasan",
  objetivo: "sales" as const,
  videos: ["IMG_7994.mov", "IMG_7969.mov", "IMG_7950.mov", "IMG_7967.mov"].map((n, i) => ({ videoUrl: `https://res.cloudinary.com/dpmnxbbbx/video/upload/v179552${i}/mecpro/chat-videos/v${i}.mp4`, nome: n })),
};

test("validacao 828: vendas com Pixel, 4 videos adaptados, destino com UTMs, nada criado", async () => {
  const v = await validarPublicacaoTikTok(contaFalsa(), shadia828, depsVal());
  assert.equal(v.ok, true, v.bloqueios.join(" | "));
  assert.equal(v.objetivo.objectiveType, "WEB_CONVERSIONS");
  assert.equal(v.pixel!.id, "P1");
  assert.equal(v.videos.length, 4);
  assert.ok(v.videos.every((x) => x.proporcao === "1:1" && /c_pad/.test(x.urlFinal!)));
  assert.match(v.entrada.landingPageUrl, /utm_source=tiktok/);
  assert.ok(v.correcoes.some((c) => /hevc convertido/.test(c)));
});

test("validacao 828: R$ 38 abaixo do minimo e sem Pixel bloqueiam; vendas nao viram trafego sem autorizacao", async () => {
  const v = await validarPublicacaoTikTok(contaFalsa({ pixels: [] }), { ...shadia828, dailyBudgetReais: 38 }, depsVal());
  assert.equal(v.ok, false);
  assert.ok(v.bloqueios.some((b) => /minimo aceito/.test(b)));
  assert.ok(v.bloqueios.some((b) => /Nao troco vendas por trafego/.test(b)));
  assert.equal(v.objetivo.objectiveType, "WEB_CONVERSIONS", "continua vendas");
  const autorizado = await validarPublicacaoTikTok(contaFalsa({ pixels: [] }), { ...shadia828, autorizarTrafego: true }, depsVal());
  assert.equal(autorizado.ok, true);
  assert.equal(autorizado.objetivo.objectiveType, "TRAFFIC");
  assert.ok(autorizado.avisos.some((a) => /Com a sua autorizacao/.test(a)));
});

test("validacao: pagina 404, sem identidade e video longo bloqueiam com o motivo", async () => {
  const v = await validarPublicacaoTikTok(contaFalsa({ identidades: false }), shadia828, depsVal({
    pagina: async () => ({ ok: false, status: 404 }),
    video: { sondar: async () => sonda({ duracaoS: 900 }), importar: async () => null, aguardar: async () => true },
  }));
  assert.ok(v.bloqueios.some((b) => /HTTP 404/.test(b)));
  assert.ok(v.bloqueios.some((b) => /Nenhuma conta de TikTok autorizada/.test(b)));
  assert.ok(v.bloqueios.some((b) => /10 minutos/.test(b)));
});

// ── Publicacao com objetivo real ─────────────────────────────────────────────

function contaQueCria() {
  const chamadas: Array<{ path: string; body: any }> = [];
  const c: ClienteTikTok = {
    async post(path: string, body: any) {
      chamadas.push({ path, body });
      if (path === "campaign/create/") return { campaign_id: "C1" };
      if (path === "adgroup/create/") return { adgroup_id: "G1" };
      if (path === "file/image/ad/upload/") return { image_id: "IMG" + chamadas.length };
      if (path === "file/video/ad/upload/") return [{ video_id: "V" + chamadas.length }];
      if (path === "ad/create/") return { ad_ids: ["A" + chamadas.length] };
      throw new Error("inesperado " + path);
    },
    async get(path: string, params: any) {
      chamadas.push({ path, body: params });
      if (path === "identity/get/") return params.identity_type === "TT_USER" ? { identity_list: [{ identity_id: "I1", identity_type: "TT_USER", display_name: "Shadia Hasan" }] } : { identity_list: [] };
      if (path === "advertiser/info/") return { list: [{ currency: "USD" }] };
      if (path === "pixel/list/") return { pixels: [{ pixel_id: "P1", pixel_name: "Shadia", activity_status: "ACTIVE", events: [{ event_type: "SHOPPING" }] }] };
      if (path === "campaign/get/") return { list: [{ campaign_id: "CANT", campaign_name: shadia828.campaignName, objective_type: "TRAFFIC" }] };
      if (path === "adgroup/get/") return { list: [{ adgroup_id: "GANT" }] };
      if (path === "file/video/ad/info/") return [{ width: 1080, height: 1080 }];
      throw new Error("inesperado " + path);
    },
  } as any;
  return { c, chamadas };
}

test("publicacao 828: WEB_CONVERSIONS com Pixel e SHOPPING; a campanha de trafego antiga (pausada) nao e reaproveitada", async () => {
  const { c, chamadas } = contaQueCria();
  const deps = depsVal().video;
  const r = await publicarCampanhaTikTok(c, { ...shadia828, dailyBudgetReais: 30, pixelId: "P1" }, undefined, undefined, deps);
  const camp = chamadas.find((x) => x.path === "campaign/create/")!;
  assert.equal(camp.body.objective_type, "WEB_CONVERSIONS");
  assert.match(camp.body.campaign_name, /#828 · \d{2}\/\d{2} \d{2}h\d{2}$/, "nome novo, a antiga era de trafego");
  const grupo = chamadas.find((x) => x.path === "adgroup/create/")!;
  assert.deepEqual([grupo.body.optimization_goal, grupo.body.billing_event, grupo.body.pixel_id, grupo.body.optimization_event, grupo.body.operation_status], ["CONVERT", "OCPM", "P1", "SHOPPING", "DISABLE"]);
  const ads = chamadas.filter((x) => x.path === "ad/create/");
  assert.equal(ads.length, 4);
  assert.ok(ads.every((a) => a.body.operation_status === "DISABLE"));
  assert.equal(new Set(ads.map((a) => a.body.creatives[0].landing_page_url)).size, 1, "uma unica URL para todos os anuncios");
  const capas = chamadas.filter((x) => x.path === "file/image/ad/upload/").map((x) => x.body.image_url);
  assert.ok(capas.every((u) => /so_1,c_pad.*f_jpg/.test(u)), "capa sai do video adaptado");
  assert.ok(r.avisos.some((a) => /objetivo TRAFFIC/.test(a)));
});

test("publicacao: vendas sem Pixel param ANTES de subir video ou criar campanha", async () => {
  const { c, chamadas } = contaQueCria();
  (c as any).get = async (path: string, params: any) => path === "pixel/list/" ? { pixels: [] } : path === "identity/get/" ? { identity_list: [{ identity_id: "I1", identity_type: "TT_USER" }] } : path === "advertiser/info/" ? { list: [{ currency: "USD" }] } : { list: [] };
  await assert.rejects(publicarCampanhaTikTok(c, { ...shadia828, dailyBudgetReais: 30 }, undefined, undefined, depsVal().video), /nao tem Pixel.*Nada foi criado/);
  assert.equal(chamadas.filter((x) => /create|upload/.test(x.path)).length, 0);
});

// ── Erros originais e consulta ───────────────────────────────────────────────

test("erro original da API: code, message inteira e request_id preservados", async () => {
  const longa = "All videos must have a 16:9, 9:16, or 1:1 aspect ratio. ".repeat(20);
  const f = (async () => new Response(JSON.stringify({ code: 40002, message: longa, request_id: "REQ-828", data: {} }))) as any;
  const c = criarClienteTikTok("tok", f);
  const e: any = await c.post("ad/create/", {}).catch((x) => x);
  assert.ok(e instanceof ErroTikTok);
  assert.deepEqual(e.paraRegistro(), { path: "ad/create/", code: 40002, message: longa, request_id: "REQ-828", data: {} });
  assert.ok(e.paraRegistro().message.length > 400, "nao e mais cortado em 400");
});

test("consulta: campanha, grupo e anuncios com status, revisao e recusa", async () => {
  const c: any = {
    get: async (path: string) => ({
      "campaign/get/": { list: [{ campaign_id: "C1", campaign_name: "BF #828", objective_type: "WEB_CONVERSIONS", operation_status: "DISABLE", secondary_status: "CAMPAIGN_STATUS_DISABLE" }] },
      "adgroup/get/": { list: [{ adgroup_id: "G1", adgroup_name: "Grupo", operation_status: "DISABLE", budget_mode: "BUDGET_MODE_DAY", budget: 126, optimization_goal: "CONVERT", optimization_event: "SHOPPING", pixel_id: "P1" }] },
      "ad/get/": { list: [{ ad_id: "A1", ad_name: "V1", operation_status: "DISABLE", secondary_status: "AD_STATUS_REVIEW_REJECTED", reject_reason: "Aspect ratio" }] },
    } as any)[path],
  };
  const s = await consultarCampanhaTikTok(c, "1", "C1");
  const txt = resumoDaSituacao(s);
  assert.match(txt, /WEB_CONVERSIONS/);
  assert.match(txt, /126\/dia, otimiza CONVERT \(SHOPPING\)/);
  assert.match(txt, /recusa: Aspect ratio/);
});

test("upload do chat: video vai ao Cloudinary em partes lidas do disco (memoria = uma parte)", async () => {
  const { uploadVideoFileToCloudinary } = await import("../imageGeneration");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-up-"));
  const env = { ...process.env };
  try {
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "d", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" });
    const arq = path.join(dir, "v.mp4");
    await fs.writeFile(arq, Buffer.alloc(12 * 1024 * 1024, 1));
    const partes: string[] = [];
    let ids = new Set<string>();
    const f = (async (_u: string, init: any) => {
      partes.push(init.headers["Content-Range"]); ids.add(init.headers["X-Unique-Upload-Id"]);
      const ultima = /\/12582912$/.test(init.headers["Content-Range"]) && init.headers["Content-Range"].includes("-12582911/");
      return new Response(JSON.stringify(ultima ? { secure_url: "https://res.cloudinary.com/d/video/upload/v1/x.mp4" } : { done: false }));
    }) as any;
    const url = await uploadVideoFileToCloudinary(arq, "v.mp4", { parteBytes: 5 * 1024 * 1024, doFetch: f });
    assert.equal(url, "https://res.cloudinary.com/d/video/upload/v1/x.mp4");
    assert.deepEqual(partes, ["bytes 0-5242879/12582912", "bytes 5242880-10485759/12582912", "bytes 10485760-12582911/12582912"]);
    assert.equal(ids.size, 1, "mesmo upload id em todas as partes");
  } finally {
    for (const k of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── Revisao Goldfish 25/11 ───────────────────────────────────────────────────
import { autorizouTrafego, ehConfirmacao, valorDiarioDaFala, ultimaFoiPreviaDoTikTok, previaPendenteDoTikTok } from "../chatTikTok";
import { ipPrivado, hostPublico, urlPublicaSegura } from "../tiktokUrl";
import { urlCloudinaryH264 } from "../tiktokVideo";

test("Goldfish 1: pergunta sobre trafego NAO autoriza trafego", () => {
  assert.equal(autorizouTrafego("qual a diferenca entre vendas e trafego no tiktok?"), false);
  assert.equal(autorizouTrafego("pode me explicar o que muda com trafego?"), false);
  assert.equal(autorizouTrafego("pode me explicar o que muda com trafego"), false);
  assert.equal(autorizouTrafego("assim fica trafego mesmo no tiktok"), false, "'sim' dentro de 'assim' e 'ok' dentro de 'tiktok'");
  assert.equal(autorizouTrafego("nao autorizo trafego"), false);
  for (const t of ["autorizo trafego", "autorizo tráfego", "sim, como trafego", "pode publicar como trafego"]) assert.equal(autorizouTrafego(t), true, t);
});

test("Goldfish 2: pergunta ou hipotese depois da previa nao confirma nem vira valor", () => {
  for (const t of ["vai ficar pausada?", "pode explicar o minimo?", "pode explicar o minimo", "isso", "sim mas nao agora", "ok, mas e o pixel?"]) assert.equal(ehConfirmacao(t), false, t);
  for (const t of ["sim", "Sim!", "sim, no tiktok", "pode publicar", "ok", "confirmo", "pode sim", "sim, pode publicar"]) assert.equal(ehConfirmacao(t), true, t);
  assert.equal(valorDiarioDaFala("e se fosse R$ 200?"), null);
  assert.equal(valorDiarioDaFala("quanto daria com 150 reais"), null);
  assert.equal(valorDiarioDaFala("150 por dia"), 150);
});

test("Goldfish 7: previa so e reconhecida pela nossa pergunta, e na mesma conversa", () => {
  assert.equal(ultimaFoiPreviaDoTikTok("Combinado, nao vou publicar no TikTok agora."), false);
  assert.equal(ultimaFoiPreviaDoTikTok("O TikTok aceita no minimo R$ 126 por dia. Publico pausada com R$ 126/dia? Responda **sim** ou diga outro valor."), true);
  assert.equal(previaPendenteDoTikTok(2, undefined), null, "sem conversa, nada pendente");
});

test("Goldfish 6 (SSRF): metadados, rede interna e IPv6 local nao sao consultados", async () => {
  for (const ip of ["169.254.169.254", "172.16.0.1", "172.31.255.1", "10.0.0.1", "127.0.0.1", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) assert.equal(ipPrivado(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(ipPrivado(ip), false, ip);
  assert.equal(hostPublico("metadata.google.internal"), false);
  assert.equal(await urlPublicaSegura("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(await urlPublicaSegura("https://interno.empresa.com", async () => ["10.1.2.3"]), false, "DNS que aponta para rede interna");
  assert.equal(await urlPublicaSegura("https://shadiahasan.com", async () => ["104.21.1.1"]), true);
  assert.equal(await urlPublicaSegura("file:///etc/passwd"), false);
  assert.ok(normalizarUrlDeDestino("https://169.254.169.254/x").problemas.length > 0);
  const chamou: string[] = [];
  const r = await paginaResponde("https://10.0.0.5/x", (async (u: string) => { chamou.push(u); return new Response(null); }) as any);
  assert.equal(r.ok, false);
  assert.equal(chamou.length, 0, "nem chega a consultar");
});

test("Goldfish 6: video fora de https publico nao e sondado", async () => {
  const sondados: string[] = [];
  const v = await validarPublicacaoTikTok(contaFalsa(), { ...shadia828, videos: [{ videoUrl: "file:///etc/passwd", nome: "x" }] }, depsVal({
    urlSegura: async (u) => u.startsWith("https://") && !u.includes("169.254"),
    video: { sondar: async (u) => { sondados.push(u); return null; }, importar: async () => null, aguardar: async () => true },
  }));
  assert.equal(sondados.length, 0);
  assert.ok(v.bloqueios.some((b) => /https publico/.test(b)));
});

test("Goldfish 5: sem sonda, video do Cloudinary vai em H.264 (HEVC nao segue cru)", async () => {
  assert.equal(urlCloudinaryH264("https://res.cloudinary.com/d/video/upload/v1/a.mov"), "https://res.cloudinary.com/d/video/upload/vc_h264,ac_aac,f_mp4/v1/a.mp4");
  const p = await prepararVideo({ url: "https://res.cloudinary.com/d/video/upload/v1/a.mov" }, { executar: true }, { sondar: async () => null, importar: async () => null, aguardar: async () => true });
  assert.match(p.urlFinal!, /vc_h264/);
});

test("Goldfish 4: sem Cloudinary, FFmpeg em pasta temporaria e envio por arquivo (UPLOAD_BY_FILE), pasta apagada", async () => {
  const { c, chamadas } = contaQueCria();
  const forms: any[] = [];
  (c as any).postForm = async (path: string, campos: any, arquivo: any) => { forms.push({ path, campos, tamanho: arquivo.dados.size }); return [{ video_id: "VLOCAL" }]; };
  let pastaUsada = "";
  const deps = {
    sondar: async () => sonda({ largura: 1440, altura: 1080, proporcao: 4 / 3, rotuloProporcao: "1.33:1" }),
    importar: async () => null, aguardar: async () => true,
    adaptarLocal: async (_o: string, pasta: string) => { pastaUsada = pasta; const f = path.join(pasta, "tiktok.mp4"); await fs.writeFile(f, Buffer.from("video")); return f; },
  };
  const r = await publicarCampanhaTikTok(c, { ...shadia828, dailyBudgetReais: 30, videos: [{ videoUrl: "https://drive.exemplo.com/a.mp4", nome: "a.mp4" }] }, undefined, undefined, deps);
  assert.equal(r.ads[0].videoId, "VLOCAL");
  assert.equal(forms[0].campos.upload_type, "UPLOAD_BY_FILE");
  assert.match(forms[0].campos.video_signature, /^[0-9a-f]{32}$/);
  await assert.rejects(fs.stat(pastaUsada), "pasta temporaria removida");
});

test("Goldfish 9: a publicacao usa o mesmo plano da previa (nao sonda de novo)", async () => {
  const { c } = contaQueCria();
  const v = await validarPublicacaoTikTok(contaFalsa(), shadia828, depsVal());
  let sondou = 0;
  await publicarCampanhaTikTok(c, { ...v.entrada, dailyBudgetReais: 30, pixelId: "P1" }, undefined, undefined, { sondar: async () => { sondou++; return null; }, importar: async () => null, aguardar: async () => true });
  assert.equal(sondou, 0);
});

test("Goldfish 3: MCP nao troca vendas por trafego sem autorizacao; objetivo sem equivalente nao vira trafego (fonte)", async () => {
  const src = await fs.readFile(new URL("../mcpServer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /normalizarObjetivo\(campaign\.objective\) \|\| "traffic"/);
  assert.match(src, /Publicar como tráfego troca o objetivo: só com autorizarTrafego=true/);
});

// ── Revisao Goldfish 25/11, rodada 2 ─────────────────────────────────────────
import { urlFinalSegura } from "../tiktokUrl";
import { reservarPublicacaoTikTok } from "../chatTikTok";

test("Goldfish r2 A: recusa de trafego nao autoriza", () => {
  for (const t of ["vendas sim, trafego jamais", "sem trafego, ok", "sim, vendas. trafego nunca", "ok entendi o trafego", "sim, quero entender trafego melhor"]) assert.equal(autorizouTrafego(t), false, t);
  for (const t of ["ok trafego", "trafego autorizado", "autorizo trafego no tiktok"]) assert.equal(autorizouTrafego(t), true, t);
});

test("Goldfish r2 B: valor recusado ou hesitante nao vira decisao", () => {
  for (const t of ["não, 200 por dia é muito", "melhor esperar, 150 reais é caro", "acho que 300 por dia seria melhor, mas não publica ainda", "campanha 828"]) assert.equal(valorDiarioDaFala(t), null, t);
  assert.equal(valorDiarioDaFala("ok, 150 por dia"), 150);
  assert.equal(valorDiarioDaFala("pode ser 150 reais"), 150);
  assert.equal(valorDiarioDaFala("200"), 200);
});

test("Goldfish r2 C: IPv6 que embute IPv4 privado (forma hexadecimal do new URL), NAT64 e site-local", async () => {
  for (const u of ["https://[::ffff:169.254.169.254]/latest", "https://[::ffff:127.0.0.1]/", "https://[fec0::1]/", "https://[64:ff9b::a9fe:a9fe]/", "https://[2002:a9fe:a9fe::1]/"]) assert.equal(await urlPublicaSegura(u), false, u);
  assert.equal(await urlPublicaSegura("https://[2606:4700::1111]/"), true);
});

test("Goldfish r2 D: redirecionamento para rede interna e barrado em cada salto", async () => {
  const f = (async (u: string) => u.includes("publico") ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/x" } }) : new Response(null)) as any;
  assert.equal(await urlFinalSegura("https://publico.com/v.mp4", f, async (u) => !u.includes("169.254")), null);
  const ok = (async (u: string) => u.endsWith("a.mp4") ? new Response(null, { status: 301, headers: { location: "/b.mp4" } }) : new Response(null)) as any;
  assert.equal(await urlFinalSegura("https://publico.com/a.mp4", ok, async () => true), "https://publico.com/b.mp4");
});

test("Goldfish r2 E: sem sonda, video fora do Cloudinary e importado e convertido para H.264 antes do envio", async () => {
  let esperou = "";
  const p = await prepararVideo({ url: "https://drive.exemplo.com/a.mov" }, { executar: true }, { sondar: async () => null, importar: async () => "https://res.cloudinary.com/d/video/upload/v1/mecpro/tiktok-videos/a.mov", aguardar: async (u) => { esperou = u; return true; } });
  assert.equal(p.urlFinal, "https://res.cloudinary.com/d/video/upload/vc_h264,ac_aac,f_mp4/v1/mecpro/tiktok-videos/a.mp4");
  assert.equal(esperou, p.urlFinal);
});

test("Goldfish r2 F: cadeia de republicacao confere cada campanha apagada, quantas vezes for", async () => {
  const guardado: Record<string, string> = { "k": "C1", "k:refeita:C1": "C2" };
  const r = await reservarPublicacaoTikTok(async (chave) => guardado[chave] ? { kind: "cached_result", result: { tiktokCampaignId: guardado[chave] } } : { kind: "proceed", recordId: 9 }, async () => false, "k");
  assert.equal(r.kind, "proceed");
  assert.equal(r.republicacao, true);
  const viva = await reservarPublicacaoTikTok(async (chave) => guardado[chave] ? { kind: "cached_result", result: { tiktokCampaignId: guardado[chave] } } : { kind: "proceed", recordId: 9 }, async (id) => id === "C2", "k");
  assert.equal(viva.kind, "cached_result", "C2 ainda existe: nao republica");
});

test("Goldfish r2 G: reescrita do modelo terminando em pergunta de publicar ainda e reconhecida; 'pode ser' e emoji confirmam", () => {
  assert.equal(ultimaFoiPreviaDoTikTok("Tudo certo com a validacao no TikTok. Quer que eu publique agora, pausada?"), true);
  assert.equal(ehConfirmacao("pode ser"), true);
  assert.equal(ehConfirmacao("sim 👍"), true);
});
