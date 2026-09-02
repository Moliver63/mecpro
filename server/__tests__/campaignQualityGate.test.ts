import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCampaignQualityGates } from "../../shared/campaignQualityGate";

const baseProfile = {
  companyName: "Morebem Imoveis",
  niche: "imoveis",
  productName: "Sala comercial Rua 902",
  productService: "Locacao de sala comercial de 50 m2 na Rua 902 por R$ 5.000 mensais, tudo incluso",
  targetAudience: "Profissionais de saude, estetica e bem-estar",
  whatsapp: "47999465824",
};

test("blocks publish without explicit Meta confirmation", () => {
  const report = evaluateCampaignQualityGates(
    {
      action: "publish",
      objective: "sales",
      platform: "meta",
      budget: 300,
      duration: 10,
      mediaFormat: "carousel",
      uploadedImages: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      creativesCount: 2,
      factValidationStatus: "passed",
    },
    baseProfile,
    { name: "Morebem - sala comercial" },
  );

  assert.equal(report.status, "blocked");
  assert.ok(report.blockedGates.some((gate) => gate.id === "publish"));
  assert.ok(report.questions.some((question) => /confirma publicar/i.test(question)));
});

test("blocks carousel when there are not enough media items", () => {
  const report = evaluateCampaignQualityGates(
    {
      action: "media",
      objective: "leads",
      platform: "meta",
      budget: 300,
      duration: 10,
      mediaFormat: "carousel",
      uploadedImages: ["https://example.com/1.jpg"],
    },
    baseProfile,
    { name: "Morebem - sala comercial" },
  );

  assert.equal(report.status, "blocked");
  assert.ok(report.blockedGates.some((gate) => gate.id === "media"));
  assert.ok(report.questions.some((question) => /pelo menos 2/i.test(question)));
});

test("blocks repeated carousel cards without usable media", () => {
  const repeatedCreatives = Array.from({ length: 5 }, () => ({
    headline: "Espaco Comercial 50m2 - Rua 902",
    copy: "Otimize sua operacao em 50 m2 estrategicamente localizados na Rua 902. Ideal para negocios que buscam eficiencia e visibilidade.",
    imageUrl: "https://example.com/placeholder.jpg",
  }));
  const report = evaluateCampaignQualityGates(
    {
      action: "generate",
      objective: "leads",
      platform: "meta",
      budget: 675,
      duration: 30,
      mediaFormat: "carousel",
      creatives: repeatedCreatives,
      creativesCount: repeatedCreatives.length,
      factValidationStatus: "passed",
      extraContext: "Locacao de sala comercial de 50 m2 na Rua 902, nº 144 por R$ 5.000 mensais, tudo incluso",
    },
    {
      ...baseProfile,
      productService: "Locacao de sala comercial de 50 m2 na Rua 902, nº 144 por R$ 5.000 mensais, tudo incluso",
      uniqueValueProposition: "Sala pronta para atendimento profissional",
      productDifferentials: "Dois aparelhos de ar-condicionado, pe-direito alto e estrutura para massoterapia",
    },
    { name: "Morebem - sala comercial" },
  );

  assert.equal(report.status, "blocked");
  assert.ok(report.questions.some((question) => /headlines e copies realmente diferentes/i.test(question)));
  assert.ok(report.questions.some((question) => /imagem ou video real/i.test(question)));
});

test("asks food-specific questions for sweets campaign", () => {
  const report = evaluateCampaignQualityGates(
    {
      action: "generate",
      objective: "leads",
      platform: "meta",
      budget: 250,
      duration: 10,
      extraContext: "Campanha de doces e brigadeiros para encomenda",
    },
    {
      companyName: "Grakau Delicias",
      niche: "venda de doces",
      productName: "Brigadeiros",
      productService: "Doces para encomenda",
      targetAudience: "Pessoas que compram doces para festas",
      whatsapp: "47999999999",
    },
  );

  assert.notEqual(report.status, "blocked");
  assert.ok(report.questions.some((question) => /sabores|formatos|diferenciais/i.test(question)));
  assert.ok(!report.questions.some((question) => /imovel|locacao anual|temporada|lancamento/i.test(question)));
});

test("passes quality gates for ready campaign generation", () => {
  const report = evaluateCampaignQualityGates(
    {
      action: "generate",
      objective: "sales",
      platform: "meta",
      budget: 500,
      duration: 10,
      mediaFormat: "image",
      uploadedImages: ["https://example.com/sala.jpg"],
      extraContext: "Locacao de sala comercial de 50 m2 na Rua 902 por R$ 5.000 mensais, tudo incluso",
    },
    {
      ...baseProfile,
      uniqueValueProposition: "Sala pronta para atendimento profissional",
      productDifferentials: "Dois aparelhos de ar-condicionado, pe-direito alto e estrutura para massoterapia",
      mainPain: "Profissionais precisam de sala bem localizada",
      desiredTransformation: "Atender clientes em uma sala pronta e bem localizada",
      mainObjections: "Valor mensal e estrutura inclusa",
      productPrice: "R$ 5.000 mensais, tudo incluso",
    },
    { name: "Morebem - sala comercial" },
  );

  assert.equal(report.status, "passed");
  assert.equal(report.blockedGates.length, 0);
});
