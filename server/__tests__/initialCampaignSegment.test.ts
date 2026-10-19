import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialCampaignSegment } from "../ai";

// Achado real (Shadia Hasan, out/2026): direção de arte no extraContext
// ("fotografia editorial", "estética elegante") redefinia o segmento do
// cliente para "eventos" e todos os criativos eram bloqueados com
// campaign_segment_conflict.
const infoprodutoProfile = {
  niche: "Curso online de autoconhecimento e desenvolvimento pessoal",
  productService: "Método Shadia Hasan, curso online com vivência em realidade virtual",
  productName: "Método Shadia Hasan",
};

const artDirection =
  "Visual: fotografia editorial realista, tons quentes neutros, minimalista; quando houver o headset, estética elegante e discreta.";

test("art direction in extraContext does not override the segment from the client profile", () => {
  const segment = resolveInitialCampaignSegment(undefined, infoprodutoProfile, artDirection, "Shadia Hasan — Leads v3");
  assert.equal(segment, "infoprodutos");
});

test("profile-only resolution is unchanged when extraContext is empty", () => {
  assert.equal(resolveInitialCampaignSegment(undefined, infoprodutoProfile), "infoprodutos");
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
  assert.equal(resolveInitialCampaignSegment("educacao", infoprodutoProfile, artDirection), "educacao");
});
