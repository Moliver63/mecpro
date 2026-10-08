import test, { before } from "node:test";
import assert from "node:assert/strict";

// Importar chat.ts puxa a cadeia de validacao de env. Mesma convencao de
// chatPrecision.test.ts: envs minimos num `before` e import dinamico. O que
// se testa aqui e puro e nao toca banco nem rede.
let tempoLimiteGemini: typeof import("../chat").tempoLimiteGemini;
let janelaDaTentativa: typeof import("../chat").janelaDaTentativa;
let TIMEOUT_GEMINI_MS: number;
let PRAZO_GEMINI_MS: number;
before(async () => {
  process.env.DATABASE_URL   ??= "postgres://localhost:5432/mecpro_test";
  process.env.JWT_SECRET     ??= "gemini-timeout-test-secret-0123456789";
  process.env.SESSION_SECRET ??= "gemini-timeout-test-secret-0123456789";
  const m = await import("../chat");
  ({ tempoLimiteGemini, janelaDaTentativa, TIMEOUT_GEMINI_MS, PRAZO_GEMINI_MS } = m);
});

// Incidente real (Michel, 08/10): o chat travou 5 minutos e o navegador
// desistiu — ele viu "Erro de conexao. Verifique sua internet", com a
// internet dele perfeita. `chamarGeminiComRetry` chamava generateContent
// SEM timeout, enquanto Cloudflare (15s) e OpenRouter (20s) tinham teto.
test("os padroes sao menores que a paciencia de um navegador", () => {
  assert.equal(TIMEOUT_GEMINI_MS, 30_000);
  assert.equal(PRAZO_GEMINI_MS, 45_000);
  // O que importa: o estagio do Gemini nao pode mais custar minutos.
  assert.ok(PRAZO_GEMINI_MS <= 60_000, "o prazo total do Gemini tem que caber em um minuto");
  assert.ok(TIMEOUT_GEMINI_MS <= PRAZO_GEMINI_MS, "a tentativa nao pode exceder o prazo total");
});

test("env sobrescreve dentro da faixa, e valor invalido cai no padrao", () => {
  assert.equal(tempoLimiteGemini("8000", TIMEOUT_GEMINI_MS), 8_000);
  assert.equal(tempoLimiteGemini("120000", TIMEOUT_GEMINI_MS), 120_000);
  assert.equal(tempoLimiteGemini("1000", TIMEOUT_GEMINI_MS), 1_000);
  // Um env mal digitado nao pode tirar o chat do ar nem reabrir a espera
  // infinita: tudo invalido volta pro padrao.
  for (const ruim of [undefined, "", " ", "abc", "0", "-5000", "999", "120001", "NaN", "Infinity", "1e99"]) {
    assert.equal(tempoLimiteGemini(ruim, TIMEOUT_GEMINI_MS), TIMEOUT_GEMINI_MS, `"${ruim}" devia cair no padrao`);
  }
  // Fracionario e truncado, nao rejeitado.
  assert.equal(tempoLimiteGemini("5000.7", TIMEOUT_GEMINI_MS), 5_000);
});

// A janela e onde um off-by-one abortaria a chamada antes de ela sair.
test("janela da tentativa respeita o teto e o que resta do prazo", () => {
  // Prazo folgado: vale o teto por tentativa.
  assert.equal(janelaDaTentativa(30_000, 45_000), 30_000);
  // Prazo apertado: vale o que resta.
  assert.equal(janelaDaTentativa(30_000, 12_000), 12_000);
  assert.equal(janelaDaTentativa(30_000, 30_000), 30_000);
});

test("piso de 1s impede abortar antes de tocar a rede", () => {
  // Sem o piso, uma tentativa iniciada com o prazo no fim receberia
  // AbortSignal.timeout(0) ou negativo e morreria sem sair — gastando uma
  // tentativa do pool de chaves por nada.
  assert.equal(janelaDaTentativa(30_000, 0), 1_000);
  assert.equal(janelaDaTentativa(30_000, -5_000), 1_000);
  assert.equal(janelaDaTentativa(30_000, 500), 1_000);
  // E o piso nunca vira teto: com prazo de sobra, continua o valor cheio.
  assert.ok(janelaDaTentativa(30_000, 45_000) > 1_000);
});

test("nenhuma combinacao devolve valor invalido pro AbortSignal", () => {
  for (const limite of [1_000, 15_000, 30_000, 120_000]) {
    for (const restante of [-99_999, -1, 0, 1, 999, 1_000, 20_000, 999_999]) {
      const j = janelaDaTentativa(limite, restante);
      assert.ok(Number.isFinite(j) && j >= 1_000, `limite=${limite} restante=${restante} deu ${j}`);
      assert.ok(j <= limite || limite < 1_000, "nunca pode passar do teto da tentativa");
    }
  }
});
