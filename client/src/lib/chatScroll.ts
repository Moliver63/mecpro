/**
 * Quem decide se o chat pode rolar sozinho.
 *
 * Pedido do Michel (15/10): "a seta para rolar melhor e ver as mensagens".
 *
 * O que havia em `useCampaignChat`: `el.scrollTop = el.scrollHeight` num efeito
 * disparado por `[messages, loading]`. O chat era arrastado pro fim a cada
 * mensagem nova E a cada mudanca de `loading`, mesmo com a pessoa lendo algo
 * mais acima. Reler uma resposta enquanto outra chegava era impossivel.
 *
 * A regra agora: so rola sozinho quem ESTAVA acompanhando o fim. Esta aqui,
 * fora do hook, porque e a unica conta que decide todo o comportamento e vale
 * ter teste proprio em vez de depender de DOM.
 */

/**
 * Folga em pixels para considerar que a pessoa ainda esta "no fim".
 *
 * Nao e zero de proposito: rolagem com inercia, zoom do navegador e altura
 * fracionaria de linha deixam sobras de alguns pixels, e com tolerancia zero
 * uma pessoa parada no fim seria tratada como quem subiu.
 */
export const DISTANCIA_DO_FIM = 120;

export interface MedidaDeRolagem {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function estaAcompanhandoOFim(m: MedidaDeRolagem, folga = DISTANCIA_DO_FIM): boolean {
  const distancia = m.scrollHeight - m.scrollTop - m.clientHeight;
  // `distancia` negativa acontece com overscroll elastico (iOS): continua sendo
  // o fim, nao o contrario.
  return distancia <= folga;
}
