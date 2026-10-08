import test from "node:test";
import assert from "node:assert/strict";
import { createChatSessionMiddleware } from "../chatSession";
import { briefingContext } from "../chatBriefing";

const sessionId = 123;
test("save failure leaves the error handler able to send JSON", async () => {
  let payload: any;
  let resolve!: () => void;
  const finished = new Promise<void>(r => { resolve = r; });
  const middleware = createChatSessionMiddleware(async () => ({ async query(sql: string) {
    if (sql.includes("RETURNING state")) return { rows: [{ state: { briefing: {} } }] };
    throw new Error("save failed");
  } }));
  const res: any = { json(value: any) { payload = value; resolve(); }, on() {} };
  await middleware({ chatUserId: 7, body: { sessionId } }, res, (error?: unknown) => {
    if (error) res.json({ erro: "save failed" });
    else res.json({ resposta: "ok" });
  });
  await finished;
  assert.deepEqual(payload, { erro: "save failed" });
});

test("session persistence scopes every query to the authenticated account", async () => {
  const queries: Array<{ sql: string; params: any[] }> = [];
  let payload: any;
  let resolve!: () => void;
  const finished = new Promise<void>(r => { resolve = r; });
  const middleware = createChatSessionMiddleware(async () => ({ async query(sql: string, params: any[]) {
    queries.push({ sql, params });
    return { rowCount: 1, rows: sql.includes("RETURNING state") ? [{ state: { briefing: { budget: 84 } } }] : [] };
  } }));
  const res: any = { json(value: any) { payload = value; resolve(); }, on() {}, status() { return this; } };
  await middleware({ chatUserId: 7, body: { sessionId } }, res, (error?: unknown) => {
    assert.equal(error, undefined);
    const state = briefingContext.getStore()!;
    assert.equal(state.briefing.budget, 84);
    state.briefing.budget = 100;
    res.json({ resposta: "ok" });
  });
  await finished;
  assert.equal(payload.resposta, "ok");
  assert.ok(queries.every(q => q.params[0] === 7 && q.params[1] === sessionId));
  assert.equal(JSON.parse(queries.at(-1)!.params[3]).briefing.budget, 100);
});
test("busy session does not execute another conversation turn", async () => {
  let status = 0;
  let called = false;
  const res: any = { status(code: number) { status = code; return this; }, json() {} };
  const middleware = createChatSessionMiddleware(async () => ({ async query() { return { rows: [] }; } }));
  await middleware({ chatUserId: 7, body: { sessionId } }, res, () => { called = true; });
  assert.equal(status, 409);
  assert.equal(called, false);
});
test("malformed session is rejected before accessing storage", async () => {
  const middleware = createChatSessionMiddleware(async () => { throw new Error("must not access DB"); });
  let status = 0;
  const res: any = { status(code: number) { status = code; return this; }, json() {} };
  await middleware({ chatUserId: 7, body: { sessionId: "-".repeat(36) } }, res, () => assert.fail());
  assert.equal(status, 400);
});

// Incidente real (Michel, 08/10): com o Gemini sem timeout o chat travou 5
// minutos, o navegador desistiu, e o log registrou "A conversa foi
// atualizada em outra requisicao" — sem nenhuma outra requisicao existir.
//
// O culpado era o res.on("close"): ele assumia socket fechado = requisicao
// morta e liberava o lease. O handler continuava vivo e ainda ia gravar;
// quando chegou no res.json, a gravacao final (WHERE lease=$3) nao achou
// mais o PROPRIO lease, rowCount 0, e o briefing do turno foi perdido.
test("cliente que desiste nao libera o lease embaixo do handler vivo", async () => {
  const queries: Array<{ sql: string; params: any[] }> = [];
  let fecharSocket!: () => void;
  let payload: any;
  let erro: unknown;
  let resolve!: () => void;
  const finished = new Promise<void>(r => { resolve = r; });

  // O sinal de conclusao NAO pode ser `res.json`: o ponto do teste e que,
  // com o cliente fora, nada e escrito no socket. Quem sinaliza e a
  // gravacao final do estado.
  const middleware = createChatSessionMiddleware(async () => ({ async query(sql: string, params: any[] = []) {
    queries.push({ sql, params });
    if (sql.includes("SET state=$4::jsonb")) resolve();
    return { rowCount: 1, rows: sql.includes("RETURNING state") ? [{ state: { briefing: {} } }] : [] };
  } }));

  const res: any = {
    json(value: any) { payload = value; },
    on(evento: string, cb: () => void) { if (evento === "close") fecharSocket = cb; },
  };

  await middleware({ chatUserId: 7, body: { sessionId } }, res, async (error?: unknown) => {
    if (error) { erro = error; resolve(); return; }
    // O navegador desiste ENQUANTO o handler ainda esta trabalhando.
    fecharSocket();
    const liberou = queries.filter(q => q.sql.includes("lease=NULL,busy_until=NULL"));
    assert.equal(liberou.length, 0, "o close nao pode liberar o lease com o handler vivo");
    // Agora o handler termina, como terminaria no caso real.
    res.json({ resposta: "ok" });
  });
  await finished;

  assert.equal(erro, undefined, "a gravacao final tem que achar o proprio lease e salvar");
  const final = queries.at(-1)!;
  assert.match(final.sql, /SET state=\$4::jsonb/, "o estado do briefing precisa ter sido gravado");
  assert.match(final.sql, /lease=\$3/);
  // Cliente ja foi: nao faz sentido escrever no socket morto. O que
  // importava era a gravacao, e ela aconteceu.
  assert.equal(payload, undefined);
});

// A metade que protege: o close AINDA tem que liberar o lease quando nao ha
// trabalho pendente, senao uma conversa abandonada fica travada em 409 ate
// o busy_until expirar.
test("close depois do trabalho terminado nao deixa lease preso", async () => {
  const queries: Array<{ sql: string; params: any[] }> = [];
  let fecharSocket!: () => void;
  let resolve!: () => void;
  const finished = new Promise<void>(r => { resolve = r; });
  const middleware = createChatSessionMiddleware(async () => ({ async query(sql: string, params: any[] = []) {
    queries.push({ sql, params });
    return { rowCount: 1, rows: sql.includes("RETURNING state") ? [{ state: { briefing: {} } }] : [] };
  } }));
  const res: any = {
    json() { resolve(); },
    on(evento: string, cb: () => void) { if (evento === "close") fecharSocket = cb; },
  };
  await middleware({ chatUserId: 7, body: { sessionId } }, res, (error?: unknown) => {
    assert.equal(error, undefined);
    res.json({ resposta: "ok" });
  });
  await finished;
  // O close chega depois da resposta, como no caminho normal.
  assert.doesNotThrow(() => fecharSocket());
  // A gravacao final ja zerou lease e busy_until; nao precisa de outra.
  assert.match(queries.at(-1)!.sql, /lease=NULL, busy_until=NULL/);
});

// A mensagem antiga era "A conversa foi atualizada em outra requisicao.
// Confira suas campanhas antes de tentar novamente." As duas metades
// enganavam: nao havia outra requisicao, e mandar conferir campanhas
// sugeria escrita em campanha quando o que falhou foi so o estado.
test("quando outro envio REALMENTE assume, a mensagem nao manda conferir campanhas", async () => {
  let erro: any;
  let resolve!: () => void;
  const finished = new Promise<void>(r => { resolve = r; });
  const middleware = createChatSessionMiddleware(async () => ({ async query(sql: string) {
    if (sql.includes("RETURNING state")) return { rowCount: 1, rows: [{ state: { briefing: {} } }] };
    // rowCount 0 = o lease nao e mais desta requisicao.
    return { rowCount: 0, rows: [] };
  } }));
  const res: any = { json() {}, on() {} };
  await middleware({ chatUserId: 7, body: { sessionId } }, res, (error?: unknown) => {
    // Primeira passagem sem erro: o handler responde, disparando a
    // gravacao final que vai achar rowCount 0. O erro volta por aqui.
    if (!error) { res.json({ resposta: "ok" }); return; }
    erro = error; resolve();
  });
  await finished;
  assert.ok(erro instanceof Error);
  assert.doesNotMatch(erro.message, /Confira suas campanhas/i, "nao pode sugerir escrita em campanha");
  assert.match(erro.message, /Nenhuma campanha foi criada, alterada ou publicada/i);
  assert.match(erro.message, /Reenvie a mensagem/i, "precisa dizer o que fazer");
});
