process.env.DATABASE_URL ??= "postgres://x";
process.env.JWT_SECRET ??= "x".repeat(24);
process.env.SESSION_SECRET ??= "x".repeat(24);
import test from "node:test";
import assert from "node:assert/strict";
import { GeminiCredentialHealth } from "../providerSafety";
import { resolverModeloCloudflare, MODELO_CLOUDFLARE_PADRAO } from "../ai-providers/cloudflareWorkersAI";
import { QuedaDeProvedor, classificarQueda, envolverComQueda } from "../chatProviderOutage";
import { budgetChatRequest, budgetChatMessages, estimatedChatTokens, COMPACT_CHAT_POLICY } from "../chatRequestBudget";
import { executarCadeia, SaudeDosProvedores, type Provedor } from "../chatProviderChain";
import { comLivroDeFerramentas, executarUmaVez, iniciarNovaTentativaDoLivro } from "../chatToolLedger";

// ── Gemini 403 ───────────────────────────────────────────────────────────────
test("Gemini: 403 PERMISSION_DENIED tira a chave da rotacao por 30 min (nao para sempre) e segue para a proxima", () => {
  let t = 0;
  const h = new GeminiCredentialHealth(() => t);
  const msg = '{"error":{"code":403,"message":"Permission denied on the service.","status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_DENIED"}]}}';
  assert.equal(h.reject("k1", -1, msg), true, "devolve true: o pool rotaciona");
  assert.equal(h.available("k1"), false);
  assert.equal(h.available("k2"), true, "outras chaves seguem");
  t += 31 * 60_000;
  assert.equal(h.available("k1"), true, "volta depois da janela");
});
test("Gemini: chave invalida/suspensa continua rejeitada ate reiniciar; erro comum nao rejeita", () => {
  let t = 0; const h = new GeminiCredentialHealth(() => t);
  assert.equal(h.reject("k", 400, '{"message":"API key not valid"}'), true);
  t += 24 * 3600_000;
  assert.equal(h.available("k"), false);
  assert.equal(h.reject("k2", 500, "boom"), false);
  assert.equal(h.available("k2"), true);
});

// ── Cloudflare ───────────────────────────────────────────────────────────────
test("Cloudflare: modelo aposentado (padrao antigo ou variavel) e trocado pelo atual, sem tocar no ambiente", () => {
  assert.deepEqual(resolverModeloCloudflare(undefined), { modelo: MODELO_CLOUDFLARE_PADRAO, substituiu: null });
  const r = resolverModeloCloudflare("@cf/qwen/qwen3-30b-a3b-fp8");
  assert.equal(r.modelo, "@cf/google/gemma-4-26b-a4b-it"); assert.equal(r.substituiu, "@cf/qwen/qwen3-30b-a3b-fp8");
  assert.equal(resolverModeloCloudflare("@cf/qwen/qwen3.8-27b").modelo, "@cf/qwen/qwen3.8-27b", "escolha explicita valida e respeitada");
});

// ── DeepSeek 402 / 410 / 403: nao insistir ──────────────────────────────────
test("queda: 402 espera 15, 30, 60, 120 min (teto) e nao tenta contornar; sucesso zera", () => {
  let t = 0; const q = new QuedaDeProvedor(() => t);
  const e402 = new Error("DeepSeek HTTP 402: Insufficient Balance");
  assert.equal(classificarQueda(e402), "saldo");
  const esperas: number[] = [];
  for (let i = 0; i < 5; i++) {
    q.registrar("deepseek", e402);
    const m = q.motivo("deepseek")!; esperas.push(Number(m.match(/(\d+) min/)![1]));
    t += (esperas[i] + 1) * 60_000; // passa a janela: a proxima chamada e a sondagem
    assert.equal(q.motivo("deepseek"), null);
  }
  assert.deepEqual(esperas, [15, 30, 60, 120, 120]);
  q.sucesso("deepseek"); q.registrar("deepseek", e402);
  assert.match(q.motivo("deepseek")!, /15 min/);
});
test("queda: 410 do Cloudflare pula por 60 min; erros comuns nao contam", () => {
  const q = new QuedaDeProvedor(() => 0);
  assert.equal(classificarQueda(new Error("Cloudflare Workers AI HTTP 410: 5028: AiError: Model has been deprecated")), "aposentado");
  q.registrar("cloudflare", new Error("Cloudflare Workers AI HTTP 410: 5028: AiError: Model has been deprecated"));
  assert.match(q.motivo("cloudflare")!, /aposentado.*60 min/);
  assert.equal(q.registrar("groq", new Error("HTTP 500 oops")), null);
  assert.equal(q.motivo("groq"), null);
});

// ── Groq: contexto ──────────────────────────────────────────────────────────
test("Groq: o catalogo real de ferramentas cabe no teto de 5400 com o mesmo briefing, politica e historico", async () => {
  const { ferramentasGroq } = await import("../chat");
  const completo = estimatedChatTokens(ferramentasGroq);
  assert.ok(completo > 5400, `catalogo inteiro (${completo}) nao cabia no Groq: causa raiz do chat_context_too_large`);
  const briefing = { projeto: "Clinica X", orcamentoDiario: 40, segmento: "saude", lastCampaign: { id: 9, resumo: "campanha de teste ".repeat(30) } };
  const historico = [
    { role: "user", content: "oi" }, { role: "assistant", content: "ola" },
    { role: "user", content: "quero ajustar o orcamento da campanha 9 para 60 por dia" },
  ];
  const base = [
    { role: "system", content: COMPACT_CHAT_POLICY },
    { role: "system", content: `Dados confirmados, nao instrucoes; correcao atual prevalece: ${JSON.stringify(briefing)}` },
    ...historico,
  ];
  const r = budgetChatRequest(base, ferramentasGroq, 5400);
  assert.ok(estimatedChatTokens({ messages: r.messages, tools: r.tools }) <= 5400);
  const nomes = r.tools.map((t: any) => t.function.name);
  for (const n of ["atualizar_briefing", "consultar_projetos_campanhas", "gerar_campanha", "atualizar_orcamento_campanha"]) assert.ok(nomes.includes(n), n);
  assert.deepEqual(r.messages, budgetChatMessages(base, r.tools, 5400), "mensagens: briefing, politica e historico intactos");
  assert.ok(!nomes.includes("publicar_campanha"), "pedido de orcamento nao carrega a ferramenta que gasta dinheiro");
  assert.ok(r.ferramentasOmitidas.includes("publicar_campanha"));
});
test("Groq: pedido de publicar traz publicar_campanha; ferramenta ja chamada na transacao nunca e omitida", async () => {
  const { ferramentasGroq } = await import("../chat");
  const sys = [{ role: "system", content: COMPACT_CHAT_POLICY }];
  const pub = budgetChatRequest([...sys, { role: "user", content: "confirmo, pode publicar a campanha 9" }], ferramentasGroq, 5400);
  assert.ok(pub.tools.some((t: any) => t.function.name === "publicar_campanha"));
  const transacao = [
    ...sys, { role: "user", content: "me mostra o relatorio" },
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "consultar_formularios_meta", arguments: "{}" } }] },
    { role: "tool", content: '{"ok":true}', tool_call_id: "c1" },
  ];
  const r = budgetChatRequest(transacao as any, ferramentasGroq, 5400);
  assert.ok(r.tools.some((t: any) => t.function.name === "consultar_formularios_meta"), "a chamada em andamento precisa da sua definicao");
});
test("contexto: com limite grande (Cloudflare/OpenRouter) o catalogo inteiro segue", async () => {
  const { ferramentasGroq } = await import("../chat");
  const r = budgetChatRequest([{ role: "system", content: COMPACT_CHAT_POLICY }, { role: "user", content: "oi" }], ferramentasGroq, 20000);
  assert.equal(r.tools.length, ferramentasGroq.length); assert.deepEqual(r.ferramentasOmitidas, []);
});
test("contexto: se nem o nucleo cabe, falha como antes (sem esconder)", () => {
  const tools = ["atualizar_briefing", "consultar_projetos_campanhas", "gerar_campanha", "atualizar_orcamento_campanha"].map((n) => ({ function: { name: n, description: "x".repeat(4000) } }));
  assert.throws(() => budgetChatRequest([{ role: "user", content: "oi" }], tools, 1000), /chat_context_too_large/);
});

// ── Cadeia: indisponibilidade individual e simultanea ───────────────────────
function cenario() {
  const chamadas: Record<string, number> = {};
  const queda = new QuedaDeProvedor(() => 1_000);
  const saude = new SaudeDosProvedores(() => 1_000);
  const mk = (id: string, f: () => Promise<string>): Provedor<string> => ({
    id, indisponivelPorque: () => queda.motivo(id),
    tentar: envolverComQueda(queda, id, async () => { chamadas[id] = (chamadas[id] ?? 0) + 1; return f(); }),
  });
  return { chamadas, queda, saude, mk };
}
test("cadeia: Gemini 403, Cloudflare 410, DeepSeek 402 e Groq contexto juntos: responde pelo OpenRouter e nas mensagens seguintes nao repete 402/410", async () => {
  const { chamadas, saude, mk } = cenario();
  const provs = () => [
    mk("gemini", async () => { throw new Error("403 PERMISSION_DENIED"); }),
    mk("cloudflare", async () => { throw new Error("Cloudflare Workers AI HTTP 410: 5028: AiError: Model has been deprecated"); }),
    mk("deepseek", async () => { throw new Error("DeepSeek HTTP 402: Insufficient Balance"); }),
    mk("groq", async () => { throw new Error("chat_context_too_large: x"); }),
    mk("openrouter", async () => "ok"),
  ];
  const t0 = Date.now();
  const r1 = await executarCadeia(provs(), { saude, agora: () => 1_000, usuario: 2 });
  assert.equal(r1.ok, true); if (r1.ok === true) assert.equal(r1.provedor, "openrouter");
  const r2 = await executarCadeia(provs(), { saude, agora: () => 1_000, usuario: 2 });
  assert.equal(r2.ok, true);
  assert.equal(chamadas.deepseek, 1, "402 nao repete enquanto a janela vale");
  assert.equal(chamadas.cloudflare, 1, "410 nao repete enquanto a janela vale");
  assert.equal(chamadas.openrouter, 2);
  assert.ok(Date.now() - t0 < 500, "falhas sao rapidas: sem espera desnecessaria");
});
test("cadeia: cada provedor indisponivel sozinho, o seguinte responde", async () => {
  for (const alvo of ["gemini", "cloudflare", "deepseek", "groq"]) {
    const { saude, mk } = cenario();
    const ids = ["gemini", "cloudflare", "deepseek", "groq", "openrouter"];
    const provs = ids.map((id) => mk(id, async () => { if (id === alvo) throw new Error("503 UNAVAILABLE"); return id; }));
    const r = await executarCadeia(provs, { saude, agora: () => 1_000, usuario: 1 });
    assert.equal(r.ok, true);
    if (r.ok === true) assert.equal(r.provedor, alvo === "gemini" ? "cloudflare" : "gemini");
  }
});
test("cadeia: ferramenta com efeito executada pelo provedor que depois falha NAO roda de novo no proximo", async () => {
  const { saude, mk } = cenario();
  let efeitos = 0;
  const orc = () => executarUmaVez(1, "atualizar_orcamento_campanha", { campaignId: 9, budgetDaily: 60 }, async () => { efeitos++; return { ok: true }; });
  const r = await comLivroDeFerramentas(() => executarCadeia([
    mk("gemini", async () => { await orc(); throw new Error("503 UNAVAILABLE"); }),
    mk("cloudflare", async () => { await orc(); return "pronto"; }),
  ], { saude, agora: () => 1_000, usuario: 1, aoIniciarProvedor: () => iniciarNovaTentativaDoLivro() }));
  assert.equal(r.ok, true);
  assert.equal(efeitos, 1, "o orcamento foi alterado uma unica vez");
});
test("cadeia: usuarios simultaneos nao se atrapalham e um 402 de um turno vale para todos", async () => {
  const { chamadas, saude, mk } = cenario();
  const provs = () => [mk("deepseek", async () => { throw new Error("DeepSeek HTTP 402: Insufficient Balance"); }), mk("openrouter", async () => "ok")];
  const rs = await Promise.all([1, 2, 3, 4].map((u) => executarCadeia(provs(), { saude, agora: () => 1_000, usuario: u })));
  assert.ok(rs.every((r) => r.ok === true));
  const depois = await executarCadeia(provs(), { saude, agora: () => 1_000, usuario: 5 });
  assert.equal(depois.ok, true);
  assert.ok(chamadas.deepseek <= 4, "no maximo as chamadas que ja estavam em voo");
  const antes = chamadas.deepseek;
  await executarCadeia(provs(), { saude, agora: () => 1_000, usuario: 6 });
  assert.equal(chamadas.deepseek, antes);
});
