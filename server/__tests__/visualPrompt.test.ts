import test from "node:test";
import assert from "node:assert/strict";
import { inferPrompt, getCacheKey, getPixabayQuery } from "../imageGeneration";

test("commercial brief overrides residential defaults and generated claims", () => {
  const prompt = inferPrompt({ solution: "Piscina privativa", angle: "transformacao" }, "imoveis_locacao", "leads", "feed", { productService: "Sala comercial para locacao", confirmedVisualFacts: ["Tipo: sala comercial", "Caracteristica: ar-condicionado", "Preco: R$ 5000"] });
  assert.match(prompt, /Sala comercial/);
  assert.match(prompt, /ar-condicionado/);
  assert.doesNotMatch(prompt, /furnished living room|Piscina privativa|Preco: R\$/);
  assert.match(prompt, /4:5/);
});

test("food and fitness use the concrete subject rather than generic scene defaults", () => {
  for (const [segment, subject] of [["alimentacao", "Brigadeiros de chocolate em caixas"], ["fitness", "Academia de musculacao"]]) {
    const prompt = inferPrompt({}, segment, "leads", "stories", { productService: subject });
    assert.ok(prompt.includes(subject));
    assert.doesNotMatch(prompt, /restaurant warm ambiance|Generic scene context/);
    assert.match(prompt, /9:16/);
    assert.match(prompt, /people only if required/);
  }
});

test("changing the product or confirmed visual facts invalidates cached images", () => {
  const key = (context: any) => getCacheKey({}, "imoveis_locacao", "leads", "huggingface", "feed", context);
  assert.notEqual(key({ productService: "Sala comercial" }), key({ productService: "Apartamento" }));
  assert.notEqual(key({ confirmedVisualFacts: ["Mobilia: mobiliado"] }), key({ confirmedVisualFacts: [] }));
});

test("commercial stock fallback does not become luxury apartment because of the city", () => {
  assert.equal(getPixabayQuery("imoveis_locacao", { copy: "Balneario Camboriu" }, 0, { productService: "Sala comercial em Balneário Camboriú" }), "commercial space interior");
});
