import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticarRevisao, triarParaAprovacao, aplicarAprovacaoPorScore, promessasComPrazo } from "../creativeReview";
import { buildCampaignFacts } from "../campaignFactGuard";

// Ver docs/specs/2026-11-14-urgencia-e-resultado-com-prazo.md (versao reduzida).
const facts = buildCampaignFacts({
  input: { objective: "traffic", extraContext: "Aula completa por R$ 19,90, pagamento unico, acesso por 7 dias." },
  clientProfile: { niche: "autoconhecimento" },
  segment: "infoprodutos",
} as any);

const base: Record<string, any> = {
  headline: "Aula de autoconhecimento R$19,90",
  hook: "Cansado de repetir os mesmos padrões?",
  copy: "Aula completa com a psicóloga, acesso por 7 dias.",
  cta: "Quero minha aula",
  finalScore: 80,
};

test("promessa com prazo vira motivo de revisao liberavel por aprovacao", () => {
  const d = diagnosticarRevisao({ ...base, description: "Transforme-se em 7 dias" }, facts);
  assert.deepEqual(d.motivos, ["promessa_com_prazo"]);
  assert.equal(d.liberavelPorAprovacao, true);
  assert.match(d.detalhes.join(" "), /Transforme-se em 7 dias/);
});

test("score baixo + promessa com prazo continua liberavel", () => {
  const d = diagnosticarRevisao({ ...base, finalScore: 70, description: "Transforme-se em 7 dias" }, facts);
  assert.deepEqual(d.motivos.sort(), ["promessa_com_prazo", "score_baixo"]);
  assert.equal(d.liberavelPorAprovacao, true);
});

test("promessa com prazo junto de placeholder NAO e liberavel", () => {
  const d = diagnosticarRevisao({ ...base, description: "Transforme-se em 7 dias", cta: "Fale com [cidade]" }, facts);
  assert.equal(d.liberavelPorAprovacao, false);
});

test("criativo limpo nao ganha motivo; score baixo sozinho segue como antes", () => {
  assert.deepEqual(diagnosticarRevisao(base, facts).motivos, []);
  const d = diagnosticarRevisao({ ...base, finalScore: 70 }, facts);
  assert.deepEqual(d.motivos, ["score_baixo"]);
  assert.equal(d.liberavelPorAprovacao, true);
});

test("promessa confirmada pelo cliente nao vira alerta", () => {
  const f = buildCampaignFacts({
    input: { objective: "leads", extraContext: "Mentoria: resultados em 30 dias, comprovados pelos alunos." },
    clientProfile: { niche: "mentoria" }, segment: "infoprodutos",
  } as any);
  assert.deepEqual(promessasComPrazo({ ...base, headline: "Resultados em 30 dias" }, f), []);
});

test("triagem e aprovacao liberam promessa com prazo e registram o motivo", () => {
  const criativos = [{ ...base, description: "Transforme-se em 7 dias", needsReview: true }];
  const t = triarParaAprovacao(criativos, null, facts);
  assert.deepEqual(t.liberaveis.map(l => l.index), [0]);
  const [aprovado] = aplicarAprovacaoPorScore(criativos, [0], "teste", "2026-11-14T00:00:00Z");
  assert.equal(aprovado.needsReview, false);
  assert.equal(aprovado.reviewApprovalReason, "promessa_com_prazo");
});

import { marcarPromessasParaRevisao } from "../creativeReview";

test("marcacao na geracao: promessa vira needsReview com a frase; limpo fica igual (mesmo objeto)", () => {
  const limpo: any = { ...base };
  const comPromessa = { ...base, hook: "Transforme sua relação consigo mesmo em 7 dias!", needsReview: false };
  const [a, b] = marcarPromessasParaRevisao([limpo, comPromessa], facts);
  assert.equal(a, limpo);
  assert.equal(b.needsReview, true);
  assert.deepEqual(b.promessasComPrazo.length, 1);
});

test("marcacao respeita promessa confirmada pelo cliente (nao gera nao_identificado depois)", () => {
  const f = buildCampaignFacts({
    input: { objective: "leads", extraContext: "Mentoria: resultados em 30 dias, comprovados pelos alunos." },
    clientProfile: { niche: "mentoria" }, segment: "infoprodutos",
  } as any);
  const cr: any = { ...base, headline: "Resultados em 30 dias" };
  const [m] = marcarPromessasParaRevisao([cr], f) as any[];
  assert.equal(m, cr);
  assert.notEqual(m.needsReview, true);
});
