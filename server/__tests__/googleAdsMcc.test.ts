import test from "node:test";
import assert from "node:assert/strict";
import { normalizarCustomerId, lerConfigMcc, operacaoConvite, gaqlVinculo, interpretarVinculo, decidirPosse, urlConvite } from "../googleAdsMcc";

test("normalizarCustomerId aceita 10 digitos com ou sem traco", () => {
  assert.equal(normalizarCustomerId("418-018-4854"), "4180184854");
  assert.equal(normalizarCustomerId("4180184854"), "4180184854");
  assert.equal(normalizarCustomerId("123"), null);
  assert.equal(normalizarCustomerId("1'; DROP"), null);
});
test("lerConfigMcc exige id e token", () => {
  assert.ok("erro" in lerConfigMcc({}));
  assert.ok("erro" in lerConfigMcc({ GOOGLE_MCC_CUSTOMER_ID: "385-699-2760" }));
  assert.deepEqual(lerConfigMcc({ GOOGLE_MCC_CUSTOMER_ID: "385-699-2760", GOOGLE_MCC_REFRESH_TOKEN: "1//x" }), { config: { customerId: "3856992760", refreshToken: "1//x" } });
});
test("operacaoConvite e gaqlVinculo usam o id normalizado", () => {
  assert.deepEqual(operacaoConvite("4180184854"), { operation: { create: { clientCustomer: "customers/4180184854", status: "PENDING" } } });
  assert.match(gaqlVinculo("4180184854"), /client_customer = 'customers\/4180184854'/);
  assert.match(urlConvite("3856992760"), /customers\/3856992760\/customerClientLinks:mutate$/);
});
test("interpretarVinculo", () => {
  assert.equal(interpretarVinculo([]), "NENHUM");
  assert.equal(interpretarVinculo([{ customerClientLink: { status: "PENDING" } }]), "PENDENTE");
  assert.equal(interpretarVinculo([{ customerClientLink: { status: "CANCELED" } }, { customerClientLink: { status: "ACTIVE" } }]), "ATIVO");
  assert.equal(interpretarVinculo([{ customer_client_link: { status: "REJECTED" } }]), "RECUSADO");
  assert.equal(interpretarVinculo([{ customerClientLink: { status: "XYZ" } }]), "OUTRO");
});
test("decidirPosse impede conta de outro usuario", () => {
  assert.equal(decidirPosse(null, 2), "criar");
  assert.equal(decidirPosse(2, 2), "ja_meu");
  assert.equal(decidirPosse(7, 2), "de_outro");
});
