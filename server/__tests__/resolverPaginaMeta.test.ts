import test from "node:test";
import assert from "node:assert/strict";
import { resolverPaginaMetaComLista } from "../metaPageResolution";

const listaCom = (pages: Array<{ pageId: string; name: string }>) =>
  (async () => ({ ok: true as const, pages }));
const listaComErro = (erro: string) => (async () => ({ ok: false as const, erro }));

// Incidente real (Michel, 30/09): o chat respondeu "preciso do pageId da sua
// pagina Meta (ex: 123456789012345). Voce tem esse ID pronto? Se nao, use
// consultar_paginas_meta para lista-lo." Pedir um numero de 15 digitos a quem
// ja conectou a conta, e ainda citar o nome da ferramenta interna.
test("uma unica Pagina conectada e resolvida sozinha, sem perguntar", async () => {
  const r = await resolverPaginaMetaComLista(undefined, listaCom([{ pageId: "555", name: "Shadia Hasan" }]));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.pageId, "555");
  assert.equal(r.pageName, "Shadia Hasan");
  assert.equal(r.resolvidoAutomaticamente, true);
});

// A metade que protege: com varias Paginas, escolher sozinho publicaria na
// errada — e publicar gasta dinheiro real e e irreversivel.
test("com varias Paginas nao escolhe, e devolve os nomes pra perguntar", async () => {
  const paginas = [
    { pageId: "111", name: "Shadia Hasan" },
    { pageId: "222", name: "Método Shadia" },
  ];
  const r = await resolverPaginaMetaComLista(undefined, listaCom(paginas));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.paginas, paginas, "a lista tem que voltar pro assistente perguntar");
  assert.match(r.erro, /NOMES/, "a instrucao precisa dizer pra perguntar por nome");
  assert.match(r.erro, /nunca peca o id/i);
});

test("pageId informado explicitamente e respeitado, sem consultar a Meta", async () => {
  let consultou = false;
  const r = await resolverPaginaMetaComLista("999", async () => { consultou = true; return { ok: true as const, pages: [] }; });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.pageId, "999");
  assert.equal(r.resolvidoAutomaticamente, false);
  assert.equal(consultou, false, "nao precisa ir na Meta se o id ja veio");
});

test("string vazia ou so espaco conta como ausente", async () => {
  for (const vazio of ["", "   ", undefined]) {
    const r = await resolverPaginaMetaComLista(vazio, listaCom([{ pageId: "555", name: "Unica" }]));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.pageId, "555");
    assert.equal(r.resolvidoAutomaticamente, true);
  }
});

test("nenhuma Pagina conectada da erro acionavel, sem jargao", async () => {
  const r = await resolverPaginaMetaComLista(undefined, listaCom([]));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.erro, /Configuracoes → Meta Ads/);
  assert.ok(!/consultar_paginas_meta/.test(r.erro), "nao pode citar nome de ferramenta numa mensagem que chega ao usuario");
});

test("falha ao consultar a Meta propaga o erro, nao inventa pagina", async () => {
  const r = await resolverPaginaMetaComLista(undefined, listaComErro("Conta Meta não conectada."));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.erro, /Conta Meta não conectada/);
  assert.equal(r.paginas, undefined);
});
