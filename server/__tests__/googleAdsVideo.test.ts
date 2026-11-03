import test from "node:test";
import assert from "node:assert/strict";
import {
  validarEntradaVideo, montarCorpoDoUpload, iniciarSessaoDeUpload, enviarBytes, tamanhoDoBloco,
  aguardarProcessamento, criarAssetDeVideo, baixarVideo, enviarVideoParaOGoogle, ErroVideoGoogle,
} from "../googleAdsVideo";
import { urlUploadDeVideo, GOOGLE_ADS_API_VERSION_VIDEO } from "../googleAdsApi";

const ctx = { accessToken: "tok", developerToken: "dev", customerId: "418-018-4854", loginCustomerId: "123-456-7890" };
const UP = "customers/4180184854/youTubeVideoUploads/abc123";
const sem = async () => {};

type Chamada = { url: string; init: any };
function fetchFalso(respostas: Array<(c: Chamada) => Response>) {
  const chamadas: Chamada[] = [];
  let i = 0;
  const f = (async (url: any, init: any) => {
    const c = { url: String(url), init };
    chamadas.push(c);
    return respostas[Math.min(i++, respostas.length - 1)](c);
  }) as unknown as typeof fetch;
  return { f, chamadas };
}
const json = (o: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });

test("URL de upload usa o caminho resumable da v26 e tira o hifen do customer id", () => {
  assert.equal(
    urlUploadDeVideo("418-018-4854"),
    "https://googleads.googleapis.com/resumable/upload/v26/customers/4180184854/youTubeVideoUploads:create",
  );
  assert.equal(GOOGLE_ADS_API_VERSION_VIDEO, "v26");
});

test("validacao: titulo, tamanho, < >, canal e PUBLIC sem canal", () => {
  assert.throws(() => validarEntradaVideo({ titulo: "" }), /titulo obrigatorio/);
  assert.throws(() => validarEntradaVideo({ titulo: "x".repeat(101) }), /100/);
  assert.throws(() => validarEntradaVideo({ titulo: "a <b>" }), /< nem >/);
  assert.throws(() => validarEntradaVideo({ titulo: "ok", canalId: "XX123" }), /UC/);
  assert.throws(() => validarEntradaVideo({ titulo: "ok", privacidade: "PUBLIC" }), /canal de marca/);
  const ok = validarEntradaVideo({ titulo: " Aula R$ 19,90 ", canalId: "UC" + "a".repeat(22), privacidade: "PUBLIC" });
  assert.equal(ok.titulo, "Aula R$ 19,90");
});

test("corpo do upload: nao listado por padrao e declara conteudo gerado por IA", () => {
  const c: any = montarCorpoDoUpload("418-018-4854", { titulo: "Aula" });
  assert.equal(c.customer_id, "4180184854");
  assert.equal(c.you_tube_video_upload.video_privacy, "UNLISTED");
  assert.equal(c.you_tube_video_upload.video_content_metadata.generative_content_disclosure, "GENERATIVE_CONTENT");
  assert.equal("channel_id" in c.you_tube_video_upload, false);
  const nao: any = montarCorpoDoUpload("1", { titulo: "Aula", conteudoGenerativo: false });
  assert.equal(nao.you_tube_video_upload.video_content_metadata.generative_content_disclosure, "NON_GENERATIVE_CONTENT");
});

test("sessao: envia cabecalhos resumable e login-customer-id sem hifen; le a URL de envio", async () => {
  const { f, chamadas } = fetchFalso([() => json({}, 200, { "x-goog-upload-url": "https://up.example/s1", "x-goog-upload-chunk-granularity": "262144" })]);
  const r = await iniciarSessaoDeUpload(ctx, { titulo: "Aula" }, 1000, { fetchImpl: f });
  assert.equal(r.uploadUrl, "https://up.example/s1");
  assert.equal(r.granularidade, 262144);
  const h = chamadas[0].init.headers;
  assert.equal(h["X-Goog-Upload-Protocol"], "resumable");
  assert.equal(h["X-Goog-Upload-Command"], "start");
  assert.equal(h["X-Goog-Upload-Header-Content-Length"], "1000");
  assert.equal(h["login-customer-id"], "1234567890");
  assert.equal(h["developer-token"], "dev");
});

test("sessao: erro do Google vira ErroVideoGoogle e mostra a versao", async () => {
  const { f } = fetchFalso([() => json({ error: "nao" }, 403)]);
  await assert.rejects(iniciarSessaoDeUpload(ctx, { titulo: "A" }, 10, { fetchImpl: f }), (e: any) =>
    e instanceof ErroVideoGoogle && e.etapa === "sessao" && /403/.test(e.message) && /v26/.test(e.message));
});

test("sessao: recusa arquivo vazio ou acima de 256 MB", async () => {
  await assert.rejects(iniciarSessaoDeUpload(ctx, { titulo: "A" }, 0), /vazio/);
  await assert.rejects(iniciarSessaoDeUpload(ctx, { titulo: "A" }, 257 * 1024 * 1024), /256 MB/);
});

test("bloco e multiplo da granularidade e nunca passa de 8 MB (exceto uma granularidade)", () => {
  assert.equal(tamanhoDoBloco(262144) % 262144, 0);
  assert.ok(tamanhoDoBloco(262144) <= 8 * 1024 * 1024);
  assert.equal(tamanhoDoBloco(16 * 1024 * 1024), 16 * 1024 * 1024);
});

test("envio de arquivo pequeno: um bloco so, ja com finalize", async () => {
  const { f, chamadas } = fetchFalso([() => json({ resourceName: UP })]);
  const nome = await enviarBytes(ctx, "https://up.example/s1", new Uint8Array(10), 4, { fetchImpl: f });
  assert.equal(nome, UP);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].init.headers["X-Goog-Upload-Command"], "upload, finalize");
  assert.equal(chamadas[0].init.headers["X-Goog-Upload-Offset"], "0");
});

test("envio: varios blocos quando o arquivo passa do bloco", async () => {
  const gran = 6 * 1024 * 1024; // bloco = 6 MB
  const dados = new Uint8Array(13 * 1024 * 1024);
  const { f, chamadas } = fetchFalso([
    () => new Response("{}", { status: 200 }),
    () => new Response("{}", { status: 200 }),
    () => json({ resourceName: UP }),
  ]);
  const nome = await enviarBytes(ctx, "https://up.example/s1", dados, gran, { fetchImpl: f });
  assert.equal(nome, UP);
  assert.deepEqual(chamadas.map((c) => c.init.headers["X-Goog-Upload-Offset"]), ["0", String(gran), String(2 * gran)]);
  assert.deepEqual(chamadas.map((c) => c.init.headers["X-Goog-Upload-Command"]), ["upload", "upload", "upload, finalize"]);
});

test("envio: falha de bloco informa o byte; resposta sem resourceName e erro", async () => {
  const a = fetchFalso([() => new Response("ruim", { status: 500 })]);
  await assert.rejects(enviarBytes(ctx, "https://up.example/s1", new Uint8Array(5), 4, { fetchImpl: a.f }), /HTTP 500 no byte 0/);
  const b = fetchFalso([() => json({})]);
  await assert.rejects(enviarBytes(ctx, "https://up.example/s1", new Uint8Array(5), 4, { fetchImpl: b.f }), /sem resourceName/);
});

test("processamento: espera ate PROCESSED e devolve o video_id", async () => {
  const lin = (state: string, videoId = "") => json({ results: [{ youTubeVideoUpload: { state, videoId } }] });
  const { f, chamadas } = fetchFalso([() => lin("PENDING"), () => lin("UPLOADED"), () => lin("PROCESSED", "dQw4w9WgXcQ")]);
  const id = await aguardarProcessamento(ctx, UP, { tentativas: 5, intervaloMs: 1 }, { fetchImpl: f, esperar: sem });
  assert.equal(id, "dQw4w9WgXcQ");
  assert.equal(chamadas.length, 3);
  assert.match(chamadas[0].url, /\/v26\/customers\/4180184854\/googleAds:search$/);
  assert.match(chamadas[0].init.body, /you_tube_video_upload/);
});

test("processamento: FAILED/REJECTED para na hora; limite de tentativas explica", async () => {
  const rej = fetchFalso([() => json({ results: [{ youTubeVideoUpload: { state: "REJECTED" } }] })]);
  await assert.rejects(aguardarProcessamento(ctx, UP, {}, { fetchImpl: rej.f, esperar: sem }), /REJECTED/);
  const pend = fetchFalso([() => json({ results: [{ youTubeVideoUpload: { state: "PENDING" } }] })]);
  await assert.rejects(aguardarProcessamento(ctx, UP, { tentativas: 2 }, { fetchImpl: pend.f, esperar: sem }), /depois de 2 consultas/);
});

test("processamento: resource name fora do formato nao entra na consulta (injecao de GAQL)", async () => {
  await assert.rejects(aguardarProcessamento(ctx, "x' OR '1'='1", {}, { esperar: sem }), /inesperado/);
});

test("asset: cria youtubeVideoAsset e devolve o resource name", async () => {
  const { f, chamadas } = fetchFalso([() => json({ results: [{ resourceName: "customers/4180184854/assets/777" }] })]);
  const rn = await criarAssetDeVideo(ctx, "Aula R$ 19,90", "dQw4w9WgXcQ", { fetchImpl: f });
  assert.equal(rn, "customers/4180184854/assets/777");
  assert.match(chamadas[0].url, /\/v26\/customers\/4180184854\/assets:mutate$/);
  assert.equal(JSON.parse(chamadas[0].init.body).operations[0].create.youtubeVideoAsset.youtubeVideoId, "dQw4w9WgXcQ");
  await assert.rejects(criarAssetDeVideo(ctx, "x", "curto"), /invalido/);
});

test("download: so https, sem enderecos internos, com teto de tamanho", async () => {
  await assert.rejects(baixarVideo("http://x.com/a.mp4"), /https/);
  await assert.rejects(baixarVideo("https://localhost/a.mp4"), /interno/);
  await assert.rejects(baixarVideo("https://192.168.0.5/a.mp4"), /interno/);
  const grande = fetchFalso([() => new Response("x", { status: 200, headers: { "content-length": String(300 * 1024 * 1024) } })]);
  await assert.rejects(baixarVideo("https://cdn.example/a.mp4", { fetchImpl: grande.f }), /256 MB/);
});

test("fluxo completo: baixa, abre sessao, envia, processa e cria o asset", async () => {
  const { f, chamadas } = fetchFalso([
    () => new Response(new Uint8Array(100), { status: 200 }),                                              // download
    () => json({}, 200, { "x-goog-upload-url": "https://up.example/s1", "x-goog-upload-chunk-granularity": "256" }), // sessao
    () => json({ resourceName: UP }),                                                                      // envio
    () => json({ results: [{ youTubeVideoUpload: { state: "PROCESSED", videoId: "dQw4w9WgXcQ" } }] }),   // estado
    () => json({ results: [{ resourceName: "customers/4180184854/assets/777" }] }),                       // asset
  ]);
  const r = await enviarVideoParaOGoogle(ctx, { url: "https://cdn.example/aula.mp4" }, { titulo: "Aula R$ 19,90" }, { fetchImpl: f, esperar: sem });
  assert.deepEqual(r, { uploadResourceName: UP, youtubeVideoId: "dQw4w9WgXcQ", assetResourceName: "customers/4180184854/assets/777" });
  assert.equal(chamadas.length, 5);
});

test("fluxo completo: entrada invalida falha antes de qualquer chamada de rede", async () => {
  const { f, chamadas } = fetchFalso([() => json({})]);
  await assert.rejects(enviarVideoParaOGoogle(ctx, { bytes: new Uint8Array(5) }, { titulo: "" }, { fetchImpl: f }), /titulo obrigatorio/);
  assert.equal(chamadas.length, 0);
});

test("retomada: erro de processamento carrega o nome do upload para tentar de novo", async () => {
  const pend = fetchFalso([() => json({ results: [{ youTubeVideoUpload: { state: "PENDING" } }] })]);
  const { retomarVideoDoGoogle } = await import("../googleAdsVideo");
  await assert.rejects(
    retomarVideoDoGoogle(ctx, UP, "Aula", { fetchImpl: pend.f, esperar: sem, tentativas: 2 }),
    (e: any) => e instanceof ErroVideoGoogle && e.uploadResourceName === UP,
  );
  const ok = fetchFalso([
    () => json({ results: [{ youTubeVideoUpload: { state: "PROCESSED", videoId: "dQw4w9WgXcQ" } }] }),
    () => json({ results: [{ resourceName: "customers/4180184854/assets/9" }] }),
  ]);
  const r = await retomarVideoDoGoogle(ctx, UP, "Aula", { fetchImpl: ok.f, esperar: sem });
  assert.equal(r.assetResourceName, "customers/4180184854/assets/9");
});
