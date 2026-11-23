import test from "node:test";
import assert from "node:assert/strict";
import { codigoDoErro, montarEvento, registrarTentativa, registrarResumo, novoRequestId, type EventoDeTentativa } from "../chatProviderTelemetry";
import { executarCadeia, SaudeDosProvedores, type Provedor } from "../chatProviderChain";
import { comLivroDeFerramentas, executarUmaVez, iniciarNovaTentativaDoLivro } from "../chatToolLedger";

const SEGREDO = "AIzaSyD-SEGREDO-123456789";
const PROMPT = "meu cpf e 123.456.789-00 e quero anunciar a clinica da Maria";
const CHAVES_PERMITIDAS = new Set(["requestId", "provedor", "modelo", "tentativa", "resultado", "ms", "codigoErro", "fallback"]);
const CHAVES_RESUMO = new Set(["requestId", "resultado", "provedorFinal", "modeloFinal", "tentativas", "fallback", "totalMs"]);

function coletor() {
  const linhas: Array<{ nivel: string; area: string; msg: string; meta: Record<string, unknown> }> = [];
  const emissor = {
    info: (area: string, msg: string, meta: Record<string, unknown>) => linhas.push({ nivel: "info", area, msg, meta }),
    warn: (area: string, msg: string, meta: Record<string, unknown>) => linhas.push({ nivel: "warn", area, msg, meta }),
  };
  return { linhas, emissor };
}
const prov = (id: string, modelo: string, f: () => Promise<string>, motivo: string | null = null): Provedor<string> => ({ id, modelo: () => modelo, indisponivelPorque: () => motivo, tentar: f });

function cadeiaComTelemetria(provs: Array<Provedor<string>>, extra: Record<string, unknown> = {}) {
  let t = 1_000;
  const { linhas, emissor } = coletor();
  const requestId = novoRequestId();
  const avancar = (ms: number) => { t += ms; };
  const r = executarCadeia(provs, {
    saude: new SaudeDosProvedores(() => t), agora: () => t, usuario: 7,
    telemetria: { requestId, aoTentativa: (e) => registrarTentativa(emissor, e), aoConcluir: (x) => registrarResumo(emissor, x) }, ...extra,
  });
  return { r, linhas, requestId, avancar, get agora() { return t; } };
}

test("codigoDoErro: devolve so codigo de vocabulario fechado, nunca texto do erro", () => {
  const casos: Array<[unknown, string]> = [
    [new Error("DeepSeek HTTP 402: Insufficient Balance"), "http_402"],
    [new Error("Cloudflare Workers AI HTTP 410: 5028: AiError: Model has been deprecated"), "http_410"],
    [new Error('{"error":{"code":403,"message":"Permission denied on the service."}}'), "http_403"],
    [new Error("chat_context_too_large: reduza o texto"), "contexto_grande"],
    [new Error("This operation was aborted"), "timeout"],
    [new Error("fetch failed"), "rede"],
    [new Error("503 UNAVAILABLE high demand"), "modelo_indisponivel"],
    [new Error("429 RESOURCE_EXHAUSTED"), "http_429"],
    [new Error("RESOURCE_EXHAUSTED: quota"), "cota"],
    [new Error("HTTP 502 bad gateway"), "http_5xx"],
    [new Error("algo estranho"), "desconhecido"],
  ];
  for (const [erro, esperado] of casos) assert.equal(codigoDoErro(erro), esperado);
  for (const msg of [`Bearer ${SEGREDO}`, `HTTP 500 ${PROMPT}`, `api_key=${SEGREDO} ${PROMPT}`]) {
    const c = codigoDoErro(new Error(msg));
    assert.match(c, /^[a-z0-9_]+$/); assert.ok(!c.includes("SEGREDO") && !c.includes("cpf") && !c.includes("Maria"));
  }
});

test("montarEvento: lista fixa de campos; campos extras (prompt, token, usuario) sao descartados e valores saneados", () => {
  const suja = { requestId: "abc\n[INJETADO]", provedor: `gemini ${SEGREDO}`, modelo: "m", tentativa: 2, resultado: "ok", ms: 12.7, fallback: true,
    prompt: PROMPT, resposta: "texto da IA", token: SEGREDO, usuario: "maria@x.com", authorization: `Bearer ${SEGREDO}`, detalhe: PROMPT } as unknown as EventoDeTentativa;
  const ev = montarEvento(suja);
  assert.ok(Object.keys(ev).every((k) => CHAVES_PERMITIDAS.has(k)), Object.keys(ev).join());
  const json = JSON.stringify(ev);
  for (const proibido of [PROMPT, "texto da IA", "maria@x.com", "Bearer", "\n"]) assert.ok(!json.includes(proibido), proibido);
  assert.ok(!/\s/.test(ev.requestId), "sem quebra de linha: nao forja linha de log");
  assert.equal(ev.ms, 13);
});

test("cadeia: um requestId correlaciona todas as tentativas; modelo, tempo, fallback e codigo de erro corretos", async () => {
  let t0 = 0;
  const c = cadeiaComTelemetria([]); // so para pegar o relogio
  void t0; void c;
  let relogio = 1_000;
  const { linhas, emissor } = coletor();
  const saude = new SaudeDosProvedores(() => relogio);
  const rid = novoRequestId();
  const r = await executarCadeia([
    prov("gemini", "gemini-flash-latest", async () => { relogio += 40; throw new Error("403 Permission denied on the service"); }),
    prov("cloudflare", "@cf/google/gemma-4-26b-a4b-it", async () => "x", "modelo aposentado (410)"),
    prov("deepseek", "deepseek-chat", async () => { relogio += 15; throw new Error("DeepSeek HTTP 402: Insufficient Balance"); }),
    prov("groq", "openai/gpt-oss-120b", async () => { relogio += 900; return "resposta"; }),
  ], { saude, agora: () => relogio, usuario: 9, telemetria: { requestId: rid, aoTentativa: (e) => registrarTentativa(emissor, e), aoConcluir: (x) => registrarResumo(emissor, x) } });
  assert.equal(r.ok, true);
  const tent = linhas.filter((l) => l.msg.startsWith("tentativa")).map((l) => l.meta);
  assert.deepEqual(tent.map((m) => [m.provedor, m.resultado, m.codigoErro ?? null, m.fallback]), [
    ["gemini", "falha", "http_403", false], ["cloudflare", "pulado", null, true], ["deepseek", "falha", "http_402", true], ["groq", "ok", null, true],
  ]);
  assert.deepEqual(tent.map((m) => m.tentativa), [1, 2, 3, 4]);
  assert.deepEqual(tent.map((m) => m.ms), [40, 0, 15, 900]);
  assert.equal(tent[3].modelo, "openai/gpt-oss-120b");
  assert.ok(linhas.every((l) => l.meta.requestId === rid), "mesmo requestId em tudo");
  const resumo = linhas.find((l) => l.msg.startsWith("atendimento"))!.meta;
  assert.deepEqual(resumo, { requestId: rid, resultado: "ok", provedorFinal: "groq", modeloFinal: "openai/gpt-oss-120b", tentativas: 4, fallback: true, totalMs: 955 });
  assert.deepEqual(linhas.filter((l) => l.nivel === "info").length, 2, "sucesso da tentativa e do atendimento em info; falhas em warn");
});

test("cadeia: sem fallback quando o primeiro provedor responde; falha total gera resumo falha_total", async () => {
  const a = cadeiaComTelemetria([prov("gemini", "g", async () => "ok")]);
  await a.r;
  assert.equal(a.linhas.find((l) => l.msg.startsWith("tentativa"))!.meta.fallback, false);
  assert.equal(a.linhas.find((l) => l.msg.startsWith("atendimento"))!.meta.fallback, false);
  const b = cadeiaComTelemetria([prov("gemini", "g", async () => { throw new Error("HTTP 500"); }), prov("groq", "q", async () => { throw new Error("HTTP 429"); })]);
  const rb = await b.r;
  assert.equal(rb.ok, false);
  const res = b.linhas.find((l) => l.msg.startsWith("atendimento"))!.meta;
  assert.equal(res.resultado, "falha_total"); assert.equal(res.provedorFinal, null); assert.equal(res.tentativas, 2);
});

test("seguranca: erros com prompt, chave e e-mail nao aparecem em NENHUMA linha de log", async () => {
  const sujo = new Error(`HTTP 400 ${PROMPT} Bearer ${SEGREDO} maria@x.com resposta: "claro, segue a campanha"`);
  const c = cadeiaComTelemetria([prov("gemini", "g", async () => { throw sujo; }), prov("groq", "q", async () => `resposta com ${PROMPT}`)]);
  await c.r;
  const tudo = JSON.stringify(c.linhas);
  for (const proibido of [PROMPT, SEGREDO, "maria@x.com", "claro, segue", "Bearer", "cpf"]) assert.ok(!tudo.includes(proibido), `vazou: ${proibido}`);
  for (const l of c.linhas) {
    const permitidas = l.msg.startsWith("tentativa") ? CHAVES_PERMITIDAS : CHAVES_RESUMO;
    assert.ok(Object.keys(l.meta).every((k) => permitidas.has(k)), `chave fora da lista: ${Object.keys(l.meta)}`);
  }
});

test("passivo: telemetria que lanca erro nao altera resultado nem falha a cadeia", async () => {
  const quebrada = { requestId: "r", aoTentativa: () => { throw new Error("log fora do ar"); }, aoConcluir: () => { throw new Error("log fora do ar"); } };
  const r = await executarCadeia([prov("gemini", "g", async () => { throw new Error("503 UNAVAILABLE"); }), prov("groq", "q", async () => "ok")], { telemetria: quebrada, saude: new SaudeDosProvedores() });
  assert.equal(r.ok, true); if (r.ok === true) { assert.equal(r.provedor, "groq"); assert.equal(r.resultado, "ok"); }
  const { emissor } = coletor();
  const emissorQuebrado = { info: () => { throw new Error("x"); }, warn: () => { throw new Error("x"); } };
  assert.doesNotThrow(() => registrarTentativa(emissorQuebrado, { requestId: "r", provedor: "g", modelo: "m", tentativa: 1, resultado: "ok", ms: 1, fallback: false }));
  assert.doesNotThrow(() => registrarResumo(emissorQuebrado, { requestId: "r", resultado: "ok", provedorFinal: "g", modeloFinal: "m", tentativas: 1, fallback: false, totalMs: 1 }));
  void emissor;
});

test("ferramentas: com ou sem telemetria o efeito roda uma unica vez e o resultado e identico", async () => {
  async function cenario(comTelemetria: boolean) {
    let efeitos = 0; const { linhas, emissor } = coletor();
    const orc = () => executarUmaVez(1, "atualizar_orcamento_campanha", { campaignId: 9, budgetDaily: 60 }, async () => { efeitos++; return { ok: true, valor: 60 }; });
    const r = await comLivroDeFerramentas(() => executarCadeia<unknown>([
      { id: "gemini", modelo: () => "g", indisponivelPorque: () => null, tentar: async () => { await orc(); throw new Error("503 UNAVAILABLE"); } },
      { id: "groq", modelo: () => "q", indisponivelPorque: () => null, tentar: async () => orc() },
    ], { saude: new SaudeDosProvedores(), usuario: 1, aoIniciarProvedor: () => iniciarNovaTentativaDoLivro(),
      ...(comTelemetria ? { telemetria: { requestId: novoRequestId(), aoTentativa: (e: EventoDeTentativa) => registrarTentativa(emissor, e), aoConcluir: (x: never) => registrarResumo(emissor, x) } } : {}) }));
    return { efeitos, r: r.ok === true ? r.resultado : null, provedor: r.ok === true ? r.provedor : null, linhas: linhas.length };
  }
  const com = await cenario(true), sem = await cenario(false);
  assert.equal(com.efeitos, 1); assert.equal(sem.efeitos, 1);
  assert.deepEqual(com.r, sem.r); assert.equal(com.provedor, sem.provedor);
  assert.ok(com.linhas >= 3 && sem.linhas === 0);
});

test("chat.ts liga a telemetria na cadeia com requestId e modelo de cada provedor (sem userId nos eventos)", async () => {
  const { readFileSync } = await import("node:fs");
  const fonte = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  const bloco = fonte.slice(fonte.indexOf("const provedores: Array<Provedor<RespostaChat>>"), fonte.indexOf("if (cadeia.ok === true) return finish"));
  for (const id of ["gemini", "cloudflare", "deepseek", "groq", "openrouter"]) assert.match(bloco, new RegExp(`id: "${id}", modelo: \\(\\) =>`));
  assert.match(bloco, /telemetria: \{ requestId: novoRequestId\(\)/);
  const tel = readFileSync(new URL("../chatProviderTelemetry.ts", import.meta.url), "utf8");
  assert.ok(!/userId|usuario/.test(tel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "telemetria nao carrega usuario");
});
