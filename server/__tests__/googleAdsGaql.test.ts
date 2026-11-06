import test from "node:test";
import assert from "node:assert/strict";
import { prepararGaql, limitarResposta } from "../googleAdsGaql";

test("prepararGaql aceita SELECT e acrescenta LIMIT", () => {
  assert.deepEqual(prepararGaql("SELECT campaign.id FROM campaign"), { query: "SELECT campaign.id FROM campaign LIMIT 50" });
  assert.deepEqual(prepararGaql("  select a\n from b limit 10 "), { query: "select a from b limit 10" });
});
test("prepararGaql limita LIMIT alto", () => {
  assert.deepEqual(prepararGaql("SELECT a FROM b LIMIT 9999"), { query: "SELECT a FROM b LIMIT 200" });
});
test("prepararGaql recusa o que nao e uma unica leitura", () => {
  for (const q of ["", "UPDATE x", "SELECT a FROM b; SELECT c FROM d", "SELECT a", "SELECT a FROM b LIMIT 5 ORDER BY a", "x".repeat(2100)]) {
    assert.ok("erro" in prepararGaql(q), q.slice(0, 30));
  }
});
test("limitarResposta corta pelo tamanho", () => {
  const r = limitarResposta([{ a: "x".repeat(50) }, { a: "y".repeat(50) }], 80);
  assert.equal(r.cortada, true); assert.equal(r.linhas.length, 1);
  assert.equal(limitarResposta([{ a: 1 }]).cortada, false);
});
