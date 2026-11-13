import test from "node:test";
import assert from "node:assert/strict";
import { escolherContaFilha } from "../googleContas";

const duas = [{ id: "1110184854", nome: "Morebem" }, { id: "2220768486", nome: "Teste" }];

test("MCC com uma filha usa a filha automaticamente", () => {
  const r = escolherContaFilha([{ id: "418-018-4854", nome: "Morebem" }]);
  assert.deepEqual(r, { ok: true, id: "4180184854", automatica: true });
});

test("MCC com varias filhas sem escolha explicita falha listando as contas", () => {
  const r = escolherContaFilha(duas);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.mensagem, /2 contas/);
    assert.match(r.mensagem, /1110184854 \(Morebem\)/);
  }
});

test("escolha explicita valida vence, mesmo com varias filhas", () => {
  const r = escolherContaFilha(duas, "222-076-8486");
  assert.deepEqual(r, { ok: true, id: "2220768486", automatica: false });
});

test("escolha explicita fora do MCC falha com mensagem clara", () => {
  const r = escolherContaFilha(duas, "9999999999");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.mensagem, /nao esta entre as contas/);
});

test("MCC sem filhas falha pedindo vinculo", () => {
  const r = escolherContaFilha([]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.mensagem, /nenhuma conta cliente vinculada/);
});
