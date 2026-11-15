import { test } from "node:test";
import assert from "node:assert/strict";
import { contaCriadaAgora } from "../signupTracking";

const agora = Date.parse("2026-11-15T12:00:00Z");

test("conta criada ha segundos conta como cadastro novo", () => {
  assert.equal(contaCriadaAgora(new Date(agora - 10_000), agora), true);
});

test("conta antiga (login repetido ou e-mail antigo vinculando o Google) nao conta", () => {
  assert.equal(contaCriadaAgora(new Date(agora - 3 * 60 * 1000), agora), false);
  assert.equal(contaCriadaAgora(new Date("2026-03-12T10:00:00Z"), agora), false);
});

test("valor ausente ou invalido nao conta", () => {
  for (const v of [undefined, null, "", "nao e data", 0]) assert.equal(contaCriadaAgora(v, agora), false, String(v));
});

test("data no futuro (relogio torto) nao conta", () => {
  assert.equal(contaCriadaAgora(new Date(agora + 60_000), agora), false);
});
