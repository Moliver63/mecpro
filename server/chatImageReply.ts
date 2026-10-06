import { AsyncLocalStorage } from "node:async_hooks";
import type { resumoDeTarefasDeImagem } from "./imageWorkflowPolicy";

/**
 * Guarda o `estado` que a ferramenta de imagens produziu NESTE turno, pra
 * trava de texto no fim poder comparar sem re-consultar o banco.
 *
 * AsyncLocalStorage, e nao variavel de modulo, porque o servidor atende
 * varios usuarios ao mesmo tempo: um objeto compartilhado vazaria o estado
 * da campanha de um usuario pro turno de outro. Mesmo padrao do `adsTurn`.
 */
export const imageTurn = new AsyncLocalStorage<{ estado?: ReturnType<typeof resumoDeTarefasDeImagem> }>();

/** Registra o estado da chamada mais recente da ferramenta neste turno. */
export function registrarEstadoDeImagens(resultado: unknown): void {
  const loja = imageTurn.getStore();
  if (!loja) return;
  const estado = (resultado as any)?.estado;
  if (estado && typeof estado === "object") loja.estado = estado;
}

// Incidente real, duas vezes (Michel, 05/10 e 06/10). Na segunda, JA COM a
// correcao de contrato no ar (deploy 05/10 13:03 local, commit c47035e
// 12:57), o chat respondeu:
//
//   "As 10 imagens da campanha Shadia Hasan — Leads (ID 797) estao pendentes
//    de validacao (status: `queued`). O processo e automatico e leva 10-15
//    minutos. Aguarde ou revise o status no link: [...]"
//
// A resposta da ferramenta trazia `estado.filaVaiAgir: false`, as linhas com
// status `pending_validation`, e `estado.destravar` com a acao concreta. O
// modelo tinha o dado estruturado na mao e afirmou o contrario.
//
// Entao a conclusao e a mesma do incidente do pageId: depender de obediencia
// nao resolve. A correcao de contrato (dar o dado) era necessaria e nao foi
// suficiente — precisa da trava deterministica em cima.
//
// Esta camada NAO re-consulta o banco: recebe o `estado` que a propria
// chamada da ferramenta daquele turno produziu. Sem round-trip extra e sem
// risco de ler um estado diferente do que o modelo viu.
//
// Principio: so intervem quando a afirmacao e FALSA contra o estado real.
// Com `filaVaiAgir: true`, mandar aguardar esta certo e o texto passa intacto.

type Estado = ReturnType<typeof resumoDeTarefasDeImagem>;

// "aguarde", "aguardando", "espere", "em andamento", "leva 10-15 minutos".
const MANDA_ESPERAR = /\baguard\w*|\bespere\b|\bem andamento\b|\bleva\s+(cerca de\s+)?\d+|\d+\s*(a|-|–|até)\s*\d+\s*minutos?\b/i;
// "nao ha acao manual", "sem acao manual", "nao e possivel acelerar".
const NEGA_ACAO = /n[ãa]o\s+h[áa]\s+(nenhuma\s+)?(a[çc][ãa]o|forma|como)|sem\s+a[çc][ãa]o\s+manual|n[ãa]o\s+(e|é|ha|há|tem)\s+(como\s+)?(poss[ií]vel\s+)?acelerar/i;
// "queued", "em fila de geracao".
const DIZ_QUEUED = /\bqueued\b|\b(em|na)\s+fila\s+de\s+gera[çc][ãa]o/i;

/**
 * Devolve o texto original, ou um texto novo quando ele contradiz o estado.
 * Puro: nenhum import de db, env ou rede, pra ser testavel isolado.
 */
export function corrigirRespostaDeImagens(texto: string, estado: Estado | null | undefined): string {
  if (!estado || !texto) return texto;

  const mandaEsperarErrado = !estado.filaVaiAgir && MANDA_ESPERAR.test(texto);
  const negaAcaoErrado = NEGA_ACAO.test(texto) && !!estado.destravar;
  // Afirmar `queued` quando nenhuma tarefa esta nesse estado. `queued` e
  // `pending_validation` significam coisas opostas: a primeira e imagem
  // nunca gerada, a segunda e imagem pronta esperando analise. Trocar uma
  // pela outra inverte o que o usuario entende da situacao.
  const dizQueuedErrado = DIZ_QUEUED.test(texto) && !(estado.porStatus || {}).queued;

  if (!mandaEsperarErrado && !negaAcaoErrado && !dizQueuedErrado) return texto;

  const partes = [estado.resumo];
  if (estado.aprovadas > 0) partes.push(`${estado.aprovadas} imagem(ns) ja aprovada(s) e salva(s) nos criativos.`);
  if (estado.destravar) partes.push(estado.destravar);
  else if (!estado.filaVaiAgir) partes.push("A fila automatica nao tem nada pendente para esta campanha. Para preparar imagens que faltam, peca para iniciar a geracao.");
  partes.push("Nenhuma campanha foi publicada.");
  return partes.join(" ");
}
