import test from "node:test";
import assert from "node:assert/strict";
import { repairCreativeFields, duplicateCreativeFields, creativeTextIssues } from "../creativeRewriteGuard";
import { buildCampaignFacts, validateCampaignFactIntegrity } from "../campaignFactGuard";

const clean = { headline: "Conheca a oferta", description: "Converse com a equipe", copy: "Fale com nossa equipe para conhecer os detalhes da oferta.", hook: "Conheca os detalhes", cta: "Saiba mais", pain: "Escolha com informacao", solution: "Consulte os detalhes" };

for (const segment of ["alimentacao", "imoveis_locacao", "fitness", "financeiro"]) {
  test(`partial repair preserves approved fields and media: ${segment}`, () => {
    const facts = buildCampaignFacts({ input: {}, clientProfile: {}, segment });
    const original = { ...clean, feedImageUrl: "https://example.com/photo.jpg", isFeaturedPhoto: true, photoOriginalIndex: 3 };
    const first = repairCreativeFields(original, { ...clean, headline: "Conheca mais detalhes", description: "a".repeat(31) }, facts);
    assert.deepEqual(first.rejected, ["description"]);
    assert.equal(first.candidate.headline, "Conheca mais detalhes");
    assert.equal(first.candidate.description, original.description);
    const second = repairCreativeFields(first.candidate, { ...clean, headline: "NAO MUDAR", description: "Saiba os detalhes" }, facts, first.rejected);
    assert.equal(second.candidate.headline, first.candidate.headline);
    assert.equal(second.candidate.description, "Saiba os detalhes");
    assert.equal(second.candidate.feedImageUrl, original.feedImageUrl);
    assert.equal(second.candidate.isFeaturedPhoto, true);
    assert.equal(second.candidate.photoOriginalIndex, 3);
    assert.equal(original.headline, clean.headline);
  });
}

test("conflicting field is rejected without discarding a valid sibling", () => {
  const facts = buildCampaignFacts({ input: {}, clientProfile: {}, segment: "alimentacao" });
  const repaired = repairCreativeFields(clean, { ...clean, headline: "Conheca os doces", hook: "Sabores exclusivos" }, facts);
  assert.ok(repaired.rejected.includes("hook"));
  assert.equal(repaired.candidate.headline, "Conheca os doces");
  assert.equal(repaired.candidate.hook, clean.hook);
  assert.throws(() => repairCreativeFields(clean, { ...clean, feedImageUrl: "fake" }, facts));
  const hidden = { ...clean, creativeSystemV2: { copyBank: { bodies: [{ text: "Sabores exclusivos" }] } } };
  const result = repairCreativeFields(hidden, clean, facts);
  assert.notEqual(validateCampaignFactIntegrity([result.candidate], facts).status, "passed");
});

test("length checks and duplicate detection remain blocking", () => {
  assert.ok(creativeTextIssues({ ...clean, copy: "x".repeat(501) }).length);
  assert.deepEqual(duplicateCreativeFields([clean, { ...clean, headline: "Outra chamada", description: " CONVERSE COM A EQUIPE " }], 1), ["description"]);
  assert.deepEqual(duplicateCreativeFields([clean, { ...clean, headline: "Outra chamada", description: "Detalhes da oferta" }], 1), []);
});
