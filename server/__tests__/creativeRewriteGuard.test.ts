import test from "node:test";
import assert from "node:assert/strict";
import { acceptCreativeRewrite, parseCreativeRewrite, creativeRewriteFeedback, CREATIVE_REWRITE_RESPONSE_SCHEMA } from "../creativeRewriteGuard";
import { buildCampaignFacts, formatCampaignFactsForPrompt } from "../campaignFactGuard";

const facts = buildCampaignFacts({ input: {}, clientProfile: {}, segment: "alimentacao" });
const clean = { headline: "Conheca os doces", description: "Converse sobre seu pedido", copy: "Fale com a equipe para consultar os doces e fazer seu pedido.", hook: "Doces para sua mesa", cta: "Saiba mais" };

test("provider schema includes pain repair after integrating upstream changes", () => {
  assert.ok(CREATIVE_REWRITE_RESPONSE_SCHEMA.required.includes("pain"));
  assert.equal(CREATIVE_REWRITE_RESPONSE_SCHEMA.properties.pain.type, "STRING");
});

test("rewrite errors identify the offending field and never echo provider secrets", () => {
  assert.throws(() => acceptCreativeRewrite(clean, { ...clean, description: "a".repeat(31) }, facts), /description.*30/);
  assert.match(creativeRewriteFeedback(new Error("rewrite_invalid_schema: description: max 30")), /description: max 30/);
  assert.doesNotMatch(creativeRewriteFeedback(new Error("provider secret sk-private")), /sk-private/);
  assert.deepEqual(parseCreativeRewrite("```json\n" + JSON.stringify(clean) + "\n```"), clean);
  assert.throws(() => parseCreativeRewrite('{"headline":"unfinished'), /rewrite_invalid_json/);
});

test("segment audit is recomputed after repair without bypassing fresh conflicts", () => {
  const old = { ...clean, segmentAlignmentIssues: ["campaign_segment_conflict"], photoOriginalIndex: 2 };
  assert.throws(() => acceptCreativeRewrite(old, clean, facts), /rewrite_fact_conflict/);
  const repaired = acceptCreativeRewrite(old, clean, facts, () => []);
  assert.deepEqual(repaired.segmentAlignmentIssues, []);
  assert.equal(repaired.photoOriginalIndex, 2);
  assert.deepEqual(old.segmentAlignmentIssues, ["campaign_segment_conflict"]);
  assert.throws(() => acceptCreativeRewrite(old, clean, facts, () => ["campaign_segment_conflict"]), /rewrite_fact_conflict/);
});

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

// Achado real (log de produção, 19/09): "pain" nunca fazia parte do que o
// modelo era autorizado a reescrever (só headline/description/copy/hook/
// cta) — mas o Fact Guard checa o criativo inteiro, incluindo pain. Uma
// violação nesse campo especificamente não tinha como ser corrigida em
// NENHUMA tentativa, sempre falhando (creatives[4].pain:
// unverified_scarcity_or_exclusivity_claim no log real).
test("a violation in pain alone cannot be fixed without pain in the rewrite (documents the original bug)", () => {
  const old = { ...clean, pain: "Encontrar sabores exclusivos para sua festa" };
  // Reescrita "limpa" nos outros 5 campos, mas sem tocar pain — igual o
  // comportamento antigo, quando pain nem existia no schema de reescrita.
  assert.throws(() => acceptCreativeRewrite(old, clean, facts), /rewrite_fact_conflict/);
});

test("pain is now part of the editable fields — a fix there is accepted", () => {
  const old = { ...clean, pain: "Encontrar sabores exclusivos para sua festa" };
  const result = acceptCreativeRewrite(old, { ...clean, pain: "Encontrar sabores certos para sua festa" }, facts);
  assert.equal(result.pain, "Encontrar sabores certos para sua festa");
});

test("pain is optional in the rewrite response — omitting it does not reject an otherwise-clean rewrite", () => {
  // Se pain nao era o problema, o modelo nao deveria ser obrigado a
  // reenviar esse campo pra reescrita ser aceita.
  const result = acceptCreativeRewrite(clean, clean, facts);
  assert.equal(result.pain, undefined);
});

// Achado real (log de producao, 23/09): mesmo bug estrutural do "pain"
// (19/09), agora com "solution" — a solucao que o produto oferece, campo
// real da estrutura do criativo, checado pelo Fact Guard mas fora da
// lista editavel na reescrita. Log real mostrou creatives[3] falhando
// com "unconfirmed_offer_claim" em bodyText, copy, hook, pain E solution
// simultaneamente — as tentativas de reescrita nunca chegaram a corrigir
// nada porque falhavam antes por estourar o limite de headline/description.
test("a violation in solution alone cannot be fixed without solution in the rewrite (documents the original bug)", () => {
  const old = { ...clean, solution: "Oferecemos doces exclusivos para sua festa" };
  // Reescrita "limpa" nos outros campos, mas sem tocar solution — igual o
  // comportamento antigo, quando solution nem existia no schema de reescrita.
  assert.throws(() => acceptCreativeRewrite(old, clean, facts), /rewrite_fact_conflict/);
});

test("solution is now part of the editable fields — a fix there is accepted", () => {
  const old = { ...clean, solution: "Oferecemos doces exclusivos para sua festa" };
  const result = acceptCreativeRewrite(old, { ...clean, solution: "Oferecemos doces variados para sua festa" }, facts);
  assert.equal(result.solution, "Oferecemos doces variados para sua festa");
});

test("solution is optional in the rewrite response — omitting it does not reject an otherwise-clean rewrite", () => {
  const result = acceptCreativeRewrite(clean, clean, facts);
  assert.equal(result.solution, undefined);
});
