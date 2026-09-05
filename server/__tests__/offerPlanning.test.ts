import assert from "node:assert/strict";
import test from "node:test";
import { planCopyArguments, buildArgumentAvailability, ARGUMENT_SEQUENCES } from "../../shared/offerPlanning";
import { buildCampaignFacts } from "../../server/campaignFactGuard";

test("every configured offer segment has a non-empty argument sequence", () => {
  for (const [segment, sequence] of Object.entries(ARGUMENT_SEQUENCES)) {
    assert.ok(sequence.length > 0, `segmento ${segment} sem sequência`);
    assert.ok(sequence.includes("cta_step"), `segmento ${segment} sem cta_step`);
  }
});

test("real estate sequence follows espaço → localização → estrutura → visita", () => {
  const full: ReturnType<typeof planCopyArguments> = planCopyArguments("imoveis_locacao", {
    hasLocation: true,
    hasConfirmedCharacteristics: true,
    hasConfirmedBenefit: false,
    hasSocialProof: false,
    hasPriceOrConditions: true,
  });
  assert.deepEqual(full, ["produto_ou_espaco", "localizacao", "estrutura_ou_ingredientes", "condicoes", "cta_step"]);
});

// ── Pedido explícito: a sequência deve se adaptar aos dados disponíveis.
// Se não houver depoimentos/resultados comprovados, o sistema escolhe
// outro argumento em vez de inventar prova social.
test("drops arguments whose required data is not confirmed, instead of inventing it", () => {
  const plan = planCopyArguments("infoprodutos", {
    hasLocation: false,
    hasConfirmedCharacteristics: false,
    hasConfirmedBenefit: false,
    hasSocialProof: false, // sem depoimentos confirmados
    hasPriceOrConditions: false,
  });
  assert.ok(!plan.includes("prova_social"), "não deveria incluir prova_social sem depoimentos confirmados");
  assert.ok(plan.includes("produto_ou_espaco"));
  assert.ok(plan.includes("cta_step"));
});

test("keeps prova_social when social proof is actually confirmed", () => {
  const plan = planCopyArguments("infoprodutos", {
    hasLocation: false,
    hasConfirmedCharacteristics: false,
    hasConfirmedBenefit: false,
    hasSocialProof: true,
    hasPriceOrConditions: false,
  });
  assert.ok(plan.includes("prova_social"));
});

test("never drops below a usable minimum sequence", () => {
  const plan = planCopyArguments("saude_estetica", {
    hasLocation: false,
    hasConfirmedCharacteristics: false,
    hasConfirmedBenefit: false,
    hasSocialProof: false,
    hasPriceOrConditions: false,
  });
  assert.ok(plan.length >= 2);
  assert.ok(plan.includes("produto_ou_espaco"));
  assert.ok(plan.includes("cta_step"));
});

test("unknown segment falls back to the generic sequence without throwing", () => {
  const plan = planCopyArguments("segmento_inexistente", {
    hasLocation: false,
    hasConfirmedCharacteristics: false,
    hasConfirmedBenefit: false,
    hasSocialProof: false,
    hasPriceOrConditions: false,
  });
  assert.deepEqual(plan.filter((r) => r !== "experiencia"), ARGUMENT_SEQUENCES.outro.filter((r) =>
    r === "produto_ou_espaco" || r === "cta_step"));
});

// ── buildArgumentAvailability a partir da ficha real da oferta (mesma
// fixture da campanha 747: sala comercial, sem benefício declarado).
test("buildArgumentAvailability reflects the offer's real confirmed facts", () => {
  const facts = buildCampaignFacts({
    input: {
      name: "Sala comercial Rua 902",
      extraContext: "Locação de sala comercial de 50 m² na Rua 902, nº 144 por R$ 5.000 mensais. Dois aparelhos de ar-condicionado.",
    },
    clientProfile: { companyName: "Morebem Imóveis", niche: "imoveis comerciais para locacao" },
    segment: "imoveis_locacao",
  });
  const availability = buildArgumentAvailability(facts);

  assert.equal(availability.hasLocation, true);
  assert.equal(availability.hasConfirmedCharacteristics, true);
  assert.equal(availability.hasPriceOrConditions, true);
  // Sem nenhuma linguagem de efeito/benefício no briefing — não deveria
  // considerar "economia de energia" confirmado só porque há ar-condicionado.
  assert.equal(availability.hasConfirmedBenefit, false);
});
