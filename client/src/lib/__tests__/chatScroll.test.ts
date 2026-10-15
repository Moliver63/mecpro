import assert from "node:assert/strict";
import test from "node:test";

import { estaAcompanhandoOFim, DISTANCIA_DO_FIM } from "../chatScroll";

// Pedido do Michel (15/10): "a seta para rolar melhor e ver as mensagens".
// O chat era arrastado pro fim a cada mensagem nova e a cada mudanca de
// `loading`, mesmo com a pessoa lendo algo mais acima. Esta conta e o que
// decide se a rolagem automatica pode agir.
test("quem esta no fim continua acompanhando", () => {
  // Conversa longa, pessoa colada no fim.
  assert.equal(estaAcompanhandoOFim({ scrollHeight: 4000, scrollTop: 3400, clientHeight: 600 }), true);
  // Conversa que nem enche a tela: sempre fim.
  assert.equal(estaAcompanhandoOFim({ scrollHeight: 300, scrollTop: 0, clientHeight: 600 }), true);
  // Exatamente na folga: ainda conta como fim.
  assert.equal(estaAcompanhandoOFim({ scrollHeight: 4000, scrollTop: 3400 - DISTANCIA_DO_FIM, clientHeight: 600 }), true);
});

test("quem subiu para reler nao e arrastado de volta", () => {
  // Um pixel alem da folga: ja e "subiu".
  assert.equal(estaAcompanhandoOFim({ scrollHeight: 4000, scrollTop: 3399 - DISTANCIA_DO_FIM, clientHeight: 600 }), false);
  // Bem longe, lendo o inicio da conversa.
  assert.equal(estaAcompanhandoOFim({ scrollHeight: 4000, scrollTop: 0, clientHeight: 600 }), false);
});

test("overscroll elastico do iOS continua sendo o fim", () => {
  // Arrastar alem do fim deixa a distancia NEGATIVA. Com `=== 0` isso seria
  // lido como "subiu" e a seta apareceria no gesto de quem esta no fim.
  assert.equal(estaAcompanhandoOFim({ scrollHeight: 4000, scrollTop: 3480, clientHeight: 600 }), true);
});

test("a folga e configuravel sem mexer na conta", () => {
  const medida = { scrollHeight: 4000, scrollTop: 3350, clientHeight: 600 };
  assert.equal(estaAcompanhandoOFim(medida, 10), false);
  assert.equal(estaAcompanhandoOFim(medida, 100), true);
});
