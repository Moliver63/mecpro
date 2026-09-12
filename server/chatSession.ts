import { randomUUID } from "node:crypto";
import { briefingContext, type ChatBriefingState } from "./chatBriefing";

export function createChatSessionMiddleware(getPool: () => Promise<any>) {
return async function chatSessionMiddleware(req: any, res: any, next: (error?: unknown) => void) {
  const sessionId = req.body?.sessionId;
  if (sessionId === undefined) return briefingContext.run({ briefing: {} }, next);
    if (typeof sessionId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sessionId)) return res.status(400).json({ erro: "Conversa invalida." });
  try {
    const pool = await getPool();
    if (!pool) throw new Error("Banco indisponivel para preservar a conversa.");
    const userId = req.chatUserId;
    await pool.query("INSERT INTO chat_briefings (user_id, session_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, sessionId]);
    const lease = randomUUID();
    const claimed = await pool.query(`UPDATE chat_briefings SET lease=$3, busy_until=NOW()+INTERVAL '5 minutes'
      WHERE user_id=$1 AND session_id=$2 AND (busy_until IS NULL OR busy_until < NOW()) RETURNING state`, [userId, sessionId, lease]);
    if (!claimed.rows.length) return res.status(409).json({ erro: "Aguarde a resposta anterior desta conversa." });
    const state: ChatBriefingState = claimed.rows[0].state || { briefing: {} };
    const heartbeat = setInterval(() => {
      void pool.query("UPDATE chat_briefings SET busy_until=NOW()+INTERVAL '5 minutes' WHERE user_id=$1 AND session_id=$2 AND lease=$3", [userId, sessionId, lease]).catch(() => {});
    }, 60_000);
    heartbeat.unref();
    let sent = false;
    const originalJson = res.json.bind(res);
    res.json = (payload: any) => {
      if (sent) return res;
      sent = true;
      pool.query(`UPDATE chat_briefings SET state=$4::jsonb, lease=NULL, busy_until=NULL, updated_at=NOW()
        WHERE user_id=$1 AND session_id=$2 AND lease=$3`, [userId, sessionId, lease, JSON.stringify(state)])
        .then((result: any) => {
          clearInterval(heartbeat);
          if (result.rowCount !== 1) throw new Error("A conversa foi atualizada em outra requisicao. Confira suas campanhas antes de tentar novamente.");
          originalJson(payload);
        }).catch((error: unknown) => { clearInterval(heartbeat); next(error); });
      return res;
    };
    res.on("close", () => {
      clearInterval(heartbeat);
      if (!sent) void pool.query("UPDATE chat_briefings SET lease=NULL,busy_until=NULL WHERE user_id=$1 AND session_id=$2 AND lease=$3", [userId, sessionId, lease]).catch(() => {});
    });
    briefingContext.run(state, next);
  } catch (error) { next(error); }
};
}

export const chatSessionMiddleware = createChatSessionMiddleware(async () => (await import("./db")).getPool());
