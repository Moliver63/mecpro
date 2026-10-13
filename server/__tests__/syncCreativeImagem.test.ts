import test from "node:test";
import assert from "node:assert/strict";
import { syncCreativeImageToV2, ensureCreativeSystemV2 } from "../../shared/campaignCreative.sync";

const URL_OK = "https://res.cloudinary.com/dpmnxbbbx/image/upload/c_lfill,g_auto,ar_4:5,w_1080/v1/mecpro/a.jpg";

// Achado por auditoria (13/10): este e o ULTIMO passo do caminho de imagem — o
// que grava a URL aprovada no criativo — e ele NUNCA executou em producao,
// porque em dez dias nenhuma imagem foi aprovada. `ensureCreativeSystemV2`
// garantia canal Meta e projecao legada, mas nao o assetLibrary, usado sem
// protecao em syncCreativeImageToV2.
test("creativeSystemV2 parcial, sem assetLibrary, nao estoura", () => {
  const criativo: any = {
    headline: "Autoconhecimento",
    // Formato antigo/parcial: tem o v2 mas sem assetLibrary.
    creativeSystemV2: { version: 1, updatedAt: "2026-09-01T00:00:00.000Z" },
  };
  assert.doesNotThrow(() => syncCreativeImageToV2(criativo, "feed", { imageUrl: URL_OK, imageHash: null }));
  const saida: any = syncCreativeImageToV2(criativo, "feed", { imageUrl: URL_OK, imageHash: null });
  assert.equal(saida.creativeSystemV2.assetLibrary.assets.length, 1);
  assert.equal(saida.creativeSystemV2.assetLibrary.assets[0].url, URL_OK);
});

test("assets nao-array tambem e normalizado", () => {
  for (const quebrado of [{ assets: null }, { assets: "nada" }, {}]) {
    const criativo: any = { creativeSystemV2: { assetLibrary: quebrado } };
    assert.doesNotThrow(() => syncCreativeImageToV2(criativo, "stories", { imageUrl: URL_OK }));
  }
  const vazio: any = {};
  assert.deepEqual(ensureCreativeSystemV2(vazio).assetLibrary.assets, []);
});

// A metade que protege: o campo legado que o resto do sistema le continua
// sendo preenchido, e o caminho normal nao regride.
test("grava a URL nos tres formatos, no legado e no v2", () => {
  const caso = [
    ["feed", "feedImageUrl", "4:5"],
    ["stories", "storyImageUrl", "9:16"],
    ["square", "squareImageUrl", "1:1"],
  ] as const;
  for (const [formato, campoLegado, proporcao] of caso) {
    const criativo: any = { headline: "x", [campoLegado]: URL_OK };
    const saida: any = syncCreativeImageToV2(criativo, formato, { imageUrl: URL_OK, imageHash: null });
    assert.equal(saida[campoLegado], URL_OK, `${formato}: campo legado preservado`);
    assert.equal(saida.creativeSystemV2.legacyProjection[campoLegado], URL_OK);
    const asset = saida.creativeSystemV2.assetLibrary.assets.find((a: any) => a.id === `legacy_${formato}_primary`);
    assert.ok(asset, `${formato}: asset criado`);
    assert.equal(asset.aspectRatio, proporcao);
    assert.equal(asset.kind, "image");
  }
});

// Rechamar com a mesma URL nao pode duplicar asset: o worker reaproveita
// candidate_url nas retentativas.
test("reaplicar o mesmo formato atualiza o asset em vez de duplicar", () => {
  let criativo: any = { headline: "x" };
  criativo = syncCreativeImageToV2(criativo, "feed", { imageUrl: URL_OK });
  criativo = syncCreativeImageToV2(criativo, "feed", { imageUrl: URL_OK + "?v=2" });
  const assets = criativo.creativeSystemV2.assetLibrary.assets.filter((a: any) => a.id === "legacy_feed_primary");
  assert.equal(assets.length, 1, "um asset por formato, atualizado");
  assert.equal(assets[0].url, URL_OK + "?v=2");
});
