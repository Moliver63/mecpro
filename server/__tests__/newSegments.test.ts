import assert from "node:assert/strict";
import test from "node:test";
import { detectSegmentFromNiche, getSegmentInstruction, SEGMENT_COPY_RULES, applyAngleLabelsToFallbackCards } from "../ai";
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

// ── Achado real (Gra Kau Delícias, campanha #762): mesmo com o segmento
// certo (alimentacao) e a copy de fallback já corrigida, um rótulo interno
// de organização de ângulo ("Oferta principal:", "Variedade e escolha")
// era prefixado em TODO card, mesmo quando o card já tinha hook/copy reais
// prontos — headline/description já tinham a checagem certa
// (index < baseCards.length), copy/hook não seguiam a mesma regra.
test("applyAngleLabelsToFallbackCards preserves the real hook/copy when a real base card exists", () => {
  const baseCards = [
    { headline: "Doces para pedir hoje", description: "Sabor e capricho", copy: "Copy real do card 1.", hook: "Hook real 1", solution: "Solução 1" },
    { headline: "Variedade na mesma caixa", description: "Opções para todos", copy: "Copy real do card 2.", hook: "Hook real 2", solution: "Solução 2" },
    { headline: "Encomendas com carinho", description: "Feito para ocasião", copy: "Copy real do card 3.", hook: "Hook real 3", solution: "Solução 3" },
  ];

  // Campanha #762: 2 fotos, dentro do conjunto de 3 cards reais disponíveis.
  const result = applyAngleLabelsToFallbackCards(baseCards, 2);
  assert.equal(result[0].headline, "Doces para pedir hoje");
  assert.equal(result[0].hook, "Hook real 1");
  assert.equal(result[0].copy, "Copy real do card 1.");
  assert.equal(result[1].headline, "Variedade na mesma caixa");
  assert.equal(result[1].hook, "Hook real 2");
  assert.equal(result[1].copy, "Copy real do card 2.");

  // Nenhum rótulo de organização interna ("Oferta principal:", "da campanha")
  // deve aparecer quando existe conteúdo real pronto pro card.
  for (const card of result) {
    assert.ok(!/oferta principal|variedade e escolha|da campanha/i.test(card.hook));
    assert.ok(!/^oferta principal:|^variedade e escolha:/i.test(card.copy));
  }
});

test("applyAngleLabelsToFallbackCards still uses the generic label for cards beyond the real set", () => {
  const baseCards = [
    { headline: "Card real", description: "Desc real", copy: "Copy real.", hook: "Hook real", solution: "Solução real" },
  ];
  // Pede 3 cards, só existe 1 real — os outros 2 são "extras".
  const result = applyAngleLabelsToFallbackCards(baseCards, 3);
  assert.equal(result[0].headline, "Card real");
  assert.equal(result[0].hook, "Hook real");
  assert.equal(result[1].headline, "Variedade e escolha");
  assert.equal(result[1].hook, "Variedade e escolha da campanha");
  assert.ok(result[1].copy.startsWith("Variedade e escolha: "));
});
