// Regras de orcamento: de onde vem cada numero.
//
// Auditoria 23/11 (F6): o "minimo da Meta" era uma constante fixa (R$ 5,11 por
// conjunto) apresentada como regra da Meta. Ela nao e. Aqui cada aviso carrega a
// ORIGEM da regra:
//   api_meta                - valor lido da propria conta de anuncios (min_daily_budget).
//                             E o piso da conta; alguns objetivos/eventos de cobranca
//                             exigem mais, e so a Meta confirma isso na publicacao.
//   regra_interna           - invariante do MecProAI (a soma dos conjuntos nunca
//                             ultrapassa o total autorizado; o valor pedido nunca sobe sozinho).
//   recomendacao_comercial  - referencia do MecProAI para o anuncio ter volume de
//                             entrega. Nao e exigencia da Meta e vale so em reais.
// O orcamento informado pelo usuario NUNCA e alterado aqui.
export type OrigemDaRegra = "api_meta" | "regra_interna" | "recomendacao_comercial";

export type AvisoDeOrcamento = {
  codigo: "abaixo_do_minimo_da_conta" | "soma_dos_conjuntos_excede_o_total" | "abaixo_da_recomendacao_comercial" | "moeda_diferente_de_brl" | "minimo_da_conta_indisponivel";
  origem: OrigemDaRegra;
  severidade: "bloqueio" | "alerta" | "info";
  mensagem: string;
};

/** Referencia comercial por conjunto, em reais por dia. Nao e regra da Meta. */
export const RECOMENDACAO_COMERCIAL_BRL_POR_CONJUNTO_DIA = 5.11;

/** Moedas sem centavos: o valor da API ja vem na unidade principal. */
const MOEDAS_SEM_DECIMAIS = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"]);

/** `min_daily_budget` da Graph API vem em unidades menores da moeda da conta. */
export function minimoDaContaEmUnidadePrincipal(valorBruto: unknown, moeda: string | null | undefined): number | null {
  const n = Number(valorBruto);
  if (!Number.isFinite(n) || n <= 0) return null;
  const divisor = MOEDAS_SEM_DECIMAIS.has(String(moeda || "").toUpperCase()) ? 1 : 100;
  return Math.round((n / divisor) * 100) / 100;
}

export type EntradaDeOrcamento = {
  orcamentoTotal: number;
  dias: number;
  conjuntos: number;
  moedaDaConta?: string | null;
  /** Ja em unidade principal da moeda da conta (ver minimoDaContaEmUnidadePrincipal). */
  minimoDiarioDaConta?: number | null;
  /** Orcamento diario de cada conjunto, quando ja planejado. */
  orcamentosDiariosDosConjuntos?: number[];
};

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export function avaliarOrcamento(e: EntradaDeOrcamento): { diarioPedido: number; avisos: AvisoDeOrcamento[] } {
  const total = Number(e.orcamentoTotal) || 0;
  const dias = Number(e.dias) > 0 ? Number(e.dias) : 30;
  const conjuntos = Number(e.conjuntos) > 0 ? Math.floor(Number(e.conjuntos)) : 1;
  const diarioPedido = total > 0 ? total / dias : 0;
  const porConjunto = diarioPedido / conjuntos;
  const moeda = String(e.moedaDaConta || "").toUpperCase() || null;
  const avisos: AvisoDeOrcamento[] = [];

  // 1) Invariante interna: a soma dos conjuntos nao passa do total autorizado.
  if (Array.isArray(e.orcamentosDiariosDosConjuntos) && e.orcamentosDiariosDosConjuntos.length && total > 0) {
    const somaDia = e.orcamentosDiariosDosConjuntos.reduce((a, b) => a + (Number(b) || 0), 0);
    // Tolerancia so para planos em reais inteiros (o plano da publicacao arredonda cada conjunto, +-0,50).
    const inteiros = e.orcamentosDiariosDosConjuntos.every((v) => Number.isInteger(Number(v)));
    const folga = inteiros ? 0.5 * e.orcamentosDiariosDosConjuntos.length : 0.01;
    if (somaDia > diarioPedido + folga) {
      avisos.push({
        codigo: "soma_dos_conjuntos_excede_o_total", origem: "regra_interna", severidade: "bloqueio",
        mensagem: `Regra do MecProAI: a soma dos conjuntos (${brl(somaDia)}/dia, ${brl(somaDia * dias)} em ${dias} dias) passa do total autorizado (${brl(total)}). Ajuste os conjuntos ou aprove explicitamente o novo total.`,
      });
    }
  }

  // 2) Piso da conta, quando a API informou.
  if (e.minimoDiarioDaConta != null && e.minimoDiarioDaConta > 0) {
    if (porConjunto > 0 && porConjunto < e.minimoDiarioDaConta) {
      avisos.push({
        codigo: "abaixo_do_minimo_da_conta", origem: "api_meta", severidade: "alerta",
        mensagem: `A conta de anuncios informa minimo diario de ${e.minimoDiarioDaConta.toFixed(2)} ${moeda ?? ""} por conjunto e o plano pede ${diarioPedido.toFixed(2)}/dia no total (${porConjunto.toFixed(2)} por conjunto). Alguns objetivos exigem mais; a Meta confirma na publicacao. O valor pedido nao foi alterado.`.replace("  ", " "),
      });
    }
  } else {
    avisos.push({
      codigo: "minimo_da_conta_indisponivel", origem: "api_meta", severidade: "info",
      mensagem: "O minimo diario da conta nao foi consultado. A Meta confirma o piso exato, que depende do objetivo e da cobranca, na publicacao.",
    });
  }

  // 3) Recomendacao comercial, so em reais.
  if (moeda && moeda !== "BRL") {
    avisos.push({
      codigo: "moeda_diferente_de_brl", origem: "regra_interna", severidade: "info",
      mensagem: `A conta usa ${moeda}. Os valores deste plano nao foram convertidos e a referencia comercial em reais nao se aplica.`,
    });
  } else {
    const referencia = RECOMENDACAO_COMERCIAL_BRL_POR_CONJUNTO_DIA;
    if (porConjunto > 0 && porConjunto < referencia) {
      avisos.push({
        codigo: "abaixo_da_recomendacao_comercial", origem: "recomendacao_comercial", severidade: "alerta",
        mensagem: `Recomendacao do MecProAI (nao e exigencia da Meta): ${brl(referencia)}/dia por conjunto para o anuncio ter volume de entrega; o plano pede ${brl(diarioPedido)}/dia no total (${brl(porConjunto)} por conjunto, ${conjuntos} conjunto(s)). O valor pedido nao foi alterado; voce pode aumentar, reduzir conjuntos ou seguir assim.`,
      });
    }
  }
  return { diarioPedido, avisos };
}
