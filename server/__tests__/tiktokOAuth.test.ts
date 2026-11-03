import test from "node:test";
import assert from "node:assert/strict";
import { escoposTikTok, TIKTOK_ESCOPOS_PADRAO } from "../tiktokOAuth";

test("sem variavel: so os escopos que o app Sandbox tem", () => {
  assert.equal(escoposTikTok(undefined), "user.info.basic,user.info.profile");
  assert.equal(escoposTikTok(""), TIKTOK_ESCOPOS_PADRAO.join(","));
  assert.equal(/video\.list|user\.info\.stats/.test(escoposTikTok(undefined)), false);
});

test("variavel valida amplia os escopos (apos aprovacao em Producao)", () => {
  assert.equal(
    escoposTikTok("user.info.basic, user.info.profile,user.info.stats,video.list"),
    "user.info.basic,user.info.profile,user.info.stats,video.list",
  );
});

test("remove repetidos", () => assert.equal(escoposTikTok("user.info.basic,user.info.basic"), "user.info.basic"));

test("valor com lixo volta ao padrao (nao monta URL de autorizacao quebrada)", () => {
  assert.equal(escoposTikTok("user.info.basic;drop"), TIKTOK_ESCOPOS_PADRAO.join(","));
  assert.equal(escoposTikTok("Basic Profile"), TIKTOK_ESCOPOS_PADRAO.join(","));
});
