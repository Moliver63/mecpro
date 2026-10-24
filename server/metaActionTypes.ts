/**
 * metaActionTypes.ts — como ler compra e valor de compra do `actions` da Meta.
 *
 * Achado real (24/10, campanha 804 da Shadia Hasan). O relatório mostrava
 * 0 compras, e a causa principal estava no site do cliente: nenhum evento
 * `Purchase` era enviado. Mas havia uma segunda causa aqui: este projeto lia
 * a compra procurando `action_type === "purchase"`, e esse nao e o tipo que a
 * Meta devolve para compra de site.
 *
 * Pela documentacao, compra de site chega como
 * `offsite_conversion.fb_pixel_purchase` (so site, incluindo evento vindo da
 * Conversions API) ou `omni_purchase` (soma varios locais de conversao: app,
 * loja fisica, mensagens). Um `purchase` simples nao esta documentado.
 *
 * Consequencia pratica se ninguem corrigisse: o cliente faria todo o trabalho
 * de rastreamento no site, a Meta passaria a registrar as compras, e o painel
 * do MecProAI continuaria mostrando zero.
 *
 * Por que uma lista em ordem de preferencia, e nao um nome so: a propria
 * documentacao recomenda conferir os tipos que a conta devolve antes de fixar
 * o nome. Entao aqui se procura o mais especifico primeiro e cai pro mais
 * amplo, e `purchase` fica no fim por compatibilidade com o que ja estava
 * gravado. Nao e lista de vocabulario que envelhece: sao os nomes da API.
 */

/** Em ordem de preferencia: site primeiro, soma de canais depois. */
export const TIPOS_DE_COMPRA = [
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "purchase",
] as const;

type LinhaDeAcao = { action_type?: string; value?: unknown };

/**
 * Primeiro valor encontrado na ordem de preferencia dos tipos.
 *
 * Nao soma os tipos: `omni_purchase` JA INCLUI a compra de site, entao somar
 * contaria a mesma venda duas vezes. Pega um, o mais especifico disponivel.
 */
export function valorDaAcao(
  linhas: unknown,
  tipos: readonly string[] = TIPOS_DE_COMPRA,
): number {
  const lista: LinhaDeAcao[] = Array.isArray(linhas) ? linhas : [];
  for (const tipo of tipos) {
    const achada = lista.find((a) => a?.action_type === tipo);
    if (achada === undefined) continue;
    const numero = Number(achada.value);
    if (Number.isFinite(numero)) return numero;
  }
  return 0;
}

/** Quantidade de compras. */
export function comprasDaLinha(insights: any): number {
  return valorDaAcao(insights?.actions);
}

/** Valor somado das compras, do `action_values`, no MESMO tipo usado na contagem. */
export function valorDasComprasDaLinha(insights: any): number {
  const lista: LinhaDeAcao[] = Array.isArray(insights?.actions) ? insights.actions : [];
  // Mantem contagem e valor no mesmo escopo: contar site e somar omni daria
  // ticket medio errado.
  const tipoUsado = TIPOS_DE_COMPRA.find((t) => lista.some((a) => a?.action_type === t));
  return valorDaAcao(insights?.action_values, tipoUsado ? [tipoUsado] : TIPOS_DE_COMPRA);
}
