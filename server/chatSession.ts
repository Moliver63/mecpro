import { randomUUID } from "node:crypto";
import { briefingContext, type ChatBriefingState } from "./chatBriefing";

export function createChatSessionMiddleware(getPool: () => Promise<any>) {
return async function chatSessionMiddleware(req: any, res: any, next: (error?: unknown) => void) {
  let sessionId = req.body?.sessionId;
  if (sessionId != null && (!Number.isSafeInteger(sessionId) || sessionId <= 0)) return res.status(400).json({ erro: "Conversa invalida." });
  try {
    const pool = await getPool();
    if (!pool) throw new Error("Banco indisponivel para preservar a conversa.");
    const userId = req.chatUserId;
    if (sessionId == null) {
      const title = String(req.body?.mensagens?.find((m: any) => m?.role === "user")?.content || "Nova conversa").slice(0, 80);
      const created = await pool.query('INSERT INTO chat_sessions ("userId",title) VALUES ($1,$2) RETURNING id', [userId, title]);
      sessionId = created.rows[0].id;
    }
    req.chatSessionId = sessionId;
    const lease = randomUUID();
    const claimed = await pool.query(`UPDATE chat_sessions SET lease=$3, busy_until=NOW()+INTERVAL '5 minutes'
      WHERE "userId"=$1 AND id=$2 AND (busy_until IS NULL OR busy_until < NOW())
      RETURNING state,"lastCampaignId","lastCampaignName","lastCampaignUrl"`, [userId, sessionId, lease]);
    if (!claimed.rows.length) return res.status(409).json({ erro: "Aguarde a resposta anterior desta conversa." });
    const state: ChatBriefingState = claimed.rows[0].state || { briefing: {} };
    const row = claimed.rows[0];
    const match = /^\/projects\/(\d+)\/campaign\/result\/(\d+)$/.exec(row.lastCampaignUrl || "");
    if (!state.lastCampaign && match && Number(match[2]) === row.lastCampaignId) {
      state.lastCampaign = { id: row.lastCampaignId, name: row.lastCampaignName || "Campanha", projectId: Number(match[1]), url: row.lastCampaignUrl };
    }
    const heartbeat = setInterval(() => {
      void pool.query(`UPDATE chat_sessions SET busy_until=NOW()+INTERVAL '5 minutes' WHERE "userId"=$1 AND id=$2 AND lease=$3`, [userId, sessionId, lease]).catch(() => {});
    }, 60_000);
    heartbeat.unref();
    let sent = false;
    const originalJson = res.json.bind(res);
    res.json = (payload: any) => {
      if (sent) return res;
      sent = true;
      pool.query(`UPDATE chat_sessions SET state=$4::jsonb, lease=NULL, busy_until=NULL, "updatedAt"=NOW()
        WHERE "userId"=$1 AND id=$2 AND lease=$3`, [userId, sessionId, lease, JSON.stringify(state)])
        .then((result: any) => {
          clearInterval(heartbeat);
          if (result.rowCount !== 1) throw new Error("A conversa foi atualizada em outra requisicao. Confira suas campanhas antes de tentar novamente.");
          originalJson({ ...payload, sessionId });
        }).catch((error: unknown) => {
          clearInterval(heartbeat);
          res.json = originalJson;
          next(error);
        });
      return res;
    };
    res.on("close", () => {
      clearInterval(heartbeat);
      if (!sent) void pool.query(`UPDATE chat_sessions SET lease=NULL,busy_until=NULL WHERE "userId"=$1 AND id=$2 AND lease=$3`, [userId, sessionId, lease]).catch(() => {});
    });
    briefingContext.run(state, next);
  } catch (error) { next(error); }
};
}

export const chatSessionMiddleware = createChatSessionMiddleware(async () => (await import("./db")).getPool());
