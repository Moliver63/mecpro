import test from "node:test";
import assert from "node:assert/strict";
import { alinharObjetivosAninhados } from "../campaignRuleRetrieval";
import { buildCampaignFacts, validateCampaignFactIntegrity } from "../campaignFactGuard";

// Reproducao do log de producao de 28/09, projeto 49 "Shadia Hasan — Leads":
// FACT_CONFLICT em creatives.4.adSets.2.objective com valor "sales", numa
// campanha cujo objetivo confirmado e "leads". O indice 4 e o invólucro
// { adSets } que o chamador adiciona depois dos 4 criativos.
const conteudoDoIncidente = () => [
  { headline: "Jornada de autoconhecimento", copy: "Converse com a equipe sobre o curso." },
  { headline: "Metodo Shadia Hasan", copy: "Fale com a equipe." },
  { headline: "Desenvolvimento pessoal", copy: "Saiba mais com a equipe." },
  { headline: "Autoconhecimento na pratica", copy: "Converse com a equipe." },
  {
    adSets: [
      { name: "Publico frio", objective: "leads" },
      { name: "Remarketing" },
      { name: "Lookalike", objective: "sales" },
    ],
  },
];

test("alinha o objetivo divergente de um ad set e relata a divergencia", () => {
  const { dados, divergencias } = alinharObjetivosAninhados(conteudoDoIncidente(), "leads");

  assert.equal(divergencias.length, 1, "so um campo divergia no incidente real");
  assert.equal(divergencias[0].campo, "4.adSets.2.objective");
  assert.equal(divergencias[0].encontrado, "sales");
  assert.equal((dados as any)[4].adSets[2].objective, "leads");
});

// O ponto do conserto: o incidente real precisa deixar de bloquear.
test("o conteudo do incidente passa no Fact Guard depois do alinhamento", () => {
  const facts = buildCampaignFacts({
    input: { objective: "leads", name: "Shadia Hasan — Leads" },
    clientProfile: {},
    segment: "",
  });

  const antes = validateCampaignFactIntegrity(conteudoDoIncidente(), facts);
  assert.equal(antes.status, "failed", "sem o alinhamento, o incidente reprova");
  assert.ok(
    antes.conflicts.some(c => c.reason === "campaign_objective_conflict"),
    "e reprova exatamente por campaign_objective_conflict",
  );

  const { dados } = alinharObjetivosAninhados(conteudoDoIncidente(), "leads");
  const depois = validateCampaignFactIntegrity(dados, facts);
  assert.ok(
    !depois.conflicts.some(c => c.reason === "campaign_objective_conflict"),
    "depois do alinhamento, nao sobra conflito de objetivo",
  );
});

test("nao toca em nada quando todos os objetivos ja batem", () => {
  const entrada = [{ adSets: [{ objective: "leads" }, { objective: "OUTCOME_LEADS" }] }];
  const { dados, divergencias } = alinharObjetivosAninhados(entrada, "leads");
  assert.equal(divergencias.length, 0, "OUTCOME_LEADS canoniza pra leads, nao e divergencia");
  assert.deepEqual(dados, entrada);
});

// Trava a fronteira do conserto: ele mexe SO em objective. Se um dia alguem
// ampliar essa funcao pra "consertar" texto, este teste quebra — e deve.
test("campos de texto passam intactos", () => {
  const entrada = [{
    headline: "Headline original",
    copy: "Copy original com preco R$ 19,90",
    description: "Description original",
    adSets: [{ objective: "sales", name: "Nome do conjunto" }],
  }];
  const { dados } = alinharObjetivosAninhados(entrada, "leads");
  const saida = (dados as any)[0];

  assert.equal(saida.headline, "Headline original");
  assert.equal(saida.copy, "Copy original com preco R$ 19,90");
  assert.equal(saida.description, "Description original");
  assert.equal(saida.adSets[0].name, "Nome do conjunto", "so o objective muda, o resto do ad set fica");
  assert.equal(saida.adSets[0].objective, "leads");
});

test("nao altera nada quando o objetivo da campanha esta vazio", () => {
  const entrada = [{ adSets: [{ objective: "sales" }] }];
  const { dados, divergencias } = alinharObjetivosAninhados(entrada, "");
  assert.equal(divergencias.length, 0);
  assert.deepEqual(dados, entrada);
});

test("nao muta a entrada original", () => {
  const entrada = [{ adSets: [{ objective: "sales" }] }];
  alinharObjetivosAninhados(entrada, "leads");
  assert.equal(entrada[0].adSets[0].objective, "sales", "a entrada precisa continuar intacta");
});

test("percorre aninhamento profundo e arrays dentro de arrays", () => {
  const entrada = { nivel1: [{ nivel2: { nivel3: [{ objective: "awareness" }] } }] };
  const { dados, divergencias } = alinharObjetivosAninhados(entrada, "leads");
  assert.equal(divergencias[0].campo, "nivel1.0.nivel2.nivel3.0.objective");
  assert.equal((dados as any).nivel1[0].nivel2.nivel3[0].objective, "leads");
});
