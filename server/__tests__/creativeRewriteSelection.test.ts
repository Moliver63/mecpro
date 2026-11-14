import { test } from "node:test";
import assert from "node:assert/strict";
import { escolherMelhorReescrita, reescritaSuficiente, avaliarReescrita, type CandidatoReescrita } from "../creativeRewriteGuard";
import { buildCampaignFacts } from "../campaignFactGuard";

// Ver docs/specs/2026-11-14-reescrita-multi-provedor.md.
const facts = buildCampaignFacts({ input: {}, clientProfile: {}, segment: "servicos" } as any);

function cand(provedor: string, criativo: Record<string, string>, rejected: string[] = []): CandidatoReescrita {
  return { provedor, candidate: criativo, rejected: rejected as any, issues: [], accepted: [] };
}

const limpo = { headline: "Agende sua avaliação", description: "Atendimento rápido", copy: "Fale com a equipe e tire suas dúvidas.", hook: "Precisa de ajuda?", cta: "Agendar" };
const comProvaSocial = { ...limpo, copy: "Milhares de clientes já mudaram de vida com a gente." };

test("lista vazia devolve null", () => {
  assert.equal(escolherMelhorReescrita([], facts, () => 80), null);
});

test("empate fica com o primeiro (provedor primario)", () => {
  const r = escolherMelhorReescrita([cand("gemini", limpo), cand("groq", limpo)], facts, () => 80);
  assert.equal(r?.provedor, "gemini");
});

test("campo rejeitado perde para candidato completo mesmo com score maior", () => {
  const rejeitado = { ...limpo };
  const r = escolherMelhorReescrita(
    [cand("gemini", rejeitado, ["headline"]), cand("groq", limpo)],
    facts, c => (c === rejeitado ? 99 : 70),
  );
  assert.equal(r?.provedor, "groq");
});

test("problema extra pesa mais que score", () => {
  const repetido = { ...limpo };
  const r = escolherMelhorReescrita(
    [cand("gemini", repetido), cand("groq", limpo)],
    facts, c => (c === repetido ? 99 : 70), c => (c === repetido ? 1 : 0),
  );
  assert.equal(r?.provedor, "groq");
});

test("campo fora do limite pesa mais que score", () => {
  const longo = { ...limpo, headline: "x".repeat(60) };
  const r = escolherMelhorReescrita(
    [cand("gemini", longo), cand("groq", limpo)],
    facts, c => (c === longo ? 99 : 70),
  );
  assert.equal(r?.provedor, "groq");
});

test("rejeitado pesa mais que campo fora do limite", () => {
  const longo = { ...limpo, headline: "x".repeat(60) };
  const rejeitado = { ...limpo };
  const r = escolherMelhorReescrita(
    [cand("gemini", rejeitado, ["cta"]), cand("groq", longo)],
    facts, () => 80,
  );
  assert.equal(r?.provedor, "groq");
});

test("Fact Guard do criativo inteiro reprovado perde, mesmo com menos rejeitados e score maior", () => {
  const r = escolherMelhorReescrita(
    [cand("gemini", comProvaSocial), cand("groq", limpo, ["description"])],
    facts, c => (c === comProvaSocial ? 99 : 60),
  );
  assert.equal(r?.factOk, true);
  assert.equal(r?.provedor, "groq");
});

test("headline repetida de outro card perde no reparo de irmaos", () => {
  const repetido = { ...limpo, headline: "Mesma headline" };
  const r = escolherMelhorReescrita(
    [cand("gemini", repetido), cand("groq", limpo)],
    facts, () => 80, c => (c.headline === "Mesma headline" ? 1 : 0),
  );
  assert.equal(r?.provedor, "groq");
});

test("score decide quando todo o resto empata", () => {
  const outro = { ...limpo, headline: "Outra headline boa" };
  const r = escolherMelhorReescrita(
    [cand("gemini", limpo), cand("groq", outro)],
    facts, c => (c === outro ? 90 : 76),
  );
  assert.equal(r?.provedor, "groq");
});

test("reescrita suficiente exige tudo limpo e score no limiar", () => {
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo), facts, () => 80), 75), true);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo), facts, () => 74), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo, ["cta"]), facts, () => 90), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", comProvaSocial), facts, () => 90), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", limpo), facts, () => 90, () => 1), 75), false);
  assert.equal(reescritaSuficiente(avaliarReescrita(cand("gemini", { ...limpo, headline: "x".repeat(60) }), facts, () => 90), 75), false);
});

// ── Conserto dirigido (docs/specs/2026-11-14-conserto-dirigido-cloudflare.md) ──
import { camposComErroObjetivo, extrairJsonDeResposta } from "../creativeRewriteGuard";

test("campo limpo nao e acusado", () => {
  assert.deepEqual(camposComErroObjetivo(limpo, facts), []);
});

test("acusa comprimento, placeholder e alegacao nao confirmada no campo certo", () => {
  const erros = camposComErroObjetivo({
    ...limpo,
    headline: "x".repeat(45),
    cta: "Fale com [cidade]",
    copy: comProvaSocial.copy,
  }, facts);
  const por = Object.fromEntries(erros.map(e => [e.campo, e.motivos.join(" | ")]));
  assert.match(por.headline, /acima de 40/);
  assert.match(por.cta, /placeholder/);
  assert.match(por.copy, /alegacao nao confirmada/);
  assert.equal(por.hook, undefined);
  assert.equal(por.description, undefined);
});

test("espelhos viram o campo principal e nao duplicam", () => {
  const erros = camposComErroObjetivo({ ...limpo, copy: comProvaSocial.copy, bodyText: comProvaSocial.copy }, facts);
  assert.deepEqual(erros.map(e => e.campo), ["copy"]);
});

test("espelho sem o campo principal continua sendo acusado", () => {
  const { copy: _c, ...semCopy } = limpo as any;
  const erros = camposComErroObjetivo({ ...semCopy, bodyText: "y".repeat(600) }, facts);
  assert.deepEqual(erros.map(e => e.campo), ["bodyText"]);
});

test("duplicata entra como erro", () => {
  const erros = camposComErroObjetivo(limpo, facts, ["headline"]);
  assert.deepEqual(erros, [{ campo: "headline", motivos: ["repetido em outro card"] }]);
});

test("extrai JSON tirando <think> e texto em volta", () => {
  assert.equal(extrairJsonDeResposta('<think>pensando {x}</think>\nAqui: {"headline":"Oi"} fim'), '{"headline":"Oi"}');
  assert.equal(extrairJsonDeResposta('{"a":1}'), '{"a":1}');
  assert.equal(extrairJsonDeResposta("<think>sem fim {"), "");
});

import { motivoParaRecusarConserto, manterMelhorVersao } from "../creativeRewriteGuard";

test("conserto que perde negacao e recusado", () => {
  assert.equal(motivoParaRecusarConserto("Não garantimos aprovação de crédito", "Garantimos aprovação rápida", ""), "negacao_perdida");
  assert.equal(motivoParaRecusarConserto("Sem taxa de adesão", "Sem taxa de adesão hoje", ""), null);
});

test("conserto com numero novo e recusado; numero dos fatos ou do original passa", () => {
  assert.match(String(motivoParaRecusarConserto("Aula prática de autoconhecimento", "Últimas 10 vagas na aula", "")), /numero_novo:10/);
  assert.equal(motivoParaRecusarConserto("Aula prática", "Aula por R$ 19,90", "preco: R$ 19,90"), null);
  assert.equal(motivoParaRecusarConserto("Acesso por 7 dias à aula completa", "Aula completa, 7 dias", ""), null);
});

test("melhor versao: 73 na tentativa 1 nao e trocada por 65 na tentativa 2 (caso real da 810)", () => {
  const v73 = { criativo: { ...limpo, headline: "Versão 73" } };
  const v65 = { criativo: { ...limpo, headline: "Versão 65" } };
  const pontos = (c: any) => (c === v73.criativo ? 73 : 65);
  assert.equal(manterMelhorVersao(v73, v65, facts, pontos), v73);
  assert.equal(manterMelhorVersao(v65, v73, facts, pontos), v73);
});

test("melhor versao: corrigir Fact Guard vale mais que score", () => {
  const ruim = { criativo: comProvaSocial };
  const limpaPior = { criativo: { ...limpo } };
  const pontos = (c: any) => (c === comProvaSocial ? 90 : 60);
  assert.equal(manterMelhorVersao(ruim, limpaPior, facts, pontos), limpaPior);
});

test("melhor versao: empate fica com a guardada", () => {
  const a = { criativo: { ...limpo } };
  const b = { criativo: { ...limpo } };
  assert.equal(manterMelhorVersao(a, b, facts, () => 80), a);
});

test("placeholder vazio [] tambem e acusado", () => {
  assert.deepEqual(camposComErroObjetivo({ ...limpo, cta: "Fale com [] agora" }, facts).map(e => e.campo), ["cta"]);
});

import { textoDeFatosConfirmados } from "../creativeRewriteGuard";
import { formatCampaignFactsForPrompt } from "../campaignFactGuard";

test("numeros da lista PROIBIDO nao viram numeros autorizados (bloqueante da revisao)", () => {
  const f = buildCampaignFacts({ input: { objective: "leads" }, clientProfile: { niche: "educacao" }, segment: "educacao" } as any);
  const confirmados = textoDeFatosConfirmados(f);
  for (const inventado of ["Últimas 3 vagas na turma", "Resposta em 24 horas", "Só 2 dias para garantir"]) {
    assert.notEqual(motivoParaRecusarConserto("Aula prática de autoconhecimento", inventado, confirmados), null, inventado);
  }
  // o texto do prompt continua tendo a lista proibida; usa-lo aqui liberaria esses numeros
  assert.match(formatCampaignFactsForPrompt(f), /\d/);
});

test("preco confirmado no perfil passa, com virgula ou ponto", () => {
  const f = buildCampaignFacts({ input: { objective: "traffic" }, clientProfile: { niche: "educacao", productPrice: "R$ 19,90" }, segment: "educacao" } as any);
  const confirmados = textoDeFatosConfirmados(f);
  assert.equal(motivoParaRecusarConserto("Aula prática", "Aula por R$ 19,90", confirmados), null);
  assert.equal(motivoParaRecusarConserto("Aula prática", "Aula por 19.90", confirmados), null);
  assert.match(String(motivoParaRecusarConserto("Aula prática", "Aula por R$ 29,90", confirmados)), /numero_novo/);
});

test("melhor versao nao pune campo pendente: reescrita 88 vence entrada 55", () => {
  const entrada = { criativo: { ...limpo } };
  const reescrita = { criativo: { ...limpo, headline: "Outra" }, pendentes: ["pain"] as any };
  const pontos = (c: any) => (c === entrada.criativo ? 55 : 88);
  assert.equal(manterMelhorVersao(entrada, reescrita, facts, pontos), reescrita);
});

test("espelho com texto diferente do principal e acusado no proprio espelho", () => {
  const erros = camposComErroObjetivo({ ...limpo, shortDescription: "z".repeat(35) }, facts);
  assert.deepEqual(erros.map(e => e.campo), ["shortDescription"]);
});
