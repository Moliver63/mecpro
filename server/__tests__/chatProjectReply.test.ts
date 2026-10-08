import test from "node:test";
import assert from "node:assert/strict";
import { corrigirRespostaDeProjetos, projectTurn, registrarProjetosListados } from "../chatProjectReply";

const doze = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Projeto ${i + 1}` }));
const dois = [
  { id: 1, name: "Morebem Imóveis — Sala Comercial Rua 902" },
  { id: 2, name: "Embraed Notting Hill" },
];

// Resposta real que o chat deu ao Michel em 08/10, verbatim.
const RESPOSTA_REAL =
  "A campanha \"Notting Hill da Embraed\" não foi encontrada entre os projetos existentes. " +
  "Os projetos disponíveis incluem opções de imóveis, como \"Morebem Imóveis — Sala Comercial Rua 902\" e outros. " +
  "Deseja usar um desses projetos ou criar um novo do zero?";

test("a resposta real de 08/10 passa a listar os nomes", () => {
  const saida = corrigirRespostaDeProjetos(RESPOSTA_REAL, { projetos: dois });
  assert.notEqual(saida, RESPOSTA_REAL);
  assert.doesNotMatch(saida, /e outros/i, "'e outros' e justamente o que impede escolher");
  for (const p of dois) assert.ok(saida.includes(p.name), `${p.name} tem que aparecer`);
  assert.match(saida, /criar um projeto novo/i, "a opcao de criar do zero nao pode desaparecer");
});

// A metade que protege: gatilho estreito. Resposta que cita projetos sem
// escamotear a lista passa intacta — uma trava que reescreve texto correto
// e pior que a ausencia dela.
test("resposta que nao escamoteia a lista passa intacta", () => {
  for (const texto of [
    "Os projetos da sua conta são: Morebem Imóveis — Sala Comercial Rua 902 e Embraed Notting Hill. Qual deseja usar?",
    "Vou usar o projeto Embraed Notting Hill, como você pediu.",
    "O orçamento sugerido é R$ 30/dia por conjunto.",
    "",
  ]) {
    assert.equal(corrigirRespostaDeProjetos(texto, { projetos: dois }), texto, `nao devia mexer em: ${texto.slice(0, 40)}`);
  }
});

test("sem lista, com lista vazia ou com um projeto so, nao intervem", () => {
  assert.equal(corrigirRespostaDeProjetos(RESPOSTA_REAL, null), RESPOSTA_REAL);
  assert.equal(corrigirRespostaDeProjetos(RESPOSTA_REAL, undefined), RESPOSTA_REAL);
  assert.equal(corrigirRespostaDeProjetos(RESPOSTA_REAL, { projetos: [] }), RESPOSTA_REAL);
  // Com um projeto so nao ha lista pra escamotear.
  assert.equal(corrigirRespostaDeProjetos(RESPOSTA_REAL, { projetos: [dois[0]] }), RESPOSTA_REAL);
  // Nome vazio ou nao-string nao conta como projeto.
  assert.equal(corrigirRespostaDeProjetos(RESPOSTA_REAL, { projetos: [{ name: "  " }, { name: 7 as any }] }), RESPOSTA_REAL);
});

// "E mais 2" e honesto porque diz QUANTOS faltam. "e outros" nao dizia nem
// isso — era exatamente a informacao que o usuario precisava.
test("lista longa e truncada com contagem, nao com vaguidade", () => {
  const saida = corrigirRespostaDeProjetos(RESPOSTA_REAL, { projetos: doze });
  assert.ok(saida.includes("Projeto 1") && saida.includes("Projeto 10"));
  assert.ok(!saida.includes("Projeto 11"), "o limite de exibicao vale");
  assert.match(saida, /os 10 primeiros de 12/);
  assert.match(saida, /E mais 2/);
  assert.doesNotMatch(saida, /\be outros\b/i);
});

test("paginacao da ferramenta e avisada, nao escondida", () => {
  const saida = corrigirRespostaDeProjetos(RESPOSTA_REAL, { projetos: doze, temMais: true });
  assert.match(saida, /com outras a seguir/);
});

// Nome de projeto e dado do usuario: pode ter quebra de linha e quebraria a
// lista em bullets.
test("quebra de linha no nome nao quebra a lista", () => {
  const saida = corrigirRespostaDeProjetos(RESPOSTA_REAL, {
    projetos: [{ id: 1, name: "Linha um\nLinha dois" }, { id: 2, name: "Outro" }],
  });
  const bullets = saida.split("\n").filter(l => l.startsWith("- "));
  assert.equal(bullets.length, 2, "dois projetos, dois itens — nao tres");
  assert.ok(bullets[0].includes("Linha um Linha dois"));
});

// O elo que pode falhar calado: a lista tem que atravessar da chamada da
// ferramenta ate a montagem da resposta.
test("a lista atravessa o turno, e turnos distintos nao se contaminam", async () => {
  await projectTurn.run({}, async () => {
    registrarProjetosListados({ projects: dois, nextOffset: null });
    const saida = corrigirRespostaDeProjetos(RESPOSTA_REAL, projectTurn.getStore());
    assert.ok(saida.includes("Embraed Notting Hill"));
  });

  await projectTurn.run({}, async () => {
    assert.equal(projectTurn.getStore()?.projetos, undefined, "nao herda do turno anterior");
    assert.equal(corrigirRespostaDeProjetos(RESPOSTA_REAL, projectTurn.getStore()), RESPOSTA_REAL);
  });

  // Resultado sem `projects` (erro, ou consulta de campanha) nao registra.
  await projectTurn.run({}, async () => {
    registrarProjetosListados({ erro: "Projeto nao encontrado na sua conta." });
    assert.equal(projectTurn.getStore()?.projetos, undefined);
  });

  // Fora de qualquer turno nao explode.
  assert.doesNotThrow(() => registrarProjetosListados({ projects: dois }));

  // Dois usuarios em paralelo: a lista de um nao pode vazar pro turno do
  // outro. E por isso que isso e AsyncLocalStorage e nao variavel de modulo.
  const [a, b] = await Promise.all([
    projectTurn.run({}, async () => {
      registrarProjetosListados({ projects: doze });
      await new Promise(r => setTimeout(r, 10));
      return projectTurn.getStore()?.projetos?.length;
    }),
    projectTurn.run({}, async () => {
      registrarProjetosListados({ projects: dois });
      await new Promise(r => setTimeout(r, 5));
      return projectTurn.getStore()?.projetos?.length;
    }),
  ]);
  assert.equal(a, 12);
  assert.equal(b, 2, "o segundo turno nao recebeu os 12 do primeiro");
});
