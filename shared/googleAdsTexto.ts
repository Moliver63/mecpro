/**
 * Textos do anuncio responsivo de pesquisa (RSA) do Google.
 * Limites: titulo ate 30 caracteres, descricao ate 90.
 *
 * Defeito de origem: a copy do Meta era cortada com .slice(0, 30). Um titulo de
 * 33 caracteres como "Aula VR Autoconhecimento R$19,90" saia como "...R$19,9":
 * preco errado e palavra pela metade. Aqui o texto so e aceito inteiro ou
 * encurtado em fronteira de palavra; se nao couber com sentido, e descartado.
 */

export const GOOGLE_TITULO_MAX = 30;
export const GOOGLE_DESCRICAO_MAX = 90;

/** Remove emoji, quebras de linha, travessao e espacos repetidos. */
export function limparTextoGoogle(texto: string): string {
  return String(texto ?? "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[—–]/g, ",")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

/**
 * Devolve o texto inteiro se couber. Se nao couber, tenta encurtar no ultimo
 * limite de palavra (descricao longa tolera isso), mas nunca corta um numero
 * ou preco: se o trecho cortado perderia um "R$", digito ou "%", devolve null.
 * minPalavras evita sobrar um fragmento sem sentido.
 */
export function ajustarTextoGoogle(texto: string, max: number, minPalavras = 2): string | null {
  const limpo = limparTextoGoogle(texto);
  if (!limpo) return null;
  if (limpo.length <= max) return limpo;

  const resto = (limpo.slice(0, max + 1));
  const corte = resto.lastIndexOf(" ");
  if (corte <= 0) return null;
  const encurtado = resto.slice(0, corte).replace(/[,\s]+$/g, "");
  const descartado = limpo.slice(corte);
  if (/R\$|\d|%/.test(descartado)) return null; // perderia preco, prazo ou numero
  if (encurtado.split(" ").length < minPalavras) return null;
  // Termina em conectivo solto ("de", "para"...) fica sem sentido
  if (/\b(de|da|do|para|com|em|na|no|e|a|o|um|uma|por)$/i.test(encurtado)) return null;
  return encurtado;
}

/** Lista de textos prontos: ajustados, sem repeticao (ignora caixa), ate maxItens. */
export function prepararTextosGoogle(textos: Array<string | null | undefined>, max: number, maxItens: number): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of textos) {
    const t = ajustarTextoGoogle(bruto ?? "", max, max <= GOOGLE_TITULO_MAX ? 1 : 3);
    if (!t || t.length < 2) continue;
    const chave = t.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
    if (saida.length >= maxItens) break;
  }
  return saida;
}

/** Quebra uma copy longa em frases, para cada uma virar candidata a descricao. */
export function dividirEmFrases(texto: string): string[] {
  return String(texto ?? "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((f) => limparTextoGoogle(f))
    .filter((f) => f.length >= 8);
}
