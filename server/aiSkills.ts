/**
 * aiSkills.ts — habilidades como instrucao especializada, nao como codigo.
 *
 * O que e uma habilidade aqui: um arquivo markdown com um processo escrito,
 * que entra como `systemInstruction` na chamada do modelo. Nada mais. Ela nao
 * da acesso a nada, nao chama API, nao publica. Quem publica e ferramenta.
 *
 * Por que markdown e nao codigo: o conteudo de uma habilidade e redacao, e
 * redacao se revisa lendo. Um arquivo que o Michel abre e corrige sozinho vale
 * mais que uma string espalhada em tres branches de provedor.
 *
 * SEM AMARRA DE FORNECEDOR. A composicao devolve texto puro, e todo o fan-out
 * de `gemini()` (Gemini, DeepSeek, Groq, Genspark, Claude, OpenRouter) recebe
 * `systemInstruction` do mesmo jeito. Trocar de modelo nao mexe aqui.
 *
 * O que uma habilidade NAO deve conter: fato de cliente. Publico, oferta,
 * preco e restricao vem do perfil do cliente, que o produto ja guarda. Habilidade
 * e o processo; o perfil e o dado. Misturar os dois gera habilidade que so
 * serve pra um cliente.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export interface Habilidade {
  /** Identificador, igual ao nome do arquivo sem extensao. */
  nome: string;
  /** Uma linha: quando usar. */
  descricao: string;
  /** O corpo do markdown, sem o frontmatter. */
  instrucoes: string;
}

const PASTA_PADRAO = join(import.meta.dirname, "skills");

/** Frontmatter minimo: `name` e `description`. Sem eles, o arquivo e ignorado. */
export function lerHabilidade(texto: string, nomeDoArquivo: string): Habilidade | null {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  const [, frente, corpo] = m;

  const campo = (chave: string): string => {
    const linha = frente.match(new RegExp(`^${chave}\\s*:\\s*(.+)$`, "m"));
    return linha ? linha[1].trim().replace(/^["']|["']$/g, "") : "";
  };

  const nome = campo("name") || nomeDoArquivo;
  const descricao = campo("description");
  const instrucoes = corpo.trim();
  if (!descricao || !instrucoes) return null;
  return { nome, descricao, instrucoes };
}

let cache: Habilidade[] | null = null;

/** Habilidades disponiveis, lidas do disco uma vez por processo. */
export function habilidadesDisponiveis(pasta: string = PASTA_PADRAO): Habilidade[] {
  if (cache && pasta === PASTA_PADRAO) return cache;
  const lista: Habilidade[] = [];
  try {
    if (!existsSync(pasta)) return [];
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith(".md")).sort()) {
      const h = lerHabilidade(readFileSync(join(pasta, arquivo), "utf8"), arquivo.replace(/\.md$/, ""));
      // Arquivo malformado e pulado em silencio de proposito: uma habilidade
      // quebrada nao pode derrubar a geracao de campanha.
      if (h) lista.push(h);
    }
  } catch {
    return [];
  }
  if (pasta === PASTA_PADRAO) cache = lista;
  return lista;
}

/**
 * Monta o `systemInstruction` com as habilidades pedidas.
 *
 * Nome desconhecido e ignorado, nao lanca: habilidade e melhoria de qualidade,
 * nunca pre-requisito. Se o arquivo sumir, a geracao continua como antes.
 */
export function comporInstrucao(
  base: string,
  nomes: readonly string[],
  pasta: string = PASTA_PADRAO,
): string {
  const todas = habilidadesDisponiveis(pasta);
  const escolhidas = nomes
    .map((n) => todas.find((h) => h.nome === n))
    .filter((h): h is Habilidade => !!h);
  if (!escolhidas.length) return base;

  const blocos = escolhidas.map((h) => `## ${h.nome}\n\n${h.instrucoes}`);
  return [
    base.trim(),
    "",
    "# Processo a seguir",
    "",
    "As secoes abaixo descrevem COMO fazer este trabalho. Elas nao trazem fato",
    "de cliente: publico, oferta, preco e restricoes vem do briefing e do perfil.",
    "Nao invente dado que nao esteja neles.",
    "",
    ...blocos,
  ].join("\n");
}

/** So pra teste: esquece o que foi lido do disco. */
export function limparCacheDeHabilidades(): void {
  cache = null;
}
