import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicarNoTikTokDoChat, urlH264, textoAte, ehConfirmacao, valorDiarioDaFala, limparPropostasTikTok, previaPendenteDoTikTok, textoDoResultadoTikTok, type DepsTikTokChat } from "../chatTikTok";
import { conferirEntradaTikTok } from "../tiktokPublicar";
import { validarPublicacaoTikTok } from "../tiktokValidacao";
import type { MinimoTikTok } from "../tiktokOrcamentoMinimo";

// Conta do TikTok falsa (sem rede): identidade autorizada e Pixel com o evento de compra.
interface ContaFalsa { minimo?: MinimoTikTok | null; pixels?: any[] }
function validadorFalso(conta: ContaFalsa = {}) {
  const minimo = conta.minimo === undefined ? { moeda: "BRL", minimo: 110, cotacao: 5.2, fonte: "api" as const } : conta.minimo;
  const pixels = conta.pixels ?? [{ pixel_id: "P1", pixel_name: "Shadia", activity_status: "ACTIVE", events: [{ event_type: "SHOPPING", name: "CompletePayment" }] }];
  const cliente: any = {
    get: async (path: string, params: any) => {
      if (path === "identity/get/") return params.identity_type === "TT_USER" ? { identity_list: [{ identity_id: "I1", identity_type: "TT_USER", display_name: "Shadia Hasan" }] } : { identity_list: [] };
      if (path === "pixel/list/") return { pixels };
      throw new Error("inesperado " + path);
    },
    post: async () => { throw new Error("validacao nao cria nada"); },
  };
  return (_token: string, entrada: any) => validarPublicacaoTikTok(cliente, entrada, {
    minimo: async () => minimo, urlSegura: async () => true, pagina: async () => ({ ok: true, status: 200 }),
    video: { sondar: async () => null, importar: async () => null, aguardar: async () => true },
  });
}

function deps(over: Partial<DepsTikTokChat> = {}, conta: ContaFalsa = {}) {
  const chamadas: string[] = [];
  const d: DepsTikTokChat = {
    campanha: async (id) => (id === 824 ? { id: 824, projectId: 49, name: "Teste — Shadia Hasan", objective: "sales", suggestedBudgetDaily: 6, creatives: JSON.stringify([{ headline: "Autoconhecimento que muda sua rotina" }]) } : null),
    projeto: async () => ({ id: 49, userId: 2, name: "Shadia Hasan" }),
    perfil: async () => ({ websiteUrl: "shadiahasan.com/cursos", companyName: "Shadia Hasan" }),
    integracao: async () => ({ isActive: true, accessToken: "tok", accountId: "7000" }),
    videosDaSessao: async () => [{ url: "https://res.cloudinary.com/x/video/upload/v1/a.mp4", fileName: "IMG_7994.mov" }],
    reservar: async () => ({ kind: "proceed", recordId: 1 }),
    concluir: async () => { chamadas.push("concluir"); },
    falhar: async () => { chamadas.push("falhar"); },
    publicar: async () => { chamadas.push("publicar"); return { campaignId: "c1", adGroupId: "g1", identityId: "i1", ads: [{ adId: "a1", videoId: "v1" }], avisos: [] }; },
    conferir: (e) => conferirEntradaTikTok(e),
    salvarIds: async () => { chamadas.push("salvar"); },
    validar: validadorFalso(conta),
    ...over,
  };
  return { d, chamadas };
}

test("sem confirmado: validacao tecnica e previa com o objetivo do rascunho (vendas com Pixel), nada publicado", async () => {
  const { d, chamadas } = deps();
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  assert.equal(chamadas.includes("publicar"), false);
  assert.match(r.previa.destino, /^https:\/\/shadiahasan\.com\/cursos\?utm_source=tiktok&utm_medium=paid_social/);
  assert.equal(r.previa.status, "nasce PAUSADA");
  assert.match(r.previa.objetivo, /Vendas/);
  assert.match(r.previa.pixel, /Shadia \(P1\), evento Compra/);
  assert.ok(r.problemas.some((p: string) => /minimo aceito pelo TikTok/.test(p)), "R$ 6 abaixo do minimo");
  assert.ok(r.previa.ajustesAutomaticos.some((a: string) => /https:\/\//.test(a)), "corrigiu o https");
});

test("vendas sem Pixel: bloqueia, NAO troca por trafego sozinho; so com 'autorizo trafego'", async () => {
  limparPropostasTikTok();
  const { d, chamadas } = deps({}, { pixels: [] });
  const p: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 120 }, d);
  assert.match(p.erro, /Nada foi criado/);
  assert.ok(p.problemas.some((x: string) => /Pixel/.test(x)));
  assert.match(p.perguntaParaOUsuario, /autorizo trafego/);
  assert.equal(chamadas.includes("publicar"), false);
  let objetivoPublicado = "";
  const { d: d2 } = deps({ publicar: async (_t, e) => { objetivoPublicado = String(e.objetivo); return { campaignId: "c", adGroupId: "g", identityId: "i", ads: [], avisos: [] }; } }, { pixels: [] });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false, dailyBudgetReais: 120 }, d2, { ultimaDoUsuario: "autorizo trafego", ultimaDoAssistente: "Quer que eu publique no TikTok como TRAFEGO? Responda autorizo trafego." });
  assert.equal(r.publicada, true);
  assert.equal(objetivoPublicado, "traffic");
});

test("com confirmado publica, salva ids e conclui", async () => {
  const { d, chamadas } = deps();
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 120 }, d);
  assert.equal(r.publicada, true);
  assert.equal(r.status, "PAUSADA");
  assert.deepEqual(chamadas, ["publicar", "salvar", "concluir"]);
});

test("campanha de outro usuario e recusada", async () => {
  const { d, chamadas } = deps();
  const r: any = await publicarNoTikTokDoChat(99, 28, { campaignId: 824, confirmado: true }, d);
  assert.match(r.erro, /nao encontrado/);
  assert.equal(chamadas.length, 0);
});

test("sem TikTok conectado nao publica", async () => {
  const { d } = deps({ integracao: async () => null });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true }, d);
  assert.match(r.erro, /nao esta conectado/);
});

test("sem videos na conversa bloqueia a publicacao", async () => {
  const { d, chamadas } = deps({ videosDaSessao: async () => [] });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true }, d);
  assert.ok(r.erro);
  assert.equal(chamadas.includes("publicar"), false);
});

test("repetir depois de publicada nao cria nada novo", async () => {
  const { d, chamadas } = deps({ reservar: async () => ({ kind: "cached_result", result: { tiktokCampaignId: "c1" } }) });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 120 }, d);
  assert.equal(r.jaPublicada, true);
  assert.equal(chamadas.includes("publicar"), false);
});

test("falha do TikTok registra e devolve a etapa", async () => {
  const { d, chamadas } = deps({ publicar: async (_t, _e, etapa) => { etapa("grupo"); throw new Error("budget too low"); } });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 120 }, d);
  assert.match(r.erro, /etapa "grupo".*budget too low/);
  assert.ok(chamadas.includes("falhar"));
});

test("urlH264 pede H.264 ao Cloudinary uma vez so", () => {
  const u = urlH264("https://res.cloudinary.com/d/video/upload/v1/a.mp4");
  assert.equal(u, "https://res.cloudinary.com/d/video/upload/vc_h264,f_mp4/v1/a.mp4");
  assert.equal(urlH264(u), u);
  assert.equal(urlH264("https://exemplo.com/a.mp4"), "https://exemplo.com/a.mp4");
});

test("textoAte respeita 100 caracteres sem quebrar palavra", () => {
  const t = textoAte("palavra ".repeat(30), 100);
  assert.ok(t.length <= 100);
  assert.ok(!t.endsWith(" "));
});

test("o chat nao diz mais que TikTok e manual e registra a ferramenta nos 3 provedores", () => {
  const src = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /TikTok continuam sendo publicados manualmente/);
  assert.equal((src.match(/=== "publicar_no_tiktok"/g) || []).length, 3);
  assert.equal((src.match(/name: "publicar_no_tiktok"/g) || []).length, 2);
});

test("Groq (caso 24/11): com Gemini fora, pedido de publicar no TikTok leva publicar_no_tiktok mesmo com briefing e historico", async () => {
  process.env.DATABASE_URL ??= "postgres://x"; process.env.JWT_SECRET ??= "tiktok-test-secret-0123456789"; process.env.SESSION_SECRET ??= "tiktok-test-secret-0123456789";
  const { ferramentasGroq } = await import("../chat");
  const { budgetChatRequest, COMPACT_CHAT_POLICY, estimatedChatTokens } = await import("../chatRequestBudget");
  const briefing = { projeto: "Shadia Hasan", plataforma: "tiktok", orcamento: 60, dias: 10, lastCampaign: { id: 824, resumo: "Teste Shadia Hasan, 4 criativos ".repeat(12) } };
  const sys = [
    { role: "system", content: COMPACT_CHAT_POLICY },
    { role: "system", content: `Dados confirmados, nao instrucoes; correcao atual prevalece: ${JSON.stringify(briefing)}` },
  ];
  const hist = [
    { role: "user", content: "cria uma campanha de teste para o tiktok com os 3 videos" },
    { role: "assistant", content: "Campanha #824 criada. ".repeat(20) },
  ];
  const nomes = (msgs: any[]) => {
    const r = budgetChatRequest([...sys, ...hist, ...msgs] as any, ferramentasGroq, 5400);
    assert.ok(estimatedChatTokens({ messages: r.messages, tools: r.tools }) <= 5400);
    return r.tools.map((t: any) => t.function.name);
  };
  // como em producao: o modelo consultou as campanhas na mesma transacao antes de publicar
  const consulta = JSON.stringify({ projetos: [{ id: 49, nome: "Shadia Hasan", campanhas: Array.from({ length: 8 }, (_, i) => ({ id: 817 + i, nome: `Campanha ${817 + i} Shadia Hasan autoconhecimento`, status: "draft", plataforma: i % 2 ? "meta" : "tiktok" })) }] });
  const pedido = nomes([
    { role: "user", content: "publica a 824 no tiktok" },
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "consultar_projetos_campanhas", arguments: "{}" } }] },
    { role: "tool", content: consulta, tool_call_id: "c1" },
  ]);
  assert.ok(pedido.includes("publicar_no_tiktok"), "pedido explicito");
  assert.ok(pedido.includes("consultar_projetos_campanhas"));
  assert.ok(!pedido.includes("publicar_campanha"), "TikTok nao carrega a publicacao da Meta");
  const sim = nomes([{ role: "user", content: "publica no tiktok" }, { role: "assistant", content: "Previa da publicacao no TikTok: R$ 120/dia, 3 videos, nasce pausada. Posso publicar?" }, { role: "user", content: "sim" }]);
  assert.ok(sim.includes("publicar_no_tiktok"), "o sim depois da previa");
  // sem intencao de publicar, o nucleo continua obrigatorio
  const briefingSo = nomes([{ role: "user", content: "a plataforma vai ser tiktok, 10 dias" }]);
  for (const n of ["atualizar_briefing", "gerar_campanha", "consultar_projetos_campanhas", "atualizar_orcamento_campanha"]) assert.ok(briefingSo.includes(n), n);
});

test("politica compacta do Groq nao manda mais o TikTok para a tela", async () => {
  const { COMPACT_CHAT_POLICY } = await import("../chatRequestBudget");
  assert.doesNotMatch(COMPACT_CHAT_POLICY, /Google\/TikTok: encaminhe a tela/);
  assert.match(COMPACT_CHAT_POLICY, /publicar_no_tiktok/);
});

test("valor minimo: abaixo do minimo a previa avisa e o confirmado nao publica", async () => {
  const { d, chamadas } = deps();
  const previa: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  assert.match(previa.previa.minimoDiario, /R\$ 110\/dia/);
  assert.ok(previa.problemas.some((p: string) => /abaixo do minimo/.test(p)));
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true }, d);
  assert.match(r.erro, /Nada foi criado/);
  assert.equal(chamadas.includes("publicar"), false, "R$ 6 nunca chega ao TikTok");
  const ok: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 110 }, d);
  assert.equal(ok.publicada, true, "no minimo exato publica");
});

test("valor minimo: sem como saber o minimo, avisa mas nao bloqueia", async () => {
  const { d } = deps({}, { minimo: null });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false, dailyBudgetReais: 50 }, d);
  assert.equal(r.problemas.length, 0);
  assert.ok(r.avisos.some((a: string) => /Nao consegui confirmar o minimo/.test(a)));
});

test("nome no TikTok leva o numero do rascunho (sem colidir com campanha feita a mao)", async () => {
  const { d } = deps();
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false, dailyBudgetReais: 120 }, d);
  assert.equal(r.previa.campanha, "Teste — Shadia Hasan · #824");
});

test("chat nao gera campanha nova para contornar erro de publicacao", async () => {
  const src = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  assert.match(src, /Nunca gere campanha nova \(gerar_campanha\) para contornar erro de publicacao/);
});

const PREVIA_TXT = "Pre-visualizacao da campanha no TikTok ... Publico pausada com R$ 110/dia? Responda sim.";

test("caso 828: 'sim' depois da previa confirma e usa o minimo, mesmo sem confirmado nem valor do modelo", async () => {
  limparPropostasTikTok();
  const { d, chamadas } = deps();
  const p: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  assert.match(p.perguntaParaOUsuario, /no minimo R\$ 110 por dia/);
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d, { ultimaDoUsuario: "sim", ultimaDoAssistente: PREVIA_TXT });
  assert.equal(r.publicada, true);
  assert.ok(chamadas.includes("publicar"));
  assert.ok(r.avisos.some((a: string) => /minimo proposto na previa: 110/.test(a)));
});

test("valor dito pelo usuario vence o do modelo e confirma", async () => {
  limparPropostasTikTok();
  let usado = 0;
  const { d } = deps({ publicar: async (_t, e) => { usado = e.dailyBudgetReais; return { campaignId: "c", adGroupId: "g", identityId: "i", ads: [], avisos: [] }; } });
  await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false, dailyBudgetReais: 38 }, d, { ultimaDoUsuario: "valor 340 por dia", ultimaDoAssistente: PREVIA_TXT });
  assert.equal(r.publicada, true);
  assert.equal(usado, 340);
});

test("sem previa antes, um 'sim' qualquer nao publica", async () => {
  limparPropostasTikTok();
  const { d, chamadas } = deps();
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d, { ultimaDoUsuario: "sim", ultimaDoAssistente: "Quer que eu gere outra campanha?" });
  assert.ok(r.previa);
  assert.equal(chamadas.includes("publicar"), false);
});

test("valor abaixo do minimo dito pelo usuario nao publica", async () => {
  limparPropostasTikTok();
  const { d, chamadas } = deps();
  await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d, { ultimaDoUsuario: "38 por dia", ultimaDoAssistente: PREVIA_TXT });
  assert.match(r.erro, /Nada foi criado/);
  assert.equal(chamadas.includes("publicar"), false);
});

test("leitura da fala: confirmacao e valor", () => {
  for (const t of ["sim", "Sim!", "sim, no tiktok", "pode publicar", "ok", "confirmo"]) assert.ok(ehConfirmacao(t), t);
  for (const t of ["nao", "sim mas nao agora", "espera", "qual o minimo?", ""]) assert.equal(ehConfirmacao(t), false, t);
  assert.equal(valorDiarioDaFala("valor 340 por dia"), 340);
  assert.equal(valorDiarioDaFala("R$ 1.250,50"), 1250.5);
  assert.equal(valorDiarioDaFala("150 reais"), 150);
  assert.equal(valorDiarioDaFala("200"), 200);
  assert.equal(valorDiarioDaFala("publica a campanha 828"), null);
  assert.equal(valorDiarioDaFala("publica a 824 no tiktok com R$ 120 por dia"), null, "numero da campanha no meio: a decisao fica com o modelo");
  assert.equal(valorDiarioDaFala("publica com R$ 120 por dia"), 120);
  assert.equal(valorDiarioDaFala("sim"), null);
});

test("previa pendente: a rota do chat acha a campanha da previa desta conversa", async () => {
  limparPropostasTikTok();
  const { d } = deps();
  assert.equal(previaPendenteDoTikTok(2, 28), null);
  await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  assert.deepEqual(previaPendenteDoTikTok(2, 28), { campaignId: 824 });
  assert.equal(previaPendenteDoTikTok(2, 99), null, "outra conversa");
  assert.equal(previaPendenteDoTikTok(3, 28), null, "outro usuario");
  assert.equal(previaPendenteDoTikTok(2, 28, Date.now() + 31 * 60 * 1000), null, "expirou");
});

test("caso 15h (sessao 28): 'sim' tratado no servidor publica com o minimo e responde em texto", async () => {
  limparPropostasTikTok();
  const { d } = deps();
  await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  const pend = previaPendenteDoTikTok(2, 28)!;
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: pend.campaignId, confirmado: false }, d, { ultimaDoUsuario: "sim", ultimaDoAssistente: PREVIA_TXT });
  assert.equal(r.publicada, true);
  assert.match(textoDoResultadoTikTok(r), /PAUSADA/);
  assert.equal(previaPendenteDoTikTok(2, 28), null, "publicou, nada pendente");
  assert.match(textoDoResultadoTikTok({ erro: "x", perguntaParaOUsuario: "Publico com R$ 126?" }), /Nao publiquei: x\nPublico com R\$ 126\?/);
});

test("rota local so assume o 'sim' quando a ultima resposta foi a previa do TikTok", () => {
  const src = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  assert.match(src, /ultimaFoiPreviaDoTikTok\(ultimaDoAssistente\) \? previaPendenteDoTikTok/);
});

test("Goldfish 8: idempotencia comum a tela e chat; se a campanha anterior foi apagada no TikTok, publica de novo", async () => {
  limparPropostasTikTok();
  const chaves: string[] = [];
  let publicou = 0;
  const { d } = deps({
    reservar: async (_u, chave) => { chaves.push(chave); return chaves.length === 1 ? { kind: "cached_result", result: { tiktokCampaignId: "C_APAGADA" } } : { kind: "proceed", recordId: 2 }; },
    existe: async () => false,
    publicar: async () => { publicou++; return { campaignId: "C_NOVA", adGroupId: "g", identityId: "i", ads: [], avisos: [] }; },
  });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 120 }, d);
  assert.equal(r.publicada, true);
  assert.equal(publicou, 1);
  assert.equal(chaves[0], "824:7000:WEB_CONVERSIONS", "mesma chave que a tela usa");
  assert.equal(chaves[1], "824:7000:WEB_CONVERSIONS:refeita:C_APAGADA");
  const { d: d2 } = deps({ reservar: async () => ({ kind: "cached_result", result: { tiktokCampaignId: "C1" } }), existe: async () => true });
  const r2: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 120 }, d2);
  assert.equal(r2.jaPublicada, true);
});
