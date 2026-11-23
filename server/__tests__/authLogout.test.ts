import test from "node:test";
import assert from "node:assert/strict";
import { encerrarSessao } from "../authSession";

test("POST /api/auth/logout limpa o cookie token com as opcoes do login e responde 200", () => {
  const limpos: Array<{ nome: string; opcoes: any }> = []; let status = 0; let corpo: unknown;
  const res: any = { clearCookie: (nome: string, opcoes: any) => limpos.push({ nome, opcoes }), status(c: number) { status = c; return this; }, json(b: unknown) { corpo = b; return this; } };
  encerrarSessao({ headers: {} } as any, res);
  assert.equal(status, 200); assert.deepEqual(corpo, { success: true });
  assert.ok(limpos.every((l) => l.nome === "token" && l.opcoes.path === "/" && l.opcoes.httpOnly === true && l.opcoes.sameSite === "lax"));
  assert.ok(limpos.some((l) => l.opcoes.secure === true), "mesmas opcoes do cookie do login Google");
});

test("logout: requisicao cross-site e recusada sem limpar cookie; same-site e sem cabecalho passam", () => {
  const rodar = (headers: Record<string, string>) => {
    const limpos: unknown[] = []; let status = 0;
    const res: any = { clearCookie: (...a: unknown[]) => limpos.push(a), status(c: number) { status = c; return this; }, json() { return this; } };
    encerrarSessao({ headers } as any, res);
    return { status, limpos: limpos.length };
  };
  assert.deepEqual(rodar({ "sec-fetch-site": "cross-site" }), { status: 403, limpos: 0 });
  assert.equal(rodar({ "sec-fetch-site": "same-site" }).status, 200);
  assert.equal(rodar({ "sec-fetch-site": "same-origin" }).status, 200);
  assert.equal(rodar({}).status, 200);
});

import { readFileSync } from "node:fs";
test("log 4xx do MCP registra so metadados saneados: sem Authorization, params ou corpo", () => {
  const fonte = readFileSync(new URL("../publicApi.ts", import.meta.url), "utf8");
  const bloco = fonte.slice(fonte.indexOf('"MCP respondeu 4xx"'), fonte.indexOf('"MCP respondeu 4xx"') + 500);
  assert.ok(!/authorization|req\.body\?*\.params|req\.body[,)\s]|req\.query/i.test(bloco), "nada sensivel no log");
  assert.match(bloco, /limpo\(/);
});
