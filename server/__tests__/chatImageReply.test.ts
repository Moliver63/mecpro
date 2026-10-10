import test from "node:test";
import assert from "node:assert/strict";
import { corrigirRespostaDeImagens, corrigirBloqueioInventadoDeImagem, imageTurn, registrarEstadoDeImagens } from "../chatImageReply";
import { resumoDeTarefasDeImagem, MAX_TENTATIVAS_VALIDACAO, causaEhPermanente, causaPermanenteEmPortugues } from "../imageWorkflowPolicy";

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

// Resposta real que o chat deu em 10/10, verbatim.
const RESPOSTA_REAL_10_10 =
  "A campanha Shadia Hasan — Leads (ID 797) não pode ser gerada porque as imagens estão pendentes de validação (status: `queued`). " +
  "O erro `visual_validator_unavailable:gemini_http_403` indica que o sistema de validação automática está indisponível. " +
  "Aguarde 10-15 minutos para revalidação ou revise os previews manualmente nos links fornecidos anteriormente.";

// Essa dependencia NAO existe: campaign_image_jobs e lido somente pelo proprio
// worker e pelas migrations, e server/ai.ts (que gera a campanha) nao tem uma
// referencia a tarefa de imagem. O chat fabricou um impedimento e parou o
// Michel de trabalhar.
test("bloqueio inventado de geracao por imagem e desmentido", () => {
  const saida = corrigirBloqueioInventadoDeImagem(RESPOSTA_REAL_10_10);
  assert.notEqual(saida, RESPOSTA_REAL_10_10);
  assert.match(saida, /NAO impede gerar a campanha/);
  assert.match(saida, /Posso gerar a campanha agora/);
  assert.match(saida, /nada e publicado na Meta sem a sua autorizacao/i);

  // Outras formas da mesma afirmacao falsa.
  for (const texto of [
    "Não posso gerar a campanha porque as imagens estão pendentes de validação.",
    "A validação de imagens impede a geração da campanha neste momento.",
    "Não dá para criar a campanha enquanto as imagens não forem validadas.",
    // Estas duas me escaparam na primeira regex (so listava pode|podem|consigo)
    // e na segunda (que quebrou o proprio "nao"): acento no meio da frase.
    "Não é possível gerar a campanha: imagens em validação.",
    "nao pode ser gerada pois as imagens seguem em validacao",
  ]) {
    assert.notEqual(corrigirBloqueioInventadoDeImagem(texto), texto, `devia desmentir: ${texto}`);
  }
});

// A metade que protege: nao pode reescrever resposta que nao afirma o
// bloqueio. E a trava roda em TODO turno, sem estado — falso positivo aqui
// custaria caro.
test("texto que nao inventa bloqueio passa intacto", () => {
  for (const texto of [
    "As imagens estão pendentes de validação. Posso gerar a campanha agora se quiser.",
    "A campanha não pode ser publicada sem sua autorização.",
    "Não consigo gerar a campanha porque faltam dados no briefing: público e orçamento.",
    "Gerei a campanha. As imagens entram quando a validação aprovar.",
    "Vou gerar a campanha agora.",
    "",
  ]) {
    assert.equal(corrigirBloqueioInventadoDeImagem(texto), texto, `nao devia mexer: ${texto.slice(0, 45)}`);
  }
});

// Achado de 10/10: o gatilho de "aguarde" olhava filaVaiAgir, que diz se o
// worker volta a pegar — nao se isso tem chance de dar em algo. Com 403 e o
// contador zerado pelo revalidate, filaVaiAgir era true e o "aguarde" passou.
test("causa permanente proibe mandar aguardar, mesmo com tentativas sobrando", () => {
  const com403 = resumoDeTarefasDeImagem(
    Array.from({ length: 10 }, (_, i) => ({
      creative_index: i, status: "pending_validation", attempts: 0,
      reason: "visual_validator_unavailable:gemini_http_403",
    })));

  assert.equal(com403.filaVaiAgir, true, "a fila DE FATO volta a pegar: o contador foi zerado");
  assert.equal(com403.esperarResolve, false, "mas esperar nao resolve 403");
  assert.equal(com403.bloqueadasPorConfiguracao, 10);
  assert.match(com403.destravar, /Esperar NAO resolve/);
  assert.match(com403.destravar, /permissao/);
  assert.doesNotMatch(com403.resumo, /ainda na fila automatica/, "nao pode sugerir espera");

  // E a trava de texto agora morde.
  const saida = corrigirRespostaDeImagens(RESPOSTA_REAL_10_10, com403);
  assert.notEqual(saida, RESPOSTA_REAL_10_10);
  assert.doesNotMatch(saida, /Aguarde/i);
  assert.doesNotMatch(saida, /queued/);

  // 503 continua sendo espera legitima: a trava nao pode virar geral.
  const com503 = resumoDeTarefasDeImagem([
    { creative_index: 0, status: "pending_validation", attempts: 0, reason: "visual_validator_unavailable:gemini_http_503" },
  ]);
  assert.equal(com503.esperarResolve, true);
  assert.equal(com503.destravar, null);
  const textoEspera = "As imagens estão em validação. Aguarde alguns minutos.";
  assert.equal(corrigirRespostaDeImagens(textoEspera, com503), textoEspera, "com 503, aguardar esta certo");
});

test("classificacao de causa separa configuracao de indisponibilidade", () => {
  for (const permanente of ["sem_chave_gemini", "host_nao_permitido", "modelo_invalido", "mime_inesperado",
    "imagem_grande_demais", "corpo_vazio", "gemini_http_401", "gemini_http_403", "gemini_http_404",
    "gemini_http_400", "download_http_404", "download_http_403"]) {
    assert.equal(causaEhPermanente(`visual_validator_unavailable:${permanente}`), true, `${permanente} e permanente`);
    assert.ok(causaPermanenteEmPortugues(permanente), `${permanente} precisa de texto em portugues`);
  }
  for (const transitorio of ["gemini_http_429", "gemini_http_408", "gemini_http_500", "gemini_http_502",
    "gemini_http_503", "gemini_http_504", "download_http_500", "timeout", "excecao", "validator_invalid_response"]) {
    assert.equal(causaEhPermanente(`visual_validator_unavailable:${transitorio}`), false, `${transitorio} e transitorio`);
    assert.equal(causaPermanenteEmPortugues(transitorio), null);
  }
  // Limite de taxa passa com o tempo, ao contrario do resto dos 4xx.
  assert.equal(causaEhPermanente("gemini_http_429"), false);
  // Motivo desconhecido nao vira "permanente" por chute — pararia a fila de
  // tentar numa falha que talvez passasse.
  assert.equal(causaEhPermanente("motivo_novo_que_ninguem_viu"), false);
  assert.equal(causaEhPermanente(undefined), false);
  assert.equal(causaEhPermanente("visual_checks_passed"), false);
});
