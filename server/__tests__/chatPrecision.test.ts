import test, { before } from "node:test";
import assert from "node:assert/strict";

// Importar server/chat.ts puxa a cadeia de validação de env (db.ts →
// _core/env.ts exige DATABASE_URL/JWT_SECRET/SESSION_SECRET). Os demais
// testes do chat evitam importar chat.ts por isso; aqui o import é feito
// de forma dinâmica DEPOIS de preencher envs mínimos de teste — o que
// testamos (configGeminiChat) é puro e não toca banco nem rede.
let configGeminiChat: typeof import("../chat").configGeminiChat;
before(async () => {
  process.env.DATABASE_URL ??= "postgres://localhost:5432/mecpro_test";
  process.env.JWT_SECRET ??= "chat-precision-test-secret-0123456789";
  process.env.SESSION_SECRET ??= "chat-precision-test-secret-0123456789";
  ({ configGeminiChat } = await import("../chat"));
});

// Configuração de geração do chat (precisão/poder de resposta). Cobre as
// decisões deliberadas: temperature baixa e consistente entre provedores,
// limite de saída pra não truncar respostas longas, e modo lenta com
// orçamento de raciocínio + modelo opcionalmente mais capaz.

test("config Gemini: temperature baixa e maxOutputTokens declarados em todos os modos", () => {
  for (const velocidade of ["rapida", "media", "lenta"] as const) {
    const { config } = configGeminiChat(velocidade);
    assert.equal(config.temperature, 0.4, `temperature em ${velocidade}`);
    assert.equal(config.maxOutputTokens, 2048, `maxOutputTokens em ${velocidade}`);
    assert.ok(config.systemInstruction, `systemInstruction em ${velocidade}`);
    assert.equal(config.tools?.length, 1, `tools em ${velocidade}`);
  }
});

// config.tools é ToolUnion (functionDeclarations ou código) — o teste só
// se aplica ao ramo de declarações, então o cast é intencional.
function declaracoesDe(config: ReturnType<typeof configGeminiChat>["config"]): any[] {
  return ((config.tools?.[0] as any)?.functionDeclarations ?? []) as any[];
}

test("config Gemini: modo rapida remove pesquisar_web das declarações", () => {
  const { config } = configGeminiChat("rapida");
  const declaracoes = declaracoesDe(config);
  assert.ok(declaracoes.length > 0);
  assert.ok(!declaracoes.some((d: any) => d.name === "pesquisar_web"));
});

test("config Gemini: modos media e lenta mantêm pesquisar_web disponível", () => {
  for (const velocidade of ["media", "lenta"] as const) {
    const { config } = configGeminiChat(velocidade);
    assert.ok(declaracoesDe(config).some((d: any) => d.name === "pesquisar_web"), `pesquisar_web em ${velocidade}`);
  }
});

test("config Gemini: modo lenta liga thinking e permite modelo mais capaz", () => {
  const lenta = configGeminiChat("lenta");
  assert.equal(lenta.config.thinkingConfig?.thinkingBudget, 2048);
  // Sem GEMINI_CHAT_MODEL_SLOW configurado no ambiente de teste, o modelo
  // lento cai no mesmo do padrão — comportamento opt-in, sem custo surpresa.
  const media = configGeminiChat("media");
  if (!process.env.GEMINI_CHAT_MODEL_SLOW) assert.equal(lenta.model, media.model);
  else assert.equal(lenta.model, process.env.GEMINI_CHAT_MODEL_SLOW);
});
