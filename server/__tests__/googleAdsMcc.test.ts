import test from "node:test";
import assert from "node:assert/strict";
import { resolverConfigMcc, urlAutorizacaoMcc, mccEstaNaLista, normalizarCustomerId, lerConfigMcc, operacaoConvite, gaqlVinculo, interpretarVinculo, decidirPosse, urlConvite } from "../googleAdsMcc";

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

test("resolverConfigMcc: ambiente vence o banco", () => {
  assert.deepEqual(resolverConfigMcc({}, { google_mcc_customer_id: "3856992760", google_mcc_refresh_token: "db" }), { config: { customerId: "3856992760", refreshToken: "db" } });
  assert.deepEqual(resolverConfigMcc({ GOOGLE_MCC_REFRESH_TOKEN: "env" }, { google_mcc_customer_id: "3856992760", google_mcc_refresh_token: "db" }), { config: { customerId: "3856992760", refreshToken: "env" } });
  assert.ok("erro" in resolverConfigMcc({}, {}));
});
test("urlAutorizacaoMcc pede escopo adwords e refresh token", () => {
  const u = new URL(urlAutorizacaoMcc("cid", "https://x/cb", "st"));
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/adwords");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
});
test("mccEstaNaLista", () => {
  assert.equal(mccEstaNaLista(["customers/3856992760", "customers/1"], "3856992760"), true);
  assert.equal(mccEstaNaLista(["customers/1"], "3856992760"), false);
});
