import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comprasDaLinha, valorDasComprasDaLinha, valorDaAcao, TIPOS_DE_COMPRA } from "../metaActionTypes";

/**
 * Achado real (24/10, campanha 804 da Shadia Hasan).
 *
 * O relatorio mostrava 0 compras. A causa principal era no site do cliente
 * (nenhum evento Purchase saia de la), mas havia uma segunda causa AQUI: a
 * leitura procurava `action_type === "purchase"`, e compra de site chega como
 * `offsite_conversion.fb_pixel_purchase` ou `omni_purchase`.
 *
 * Sem esta correcao, o cliente faria todo o trabalho no site, a Meta passaria
 * a registrar as compras, e o painel continuaria em zero.
 */

test("compra de site e lida pelo tipo que a Meta devolve de verdade", () => {
  const insights = {
    actions: [
      { action_type: "link_click", value: "9" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
    ],
    action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "59.70" }],
  };
  assert.equal(comprasDaLinha(insights), 3);
  assert.equal(valorDasComprasDaLinha(insights), 59.7);
});

test("o tipo antigo continua sendo lido, pra nao perder o que ja estava gravado", () => {
  const insights = {
    actions: [{ action_type: "purchase", value: "2" }],
    action_values: [{ action_type: "purchase", value: "39.80" }],
  };
  assert.equal(comprasDaLinha(insights), 2);
  assert.equal(valorDasComprasDaLinha(insights), 39.8);
});

test("site vence omni quando os dois vem, e NAO soma", () => {
  // `omni_purchase` ja inclui a compra de site. Somar contaria a mesma venda
  // duas vezes e dobraria o ROAS.
  const insights = {
    actions: [
      { action_type: "omni_purchase", value: "5" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
    ],
    action_values: [
      { action_type: "omni_purchase", value: "99.50" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "59.70" },
    ],
  };
  assert.equal(comprasDaLinha(insights), 3, "a preferencia e o escopo de site");
  assert.equal(valorDasComprasDaLinha(insights), 59.7, "valor no MESMO escopo da contagem");
});

test("omni sozinho e usado quando nao ha evento de site", () => {
  const insights = {
    actions: [{ action_type: "omni_purchase", value: "4" }],
    action_values: [{ action_type: "omni_purchase", value: "80.00" }],
  };
  assert.equal(comprasDaLinha(insights), 4);
  assert.equal(valorDasComprasDaLinha(insights), 80);
});

test("contagem e valor ficam no mesmo escopo mesmo com action_values desalinhado", () => {
  // Conta por site; se o valor de site nao vier, nao pega o de omni no lugar:
  // ticket medio errado e pior que valor zero, porque parece certo.
  const insights = {
    actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }],
    action_values: [{ action_type: "omni_purchase", value: "500.00" }],
  };
  assert.equal(comprasDaLinha(insights), 3);
  assert.equal(valorDasComprasDaLinha(insights), 0);
});

test("ausencia de compra devolve zero, sem lancar", () => {
  assert.equal(comprasDaLinha({ actions: [{ action_type: "link_click", value: "9" }] }), 0);
  assert.equal(comprasDaLinha({}), 0);
  assert.equal(comprasDaLinha(null), 0);
  assert.equal(valorDasComprasDaLinha({ actions: null, action_values: "nao e array" }), 0);
});

test("valor nao numerico nao virar NaN no ROAS", () => {
  // NaN propaga pro score e pro grafico sem avisar.
  const r = valorDaAcao([{ action_type: "purchase", value: "abc" }]);
  assert.equal(r, 0);
  assert.ok(Number.isFinite(r));
});

test("a ordem de preferencia e site, omni, legado", () => {
  assert.deepEqual([...TIPOS_DE_COMPRA], [
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "purchase",
  ]);
});

test("o router nao le mais purchase por igualdade crua", () => {
  // Teste de FONTE: a regressao aqui e alguem voltar a comparar a string.
  const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ROTA, /action_type === "purchase"/, "use comprasDaLinha/valorDasComprasDaLinha");
  assert.match(ROTA, /comprasDaLinha\(/);
});
