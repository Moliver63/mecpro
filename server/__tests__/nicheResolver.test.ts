/**
 * nicheResolver.test.ts — suíte da nova função deriveNicheFromProfile
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { CampaignProfile } from "../campaignProfile";
import { deriveNicheFromProfile, nicheToHumanLabel } from "../nicheResolver";

function mk(p: Partial<CampaignProfile>): CampaignProfile {
  return {
    initialSegment:         p.initialSegment       || "outro",
    resolvedSegment:        p.resolvedSegment      || "outro",
    isRealEstate:           p.isRealEstate         ?? false,
    offerType:              p.offerType            || "desconhecido",
    offerConfidence:        p.offerConfidence      || "baixa",
    offerMatched:           p.offerMatched         || [],
    subsegmentKey:          p.subsegmentKey        || null,
    subsegmentLabel:        p.subsegmentLabel      || null,
    subsegmentConfidence:   p.subsegmentConfidence || "baixa",
    subsegmentMatched:      p.subsegmentMatched    || [],
    hookOverride:           p.hookOverride         || null,
    ctaOverride:            p.ctaOverride          || null,
    subsegmentInstruction:  p.subsegmentInstruction || "",
  };
}

// PASSO 3 - alta confiança

test("alta confiança + subsegmento válido → chave composta limpa", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "imoveis_locacao",
    subsegmentKey: "locacao_anual",
    subsegmentConfidence: "alta",
  }));
  assert.equal(niche, "imoveis_locacao.locacao_anual");
});

test("alta confiança + temporada → chave tagueada", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "imoveis_locacao",
    subsegmentKey: "temporada",
    subsegmentConfidence: "alta",
  }));
  assert.equal(niche, "imoveis_locacao.temporada");
});

test("alta confiança + MCMV → chave mcmv na venda", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "imoveis_venda",
    subsegmentKey: "mcmv",
    subsegmentConfidence: "alta",
  }));
  assert.equal(niche, "imoveis_venda.mcmv");
});

// PASSO 4 - média confiança

test("confiança média → sufixo _tentativo", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "imoveis_venda",
    subsegmentKey: "lancamento",
    subsegmentConfidence: "media",
  }));
  assert.equal(niche, "imoveis_venda.lancamento_tentativo");
});

// PASSO 5 - offerType

test("alimentacao + delivery → chave do offerType", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "alimentacao",
    offerType: "delivery",
    offerConfidence: "alta",
  }));
  assert.equal(niche, "alimentacao.delivery");
});

// PASSO 5b - conflito locacao+venda

test("imoveis_locacao detectado + offerType venda → rebaixado para imoveis_venda.venda", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "imoveis_locacao",
    offerType: "venda",
    offerConfidence: "baixa",
  }));
  assert.equal(niche, "imoveis_venda.venda");
});

// PASSO 6 - segmento isolado

test("sem offerType nem subsegmento → chave isolada do segmento", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "b2b",
    offerType: "desconhecido",
  }));
  assert.equal(niche, "b2b");
});

// PASSO 7 - ultimo caso

test("segmento 'outro' + nada detectado → 'geral'", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "outro",
  }));
  assert.equal(niche, "geral");
});

// DEFESAS

test("resolvedSegment vazio → fallback puro 'geral'", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "",
  }));
  assert.equal(niche, "geral");
});

test("subsegmento fantasma (não existe em SUBSEGMENTS) → cai pra passo 5", () => {
  const niche = deriveNicheFromProfile(mk({
    resolvedSegment: "imoveis_locacao",
    subsegmentKey: "subsegmento_que_nao_existe",
    subsegmentConfidence: "alta",
    offerType: "locacao",
    offerConfidence: "alta",
  }));
  assert.equal(niche, "imoveis_locacao.locacao");
});

// HUMANO

test("nicheToHumanLabel: composto → rótulo humano", () => {
  assert.equal(nicheToHumanLabel("imoveis_locacao.temporada"), "Temporada / Diária");
  assert.equal(nicheToHumanLabel("imoveis_venda.mcmv"), "Minha Casa Minha Vida");
  assert.equal(nicheToHumanLabel("b2b"), "B2B / Empresas");
  assert.ok(nicheToHumanLabel("imoveis_venda.lancamento_tentativo").includes("(tentativa)"),
    "_tentativo deve virar (tentativa) no rótulo humano");
});
