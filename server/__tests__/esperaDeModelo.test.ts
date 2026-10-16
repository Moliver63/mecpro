import test from "node:test";
import assert from "node:assert/strict";
import { modeloIndisponivel, EsperaDeModelo } from "../chatProviderCooldown";

// Achado real (logs de 15 e 16/10): em toda troca de chat observada nos dois
// dias o Gemini caiu pro Cloudflare, por 503 (~2s) ou por socket pendurado
// cortado no teto de 30s. Pagar 30s uma vez e o preco de descobrir; pagar em
// cada mensagem seguinte, sabendo que o modelo esta fora, e desperdicio.
test("reconhece as duas formas de modelo fora do ar vistas em producao", () => {
  // Textos copiados dos logs.
  assert.equal(modeloIndisponivel(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}')), true);
  assert.equal(modeloIndisponivel(new Error("This operation was aborted")), true);
  // O undici desistindo sozinho, do log de 08/10.
  assert.equal(modeloIndisponivel(new Error("fetch failed")), true);
  assert.equal(modeloIndisponivel({ message: "AbortError" }), true);
});

// A metade que protege: pular o Gemini por erro de chave ou de requisicao
// esconderia um defeito nosso atras de um fallback silencioso.
test("nao abre janela para problema de chave, de requisicao ou de taxa", () => {
  for (const nao of [
    'Gemini credential rejected {"status":403}',
    '{"error":{"code":401,"message":"API key not valid"}}',
    '{"error":{"code":400,"message":"Invalid JSON payload"}}',
    '{"error":{"code":429,"message":"Resource has been exhausted"}}',
    "CREATIVE_REPAIR_REQUIRED: card 1: headline",
  ]) {
    assert.equal(modeloIndisponivel(new Error(nao)), false, nao.slice(0, 40));
  }
  assert.equal(modeloIndisponivel(null), false);
  assert.equal(modeloIndisponivel(undefined), false);
  assert.equal(modeloIndisponivel(new Error("")), false);
});

test("a janela expira sozinha e o primario volta", () => {
  let agora = 1_000_000;
  const espera = new EsperaDeModelo(() => agora, 90_000);
  const modelo = "gemini-2.5-flash-lite";

  assert.equal(espera.disponivel(modelo), true, "comeca disponivel");

  espera.bloquear(modelo);
  assert.equal(espera.disponivel(modelo), false);
  assert.equal(espera.segundosRestantes(modelo), 90);

  agora += 89_000;
  assert.equal(espera.disponivel(modelo), false, "ainda dentro da janela");
  assert.equal(espera.segundosRestantes(modelo), 1);

  agora += 2_000;
  assert.equal(espera.disponivel(modelo), true, "passada a janela, tenta de novo sozinho");
  assert.equal(espera.segundosRestantes(modelo), 0);
});

test("a janela e por modelo, nao global", () => {
  let agora = 0;
  const espera = new EsperaDeModelo(() => agora, 90_000);
  espera.bloquear("gemini-2.5-flash-lite");
  assert.equal(espera.disponivel("gemini-2.5-flash-lite"), false);
  assert.equal(espera.disponivel("gemini-2.5-flash"), true, "o modelo lento nao herda a espera do rapido");
});

// A janela e curta de proposito: o 503 se descreve como pico temporario, e
// abandonar o primario por muito tempo troca um problema por outro.
test("a janela e de minutos, nao de horas", () => {
  const espera = new EsperaDeModelo();
  espera.bloquear("x");
  const s = espera.segundosRestantes("x");
  assert.ok(s > 30 && s <= 180, `janela de ${s}s fora da faixa esperada`);
});
