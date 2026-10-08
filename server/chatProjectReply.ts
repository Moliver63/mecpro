import { AsyncLocalStorage } from "node:async_hooks";

// Incidente real (Michel, 08/10). Ele pediu "GERE UMA CAMPANHA DO NOTTING
// HILL DA EMBRAED" e recebeu:
//
//   "A campanha 'Notting Hill da Embraed' nao foi encontrada entre os
//    projetos existentes. Os projetos disponiveis incluem opcoes de imoveis,
//    como 'Morebem Imoveis — Sala Comercial Rua 902' e outros. Deseja usar um
//    desses projetos ou criar um novo do zero?"
//
// "incluem ... e outros" nao da pra escolher. O modelo tinha a lista
// completa na mao: `queryChatWorkspace` devolve `projects: [{id, name, url}]`
// junto com a instrucao "Apresente os nomes reais retornados, nunca peca
// IDs". Recebeu e resumiu vagamente.
//
// Terceira vez do mesmo padrao nesta sessao — depois do pageId (30/09) e do
// estado das imagens (05-06/10). Nos tres, a instrucao existia e nao foi
// seguida, e nos tres a conclusao foi a mesma: instrucao no prompt nao e
// garantia, e o que chega ao usuario precisa de trava deterministica.
//
// Mesmo desenho do chatImageReply: o estado vem da chamada de ferramenta
// DAQUELE turno, por AsyncLocalStorage, sem re-consultar o banco e sem risco
// de vazar a lista de um usuario pro turno de outro.

export type ProjetoListado = { id?: number; name?: string };

export const projectTurn = new AsyncLocalStorage<{ projetos?: ProjetoListado[]; temMais?: boolean }>();

/** Registra a lista de projetos que a ferramenta devolveu neste turno. */
export function registrarProjetosListados(resultado: unknown): void {
  const loja = projectTurn.getStore();
  if (!loja) return;
  const projetos = (resultado as any)?.projects;
  if (!Array.isArray(projetos)) return;
  loja.projetos = projetos.filter((p: any) => p && typeof p.name === "string" && p.name.trim());
  loja.temMais = (resultado as any)?.nextOffset != null;
}

// Marcadores de vagueza observados. O gatilho e estreito de proposito: so
// morde quando o texto REALMENTE escamoteia a lista. Uma resposta que cita
// dois projetos porque o usuario perguntou daqueles dois passa intacta.
const VAGO = /\be outros?\b|\bentre outros\b|\bdentre outros\b|\be mais alguns\b|\balguns (dos )?projetos\b|\betc\.?(\s|$)/i;
const FALA_DE_PROJETO = /projetos?\b/i;

const LIMITE_EXIBIDO = 10;

/**
 * Devolve o texto original, ou um texto novo quando ele escamoteia a lista
 * de projetos que a ferramenta entregou neste turno.
 *
 * Com um projeto so nao ha o que escamotear, e com nenhum a resposta certa e
 * criar o primeiro — nos dois casos nao intervem.
 */
export function corrigirRespostaDeProjetos(texto: string, loja?: { projetos?: ProjetoListado[]; temMais?: boolean } | null): string {
  const projetos = (loja?.projetos || []).filter(p => typeof p.name === "string" && p.name.trim());
  if (!texto || projetos.length < 2) return texto;
  if (!VAGO.test(texto) || !FALA_DE_PROJETO.test(texto)) return texto;

  // Quebra de linha num nome quebraria a lista; o nome vem do banco, e
  // dado do usuario, nao formato garantido.
  const nomes = projetos.map(p => String(p.name).replace(/[\r\n]+/g, " ").trim());
  const exibidos = nomes.slice(0, LIMITE_EXIBIDO);
  const restantes = nomes.length - exibidos.length;

  const linhas = [
    `Estes sao os projetos da sua conta${restantes > 0 ? ` (os ${exibidos.length} primeiros de ${nomes.length})` : ""}:`,
    ...exibidos.map(nome => `- ${nome}`),
  ];
  // "e mais 4" e honesto porque diz quantos faltam; "e outros" nao dizia
  // nem isso. Se a propria ferramenta paginou, o usuario precisa saber.
  if (restantes > 0) linhas.push(`E mais ${restantes}${loja?.temMais ? " nesta pagina, com outras a seguir" : ""}. Posso listar o resto se precisar.`);
  linhas.push("Qual deles deseja usar, ou prefere criar um projeto novo do zero?");
  return linhas.join("\n");
}
