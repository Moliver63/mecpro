import { test } from "node:test";
import assert from "node:assert/strict";
import { ajustarRascunhoCampanha } from "../campaignDraftEdit";
import { buildCampaignFacts } from "../campaignFactGuard";
import { auditCreativeSegmentAlignment } from "../ai";

// Forma real da 799 (Shadia Hasan), lida pelo MCP em 19/10: 3 conjuntos a
// "R$ 30/dia (33% do total)", 14 dias, mensal 90, criativo 1 com o depoimento
// inventado de "Ana Paula, 28".
const ADSETS = [
  { name: "TOF - Público Frio Autoconhecimento VR", budget: "R$ 30/dia (33% do total)", objective: "leads" },
  { name: "MOF - Público Interessado Jornada VR", budget: "R$ 30/dia (33% do total)", objective: "leads" },
  { name: "BOF - Público Pronto para Inscrição", budget: "R$ 30/dia (33% do total)", objective: "leads" },
];
const C1 = {
  headline: "Clareza Mental: Método Shadia Hasan", description: "Autoconhecimento e Foco", shortDescription: "Autoconhecimento e Foco",
  copy: "Ana Paula, 28, sentia o estresse da carreira afetar sua clareza mental. Descobriu na jornada VR de Shadia Hasan um refúgio.\n\n'É como se eu pudesse ver meus bloqueios.'",
  bodyText: "Ana Paula, 28, sentia o estresse da carreira afetar sua clareza mental.",
  cta: "Quero minha vaga",
  hook: "Estresse e falta de foco te impedem de avançar? A jornada VR de Shadia Hasan é a sua solução para clareza e equilíbrio.",
  script: "Vídeo: Cenas rápidas mostrando a rotina agitada de Ana. Narração: 'Ana Paula transformou o estresse em clareza.'",
  complianceNotes: "Depoimento fictício baseado em persona, sem promessas específicas.",
  segmentAlignment: "infoprodutos", segmentAlignmentIssues: [], finalScore: 57, needsReview: true,
};
const C0 = { headline: "Transforme Padrões Emocionais com VR", description: "Autoconhecimento Imersivo", copy: "Preso em padrões que te limitam? Descubra o Método Shadia Hasan, uma jornada de autoconhecimento em Realidade Virtual. Acesse a aula grátis.", cta: "Acessar Aula Grátis Agora", hook: "Cansado de padrões emocionais repetitivos?", segmentAlignment: "infoprodutos", segmentAlignmentIssues: [], finalScore: 68, needsReview: true };

function campanha(extra: any = {}) {
  const facts = buildCampaignFacts({
    input: { objective: "leads" },
    clientProfile: { niche: "infoprodutos", productService: "Curso e jornada de autoconhecimento pelo Método Shadia Hasan com aula introdutória gratuita" },
    segment: "infoprodutos",
  });
  return {
    id: 799, projectId: 49, publishStatus: "draft", metaCampaignId: null, publishedAt: null,
    suggestedBudgetDaily: 6, suggestedBudgetMonthly: 90, durationDays: 14,
    adSets: JSON.stringify(ADSETS), creatives: JSON.stringify([C0, C1]),
    strategy: JSON.stringify({ resumo: "Investimento de R$ 30/dia por conjunto, R$ 90/dia no total." }),
    aiResponse: JSON.stringify({ campaignFacts: facts }),
    ...extra,
  };
}

const PEDIDO_799 = {
  adSetBudgetsDaily: [2, 2, 2], suggestedBudgetDaily: 6, suggestedBudgetMonthly: 84,
  creativeEdits: [{
    index: 1,
    headline: "Jornada de autoconhecimento Shadia Hasan",
    copy: "Conheça o Método Shadia Hasan, uma proposta de desenvolvimento pessoal que combina autoconhecimento e experiências em realidade virtual. Acesse a aula introdutória gratuita para entender como a jornada funciona.",
    cta: "Saiba mais",
    hook: "Quer entender seus padrões emocionais? Conheça a jornada Shadia Hasan.",
    script: "Vídeo: pessoa usando óculos de realidade virtual em ambiente calmo. Narração: 'Conheça o Método Shadia Hasan. Acesse a aula introdutória gratuita.' CTA: 'Saiba mais'.",
    complianceNotes: "Copy factual definida pelo cliente em 20/10, sem depoimento e sem promessa de resultado.",
  }],
  strategyReplacements: [{ from: "R$ 30/dia por conjunto, R$ 90/dia no total", to: "R$ 2/dia por conjunto, R$ 6/dia no total" }],
  forbiddenTerms: ["Ana Paula", "rotina agitada de Ana", "fictício", "R$ 30"],
};

test("799: orcamento R$ 2 x 3 = R$ 6/dia, total 84, sem R$ 30 em conjunto nenhum, e avisa o minimo da Meta", () => {
  const r = ajustarRascunhoCampanha(campanha(), PEDIDO_799, auditCreativeSegmentAlignment);
  assert.equal(r.erro, undefined, String(r.erro));
  const adSets = JSON.parse(r.patch!.adSets!);
  assert.deepEqual(adSets.map((a: any) => a.budget), ["R$ 2,00/dia", "R$ 2,00/dia", "R$ 2,00/dia"]);
  assert.equal(r.patch!.suggestedBudgetDaily, 6);
  assert.equal(r.patch!.suggestedBudgetMonthly, 84);
  assert.ok((r.relatorio!.avisos as string[]).some((a) => /minimo de R\$ 5,11/.test(a)));
});

test("799: depoimento sai do texto, corpo, gancho, roteiro, V2 e resumo; nada sobra", () => {
  const r = ajustarRascunhoCampanha(campanha(), PEDIDO_799, auditCreativeSegmentAlignment);
  const c1 = JSON.parse(r.patch!.creatives!)[1];
  assert.equal(c1.headline, "Jornada de autoconhecimento Shadia Hasan");
  assert.equal(c1.bodyText, c1.copy);
  assert.equal(c1.cta, "Saiba mais");
  assert.deepEqual(r.relatorio!.termosResiduais, {});
  assert.doesNotMatch(r.patch!.strategy!, /R\$ 30/);
  const rev = (r.relatorio!.revisao as any[])[1];
  assert.ok(!rev.motivos.includes("depoimento_inventado"), JSON.stringify(rev));
});

test("headline acima de 40 e recusada sem salvar nada", () => {
  const r = ajustarRascunhoCampanha(campanha(), {
    ...PEDIDO_799,
    creativeEdits: [{ index: 1, headline: "Conheça a jornada de autoconhecimento Shadia Hasan" }],
  }, auditCreativeSegmentAlignment);
  assert.match(String(r.erro), /headline tem 50 caracteres; maximo 40/);
  assert.equal(r.patch, undefined);
});

test("campanha ja enviada a Meta e recusada", () => {
  const r = ajustarRascunhoCampanha(campanha({ publishStatus: "success", metaCampaignId: "123" }), PEDIDO_799, auditCreativeSegmentAlignment);
  assert.match(String(r.erro), /ja foi enviada a Meta/);
});

test("quantidade de valores diferente da de conjuntos e recusada", () => {
  const r = ajustarRascunhoCampanha(campanha(), { adSetBudgetsDaily: [3, 3] }, auditCreativeSegmentAlignment);
  assert.match(String(r.erro), /3 valor/);
});

test("sem mudancas: nao grava e devolve a revisao", () => {
  const r = ajustarRascunhoCampanha(campanha(), {}, auditCreativeSegmentAlignment);
  assert.deepEqual(r.patch, {});
  assert.equal((r.relatorio!.revisao as any[]).length, 2);
  assert.ok((r.relatorio!.valoresCitadosNoResumo as string[]).some((t) => t.includes("R$ 30")));
});
