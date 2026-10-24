/**
 * metaTargeting.ts — faixa etaria que vai pra Meta na publicacao.
 *
 * Achado real (24/10, campanha 804 da Shadia Hasan). O relatorio mostrava 46%
 * das impressoes e R$ 0,94 de R$ 2,02 entregues para 65+, numa campanha cujo
 * briefing dizia 25-60 anos. Causa, reproduzida:
 *
 *   quem ESCREVE (router 3361):  "Faixa etaria: " + ageMin + "-" + ageMax
 *   quem LIA     (router 4750):  /[Ii]dade[:\s]+?(\d{2})[-–](\d{2})/
 *
 * "etaria" nao contem "idade". O regex nunca casava, caia no padrao, e
 * `age_min: 18, age_max: 65` ia pra Meta em TODA campanha publicada pelo
 * produto, de qualquer cliente, ignorando o que o usuario escolheu.
 *
 * E o mesmo padrao ja documentado no ESTADO ATUAL: uma metade do pipeline
 * produz X e a outra procura Y. A diferenca e que aqui ninguem reprovava
 * nada, entao passava em silencio e so aparecia na conta do cliente.
 *
 * Por que parsear texto. O `audience` do conjunto e escrito pelo MODELO, nao
 * montado por codigo: ele parafraseia o contexto de segmentacao. Entao a
 * leitura tem que aguentar as formas que o modelo usa de verdade, e a
 * prioridade tem que deixar a escolha explicita do usuario vencer o texto.
 */

export type OrigemDaFaixa = "input" | "campo" | "texto" | "padrao";

export interface FaixaEtaria {
  min: number;
  max: number;
  /** De onde veio, pra log e teste. */
  origem: OrigemDaFaixa;
}

/** Limites da Meta. Fora disso a API recusa o conjunto inteiro. */
const IDADE_MINIMA = 13;
const IDADE_MAXIMA = 65;
export const FAIXA_PADRAO: FaixaEtaria = { min: 18, max: 65, origem: "padrao" };

/**
 * Formas que o modelo escreve, em ordem de especificidade. Todas exigem dois
 * numeros: "a partir de 25 anos" nao vira faixa, porque adivinhar o teto seria
 * inventar segmentacao.
 */
const PADROES: RegExp[] = [
  // "Faixa etaria: 25-60", "Faixa etária 25 a 60", "Idade: 25-60"
  /(?:faixa\s+et[aá]ri[ao]|idade|idades)\s*[:\-–]?\s*(\d{2})\s*(?:[-–—]|a|at[eé])\s*(\d{2})/i,
  // "entre 25 e 60 anos"
  /entre\s+(\d{2})\s+e\s+(\d{2})\s*anos/i,
  // "25-60 anos" solto
  /(\d{2})\s*[-–—]\s*(\d{2})\s*anos/i,
  // "adultos de 25 a 60"
  /de\s+(\d{2})\s+(?:a|at[eé])\s+(\d{2})\s*anos?/i,
];

function valida(min: number, max: number): boolean {
  return (
    Number.isFinite(min) && Number.isFinite(max) &&
    min >= IDADE_MINIMA && max <= IDADE_MAXIMA && min < max
  );
}

/** Extrai a faixa do texto livre da audiencia. `null` quando nao da pra afirmar. */
export function faixaDoTexto(texto: unknown): { min: number; max: number } | null {
  const bruto = typeof texto === "string" ? texto : "";
  if (!bruto) return null;
  for (const padrao of PADROES) {
    const m = bruto.match(padrao);
    if (!m) continue;
    const min = parseInt(m[1], 10);
    const max = parseInt(m[2], 10);
    if (valida(min, max)) return { min, max };
    // Numero fora dos limites da Meta: ignora este padrao e tenta o proximo,
    // em vez de mandar um conjunto que a API recusa.
  }
  return null;
}

/**
 * Faixa que deve ir pra Meta, por ordem de autoridade:
 *
 *  1. `input`  — o que o usuario escolheu AGORA, no formulario de publicacao.
 *                Vence tudo: e a decisao mais recente e mais explicita.
 *  2. `campo`  — `ageMin`/`ageMax` gravados no proprio conjunto, quando
 *                existirem. Dado estruturado vale mais que prosa.
 *  3. `texto`  — parseado do `audience`. E o que recupera as campanhas que ja
 *                estao no banco, geradas antes desta correcao.
 *  4. `padrao` — 18-65, o mesmo de antes. So quando nao ha nenhuma informacao.
 *
 * O item 1 antes do 3 e deliberado: o codigo antigo deixava o texto vencer o
 * input, e isso contraria "preservar a configuracao explicitamente escolhida
 * pelo usuario". Na pratica nao muda o comportamento observado, porque o
 * parse nunca casava.
 */
export function faixaEtariaDoAdSet(
  adSet: unknown,
  input?: { ageMin?: number | null; ageMax?: number | null } | null,
): FaixaEtaria {
  const a = (adSet ?? {}) as Record<string, unknown>;

  const inMin = Number(input?.ageMin);
  const inMax = Number(input?.ageMax);
  if (valida(inMin, inMax)) return { min: inMin, max: inMax, origem: "input" };

  const campoMin = Number(a.ageMin);
  const campoMax = Number(a.ageMax);
  if (valida(campoMin, campoMax)) return { min: campoMin, max: campoMax, origem: "campo" };

  const doTexto = faixaDoTexto(a.audience);
  if (doTexto) return { ...doTexto, origem: "texto" };

  return { ...FAIXA_PADRAO };
}
