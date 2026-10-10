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

// Achado real (Michel, 10/10): o chat respondeu "A campanha Shadia Hasan —
// Leads (ID 797) NAO PODE SER GERADA porque as imagens estao pendentes de
// validacao".
//
// Essa dependencia **nao existe**. Verificado: `campaign_image_jobs` e lido
// somente por `campaignImageJobs.ts` e pelas migrations; `server/ai.ts`, que
// gera a campanha, nao tem uma unica referencia a tarefa de imagem ou a
// pending_validation. A nota da propria ferramenta diz "Tarefas persistentes,
// nao publicacao".
//
// O chat inventou um bloqueio e parou o Michel de trabalhar — a campanha podia
// ser gerada esse tempo todo. Isso e pior que resposta vaga: e um impedimento
// fabricado.
//
// Esta trava NAO depende do estado do turno, diferente da de baixo: a
// afirmacao e falsa por construcao, independente de qualquer tarefa. Por isso
// vale mesmo quando a ferramenta de imagens nao foi chamada — que foi
// exatamente o caso aqui (era um pedido de geracao), e o motivo pelo qual a
// trava existente passou batido.
const IMAGEM_BLOQUEIA_GERACAO =
  // "nao pode ser gerada / nao posso gerar / nao da para criar / nao e
  // possivel gerar" seguido, NA MESMA FRASE, de imagem ou validacao.
  //
  // A classe [^\s.] no meio evita depender de acento ("da", "e possivel"):
  // minha primeira versao listava pode|podem|consigo e deixava passar "nao
  // posso gerar", e a segunda quebrou o proprio "nao". O limite em [^.] e
  // proposital: sem ele, "As imagens estao pendentes. Posso gerar a campanha
  // agora." seria lido como bloqueio.
  /n[ãa]o\s+(?:[^\s.]+\s+){0,3}?(?:gerar|gerad[ao]s?|criar|criad[ao]s?)[^.]{0,80}?(?:imagens?|valida[çc][ãa]o)|(?:imagens?|valida[çc][ãa]o)[^.]{0,80}?(?:impede|impedem|bloqueia|bloqueiam)[^.]{0,40}?(?:gera[çc][ãa]o|gerar|criar)/i;

export function corrigirBloqueioInventadoDeImagem(texto: string): string {
  if (!texto || !IMAGEM_BLOQUEIA_GERACAO.test(texto)) return texto;
  return "Imagem pendente de validacao NAO impede gerar a campanha — os dois caminhos sao separados, e a geracao nao consulta a fila de imagens. " +
    "Posso gerar a campanha agora. As imagens entram nos criativos quando a validacao aprovar, e nada e publicado na Meta sem a sua autorizacao em separado.";
}

/**
 * Devolve o texto original, ou um texto novo quando ele contradiz o estado.
 * Puro: nenhum import de db, env ou rede, pra ser testavel isolado.
 */
export function corrigirRespostaDeImagens(texto: string, estado: Estado | null | undefined): string {
  if (!estado || !texto) return texto;

  // Ajuste de 10/10: o gatilho olhava `filaVaiAgir`, que diz se o worker volta
  // a pegar a tarefa — nao se isso tem chance de dar em algo. Com
  // `gemini_http_403` a fila tinha tentativas sobrando (revalidate zerou o
  // contador), entao `filaVaiAgir` era true e o "aguarde 10-15 minutos" passou
  // batido — num erro de permissao, que nao passa esperando. Agora o gatilho e
  // `esperarResolve`, que ja desconta causa permanente.
  const mandaEsperarErrado = estado.esperarResolve === false && MANDA_ESPERAR.test(texto);
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
