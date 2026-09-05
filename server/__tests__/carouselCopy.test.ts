import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignFacts, validateCampaignFactIntegrity } from "../campaignFactGuard";
import { buildRealEstateCarouselAngles } from "../carouselCopy";
import { classifyCampaignPhoto } from "../campaignPhotoClassification";
import { detectSegmentFromNiche } from "../../shared/segmentConfig";
import { getCarouselEditorialIssues, getCreativeEditorialIssues, hasInternalCopyLanguage, isWeakGeneratedCopy, trimCopyField } from "../../shared/campaignCopyQuality";
import { evaluateCampaignQualityGates } from "../../shared/campaignQualityGate";
import { syncCreativeTextToV2 } from "../../shared/campaignCreative.sync";

const profile = {
  companyName: "Morebem Imóveis",
  niche: "Imobiliária",
  city: "Balneário Camboriú",
  productService: "Locação de sala comercial de 50 m² na Rua 902, nº 144 por R$ 5.000 mensais, tudo incluso.",
  productDifferentials: "Dois aparelhos de ar-condicionado, pé-direito alto.",
  targetAudience: "Atividades comerciais e profissionais de segmentos diversos.",
  whatsapp: "47999999999",
};
const input = {
  name: "Sala comercial Rua 902",
  extraContext: profile.productService + " " + profile.productDifferentials,
  objective: "leads",
  platform: "meta",
  budget: 675,
  duration: 30,
  mediaFormat: "carousel",
};
const facts = buildCampaignFacts({ input, clientProfile: profile, segment: "imoveis_locacao" });

test("rental fallback supplies ten distinct finished messages and passes facts plus editorial gates", () => {
  const cards = buildRealEstateCarouselAngles(facts, profile.city);
  const creatives = cards.map((card, index) => syncCreativeTextToV2({
    ...card,
    bodyText: card.copy,
    shortDescription: card.description,
    feedImageUrl: "https://res.cloudinary.com/test/image/upload/room-" + index + ".jpg",
  }));
  assert.equal(cards.length, 10);
  assert.equal(new Set(cards.map((card) => card.headline)).size, 10);
  assert.equal(new Set(cards.map((card) => card.description)).size, 10);
  for (const card of cards) {
    assert.ok(card.headline.length >= 8 && card.headline.length <= 40);
    assert.ok(card.description.length >= 4 && card.description.length <= 30);
    assert.ok(card.copy.length >= 80);
    assert.equal(card.cta, "Agendar visita");
    assert.doesNotMatch(card.copy, /clínica|consultório|escritório|salão|studio/i);
  }
  assert.match(cards[0].copy, /50 m²/);
  assert.match(cards[0].copy, /Rua 902, nº 144/);
  assert.match(cards[3].copy, /R\$ 5\.000/);
  assert.match(cards[2].copy, /ar-condicionado/);
  assert.deepEqual(getCarouselEditorialIssues(creatives), []);
  const validation = validateCampaignFactIntegrity(creatives, facts);
  assert.equal(validation.status, "passed", JSON.stringify(validation.conflicts));
  const gate = evaluateCampaignQualityGates({
    ...input, creatives, factValidationStatus: validation.status,
    mediaUrls: creatives.map((creative) => creative.feedImageUrl!),
  }, profile);
  assert.equal(gate.blockedGates.length, 0, JSON.stringify(gate.blockedGates));
  assert.equal(creatives[0].creativeSystemV2?.copyBank.bodies[0]?.text, cards[0].copy);
});

test("missing facts do not become invented rent, area or property features", () => {
  const sparse = buildCampaignFacts({ input: { name: "Sala comercial" }, clientProfile: { productService: "Sala comercial" } });
  const cards = buildRealEstateCarouselAngles(sparse);
  const content = cards.map((card) => card.copy).join(" ");
  assert.doesNotMatch(content, /R\$|50|locação|ar-condicionado|massoterapia|clínica/i);
  assert.deepEqual(getCarouselEditorialIssues(cards), []);
  assert.equal(validateCampaignFactIntegrity(cards, sparse).status, "passed");
});

test("preserves short factual headlines and descriptions", () => {
  assert.equal(isWeakGeneratedCopy("Sala climatizada", "headline"), false);
  assert.equal(isWeakGeneratedCopy("50 m²", "description"), false);
  assert.equal(isWeakGeneratedCopy("Rua 902, nº 144", "headline"), false);
  assert.equal(isWeakGeneratedCopy("Saiba mais", "headline"), true);
  assert.equal(isWeakGeneratedCopy("Localização informada", "headline"), true);
  assert.equal(isWeakGeneratedCopy("Condição para decidir", "headline"), true);
});

test("field limits never cut a word or a price in half", () => {
  assert.equal(trimCopyField("dois aparelhos de ar-condicionado, pe-direito alto", 40), "dois aparelhos de ar-condicionado");
  assert.equal(trimCopyField("Aluguel: R$ 5.000,00", 16), "Aluguel");
  assert.equal(trimCopyField("Sala com 50 m²", 12), "Sala");
  assert.equal(trimCopyField("Rua 902, nº 144", 40), "Rua 902, nº 144");
});

test("rejects the internal phrases found in campaign 746, including a nested V2 bank", () => {
  const bad = [
    "A foto real orienta o ângulo deste card e sustenta uma mensagem objetiva para avançar a conversa.",
    "Card de abertura: sala comercial para locação.",
    "Este card destaca a localização sem acrescentar promessas externas.",
    "O briefing confirma: dois aparelhos de ar-condicionado.",
    "Todos os pontos seguem o briefing atual, sem herdar dados de campanhas anteriores.",
  ];
  assert.ok(bad.every(hasInternalCopyLanguage));
  const creative = { headline: "Sala comercial para locação", copy: "Conheça a sala e agende sua visita.", creativeSystemV2: { copyBank: { bodies: [{ text: bad[0] }] } } };
  assert.ok(getCreativeEditorialIssues(creative).length);
  const report = evaluateCampaignQualityGates({ ...input, mediaFormat: "image", creatives: [creative] }, profile);
  assert.ok(report.blockedGates.flatMap((gate) => gate.blockingIssues).some((issue) => issue.field === "creative_editorial_quality"));
});

test("keeps operational metadata separate from clean public copy", () => {
  assert.deepEqual(getCreativeEditorialIssues({
    headline: "Sala para sua atividade",
    copy: "Veja as fotos reais e agende sua visita para conhecer o espaço.",
    photoCopyAngle: "Este card deve seguir o briefing.",
  }), []);
  assert.equal(hasInternalCopyLanguage("Consulte nosso cardápio e faça seu pedido."), false);
});

test("blocks identical long openings even when the card titles and endings differ", () => {
  const cards = Array.from({ length: 4 }, (_, index) => ({
    headline: "Uma chamada diferente " + index,
    copy: "Uma mensagem de abertura longa que se repete em todas as fotos deste anúncio. Detalhe " + index,
  }));
  assert.ok(getCarouselEditorialIssues(cards).some((issue) => /mesma abertura/.test(issue)));
});

test("real estate rental takes priority over broad property and amenity words", () => {
  assert.equal(detectSegmentFromNiche("Imobiliária: locação de sala comercial"), "imoveis_locacao");
  assert.equal(detectSegmentFromNiche("Apartamento para locacao com academia no condominio"), "imoveis_locacao");
  assert.equal(detectSegmentFromNiche("Apartamento à venda"), "imoveis_venda");
});

test("lookalike and carousel in briefing do not classify a room as fashion or automotive", () => {
  const hint = "Sala comercial para locação, carrossel sem lookalike, público aberto";
  assert.equal(classifyCampaignPhoto({ labels: ["Interior", "Living room"] }, 0, 4, hint).role, "living_space");
  assert.equal(classifyCampaignPhoto({}, 1, 4, hint).role, "supporting_detail");
  assert.equal(classifyCampaignPhoto({}, 0, 4, "carrossel sem lookalike").role, "hero_general");
});

test("business context keeps a property bedroom or kitchen in the property narrative", () => {
  assert.equal(classifyCampaignPhoto({ labels: ["Bedroom", "Room", "Clothing"] }, 1, 4, "Apartamento para locação").role, "private_suite");
  assert.equal(classifyCampaignPhoto({ labels: ["Kitchen", "Food"] }, 2, 4, "Apartamento para locação").role, "main_living_gourmet");
});

test("fashion and food still use their own visual classification", () => {
  assert.equal(classifyCampaignPhoto({ labels: ["Dress"] }, 0, 4).role, "look_hero");
  assert.equal(classifyCampaignPhoto({ labels: ["Chocolate", "Box"] }, 0, 4, "doceria").role, "package_proof");
});
