import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { ehHeic, converterHeicParaJpeg } from "../chatHeic";

const HEIC = "/tmp/e2e-fx/foto-iphone.heic";

test("ehHeic detecta pelo conteudo e ignora outros formatos", () => {
  const falso = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)]);
  assert.equal(ehHeic(falso), true);
  assert.equal(ehHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), false);
  assert.equal(ehHeic(Buffer.from("mp4 ftypisom nao e heic....")), false);
  assert.equal(ehHeic(Buffer.alloc(4)), false);
});

test("converterHeicParaJpeg: falha de conversao vira mensagem amigavel, sem vazar detalhe", async () => {
  const r = await converterHeicParaJpeg(Buffer.alloc(500), async () => { throw new Error("segredo interno"); });
  assert.equal(r.ok, false);
  assert.ok(!(r as any).erro.includes("segredo"));
  const grande = await converterHeicParaJpeg(Buffer.alloc(21 * 1024 * 1024));
  assert.equal(grande.ok, false);
});

test("converterHeicParaJpeg: HEIC real vira JPEG valido", { skip: !existsSync(HEIC) }, async () => {
  const b = readFileSync(HEIC);
  assert.equal(ehHeic(b), true);
  const r = await converterHeicParaJpeg(b);
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.jpeg[0], 0xff); assert.equal(r.jpeg[1], 0xd8); }
});
