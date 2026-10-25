import test from "node:test";
import assert from "node:assert/strict";
import {
  analisarFaixaEtaria,
  lerFaixa,
  poissonAcumulada,
  type LinhaDeIdade,
} from "../analiseDeFaixaEtaria";

/**
 * Faixa etaria por evidencia, nao por chute (25/10).
 *
 * O teste central deste arquivo e o ultimo: com os numeros REAIS da campanha
 * 804, a analise tem que dizer que NAO ha base para cortar a faixa abaixo de
 * 45 anos. O corte foi feito na mao, apresentado como comprovado pelos dados, e
 * nao era: 6 cliques com zero resultado tem uns 12% de chance de ser azar.
 *
 * Se alguem relaxar o limite de significancia para "melhorar" a analise, esse
 * teste cai, e e exatamente o que ele existe para impedir. Analise que sempre
 * tem opiniao nao serve para decidir nada.
 */

function linha(faixa: string, cliques: number, resultados: number, gasto: number, impressoes = 0): LinhaDeIdade {
  return { faixa, cliquesNoLink: cliques, resultados, gasto, impressoes: impressoes || cliques * 30 };
}

// ── Leitura da faixa ─────────────────────────────────────────────────────
test("le intervalo e faixa aberta", () => {
  assert.deepEqual(lerFaixa("18-24"), { min: 18, max: 24 });
  assert.deepEqual(lerFaixa("65+"), { min: 65, max: null });
  assert.deepEqual(lerFaixa(" 55-64 "), { min: 55, max: 64 });
  assert.equal(lerFaixa("adulto"), null);
  assert.equal(lerFaixa(""), null);
});

// ── Poisson ──────────────────────────────────────────────────────────────
test("poisson acumulada bate com valores conhecidos", () => {
  // P(X=0 | 3) = e^-3. E a razao de esperadoMinimo ser 3: abaixo disso nem um
  // zero absoluto passa de 5%.
  assert.ok(Math.abs(poissonAcumulada(0, 3) - Math.exp(-3)) < 1e-9);
  assert.ok(poissonAcumulada(0, 3) > 0.049 && poissonAcumulada(0, 3) < 0.05);
  // P(X<=lambda) fica perto de 0,5 para lambda grande.
  assert.ok(Math.abs(poissonAcumulada(50, 50) - 0.5) < 0.1);
  assert.equal(poissonAcumulada(5, 0), 1);
  // Nao estoura com lambda grande (fatorial direto estouraria).
  assert.ok(poissonAcumulada(10, 500) >= 0 && poissonAcumulada(10, 500) < 1e-100);
});

// ── Sem base ─────────────────────────────────────────────────────────────
test("volume pequeno nao recebe veredito", () => {
  const r = analisarFaixaEtaria([linha("18-24", 2, 0, 0.2), linha("25-34", 3, 1, 0.3)]);
  assert.equal(r.temBase, false);
  assert.equal(r.recomendacao, null);
  assert.ok(r.faixas.every((f) => f.veredicto === "sem_amostra"));
  assert.match(r.resumo, /Sem base estat/);
});

test("zero resultado em tudo aponta medicao, nao publico", () => {
  // O caso do site da Shadia: sem META_PIXEL_ID o Purchase nao chega e toda
  // faixa aparece zerada. Condenar o publico aqui seria erro grave.
  const r = analisarFaixaEtaria([
    linha("25-34", 200, 0, 20),
    linha("35-44", 200, 0, 20),
    linha("45-54", 200, 0, 20),
  ]);
  assert.equal(r.temBase, false);
  assert.equal(r.recomendacao, null);
  assert.ok(r.avisos.some((a) => /falha de medi/i.test(a)), "precisa avisar que e medicao");
});

test("lista vazia nao lanca", () => {
  const r = analisarFaixaEtaria([]);
  assert.equal(r.temBase, false);
  assert.equal(r.recomendacao, null);
  assert.deepEqual(r.faixas, []);
});

test("faixa com formato estranho e ignorada com aviso", () => {
  const r = analisarFaixaEtaria([linha("desconhecido", 50, 10, 5), linha("25-34", 50, 10, 5)]);
  assert.equal(r.faixas.length, 1);
  assert.ok(r.avisos.some((a) => /não reconhecido/.test(a)));
});

test("linhas de generos diferentes somam na mesma faixa", () => {
  // A Meta devolve uma linha por idade E genero.
  const r = analisarFaixaEtaria([linha("25-34", 30, 5, 3), linha("25-34", 20, 5, 2)]);
  assert.equal(r.faixas.length, 1);
  assert.equal(r.faixas[0].cliquesNoLink, 50);
  assert.equal(r.faixas[0].resultados, 10);
  assert.equal(r.faixas[0].gasto, 5);
});

// ── Com base ─────────────────────────────────────────────────────────────
test("faixa ruim com volume de verdade e reprovada e aparada", () => {
  const r = analisarFaixaEtaria([
    linha("18-24", 100, 0, 10),
    linha("25-34", 100, 40, 10),
    linha("35-44", 100, 40, 10),
  ]);
  assert.equal(r.temBase, true);
  assert.equal(r.faixas[0].veredicto, "fraca");
  assert.equal(r.faixas[1].veredicto, "boa");
  assert.deepEqual(r.recomendacao, { min: 25, max: 44 });
  assert.ok(r.faixas[0].probabilidade !== null && r.faixas[0].probabilidade < 0.05);
});

test("faixa fraca no meio vira aviso, nao corte", () => {
  // A Meta aceita UM intervalo continuo; excluir o meio por idade nao existe.
  const r = analisarFaixaEtaria([
    linha("18-24", 100, 40, 10),
    linha("25-34", 100, 0, 10),
    linha("35-44", 100, 40, 10),
  ]);
  assert.equal(r.faixas[1].veredicto, "fraca");
  assert.deepEqual(r.recomendacao, { min: 18, max: 44 });
  assert.ok(r.avisos.some((a) => /meio do intervalo/.test(a)));
});

test("65+ virou 65 na recomendacao, que na Meta e 65 ou mais", () => {
  const r = analisarFaixaEtaria([
    linha("18-24", 100, 0, 10),
    linha("55-64", 100, 40, 10),
    linha("65+", 100, 40, 10),
  ]);
  assert.deepEqual(r.recomendacao, { min: 55, max: 65 });
});

test("nenhuma ponta fraca mantem a faixa e avisa que nao ha corte", () => {
  const r = analisarFaixaEtaria([
    linha("25-34", 100, 30, 10),
    linha("35-44", 100, 35, 10),
  ]);
  assert.deepEqual(r.recomendacao, { min: 25, max: 44 });
  assert.ok(r.avisos.some((a) => /mantém a faixa atual/.test(a)));
});

test("todas as julgaveis fracas aponta oferta, nao idade", () => {
  // Impossivel em teoria pela taxa agregada, mas o galho tem que existir.
  const r = analisarFaixaEtaria([linha("25-34", 100, 20, 10)], { esperadoMinimo: 1, alfa: 0.99 });
  if (r.recomendacao === null) {
    assert.ok(r.avisos.some((a) => /oferta, criativo ou página/.test(a)));
  }
});

test("faixa sem resultado nao recebe custo por resultado inventado", () => {
  const r = analisarFaixaEtaria([linha("18-24", 100, 0, 10), linha("25-34", 100, 40, 10)]);
  assert.equal(r.faixas[0].custoPorResultado, null, "dividir por zero nao informa nada");
  assert.equal(r.faixas[1].custoPorResultado, 0.25);
});

test("o limite de significancia e declarado no motivo", () => {
  // Quem le a recomendacao tem que poder discordar do limite.
  const r = analisarFaixaEtaria([linha("18-24", 100, 0, 10), linha("25-34", 100, 40, 10)]);
  assert.match(r.faixas[0].motivo, /5%/);
  assert.match(r.faixas[1].motivo, /esperadas/);
});

// ── O caso real, que e o motivo deste arquivo existir ────────────────────
test("804 real: NAO ha base para cortar abaixo de 45 anos", () => {
  // Numeros da campanha 804 no momento em que a faixa foi alterada na mao.
  const r = analisarFaixaEtaria([
    linha("18-24", 0, 0, 0.05, 24),
    linha("25-34", 3, 0, 0.17, 88),
    linha("35-44", 3, 0, 0.41, 157),
    linha("45-54", 6, 3, 0.93, 281),
    linha("55-64", 13, 7, 1.85, 589),
    linha("65+", 32, 8, 3.18, 916),
  ]);

  assert.equal(r.totalDeCliques, 57);
  assert.equal(r.totalDeResultados, 18);

  const abaixoDe45 = r.faixas.filter((f) => f.min < 45);
  for (const f of abaixoDe45) {
    assert.notEqual(
      f.veredicto, "fraca",
      `${f.faixa} foi reprovada com ${f.cliquesNoLink} cliques; foi exatamente o erro da analise manual`,
    );
    assert.equal(f.veredicto, "sem_amostra");
  }

  // O corte feito na mao levou a 45-65. A analise honesta nao chega nisso.
  assert.notDeepEqual(
    r.recomendacao, { min: 45, max: 65 },
    "com 57 cliques o dado nao sustenta 45-65; manter isso seria industrializar o erro",
  );
  assert.deepEqual(r.recomendacao, { min: 18, max: 65 }, "nenhuma ponta tem volume para ser aparada");
});

test("804 real: 65+ clica muito e converte pouco, e ainda assim nao e reprovada", () => {
  // O CTR de 65+ era o melhor do conjunto e o aproveitamento o pior. Julgar por
  // resultado em vez de CTR e o ponto; reprovar por 8 contra 10 esperadas, nao.
  const r = analisarFaixaEtaria([
    linha("45-54", 6, 3, 0.93, 281),
    linha("55-64", 13, 7, 1.85, 589),
    linha("65+", 32, 8, 3.18, 916),
  ]);
  const senior = r.faixas.find((f) => f.faixa === "65+")!;
  assert.equal(senior.veredicto, "boa");
  assert.ok(senior.resultados < senior.esperado, "ficou abaixo da media");
  assert.ok(senior.probabilidade! > 0.05, "mas dentro do que o azar explica");
});
