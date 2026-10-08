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
    // `trabalhoAtivo` so cai depois da gravacao final. Enquanto estiver de
    // pe, o lease pertence a ESTA requisicao e ninguem o libera por ela.
    let trabalhoAtivo = true;
    let clienteFoi = false;
    const encerrar = () => { trabalhoAtivo = false; clearInterval(heartbeat); };
    const originalJson = res.json.bind(res);
    res.json = (payload: any) => {
      if (sent) return res;
      sent = true;
      pool.query(`UPDATE chat_sessions SET state=$4::jsonb, lease=NULL, busy_until=NULL, "updatedAt"=NOW()
        WHERE "userId"=$1 AND id=$2 AND lease=$3`, [userId, sessionId, lease, JSON.stringify(state)])
        .then((result: any) => {
          encerrar();
          // Mensagem reescrita em 08/10. A anterior dizia "A conversa foi
          // atualizada em outra requisicao. Confira suas campanhas antes de
          // tentar novamente." — e as duas metades enganavam. Nao havia
          // outra requisicao (o proprio `close` abaixo liberava o lease), e
          // mandar conferir campanhas sugeria escrita em campanha quando o
          // que falhou foi so o estado da conversa.
          if (result.rowCount !== 1) throw new Error("Outro envio assumiu esta conversa enquanto esta resposta era preparada, entao o estado dela nao foi salvo. Nenhuma campanha foi criada, alterada ou publicada por causa disso. Reenvie a mensagem.");
          // Cliente que desistiu nao tem socket pra receber: a gravacao
          // acima e que importava, e ela ja aconteceu.
          if (!clienteFoi) originalJson({ ...payload, sessionId });
        }).catch((error: unknown) => {
          encerrar();
          res.json = originalJson;
          next(error);
        });
      return res;
    };
    // Achado real (Michel, 08/10): com o Gemini sem timeout, o chat travou 5
    // minutos, o navegador desistiu, e o erro no log foi "A conversa foi
    // atualizada em outra requisicao" — sem nenhuma outra requisicao
    // existir.
    //
    // Era este handler. Ele assumia que socket fechado = requisicao morta e
    // liberava o lease. Mas o handler continuava vivo e ainda ia gravar:
    // quando chegou no `res.json`, a gravacao final (`WHERE lease=$3`) nao
    // achou mais o proprio lease, `rowCount` 0, e o briefing daquele turno
    // foi perdido — com a mensagem do assistente ja gravada antes, deixando
    // historico e estado dessincronizados.
    //
    // Agora: enquanto o trabalho estiver ativo, este handler NAO mexe no
    // lease nem no heartbeat. Quem libera e a propria gravacao final, que
    // assim encontra o lease dela e salva o estado.
    //
    // O que se perde: um cliente que desiste nao destrava a conversa na
    // hora — tem que esperar o handler terminar. Antes isso podia custar os
    // 5 minutos do `busy_until`; com o teto de 30s no Gemini (241a89c) o
    // handler agora termina em segundos, entao a troca vale a pena. Se o
    // processo morrer de verdade, o lease expira pelo `busy_until`, que e a
    // limitacao ja documentada em docs/chat-state-recovery.md.
    res.on("close", () => {
      clienteFoi = true;
      if (trabalhoAtivo) return;
      clearInterval(heartbeat);
      if (!sent) void pool.query(`UPDATE chat_sessions SET lease=NULL,busy_until=NULL WHERE "userId"=$1 AND id=$2 AND lease=$3`, [userId, sessionId, lease]).catch(() => {});
    });
    briefingContext.run(state, next);
  } catch (error) { next(error); }
};
}

export const chatSessionMiddleware = createChatSessionMiddleware(async () => (await import("./db")).getPool());
