// Casos reais da geracao das campanhas da Shadia Hasan (24/11/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignFacts, validateCampaignFactIntegrity } from "../campaignFactGuard";
import { resolveInitialCampaignSegment, auditCreativeSegmentAlignment, singularizarPlurais } from "../ai";
import { detectSegmentFromNiche } from "../../shared/segmentConfig";

const perfilShadia = {
  niche: "Psicologia e desenvolvimento humano: cursos online de autoconhecimento",
  productService: "Cursos online da psicóloga Shadia Hasan, pagamento único. Jornada Permita-se SER LIVRE, R$ 197 (de R$ 597). Pensamentos Automáticos, R$ 57 (de R$ 197), com o Diário da Transformação de presente.",
};

test("segmento: 'de presente' num perfil de cursos nao vira alimentacao", () => {
  assert.equal(resolveInitialCampaignSegment("", perfilShadia, "", ""), "infoprodutos");
  assert.equal(detectSegmentFromNiche(perfilShadia.productService), "infoprodutos");
});

test("segmento: confeitaria de verdade continua alimentacao, inclusive com 'presentes'", () => {
  assert.equal(detectSegmentFromNiche("Loja de doces e brigadeiros"), "alimentacao");
  assert.equal(detectSegmentFromNiche("Confeitaria: caixas de presentes e bolos por encomenda"), "alimentacao");
});

test("alinhamento: plural ('24 aulas') conta como sinal do segmento", () => {
  const criativo = { headline: "Nem toda prisão tem grades", copy: "Jornada com 24 aulas em 7 módulos. R$ 197." };
  assert.deepEqual(auditCreativeSegmentAlignment(criativo, "infoprodutos"), []);
  assert.equal(auditCreativeSegmentAlignment({ headline: "Nem toda prisão tem grades", copy: "Permita-se." }, "infoprodutos").length, 1, "sem sinal nenhum continua acusando");
  assert.equal(singularizarPlurais("aulas inscrições materiais imóveis"), "aula inscrição material imóvel");
});

test("preco: o preco 'de' que o briefing cita passa quando a copy tambem o usa como 'de'", () => {
  const facts = buildCampaignFacts({ input: { extraContext: "Curso Pensamentos Automáticos, R$ 57 na Black Friday." }, clientProfile: perfilShadia });
  const ok = validateCampaignFactIntegrity([{ copy: "5 aulas. R$ 57 na Black Friday (de R$ 197), pagamento único." }], facts);
  assert.equal(ok.status, "passed", JSON.stringify(ok.conflicts));
});

test("preco: valor que nao aparece no briefing continua bloqueado; preco 'de' usado como preco de venda tambem", () => {
  const facts = buildCampaignFacts({ input: { extraContext: "Curso Pensamentos Automáticos, R$ 57 na Black Friday." }, clientProfile: perfilShadia });
  const inventado = validateCampaignFactIntegrity([{ copy: "Curso por R$ 47 hoje." }], facts);
  assert.equal(inventado.status, "failed");
  const comoVenda = validateCampaignFactIntegrity([{ copy: "Curso por R$ 597 hoje." }], facts);
  assert.equal(comoVenda.status, "failed", "R$ 597 e preco 'de' no perfil; como preco de venda nao vale");
});

test("preco: catalogo citado no briefing ATUAL da campanha aceita cada preco citado", () => {
  const facts = buildCampaignFacts({ input: { extraContext: "Oferta: Pensamentos Automáticos R$ 57 e Permita-se Ser Livre R$ 197." }, clientProfile: perfilShadia });
  const r = validateCampaignFactIntegrity([{ copy: "Pensamentos Automáticos por R$ 57. Permita-se Ser Livre por R$ 197." }], facts);
  assert.equal(r.status, "passed", JSON.stringify(r.conflicts));
});

import { ajustarConjuntosAoDiario, verificarOrcamentoDoRascunho } from "../../shared/orcamentoDoRascunho";

test("orcamento: R$ 10/dia com 2 conjuntos 'R$ 35/mes (50%)' vira 1 conjunto de R$ 10/dia, total igual", () => {
  const rascunho = {
    suggestedBudgetDaily: 10, suggestedBudgetMonthly: 70, durationDays: 7,
    adSets: JSON.stringify([
      { name: "TOF - Interesses", budget: "R$ 35/mês (50% do total)" },
      { name: "MOF - Remarketing", budget: "R$ 35/mês (50% do total)" },
    ]),
  };
  assert.equal(verificarOrcamentoDoRascunho(rascunho).situacao, "divergente");
  const r = ajustarConjuntosAoDiario(rascunho, Math.floor(10 / 6));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.removidos, ["MOF - Remarketing"]);
    assert.equal(r.adSets.length, 1);
    assert.equal(r.adSets[0].name, "TOF - Interesses");
    assert.equal(verificarOrcamentoDoRascunho({ ...rascunho, adSets: JSON.stringify(r.adSets) }).situacao, "ok");
  }
});

test("orcamento: quando todos os conjuntos cabem, nada e removido", () => {
  const r = ajustarConjuntosAoDiario({ suggestedBudgetDaily: 30, durationDays: 7, adSets: [{ name: "A", budget: "R$ 15/dia" }, { name: "B", budget: "R$ 15/dia" }] }, 5);
  assert.equal(r.ok, false);
});

import { truncarCamposNoLimite } from "../creativeRewriteGuard";

test("comprimento: copy longa com conflito antigo e cortada; o conflito continua visivel", () => {
  const facts = buildCampaignFacts({ input: { extraContext: "Curso Pensamentos Automáticos, R$ 57 na Black Friday." }, clientProfile: perfilShadia, segment: "infoprodutos" });
  const longa = "Curso por R$ 47 hoje. " + "Você repete pensamentos que travam suas escolhas e nem percebe. ".repeat(9);
  assert.ok(longa.length > 500);
  const r = truncarCamposNoLimite({ copy: longa }, facts);
  assert.deepEqual(r.truncados, ["copy"]);
  assert.ok(r.candidate.copy.length <= 500);
  assert.equal(validateCampaignFactIntegrity([r.candidate], facts).status, "failed", "o R$ 47 inventado continua acusado");
});

import { termosDeInteresse, faixaParaAdvantage } from "../metaTargeting";

test("publicacao: 'interessados em ...' vira lista de interesses (caso da 823)", () => {
  assert.deepEqual(
    termosDeInteresse("Adultos 25-60 anos, interessados em psicologia, autoconhecimento, desenvolvimento pessoal, inteligência emocional, bem-estar, meditação."),
    ["psicologia", "autoconhecimento", "desenvolvimento pessoal", "inteligência emocional", "bem-estar"],
  );
  assert.deepEqual(termosDeInteresse("Interesses: psicologia, terapia"), ["psicologia", "terapia"]);
  assert.deepEqual(termosDeInteresse("Adultos com interesses em yoga e meditação"), ["yoga", "meditação"]);
  assert.deepEqual(termosDeInteresse("Mulheres 30-50 em Balneário Camboriú"), []);
});

test("publicacao: com Advantage+ a faixa vai na regra da Meta; sem Advantage+ fica como pedida", () => {
  assert.deepEqual(faixaParaAdvantage(25, 60, true), { min: 25, max: 65, ajustada: true });
  assert.deepEqual(faixaParaAdvantage(35, 55, true), { min: 25, max: 65, ajustada: true });
  assert.deepEqual(faixaParaAdvantage(25, 60, false), { min: 25, max: 60, ajustada: false });
});
