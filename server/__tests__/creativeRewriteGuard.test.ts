import test from "node:test";
import assert from "node:assert/strict";
import { acceptCreativeRewrite } from "../creativeRewriteGuard";
import { buildCampaignFacts, formatCampaignFactsForPrompt } from "../campaignFactGuard";

const facts = buildCampaignFacts({ input: {}, clientProfile: {}, segment: "alimentacao" });
const clean = { headline: "Conheca os doces", description: "Converse sobre seu pedido", copy: "Fale com a equipe para consultar os doces e fazer seu pedido.", hook: "Doces para sua mesa", cta: "Saiba mais" };

test("non-property product price reaches the verified prompt", () => {
  const food = buildCampaignFacts({ input: { productPrice: "R$ 25" }, clientProfile: {}, segment: "alimentacao" });
  assert.ok(food.genericProductPrice);
  assert.ok(formatCampaignFactsForPrompt(food).includes(`Preco do produto/servico: ${food.genericProductPrice}`));
});

test("rejects invented exclusivity, unknown fields and partial responses", () => {
  for (const patch of [{ ...clean, headline: "Sabores exclusivos" }, { ...clean, isFeaturedPhoto: false }, { headline: "Conheca" }, { ...clean, copy: "Peça em [cidade]" }]) {
    assert.throws(() => acceptCreativeRewrite(clean, patch, facts));
  }
});

test("repairs text aliases without changing photos, order or the original", () => {
  const old = { ...clean, copy: "Doces exclusivos", bodyText: "Doces exclusivos", photoOriginalIndex: 3, isFeaturedPhoto: true, feedImageUrl: "https://example.com/photo.jpg", creativeSystemV2: { copyBank: { bodies: [{ id: "body", text: "Doces exclusivos" }] } } };
  const result = acceptCreativeRewrite(old, clean, facts);
  assert.equal(result.bodyText, clean.copy);
  assert.equal(result.creativeSystemV2.copyBank.bodies[0].text, clean.copy);
  assert.equal(result.photoOriginalIndex, 3);
  assert.equal(result.isFeaturedPhoto, true);
  assert.equal(result.feedImageUrl, old.feedImageUrl);
  assert.equal(old.copy, "Doces exclusivos");
});

test("hidden conflicting variants cannot survive a clean primary rewrite", () => {
  const old = { ...clean, creativeSystemV2: { copyBank: { bodies: [{ text: "Sabores exclusivos" }] } } };
  assert.throws(() => acceptCreativeRewrite(old, clean, facts), /rewrite_fact_conflict/);
});

test("CTA is also checked for invented exclusivity", () => {
  assert.throws(() => acceptCreativeRewrite(clean, { ...clean, cta: "Garanta doces exclusivos" }, facts), /rewrite_fact_conflict/);
});
