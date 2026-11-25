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
  assert.deepEqual(await paginaResponde("https://a.com", f), { ok: true, status: 200 });
  assert.deepEqual(chamadas, ["HEAD", "GET"]);
  const fora = (async () => { throw new Error("ECONNREFUSED"); }) as any;
  assert.equal((await paginaResponde("https://a.com", fora)).ok, false);
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
