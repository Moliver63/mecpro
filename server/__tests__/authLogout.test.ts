import test from "node:test";
import assert from "node:assert/strict";
import { encerrarSessao } from "../authSession";

test("POST /api/auth/logout limpa o cookie token com as opcoes do login e responde 200", () => {
  const limpos: Array<{ nome: string; opcoes: any }> = []; let status = 0; let corpo: unknown;
  const res: any = { clearCookie: (nome: string, opcoes: any) => limpos.push({ nome, opcoes }), status(c: number) { status = c; return this; }, json(b: unknown) { corpo = b; return this; } };
  encerrarSessao({} as any, res);
  assert.equal(status, 200); assert.deepEqual(corpo, { success: true });
  assert.ok(limpos.every((l) => l.nome === "token" && l.opcoes.path === "/" && l.opcoes.httpOnly === true && l.opcoes.sameSite === "lax"));
  assert.ok(limpos.some((l) => l.opcoes.secure === true), "mesmas opcoes do cookie do login Google");
});
