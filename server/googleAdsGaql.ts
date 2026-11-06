/**
 * googleAdsGaql.ts — consulta GAQL livre, SOMENTE LEITURA.
 * GAQL so tem SELECT; ainda assim a entrada vem de fora, entao: uma unica
 * instrucao SELECT, sem ponto e virgula, tamanho limitado e LIMIT sempre presente.
 */
export const GAQL_MAX_CHARS = 2000;
export const GAQL_LIMITE_PADRAO = 50;
export const GAQL_LIMITE_MAX = 200;

export function prepararGaql(entrada: string): { query: string } | { erro: string } {
  const q = String(entrada ?? "").trim().replace(/\s+/g, " ");
  if (!q) return { erro: "Consulta vazia." };
  if (q.length > GAQL_MAX_CHARS) return { erro: `Consulta acima de ${GAQL_MAX_CHARS} caracteres.` };
  if (q.includes(";")) return { erro: "Ponto e virgula nao e permitido: envie uma unica consulta." };
  if (!/^select\s/i.test(q)) return { erro: "A consulta deve comecar com SELECT." };
  if (!/\sfrom\s+[a-z_]+/i.test(q)) return { erro: "A consulta precisa de FROM <recurso>." };
  const m = /\slimit\s+(\d+)\s*$/i.exec(q);
  if (m) {
    const n = Number(m[1]);
    if (n > GAQL_LIMITE_MAX) return { query: q.replace(/\slimit\s+\d+\s*$/i, ` LIMIT ${GAQL_LIMITE_MAX}`) };
    return { query: q };
  }
  if (/\slimit\s/i.test(q)) return { erro: "LIMIT deve ser o ultimo termo da consulta." };
  return { query: `${q} LIMIT ${GAQL_LIMITE_PADRAO}` };
}

/** Corta a resposta para nao estourar o contexto de quem chama. */
export function limitarResposta(linhas: unknown[], maxChars = 60000): { linhas: unknown[]; cortada: boolean } {
  let total = 0; const out: unknown[] = [];
  for (const l of linhas) {
    const t = JSON.stringify(l).length;
    if (total + t > maxChars) return { linhas: out, cortada: true };
    total += t; out.push(l);
  }
  return { linhas: out, cortada: false };
}
