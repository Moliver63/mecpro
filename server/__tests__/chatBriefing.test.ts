import test from "node:test";
import assert from "node:assert/strict";
import { briefingContext, mergeChatBriefing, campaignResultText, generationErrorText, isLastCampaignLinkRequest, categoriasDeConflito } from "../chatBriefing";

test("current retry terms reach generation without leaking to future briefings", () => {
  const original = { projectId: 7, forbiddenTerms: ["old"] };
  const next = mergeChatBriefing(original, { forbiddenTerms: [" exclusivos ", "exclusivos", 12, ""] });
  assert.deepEqual(next.forbiddenTerms, ["exclusivos"]);
  assert.deepEqual(original.forbiddenTerms, ["old"]);
  assert.equal(mergeChatBriefing(next, { projectId: 9 }).forbiddenTerms, undefined);
  assert.equal(mergeChatBriefing(next, {}).forbiddenTerms, undefined);
  assert.equal(mergeChatBriefing(next, { forbiddenTerms: "invalid" }).forbiddenTerms, undefined);
});

test("briefing retains known fields and replaces total budget without multiplying again", () => {
  const previous = { projectId: 97, platform: "meta", objective: "leads", budget: 84, durationDays: 14, ageMin: 30, ageMax: 60, whatsapp: "47999465824" };
  const next = mergeChatBriefing(previous, { budget: 100, unknown: "ignored" });
  assert.deepEqual(next, { ...previous, budget: 100 });
  assert.equal(previous.budget, 84);
});
test("explicit new project clears old ID without losing campaign settings", () => {
  const next = mergeChatBriefing({ projectId: 97, objective: "leads", budget: 100 }, { createProject: true, projectName: "Morebem locp1" });
  assert.equal(next.projectId, undefined);
  assert.equal(next.budget, 100);
  const selected = mergeChatBriefing(next, { projectId: 101 });
  assert.equal(selected.createProject, false);
  assert.equal(selected.projectName, undefined);
});
test("null clears a field and invalid numeric updates do not corrupt it", () => {
  assert.deepEqual(mergeChatBriefing({ budget: 100, city: "BC" }, { budget: NaN, city: null }), { budget: 100 });
});
test("successful result contains authoritative ID/link and no publication claim", () => {
  const text = campaignResultText({ id: 775, projectId: 97, name: "Sala", url: "/projects/97/campaign/result/775", photoCount: 5, coverFileName: "fachada.jpg" });
  assert.match(text, /775/);
  assert.match(text, /Fotos encaminhadas ao gerador: 5/);
  assert.match(text, /fachada.jpg/);
  assert.match(text, /Nada foi publicado/);
});
test("fact errors do not ask users to approve invented claims or change project", () => {
  const text = generationErrorText("FACT_CONFLICT: escritorio");
  assert.match(text, /briefing foi mantido|briefing continua guardado/);
  assert.doesNotMatch(text, /escritorio/);
  assert.equal(generationErrorText("Informe a capa"), "Informe a capa");
});
test("last-link requests do not accidentally regenerate", () => {
  assert.equal(isLastCampaignLinkRequest("me mostra o link"), true);
  assert.equal(isLastCampaignLinkRequest("gerar nova e mandar link"), false);
  assert.equal(isLastCampaignLinkRequest("link da campanha 773"), false);
});
test("concurrent conversations have isolated briefing context", async () => {
  await Promise.all([97, 101].map(projectId => briefingContext.run({ briefing: { projectId } }, async () => {
    await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(briefingContext.getStore()?.briefing.projectId, projectId);
  })));
});

// Incidente real (Michel colou a mensagem, 10/10). O texto dizia "incluiu
// alguma informação que você ainda não confirmou" e terminava em "Posso tentar
// gerar de novo agora, com mais cuidado pra não incluir isso. Tudo bem?".
//
// A vagueza do VALOR e deliberada e continua (ver abaixo). O que estava errado
// era nao dar categoria nenhuma, e prometer "mais cuidado" — diligencia que
// nada entrega. O mecanismo real e `termosRejeitados` → `forbiddenTerms`.
const ERRO_REAL = "FACT_CONFLICT: criativos contém informações não confirmadas ou conflitantes. " +
  "creatives.2.description: piscina aquecida (unverified_benefit_claim); " +
  "creatives.0.headline: a partir de R$ 450.000 (price_not_confirmed_in_current_briefing)";

test("erro de fato diz a CATEGORIA do que barrou, sem vazar o valor inventado", () => {
  const texto = generationErrorText(ERRO_REAL);

  // A metade que protege, e que e o ponto todo: o valor rejeitado nao pode
  // aparecer. Mostrar "piscina aquecida" convida o usuario a confirmar a
  // invencao do modelo, que e o dano que o Fact Guard existe pra impedir.
  assert.doesNotMatch(texto, /piscina aquecida/i, "valor inventado nao pode chegar ao usuario");
  assert.doesNotMatch(texto, /450\.000/, "preco inventado nao pode chegar ao usuario");
  assert.doesNotMatch(texto, /creatives\.\d/, "caminho tecnico do campo e jargao interno");
  assert.doesNotMatch(texto, /unverified_benefit_claim|price_not_confirmed/i, "codigo interno nao pode vazar");

  // Mas a categoria sai, porque e o que orienta a proxima acao.
  assert.match(texto, /um beneficio que nao esta no briefing/);
  assert.match(texto, /um preco que nao esta no briefing confirmado/);

  // Sem promessa de diligencia; com o mecanismo real.
  assert.doesNotMatch(texto, /mais cuidado/i);
  assert.match(texto, /excluindo os termos que foram barrados/);

  // E o caminho correto pra um fato que seja verdade: o usuario informa.
  assert.match(texto, /voc[eê] informar, n[aã]o aprovar o texto/);
  assert.match(texto, /briefing continua guardado/);
  assert.match(texto, /Nada foi publicado/);
});

test("erro sem motivo reconhecivel fica generico em vez de inventar categoria", () => {
  // Caso do teste de 17/09: payload sem o triplo campo/valor/motivo.
  const texto = generationErrorText("FACT_CONFLICT: escritorio");
  assert.doesNotMatch(texto, /escritorio/);
  assert.match(texto, /n[aã]o est[aá] no briefing confirmado/);
  assert.doesNotMatch(texto, /O que foi barrado/, "sem motivo lido, nao afirma categoria");
});

test("categoriasDeConflito le somente os motivos, e nao repete nem estoura", () => {
  assert.deepEqual(categoriasDeConflito("x: a (unverified_benefit_claim); y: b (unverified_benefit_claim)"),
    ["um beneficio que nao esta no briefing"], "categoria repetida aparece uma vez");

  // Variantes com sufixo dinamico (area_conflict_expected_120) tem que casar.
  assert.deepEqual(categoriasDeConflito("x: 95 (area_conflict_expected_120)"), ["uma area (m2) diferente da confirmada"]);
  assert.deepEqual(categoriasDeConflito("x: y (purpose_conflict_expected_locacao)"), ["uma finalidade (venda ou locacao) diferente da confirmada"]);

  // Teto de tres, pra mensagem nao virar relatorio.
  const muitos = ["unverified_benefit_claim", "price_not_confirmed_in_current_briefing", "address_not_confirmed_in_current_briefing",
    "campaign_objective_conflict", "unverified_social_proof_claim"].map((r, i) => `c.${i}: v (${r})`).join("; ");
  assert.equal(categoriasDeConflito(muitos).length, 3);

  // Entrada vazia, sem parenteses, ou motivo desconhecido: lista vazia.
  for (const vazio of ["", "FACT_CONFLICT: nada", "x: y (motivo_que_nao_existe)", null as any, undefined as any]) {
    assert.deepEqual(categoriasDeConflito(vazio), []);
  }
});
