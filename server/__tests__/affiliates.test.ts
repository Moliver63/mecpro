import test from "node:test";
import assert from "node:assert/strict";
import { computeCommissionCents, computeReleaseAt, isReleased, normalizeCode } from "../affiliates";

test("comissao de 10% arredonda para baixo", () => {
  assert.equal(computeCommissionCents(9700, 10), 970);
  assert.equal(computeCommissionCents(19700, 10), 1970);
  assert.equal(computeCommissionCents(39700, 10), 3970);
  assert.equal(computeCommissionCents(1999, 10), 199);
});

test("valor invalido nao gera comissao", () => {
  assert.equal(computeCommissionCents(0, 10), 0);
  assert.equal(computeCommissionCents(-500, 10), 0);
  assert.equal(computeCommissionCents(9700, 0), 0);
  assert.equal(computeCommissionCents(NaN, 10), 0);
});

test("carencia de 7 dias corridos antes da liberacao", () => {
  const paid = new Date("2026-11-11T12:00:00Z");
  const release = computeReleaseAt(paid, 7);
  assert.equal(release.toISOString(), "2026-11-18T12:00:00.000Z");
  assert.equal(isReleased(release, new Date("2026-11-18T11:59:59Z")), false);
  assert.equal(isReleased(release, new Date("2026-11-18T12:00:00Z")), true);
});

test("normalizeCode limpa e padroniza", () => {
  assert.equal(normalizeCode("  joao silva!! "), "JOAOSILVA");
  assert.equal(normalizeCode("abc_123-x"), "ABC_123-X");
});

import { suggestCode } from "../affiliates";

test("suggestCode gera codigo valido a partir do nome", () => {
  assert.equal(suggestCode("Maria Souza"), "MARIASOUZA");
  assert.equal(suggestCode("João da Conceição"), "JOAODACONCEICAO");
  assert.equal(suggestCode("A"), "PARCEIRO");
  assert.equal(suggestCode(""), "PARCEIRO");
});
