import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { triarParaAprovacao, aplicarAprovacaoPorScore, diagnosticarRevisao } from "../creativeReview";

/**
 * Achado real (22/10, campanha 799 da Shadia Hasan): tres tentativas de
 * publicar, as tres recusadas com
 *
 *   [trpc] [campaigns.publishToMeta] CAMPAIGN_INTEGRITY: criativos ainda
 *   precisam de revisao antes de publicar.
 *
 * Os 4 criativos estavam `needsReview: true` com score entre 62 e 68 — nada
 * alem de score baixo. O chat e o MCP sabiam liberar isso; a TELA, que e a
 * porta que o Michel usa, nao tinha nenhum caminho que limpasse a flag
 * (`grep needsReview server/_core/router.ts` nao devolvia uma linha).
 *
 * Cada porta tinha a sua copia do mesmo laco. Esta bateria protege a versao
 * unica em `creativeReview.ts` e, no fim, que as tres portas continuem
 * existindo.
 */

const SCORE_OK = { finalScore: 90, headline: "Headline boa", copy: "Texto limpo sobre o metodo.", needsReview: true };
const SCORE_BAIXO = { finalScore: 64, headline: "Headline fraca", copy: "Texto curto.", needsReview: true };
const COM_PLACEHOLDER = { finalScore: 64, headline: "Venha para [EMPRESA]", copy: "Texto curto.", needsReview: true };
const FORA_DO_SEGMENTO = { finalScore: 64, headline: "Headline", copy: "Texto.", needsReview: true, segmentAlignmentIssues: ["copy fala de imovel em campanha de estetica"] };
const JA_REVISADO = { finalScore: 64, headline: "Headline", copy: "Texto.", needsReview: false };

test("score baixo e o unico motivo: entra em liberaveis com o score", () => {
  const t = triarParaAprovacao([SCORE_BAIXO], null);
  assert.deepEqual(t.liberaveis, [{ index: 0, score: 64 }]);
  assert.deepEqual(t.bloqueados, []);
  assert.deepEqual(t.emRevisao, [0]);
});

test("placeholder no texto bloqueia, mesmo com score baixo junto", () => {
  const t = triarParaAprovacao([COM_PLACEHOLDER], null);
  assert.deepEqual(t.liberaveis, []);
  assert.equal(t.bloqueados.length, 1);
  assert.match(t.bloqueados[0], /placeholder/);
});

test("texto fora do segmento bloqueia", () => {
  const t = triarParaAprovacao([FORA_DO_SEGMENTO], null);
  assert.deepEqual(t.liberaveis, []);
  assert.match(t.bloqueados[0], /segmento|imovel/);
});

test("indices nulos significam 'todos os que estao em revisao'", () => {
  const t = triarParaAprovacao([SCORE_BAIXO, JA_REVISADO, COM_PLACEHOLDER], null);
  assert.deepEqual(t.emRevisao, [0, 2], "o criativo 1 nao esta em revisao e nao entra");
  assert.deepEqual(t.liberaveis.map((x) => x.index), [0]);
  assert.equal(t.bloqueados.length, 1);
});

test("criativo que nao esta em revisao fica fora mesmo quando pedido por indice", () => {
  const t = triarParaAprovacao([SCORE_BAIXO, JA_REVISADO], [1]);
  assert.deepEqual(t.emRevisao, []);
  assert.deepEqual(t.liberaveis, []);
  assert.deepEqual(t.invalidos, []);
});

test("indice inexistente volta como invalido, nao como bloqueio", () => {
  const t = triarParaAprovacao([SCORE_BAIXO], [0, 7, -1]);
  assert.deepEqual(t.invalidos, [7, -1]);
  assert.deepEqual(t.liberaveis.map((x) => x.index), [0]);
});

test("indice repetido conta uma vez", () => {
  const t = triarParaAprovacao([SCORE_BAIXO, SCORE_BAIXO], [1, 1, 0]);
  assert.deepEqual(t.emRevisao, [0, 1]);
  assert.deepEqual(t.liberaveis.map((x) => x.index), [0, 1]);
});

test("criativo com score alto e sem motivo registrado nao e liberavel", () => {
  // needsReview true sem motivo detectavel: truncamento ou campo que a IA nao
  // reescreveu. Nao da pra provar que e "so score", entao editar e o caminho.
  const t = triarParaAprovacao([SCORE_OK], null);
  assert.deepEqual(t.liberaveis, []);
  assert.match(t.bloqueados[0], /motivo nao registrado/);
});

test("aplicar limpa a flag e carimba apenas os indices dados", () => {
  const antes = [{ ...SCORE_BAIXO }, { ...COM_PLACEHOLDER }];
  const depois = aplicarAprovacaoPorScore(antes, [0], 7, "2026-10-22T13:00:00.000Z");

  assert.equal(depois[0].needsReview, false);
  assert.equal(depois[0].reviewApprovedBy, 7);
  assert.equal(depois[0].reviewApprovalReason, "score_baixo");
  assert.equal(depois[0].reviewApprovedScore, 64);
  assert.equal(depois[0].reviewApprovedAt, "2026-10-22T13:00:00.000Z");

  assert.equal(depois[1].needsReview, true, "quem nao foi pedido nao muda");
  assert.equal(depois[1].reviewApprovedAt, undefined);
  assert.equal(antes[0].needsReview, true, "a lista de entrada nao e mutada");
});

test("aprovar o que a triagem liberou nao deixa criativo bloqueado passar", () => {
  const creatives = [{ ...COM_PLACEHOLDER }, { ...SCORE_BAIXO }];
  const t = triarParaAprovacao(creatives, null);
  const depois = aplicarAprovacaoPorScore(creatives, t.liberaveis.map((x) => x.index), "user_via_mcp", "2026-10-22T13:00:00.000Z");
  assert.equal(depois[0].needsReview, true, "o placeholder continua barrando a publicacao");
  assert.equal(depois[1].needsReview, false);
});

// ── As tres portas ────────────────────────────────────────────────────────
// Teste de FONTE: o que quebrou na 799 nao foi a regra, foi uma porta sem a
// regra. O que protege e cada caminho continuar chamando a versao unica.
const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
const CHAT = readFileSync(new URL("../chatCreativeEdit.ts", import.meta.url), "utf8");
const MCP = readFileSync(new URL("../campaignDraftEdit.ts", import.meta.url), "utf8");

test("a tela tem uma mutation que limpa needsReview", () => {
  assert.match(ROTA, /approveCreativeReview: protectedProcedure/, "sem isso a tela volta a ser porta sem saida");
  assert.match(ROTA, /aplicarAprovacaoPorScore\(creatives, aprovados/);
});

// ── A edicao de preenchimento (22/10) ─────────────────────────────────────
// O chat afirmou que o criativo 1 da 799 tinha "depoimento invalido" (nao
// tinha: aquele era o estado de 19/10, antes da reescrita de 20/10) e mandou
// corrigir com `description="Texto corrigido"`. Essa string nao e placeholder,
// cabe em 30 caracteres e nao alega nada, entao passava por todas as travas e
// seria gravada num anuncio real.
const CRIATIVO_1_DA_799 = {
  finalScore: 62, needsReview: true, segmentAlignmentIssues: [],
  headline: "Jornada de autoconhecimento Shadia Hasan",
  description: "Autoconhecimento e Foco",
  cta: "Saiba mais",
  hook: "Quer entender seus padrões emocionais? Conheça a jornada Shadia Hasan.",
  copy: "Conheça o Método Shadia Hasan, uma proposta de desenvolvimento pessoal que combina autoconhecimento e experiências em realidade virtual.",
  // A reescrita de 20/10. Sem isso o diagnostico ainda acusaria o depoimento
  // ficticio que o criativo tinha em 19/10 — que e exatamente o estado velho
  // que o chat relatou como se fosse de hoje.
  textEditedAt: "2026-10-20T11:47:59.971Z",
  complianceNotes: "Copy factual definida pelo cliente em 20/10, sem depoimento e sem promessa de resultado.",
};

test("criativo 1 da 799 hoje tem SO score baixo, nao depoimento inventado", () => {
  const d = diagnosticarRevisao(CRIATIVO_1_DA_799, null);
  assert.deepEqual(d.motivos, ["score_baixo"]);
  assert.equal(d.liberavelPorAprovacao, true);

  // E o estado de 19/10, pra deixar claro de onde vinha a confusao.
  const em19 = { ...CRIATIVO_1_DA_799 } as any;
  delete em19.textEditedAt;
  em19.complianceNotes = "Depoimento ficticio baseado em persona";
  assert.ok(diagnosticarRevisao(em19, null).motivos.includes("depoimento_inventado"));
});

test("edicao de preenchimento salva, mas a resposta diz o que ela fez", async () => {
  // "Texto corrigido" nao e placeholder, cabe em 30 caracteres e nao alega
  // nada: passa por todas as travas. Nao existe regra deterministica que o
  // separe de uma copy curta boa — tentar por vocabulario bloquearia a escrita
  // do proprio usuario (duas edicoes legitimas de teste cairam na primeira
  // tentativa). Entao a resposta informa em vez de barrar.
  const { aplicarEdicaoDeTexto } = await import("../chatCreativeEdit");
  const campos = ["headline", "description", "copy", "cta", "hook"] as const;
  const r: any = aplicarEdicaoDeTexto(CRIATIVO_1_DA_799, { description: "Texto corrigido" }, campos as any, null, () => []);
  assert.ok(r.creative, "edicao do usuario nao e recusada por heuristica de score");
  assert.ok(r.avisos?.length, "mas o efeito tem que vir dito");
  assert.ok(r.avisos.some((a: string) => /score caiu/.test(a)), `avisos: ${JSON.stringify(r.avisos)}`);
  assert.ok(r.avisos.some((a: string) => /nao resolveu nenhum bloqueio/.test(a)));
  assert.ok(r.avisos.some((a: string) => /score abaixo de 75/.test(a)));
});

test("a ferramenta de editar avisa que o texto vai pro anuncio", () => {
  const CHAT_SRC = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  const inicio = CHAT_SRC.indexOf("const DESCRICAO_EDITAR_CRIATIVO");
  const bloco = CHAT_SRC.slice(inicio, inicio + 1600);
  assert.match(bloco, /VAI PRO ANUNCIO/);
  assert.match(bloco, /Texto corrigido/, "o exemplo do que nao fazer e o caso real de 22/10");
  assert.match(bloco, /textos/, "aponta pro texto atual que vem nas pendencias");
});

test("as pendencias carregam o texto atual de cada criativo e os indices no titulo", async () => {
  const { pendenciasLocaisParaPublicar } = await import("../publishPreflight");
  const criativo = (i: number) => ({
    finalScore: 62, needsReview: true, segmentAlignmentIssues: [],
    headline: `Headline ${i}`, description: "Desc", copy: "Texto da copy desse criativo.", cta: "Saiba mais",
    feedImageUrl: "https://res.cloudinary.com/x/image/upload/v1/a.jpg",
  });
  const campanha = {
    adSets: JSON.stringify([{ name: "TOF", budget: "R$ 6,00/dia" }]),
    creatives: JSON.stringify([criativo(0), criativo(1)]),
    aiResponse: "{}",
  };
  const r = pendenciasLocaisParaPublicar(campanha);
  const revisao = r.pendencias!.find((p) => p.tipo === "revisao_aprovavel" || p.tipo === "revisao_bloqueada");
  assert.ok(revisao, "a revisao tem que aparecer");
  // Indices no titulo: em texto corrido o modelo perdeu um dos quatro.
  assert.match(revisao!.titulo, /0, 1/);
  // E o texto atual, pra ninguem precisar inventar substituto.
  assert.equal(revisao!.textos?.length, 2);
  assert.equal(revisao!.textos?.[0].headline, "Headline 0");
  assert.equal(revisao!.textos?.[0].copy, "Texto da copy desse criativo.");
});

test("publish_campaign do MCP usa a pre-checagem compartilhada", () => {
  // Tinha a quarta copia das mesmas checagens, e nenhuma olhava needsReview.
  const MCP_SRV = readFileSync(new URL("../mcpServer.ts", import.meta.url), "utf8");
  // Ancora no titulo da ferramenta: a string "publish_campaign" aparece antes,
  // numa referencia a ela em outra resposta.
  const inicio = MCP_SRV.indexOf('title: "Publicar campanha na Meta"');
  assert.ok(inicio > 0, "registro da ferramenta publish_campaign nao encontrado");
  const bloco = MCP_SRV.slice(inicio, inicio + 6000);
  assert.match(bloco, /pendenciasLocaisParaPublicar/);
  assert.doesNotMatch(bloco, /auditCarouselCreatives\(creatives\)/, "a auditoria de copy vem da pre-checagem, nao de copia local");
});

test("as tres portas usam a mesma triagem, nenhuma reimplementa a regra", () => {
  for (const [nome, fonte] of [["tela", ROTA], ["chat", CHAT], ["mcp", MCP]] as const) {
    assert.match(fonte, /triarParaAprovacao\(/, `${nome} precisa triar pela regra compartilhada`);
    assert.match(fonte, /aplicarAprovacaoPorScore\(/, `${nome} precisa aplicar pela regra compartilhada`);
    assert.doesNotMatch(fonte, /needsReview: false,\s*\n\s*reviewApprovedAt/, `${nome} esta montando o carimbo na mao de novo`);
  }
});

test("a tela confirma antes de gravar", () => {
  // Aprovar texto que a IA achou fraco e decisao do usuario, nao efeito de um
  // clique. Mesma ideia do token de confirmacao no chat.
  const bloco = ROTA.slice(ROTA.indexOf("approveCreativeReview: protectedProcedure"), ROTA.indexOf("approveCreativeReview: protectedProcedure") + 4000);
  const semConfirm = bloco.indexOf("if (!input.confirm)");
  const gravacao = bloco.indexOf("updateCampaignField");
  assert.ok(semConfirm > 0, "precisa de uma etapa que so mostra o diagnostico");
  assert.ok(semConfirm < gravacao, "a etapa sem confirm tem que sair antes de qualquer gravacao");
});

test("a tela tem como LER o que bloqueia, nao so aprovar", () => {
  // A pre-checagem existia so pro chat. A tela clicava em Publicar e recebia a
  // mensagem crua do primeiro portao.
  assert.match(ROTA, /publishPreflight: protectedProcedure/);
  const inicio = ROTA.indexOf("publishPreflight: protectedProcedure");
  const bloco = ROTA.slice(inicio, inicio + 1500);
  assert.match(bloco, /\.query\(/, "e leitura, nao mutation");
  assert.match(bloco, /pendenciasLocaisParaPublicar/, "mesma regra da publicacao real");
  assert.match(bloco, /userId !== ctx\.user\.id/, "sem checagem de dono qualquer conta le a campanha");
});

test("publishToMeta nomeia todas as pendencias, nao so a que ele barrou", () => {
  const inicio = ROTA.indexOf("assertCampaignPublishIntegrity(c, input)");
  assert.ok(inicio > 0);
  const bloco = ROTA.slice(inicio, inicio + 1200);
  assert.match(bloco, /pendenciasLocaisParaPublicar/);
  assert.match(bloco, /Pend[eê]ncias desta campanha/);
});

const TELA = readFileSync(new URL("../../client/src/pages/CampaignResult.tsx", import.meta.url), "utf8");

test("a tela consulta a pre-checagem antes de abrir o modal de publicar", () => {
  assert.match(TELA, /publishPreflight\?\.fetch/, "a tela precisa consultar a pre-checagem");
  const checagem = TELA.indexOf("if (await abrirRevisaoDeCriativos()) return;");
  const compliance = TELA.indexOf("complianceMutation.mutateAsync");
  assert.ok(checagem > 0, "a porta tem que existir no caminho de publicar");
  assert.ok(checagem < compliance, "a pre-checagem vem antes de abrir o modal");
});

test("a tela checa dono da campanha antes de gravar criativo", () => {
  // updateCreative gravava criativo por id de campanha sem checar dono.
  for (const mutation of ["updateCreative: protectedProcedure", "approveCreativeReview: protectedProcedure"]) {
    const inicio = ROTA.indexOf(mutation);
    assert.ok(inicio > 0, `${mutation} precisa existir`);
    const bloco = ROTA.slice(inicio, inicio + 4000);
    const posse = bloco.indexOf("userId !== ctx.user.id");
    const gravacao = bloco.indexOf("updateCampaignField");
    assert.ok(posse > 0, `${mutation} sem checagem de dono`);
    assert.ok(posse < gravacao, `${mutation} checa dono depois de gravar`);
  }
});
