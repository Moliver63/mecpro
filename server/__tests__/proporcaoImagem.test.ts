import test from "node:test";
import assert from "node:assert/strict";
import { urlCloudinaryNaProporcao } from "../imageGeneration";

const BASE = "https://res.cloudinary.com/dpmnxbbbx/image/upload/v1791048982/mecpro/generated-creatives/pjz0bi3ynkuinkc9bsvu.jpg";

// Achado real (07/10): toda imagem gerada saía quadrada nos tres formatos.
// O flux-1-schnell nao aceita width/height (schema oficial: so `prompt` e
// `steps`, com "additionalProperties": false) e o upload pro Cloudinary nao
// aplicava transformacao nenhuma — apesar do comentario no codigo afirmar
// que "o tamanho final e normalizado depois, no upload do Cloudinary".
test("cada formato recebe a sua proporcao", () => {
  assert.match(urlCloudinaryNaProporcao(BASE, "feed"), /\/image\/upload\/c_lfill,g_auto,ar_4:5,w_1080\/v1791048982\//);
  assert.match(urlCloudinaryNaProporcao(BASE, "stories"), /\/image\/upload\/c_lfill,g_auto,ar_9:16,w_1080\/v1791048982\//);
  assert.match(urlCloudinaryNaProporcao(BASE, "square"), /\/image\/upload\/c_lfill,g_auto,ar_1:1,w_1080\/v1791048982\//);

  // O ponto todo: os tres tem que ser DIFERENTES entre si. Era isso que
  // fazia Story e Square saírem iguais.
  const urls = (["feed", "stories", "square"] as const).map(f => urlCloudinaryNaProporcao(BASE, f));
  assert.equal(new Set(urls).size, 3, "tres formatos, tres URLs distintas");
});

// `c_lfill` e nao `c_fill`: recorta na proporcao mas NUNCA amplia. De um
// quadrado de 1024, um 9:16 vira 576x1024 — dentro do minimo da Meta e sem
// inventar nitidez que o modelo nao gerou.
test("usa lfill para nao ampliar, e preserva o caminho do arquivo", () => {
  const url = urlCloudinaryNaProporcao(BASE, "stories");
  assert.match(url, /c_lfill/);
  assert.doesNotMatch(url, /c_fill,/, "c_fill esticaria a imagem");
  assert.ok(url.endsWith("/v1791048982/mecpro/generated-creatives/pjz0bi3ynkuinkc9bsvu.jpg"),
    "o caminho original tem que sobreviver intacto");
  // O host precisa continuar res.cloudinary.com: o validador recusa
  // qualquer outro (campaignImageValidator checa hostname).
  assert.equal(new URL(url).hostname, "res.cloudinary.com");
});

// A metade que protege: nao pode quebrar URL que nao e desse formato.
test("URL de fora do Cloudinary passa intacta", () => {
  for (const url of [
    "https://pixabay.com/get/foto.jpg",
    "https://res.cloudinary.com/x/video/upload/v1/a.mp4",
    "https://exemplo.com.br/imagem.png",
    "",
  ]) {
    assert.equal(urlCloudinaryNaProporcao(url, "feed"), url, `${url || "(vazio)"} nao devia ser mexida`);
  }
  // Valores nao-string nao podem estourar.
  assert.equal(urlCloudinaryNaProporcao(null as any, "feed"), "");
  assert.equal(urlCloudinaryNaProporcao(undefined as any, "feed"), "");
});

// Idempotente: o worker reaproveita `candidate_url` ja gravada nas
// retentativas. Empilhar transformacao a cada passada geraria URL cada vez
// mais longa e, pior, recorte sobre recorte.
test("nao empilha transformacao sobre URL ja transformada", () => {
  const umaVez = urlCloudinaryNaProporcao(BASE, "feed");
  assert.equal(urlCloudinaryNaProporcao(umaVez, "feed"), umaVez);
  // Nem mesmo pedindo outro formato — a primeira ja decidiu.
  assert.equal(urlCloudinaryNaProporcao(umaVez, "stories"), umaVez);
  // Transformacao que alguem tenha posto a mao tambem e respeitada.
  const manual = "https://res.cloudinary.com/x/image/upload/w_500,h_500/v1/a.jpg";
  assert.equal(urlCloudinaryNaProporcao(manual, "feed"), manual);
});

// URL sem versao (o Cloudinary permite) nao pode perder o caminho.
test("URL sem segmento de versao continua valida", () => {
  const semVersao = "https://res.cloudinary.com/dpmnxbbbx/image/upload/mecpro/a.jpg";
  const url = urlCloudinaryNaProporcao(semVersao, "feed");
  assert.match(url, /\/image\/upload\/c_lfill,g_auto,ar_4:5,w_1080\/mecpro\/a\.jpg$/);
});

test("formato desconhecido cai em feed em vez de montar URL quebrada", () => {
  const url = urlCloudinaryNaProporcao(BASE, "nao_existe" as any);
  assert.match(url, /ar_4:5/);
  assert.doesNotMatch(url, /undefined|NaN/);
});
