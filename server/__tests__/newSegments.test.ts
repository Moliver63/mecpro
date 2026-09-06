import assert from "node:assert/strict";
import test from "node:test";
import { detectSegmentFromNiche, getSegmentInstruction, SEGMENT_COPY_RULES } from "../ai";
import { detectSegmentFromNiche as sharedDetectSegmentFromNiche, SEGMENT_CONFIG } from "../../shared/segmentConfig";

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

test("detectSegmentFromNiche does not throw for any niche, including ones that don't match anything", () => {
  assert.doesNotThrow(() => detectSegmentFromNiche("qualquer coisa sem correspondência"));
  assert.equal(detectSegmentFromNiche("qualquer coisa sem correspondência"), "outro");
  assert.doesNotThrow(() => sharedDetectSegmentFromNiche("qualquer coisa sem correspondência"));
});

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

  // ── Achado real (nesta correção): as mesmas 6 entradas em
  // shared/segmentConfig.ts (SEGMENT_CONFIG) tinham o campo `copy` num
  // formato incompatível com SegmentCopy (headline singular em vez de
  // headlines[]) — corrigido, mas os dois sistemas duplicados de segmento
  // precisam continuar reconhecendo os mesmos nichos.
  test(`SEGMENT_CONFIG['${seg}'] exists with a valid shape in shared/segmentConfig.ts too`, () => {
    const def = (SEGMENT_CONFIG as any)[seg];
    assert.ok(def, `SEGMENT_CONFIG deveria ter uma entrada pra '${seg}'`);
    assert.ok(Array.isArray(def.copy.headlines) && def.copy.headlines.length > 0);
    assert.ok(Array.isArray(def.detection.nicheKeys) && def.detection.nicheKeys.length > 0);
  });
}

test("niches for the new segments route correctly via detectSegmentFromNiche (both systems agree)", () => {
  const cases: Array<[string, string]> = [
    ["concessionária de carros", "veiculos"],
    ["material de construção", "construcao"],
    ["escola de idiomas", "educacao"],
    ["buffet de casamento", "eventos"],
    ["pousada na praia", "turismo"],
    ["petshop", "pet"],
  ];
  for (const [niche, expected] of cases) {
    assert.equal(detectSegmentFromNiche(niche), expected, `ai.ts: "${niche}"`);
    assert.equal(sharedDetectSegmentFromNiche(niche), expected, `shared/segmentConfig.ts: "${niche}"`);
  }
});
