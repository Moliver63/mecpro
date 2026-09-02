import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignFacts,
  formatCampaignFactsForPrompt,
  validateCampaignFactIntegrity,
} from "../campaignFactGuard";

const morebemInput = {
  name: "Morebem Imoveis - Sala Comercial Rua 902",
  objective: "leads",
  platform: "meta",
  extraContext:
    "Locacao de uma unica sala comercial. Area aproximada total: 50 m². Rua 902, nº 144, Balneario Camboriu. Valor: R$ 5.000 mensais, tudo incluso. Dois aparelhos de ar-condicionado. Pe-direito alto. Estrutura atualmente montada para massoterapia. Publico possivel: profissionais de saude, estetica e bem-estar.",
};

const morebemProfile = {
  companyName: "Morebem Imoveis",
  niche: "imoveis comerciais para locacao",
  productService: "sala comercial para locacao",
  targetAudience: "profissionais de saude, estetica e bem-estar",
};

const previousEduCampaignPattern = {
  headline: "190 m² em tres pavimentos",
  copy: "Cobertura triplex na Praia Brava, 3 suites e locacao anual de alto padrao.",
  cta: "Agendar visita",
};

test("blocks Morebem creative contaminated with Edu triplex facts", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: previousEduCampaignPattern.headline,
      description: "Praia Brava, Itajai",
      copy: previousEduCampaignPattern.copy,
      hook: "Triplex com 190 m²",
      pain: "Encontrar imovel de alto padrao.",
      solution: "3 suites, tres pavimentos e piscina privativa.",
    },
  ], facts);

  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((conflict) => conflict.value.includes("190")));
  assert.ok(validation.conflicts.some((conflict) => /triplex/i.test(conflict.value)));
  assert.ok(validation.conflicts.some((conflict) => /3 su/i.test(conflict.value)));
});

test("passes clean Morebem sala comercial facts", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Sala comercial para locacao",
      description: "50 m² na Rua 902",
      copy: "Sala comercial para locacao em Balneario Camboriu, com 50 m² e valor de R$ 5.000 mensais, tudo incluso.\n\nO espaco conta com dois aparelhos de ar-condicionado, pe-direito alto e estrutura para massoterapia.\n\nFale no WhatsApp para avaliar o espaco.",
      hook: "Sala comercial com 50 m²",
      pain: "Encontrar um espaco profissional com valor claro.",
      solution: "Endereco, area, valor e estrutura informados no briefing atual.",
    },
  ], facts);

  assert.equal(validation.status, "passed");
  assert.equal(validation.conflicts.length, 0);
});

test("current briefing area overrides stale inherited profile area", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Morebem Imoveis - Sala Comercial Rua 902",
      extraContext: "Sala comercial para locacao com area confirmada de 50 m².",
    },
    clientProfile: {
      companyName: "Morebem Imoveis",
      niche: "imoveis",
      productService: "Cobertura triplex na Praia Brava com 190 m² e 3 suites.",
    },
  });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Sala comercial para locacao",
      description: "50 m²",
      copy: "Sala comercial com 50 m² para profissionais que precisam de um espaco objetivo.",
    },
  ], facts);

  assert.equal(facts.realEstate.areaM2, "50 m²");
  assert.ok(facts.forbiddenClaims.some((claim) => normalizeForTest(claim) === "190 m2"));
  assert.equal(validation.status, "passed");
});

test("accepts equivalent area formats without weakening numeric guard", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Sala com 50M²",
      description: "50 metros quadrados",
      copy: "Espaco comercial com 50m2 para atendimento profissional.",
    },
  ], facts);
  const conflictValidation = validateCampaignFactIntegrity([
    {
      headline: "Sala com 190M²",
      description: "190 metros quadrados",
      copy: "Espaco comercial com metragem maior.",
    },
  ], facts);

  assert.equal(validation.status, "passed");
  assert.equal(validation.conflicts.length, 0);
  assert.equal(conflictValidation.status, "failed");
  assert.ok(conflictValidation.conflicts.some((conflict) => conflict.reason === "area_conflict_expected_50 m²"));
});

test("blocks contaminated creativeSystemV2 copy bank text", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Sala comercial para locacao",
      copy: "Espaco comercial com 50 m².",
      creativeSystemV2: {
        copyBank: {
          headlines: [{ id: "h1", text: "Triplex mobiliado na Praia Brava" }],
          bodies: [{ id: "b1", text: "3 suites e 190 m² para morar bem." }],
        },
      },
    },
  ], facts);

  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((conflict) => conflict.field.includes("creativeSystemV2.copyBank")));
});

function normalizeForTest(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace("m²", "m2")
    .toLowerCase();
}

test("facts prompt exposes verified facts and forbidden claims", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const prompt = formatCampaignFactsForPrompt(facts);

  assert.match(prompt, /Tipo de imovel: sala comercial/i);
  assert.match(prompt, /Area: 50 m²/i);
  assert.match(prompt, /Preco: R\$ 5\.000/i);
  assert.match(prompt, /triplex/i);
  assert.match(prompt, /consultorio/i);
});
