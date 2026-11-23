import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comLivroDeFerramentas, executarUmaVez, chaveEstavel } from "../chatToolLedger";
import { executarCadeia, SaudeDosProvedores, type Provedor } from "../chatProviderChain";
import { localConversationReply, INICIO_RESPOSTA_SEM_IA } from "../chatReasoning";

// F3/F4 (auditoria 23/11): troca de provedor sem repetir efeitos, falha de modelo
// com janela para qualquer provedor, teto de tempo e resposta sem IA que nao se repete.

// ── Hipotese: a troca de provedor repete a ferramenta com efeito ────────────────

test("F4 hipotese: sem o livro, o provedor B repete a ferramenta que o provedor A ja executou (modelo do fluxo antigo)", async () => {
  let efeitos = 0;
  const ferramenta = async () => { efeitos++; return { ok: true }; };
  const provedorA = async () => { await ferramenta(); throw new Error("503 high demand na rodada seguinte"); };
  const provedorB = async () => { await ferramenta(); return "ok"; };
  await provedorA().catch(() => {});
  await provedorB();
  assert.equal(efeitos, 2, "sem protecao, o efeito acontece duas vezes");
});

test("F4: com o livro, o provedor B recebe o resultado do A e o efeito acontece uma vez", async () => {
  await comLivroDeFerramentas(async () => {
    let efeitos = 0;
    const ferramenta = () => executarUmaVez(1, "anexar_video_criativo", { campaignId: 7, creativeIndex: 0, videoUrl: "u" }, async () => { efeitos++; return { ok: true, videoId: "v1" }; });
    const provedorA = async () => { await ferramenta(); throw new Error("fetch failed"); };
    const provedorB = async () => ferramenta();
    await provedorA().catch(() => {});
    const r: any = await provedorB();
    assert.equal(efeitos, 1);
    assert.equal(r.videoId, "v1");
    assert.equal(r.jaExecutadoNesteAtendimento, true);
  });
});

test("F4: falha nao e guardada (tentar de novo e legitimo); confirmacao pendente tambem nao", async () => {
  await comLivroDeFerramentas(async () => {
    let n = 0;
    const r1: any = await executarUmaVez(1, "atualizar_orcamento_campanha", { campaignId: 1, budgetDaily: 50 }, async () => { n++; return { erro: "campanha invalida" }; });
    const r2: any = await executarUmaVez(1, "atualizar_orcamento_campanha", { campaignId: 1, budgetDaily: 50 }, async () => { n++; return { ok: true }; });
    assert.equal(n, 2); assert.ok(r1.erro); assert.equal(r2.ok, true);
    let p = 0;
    await executarUmaVez(1, "publicar_campanha", { campaignId: 1 }, async () => { p++; return { ok: false, confirmationRequired: true }; });
    await executarUmaVez(1, "publicar_campanha", { campaignId: 1 }, async () => { p++; return { ok: false, confirmationRequired: true }; });
    assert.equal(p, 2, "pedir confirmacao duas vezes nao e repetir efeito");
    let t = 0;
    await executarUmaVez(1, "editar_criativo", { a: 1 }, async () => { t++; throw new Error("boom"); }).catch(() => {});
    await executarUmaVez(1, "editar_criativo", { a: 1 }, async () => { t++; return { ok: true }; });
    assert.equal(t, 2, "excecao nao fica guardada");
  });
});

test("F4: argumentos diferentes, usuarios diferentes e consultas nao sao deduplicados; chamadas simultaneas identicas esperam a primeira", async () => {
  await comLivroDeFerramentas(async () => {
    let n = 0;
    const run = async () => { n++; await new Promise((r) => setTimeout(r, 5)); return { ok: true, n }; };
    await executarUmaVez(1, "editar_criativo", { x: 1 }, run);
    await executarUmaVez(1, "editar_criativo", { x: 2 }, run);
    await executarUmaVez(2, "editar_criativo", { x: 1 }, run);
    assert.equal(n, 3);
    let c = 0;
    await executarUmaVez(1, "consultar_projetos_campanhas", {}, async () => { c++; return { ok: true }; });
    await executarUmaVez(1, "consultar_projetos_campanhas", {}, async () => { c++; return { ok: true }; });
    assert.equal(c, 2, "consulta le o estado atual de novo");
    let s = 0;
    const [a, b]: any[] = await Promise.all([
      executarUmaVez(1, "publicar_campanha", { id: 9 }, async () => { s++; await new Promise((r) => setTimeout(r, 10)); return { ok: true }; }),
      executarUmaVez(1, "publicar_campanha", { id: 9 }, async () => { s++; return { ok: true }; }),
    ]);
    assert.equal(s, 1); assert.equal(a.ok && b.ok, true);
  });
});

test("F4: gerar_campanha gera um rascunho por atendimento mesmo que o segundo provedor reescreva o pedido", async () => {
  await comLivroDeFerramentas(async () => {
    let criados = 0;
    const gerar = (args: any) => executarUmaVez(1, "gerar_campanha", args, async () => { criados++; return { ok: true, campanha: { id: 900 + criados } }; }, { sessionId: 33 });
    const a: any = await gerar({ projectName: "X", budget: 900, objective: "leads" });
    const b: any = await gerar({ projectName: "X ", budget: "900", objective: "Leads", extra: "texto diferente" });
    assert.equal(criados, 1);
    assert.equal(b.campanha.id, a.campanha.id);
  });
});

test("F4: fora de um atendimento o livro nao interfere, e a chave dos argumentos e estavel", async () => {
  let n = 0;
  await executarUmaVez(1, "editar_criativo", { a: 1 }, async () => { n++; return { ok: true }; });
  await executarUmaVez(1, "editar_criativo", { a: 1 }, async () => { n++; return { ok: true }; });
  assert.equal(n, 2);
  assert.equal(chaveEstavel({ b: 1, a: [1, { d: 1, c: 2 }] }), chaveEstavel({ a: [1, { c: 2, d: 1 }], b: 1 }));
});

test("F4: todo ponto de despacho de ferramenta com efeito em chat.ts passa pelo livro", () => {
  const fonte = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  // Esperado: so a chamada dentro do invólucro (+ a definicao, nas funcoes locais).
  const esperado: Record<string, number> = { atualizarOrcamentoCampanhaBruto: 1, definirFotoDestaqueBruto: 1, generateChatImageBruto: 1, publicarCampanhaNaMetaBruto: 1, executarGeracaoCampanhaBruta: 2, executarEdicaoDeCriativoBruto: 3 };
  for (const [bruto, n] of Object.entries(esperado)) {
    const usos = fonte.split("\n").filter((l) => new RegExp(`\\b${bruto}\\(`).test(l)).length;
    assert.equal(usos, n, `${bruto} chamado fora do invólucro (${usos} linhas, esperado ${n})`);
  }
  assert.match(fonte, /executarUmaVez\(userId, "atualizar_orcamento_campanha"/);
  assert.match(fonte, /executarUmaVez\(userId, "gerar_campanha"/);
  assert.match(fonte, /toolLedger\.run\(novoLivro\(\)/);
});

// ── Cadeia de provedores ────────────────────────────────────────────────────────

function prov(id: string, tentar: () => Promise<string>, indisponivel: string | null = null): Provedor<string> {
  return { id, indisponivelPorque: () => indisponivel, tentar };
}

test("F4: primeiro que responde vence; os demais nao sao chamados; motivos dos pulos sao registrados", async () => {
  const chamados: string[] = [];
  const r = await executarCadeia([
    prov("gemini", async () => { chamados.push("gemini"); throw new Error('{"code":503} high demand'); }),
    prov("cloudflare", async () => { chamados.push("cloudflare"); return "resposta"; }),
    prov("deepseek", async () => { chamados.push("deepseek"); return "nao deveria"; }),
  ], { saude: new SaudeDosProvedores() });
  assert.equal(r.ok, true);
  if (r.ok === true) { assert.equal(r.provedor, "cloudflare"); assert.equal(r.falhas[0].id, "gemini"); }
  assert.deepEqual(chamados, ["gemini", "cloudflare"]);
});

test("F4: falha de modelo em QUALQUER provedor abre janela curta; erro de requisicao (400) nao abre", async () => {
  let t = 1_000;
  const saude = new SaudeDosProvedores(() => t, 90_000);
  let cf = 0, groq = 0;
  const cadeia = () => executarCadeia([
    prov("cloudflare", async () => { cf++; throw new Error("This operation was aborted"); }),
    prov("groq", async () => { groq++; throw new Error("400 invalid request"); }),
    prov("openrouter", async () => "ok"),
  ], { saude, agora: () => t });
  await cadeia();
  assert.equal(cf, 1);
  await cadeia();
  assert.equal(cf, 2, "uma falha isolada nao tira o provedor de todo mundo: segunda ainda tenta");
  await cadeia();
  assert.equal(cf, 2, "duas falhas seguidas abrem a espera curta");
  assert.equal(groq, 3, "400 e defeito nosso: segue tentando");
  t += 91_000;
  await cadeia();
  assert.equal(cf, 3, "passada a janela, tenta de novo");
});

test("F4: teto de tempo impede iniciar novos provedores e cada provedor e tentado uma vez", async () => {
  let t = 0;
  const contagem: Record<string, number> = {};
  const lento = (id: string) => prov(id, async () => { contagem[id] = (contagem[id] || 0) + 1; t += 40_000; throw new Error("fetch failed"); });
  const r = await executarCadeia([lento("a"), lento("b"), lento("c"), lento("d")], { saude: new SaudeDosProvedores(() => t), agora: () => t, tetoMs: 75_000 });
  assert.equal(r.ok, false);
  if (r.ok === false) {
    assert.equal(r.esgotouTempo, true);
    assert.deepEqual(r.falhas.map((f) => f.motivo), ["falhou", "falhou", "sem_tempo", "sem_tempo"]);
  }
  assert.deepEqual(contagem, { a: 1, b: 1 });
});

test("F4: provedor nao configurado e saldo em cooldown sao pulados com o motivo", async () => {
  const r = await executarCadeia([
    prov("deepseek", async () => "x", "em cooldown de 15min apos erro de saldo (402)"),
    prov("groq", async () => "x", "GROQ_API_KEY nao configurada"),
  ], { saude: new SaudeDosProvedores() });
  assert.equal(r.ok, false);
  if (r.ok === false) assert.deepEqual(r.falhas.map((f) => f.motivo), ["pulado", "pulado"]);
});

// ── Resposta sem IA ─────────────────────────────────────────────────────────────

const briefing = { projectName: "Clinica Sorriso", objective: "leads", platform: "meta", city: "Joinville" };
const falhas = [{ id: "gemini", motivo: "falhou" as const }, { id: "cloudflare", motivo: "falhou" as const }];

test("F3: pedidos diferentes recebem respostas diferentes e preservam o briefing", () => {
  const a = localConversationReply("quero anunciar minha clinica", briefing, { falhas });
  const b = localConversationReply("faca uma campanha de leads de R$ 50 por dia", briefing, { falhas });
  const c = localConversationReply("qual conta de anuncios eu uso?", briefing, { falhas });
  const d = localConversationReply("me explique o que e CPM", briefing, { falhas });
  assert.ok(new Set([a, b, c, d]).size >= 3, "intencoes diferentes (campanha, conta, outra) geram respostas diferentes");
  assert.notEqual(c, d);
  for (const r of [a, b, c, d]) { assert.match(r, /Clinica Sorriso/); assert.match(r, /Joinville/); assert.match(r, /nao executei nenhuma acao/i); }
  assert.match(a, /faltam: Orcamento total \(R\$\), Duracao \(dias\)/);
  assert.match(a, /Preparar campanha/);
});

test("F3: a mesma pergunta repetida nunca recebe a mesma resposta e a orientacao escala", () => {
  const historico: Array<{ role: string; content: string }> = [];
  const vistas = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const r = localConversationReply("cria a campanha", briefing, { mensagens: historico, falhas });
    assert.equal(vistas.has(r), false, `resposta repetida na tentativa ${i + 1}`);
    vistas.add(r);
    assert.ok(r.startsWith(INICIO_RESPOSTA_SEM_IA));
    historico.push({ role: "user", content: "cria a campanha" }, { role: "assistant", content: r });
  }
  const quarta = [...vistas][3];
  assert.match(quarta, /alguns minutos/);
  assert.match(quarta, /tela de campanhas/);
});

test("F3: a causa vem em linguagem do usuario, sem nome de provedor ou chave", () => {
  const semTempo = localConversationReply("oi", {}, { falhas: [{ id: "gemini", motivo: "sem_tempo" }] });
  const nenhum = localConversationReply("oi", {}, { falhas: [{ id: "gemini", motivo: "pulado", detalhe: "GEMINI_API_KEY nao configurada" }] });
  assert.match(semTempo, /demoraram demais/);
  assert.match(nenhum, /nenhum provedor esta disponivel/);
  for (const r of [semTempo, nenhum]) assert.doesNotMatch(r, /gemini|cloudflare|deepseek|groq|openrouter|API_KEY/i);
});

test("F3: sem dados salvos a resposta diz isso e nao inventa campos", () => {
  const r = localConversationReply("resuma o briefing", {});
  assert.match(r, /nao ha dados/i);
  assert.doesNotMatch(r, /Projeto:|Orcamento total \(R\$\):/);
});

test("F4 (Goldfish): A(100), B(200), A(100) no mesmo provedor executa o terceiro; troca de provedor repete em ordem sem duplicar", async () => {
  await comLivroDeFerramentas(async () => {
    const { iniciarNovaTentativaDoLivro } = await import("../chatToolLedger");
    let valor = 0; let efeitos = 0;
    const orc = (v: number) => executarUmaVez(1, "atualizar_orcamento_campanha", { campaignId: 1, budgetDaily: v }, async () => { efeitos++; valor = v; return { ok: true }; });
    iniciarNovaTentativaDoLivro();
    await orc(100); await orc(200); await orc(100);
    assert.equal(valor, 100, "o terceiro pedido e novo e precisa valer");
    assert.equal(efeitos, 3);
    // provedor 2 refaz o turno inteiro: nada novo acontece
    iniciarNovaTentativaDoLivro();
    const r1: any = await orc(100); const r2: any = await orc(200); const r3: any = await orc(100);
    assert.equal(efeitos, 3, "replay nao executa de novo");
    assert.ok(r1.jaExecutadoNesteAtendimento && r2.jaExecutadoNesteAtendimento && r3.jaExecutadoNesteAtendimento);
    assert.equal(valor, 100);
  });
});

test("F4 (Goldfish): executarCadeia avisa o inicio de cada provedor", async () => {
  const iniciados: string[] = [];
  await executarCadeia([
    { id: "a", indisponivelPorque: () => null, tentar: async () => { throw new Error("x"); } },
    { id: "b", indisponivelPorque: () => null, tentar: async () => "ok" },
  ], { saude: new SaudeDosProvedores(), aoIniciarProvedor: (id) => iniciados.push(id) });
  assert.deepEqual(iniciados, ["a", "b"]);
});
