import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialCampaignSegment } from "../ai";
import { buildCampaignFacts, resolveIsRealEstate } from "../campaignFactGuard";

// Achado real (Shadia Hasan, 19/10): direção de arte no extraContext
// ("fotografia editorial", "estética elegante") redefinia o segmento do
// cliente para "eventos" (nicheKey "fotografia", a mais longa) e todos os
// criativos eram bloqueados com campaign_segment_conflict.

// productService real do projeto 49, lido do banco em 28/09
// (MEC_PRO_AI_CURRENT_STATE.md, seção "Prompt de imagem").
const shadiaProfile = {
  niche: "",
  productService:
    "Psicologia, desenvolvimento humano e educação digital com experiências imersivas em realidade virtual, " +
    "Assinatura da Jornada de Transformação Interior por R$ 99,90/mês, com acesso ilimitado aos cursos e " +
    "conteúdos da plataforma, certificados de conclusão, materiais complementares e experiência VR completa por Meta Quest",
  productName: "",
};

const artDirection =
  "Visual: fotografia editorial realista, tons quentes neutros, minimalista; quando houver o headset, estética elegante e discreta.";

test("art direction in extraContext does not override the segment from the client profile", () => {
  const fromProfile = resolveInitialCampaignSegment(undefined, shadiaProfile);
  const withArtDirection = resolveInitialCampaignSegment(undefined, shadiaProfile, artDirection, "Shadia Hasan — Leads v3");
  assert.notEqual(withArtDirection, "eventos");
  assert.equal(withArtDirection, fromProfile);
});

test("'entrega em casa' in free text no longer routes a confeitaria to real estate (family of #754)", () => {
  const graKau = { niche: "Confeitaria", productService: "Brigadeiros e docinhos por encomenda", productName: "Gra Kau Delícias" };
  assert.equal(
    resolveInitialCampaignSegment(undefined, graKau, "Fotografia dos doces na caixa, entrega em casa", "Doces"),
    "alimentacao",
  );
});

test("real estate purpose still comes from the current briefing when the profile is generic", () => {
  const profile = { niche: "Corretor de imóveis", productService: "Intermediação imobiliária", productName: "" };
  const input = { extraContext: "Apartamento 2 quartos para aluguel em Balneário Camboriú, R$ 3.500/mês", name: "Apto Centro" };
  const initial = resolveInitialCampaignSegment(undefined, profile, input.extraContext, input.name);
  const facts = buildCampaignFacts({ input, clientProfile: profile, campaignName: input.name, segment: initial });
  assert.ok(initial.startsWith("imoveis_"));
  assert.equal(resolveIsRealEstate(initial, facts), true);
  assert.equal(facts.realEstate.purpose, "locacao");
});

test("extraContext still decides the segment when the profile identifies none (old fallback kept)", () => {
  const segment = resolveInitialCampaignSegment(
    undefined,
    { niche: "", productService: "", productName: "" },
    "Buffet para casamento e festa de 15 anos",
  );
  assert.equal(segment, "eventos");
});

test("an explicit valid segment still wins over everything", () => {
  assert.equal(resolveInitialCampaignSegment("infoprodutos", shadiaProfile, artDirection), "infoprodutos");
});
