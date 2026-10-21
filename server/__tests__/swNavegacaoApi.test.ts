import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Achado real (log de producao, 21/10):
 *
 *   15:19:07  Google callback — redirecionando apos login {userId:2}
 *   15:19:08  Google callback error {name:"TokenError", msg:"Malformed auth code."}
 *   15:19:41  Google callback error {name:"TokenError", msg:"Malformed auth code."}
 *
 * Login concluido e, um segundo depois, o mesmo codigo reenviado. Codigo de
 * autorizacao do Google e de uso unico.
 *
 * Causa: o service worker tratava `/api/` ANTES de checar `request.mode`, entao
 * a NAVEGACAO pro callback caia no ramo de API e era respondida com
 * `fetch(request)` — que segue redirect. O callback responde 302 pro /dashboard,
 * o fetch seguia, e a barra de endereco ficava no callback com o `code`.
 * Qualquer recarregamento reenviava o codigo consumido.
 *
 * Teste de FONTE, nao de comportamento: o service worker roda no browser e nao
 * da pra instanciar aqui. O que protege a correcao e a ORDEM das checagens, e
 * ordem se le no arquivo.
 */
const SW = readFileSync(new URL("../../client/public/sw.js", import.meta.url), "utf8");

test("navegacao para /api/ sai antes de qualquer ramo que chame respondWith", () => {
  const guarda = SW.indexOf("request.mode === 'navigate' && (url.pathname.startsWith('/api/')");
  assert.ok(guarda > 0, "a guarda de navegacao para /api/ precisa existir");

  const primeiroRespondWith = SW.indexOf("event.respondWith");
  assert.ok(primeiroRespondWith > 0);
  assert.ok(
    guarda < primeiroRespondWith,
    "a guarda tem que vir ANTES do primeiro respondWith: era exatamente a ordem invertida que causava o bug",
  );
});

test("a guarda devolve sem responder, em vez de responder com fetch", () => {
  // `event.respondWith(fetch(request))` ainda segue redirect e manteria o bug.
  const trecho = SW.slice(
    SW.indexOf("request.mode === 'navigate' && (url.pathname.startsWith('/api/')"),
    SW.indexOf("// API calls"),
  );
  assert.match(trecho, /return;/, "sem respondWith o browser trata a navegacao nativamente");
  assert.doesNotMatch(trecho, /respondWith/, "responder aqui reintroduz o bug");
});

test("o ramo de navegacao de SPA nao reintroduz o caso /api/", () => {
  const ramo = SW.slice(SW.indexOf("// Navegação (rotas SPA)"), SW.indexOf("// Tudo mais"));
  assert.doesNotMatch(
    ramo,
    /respondWith\(fetch\(request\)\);/,
    "o caso /api/ saiu deste ramo e vai no topo, sem respondWith",
  );
});

test("a versao do cache subiu, senao o cliente antigo nao recebe a correcao", () => {
  const versao = SW.match(/const CACHE_VERSION = '([^']+)'/);
  assert.ok(versao, "CACHE_VERSION precisa existir");
  const n = Number(String(versao![1]).replace(/\D+/g, ""));
  assert.ok(n >= 5, `versao ${versao![1]} — subir ao mexer na estrategia de fetch`);
});

// A segunda metade: mesmo com a causa raiz corrigida, um callback repetido pode
// chegar (aba antiga, back do browser). Quem ja tem cookie valido nao pode ser
// jogado pra tela de login com "sessao expirada" depois de logar com sucesso.
test("callback repetido com sessao valida segue para o destino, nao para o login", () => {
  const INDEX = readFileSync(new URL("../_core/index.ts", import.meta.url), "utf8");
  const bloco = INDEX.slice(
    INDEX.indexOf("// Callback do Google"),
    INDEX.indexOf("'✅ Google OAuth configurado'"),
  );
  assert.match(bloco, /Callback repetido com sessao valida/);
  // Verifica o JWT em vez de confiar na presenca do cookie.
  assert.match(bloco, /jwtVerify/);
  assert.match(bloco, /payload\?\.userId/);
  // E o destino continua validado contra redirecionamento aberto.
  assert.match(bloco, /startsWith\('\/'\)\s*\|\|\s*estado\.startsWith\(appUrl\)/);
});
