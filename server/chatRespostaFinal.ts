/**
 * Texto que acompanha pedido de ferramenta e PREAMBULO, nao resposta.
 *
 * Achado real (logs de 05/10, 14/10 e 15/10, campanhas 797/798/799). Os tres
 * lacos de provedor em chat.ts tinham, identico, este padrao:
 *
 *   const resposta = await chamarProvedor(historico);
 *   if (resposta.text) textoFinal = resposta.text;   // <- antes de saber
 *   const chamada = <tool call da resposta>;
 *   if (!chamada) break;
 *
 * Quando o modelo emite TEXTO E CHAMADA DE FERRAMENTA na mesma resposta, esse
 * texto e preambulo: foi escrito antes de o resultado da ferramenta existir. E
 * ele ja estava gravado em `textoFinal`. Se nenhum passo seguinte produzisse
 * texto — porque o laco esgotou os 4 passos ainda pedindo ferramenta, ou porque
 * a resposta final veio vazia — esse preambulo era devolvido ao usuario como
 * se fosse a conclusao.
 *
 * E a mecanica das respostas inventadas desta saga, e explica o que nenhuma
 * hipotese minha anterior explicava: por que a mensagem veio IDENTICA, byte a
 * byte, em 14/10 e 15/10. Nao era cache nem desobediencia do modelo. Era o
 * mesmo preambulo, gerado do mesmo estado pre-dado, promovido duas vezes a
 * resposta final:
 *
 *   "As 15 imagens da campanha Shadia Hasan — Leads (798) foram rejeitadas por
 *    nao mostrar VR (diferencial central do briefing). (...) Deseja enviar
 *    fotos ou ajustar o briefing?"
 *
 * Afirmacao fechada mais pergunta no fim: forma classica de preambulo. E a
 * causa que ele afirmava era o INVERSO do que o portao gravou — o validador
 * disse que a imagem MOSTRA VR e o briefing nao confirma VR. Nao tinha como
 * acertar: foi escrito antes de os dados chegarem.
 *
 * Isso reenquadra as correcoes anteriores. `corrigirRespostaDeImagens` e
 * `corrigirBloqueioInventadoDeImagem` (os guardas deterministicos de 10/10)
 * tratavam o sintoma frase por frase. Aqui esta o mecanismo.
 *
 * A regra: so vira resposta o texto de um passo que NAO pediu ferramenta.
 */
export function respostaFinalDoPasso(texto: unknown, pediuFerramenta: boolean): string | null {
  if (pediuFerramenta) return null;
  const limpo = typeof texto === "string" ? texto : "";
  return limpo.trim() ? limpo : null;
}

/**
 * Resposta quando o laco termina sem passo terminal.
 *
 * Acontece quando os 4 passos acabam com o modelo ainda pedindo ferramenta, ou
 * quando a resposta terminal vem vazia. Antes, nesse caso, saia o preambulo.
 *
 * Preferir falha visivel a preambulo: um "nao consegui" manda o usuario tentar
 * de novo e custa uma mensagem; um preambulo afirmando causa errada mandou o
 * Michel mexer no briefing e mandar fotos que nao resolveriam nada, por dois
 * dias. Nao afirma nada sobre dado nem sobre estado de campanha, porque neste
 * ponto do laco uma ferramenta de escrita pode ter rodado.
 */
export const RESPOSTA_SEM_CONCLUSAO =
  "Não consegui fechar a resposta desta vez. Reenvie a mensagem que eu retomo daqui.";
