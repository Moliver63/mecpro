import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { faixaEtariaDoAdSet, faixaDoTexto, FAIXA_PADRAO } from "../metaTargeting";

/**
 * Achado real (24/10, campanha 804 da Shadia Hasan).
 *
 * O relatorio da Meta mostrava 46% das impressoes e R$ 0,94 de R$ 2,02
 * entregues para 65+, numa campanha cujo conjunto dizia "Faixa etaria: 25-60
 * anos". O regex de leitura procurava "idade", que nao existe em "etaria",
 * entao caia no padrao 18-65 — em TODA campanha publicada pelo produto.
 *
 * Nao reprovava nada, nao aparecia em log, e so dava as caras na conta do
 * cliente. E o teste mais barato que este repositorio tem.
 */

// Texto EXATO do conjunto da 804, lido pelo MCP.
const AUDIENCIA_804 =
  "Adultos no Brasil interessados em autoconhecimento, inteligência emocional, " +
  "desenvolvimento pessoal, padrões comportamentais. Faixa etária: 25-60 anos. " +
  "Interesses em: meditação, mindfulness, psicologia, coaching, autoajuda, " +
  "bem-estar, terapias alternativas.";

test("REGRESSAO: a audiencia real da 804 devolve 25-60, nao 18-65", () => {
  const f = faixaEtariaDoAdSet({ audience: AUDIENCIA_804 }, {});
  assert.equal(f.min, 25);
  assert.equal(f.max, 60);
  assert.equal(f.origem, "texto");
});

test("o regex antigo falhava nesse mesmo texto (prova da causa)", () => {
  const antigo = /[Ii]dade[:\s]+?(\d{2})[-–](\d{2})/;
  assert.equal(AUDIENCIA_804.match(antigo), null, "se isto casar, a causa era outra");
});

test("as formas que o modelo escreve de verdade", () => {
  const casos: Array<[string, number, number]> = [
    ["Faixa etária: 25-60 anos", 25, 60],
    ["Faixa etaria: 25-60 anos", 25, 60],
    ["Faixa etária 30 a 45", 30, 45],
    ["Idade: 25-60", 25, 60],
    ["Idades: 18–35", 18, 35],
    ["Mulheres entre 35 e 55 anos", 35, 55],
    ["Público de 25 a 44 anos, interessado em bem-estar", 25, 44],
    ["Adultos 30-50 anos no Brasil", 30, 50],
  ];
  for (const [texto, min, max] of casos) {
    assert.deepEqual(faixaDoTexto(texto), { min, max }, texto);
  }
});

test("texto sem faixa nao vira faixa inventada", () => {
  // "a partir de 25" nao diz o teto: adivinhar seria inventar segmentacao.
  assert.equal(faixaDoTexto("Adultos a partir de 25 anos"), null);
  assert.equal(faixaDoTexto("Público amplo no Brasil"), null);
  assert.equal(faixaDoTexto(""), null);
  assert.equal(faixaDoTexto(null), null);
  assert.equal(faixaDoTexto(undefined), null);
});

test("numero fora dos limites da Meta e ignorado, nao enviado", () => {
  // A API recusa o conjunto inteiro se a idade sair de 13-65. Melhor cair no
  // padrao que derrubar a publicacao.
  assert.equal(faixaDoTexto("Faixa etária: 25-99 anos"), null);
  assert.equal(faixaDoTexto("Idade: 05-60"), null);
  assert.equal(faixaDoTexto("Idade: 60-25"), null, "invertido nao vale");
});

test("a escolha explicita do usuario vence o texto do conjunto", () => {
  // Requisito: preservar a configuracao escolhida pelo usuario. O codigo
  // antigo deixava o texto vencer o input.
  const f = faixaEtariaDoAdSet({ audience: AUDIENCIA_804 }, { ageMin: 35, ageMax: 44 });
  assert.equal(f.min, 35);
  assert.equal(f.max, 44);
  assert.equal(f.origem, "input");
});

test("campo estruturado vence prosa, e perde pro input", () => {
  const adSet = { ageMin: 30, ageMax: 50, audience: AUDIENCIA_804 };
  assert.equal(faixaEtariaDoAdSet(adSet, {}).origem, "campo");
  assert.equal(faixaEtariaDoAdSet(adSet, {}).min, 30);
  assert.equal(faixaEtariaDoAdSet(adSet, { ageMin: 18, ageMax: 24 }).origem, "input");
});

test("sem nenhuma informacao, mantem o padrao de antes", () => {
  const f = faixaEtariaDoAdSet({ audience: "Público amplo" }, {});
  assert.deepEqual({ min: f.min, max: f.max }, { min: FAIXA_PADRAO.min, max: FAIXA_PADRAO.max });
  assert.equal(f.origem, "padrao");
  assert.equal(faixaEtariaDoAdSet(null, null).origem, "padrao");
});

test("input pela metade nao conta como escolha", () => {
  // So ageMin, sem ageMax, nao define faixa: cai pro texto.
  const f = faixaEtariaDoAdSet({ audience: AUDIENCIA_804 }, { ageMin: 40 } as any);
  assert.equal(f.origem, "texto");
  assert.equal(f.min, 25);
});

// ── Fonte: as duas pontas e a otimizacao de trafego ───────────────────────
const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");

test("o publish nao le mais idade com regex solto", () => {
  assert.doesNotMatch(ROTA, /\[Ii\]dade\[:\\s\]\+\?/, "use faixaEtariaDoAdSet");
  assert.match(ROTA, /faixaEtariaDoAdSet\(adSet, input\)/);
});

test("a faixa enviada fica registrada em log, com a origem", () => {
  // Sem isso, a proxima divergencia volta a ser invisivel.
  assert.match(ROTA, /faixa etaria do conjunto/);
  assert.match(ROTA, /origem: faixaEtaria\.origem/);
});

test("trafego continua em cliques por padrao", () => {
  // Trocar o padrao sem pixel travaria a entrega de todo cliente.
  assert.match(ROTA, /if \(o === "traffic"\)\s+return "LINK_CLICKS";/);
});

test("visualizacao de pagina so por escolha explicita, e exige pixel", () => {
  assert.match(ROTA, /otimizarPorVisualizacaoDePagina/);
  const inicio = ROTA.indexOf('input.trafficOptimization === "landing_page_views" && !input.pixelId');
  assert.ok(inicio > 0, "sem pixel tem que recusar antes de criar a campanha");
  // Ancora na CHAMADA, nao na definicao da funcao, que aparece antes no arquivo.
  const chamada = ROTA.indexOf("= resolveObjectiveAndGoal(");
  assert.ok(chamada > 0, "chamada de resolveObjectiveAndGoal nao encontrada");
  assert.ok(inicio < chamada, "a recusa vem antes de resolver objetivo");
});
