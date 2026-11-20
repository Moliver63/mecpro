import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.GEMINI_API_KEY = "chave-fake-gemini";
process.env.OPENROUTER_API_KEY = "chave-fake-openrouter";
for (const k of ["DEEPSEEK_API_KEY", "GROQ_API_KEY", "GENSPARK_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]) delete process.env[k];
const { gemini, ProvidersUnavailableError } = await import("../ai");

let orModo: "ok" | "429" | "vazio" = "ok";
const chamadas: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (u: any, init: any) => {
  const url = String(u); const host = new URL(url).host; chamadas.push(host);
  if (host === "openrouter.ai") {
    if (orModo === "429") return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 });
    if (orModo === "vazio") return new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"status":"ok"}' } }] }), { status: 200 });
  }
  if (host.includes("generativelanguage")) return new Response(JSON.stringify({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
  return new Response("{}", { status: 503 });
}) as any;
process.on("exit", () => { globalThis.fetch = realFetch; });

test("mesma geração: Gemini falha no meio da chamada (429) e o OpenRouter responde, sem cair no mock", async () => {
  orModo = "ok"; chamadas.length = 0;
  const t = await gemini("Gere um JSON curto", { temperature: 0.2, semMock: true });
  assert.equal(t, '{"status":"ok"}');
  assert.ok(chamadas.includes("generativelanguage.googleapis.com"), "tentou o Gemini primeiro");
  assert.ok(chamadas.includes("openrouter.ai"), "e depois o OpenRouter, na mesma geração");
});

test("todos falham + semMock (geração de campanha): erro claro PROVIDERS_UNAVAILABLE, sem texto de mock", async () => {
  orModo = "429";
  await assert.rejects(() => gemini("Gere um JSON curto", { semMock: true }), (e: any) => {
    assert.ok(e instanceof ProvidersUnavailableError);
    assert.equal(e.code, "PROVIDERS_UNAVAILABLE");
    assert.match(e.message, /indisponíveis[\s\S]*Nada foi salvo[\s\S]*nenhum rascunho genérico/);
    assert.ok(!/negocios|Conheça nossos serviços/.test(e.message));
    return true;
  });
  orModo = "vazio";
  await assert.rejects(() => gemini("Gere um JSON curto", { semMock: true }), /PROVIDERS_UNAVAILABLE/);
});

test("outros chamadores (sem semMock) mantêm o comportamento atual: mock quando tudo falha", async () => {
  orModo = "429";
  const t = await gemini("Gere um JSON curto sobre negocios", { temperature: 0.2 });
  assert.equal(typeof t, "string");
  assert.ok(t.length > 20 && t !== '{"status":"ok"}');
});

test("OpenRouter só com a variante :free, uma tentativa por geração e ordem preservada", async () => {
  orModo = "429"; chamadas.length = 0;
  await gemini("x", { semMock: true }).catch(() => null);
  assert.equal(chamadas.filter((h) => h === "openrouter.ai").length, 1, "sem retentativa");
  const src = readFileSync(new URL("../ai.ts", import.meta.url), "utf8");
  const mod = readFileSync(new URL("../openRouterFallback.ts", import.meta.url), "utf8");
  assert.ok(mod.includes('"nvidia/nemotron-3-ultra-550b-a55b:free"'));
  assert.ok(!src.includes("llama-3.1-8b-instruct:free"));
});

test("fiação: geração de campanha usa semMock nas 3 chamadas e não tem mais o mock como último caminho", () => {
  const src = readFileSync(new URL("../ai.ts", import.meta.url), "utf8");
  const ini = src.indexOf("export async function generateCampaign(");
  const fim = src.indexOf("export async function generateCampaignPart(");
  const corpo = src.slice(ini, fim);
  assert.equal((corpo.match(/semMock: true/g) || []).length, 3);
  assert.ok(!corpo.includes('mockResponse("campanha")'));
  assert.ok(corpo.includes("throw new ProvidersUnavailableError()"));
  const g = src.slice(src.indexOf("async function _geminiImpl("), src.indexOf("function mockResponse(prompt"));
  assert.ok(!/return mockResponse\(prompt\)/.test(g), "_geminiImpl só chega ao mock via ultimoRecursoDaGeracao");
  assert.equal((g.match(/ultimoRecursoDaGeracao\(/g) || []).length, 5);
});
