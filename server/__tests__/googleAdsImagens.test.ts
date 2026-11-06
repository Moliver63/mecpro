import test from "node:test";
import assert from "node:assert/strict";
import { lerDimensoes, classificarImagem, validarImagem, urlImagemValida, operacaoAsset, operacaoVinculo, conferirConjunto } from "../googleAdsImagens";

function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function jpeg(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xc0; b.writeUInt16BE(17, 4); b[6] = 8;
  b.writeUInt16BE(h, 7); b.writeUInt16BE(w, 9);
  return b;
}

test("lerDimensoes PNG e JPEG", () => {
  assert.deepEqual(lerDimensoes(png(1200, 628)), { largura: 1200, altura: 628, formato: "png" });
  assert.deepEqual(lerDimensoes(jpeg(471, 471)), { largura: 471, altura: 471, formato: "jpeg" });
  assert.equal(lerDimensoes(Buffer.from("GIF89a....................")), null);
});
test("classificarImagem aceita 1:1 e 1,91:1 e recusa 9:16", () => {
  assert.deepEqual(classificarImagem(1200, 1200), { tipo: "QUADRADA" });
  assert.deepEqual(classificarImagem(1200, 628), { tipo: "PAISAGEM" });
  assert.ok("erro" in classificarImagem(720, 1280));
  assert.ok("erro" in classificarImagem(200, 200));
  assert.ok("erro" in classificarImagem(500, 262));
});
test("validarImagem recusa formato e tamanho", () => {
  assert.equal(validarImagem(jpeg(500, 500), "a").tipo, "QUADRADA");
  assert.throws(() => validarImagem(Buffer.from("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), "b"), /nem PNG/);
  assert.throws(() => validarImagem(jpeg(720, 1280), "c"), /proporcao/);
});
test("urlImagemValida exige https publico", () => {
  assert.equal(urlImagemValida("https://raw.githubusercontent.com/x/y.jpg"), true);
  assert.equal(urlImagemValida("http://a.com/x.jpg"), false);
  assert.equal(urlImagemValida("https://127.0.0.1/x.jpg"), false);
  assert.equal(urlImagemValida("https://localhost/x.jpg"), false);
});
test("operacoes do Google", () => {
  const v = validarImagem(jpeg(500, 500), "a");
  const o: any = operacaoAsset(v, "Shadia");
  assert.equal(o.create.type, "IMAGE");
  assert.ok(o.create.imageAsset.data.length > 0);
  assert.deepEqual(operacaoVinculo("418-018-4854", "123", "customers/4180184854/assets/9"), { create: { campaign: "customers/4180184854/campaigns/123", asset: "customers/4180184854/assets/9", fieldType: "AD_IMAGE" } });
});
test("conferirConjunto pede 1 quadrada e 1 paisagem", () => {
  const q = validarImagem(jpeg(500, 500), "q"), p = validarImagem(jpeg(1200, 628), "p");
  assert.deepEqual(conferirConjunto([q, p]), []);
  assert.equal(conferirConjunto([q]).length, 1);
});
