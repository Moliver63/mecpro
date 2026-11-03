import test from "node:test";
import assert from "node:assert/strict";
import { montarUrlAutorizacaoAds, criarStateAds, stateAdsValido, lerRespostaTokenAds, trocarAuthCode } from "../tiktokMarketingAuth";

test("monta a URL de autorizacao", () => {
  const u = new URL(montarUrlAutorizacaoAds("123", "https://x.com/auth/tiktok/callback", "s"));
  assert.equal(u.origin + u.pathname, "https://business-api.tiktok.com/portal/auth");
  assert.equal(u.searchParams.get("app_id"), "123");
  assert.equal(u.searchParams.get("redirect_uri"), "https://x.com/auth/tiktok/callback");
});

test("state: so do mesmo usuario e recente", () => {
  const s = criarStateAds(7, 1000);
  assert.equal(stateAdsValido(s, 7, 2000), true);
  assert.equal(stateAdsValido(s, 8, 2000), false);
  assert.equal(stateAdsValido(s, 7, 1000 + 31 * 60 * 1000), false);
  assert.equal(stateAdsValido("lixo", 7), false);
});

test("le resposta completa", () => {
  const r = lerRespostaTokenAds({ code: 0, data: { access_token: "tk", refresh_token: "rf", expires_in: 100, advertiser_ids: ["11", 22, "11", "x"] } }, 0);
  assert.equal(r.accessToken, "tk");
  assert.equal(r.refreshToken, "rf");
  assert.equal(r.expiraEm?.getTime(), 100000);
  assert.deepEqual(r.advertiserIds, ["11", "22"]);
});

test("tolera ausencia de refresh e expiracao", () => {
  const r = lerRespostaTokenAds({ code: 0, data: { access_token: "tk", advertiser_ids: ["5"] } });
  assert.equal(r.refreshToken, undefined);
  assert.equal(r.expiraEm, undefined);
});

test("erro do TikTok e resposta sem token viram excecao", () => {
  assert.throws(() => lerRespostaTokenAds({ code: 40100, message: "invalid auth_code" }), /invalid auth_code/);
  assert.throws(() => lerRespostaTokenAds({ code: 0, data: {} }), /access token/);
});

test("troca o code enviando app_id, secret e auth_code", async () => {
  const chamadas: any[] = [];
  const f: any = async (_u: string, init: any) => { chamadas.push(init); return { status: 200, json: async () => ({ code: 0, data: { access_token: "a", advertiser_ids: ["9"] } }) }; };
  const r = await trocarAuthCode("AC", { appId: "app", secret: "sec" }, f);
  assert.deepEqual(JSON.parse(chamadas[0].body), { app_id: "app", secret: "sec", auth_code: "AC" });
  assert.deepEqual(r.advertiserIds, ["9"]);
  await assert.rejects(trocarAuthCode("AC", { appId: "", secret: "" }, f), /nao configurado/);
});
