import { test } from "node:test";
import assert from "node:assert/strict";
import { escolherMelhorReescrita, reescritaSuficiente, avaliarReescrita, type CandidatoReescrita } from "../creativeRewriteGuard";
import { buildCampaignFacts } from "../campaignFactGuard";

// Ver docs/specs/2026-11-14-reescrita-multi-provedor.md.
const facts = buildCampaignFacts({ input: {}, clientProfile: {}, segment: "servicos" } as any);

function cand(provedor: string, criativo: Record<string, string>, rejected: string[] = []): CandidatoReescrita {
  return { provedor, candidate: criativo, rejected: rejected as any, issues: [], accepted: [] };
}

const limpo = { headline: "Agende sua avaliação", description: "Atendimento rápido", copy: "Fale com a equipe e tire suas dúvidas.", hook: "Precisa de ajuda?", cta: "Agendar" };
const comProvaSocial = { ...limpo, copy: "Milhares de clientes já mudaram de vida com a gente." };

test("lista vazia devolve null", () => {
  assert.equal(escolherMelhorReescrita([], facts, () => 80), null);
});

test("empate fica com o primeiro (provedor primario)", () => {
  const r = escolherMelhorReescrita([cand("gemini", limpo), cand("groq", limpo)], facts, () => 80);
  assert.equal(r?.provedor, "gemini");
});

test("campo rejeitado perde para candidato completo mesmo com score maior", () => {
  const rejeitado = { ...limpo };
  const r = escolherMelhorReescrita(
    [cand("gemini", rejeitado, ["headline"]), cand("groq", limpo)],
    facts, c => (c === rejeitado ? 99 : 70),
  );
  assert.equal(r?.provedor, "groq");
});

test("problema extra pesa mais que score", () => {
  const repetido = { ...limpo };
  const r = escolherMelhorReescrita(
    [cand("gemini", repetido), cand("groq", limpo)],
    facts, c => (c === repetido ? 99 : 70), c => (c === repetido ? 1 : 0),
  );
  assert.equal(r?.provedor, "groq");
});

test("campo fora do limite pesa mais que score", () => {
  const longo = { ...limpo, headline: "x".repeat(60) };
  const r = escolherMelhorReescrita(
    [cand("gemini", longo), cand("groq", limpo)],
    facts, c => (c === longo ? 99 : 70),
  );
  assert.equal(r?.provedor, "groq");
});

test("rejeitado pesa mais que campo fora do limite", () => {
  const longo = { ...limpo, headline: "x".repeat(60) };
  const rejeitado = { ...limpo };
  const r = escolherMelhorReescrita(
    [cand("gemini", rejeitado, ["cta"]), cand("groq", longo)],
    facts, () => 80,
  );
  assert.equal(r?.provedor, "groq");
});

test("Fact Guard do criativo inteiro reprovado perde, mesmo com menos rejeitados e score maior", () => {
  const r = escolherMelhorReescrita(
    [cand("gemini", comProvaSocial), cand("groq", limpo, ["description"])],
    facts, c => (c === comProvaSocial ? 99 : 60),
  );
  assert.equal(r?.factOk, true);
  assert.equal(r?.provedor, "groq");
});

test("headline repetida de outro card perde no reparo de irmaos", () => {
  const repetido = { ...limpo, headline: "Mesma headline" };
  const r = escolherMelhorReescrita(
    [cand("gemini", repetido), cand("groq", limpo)],
    facts, () => 80, c => (c.headline === "Mesma headline" ? 1 : 0),
  );
  assert.equal(r?.provedor, "groq");
});

test("score decide quando todo o resto empata", () => {
  const outro = { ...limpo, headline: "Outra headline boa" };
  const r = escolherMelhorReescrita(
    [cand("gemini", limpo), cand("groq", outro)],
    facts, c => (c === outro ? 90 : 76),
  );
  assert.equal(r?.provedor, "groq");
});

test("reescrita suficiente exige tudo limpo e score no limiar", () => {
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo), facts, () => 80), 75), true);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo), facts, () => 74), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo, ["cta"]), facts, () => 90), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", comProvaSocial), facts, () => 90), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo), facts, () => 90, () => 1), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", { ...limpo, headline: "x".repeat(60) }), facts, () => 90), 75), false);
});
