import test from "node:test";
import assert from "node:assert/strict";
import { corrigirRespostaDeImagens, imageTurn, registrarEstadoDeImagens } from "../chatImageReply";
import { resumoDeTarefasDeImagem, MAX_TENTATIVAS_VALIDACAO } from "../imageWorkflowPolicy";

const dezParadas = resumoDeTarefasDeImagem(
  Array.from({ length: 10 }, (_, i) => ({
    creative_index: i, status: "pending_validation",
    attempts: MAX_TENTATIVAS_VALIDACAO, reason: "visual_validator_unavailable",
  })));

// Texto exato que o chat devolveu em 06/10, ja com o campo `estado` no ar.
const RESPOSTA_REAL_06_10 =
  "As 10 imagens da campanha Shadia Hasan — Leads (ID 797) estão pendentes de validação (status: `queued`). " +
  "O processo é automático e leva 10-15 minutos. Aguarde ou revise o status no link: " +
  "[Visualizar imagens](https://res.cloudinary.com/dpmnxbbbx/image/upload/v1791048982/mecpro/x.jpg).";

// Texto exato de 05/10.
const RESPOSTA_REAL_05_10 =
  "As imagens da campanha Shadia Hasan — Leads (ID 797) estão em fila de geração (status: `queued`). " +
  "O processo está em andamento, mas não há ação manual disponível para acelerar. " +
  "Aguarde 10-15 minutos para a validação automática.";

test("a resposta real de 06/10 e substituida, nao mantida", () => {
  const saida = corrigirRespostaDeImagens(RESPOSTA_REAL_06_10, dezParadas);
  assert.notEqual(saida, RESPOSTA_REAL_06_10);
  assert.doesNotMatch(saida, /queued/, "nenhuma tarefa esta em queued");
  assert.doesNotMatch(saida, /aguard/i, "mandar aguardar e justamente o erro");
  assert.doesNotMatch(saida, /10-15 minutos/);
  assert.match(saida, /revalidate/, "tem que entregar a acao que destrava");
  assert.match(saida, /pending_validation/, "o estado real precisa aparecer");
});

test("a resposta real de 05/10 tambem e substituida", () => {
  const saida = corrigirRespostaDeImagens(RESPOSTA_REAL_05_10, dezParadas);
  assert.notEqual(saida, RESPOSTA_REAL_05_10);
  assert.doesNotMatch(saida, /n[ãa]o h[áa] a[çc][ãa]o/i);
  assert.doesNotMatch(saida, /fila de gera[çc][ãa]o/i);
  assert.match(saida, /revalidate/);
});

// A metade que protege: quando a fila VAI agir, mandar aguardar esta correto.
// Uma trava que reescreve texto certo e pior que a ausencia dela.
test("texto correto passa intacto quando a fila ainda vai agir", () => {
  const naFila = resumoDeTarefasDeImagem([
    { creative_index: 0, status: "pending_validation", attempts: MAX_TENTATIVAS_VALIDACAO - 1 },
    { creative_index: 1, status: "queued", attempts: 0 },
  ]);
  const texto = "As imagens estão na fila de geração. Aguarde alguns minutos e eu confirmo o progresso.";
  assert.equal(corrigirRespostaDeImagens(texto, naFila), texto, "aqui aguardar e a resposta certa");
});

test("sem estado (ferramenta nao chamada no turno) nao mexe no texto", () => {
  const texto = "Aguarde 10-15 minutos.";
  assert.equal(corrigirRespostaDeImagens(texto, null), texto);
  assert.equal(corrigirRespostaDeImagens(texto, undefined), texto);
  assert.equal(corrigirRespostaDeImagens("", dezParadas), "");
});

test("resposta sobre outro assunto nao e reescrita", () => {
  const texto = "O orçamento sugerido é R$ 30/dia por conjunto, dividido entre público frio e morno.";
  assert.equal(corrigirRespostaDeImagens(texto, dezParadas), texto, "nao afirma nada falso sobre imagens");
});

test("aprovadas aparecem no texto corrigido, sem sumir no resumo", () => {
  const misto = resumoDeTarefasDeImagem([
    { creative_index: 0, status: "approved", attempts: 1 },
    { creative_index: 1, status: "pending_validation", attempts: MAX_TENTATIVAS_VALIDACAO },
  ]);
  const saida = corrigirRespostaDeImagens("Aguarde, está tudo em andamento.", misto);
  assert.match(saida, /1 imagem\(ns\) ja aprovada/);
  assert.match(saida, /revalidate/);
});

// `queued` e `pending_validation` significam coisas OPOSTAS: a primeira e
// imagem nunca gerada, a segunda e imagem pronta esperando analise. Trocar
// uma pela outra inverte o que o usuario entende, mesmo sem mandar aguardar.
test("afirmar queued sem nenhuma queued e corrigido mesmo sem mandar aguardar", () => {
  const saida = corrigirRespostaDeImagens("As 10 imagens estão com status queued.", dezParadas);
  assert.doesNotMatch(saida, /queued/);
  assert.match(saida, /pending_validation/);
});

test("nunca inventa publicacao e nunca omite que nada foi publicado", () => {
  const saida = corrigirRespostaDeImagens(RESPOSTA_REAL_06_10, dezParadas);
  assert.match(saida, /Nenhuma campanha foi publicada/);
});

// O elo que pode falhar silenciosamente: o estado tem que atravessar da
// chamada da ferramenta (fundo do laco) ate a montagem da resposta.
test("o estado atravessa o turno, e turnos distintos nao se contaminam", async () => {
  await imageTurn.run({}, async () => {
    registrarEstadoDeImagens({ ok: true, estado: dezParadas });
    const saida = corrigirRespostaDeImagens(RESPOSTA_REAL_06_10, imageTurn.getStore()?.estado);
    assert.match(saida, /revalidate/, "o estado precisa chegar ate aqui");
  });

  // Turno sem chamada da ferramenta: nada registrado, texto intacto.
  await imageTurn.run({}, async () => {
    assert.equal(imageTurn.getStore()?.estado, undefined, "nao herda o estado do turno anterior");
    assert.equal(corrigirRespostaDeImagens(RESPOSTA_REAL_06_10, imageTurn.getStore()?.estado), RESPOSTA_REAL_06_10);
  });

  // Fora de qualquer turno nao explode.
  assert.doesNotThrow(() => registrarEstadoDeImagens({ estado: dezParadas }));

  // Resultado de erro da ferramenta nao tem `estado`: nada e registrado.
  await imageTurn.run({}, async () => {
    registrarEstadoDeImagens({ ok: false, erro: "Campanha indisponivel para esta conta." });
    assert.equal(imageTurn.getStore()?.estado, undefined);
  });

  // Dois usuarios em paralelo: o estado de um nao pode vazar pro turno do
  // outro. E por isso que isso e AsyncLocalStorage e nao variavel de modulo.
  const vazios = resumoDeTarefasDeImagem([]);
  const [a, b] = await Promise.all([
    imageTurn.run({}, async () => {
      registrarEstadoDeImagens({ estado: dezParadas });
      await new Promise(r => setTimeout(r, 10));
      return imageTurn.getStore()?.estado;
    }),
    imageTurn.run({}, async () => {
      registrarEstadoDeImagens({ estado: vazios });
      await new Promise(r => setTimeout(r, 5));
      return imageTurn.getStore()?.estado;
    }),
  ]);
  assert.equal(a?.total, 10);
  assert.equal(b?.total, 0, "o turno do segundo usuario nao recebeu as 10 tarefas do primeiro");
});
