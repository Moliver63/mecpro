import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { respostaFinalDoPasso, RESPOSTA_SEM_CONCLUSAO } from "../chatRespostaFinal";

// Achado real (logs de 05/10, 14/10 e 15/10). Texto emitido JUNTO de uma chamada
// de ferramenta e preambulo: foi escrito antes de o resultado da ferramenta
// existir. Era gravado em `textoFinal` e, se nenhum passo seguinte produzisse
// texto, voltava ao usuario como conclusao.
//
// Foi assim que a mensagem sobre a campanha 798 chegou IDENTICA, byte a byte,
// em dois dias: mesmo preambulo, mesmo estado pre-dado, promovido duas vezes.
// E a causa que ele afirmava era o inverso do que o portao gravou.
test("texto junto de chamada de ferramenta nunca vira resposta final", () => {
  const preambulo = "As 15 imagens foram rejeitadas por nao mostrar VR. Deseja enviar fotos?";
  assert.equal(respostaFinalDoPasso(preambulo, true), null, "pediu ferramenta: e preambulo");
  assert.equal(respostaFinalDoPasso(preambulo, false), preambulo, "nao pediu ferramenta: e resposta");
});

test("texto vazio ou nao-string nunca vira resposta", () => {
  for (const vazio of ["", "   ", "\n\t ", null, undefined, 42, {}, []]) {
    assert.equal(respostaFinalDoPasso(vazio, false), null, JSON.stringify(vazio));
    assert.equal(respostaFinalDoPasso(vazio, true), null, JSON.stringify(vazio));
  }
});

test("a falha visivel nao afirma dado nem estado de campanha", () => {
  // Preferir "nao consegui" a preambulo: um custa uma mensagem, o outro mandou
  // o Michel mexer no briefing e mandar fotos por dois dias.
  assert.ok(RESPOSTA_SEM_CONCLUSAO.length > 20);
  for (const proibido of [/rejeitad/i, /aprovad/i, /imagen?s/i, /campanha (foi|nao foi)/i, /publicad/i, /briefing/i]) {
    assert.doesNotMatch(RESPOSTA_SEM_CONCLUSAO, proibido, `a mensagem de falha nao pode afirmar: ${proibido}`);
  }
});

// Os TRES lacos de provedor tinham o mesmo padrao. Corrigir um e deixar dois e
// pior que nao corrigir: o log de 15/10 mostra o Gemini em 503 em quase toda
// mensagem, entao o chat roda a maior parte do tempo pelo fallback.
test("nenhum laco de provedor grava texto antes de saber se pediu ferramenta", () => {
  const fonte = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");

  for (const padrao of [
    /if \(resposta\.text\) textoFinal = resposta\.text;/,
    /if \(msg\.content\) textoFinal = msg\.content;/,
    /if \(msg\.content\) textoFinal = String\(msg\.content\);/,
  ]) {
    assert.doesNotMatch(fonte, padrao, `padrao do preambulo de volta em chat.ts: ${padrao}`);
  }

  // Os tres passaram a decidir pelo helper, e os tres returns tem a falha visivel.
  assert.equal((fonte.match(/respostaFinalDoPasso\(/g) || []).length, 3, "os tres lacos usam o helper");
  assert.equal((fonte.match(/textoFinal \|\| RESPOSTA_SEM_CONCLUSAO/g) || []).length, 3, "os tres returns tem fallback");
});
