import test from "node:test";
import assert from "node:assert/strict";
import { motivoDeOrigemRecusada } from "../corsDiagnostico";

// Achado real (log de producao, 12/10): sete linhas iguais em 200ms,
// "[WARN] [cors] Origem bloqueada: null", e nada mais. Sem caminho, sem
// metodo, sem pista do que chamava.
test("null aponta file:// e iframe sandboxed, e diz que nao e cliente de API", () => {
  const motivo = motivoDeOrigemRecusada("null");
  assert.match(motivo, /file:\/\//);
  assert.match(motivo, /sandbox/);
  // A distincao que o log antigo escondia: ausente != "null".
  assert.match(motivo, /sem navegador nao manda Origin/);
});

test("localhost em porta errada e o caso de dev, nao de ataque", () => {
  assert.match(motivoDeOrigemRecusada("http://localhost:4200"), /porta do dev server/);
  assert.match(motivoDeOrigemRecusada("https://localhost"), /porta do dev server/);
});

test("IP cru e http sem TLS tem motivos proprios", () => {
  assert.match(motivoDeOrigemRecusada("http://203.0.113.42:8080"), /por IP/);
  assert.match(motivoDeOrigemRecusada("http://exemplo.com.br"), /http sem TLS/);
});

test("dominio desconhecido cai no motivo generico, sem inventar causa", () => {
  assert.equal(motivoDeOrigemRecusada("https://site-aleatorio.com"), "dominio fora da lista permitida.");
});

test("entrada vazia ou nao-string nao estoura", () => {
  for (const vazio of ["", "   ", null, undefined]) {
    assert.match(motivoDeOrigemRecusada(vazio as any), /vazia/);
  }
  assert.doesNotThrow(() => motivoDeOrigemRecusada(42 as any));
});
