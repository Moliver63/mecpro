import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { callOpenRouterFallback, limparRespostaOpenRouter, OPENROUTER_FALLBACK_MODEL } from "../openRouterFallback";
import { buildCampaignFacts, validateCampaignFactIntegrity } from "../campaignFactGuard";

const entrada = { system: "sistema", user: "gere o JSON", temperature: 0.4 };
const resposta = (corpo: any, status = 200) => async () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
function comChave<T>(fn: () => Promise<T>) {
  const antes = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  return fn().finally(() => { if (antes === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = antes; });
}

test("modelo: Nemotron gratuito, sem variante paga e sem response_format", async () => {
  assert.equal(OPENROUTER_FALLBACK_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.ok(OPENROUTER_FALLBACK_MODEL.endsWith(":free"));
  let corpo: any = null; let auth = "";
  await comChave(() => callOpenRouterFallback(entrada, (async (_u: any, init: any) => {
    corpo = JSON.parse(init.body); auth = init.headers.Authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  }) as any));
  assert.equal(corpo.model, OPENROUTER_FALLBACK_MODEL);
  assert.equal("response_format" in corpo, false);
  assert.equal(corpo.temperature, 0.4);
  assert.equal(auth, "Bearer chave-de-teste");
});

test("retorno válido: JSON entregue intacto ao chamador", async () => {
  const json = '{"strategy":{},"adSets":[],"creatives":[{"headline":"Aula por R$ 19,90"}]}';
  const r = await comChave(() => callOpenRouterFallback(entrada, resposta({ choices: [{ message: { content: json } }] }) as any));
  assert.equal(r, json);
  assert.doesNotThrow(() => JSON.parse(r!));
});

test("raciocínio <think> é removido; cerca ```json fica para o chamador limpar como hoje", () => {
  assert.equal(limparRespostaOpenRouter({ choices: [{ message: { content: "<think>vou pensar</think>\n{\"a\":1}" } }] }), '{"a":1}');
  assert.equal(limparRespostaOpenRouter({ choices: [{ message: { content: "```json\n{\"a\":1}\n```" } }] }), "```json\n{\"a\":1}\n```");
  assert.equal(limparRespostaOpenRouter({ choices: [{ message: { content: [{ type: "text", text: "{\"a\":1}" }] } }] }), '{"a":1}');
});

test("sem conteúdo (só raciocínio, <think> cortado ou content nulo): null, nunca usa o campo reasoning", async () => {
  for (const message of [
    { content: null, reasoning: '{"creatives":[{"headline":"grátis"}]}' },
    { content: "<think>raciocínio sem fim" },
    { content: "" },
  ]) {
    const r = await comChave(() => callOpenRouterFallback(entrada, resposta({ choices: [{ message }] }) as any));
    assert.equal(r, null);
  }
});

test("JSON inválido: texto devolvido sem 'consertar'; o parse do chamador falha e a cadeia atual segue", async () => {
  const quebrado = '{"strategy": {"x": 1}, "creatives": [{"headline": "Oi"';
  const r = await comChave(() => callOpenRouterFallback(entrada, resposta({ choices: [{ message: { content: quebrado } }] }) as any));
  assert.equal(r, quebrado);
  assert.throws(() => JSON.parse(r!));
});

test("erro 429 (e 5xx): null, uma única chamada, sem trocar de modelo nem tentar variante paga", async () => {
  for (const status of [429, 503]) {
    const modelos: string[] = [];
    const r = await comChave(() => callOpenRouterFallback(entrada, (async (_u: any, init: any) => {
      modelos.push(JSON.parse(init.body).model);
      return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status });
    }) as any));
    assert.equal(r, null);
    assert.deepEqual(modelos, [OPENROUTER_FALLBACK_MODEL]);
  }
});

test("falha de rede/timeout e ausência de chave: null", async () => {
  assert.equal(await comChave(() => callOpenRouterFallback(entrada, (async () => { throw new Error("timeout"); }) as any)), null);
  const antes = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  let chamou = false;
  assert.equal(await callOpenRouterFallback(entrada, (async () => { chamou = true; return new Response("{}"); }) as any), null);
  assert.equal(chamou, false);
  if (antes !== undefined) process.env.OPENROUTER_API_KEY = antes;
});

test("o Fact Guard continua valendo para texto vindo do Nemotron (mesma validação, sem afrouxar)", async () => {
  const facts = buildCampaignFacts({ input: { productName: "Aula de tráfego", productService: "Aula de tráfego", productPrice: "R$ 19,90", name: "T", objective: "leads", extraContext: "Pagamento único." }, clientProfile: {}, segment: "infoprodutos" });
  const json = JSON.stringify({ creatives: [{ headline: "Aula grátis" }] });
  const texto = await comChave(() => callOpenRouterFallback(entrada, resposta({ choices: [{ message: { content: json } }] }) as any));
  const criativos = JSON.parse(texto!).creatives;
  assert.ok(validateCampaignFactIntegrity(criativos, facts).conflicts.length > 0, "gratuidade inventada deve ser barrada");
  assert.equal(validateCampaignFactIntegrity([{ headline: "Aula por R$ 19,90" }], facts).conflicts.length, 0);
});

test("fiação em ai.ts: ordem preservada (Claude, depois OpenRouter, depois mock) e nenhum modelo antigo/pago", () => {
  const src = readFileSync(new URL("../ai.ts", import.meta.url), "utf8");
  const i = (t: string) => src.indexOf(t);
  const claude = i("Claude fallback direto OK (quota Gemini)");
  const chamada = i('ultimoRecursoDaGeracao(prompt, opts, "quota Gemini esgotada")');
  assert.ok(claude > 0 && chamada > claude, "no atalho de quota, o fim da cadeia vem depois do Claude");
  const helper = src.slice(i("async function ultimoRecursoDaGeracao"), i("export async function gemini("));
  assert.ok(helper.indexOf("callOpenRouterFallback({") > 0 && helper.indexOf("callOpenRouterFallback({") < helper.indexOf("return mockResponse(prompt)"), "OpenRouter antes do mock");
  assert.ok(!src.includes("llama-3.1-8b-instruct:free"));
  assert.ok(!/openrouter\.ai\/api\/v1\/chat\/completions/.test(src), "chamada deve ficar só no módulo do fallback");
  const mod = readFileSync(new URL("../openRouterFallback.ts", import.meta.url), "utf8");
  assert.equal((mod.match(/model:\s*"/g) || []).length, 0, "modelo só vem da constante gratuita");
  assert.equal((mod.match(/nvidia\/nemotron/g) || []).length, 1);
});
