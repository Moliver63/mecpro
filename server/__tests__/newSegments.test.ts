import assert from "node:assert/strict";
import test from "node:test";
import { detectSegmentFromNiche, getSegmentInstruction, SEGMENT_COPY_RULES } from "../ai";

// ── Achado real (deploy quebrado, 06/09): 6 segmentos novos adicionados a
// SEGMENT_COPY_RULES (veiculos, construcao, educacao, eventos, turismo,
// pet) usavam ${produto}/${empresa}/${nichoLabel} como interpolação real de
// JS dentro de um objeto de nível de módulo, onde essas variáveis não
// existem — quebrava a IMPORTAÇÃO do módulo inteiro
// (ReferenceError: produto is not defined), derrubando o servidor inteiro,
// não só a geração de campanhas desses nichos.
test("importing ai.ts does not throw (module-level object literals must not reference undefined variables)", () => {
  assert.equal(typeof getSegmentInstruction, "function");
});

// ── Achado real (segundo bug, encontrado ao corrigir o primeiro): os 6
// segmentos novos também não tinham nicheKeys no nível exigido pela
// interface SegmentRule (só dentro de detection.nicheKeys, que não é usado
// por detectSegmentFromNiche) — isso quebrava detectSegmentFromNiche para
// QUALQUER nicho, já que o loop itera todos os segmentos e usa
// rules.nicheKeys.some(...), lançando erro no primeiro segmento sem
// nicheKeys no nível certo.
test("detectSegmentFromNiche does not throw for any niche, including ones that don't match anything", () => {
  assert.doesNotThrow(() => detectSegmentFromNiche("qualquer coisa sem correspondência"));
  assert.equal(detectSegmentFromNiche("qualquer coisa sem correspondência"), "outro");
});

// ── Terceiro bug do mesmo lote: faltavam os campos obrigatórios de
// SegmentRule (ctaLeads, ctaSales, forbidden etc.) nos 6 segmentos novos —
// getSegmentInstruction quebrava com "Cannot read properties of undefined
// (reading 'slice')" pra QUALQUER campanha desses nichos.
const newSegments = ["veiculos", "construcao", "educacao", "eventos", "turismo", "pet"];
for (const seg of newSegments) {
  test(`getSegmentInstruction does not throw for the '${seg}' segment`, () => {
    assert.doesNotThrow(() => getSegmentInstruction(seg, seg, "leads"));
    const result = getSegmentInstruction(seg, seg, "leads");
    assert.ok(result.length > 0);
  });

  test(`SEGMENT_COPY_RULES['${seg}'] has all fields required by SegmentRule`, () => {
    const rule = (SEGMENT_COPY_RULES as any)[seg];
    assert.ok(Array.isArray(rule.ctaLeads) && rule.ctaLeads.length > 0);
    assert.ok(Array.isArray(rule.ctaSales) && rule.ctaSales.length > 0);
    assert.equal(typeof rule.copyHook, "string");
    assert.ok(Array.isArray(rule.forbidden));
    assert.equal(typeof rule.compliance, "string");
    assert.ok(Array.isArray(rule.nicheKeys) && rule.nicheKeys.length > 0);
  });
}

test("niches for the new segments route correctly via detectSegmentFromNiche", () => {
  assert.equal(detectSegmentFromNiche("concessionária de carros"), "veiculos");
  assert.equal(detectSegmentFromNiche("material de construção"), "construcao");
  assert.equal(detectSegmentFromNiche("escola de idiomas"), "educacao");
  assert.equal(detectSegmentFromNiche("buffet de casamento"), "eventos");
  assert.equal(detectSegmentFromNiche("pousada na praia"), "turismo");
  assert.equal(detectSegmentFromNiche("petshop"), "pet");
});
