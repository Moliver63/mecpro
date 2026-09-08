/**
 * campaignProfile.test.ts — suíte da nova função resolveCampaignProfile
 * (semente do Perfil da Campanha — entrega 1 do Conselho).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { resolveCampaignProfile } from "../campaignProfile";

// IMÓVEIS VENDA / LOCAÇÃO / TEMPORADA

test("aluguel → imoveis_locacao + locacao_anual", () => {
  const profile = resolveCampaignProfile({
    name: "Apartamento Jardins",
    clientProductService: "Apartamento 2 quartos para alugar no Jardins",
    clientMainPain: "Aluguel caro sem qualidade",
    clientUVP: "R$ 3.500/mês com vaga inclusa",
    clientDifferentials: "prédio novo, localização central",
  });
  assert.equal(profile.resolvedSegment, "imoveis_locacao");
  assert.equal(profile.subsegmentKey, "locacao_anual");
  assert.notEqual(profile.subsegmentConfidence, "baixa");
  assert.ok(profile.ctaOverride);
  assert.deepEqual(profile.ctaOverride, ["Ver disponibilidade", "Agendar visita", "Quero alugar"]);
  assert.ok(profile.subsegmentInstruction.includes("🎯 SUBSEGMENTO"));
});

test("temporada por diária → imoveis_locacao + temporada", () => {
  const profile = resolveCampaignProfile({
    name: "Casa Temporada Praia",
    clientProductService: "Casa de temporada por diária em praia",
    clientMainPain: "Férias sem casa confortável",
    clientNiche: "aluguel temporada",
  });
  assert.equal(profile.resolvedSegment, "imoveis_locacao");
  assert.equal(profile.subsegmentKey, "temporada");
});

test("MCMV → imoveis_venda + mcmv ctaOverride", () => {
  const profile = resolveCampaignProfile({
    segment: "imoveis_venda",
    name: "Residencial Bela Vista",
    clientProductService: "Apartamento Minha Casa Minha Vida",
    clientUVP: "Subsídio total + entrada facilitada",
    clientMainPain: "Não conseguir comprar casa própria",
    clientDifferentials: "2 suítes, 70m², varanda gourmet",
  });
  assert.equal(profile.resolvedSegment, "imoveis_venda");
  assert.equal(profile.subsegmentKey, "mcmv");
  assert.deepEqual(profile.ctaOverride, ["Ver se você tem direito", "Simular financiamento"]);
});

// OUTROS SEGMENTOS

test("alimentação + delivery → subsegment delivery", () => {
  const profile = resolveCampaignProfile({
    segment: "alimentacao",
    name: "Hamburgueria do Bairro",
    clientProductService: "Delivery de hambúrguer artesanal",
    clientDifferentials: "Peça agora no WhatsApp, entrega rápida, iFood",
  });
  assert.equal(profile.resolvedSegment, "alimentacao");
  assert.equal(profile.subsegmentKey, "delivery");
  assert.deepEqual(profile.ctaOverride, ["Pedir agora", "Pedir delivery", "Fazer meu pedido"]);
});

test("SaaS B2B → b2b + saas subsegment", () => {
  const profile = resolveCampaignProfile({
    name: "Plataforma X",
    clientProductService: "Software empresarial: automatize processos",
    clientNiche: "empresas",
    extraContext: "Plataforma SaaS para o segmento B2B",
  });
  assert.equal(profile.resolvedSegment, "b2b");
  assert.equal(profile.subsegmentKey, "saas");
  assert.deepEqual(profile.ctaOverride, ["Solicitar demo", "Iniciar teste grátis"]);
});

// CONFLITO venda+locação

test("conflito venda+locação rebaixa offerConfidence", () => {
  const profile = resolveCampaignProfile({
    segment: "imoveis_venda",
    name: "Apartamento",
    clientProductService: "Apartamento para alugar e comprar — duas opções",
  });
  assert.equal(profile.offerConfidence, "baixa");
  assert.equal(profile.hookOverride, null);
  assert.equal(profile.ctaOverride, null);
  assert.equal(profile.subsegmentInstruction, "");
});

// REGRA DO SILÊNCIO

test("nicho fraco/ausente → tudo null e instrução vazia", () => {
  const profile = resolveCampaignProfile({
    segment: "outro",
    name: "Sem nicho definido",
    clientProductService: "negócios em geral",
  });
  assert.equal(profile.subsegmentKey, null);
  assert.equal(profile.hookOverride, null);
  assert.equal(profile.ctaOverride, null);
  assert.equal(profile.subsegmentInstruction, "");
  assert.equal(profile.offerType, "desconhecido");
});

// COMPATIBILIDADE COM PRE-RESOLVED-SEGMENT

test("preResolvedSegment é respeitado quando não é realEstate", () => {
  const profile = resolveCampaignProfile({
    preResolvedSegment: "b2b",
    name: "Plataforma X",
    clientProductService: "Software: automatize processos",
    clientNiche: "empresas",
  });
  assert.equal(profile.resolvedSegment, "b2b");
  assert.equal(profile.subsegmentKey, "saas");
});
