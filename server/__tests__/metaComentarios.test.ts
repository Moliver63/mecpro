import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { assinaturaValida, extrairComentarios } from "../metaComentarios";

const corpo = Buffer.from('{"object":"page"}');
const assina = (segredo: string) => "sha256=" + createHmac("sha256", segredo).update(corpo).digest("hex");

test("assinatura: aceita a correta e recusa errada, ausente ou sem segredo", () => {
  assert.equal(assinaturaValida(corpo, assina("seg"), "seg"), true);
  assert.equal(assinaturaValida(corpo, assina("outro"), "seg"), false);
  assert.equal(assinaturaValida(corpo, undefined, "seg"), false);
  assert.equal(assinaturaValida(corpo, assina("seg"), undefined), false);
  assert.equal(assinaturaValida(corpo, "sha256=abc", "seg"), false);
});

const evento = (v: any, field = "feed") => ({ object: "page", entry: [{ id: "P1", changes: [{ field, value: v }] }] });

test("extrai so comentario novo de primeiro nivel", () => {
  const ok = extrairComentarios(evento({ item: "comment", verb: "add", comment_id: "C1", post_id: "P1_9", parent_id: "P1_9", from: { id: "U1", name: "Ana" }, message: "Amém" }));
  assert.deepEqual(ok, [{ pageId: "P1", postId: "P1_9", commentId: "C1", fromId: "U1", fromName: "Ana", message: "Amém" }]);
  assert.equal(extrairComentarios(evento({ item: "comment", verb: "add", comment_id: "C2", post_id: "P1_9", parent_id: "C1" })).length, 0); // resposta aninhada
  assert.equal(extrairComentarios(evento({ item: "comment", verb: "edited", comment_id: "C3", post_id: "P1_9" })).length, 0);
  assert.equal(extrairComentarios(evento({ item: "reaction", verb: "add" })).length, 0);
  assert.equal(extrairComentarios(evento({ item: "comment", verb: "add", comment_id: "C4", post_id: "P1_9" }, "mentions")).length, 0);
  assert.equal(extrairComentarios(null).length, 0);
  assert.equal(extrairComentarios({ object: "user" }).length, 0);
});
