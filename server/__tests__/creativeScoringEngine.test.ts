import assert from "node:assert/strict";
import test from "node:test";
import { scoreCreative } from "../creativeScoringEngine";

// ── Achado real (relato de Michel): "O validador provavelmente está
// confundindo um trecho com uma palavra. Ele acusa 'cura', mas o texto
// contém 'procura'." A checagem original usava String.includes(), que casa
// qualquer substring — "cura" é substring literal de "procura"/"escura".
// O texto do teste é exatamente o gerado por buildRealEstateCarouselAngles
// (server/carouselCopy.ts, card de estrutura): "O que você procura...".
test("does not flag 'cura' as a compliance risk inside 'procura'", () => {
  const result = scoreCreative({
    headline: "Conheça a estrutura",
    copy: "O que você procura na estrutura do seu próximo espaço? O espaço conta com dois aparelhos de ar-condicionado.",
  });
  assert.equal(result.complianceRisk, "Baixo");
});

test("does not flag 'cura' inside 'escura' either", () => {
  const result = scoreCreative({
    headline: "Ambiente aconchegante",
    copy: "Mesmo em uma sala mais escura, a estrutura favorece o conforto durante o dia.",
  });
  assert.equal(result.complianceRisk, "Baixo");
});

test("still flags 'cura' as a real compliance risk when it's an actual standalone word", () => {
  const result = scoreCreative({
    headline: "A cura definitiva",
    copy: "Este produto oferece a cura para o seu problema.",
  });
  assert.equal(result.complianceRisk, "Alto");
});

test("still flags a real high-risk phrase (garantia de resultado)", () => {
  const result = scoreCreative({
    headline: "Oferta imperdível",
    copy: "Garantia de resultado em 7 dias ou seu dinheiro de volta.",
  });
  assert.equal(result.complianceRisk, "Alto");
});
