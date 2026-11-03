import test from "node:test";
import assert from "node:assert/strict";
import {
  ajustarTextoGoogle, prepararTextosGoogle, dividirEmFrases, limparTextoGoogle,
  GOOGLE_TITULO_MAX, GOOGLE_DESCRICAO_MAX,
} from "../../shared/googleAdsTexto";

/** Defeito: .slice(0, 30) cortava "R$19,90" em "R$19,9" e palavras no meio. */

test("titulo que cabe passa inteiro", () => {
  assert.equal(ajustarTextoGoogle("Aula de Autoconhecimento", 30), "Aula de Autoconhecimento");
});

test("titulo de 33 caracteres com preco no fim e descartado, nao mutilado", () => {
  const t = "Aula VR Autoconhecimento R$19,90";
  assert.ok(t.length > GOOGLE_TITULO_MAX);
  assert.equal(ajustarTextoGoogle(t, 30), null);
});

test("encurta em palavra quando o que sobra nao tem numero", () => {
  assert.equal(ajustarTextoGoogle("Autoconhecimento com Realidade Virtual guiada", 30), "Autoconhecimento com Realidade");
});

test("nao termina em conectivo solto", () => {
  assert.equal(ajustarTextoGoogle("Descubra o metodo para entender voce mesmo", 28), null);
});

test("limpa emoji, travessao e quebra de linha", () => {
  assert.equal(limparTextoGoogle("Aula 🎯 hoje\n— R$ 19,90"), "Aula hoje, R$ 19,90");
});

test("prepararTextosGoogle remove repetidos e respeita limites", () => {
  const r = prepararTextosGoogle(["Aula R$19,90", "aula r$19,90", "Saiba Mais", "x".repeat(50)], GOOGLE_TITULO_MAX, 15);
  assert.deepEqual(r, ["Aula R$19,90", "Saiba Mais"]);
  assert.ok(r.every((t) => t.length <= GOOGLE_TITULO_MAX));
});

test("descricoes: frases que cabem viram candidatas, nunca passam de 90", () => {
  const copy = "Sente-se preso em padroes emocionais?\n\nAcesso liberado por 7 dias apos pagamento unico (PIX, cartao, boleto).\n\nDescubra como a Realidade Virtual pode te guiar para uma compreensao profunda de si, com exercicios praticos.";
  const r = prepararTextosGoogle(dividirEmFrases(copy), GOOGLE_DESCRICAO_MAX, 4);
  assert.ok(r.length >= 2);
  assert.ok(r.every((t) => t.length <= GOOGLE_DESCRICAO_MAX));
  assert.ok(r.some((t) => t.includes("7 dias")));
});
