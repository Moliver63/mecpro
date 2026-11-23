import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adsTurn, publishChatAds } from "../chatAdsTools";
import { buildCampaignFacts } from "../campaignFactGuard";
import {
  anexarVideoAoCriativo, registrarVideoDoChat, videoDoChatDoUsuario, urlDeVideoDoChatValida,
  limparRegistroDeVideosDoChat, type DepsVideoChat,
} from "../chatCreativeVideo";
import {
  selecionarContaMeta, exigirContaDoRascunho, contaDoRascunho, fraseDaEscolha, normalizarContasMeta,
  type ContaMeta, type DepsContaMeta,
} from "../metaAdAccountChoice";

// Chat: video enviado vira midia de um criativo do rascunho + conta Meta escolhida.
// Tudo com dependencias simuladas: nenhuma chamada a Meta, Cloudinary ou banco.

process.env.CLOUDINARY_CLOUD_NAME = "demo";
delete process.env.CLOUDINARY_FOLDER;
const ENV = { cloudName: "demo", folder: undefined as string | undefined };
const URL_A = "https://res.cloudinary.com/demo/video/upload/v1/mecpro/chat-videos/aaa111.mp4";
const URL_B = "https://res.cloudinary.com/demo/video/upload/v1/mecpro/chat-videos/bbb222.mp4";

const conta = (id: string, nome: string, extra: Partial<ContaMeta> = {}): ContaMeta =>
  ({ id, nome, status: 1, ativa: true, moeda: "BRL", origem: "direta", ...extra });
const C1 = conta("11111", "Conta Morebem");
const C2 = conta("22222", "Conta Cliente", { origem: "portfolio", portfolio: "BM Teste" });
const C_INATIVA = conta("33333", "Conta Suspensa", { status: 2, ativa: false });

function criativosImagem() {
  return [
    { headline: "Criativo zero", description: "d", copy: "c", feedImageUrl: "https://res.cloudinary.com/demo/image/upload/zero.jpg" },
    { headline: "Criativo um", description: "d", copy: "c", feedImageUrl: "https://res.cloudinary.com/demo/image/upload/um.jpg" },
    { headline: "Criativo dois", description: "d", copy: "c", storyImageUrl: "https://res.cloudinary.com/demo/image/upload/dois.jpg" },
  ];
}

function fixture(opts: { contas?: ContaMeta[]; conexao?: string | null; aiResponse?: any; donoDoProjeto?: number; publicada?: boolean } = {}) {
  const campaign: any = {
    id: 12, projectId: 4, name: "Rascunho", publishStatus: opts.publicada ? "success" : "draft", metaCampaignId: opts.publicada ? "999" : null,
    creatives: JSON.stringify(criativosImagem()),
    aiResponse: JSON.stringify(opts.aiResponse ?? { campaignFacts: { x: 1 }, factValidation: { ok: true } }),
  };
  const estado = { conexao: opts.conexao === undefined ? C1.id : opts.conexao, trocas: [] as string[], escritasAiResponse: 0, enviados: [] as any[], gravados: [] as any[] };
  const contas = opts.contas ?? [C1, C2];
  const dono = opts.donoDoProjeto ?? 1;
  const base: DepsContaMeta = {
    getCampaignById: async (id) => (id === 12 ? { ...campaign } : null),
    getProjectsByUserId: async (userId) => (userId === dono ? [{ id: 4 }] : [{ id: 99 }]),
    updateCampaignField: async (_id, _f, value) => { estado.escritasAiResponse++; campaign.aiResponse = value; },
    listarContas: async () => ({ ok: true, contas }),
    contaDaConexao: async () => estado.conexao,
    selecionarNaConexao: async (_u, id) => { estado.trocas.push(id); estado.conexao = id; },
  };
  const video: DepsVideoChat = {
    ...base,
    baixar: async () => ({ ok: true, buffer: Buffer.alloc(2048, 1), contentType: "video/mp4" }),
    enviarParaMeta: async (_u, input) => { estado.enviados.push(input); return { videoId: "vid_777" }; },
    gravarNoCriativo: async (_u, input) => {
      estado.gravados.push(input);
      const lista = JSON.parse(campaign.creatives);
      const chave = input.format === "stories" ? "storyVideoId" : input.format === "square" ? "squareVideoId" : "feedVideoId";
      lista[input.creativeIndex][chave] = input.videoId;
      campaign.creatives = JSON.stringify(lista);
    },
  };
  return { campaign, estado, base, video };
}

// ── 1. Upload de video pelo chat ────────────────────────────────────────────────

test("1. video do chat: so URL do nosso Cloudinary, na pasta chat-videos, e so do usuario que enviou", () => {
  limparRegistroDeVideosDoChat();
  assert.equal(urlDeVideoDoChatValida(URL_A, ENV), true);
  assert.equal(urlDeVideoDoChatValida("http://res.cloudinary.com/demo/video/upload/v1/mecpro/chat-videos/a.mp4", ENV), false);
  assert.equal(urlDeVideoDoChatValida("https://evil.example.com/demo/video/upload/v1/mecpro/chat-videos/a.mp4", ENV), false);
  assert.equal(urlDeVideoDoChatValida("https://res.cloudinary.com/outra/video/upload/v1/mecpro/chat-videos/a.mp4", ENV), false);
  assert.equal(urlDeVideoDoChatValida("https://res.cloudinary.com/demo/video/upload/v1/mecpro/creative/a.mp4", ENV), false);
  assert.equal(urlDeVideoDoChatValida("https://res.cloudinary.com/demo/image/upload/v1/mecpro/chat-videos/a.jpg", ENV), false);
  assert.equal(urlDeVideoDoChatValida("https://res.cloudinary.com/demo/video/upload/../x/mecpro/chat-videos/a.mp4", ENV), false);
  assert.equal(urlDeVideoDoChatValida("https://u:p@res.cloudinary.com/demo/video/upload/v1/mecpro/chat-videos/a.mp4", ENV), false);
  assert.equal(urlDeVideoDoChatValida(URL_A, { cloudName: undefined }), false);
  assert.equal(urlDeVideoDoChatValida(123 as any, ENV), false);

  registrarVideoDoChat(1, URL_A);
  assert.equal(videoDoChatDoUsuario(1, URL_A), true);
  assert.equal(videoDoChatDoUsuario(2, URL_A), false, "outro usuario nao herda o video");
  assert.equal(videoDoChatDoUsuario(1, URL_B), false);
  assert.equal(videoDoChatDoUsuario(1, URL_A, Date.now() + 8 * 24 * 3600 * 1000), false, "registro expira");
});

test("1b. /chat/upload-video registra o video por usuario e a nota do chat aponta a ferramenta", () => {
  const chat = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  const i = chat.indexOf('chatRouter.post("/upload-video"');
  assert.ok(i > 0);
  const trecho = chat.slice(i, i + 2600);
  assert.match(trecho, /registrarVideoDoChat\(userId, videoUrl\)/);
  assert.ok(trecho.indexOf("registrarVideoDoChat(") > trecho.indexOf("uploadVideoBufferToCloudinary("));
  assert.match(chat, /use anexar_video_criativo com esta URL exata/);
  // limites e formatos existentes continuam
  assert.match(trecho, /100 \* 1024 \* 1024|limite é 100MB/);
});

// ── 2. Associacao ao criativo correto ───────────────────────────────────────────

test("2. o video entra so no criativo e formato pedidos; imagens e demais criativos ficam intactos", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture({ contas: [C1], aiResponse: { campaignFacts: { x: 1 } } });
  const antes = JSON.parse(f.campaign.creatives);
  const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 1, format: "stories", videoUrl: URL_A }, f.video);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.publicado, false);
  assert.equal(r.criativo.index, 1);
  assert.equal(r.criativo.headline, "Criativo um");
  assert.equal(r.videoId, "vid_777");
  assert.deepEqual(f.estado.gravados, [{ campaignId: 12, creativeIndex: 1, format: "stories", videoId: "vid_777" }]);
  const depois = JSON.parse(f.campaign.creatives);
  assert.equal(depois[1].storyVideoId, "vid_777");
  assert.equal(depois[0].storyVideoId, undefined);
  assert.equal(depois[2].storyVideoId, undefined);
  assert.equal(depois[1].feedImageUrl, antes[1].feedImageUrl, "imagem existente preservada");
  assert.equal(f.estado.enviados.length, 1);
  assert.equal(f.estado.enviados[0].mimeType, "video/mp4");
  assert.match(f.estado.enviados[0].fileName, /^chat-video-12-1-stories\.mp4$/);
});

test("2b. criativo inexistente, formato ausente e indice invalido recusam antes de baixar ou enviar", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture({ contas: [C1] });
  let baixou = 0;
  const video = { ...f.video, baixar: async () => { baixou++; return { ok: true as const, buffer: Buffer.alloc(500), contentType: "video/mp4" }; } };
  const fora: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 9, format: "feed", videoUrl: URL_A }, video);
  assert.equal(fora.ok, false);
  assert.deepEqual(fora.criativosDisponiveis.map((c: any) => c.index), [0, 1, 2]);
  for (const ruim of [{ creativeIndex: -1 }, { creativeIndex: "1" }, { creativeIndex: 1.5 }, { format: undefined }, { format: "reels" }, { campaignId: "12" }]) {
    const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 1, format: "feed", videoUrl: URL_A, ...ruim }, video);
    assert.equal(r.ok, false, JSON.stringify(ruim));
  }
  assert.equal(baixou, 0);
  assert.equal(f.estado.enviados.length, 0);
  assert.equal(f.estado.gravados.length, 0);
});

test("2c. falha de download, de envio ou de gravacao nao altera o rascunho", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const casos: Array<[string, (v: DepsVideoChat) => DepsVideoChat]> = [
    ["download", (v) => ({ ...v, baixar: async () => ({ ok: false, erro: "falhou" }) })],
    ["tipo", (v) => ({ ...v, baixar: async () => ({ ok: true, buffer: Buffer.alloc(500), contentType: "image/png" }) })],
    ["meta", (v) => ({ ...v, enviarParaMeta: async () => { throw new Error("Meta recusou (codigo 100)"); } })],
    ["sem videoId", (v) => ({ ...v, enviarParaMeta: async () => ({ videoId: "" }) })],
    ["gravacao", (v) => ({ ...v, gravarNoCriativo: async () => { throw new Error("banco indisponivel"); } })],
  ];
  for (const [nome, ajustar] of casos) {
    const f = fixture({ contas: [C1] });
    const antes = f.campaign.creatives;
    const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_A }, ajustar(f.video));
    assert.equal(r.ok, false, nome);
    assert.equal(f.campaign.creatives, antes, `${nome}: criativos intactos`);
    assert.equal(r.rascunhoAlterado, false, nome);
  }
});

test("2d. campanha ja publicada nao tem criativo alterado (protege campanhas ativas)", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture({ contas: [C1], publicada: true });
  const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_A }, f.video);
  assert.equal(r.ok, false);
  assert.match(r.erro, /ja foi publicada/);
  assert.equal(f.estado.enviados.length + f.estado.gravados.length, 0);
});

// ── 3. Selecao e persistencia da conta ──────────────────────────────────────────

test("3. varias contas e nenhuma escolhida: lista pelos nomes e nada e gravado", async () => {
  const f = fixture();
  const r: any = await selecionarContaMeta(1, { campaignId: 12 }, f.base, "");
  assert.equal(r.ok, true);
  assert.deepEqual(r.contas.map((c: any) => c.nome), ["Conta Morebem", "Conta Cliente"]);
  assert.equal(r.contaEscolhidaParaEsteRascunho, null);
  assert.match(r.instruction, /NOME/);
  assert.equal(f.estado.escritasAiResponse, 0);
  assert.deepEqual(f.estado.trocas, []);
});

test("3b. escolher exige a frase do usuario; com ela grava no rascunho, preserva o resto do JSON e sincroniza a conexao", async () => {
  const f = fixture({ conexao: C1.id });
  const semFrase: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C2.id }, f.base, "pode usar a conta cliente");
  assert.equal(semFrase.confirmationRequired, true);
  assert.match(semFrase.avisoConexao, /passam a usar esta conta/);
  assert.equal(f.estado.escritasAiResponse, 0);
  assert.deepEqual(f.estado.trocas, []);

  const frase = fraseDaEscolha(1, 12, C2.id);
  assert.match(semFrase.erro, new RegExp(frase));
  const ok: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C2.id }, f.base, frase);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.mudouConexao, true);
  assert.deepEqual(f.estado.trocas, [C2.id]);
  const salvo = JSON.parse(f.campaign.aiResponse);
  assert.equal(salvo.metaAdAccount.id, C2.id);
  assert.equal(salvo.metaAdAccount.nome, "Conta Cliente");
  assert.deepEqual(salvo.campaignFacts, { x: 1 }, "campos existentes do aiResponse preservados");
  assert.deepEqual(salvo.factValidation, { ok: true });
  assert.equal(contaDoRascunho(f.campaign)?.id, C2.id);
});

test("3c. a frase da escolha vale so para aquela conta, campanha e usuario", async () => {
  const f = fixture();
  const fraseC2 = fraseDaEscolha(1, 12, C2.id);
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C1.id }, f.base, fraseC2);
  assert.equal(r.confirmationRequired, true);
  assert.notEqual(fraseDaEscolha(1, 12, C2.id), fraseDaEscolha(2, 12, C2.id));
  assert.notEqual(fraseDaEscolha(1, 12, C2.id), fraseDaEscolha(1, 13, C2.id));
  assert.equal(f.estado.escritasAiResponse, 0);
});

test("3d. escolher a mesma conta da conexao grava no rascunho sem trocar a conexao", async () => {
  const f = fixture({ conexao: C1.id });
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C1.id }, f.base, fraseDaEscolha(1, 12, C1.id));
  assert.equal(r.ok, true);
  assert.equal(r.mudouConexao, false);
  assert.deepEqual(f.estado.trocas, []);
  assert.equal(contaDoRascunho(f.campaign)?.id, C1.id);
});

test("3e. com uma unica conta disponivel ela e associada e mostrada, sem pedir escolha", async () => {
  const f = fixture({ contas: [C1], conexao: null });
  const r: any = await selecionarContaMeta(1, { campaignId: 12 }, f.base, "");
  assert.equal(r.ok, true);
  assert.equal(r.unicaContaDisponivel, true);
  assert.equal(r.conta.nome, "Conta Morebem");
  assert.deepEqual(f.estado.trocas, [C1.id]);
  assert.equal(contaDoRascunho(f.campaign)?.id, C1.id);
});

test("3f. a escolha persiste: trava libera quando rascunho e conexao apontam a mesma conta", async () => {
  const f = fixture({ conexao: C2.id, aiResponse: { metaAdAccount: { id: C2.id, nome: "Conta Cliente", escolhidaEm: "2026-11-23T00:00:00Z" } } });
  const r = await exigirContaDoRascunho(1, f.campaign, f.base);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.conta.nome, "Conta Cliente");
});

// ── 4. Isolamento entre usuarios e contas ───────────────────────────────────────

test("4. usuario sem acesso ao projeto nao seleciona conta nem anexa video em campanha alheia", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(2, URL_A);
  const f = fixture({ donoDoProjeto: 1 });
  const sel: any = await selecionarContaMeta(2, { campaignId: 12, adAccountId: C1.id }, f.base, fraseDaEscolha(2, 12, C1.id));
  assert.equal(sel.ok, false);
  assert.match(sel.erro, /nao pertence/);
  const vid: any = await anexarVideoAoCriativo(2, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_A }, f.video);
  assert.equal(vid.ok, false);
  assert.match(vid.erro, /nao pertence/);
  assert.equal(f.estado.escritasAiResponse + f.estado.enviados.length + f.estado.gravados.length + f.estado.trocas.length, 0);
});

test("4b. video enviado por outro usuario nao pode ser usado, mesmo conhecendo a URL", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(2, URL_B);
  const f = fixture({ contas: [C1] });
  const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_B }, f.video);
  assert.equal(r.ok, false);
  assert.match(r.erro, /enviados por este usuario/);
  assert.equal(f.estado.enviados.length, 0);
});

test("4c. as contas listadas vem so da consulta do proprio usuario (a lista e por usuario)", async () => {
  const consultas: number[] = [];
  const f = fixture();
  const base: DepsContaMeta = { ...f.base, listarContas: async (u) => { consultas.push(u); return { ok: true, contas: u === 1 ? [C1] : [C2] }; } };
  const r1: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C2.id }, base, fraseDaEscolha(1, 12, C2.id));
  assert.equal(r1.ok, false, "conta do outro cliente nao aparece na lista do usuario 1");
  assert.deepEqual(consultas, [1]);
});

// ── 5. Contas nao autorizadas ───────────────────────────────────────────────────

test("5. conta fora da lista autorizada, inativa ou em formato estranho e rejeitada sem gravar", async () => {
  const f = fixture({ contas: [C1, C2, C_INATIVA] });
  const fora: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: "99999" }, f.base, fraseDaEscolha(1, 12, "99999"));
  assert.equal(fora.ok, false);
  assert.match(fora.erro, /autorizadas/);
  const inativa: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C_INATIVA.id }, f.base, fraseDaEscolha(1, 12, C_INATIVA.id));
  assert.equal(inativa.ok, false);
  assert.match(inativa.erro, /nao esta ativa/);
  for (const estranho of [{ adAccountId: "abc" }, { adAccountId: 22222 }, { adAccountId: { id: "22222" } }, { adAccountId: ["22222"] }]) {
    const r: any = await selecionarContaMeta(1, { campaignId: 12, ...estranho }, f.base, "");
    assert.equal(r.ok, false, JSON.stringify(estranho));
  }
  assert.equal(f.estado.escritasAiResponse, 0);
  assert.deepEqual(f.estado.trocas, []);
});

test("5b. act_ no id e aceito (normalizado) e Meta fora do ar nao escolhe nada", async () => {
  const f = fixture();
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: `act_${C2.id}` }, f.base, fraseDaEscolha(1, 12, C2.id));
  assert.equal(r.ok, true);
  const f2 = fixture();
  const base: DepsContaMeta = { ...f2.base, listarContas: async () => ({ ok: false, erro: "Token Meta expirado." }) };
  const falha: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C2.id }, base, fraseDaEscolha(1, 12, C2.id));
  assert.equal(falha.ok, false);
  assert.equal(f2.estado.escritasAiResponse, 0);
});

test("5c. campanha ja publicada nao troca de conta", async () => {
  const f = fixture({ publicada: true });
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C2.id }, f.base, fraseDaEscolha(1, 12, C2.id));
  assert.equal(r.ok, false);
  assert.match(r.erro, /ja foi publicada/);
  assert.deepEqual(f.estado.trocas, []);
});

test("5d. contas da Meta: duplicadas colapsam e portfolio vira origem", () => {
  const lista = normalizarContasMeta(
    [{ id: "act_11111", name: "A", account_status: 1, currency: "BRL" }, { id: "x" }],
    [{ businessName: "BM", accounts: [{ id: "11111", name: "A (BM)", status: 1 }, { id: "22222", name: "B", status: 2 }] }],
  );
  assert.deepEqual(lista.map((c) => [c.id, c.origem, c.ativa]), [["11111", "direta", true], ["22222", "portfolio", false]]);
});

// ── video + conta: a trava vem antes de qualquer upload ────────────────────────

test("video: com varias contas e nenhuma escolhida, nao baixa nem envia nada", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture();
  let baixou = 0;
  const video = { ...f.video, baixar: async () => { baixou++; return { ok: true as const, buffer: Buffer.alloc(500), contentType: "video/mp4" }; } };
  const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_A }, video);
  assert.equal(r.ok, false);
  assert.equal(r.acao, "selecionar_conta_meta");
  assert.equal(baixou, 0);
  assert.equal(f.estado.enviados.length, 0);
});

test("video: conexao em outra conta que nao a do rascunho bloqueia o envio", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture({ conexao: C1.id, aiResponse: { metaAdAccount: { id: C2.id, nome: "Conta Cliente" } } });
  const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_A }, f.video);
  assert.equal(r.ok, false);
  assert.match(r.erro, /outra conta/);
  assert.equal(f.estado.enviados.length, 0);
});

// ── 6. Publicacao exige confirmacao (e agora mostra a conta) ────────────────────

function fixturePublicar(opts: { contas?: ContaMeta[]; conexao?: string | null; escolhida?: ContaMeta | null } = {}) {
  const contasRef = { lista: opts.contas ?? [C1, C2] };
  const estado = { conexao: opts.conexao === undefined ? C1.id : opts.conexao, publicou: 0, trocas: [] as string[] };
  const campaign: any = {
    id: 12, projectId: 4, name: "Teste", adSets: '[{"budget":"R$ 12,00/dia"}]', suggestedBudgetDaily: 12, durationDays: 14, objective: "leads",
    aiResponse: JSON.stringify({
      campaignFacts: buildCampaignFacts({ input: { objective: "leads" }, clientProfile: { niche: "planejamento financeiro" }, segment: "financeiro" }),
      ...(opts.escolhida ? { metaAdAccount: { id: opts.escolhida.id, nome: opts.escolhida.nome } } : {}),
    }),
    creatives: JSON.stringify([
      { headline: "Planejamento financeiro com quem entende", description: "Fale com a nossa equipe hoje", copy: "Converse com um especialista sobre o seu caso e receba um plano claro, feito para a sua realidade e os seus objetivos.", feedImageUrl: "https://res.cloudinary.com/x/a.png" },
      { headline: "Plano financeiro sob medida", description: "Agende uma conversa conosco", copy: "Descubra como organizar suas metas e proteger o que importa, com acompanhamento de quem entende do assunto.", feedVideoId: "vid_1", feedImageUrl: "https://res.cloudinary.com/x/b.png" },
    ]),
  };
  const contaMeta: DepsContaMeta = {
    getCampaignById: async () => ({ ...campaign }),
    getProjectsByUserId: async () => [{ id: 4 }],
    updateCampaignField: async (_i, _f, v) => { campaign.aiResponse = v; },
    listarContas: async () => ({ ok: true, contas: contasRef.lista }),
    contaDaConexao: async () => estado.conexao,
    selecionarNaConexao: async (_u, id) => { estado.trocas.push(id); estado.conexao = id; },
  };
  let reservation: any;
  const db = {
    getCampaignById: async () => ({ ...campaign }), getProjectById: async () => ({ userId: 1 }), getUserById: async () => ({ id: 1 }),
    reserveMcpIdempotencyKey: async () => { if (reservation) return reservation; reservation = { kind: "duplicate_in_progress" }; return { kind: "proceed", recordId: 1 }; },
    completeMcpIdempotencyKey: async (_id: number, r: any) => { reservation = { kind: "cached_result", result: r }; },
    failMcpIdempotencyKey: async () => {},
    listPages: async () => ({ ok: true, pages: [{ pageId: "123", name: "Empresa" }] }),
    publish: async () => { estado.publicou++; return { ok: true }; },
    contaMeta,
  };
  return { db, campaign, estado, contasRef };
}
const opcoes = { campaignId: 12, linkUrl: "https://example.com" };

test("6. publicar com varias contas e nenhuma escolhida e bloqueado antes de qualquer token", async () => {
  const f = fixturePublicar();
  const r: any = await publishChatAds(1, opcoes, f.db);
  assert.equal(r.ok, false);
  assert.equal(r.acao, "selecionar_conta_meta");
  assert.equal(r.confirmationRequired, undefined);
  assert.equal(f.estado.publicou, 0);
});

test("6b. com conta escolhida, a pre-confirmacao mostra conta, pagina, instagram, criativos, publico e orcamento e nao publica", async () => {
  const f = fixturePublicar({ escolhida: C1 });
  const r: any = await publishChatAds(1, opcoes, f.db);
  assert.equal(r.confirmationRequired, true);
  assert.equal(r.contaDeAnuncios.nome, "Conta Morebem");
  assert.equal(r.pageName, "Empresa");
  assert.match(r.instagram, /Instagram/);
  assert.deepEqual(r.criativos.map((c: any) => [c.index, c.feed]), [[0, "imagem"], [1, "video"]]);
  assert.equal(r.orcamentoDiarioAprovado, 12);
  assert.match(String(r.adSets), /12,00/);
  assert.match(r.erro, /conta de anuncios/);
  assert.equal(f.estado.publicou, 0);
});

test("6c. 'sim' ou frase errada nao publica; so a frase exata publica", async () => {
  const f = fixturePublicar({ escolhida: C1 });
  const prev: any = await publishChatAds(1, opcoes, f.db);
  const frase = prev.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  for (const msg of ["sim", "pode publicar", "CONFIRMAR PUBLICACAO 0000000000000000"]) {
    const r: any = await adsTurn.run({ message: msg }, () => publishChatAds(1, opcoes, f.db));
    assert.equal(r.confirmationRequired, true, msg);
  }
  assert.equal(f.estado.publicou, 0);
  const ok: any = await adsTurn.run({ message: frase }, () => publishChatAds(1, opcoes, f.db));
  assert.equal(ok.ok, true);
  assert.equal(f.estado.publicou, 1);
});

test("6d. trocar a conta do rascunho invalida a frase de confirmacao anterior", async () => {
  const f = fixturePublicar({ escolhida: C1 });
  const prev: any = await publishChatAds(1, opcoes, f.db);
  const frase = prev.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  f.campaign.aiResponse = JSON.stringify({ ...JSON.parse(f.campaign.aiResponse), metaAdAccount: { id: C2.id, nome: C2.nome } });
  f.estado.conexao = C2.id;
  const r: any = await adsTurn.run({ message: frase }, () => publishChatAds(1, opcoes, f.db));
  assert.equal(r.confirmationRequired, true);
  assert.equal(f.estado.publicou, 0);
});

test("6e. conexao em outra conta que nao a do rascunho bloqueia a publicacao", async () => {
  const f = fixturePublicar({ escolhida: C1, conexao: C2.id });
  const r: any = await publishChatAds(1, opcoes, f.db);
  assert.equal(r.ok, false);
  assert.equal(r.acao, "selecionar_conta_meta");
  assert.equal(f.estado.publicou, 0);
});

test("6f. conta escolhida que perdeu a autorizacao na Meta bloqueia", async () => {
  const f = fixturePublicar({ escolhida: C2, conexao: C2.id });
  f.contasRef.lista = [C1];
  const r: any = await publishChatAds(1, opcoes, f.db);
  assert.equal(r.ok, false);
  assert.match(r.erro, /nao esta mais autorizada/);
  assert.equal(f.estado.publicou, 0);
});

// ── 7. Compatibilidade com campanhas de imagem ─────────────────────────────────

test("7. campanha so de imagens: usuario com uma conta publica pelo mesmo fluxo (associa a unica conta)", async () => {
  const f = fixturePublicar({ contas: [C1], conexao: C1.id });
  const prev: any = await publishChatAds(1, opcoes, f.db);
  assert.equal(prev.confirmationRequired, true);
  assert.equal(prev.contaDeAnuncios.nome, "Conta Morebem");
  assert.equal(JSON.parse(f.campaign.aiResponse).metaAdAccount.id, C1.id);
  const frase = prev.erro.match(/CONFIRMAR PUBLICACAO [a-f0-9]+/)[0];
  const ok: any = await adsTurn.run({ message: frase }, () => publishChatAds(1, opcoes, f.db));
  assert.equal(ok.ok, true);
});

test("7b. sem a dependencia de conta (fixtures antigos), o fluxo de publicacao existente segue igual", async () => {
  const f = fixturePublicar({ escolhida: C1 });
  const { contaMeta: _ignorada, ...dbAntigo } = f.db;
  const prev: any = await publishChatAds(1, opcoes, dbAntigo as any);
  assert.equal(prev.confirmationRequired, true);
  assert.equal(prev.contaDeAnuncios, undefined);
});

test("7c. anexar video nao mexe em imagens nem em outros formatos do mesmo criativo", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture({ contas: [C1] });
  const antes = JSON.parse(f.campaign.creatives);
  await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 2, format: "feed", videoUrl: URL_A }, f.video);
  const depois = JSON.parse(f.campaign.creatives);
  assert.equal(depois[2].storyImageUrl, antes[2].storyImageUrl);
  assert.equal(depois[2].feedVideoId, "vid_777");
  assert.equal(depois[2].storyVideoId, undefined);
});

// ── 8. Sem regressao no chat e no MCP ──────────────────────────────────────────

test("8. as ferramentas novas estao nas duas listas de provedores e no despacho unico", () => {
  const chat = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  for (const nome of ["anexar_video_criativo", "selecionar_conta_meta"]) {
    assert.match(chat, new RegExp(`\\{ name: "${nome}", description: [A-Z_]+, parametersJsonSchema`), `${nome} em declaracoesGemini`);
    assert.match(chat, new RegExp(`function: \\{ name: "${nome}", description: [A-Z_]+, parameters:`), `${nome} em ferramentasGroq`);
    assert.match(chat, new RegExp(`name === "${nome}"`), `${nome} no despacho`);
  }
  // ferramentas anteriores seguem registradas
  for (const nome of ["gerar_campanha", "atualizar_orcamento_campanha", "definir_foto_destaque", "editar_criativo", "aprovar_revisao_criativo", "consultar_paginas_meta", "consultar_formularios_meta", "publicar_campanha", "pesquisar_web"]) {
    assert.match(chat, new RegExp(`name: "${nome}"`), nome);
  }
});

test("8b. o MCP upload_creative_video continua registrado e usa os mesmos procedimentos que o chat", () => {
  const mcp = readFileSync(new URL("../mcpServer.ts", import.meta.url), "utf8");
  assert.match(mcp, /server\.registerTool\("upload_creative_video", uploadCreativeVideoToolConfig, uploadCreativeVideoHandler\)/);
  assert.match(mcp, /caller\.integrations\.uploadVideoToMeta\(/);
  assert.match(mcp, /caller\.campaigns\.updateCreativeImage\(/);
  const video = readFileSync(new URL("../chatCreativeVideo.ts", import.meta.url), "utf8");
  assert.match(video, /integrations\.uploadVideoToMeta\(/);
  assert.match(video, /campaigns\.updateCreativeImage\(/);
  assert.doesNotMatch(video, /graph\.facebook\.com/, "o chat nao reimplementa a chamada a Meta");
});

test("8c. nada novo publica, e os arquivos novos nao tocam em publicacao nem em orcamento", () => {
  for (const arquivo of ["../chatCreativeVideo.ts", "../metaAdAccountChoice.ts"]) {
    const t = readFileSync(new URL(arquivo, import.meta.url), "utf8");
    assert.doesNotMatch(t, /publicarCampanhaNaMeta|publishToMeta|\/campaigns\?|status: "ACTIVE"|suggestedBudget/, arquivo);
  }
});

// ── 9. Correcoes da revisao Goldfish ────────────────────────────────────────────

test("9a. B1: lista incompleta (portfolios falharam) com conexao em outra conta nao associa nem troca sozinho", async () => {
  const f = fixture({ contas: [C1], conexao: C2.id });
  f.base.listarContas = async () => ({ ok: true, contas: [C1], completa: false });
  const r: any = await selecionarContaMeta(1, { campaignId: 12 }, f.base, "");
  assert.equal(r.ok, true);
  assert.equal(f.estado.trocas.length, 0, "nao troca a conexao sem escolha");
  assert.equal(contaDoRascunho(f.campaign), null, "nao grava conta no rascunho");
});

test("9b. B1: unica conta, lista completa, conexao em OUTRA conta tambem pede escolha", async () => {
  const f = fixture({ contas: [C1], conexao: C2.id });
  const r: any = await selecionarContaMeta(1, { campaignId: 12 }, f.base, "");
  assert.equal(f.estado.trocas.length, 0);
  assert.equal(contaDoRascunho(f.campaign), null);
  assert.ok(r);
});

test("9c. B2: publishStatus 'error' sem metaCampaignId continua rascunho; success/partial/processing/metaCampaignId nao", async () => {
  const { campanhaJaPublicada } = await import("../metaAdAccountChoice");
  assert.equal(campanhaJaPublicada({ publishStatus: "draft" }), false);
  assert.equal(campanhaJaPublicada({ publishStatus: "error", metaCampaignId: null }), false);
  for (const s of ["success", "partial", "processing"]) assert.equal(campanhaJaPublicada({ publishStatus: s }), true);
  assert.equal(campanhaJaPublicada({ publishStatus: "error", metaCampaignId: "9" }), true);
});

test("9d. B2: campanha com publicacao anterior que falhou aceita escolha de conta e video", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture({ contas: [C1] });
  f.campaign.publishStatus = "error";
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C1.id }, f.base, fraseDaEscolha(1, 12, C1.id));
  assert.equal(r.ok, true);
  const v: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_A }, f.video);
  assert.equal(v.ok, true);
});

test("9e. R4: aiResponse ilegivel nao e sobrescrito", async () => {
  const f = fixture({ contas: [C1], conexao: C1.id });
  f.campaign.aiResponse = "{quebrado";
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C1.id }, f.base, fraseDaEscolha(1, 12, C1.id));
  assert.equal(r.ok, false);
  assert.equal(f.campaign.aiResponse, "{quebrado");
  assert.equal(f.estado.escritasAiResponse, 0);
});

test("9f. R5: falha ao gravar o rascunho devolve a conexao a conta anterior", async () => {
  const f = fixture({ contas: [C1, C2], conexao: C1.id });
  f.base.updateCampaignField = async () => { throw new Error("db fora"); };
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C2.id }, f.base, fraseDaEscolha(1, 12, C2.id));
  assert.equal(r.ok, false);
  assert.equal(f.estado.conexao, C1.id, "conexao restaurada");
});

test("9g. R7: trocar de conta com midia ja enviada avisa que precisa reenviar", async () => {
  const f = fixture({ contas: [C1, C2], conexao: C1.id, aiResponse: { metaAdAccount: { id: C1.id, nome: C1.nome, escolhidaEm: "x" } } });
  const lista = JSON.parse(f.campaign.creatives); lista[0].feedVideoId = "vid_1"; f.campaign.creatives = JSON.stringify(lista);
  const r: any = await selecionarContaMeta(1, { campaignId: 12, adAccountId: C2.id }, f.base, fraseDaEscolha(1, 12, C2.id));
  assert.equal(r.ok, true);
  assert.match(r.avisoMidia, /reenviados/);
});

test("9h. R8: campanha publicada durante o upload nao tem criativo alterado", async () => {
  limparRegistroDeVideosDoChat(); registrarVideoDoChat(1, URL_A);
  const f = fixture({ contas: [C1] });
  f.video.enviarParaMeta = async () => { f.campaign.publishStatus = "success"; f.campaign.metaCampaignId = "55"; return { videoId: "vid_9" }; };
  const r: any = await anexarVideoAoCriativo(1, { campaignId: 12, creativeIndex: 0, format: "feed", videoUrl: URL_A }, f.video);
  assert.equal(r.ok, false);
  assert.equal(f.estado.gravados.length, 0);
});
