import { test } from "node:test";
import assert from "node:assert/strict";
import { editarCriativo, aprovarRevisaoCriativo } from "../chatCreativeEdit";
import { diagnosticarRevisao } from "../creativeReview";
import { pendenciasLocaisParaPublicar } from "../publishPreflight";
import { buildCampaignFacts } from "../campaignFactGuard";
import { auditCreativeSegmentAlignment } from "../ai";

// Textos REAIS da campanha 799 (Shadia Hasan), lidos em 19/10 pelo MCP.
// Criativo 0: so score baixo (68). Criativo 1: score 57 + depoimento
// inventado ("Ana Paula, 28") que a propria geracao anotou como ficticio.
const C0 = {
  headline: "Transforme Padrões Emocionais com VR",
  description: "Autoconhecimento Imersivo", shortDescription: "Autoconhecimento Imersivo",
  copy: "Preso em padrões que te limitam? Descubra o Método Shadia Hasan, uma jornada única de autoconhecimento e desenvolvimento pessoal em Realidade Virtual. Acesse a aula grátis e dê o primeiro passo para compreender e transformar seus comportamentos. Aprofunde sua clareza e melhore seus relacionamentos. Inicie sua transformação hoje mesmo!",
  bodyText: "texto antigo",
  cta: "Acessar Aula Grátis Agora",
  hook: "Cansado de se sentir preso em padrões emocionais repetitivos? Comece a mudar agora!",
  segmentAlignmentIssues: [], segmentAlignment: "infoprodutos", hasPlaceholder: false,
  finalScore: 68, needsReview: true, feedImageUrl: "https://res.cloudinary.com/x/a.jpg",
  complianceNotes: "Conforme políticas Meta Ads 2026.",
};
const C1 = {
  headline: "Clareza Mental: Método Shadia Hasan",
  description: "Autoconhecimento e Foco",
  copy: "Ana Paula, 28, sentia o estresse da carreira afetar sua clareza mental. Descobriu na jornada VR de Shadia Hasan um refúgio para focar e encontrar equilíbrio.\n\n'É como se eu pudesse ver meus bloqueios e, ao mesmo tempo, encontrar o caminho para superá-los.'\n\nDescubra como você também pode ter essa clareza. Garanta sua vaga e transforme sua vida.",
  cta: "Quero minha vaga",
  hook: "Estresse e falta de foco te impedem de avançar? A jornada VR de Shadia Hasan é a sua solução para clareza e equilíbrio.",
  segmentAlignmentIssues: [], segmentAlignment: "infoprodutos", hasPlaceholder: false,
  finalScore: 57, needsReview: true, feedImageUrl: "https://res.cloudinary.com/x/b.jpg",
  complianceNotes: "Conforme políticas Meta Ads 2026. Depoimento fictício baseado em persona, sem promessas específicas.",
};

function facts() {
  return buildCampaignFacts({
    input: { objective: "leads" },
    clientProfile: { niche: "infoprodutos", productService: "Curso e jornada de autoconhecimento pelo Método Shadia Hasan" },
    segment: "infoprodutos",
  });
}

function loja(creatives: any[], opts: { dono?: number; comFatos?: boolean } = {}) {
  const campaign: any = {
    id: 799, projectId: 49, objective: "leads",
    adSets: JSON.stringify([{ budget: "R$ 30/dia" }]),
    creatives: JSON.stringify(creatives),
    aiResponse: JSON.stringify(opts.comFatos === false ? {} : { campaignFacts: facts() }),
  };
  const writes: string[] = [];
  return {
    campaign, writes,
    store: {
      getProjectsByUserId: async (uid: number) => (uid === (opts.dono ?? 1) ? [{ id: 49, name: "Shadia Hasan" }] : []),
      getCampaignsByProjectId: async () => [campaign],
      getCampaignById: async () => campaign,
      updateCampaignField: async (_id: number, field: string, value: string) => { writes.push(value); campaign[field] = value; },
    },
  };
}
const criativos = (l: { campaign: any }) => JSON.parse(l.campaign.creatives);

test("diagnostico: 799 criativo 0 e so score baixo (liberavel); criativo 1 tem depoimento inventado (nao liberavel)", () => {
  const d0 = diagnosticarRevisao(C0, facts());
  assert.deepEqual(d0.motivos, ["score_baixo"]);
  assert.equal(d0.liberavelPorAprovacao, true);

  const d1 = diagnosticarRevisao(C1, facts());
  assert.ok(d1.motivos.includes("depoimento_inventado"), JSON.stringify(d1));
  assert.equal(d1.liberavelPorAprovacao, false);
  // O texto sozinho ja denuncia, sem depender da anotacao da geracao.
  const soTexto = diagnosticarRevisao({ ...C1, textEditedAt: "2026-10-19", complianceNotes: null }, facts());
  assert.ok(soTexto.motivos.includes("depoimento_inventado"), JSON.stringify(soTexto));
});

test("diagnostico: placeholder e segmento bloqueiam aprovacao mesmo com score baixo junto", () => {
  assert.equal(diagnosticarRevisao({ ...C0, copy: C0.copy + " Em [cidade]." }).liberavelPorAprovacao, false);
  assert.equal(diagnosticarRevisao({ ...C0, segmentAlignmentIssues: ["Criativo sem sinais claros do segmento"] }).liberavelPorAprovacao, false);
});

test("diagnostico: needsReview sem motivo rastreavel nao e liberavel (truncamento nao deixa rastro)", () => {
  const d = diagnosticarRevisao({ ...C0, finalScore: 90 }, facts());
  assert.deepEqual(d.motivos, ["nao_identificado"]);
  assert.equal(d.liberavelPorAprovacao, false);
});

test("preflight recusa ANTES do token, por criativo, dizendo quem aprova e quem corrige", () => {
  const r = pendenciasLocaisParaPublicar(loja([C0, C1]).campaign);
  assert.equal(r.ok, false);
  assert.match(r.erro!, /2 criativo\(s\) ainda precisam de revis/);
  assert.match(r.erro!, /criativo\(s\) 0 tem so score baixo/);
  assert.match(r.erro!, /criativo\(s\) 1 precisam ter o texto corrigido/);
  assert.equal(r.issues?.length, 2);
});

test("preflight sem snapshot de fatos recusa com a mesma regra da publicacao real", () => {
  const r = pendenciasLocaisParaPublicar(loja([{ ...C0, needsReview: false }], { comFatos: false }).campaign);
  assert.equal(r.ok, false);
  assert.match(r.erro!, /CAMPAIGN_INTEGRITY/);
});

test("aprovar: primeira chamada nao grava e devolve a frase; frase exata aprova so o liberavel", async () => {
  const l = loja([C0, C1]);
  const r1: any = await aprovarRevisaoCriativo(1, { campaignId: 799 }, l.store, "pode aprovar");
  assert.equal(r1.confirmationRequired, true);
  assert.equal(l.writes.length, 0);
  assert.deepEqual(r1.paraAprovar.map((x: any) => x.index), [0]);
  assert.equal(r1.bloqueados.length, 1);
  const frase = String(r1.erro).match(/APROVAR CRIATIVOS [0-9a-f]{10}/)![0];

  const r2: any = await aprovarRevisaoCriativo(1, { campaignId: 799 }, l.store, frase, () => new Date("2026-10-19T20:00:00Z"));
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.aprovados, [0]);
  const [a, b] = criativos(l);
  assert.equal(a.needsReview, false);
  assert.equal(a.reviewApprovedBy, 1);
  assert.equal(a.reviewApprovalReason, "score_baixo");
  assert.equal(a.reviewApprovedAt, "2026-10-19T20:00:00.000Z");
  assert.equal(b.needsReview, true, "depoimento inventado continua bloqueando");
});

test("aprovar: frase de um texto antigo nao vale depois que o texto mudou", async () => {
  const l = loja([C0]);
  const r1: any = await aprovarRevisaoCriativo(1, { campaignId: 799 }, l.store, "");
  const frase = String(r1.erro).match(/APROVAR CRIATIVOS [0-9a-f]{10}/)![0];
  l.campaign.creatives = JSON.stringify([{ ...C0, headline: "Outro titulo de VR" }]);
  const r2: any = await aprovarRevisaoCriativo(1, { campaignId: 799 }, l.store, frase);
  assert.equal(r2.confirmationRequired, true);
  assert.equal(l.writes.length, 0);
});

test("aprovar: so bloqueados = recusa sem frase", async () => {
  const l = loja([C1]);
  const r: any = await aprovarRevisaoCriativo(1, { campaignId: 799 }, l.store, "");
  assert.equal(r.ok, false);
  assert.equal(r.confirmationRequired, undefined);
  assert.match(r.erro, /so libera score baixo/);
});

test("aprovar e editar: campanha de outra conta e recusada", async () => {
  const l = loja([C0], { dono: 2 });
  assert.match(String((await aprovarRevisaoCriativo(1, { campaignId: 799 }, l.store, "")).erro), /nao pertence/);
  assert.match(String((await editarCriativo(1, { campaignId: 799, creativeIndex: 0, headline: "x y" }, l.store, auditCreativeSegmentAlignment)).erro), /nao pertence/);
});

test("editar: tira o depoimento inventado, sincroniza alias e V2, e o criativo vira aprovavel ou livre", async () => {
  const l = loja([C0, C1]);
  const copy = "Sente que repete os mesmos padrões emocionais? O Método Shadia Hasan une autoconhecimento e desenvolvimento pessoal numa jornada prática em realidade virtual. Comece pela aula gratuita e entenda de onde vêm seus bloqueios.";
  const r: any = await editarCriativo(1, { campaignId: 799, creativeIndex: 1, copy }, l.store, auditCreativeSegmentAlignment);
  assert.equal(r.ok, true, JSON.stringify(r));
  const c = criativos(l)[1];
  assert.equal(c.copy, copy);
  assert.equal(c.creativeSystemV2.copyBank.bodies.find((b: any) => b.id === "legacy_body_primary").text, copy);
  assert.ok(c.textEditedAt);
  const d = diagnosticarRevisao(c, facts());
  assert.ok(!d.motivos.includes("depoimento_inventado"), JSON.stringify(d));
  assert.equal(c.needsReview, d.motivos.length > 0);
  if (c.needsReview) assert.equal(d.liberavelPorAprovacao, true);
});

test("editar: alias bodyText/shortDescription acompanham copy/description", async () => {
  const l = loja([C0]);
  const r: any = await editarCriativo(1, { campaignId: 799, creativeIndex: 0, description: "Aula grátis em VR", copy: C0.copy.replace("hoje mesmo", "agora") }, l.store, auditCreativeSegmentAlignment);
  assert.equal(r.ok, true, JSON.stringify(r));
  const c = criativos(l)[0];
  assert.equal(c.bodyText, c.copy);
  assert.equal(c.shortDescription, "Aula grátis em VR");
});

test("editar: recusa sem gravar texto acima do limite, placeholder ou prova social inventada", async () => {
  const l = loja([C0]);
  const longo: any = await editarCriativo(1, { campaignId: 799, creativeIndex: 0, headline: "x".repeat(41) }, l.store, auditCreativeSegmentAlignment);
  assert.match(longo.erro, /headline tem 41 caracteres; maximo 40/);
  const ph: any = await editarCriativo(1, { campaignId: 799, creativeIndex: 0, headline: "Aula em [cidade]" }, l.store, auditCreativeSegmentAlignment);
  assert.match(ph.erro, /marcador/);
  const prova: any = await editarCriativo(1, { campaignId: 799, creativeIndex: 0, copy: "Mais de 5000 alunos já passaram pelo Método Shadia Hasan de autoconhecimento em realidade virtual." }, l.store, auditCreativeSegmentAlignment);
  assert.match(prova.erro, /alegacao/);
  assert.equal(l.writes.length, 0);
});

test("editar invalida aprovacao anterior: aprovacao valia para o texto antigo", async () => {
  const l = loja([{ ...C0, needsReview: false, reviewApprovedAt: "x", reviewApprovedBy: 1, reviewApprovalReason: "score_baixo" }]);
  await editarCriativo(1, { campaignId: 799, creativeIndex: 0, cta: "Quero a aula grátis" }, l.store, auditCreativeSegmentAlignment);
  const c = criativos(l)[0];
  assert.equal(c.reviewApprovedAt, undefined);
  assert.equal(c.reviewApprovalReason, undefined);
});
