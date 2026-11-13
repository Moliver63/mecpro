// Auto-resposta de comentarios: webhook da Meta, fila de sugestoes e envio.
// Primeira versao so SUGERE: nada e publicado na Meta sem o usuario aprovar (aprovarComentario).
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPool } from "./db";
import { log } from "./logger";
import { decidir, type ConfigResposta } from "./comentariosAutoResposta";

const GRAPH = "https://graph.facebook.com/v20.0";

export interface ComentarioRecebido {
  pageId: string;
  postId: string;
  commentId: string;
  fromId: string;
  fromName: string;
  message: string;
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret). */
export function assinaturaValida(corpo: Buffer, cabecalho: string | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !cabecalho || !cabecalho.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", appSecret).update(corpo).digest("hex");
  const recebido = cabecalho.slice(7);
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(recebido, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extrai so comentarios novos de primeiro nivel (ignora respostas aninhadas, para nao entrar em loop). */
export function extrairComentarios(body: any): ComentarioRecebido[] {
  if (!body || body.object !== "page" || !Array.isArray(body.entry)) return [];
  const saida: ComentarioRecebido[] = [];
  for (const entry of body.entry) {
    const pageId = String(entry?.id || "");
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = ch?.value;
      if (ch?.field !== "feed" || v?.item !== "comment" || v?.verb !== "add") continue;
      const commentId = String(v.comment_id || "");
      const postId = String(v.post_id || "");
      if (!pageId || !commentId || !postId) continue;
      if (v.parent_id && String(v.parent_id) !== postId) continue; // resposta a comentario
      saida.push({ pageId, postId, commentId, fromId: String(v.from?.id || ""), fromName: String(v.from?.name || ""), message: String(v.message || "") });
    }
  }
  return saida;
}

/** Paginas que o usuario administra (id e nome), para a tela de comentarios. */
export async function listarPaginas(userToken: string): Promise<Array<{ id: string; nome: string }>> {
  const res = await fetch(`${GRAPH}/me/accounts?fields=id,name&limit=100&access_token=${encodeURIComponent(userToken)}`, { signal: AbortSignal.timeout(8000) });
  const data: any = await res.json().catch(() => ({}));
  return (data?.data || []).map((p: any) => ({ id: String(p.id), nome: String(p.name || p.id) }));
}

export async function obterTokenPagina(userToken: string, pageId: string): Promise<string | null> {
  const res = await fetch(`${GRAPH}/me/accounts?fields=id,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`, { signal: AbortSignal.timeout(8000) });
  const data: any = await res.json().catch(() => ({}));
  const page = (data?.data || []).find((p: any) => String(p.id) === String(pageId));
  return page?.access_token || null;
}

export async function responderComentario(pageToken: string, commentId: string, mensagem: string): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(commentId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: mensagem, access_token: pageToken }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) return { ok: false, erro: String(data?.error?.message || `HTTP ${res.status}`).slice(0, 300) };
  return { ok: true, id: String(data?.id || "") };
}

/** Registra cada comentario com a decisao (sugestao, escalada ou ignorado). Idempotente por commentId. */
export async function processarComentarios(comentarios: ComentarioRecebido[]): Promise<{ registrados: number }> {
  const pool = await getPool();
  if (!pool || !comentarios.length) return { registrados: 0 };
  let registrados = 0;
  for (const c of comentarios) {
    try {
      const cfg = await pool.query(`SELECT "userId", enabled, link, preco FROM comment_autoreply_settings WHERE "pageId" = $1`, [c.pageId]);
      const s = cfg.rows[0];
      if (!s || !s.enabled) continue;
      const jaRespondeu = await pool.query(
        `SELECT 1 FROM comment_autoreply_log WHERE "pageId" = $1 AND "postId" = $2 AND "fromId" = $3 AND status IN ('pendente','enviada') LIMIT 1`,
        [c.pageId, c.postId, c.fromId],
      );
      const config: ConfigResposta = { link: s.link || undefined, preco: s.preco || undefined };
      const d = decidir({
        texto: c.message, nomeAutor: c.fromName, commentId: c.commentId, config,
        ehDaPagina: c.fromId === c.pageId, jaRespondeuPessoa: jaRespondeu.rowCount! > 0,
      });
      const status = d.acao === "responder" ? "pendente" : d.acao === "escalar" ? "escalada" : "ignorada";
      const ins = await pool.query(
        `INSERT INTO comment_autoreply_log ("userId","pageId","postId","commentId","fromId","fromName",message,categoria,acao,resposta,motivo,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT ("commentId") DO NOTHING RETURNING id`,
        [s.userId, c.pageId, c.postId, c.commentId, c.fromId, c.fromName.slice(0, 200), c.message.slice(0, 2000), d.categoria, d.acao, d.resposta || null, d.motivo, status],
      );
      if (ins.rowCount) registrados++;
    } catch (err: any) {
      log.warn("meta-comentarios", "Falha ao registrar comentario", { commentId: c.commentId, error: String(err?.message || "").slice(0, 160) });
    }
  }
  return { registrados };
}
