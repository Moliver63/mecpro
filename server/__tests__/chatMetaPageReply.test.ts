import test from "node:test";
import assert from "node:assert/strict";
import { repairMetaPageReply } from "../chatMetaPageReply";

test("normal reply and publication result do not query Meta", async () => {
  for (const text of ["Qual campanha?", "Publicado. pageId: 123"]) {
    assert.equal(await repairMetaPageReply(text, async () => { throw new Error("must not call"); }), text);
  }
});
test("technical request resolves page without claiming readiness", async () => {
  let calls = 0;
  const reply = await repairMetaPageReply("Campanha pronta. Informe pageId ou use consultar_paginas_meta", async () => {
    calls++; return { ok: true, pages: [{ pageId: "123456", name: "Shadia" }] };
  });
  assert.equal(calls, 1);
  assert.match(reply, /Shadia/);
  assert.match(reply, /validar/);
  assert.doesNotMatch(reply, /123456|pageId|consultar_paginas_meta|Campanha pronta/);
});
test("multiple pages require choice, none require connection", async () => {
  const reply = await repairMetaPageReply("Informe o ID da pagina", async () => ({ ok: true, pages: [{ pageId: "1", name: "A" }, { pageId: "2", name: "B" }] }));
  assert.match(reply, /- A\n- B/);
  assert.match(reply, /Qual delas/);
  assert.match(await repairMetaPageReply("Informe pageId", async () => ({ ok: true, pages: [] })), /permissoes/);
});
test("API failures do not expose provider errors", async () => {
  const reply = await repairMetaPageReply("Informe pageId", async () => ({ ok: false, erro: "secret" }));
  assert.doesNotMatch(reply, /secret/);
  assert.match(reply, /Nao consegui/);
  assert.match(await repairMetaPageReply("Informe pageId", async () => { throw new Error("secret"); }), /falhou/);
});
