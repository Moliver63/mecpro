/**
 * SQL real dos anexos do chat (hash/dedupe, posse por usuario, limite, limpeza). Roda so com TEST_DATABASE_URL
 * (Postgres com as tabelas users e chat_sessions); sem ele, e ignorado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const URL_BANCO = process.env.TEST_DATABASE_URL;
const pular = !URL_BANCO;
if (URL_BANCO) process.env.DATABASE_URL = URL_BANCO;

test("anexos no banco: hash guardado, posse por usuario, limite de 10, limpeza so de fotos", { skip: pular }, async () => {
  const db: any = await import("../db");
  const pool = await db.getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY)`);
  await pool.query(`INSERT INTO users (id) VALUES (901), (902) ON CONFLICT DO NOTHING`);
  const criar = async (userId: number) => (await pool.query(`INSERT INTO chat_sessions ("userId") VALUES ($1) RETURNING id`, [userId])).rows[0].id as number;
  const sA = await criar(901);
  const sB = await criar(902);
  const foto = (n: number) => ({ url: `https://res.cloudinary.com/demo/image/upload/mecpro/t${n}.jpg`, fileName: `f${n}.jpg`, sha: `sha-${n}` });
  try {
    await db.addPendingChatPhoto(sA, foto(1));
    const guardadas = await db.getPendingChatPhotos(sA);
    assert.equal(guardadas.length, 1);
    assert.equal(guardadas.find((f: any) => f.sha === "sha-1")?.url, foto(1).url, "o hash fica guardado (a rota usa para reaproveitar a foto repetida)");
    assert.equal(await db.userOwnsPendingChatPhoto(901, foto(1).url), true);
    assert.equal(await db.userOwnsPendingChatPhoto(902, foto(1).url), false, "outro usuario nao e dono");
    assert.equal((await db.getPendingChatPhotos(sB)).length, 0);
    for (let i = 2; i <= 14; i++) await db.addPendingChatPhoto(sA, foto(i));
    const fotos = await db.getPendingChatPhotos(sA);
    assert.ok(fotos.length <= 10, `no maximo 10 anexos guardados (${fotos.length})`);
    assert.equal(fotos.at(-1).url, foto(14).url, "ficam os mais recentes");
    await db.removePendingChatPhoto?.(sA, foto(14).url);
    assert.equal(await db.userOwnsPendingChatPhoto(901, foto(14).url), false, "removida deixa de existir");
  } finally {
    await pool.query(`DELETE FROM chat_sessions WHERE id = ANY($1)`, [[sA, sB]]);
    await pool.end?.();
  }
});
