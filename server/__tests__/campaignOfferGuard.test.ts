import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignFacts, validateCampaignFactIntegrity, type CampaignFacts } from "../campaignFactGuard";
import { applyOfferSuggestions, detectUnconfirmedOfferClaims } from "../campaignOfferGuard";

// Regressao da campanha 799 (leads, projeto 49): oferta confirmada e UMA aula
// por R$ 19,90 com 7 dias de acesso. Nao ha gratuidade, desconto, bonus,
// garantia nem prazo de oferta confirmados.
function facts799(objective = "leads"): CampaignFacts {
  return buildCampaignFacts({
    input: {
      productName: "Aula de autoconhecimento com Realidade Virtual",
      productService: "Aula completa de autoconhecimento",
      productPrice: "R$ 19,90",
      name: "Shadia Hasan | Aula R$ 19,90 | Leads",
      objective,
    },
    clientProfile: {
      productPrice: "R$ 19,90",
      productService: "Aula de autoconhecimento com exercicios praticos e Realidade Virtual. Acesso por 7 dias.",
    },
    segment: "infoprodutos",
  });
}

function conflitos(facts: CampaignFacts, creative: Record<string, unknown>) {
  return validateCampaignFactIntegrity([creative], facts).conflicts;
}
const razoes = (c: Array<{ reason: string }>) => c.map((x) => x.reason);

for (const objective of ["leads", "traffic", "sales", "engagement"]) {
  test(`799/${objective}: gratuidade nao confirmada e barrada em todos os campos`, () => {
    const f = facts799(objective);
    for (const field of ["headline", "description", "copy", "cta", "script"]) {
      for (const frase of ["Aula grátis", "Participe sem pagar nada", "Aula gratuita com a Shadia", "Entre por R$ 0", "Acesso sem custo"]) {
        const c = conflitos(f, { [field]: frase });
        assert.ok(c.length > 0, `${objective}/${field}: "${frase}" deveria ser barrado`);
      }
    }
  });
}

test("799: cartoes do carrossel (headline/description) tambem sao validados", () => {
  const f = facts799();
  const c = conflitos(f, { carouselCards: [{ headline: "Aula única", description: "ok" }, { headline: "Aula grátis", description: "Venha sem pagar nada" }] });
  assert.ok(c.some((x) => x.field.includes("[1]") && x.reason === "offer_free_claim_not_confirmed"));
  assert.ok(!c.some((x) => x.field.includes("carouselCards[0]")));
});

test("799: negacao nao vira promessa de gratuidade", () => {
  const f = facts799();
  assert.deepEqual(conflitos(f, { copy: "A aula não é grátis: custa R$ 19,90." }), []);
  assert.deepEqual(conflitos(f, { copy: "Nunca foi gratuita, e vale cada centavo. Aula por R$ 19,90." }), []);
});

test("799: oferta valida passa (preco e acesso confirmados)", () => {
  const f = facts799();
  assert.deepEqual(conflitos(f, { headline: "Aula de autoconhecimento por R$ 19,90", copy: "Acesso por 7 dias. Exercícios práticos com Realidade Virtual.", cta: "Quero participar" }), []);
  assert.deepEqual(conflitos(f, { copy: "7 dias de acesso à aula por R$ 19,90." }), []);
});

test("799: bonus gratis so passa se o bonus esta confirmado", () => {
  assert.ok(razoes(conflitos(facts799(), { copy: "Aula por R$ 19,90 com bônus grátis" })).includes("offer_bonus_not_confirmed"));
  const comBonus = buildCampaignFacts({
    input: { productName: "Aula de autoconhecimento", productPrice: "R$ 19,90", productDifferentials: "Bônus: checklist de exercícios. Acesso por 7 dias.", objective: "leads" },
    clientProfile: {},
    segment: "infoprodutos",
  });
  assert.deepEqual(conflitos(comBonus, { copy: "Aula por R$ 19,90 com bônus grátis" }), []);
  // bonus confirmado, mas item inventado
  assert.ok(razoes(conflitos(comBonus, { copy: "Aula por R$ 19,90 com bônus grátis de e-book" })).includes("offer_bonus_not_confirmed"));
  assert.deepEqual(conflitos(comBonus, { copy: "Aula por R$ 19,90 e bônus: checklist" }), []);
});

test("799: desconto inventado, de/por inventado e economia", () => {
  const f = facts799();
  for (const frase of ["50% de desconto", "Desconto de 30% só nesta semana", "De R$ 97 por R$ 19,90", "Economize R$ 50", "Aproveite a promoção", "Use o cupom AULA10"]) {
    const c = conflitos(f, { copy: frase });
    assert.ok(razoes(c).includes("offer_discount_not_confirmed") || razoes(c).some((r) => r.startsWith("price_")), `"${frase}" deveria ser barrado`);
  }
});

test("799: prazo de acesso diferente do confirmado e barrado; igual passa", () => {
  const f = facts799();
  const c = conflitos(f, { copy: "Acesso por 30 dias à aula" });
  assert.ok(razoes(c).includes("offer_access_term_not_confirmed"));
  assert.equal(c.find((x) => x.reason === "offer_access_term_not_confirmed")?.suggestion?.replaceWith, "7 dias");
  assert.ok(razoes(conflitos(f, { copy: "Acesso vitalício à aula" })).includes("offer_access_term_not_confirmed"));
  assert.ok(razoes(conflitos(f, { copy: "Garantia de 30 dias" })).includes("offer_guarantee_not_confirmed"));
  assert.deepEqual(conflitos(f, { copy: "Tenha 1 semana de acesso à aula" }), []);
});

test("799: prazo da oferta inventado e barrado; 12x e % de parcela nao", () => {
  const f = facts799();
  for (const frase of ["Oferta válida até 25/11", "Só hoje", "Últimas horas", "Termina domingo", "Por tempo limitado"]) {
    assert.ok(razoes(conflitos(f, { headline: frase })).includes("offer_deadline_not_confirmed"), `"${frase}"`);
  }
  assert.deepEqual(conflitos(f, { copy: "Aula por R$ 19,90, em até 7 dias de acesso." }).filter((x) => x.reason === "offer_deadline_not_confirmed"), []);
});

test("prazo confirmado de oferta: mesma data passa, outra data barra", () => {
  const f = buildCampaignFacts({
    input: { productName: "Mentoria", productPrice: "R$ 497", extraContext: "Inscrições abertas até 30/11. Turma fecha dia 30 de novembro.", objective: "sales" },
    clientProfile: {},
    segment: "infoprodutos",
  });
  assert.deepEqual(conflitos(f, { copy: "Mentoria por R$ 497. Inscrições até 30/11." }), []);
  assert.deepEqual(conflitos(f, { copy: "Mentoria por R$ 497. Inscrições até dia 30 de novembro." }), []);
  assert.ok(razoes(conflitos(f, { copy: "Mentoria por R$ 497. Inscrições até 25/11." })).includes("offer_deadline_not_confirmed"));
});

test("outros clientes: gratuidade confirmada passa, nao confirmada barra (por sujeito)", () => {
  const clinica = buildCampaignFacts({
    input: { productName: "Clínica de estética", productService: "Avaliação gratuita com especialista. Harmonização facial.", objective: "leads" },
    clientProfile: {},
    segment: "saude_estetica",
  });
  assert.deepEqual(conflitos(clinica, { cta: "Agendar avaliação gratuita" }), []);
  // gratuidade de outro item nao confirmado
  assert.ok(razoes(conflitos(clinica, { copy: "Procedimento gratuito para novos pacientes" })).includes("offer_free_claim_not_confirmed"));

  const confeitaria = buildCampaignFacts({
    input: { productName: "Brigadeiros gourmet", productPrice: "R$ 35", extraContext: "Frete grátis acima de R$ 100.", objective: "sales" },
    clientProfile: {},
    segment: "alimentacao",
  });
  assert.ok(!razoes(conflitos(confeitaria, { copy: "Frete grátis acima de R$ 100" })).includes("offer_free_claim_not_confirmed"));
  assert.ok(razoes(conflitos(confeitaria, { copy: "Brigadeiros grátis para todos" })).includes("offer_free_claim_not_confirmed"));
});

test("oferta realmente gratuita: leads com isca gratuita confirmada passa", () => {
  const f = buildCampaignFacts({
    input: { productName: "Aula gratuita de inglês", productService: "Aula gratuita ao vivo", objective: "leads" },
    clientProfile: {},
    segment: "infoprodutos",
  });
  assert.deepEqual(conflitos(f, { headline: "Aula grátis de inglês", cta: "Quero minha vaga gratuita" }), []);
});

test("leads sem nenhum preco ou gratuidade confirmados: nao presume gratuito", () => {
  const f = buildCampaignFacts({
    input: { productName: "Consultoria financeira", productService: "Consultoria para pequenas empresas", objective: "leads" },
    clientProfile: {},
    segment: "servicos",
  });
  const c = conflitos(f, { headline: "Diagnóstico grátis para sua empresa" });
  assert.ok(razoes(c).includes("offer_free_claim_not_confirmed"));
  assert.equal(c[0].needsOfferConfirmation, true);
  assert.equal(c[0].suggestion, null);
});

test("sugestao baseada em fato confirmado: troca gratuidade pelo preco e so mexe no texto", () => {
  const f = facts799();
  const texto = "Aula grátis de autoconhecimento";
  const c = conflitos(f, { headline: texto });
  const claim = c.find((x) => x.reason === "offer_free_claim_not_confirmed")!;
  assert.equal(claim.value, "grátis");
  assert.equal(claim.suggestion?.replaceWith, "por R$ 19,90");
  const corrigido = applyOfferSuggestions(texto, [claim as any]);
  assert.equal(corrigido, "Aula por R$ 19,90 de autoconhecimento");
  assert.deepEqual(conflitos(f, { headline: corrigido }), []);
});

test("sugestao de remocao de desconto inventado deixa texto valido", () => {
  const f = facts799();
  const texto = "Aula por R$ 19,90. 50% de desconto!";
  const c = conflitos(f, { copy: texto }).filter((x) => x.kind === "desconto");
  const corrigido = applyOfferSuggestions(texto, c as any);
  assert.deepEqual(conflitos(f, { copy: corrigido }), []);
  assert.ok(!/desconto/i.test(corrigido));
});

test("falsos positivos conhecidos: parcelas, 'ate 12x', frete, free de ingredientes", () => {
  const f = buildCampaignFacts({
    input: { productName: "Bolo sem glúten", productPrice: "R$ 80", extraContext: "Pagamento em até 12x no cartão.", objective: "sales" },
    clientProfile: {},
    segment: "alimentacao",
  });
  assert.deepEqual(conflitos(f, { copy: "Bolo sem glúten por R$ 80 em até 12x no cartão. Sugar free não, mas sem glúten sim." }), []);
});

test("detector: texto vazio e sem contexto", () => {
  assert.deepEqual(detectUnconfirmedOfferClaims("", { confirmedClaimsRaw: "" }), []);
  assert.deepEqual(detectUnconfirmedOfferClaims("Conheça nossa aula", { confirmedClaimsRaw: "" }), []);
});

test("goldfish: 30 reais nao vira '0 reais' e nao corrompe o rascunho", () => {
  const ctx = { confirmedClaimsRaw: "curso por r$ 30", price: "R$ 30" };
  assert.deepEqual(detectUnconfirmedOfferClaims("Por apenas 30 reais", ctx), []);
  assert.deepEqual(detectUnconfirmedOfferClaims("Plano a 100 reais por mes", { confirmedClaimsRaw: "r$ 100", price: "R$ 100" }), []);
  assert.equal(detectUnconfirmedOfferClaims("Entre por 0 reais", ctx).length, 1);
  for (const f of ["Pague zero reais", "Não pague nada", "Nada a pagar", "Custo zero", "Leve por nada", "Entre sem pagar frete"]) {
    assert.ok(detectUnconfirmedOfferClaims(f, ctx).length >= 1, f);
  }
});

test("goldfish: negacao cortada por virgula nao protege a promessa", () => {
  const ctx = { confirmedClaimsRaw: "aula por r$ 19,90", price: "R$ 19,90" };
  assert.equal(detectUnconfirmedOfferClaims("Não perca, aula grátis", ctx).length, 1);
  assert.equal(detectUnconfirmedOfferClaims("Não espere, é grátis", ctx).length, 1);
  assert.deepEqual(detectUnconfirmedOfferClaims("A aula não é grátis, custa R$ 19,90", ctx), []);
});

test("goldfish: 'sem custo adicional' e 'ate sabado' nao sao promessa; acento decomposto e pego", () => {
  const ctx = { confirmedClaimsRaw: "servico", price: undefined };
  assert.deepEqual(detectUnconfirmedOfferClaims("Plano sem custo adicional de manutenção", ctx), []);
  assert.deepEqual(detectUnconfirmedOfferClaims("Atendemos até sábado", ctx), []);
  assert.equal(detectUnconfirmedOfferClaims("Gra\u0301tis".replace("Gra\u0301", "Gra\u0301"), ctx).length, 1);
});
