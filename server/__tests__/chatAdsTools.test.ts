import { test } from "node:test";
import assert from "node:assert/strict";
import { adsTurn, queryChatAds, publishChatAds } from "../chatAdsTools";

function fixture() {
  let calls = 0;
  let reservation: any;
  const campaign = { id: 12, projectId: 4, name: "Teste", adSets: '[{"budget":50}]' };
  const db = {
    getCampaignById: async () => campaign,
    getProjectById: async () => ({ userId: 1 }),
    getUserById: async () => ({ id: 1 }),
    getCampaignMetricsDaily: async () => [],
    reserveMcpIdempotencyKey: async () => {
      if (reservation) return reservation;
      reservation = { kind: "duplicate_in_progress" };
      return { kind: "proceed", recordId: 1 };
    },
    completeMcpIdempotencyKey: async (_id: number, result: any) => { reservation = { kind: "cached_result", result }; },
    publish: async () => { calls++; return { ok: true }; },
    caller: { unified: { getFullReport: async () => ({ meta: { configured: false } }) } },
  };
  return { db, campaign, calls: () => calls };
}
const options = { campaignId: 12, pageId: "123", linkUrl: "https://example.com" };

test("metrics enforce ownership, period and no-data semantics", async () => {
  const { db } = fixture();
  assert.ok((await queryChatAds("consultar_metricas_campanha", { campaignId: 12 }, 2, db)).erro);
  assert.ok((await queryChatAds("consultar_metricas_campanha", { campaignId: 12, days: 91 }, 1, db)).erro);
  assert.equal((await queryChatAds("consultar_metricas_campanha", { campaignId: 12 }, 1, db)).status, "no_data");
  assert.ok((await queryChatAds("consultar_relatorio_anuncios", { platforms: ["fake"] }, 1, db)).erro);
  const result = await queryChatAds("consultar_relatorio_anuncios", {}, 1, db);
  assert.equal(result.report.meta.configured, false);
});

test("publication requires current exact confirmation and executes once", async () => {
  const f = fixture();
  const preview = await adsTurn.run({ message: "pode publicar" }, () => publishChatAds(1, options, f.db));
  assert.equal(preview.confirmationRequired, true);
  assert.equal(f.calls(), 0);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  await adsTurn.run({ message }, () => Promise.all([publishChatAds(1, options, f.db), publishChatAds(1, options, f.db)]));
  assert.equal(f.calls(), 1);
  await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  assert.equal(f.calls(), 1);
});

test("changed budget invalidates confirmation; foreign campaigns and implicit destinations denied", async () => {
  const f = fixture();
  const preview = await publishChatAds(1, options, f.db);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  f.campaign.adSets = '[{"budget":100}]';
  const result = await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  assert.equal(result.confirmationRequired, true);
  assert.equal((await publishChatAds(2, options, f.db)).ok, false);
  assert.equal((await publishChatAds(1, { ...options, linkUrl: undefined }, f.db)).ok, false);
  assert.equal(f.calls(), 0);
});

test("uncertain publication never reopens reservation", async () => {
  const f = fixture();
  f.db.publish = async () => { throw new Error("network"); };
  const preview = await publishChatAds(1, options, f.db);
  const message = preview.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  const retry = await adsTurn.run({ message }, () => publishChatAds(1, options, f.db));
  assert.match(retry.erro, /ja solicitada/);
});
