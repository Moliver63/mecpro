import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignFacts,
  formatCampaignFactsForPrompt,
  validateCampaignFactIntegrity,
  resolveIsRealEstate,
} from "../campaignFactGuard";
import { equivalentCanonicalFact, normalizeCanonicalFact } from "../factNormalizer";
import { detectSegmentFromNiche } from "../../shared/segmentConfig";

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

test("normalizes universal fact units canonically", () => {
  assert.equal(normalizeCanonicalFact("area_m2", "cinquenta metros quadrados"), "50 m2");
  assert.equal(normalizeCanonicalFact("money_brl", "R$ 5.000,00"), "5000 brl");
  assert.equal(normalizeCanonicalFact("address_br", "Rua 902, nº 144"), "rua 902 144");
  assert.equal(normalizeCanonicalFact("duration_min", "1 hora"), "60 min");
  assert.equal(normalizeCanonicalFact("volume_ml", "0,5 L"), "500 ml");
  assert.equal(normalizeCanonicalFact("weight_kg", "30 toneladas"), "30000 kg");
  assert.ok(equivalentCanonicalFact("money_brl", "R$5.000", "5 mil reais"));
  assert.ok(equivalentCanonicalFact("address_br", "Rua 902, nº 144", "R. 902 n 144"));
  assert.ok(equivalentCanonicalFact("address_br", "Rua 902", "Rua 902, 144"));
});

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

// ── Achado real: o gerador colocou 191 m² onde deveria constar 50 m².
// Causa raiz: firstMatch() preferia o match MAIS LONGO entre todas as
// ocorrências de um padrão no texto — certo para endereço (mais longo =
// mais completo), errado para fatos puramente numéricos (mais longo só
// significa mais dígitos, sem relação com estar certo). Um briefing que
// menciona a área da unidade E a área total do prédio/condomínio no mesmo
// texto sempre escolhia o número de mais dígitos, mesmo sendo o errado.
test("does not confuse the unit's area with a larger area mentioned in the same briefing", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial",
      extraContext: "Sala comercial de 50 m² em um edifício com área total construída de 191 m², bem localizado.",
    },
    clientProfile: { companyName: "Teste", niche: "imoveis comerciais para locacao" },
  });
  assert.equal(facts.realEstate.areaM2, "50 m²");

  const validation = validateCampaignFactIntegrity([
    { headline: "Sala de 191 m²", copy: "Confira este espaço de 191 m²." },
  ], facts);
  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((c) => c.reason.startsWith("area_conflict_expected_50")));
});

test("still prefers the current briefing's area over a larger number left over in the client profile", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial",
      extraContext: "Locação de sala comercial de 50 m², tudo incluso.",
    },
    clientProfile: {
      companyName: "Teste",
      niche: "imoveis comerciais para locacao",
      productDifferentials: "Nosso maior empreendimento já teve unidades de até 191 m².",
    },
  });
  assert.equal(facts.realEstate.areaM2, "50 m²");
});

// ── Achado real (campanha #749, relato de Michel): o briefing dizia "não
// inventar 190/191 m² — a área correta é apenas 50 m²" e o sistema colocou
// 191 m² no anúncio. Causa: firstMatch() extrai QUALQUER ocorrência do
// padrão no texto, cego para negação — mesma classe de bug que
// hasPositive() já resolve para propertyType/purpose.
test("does not extract a number from inside an explicit prohibition in the briefing", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial",
      extraContext: "Locação de sala comercial. Não inventar 190/191 m² — a área correta é apenas 50 m².",
    },
    clientProfile: { companyName: "Teste", niche: "imoveis comerciais para locacao" },
  });
  assert.equal(facts.realEstate.areaM2, "50 m²");
});

test("does not extract a negated price as the confirmed value", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial",
      extraContext: "Sala comercial para locação. Não usar R$ 18.000 — o valor correto é R$ 5.000 mensais.",
    },
    clientProfile: { companyName: "Teste", niche: "imoveis comerciais para locacao" },
  });
  assert.equal(facts.realEstate.price, "R$ 5.000");
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
      copy: "Espaco comercial com 50m2 e cinquenta metros quadrados para atendimento profissional.",
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

test("accepts bedroom synonyms while blocking different counts", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Apartamento familiar",
      extraContext: "Apartamento para locacao com 3 quartos, 2 banheiros e 1 vaga.",
    },
    clientProfile: {
      companyName: "Morebem Imoveis",
      niche: "imoveis para locacao",
    },
  });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "3 dormitorios para familia",
      description: "2 banheiros e uma vaga",
      copy: "Imovel com tres dormitórios, dois banheiros e 1 vaga para locacao.",
    },
  ], facts);
  const conflictValidation = validateCampaignFactIntegrity([
    {
      headline: "4 dormitorios",
      description: "3 banheiros",
      copy: "Apartamento com duas vagas.",
    },
  ], facts);

  assert.equal(validation.status, "passed");
  assert.equal(validation.conflicts.length, 0);
  assert.equal(conflictValidation.status, "failed");
  assert.ok(conflictValidation.conflicts.some((conflict) => conflict.reason === "bedrooms_conflict_expected_3 quartos"));
  assert.ok(conflictValidation.conflicts.some((conflict) => conflict.reason === "bathrooms_conflict_expected_2 banheiros"));
  assert.ok(conflictValidation.conflicts.some((conflict) => conflict.reason === "parking_spots_conflict_expected_1 vaga"));
});

test("accepts equivalent rent price formats without confusing media budget", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Locacao por R$5.000",
      description: "R$ 5.000,00 mensais",
      copy: "Sala comercial com aluguel de 5 mil reais. Valor 5000 para locacao mensal.",
    },
  ], facts);
  const budgetConflict = validateCampaignFactIntegrity([
    {
      headline: "Locacao por R$ 180",
      description: "Orcamento menor",
      copy: "Sala comercial com valor de R$ 180 mensais.",
    },
  ], facts);

  assert.equal(validation.status, "passed");
  assert.equal(validation.conflicts.length, 0);
  assert.equal(budgetConflict.status, "failed");
  assert.ok(budgetConflict.conflicts.some((conflict) => conflict.reason === "price_conflict_expected_R$ 5.000"));
});

test("accepts confirmed address variants and blocks different street numbers", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Rua 902, n 144",
      description: "R. 902 nº 144",
      copy: "Sala comercial na Rua 902, 144 em Balneario Camboriu.",
    },
  ], facts);
  const conflictValidation = validateCampaignFactIntegrity([
    {
      headline: "Rua 902, n 999",
      description: "Endereco comercial",
      copy: "Sala comercial na Rua 902, 999.",
    },
  ], facts);

  assert.equal(validation.status, "passed");
  assert.equal(validation.conflicts.length, 0);
  assert.equal(conflictValidation.status, "failed");
  assert.ok(conflictValidation.conflicts.some((conflict) => conflict.reason === "address_conflict_expected_Rua 902, nº 144"));
});

test("blocks unconfirmed urgency claims from generated real estate copy", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Sala comercial Rua 902",
      description: "50 m² para locacao",
      copy: "Oportunidade em fase final de negociação. Unidades com características similares em processo avançado. Agende para não perder esta chance.",
    },
  ], facts);

  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((conflict) => /fase final/i.test(conflict.value)));
  assert.ok(validation.conflicts.some((conflict) => /processo/i.test(conflict.value)));
});

test("blocks unconfirmed commercial room specializations", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Consultorio pronto",
      description: "Salao ou estudio",
      copy: "Use como clínica, escritório ou consultório para atender clientes.",
    },
  ], facts);

  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((conflict) => normalizeForTest(conflict.value) === "consultorio"));
  assert.ok(validation.conflicts.some((conflict) => normalizeForTest(conflict.value) === "clinica"));
  assert.ok(validation.conflicts.some((conflict) => normalizeForTest(conflict.value) === "escritorio"));
  assert.ok(validation.conflicts.some((conflict) => normalizeForTest(conflict.value) === "salao"));
  assert.ok(validation.conflicts.some((conflict) => normalizeForTest(conflict.value) === "estudio"));
});

test("allows commercial room specialization when explicitly confirmed", () => {
  const facts = buildCampaignFacts({
    input: {
      ...morebemInput,
      extraContext: `${morebemInput.extraContext} Uso confirmado: consultorio para atendimento profissional.`,
    },
    clientProfile: morebemProfile,
  });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Consultorio na Rua 902",
      description: "50 m² para atender",
      copy: "Sala comercial com uso confirmado para consultorio, com 50 m² e valor de R$ 5.000 mensais.",
    },
  ], facts);

  assert.equal(validation.status, "passed");
  assert.equal(validation.conflicts.length, 0);
});

// ── Achado real (relato de Michel, campanha de sala comercial): "como se
// trata de sala comercial e não um apto" — quartos/suítes nunca foram
// mencionados no briefing (sala comercial não tem esses cômodos), mas
// nada bloqueava a IA de inventar "3 quartos"/"2 suítes" do zero, porque
// a checagem de contagem só disparava quando já havia um número
// CONFIRMADO pra comparar contra. Corrigido: quarto/suíte são bloqueados
// em imóvel comercial mesmo sem nenhum número confirmado, porque não
// fazem sentido arquitetônico nesse tipo de imóvel — diferente de
// banheiro/vaga, que continuam permitidos (controle negativo abaixo).
test("blocks invented bedrooms/suites for a commercial room, even with no count confirmed to compare against", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    { headline: "Sala com 3 quartos e 2 suítes", copy: "Espaço perfeito com 3 quartos e 2 suítes para sua família." },
  ], facts);

  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((c) => c.reason === "residential_feature_claim_conflict_commercial_property" && /quartos/i.test(c.value)));
  assert.ok(validation.conflicts.some((c) => c.reason === "residential_feature_claim_conflict_commercial_property" && /su[ií]tes/i.test(c.value)));
});

test("does not block bathrooms or parking spots for a commercial room (those are plausible, not proibição cega)", () => {
  const facts = buildCampaignFacts({
    input: { name: "Sala comercial", extraContext: "Locação de sala comercial de 50 m², com 1 banheiro e 2 vagas de garagem." },
    clientProfile: { companyName: "Teste", niche: "imoveis comerciais para locacao" },
  });
  const validation = validateCampaignFactIntegrity([
    { headline: "Sala com 1 banheiro e 2 vagas", copy: "Conheça o espaço e agende sua visita." },
  ], facts);

  assert.equal(validation.status, "passed");
});

test("still allows bedrooms for an actual residential property", () => {
  const facts = buildCampaignFacts({
    input: { name: "Apartamento Centro", extraContext: "Venda de apartamento de 70 m², 2 quartos, 1 vaga, no Centro." },
    clientProfile: { companyName: "Teste", niche: "imoveis residenciais para venda" },
  });
  const validation = validateCampaignFactIntegrity([
    { headline: "Apartamento com 2 quartos", copy: "Confira este apartamento com 2 quartos no Centro." },
  ], facts);

  assert.equal(validation.status, "passed");
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

// ── Achado real (campanha 747): sala comercial p/ locacao recebeu "O lar
// que voce sempre sonhou esta aqui", "sonho da casa propria" e "ultima
// unidade disponivel" — nenhuma dessas alegacoes tinha base no briefing, e
// a finalidade era LOCACAO de imovel COMERCIAL, nao venda residencial.
test("blocks homeownership language for a commercial room in locacao (campanha 747)", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "O lar que você sempre sonhou está aqui",
      copy: "Morebem Imóveis transforma o sonho da casa própria em realidade.",
      hook: "Seu lar ideal",
    },
  ], facts);

  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((c) => /homeownership_claim/.test(c.reason)));
});

test("blocks unverified scarcity and exclusivity claims (singular and plural)", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    { headline: "Última unidade disponível", copy: "Fale agora." },
    { headline: "Últimas unidades", copy: "Fale agora." },
    { headline: "Acabamento alto padrão", copy: "Espaço exclusivo para sua atividade." },
  ], facts);

  assert.equal(validation.status, "failed");
  const reasons = validation.conflicts.map((c) => c.reason);
  assert.ok(reasons.every((r) => r === "unverified_scarcity_or_exclusivity_claim"));
  assert.ok(validation.conflicts.some((c) => /última unidade/i.test(c.value)));
  assert.ok(validation.conflicts.some((c) => /últimas unidades/i.test(c.value)));
  assert.ok(validation.conflicts.some((c) => /alto padrão/i.test(c.value)));
  assert.ok(validation.conflicts.some((c) => /exclusivo/i.test(c.value)));
});

test("allows scarcity claim when the client actually confirmed it in the briefing", () => {
  const confirmedProfile = {
    ...morebemProfile,
    productDifferentials: "Restam poucas unidades disponíveis no prédio.",
  };
  const confirmedInput = {
    ...morebemInput,
    extraContext: morebemInput.extraContext + " Restam poucas unidades disponíveis no prédio.",
  };
  const facts = buildCampaignFacts({ input: confirmedInput, clientProfile: confirmedProfile });
  const validation = validateCampaignFactIntegrity([
    { headline: "Restam poucas unidades", copy: "Fale agora e agende sua visita." },
  ], facts);

  assert.equal(validation.status, "passed");
});

test("allows homeownership language for a residential sale (does not over-block)", () => {
  const vendaInput = {
    name: "Apartamento à venda Centro",
    objective: "leads",
    platform: "meta",
    extraContext: "Venda de apartamento de 70 m² no Centro, 2 quartos, 1 vaga. Valor: R$ 350.000.",
  };
  const vendaProfile = {
    companyName: "Nova Casa Imóveis",
    niche: "imoveis residenciais para venda",
    productService: "apartamento à venda",
  };
  const facts = buildCampaignFacts({ input: vendaInput, clientProfile: vendaProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Conquiste sua casa própria",
      copy: "O lar que você sempre sonhou está aqui. Fale conosco e agende sua visita.",
    },
  ], facts);

  assert.equal(validation.status, "passed");
});

// ── Característica não comprova benefício (pedido explícito do cliente):
// "dois aparelhos de ar-condicionado" (característica, já no briefing da
// Morebem) não comprova "economia de energia" (benefício/efeito).
test("extracts confirmed characteristics as literal clauses, not inferred effects", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  assert.ok(facts.confirmedCharacteristics.some((c) => /ar-condicionado/i.test(c)));
  assert.ok(!facts.confirmedCharacteristics.some((c) => /economia de energia/i.test(c)));
});

// ── Achado real (relato de Michel, campanhas #750/#751): "estrutura para
// massoterapia" continuou aparecendo mesmo com um briefing mais enxuto,
// direcionado a divulgar a sala pra públicos diversos. Causa: ao contrário
// de todo o resto (que usa "briefing atual vence sobre perfil antigo"),
// estruturas/usos eram extraídos do texto combinado sem prioridade — uma
// menção antiga no perfil do cliente virava característica confirmada pra
// sempre, mesmo quando o briefing atual não a repete.
test("does not keep surfacing a specialization from the client's old profile once the current briefing stops mentioning it", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial Rua 902",
      extraContext: "Locação de sala comercial de 50 m² na Rua 902, nº 144 por R$ 5.000 mensais. Dois aparelhos de ar-condicionado, pé-direito alto.",
    },
    clientProfile: {
      companyName: "Morebem Imóveis",
      niche: "imoveis comerciais para locacao",
      productDifferentials: "Estrutura atualmente montada para massoterapia.",
    },
  });
  assert.deepEqual(facts.realEstate.structuralFeatures, ["Dois aparelhos de ar-condicionado", "pé-direito alto"]);
});

test("still surfaces a specialization from the profile when the current briefing mentions nothing structural at all", () => {
  const facts = buildCampaignFacts({
    input: { name: "Sala comercial Rua 902", extraContext: "Locação de sala comercial na Rua 902, nº 144." },
    clientProfile: {
      companyName: "Morebem Imóveis",
      niche: "imoveis comerciais para locacao",
      productDifferentials: "Estrutura atualmente montada para massoterapia.",
    },
  });
  assert.ok(facts.realEstate.structuralFeatures.some((f) => /massoterapia/i.test(f)));
});

test("does not confirm a specialization mentioned only inside a negation in the current briefing", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial Rua 902",
      extraContext: "Locação de sala comercial de 50 m². Não é mais para massoterapia — divulgar para públicos diversos.",
    },
    clientProfile: { companyName: "Morebem Imóveis", niche: "imoveis comerciais para locacao" },
  });
  assert.ok(!facts.realEstate.structuralFeatures.some((f) => /massoterapia/i.test(f)));
  assert.ok(!facts.realEstate.usagePossibilities.some((u) => /massoterapia/i.test(u)));
});

// ── Achado real (campanha #752, relato de Michel): mesmo depois da
// correção da massoterapia, "estética" continuou direcionando anúncios,
// contrariando a orientação de divulgação ampla. Causa: targetAudience é
// um campo PERSISTENTE do perfil do cliente (não repetido a cada
// campanha) — diferente de structuralFeatures (fato físico, estável),
// enquadramento de público é decisão editorial POR CAMPANHA e não deve
// cair de volta pro perfil quando o briefing atual não menciona nenhum.
test("usage/audience framing never falls back to the client's persistent profile, only structural facts do", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial Rua 902",
      extraContext: "Locação de sala comercial de 50 m² na Rua 902, nº 144 por R$ 5.000 mensais. Dois aparelhos de ar-condicionado, pé-direito alto.",
    },
    clientProfile: {
      companyName: "Morebem Imóveis",
      niche: "imoveis comerciais para locacao",
      targetAudience: "profissionais de saude, estetica e bem-estar",
    },
  });
  assert.deepEqual(facts.realEstate.usagePossibilities, []);
  assert.deepEqual(facts.realEstate.structuralFeatures, ["Dois aparelhos de ar-condicionado", "pé-direito alto"]);
});

test("usage/audience framing still confirms when the current briefing itself states it", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial Rua 902",
      extraContext: "Locação de sala comercial de 50 m². Ideal para profissionais de estética.",
    },
    clientProfile: { companyName: "Morebem Imóveis", niche: "imoveis comerciais para locacao" },
  });
  assert.deepEqual(facts.realEstate.usagePossibilities, ["estética"]);
});

// ── Achado real (campanha #752): as saídas "pe-direito alto" e "estetica"
// nunca tinham acento, mesmo o texto original tendo sido escrito com
// acento — o literal de saída era hardcoded sem acento.
test("structural features and usage possibilities are output with correct accents", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial",
      extraContext: "Sala comercial de 50 m², pé-direito alto, ideal para estética.",
    },
    clientProfile: { companyName: "Teste", niche: "imoveis comerciais para locacao" },
  });
  assert.ok(facts.realEstate.structuralFeatures.includes("pé-direito alto"));
  assert.ok(facts.realEstate.usagePossibilities.includes("estética"));
});

test("blocks a benefit claim not confirmed by the client, even when a related characteristic exists", () => {
  const facts = buildCampaignFacts({ input: morebemInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    {
      headline: "Sala com ar-condicionado",
      copy: "Aproveite a economia de energia deste espaço e agende sua visita.",
    },
  ], facts);

  assert.equal(validation.status, "failed");
  assert.ok(validation.conflicts.some((c) => c.reason === "unverified_benefit_claim" && /economia de energia/i.test(c.value)));
});

test("allows a benefit claim when the client explicitly stated the effect, not just the characteristic", () => {
  const confirmedInput = {
    ...morebemInput,
    extraContext: morebemInput.extraContext + " Ar-condicionado inverter, com economia de energia comprovada.",
  };
  const facts = buildCampaignFacts({ input: confirmedInput, clientProfile: morebemProfile });
  const validation = validateCampaignFactIntegrity([
    { headline: "Sala com ar-condicionado inverter", copy: "Economia de energia comprovada. Agende sua visita." },
  ], facts);

  assert.equal(validation.status, "passed");
});

// ── Achado real (Gra Kau Delícias, campanha #754): uma confeitaria com
// "entrega em casa" no briefing foi desviada pro gerador de imóveis,
// produzindo "Imóvel"/"Agendar visita" pra brigadeiro. Causa: propertyType
// virava "casa" só por essa frase comum (não indica imóvel nenhum), sem
// nenhum outro fato imobiliário confirmado, e isso sozinho bastava pra
// isRealEstate virar true.
test("a single ambiguous property-type word without corroborating facts is not treated as real estate", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Gra Kau Delícias",
      extraContext: "Brigadeiros e docinhos artesanais. Fazemos entrega em casa na região de Balneário Camboriú.",
    },
    clientProfile: { companyName: "Gra Kau Delícias", niche: "Confeitaria" },
  });
  assert.equal(facts.realEstate.propertyType, "casa");
  assert.equal(resolveIsRealEstate("outro", facts), false);
});

test("still treats it as real estate when the property-type word is corroborated by area, purpose or address", () => {
  const factsWithArea = buildCampaignFacts({
    input: { name: "Casa à venda", extraContext: "Casa de 120 m², sem endereço definido ainda." },
    clientProfile: { companyName: "Imobiliária X", niche: "imoveis" },
  });
  assert.equal(resolveIsRealEstate("outro", factsWithArea), true);

  const factsWithPurpose = buildCampaignFacts({
    input: { name: "Casa para alugar", extraContext: "Casa disponível para locação, valor a combinar." },
    clientProfile: { companyName: "Imobiliária X", niche: "imoveis" },
  });
  assert.equal(resolveIsRealEstate("outro", factsWithPurpose), true);

  const factsWithAddress = buildCampaignFacts({
    input: { name: "Casa", extraContext: "Casa na Rua das Flores, nº 45." },
    clientProfile: { companyName: "Imobiliária X", niche: "imoveis" },
  });
  assert.equal(resolveIsRealEstate("outro", factsWithAddress), true);
});

test("segment already classified as imoveis_* is always treated as real estate, regardless of facts", () => {
  const facts = buildCampaignFacts({
    input: { name: "Projeto novo", extraContext: "Detalhes a confirmar." },
    clientProfile: { companyName: "Imobiliária X", niche: "imoveis para locacao" },
  });
  assert.equal(resolveIsRealEstate("imoveis_locacao", facts), true);
});

test("confeitaria niche now classifies as alimentacao instead of falling into the generic bucket", () => {
  assert.equal(detectSegmentFromNiche("Confeitaria"), "alimentacao");
  assert.equal(detectSegmentFromNiche("Doceria"), "alimentacao");
});
