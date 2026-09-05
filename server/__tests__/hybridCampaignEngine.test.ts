import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignFromAds, buildBaseTemplate } from "../ai";
import { buildCampaignFacts, validateCampaignFactIntegrity } from "../campaignFactGuard";
import { buildRealEstateCarouselAngles } from "../carouselCopy";
import { isRedundantHookText } from "../../shared/campaignCopyQuality";

// ── Fixture da campanha 747 (sala comercial p/ locação, Rua 902, nº 144) ──
const commercialRentalProfile = {
  companyName: "Morebem Imóveis",
  niche: "Imobiliária",
  city: "Balneário Camboriú",
  productService: "Locação de sala comercial de 50 m² na Rua 902, nº 144 por R$ 5.000 mensais, tudo incluso.",
  productDifferentials: "Dois aparelhos de ar-condicionado, pé-direito alto.",
};
const commercialRentalInput = {
  name: "Sala comercial Rua 902",
  extraContext: commercialRentalProfile.productService + " " + commercialRentalProfile.productDifferentials,
  objective: "leads",
};
const commercialRentalFacts = buildCampaignFacts({
  input: commercialRentalInput,
  clientProfile: commercialRentalProfile,
  segment: "imoveis_locacao",
});

// Requisitos reais pedidos na campanha 747, sistematicamente ignorados
// pelo motor eco antes desta correção.
const requestedBudget = 180;      // R$180 para 30 dias = R$6/dia
const requestedDuration = 30;
const requestedAgeMin = 30;
const requestedAgeMax = 60;

test("real estate segment routes through buildRealEstateCarouselAngles, not the generic hybrid templates", async () => {
  const result = await buildCampaignFromAds(101, "leads", commercialRentalProfile, [], {
    desiredCreatives: 4,
    requestedBudget,
    campaignDurationDays: requestedDuration,
    ageMin: requestedAgeMin,
    ageMax: requestedAgeMax,
    isRealEstate: true,
    campaignFacts: commercialRentalFacts,
  });

  const expectedAngles = buildRealEstateCarouselAngles(commercialRentalFacts, commercialRentalProfile.city).slice(0, 4);
  assert.deepEqual(result.creatives.map((c: any) => c.headline), expectedAngles.map((a) => a.headline));
  assert.deepEqual(result.creatives.map((c: any) => c.hook), expectedAngles.map((a) => a.hook));

  // Fatos canônicos: sem casa própria/moradia, sem escassez ou exclusividade
  // inventadas (achado real, campanha 747).
  const validation = validateCampaignFactIntegrity(result.creatives, commercialRentalFacts);
  assert.equal(validation.status, "passed", JSON.stringify(validation.conflicts));
});

test("preserves the requested audience and budget instead of hardcoded defaults", async () => {
  const result = await buildCampaignFromAds(101, "leads", commercialRentalProfile, [], {
    desiredCreatives: 4,
    requestedBudget,
    campaignDurationDays: requestedDuration,
    ageMin: requestedAgeMin,
    ageMax: requestedAgeMax,
    isRealEstate: true,
    campaignFacts: commercialRentalFacts,
  });

  for (const creative of result.creatives) {
    assert.equal(creative.targetAudience, "30-60 anos");
    assert.ok(!/25-50/.test(creative.targetAudience));
    assert.equal(creative.duration, requestedDuration);
  }
  for (const adSet of result.adSets) {
    assert.ok(!/lookalike/i.test(adSet.audience), `lookalike não configurado não deveria aparecer: ${adSet.audience}`);
    assert.ok(adSet.audience.includes("30-60") || !/\d{2}-\d{2}\s+anos/.test(adSet.audience));
  }
  // Orçamento pedido nunca é substituído por um piso interno (achado real:
  // R$180/30 dias virava R$675/mês).
  const totalCreativeBudget = result.creatives.reduce((sum: number, c: any) => sum + c.budget, 0);
  assert.ok(totalCreativeBudget <= requestedBudget, `orçamento dos criativos (${totalCreativeBudget}) não deveria exceder o pedido (${requestedBudget})`);
});

test("ad set budget split always sums to 100%, regardless of objective", async () => {
  for (const objective of ["leads", "sales", "traffic", "engagement", "branding"]) {
    const result = await buildCampaignFromAds(101, objective, commercialRentalProfile, [], {
      desiredCreatives: 4,
      requestedBudget,
      campaignDurationDays: requestedDuration,
      ageMin: requestedAgeMin,
      ageMax: requestedAgeMax,
      isRealEstate: true,
      campaignFacts: commercialRentalFacts,
    });
    const sum = result.adSets.reduce((acc: number, s: any) => acc + parseInt(s.budget, 10), 0);
    assert.equal(sum, 100, `objetivo ${objective}: soma dos ad sets foi ${sum}%, esperado 100%`);
  }
});

test("non-real-estate hybrid creatives never repeat the headline as the hook", async () => {
  const result = await buildCampaignFromAds(101, "leads", {
    companyName: "Doceria da Ana",
    niche: "Confeitaria",
    productService: "Bolos e doces personalizados",
  }, [], {
    desiredCreatives: 4,
    requestedBudget: 300,
    campaignDurationDays: 30,
    ageMin: 18,
    ageMax: 65,
  });

  for (const creative of result.creatives) {
    assert.ok(!isRedundantHookText(creative.headline, creative.hook),
      `hook igual à headline: "${creative.headline}" / "${creative.hook}"`);
    assert.equal(creative.targetAudience, "18-65 anos");
  }
});

// ── buildBaseTemplate (fallback do endpoint standalone hybridGenerate, sem
// acesso a campaignFacts) — defesa em profundidade contra as mesmas
// alegações não verificadas encontradas na campanha 747.
test("buildBaseTemplate real estate templates no longer invent scarcity or homeownership claims", () => {
  const vars = { empresa: "Morebem Imóveis", produto: "sala comercial", publico: "público aberto" };
  for (const tone of ["urgent", "emotional", "rational", "premium"] as const) {
    const tpl = buildBaseTemplate("imoveis", tone, vars);
    const combined = `${tpl.headline} ${tpl.body}`;
    assert.doesNotMatch(combined, /última unidade|últimas unidades/i, `tom ${tone}: ${combined}`);
    assert.doesNotMatch(combined, /casa própria|o lar que você sempre sonhou/i, `tom ${tone}: ${combined}`);
    assert.doesNotMatch(combined, /exclusivo|alto padrão/i, `tom ${tone}: ${combined}`);
  }
});
