/**
 * analiseDeFaixaEtaria.ts — recomendar faixa etária a partir de dado, não de chute.
 *
 * O problema: a idade de uma campanha nova vem de quem chama ou, quando ninguém
 * passa, de um texto que o modelo inventou ("Faixa etária: 25-60 anos"). Nenhum
 * dos dois olha resultado nenhum. A campanha 804 nasceu com 25-60 escolhido no
 * chute e, depois de 2 mil impressões, as faixas que entregavam eram outras.
 *
 * O erro que este módulo existe para NÃO cometer: na análise manual da 804, a
 * faixa abaixo de 45 anos teve 6 cliques no link e zero visualizações de página,
 * e isso foi apresentado como prova de que o público era ruim. Não era prova.
 * Com aproveitamento agregado de 35%, 6 cliques renderiam cerca de 2
 * visualizações, e observar zero quando se espera 2 tem probabilidade de uns 12%
 * só por azar. Uma em oito. Quem corta faixa com essa evidência corta público
 * bom com frequência.
 *
 * Daí as três regras:
 *
 *   1. Julgar pelo resultado mais próximo do objetivo, não pelo CTR. Na 804 o
 *      CTR engana de verdade: 65+ tem o melhor CTR do conjunto e o pior
 *      aproveitamento depois do clique, enquanto 55-64 clica menos e abre mais
 *      página. Otimizar por CTR escolhe errado.
 *
 *   2. Só reprovar faixa quando a falta de resultado for improvável por azar,
 *      com o teste explícito e o limite declarado no relatório. Volume que nunca
 *      permitiria conversão não condena ninguém.
 *
 *   3. Dizer "sem base" quando não há base. Com orçamento de poucos reais por
 *      dia isso vai ser a resposta na maioria das vezes, e uma análise que
 *      sempre tem opinião não serve para decidir nada.
 *
 * Módulo puro de propósito: recebe linhas, devolve veredito. Quem busca o dado
 * na Meta é o chamador.
 */

export interface LinhaDeIdade {
  /** Como a Meta devolve: "18-24", "25-34", "65+". */
  faixa: string;
  impressoes: number;
  cliquesNoLink: number;
  /** O resultado julgado. Para tráfego, visualização da página de destino. */
  resultados: number;
  gasto: number;
}

export type Veredicto = "boa" | "fraca" | "sem_amostra";

export interface FaixaAnalisada {
  faixa: string;
  min: number;
  /** null em "65+", que na Meta significa 65 ou mais. */
  max: number | null;
  impressoes: number;
  cliquesNoLink: number;
  resultados: number;
  gasto: number;
  /** null quando a faixa não produziu resultado: dividir por zero não informa. */
  custoPorResultado: number | null;
  /** Resultados que a faixa produziria na taxa agregada, dado o volume dela. */
  esperado: number;
  /** Probabilidade de ter saído isto ou menos por azar, na taxa agregada. */
  probabilidade: number | null;
  veredicto: Veredicto;
  motivo: string;
}

export interface OpcoesDaAnalise {
  /** Limite de significância. Padrão 0,05. */
  alfa?: number;
  /**
   * Resultados esperados mínimos para a faixa ser julgável. Padrão 3, que não é
   * número redondo escolhido a dedo: com alfa 0,05, e^-3 = 0,0498, então abaixo
   * de 3 esperados nem um zero absoluto alcança significância. Julgar com menos
   * é teatro de rigor.
   */
  esperadoMinimo?: number;
  /** Nome da métrica julgada, só para o texto do relatório. */
  nomeDoResultado?: string;
}

export interface AnaliseDeFaixaEtaria {
  /** Alguma faixa recebeu veredito de verdade? Se falso, não decida por aqui. */
  temBase: boolean;
  /** Faixa sugerida para a Meta, ou null quando não há base para sugerir. */
  recomendacao: { min: number; max: number } | null;
  faixas: FaixaAnalisada[];
  /** Taxa agregada de resultado por clique, base de toda comparação. */
  taxaAgregada: number;
  totalDeCliques: number;
  totalDeResultados: number;
  resumo: string;
  avisos: string[];
}

/** "18-24" -> {min:18,max:24}; "65+" -> {min:65,max:null}. */
export function lerFaixa(texto: string): { min: number; max: number | null } | null {
  const limpo = String(texto || "").trim();
  const intervalo = limpo.match(/^(\d{2})\s*[-–—]\s*(\d{2})$/);
  if (intervalo) return { min: Number(intervalo[1]), max: Number(intervalo[2]) };
  const aberta = limpo.match(/^(\d{2})\s*\+$/);
  if (aberta) return { min: Number(aberta[1]), max: null };
  return null;
}

/**
 * P(X <= k) para Poisson(lambda). Soma em escala logarítmica porque lambda
 * grande estoura o fatorial antes de estourar o resultado.
 */
export function poissonAcumulada(k: number, lambda: number): number {
  if (lambda <= 0) return k >= 0 ? 1 : 0;
  if (k < 0) return 0;
  let logTermo = -lambda; // i = 0
  let soma = Math.exp(logTermo);
  for (let i = 1; i <= k; i++) {
    logTermo += Math.log(lambda) - Math.log(i);
    soma += Math.exp(logTermo);
  }
  return Math.min(1, soma);
}

export function analisarFaixaEtaria(
  linhas: readonly LinhaDeIdade[],
  opcoes: OpcoesDaAnalise = {},
): AnaliseDeFaixaEtaria {
  const alfa = opcoes.alfa ?? 0.05;
  const esperadoMinimo = opcoes.esperadoMinimo ?? 3;
  const nome = opcoes.nomeDoResultado ?? "visualização da página";
  const avisos: string[] = [];

  // Agrupa por faixa: a Meta devolve uma linha por idade E gênero.
  const porFaixa = new Map<string, LinhaDeIdade>();
  for (const linha of linhas || []) {
    const chave = String(linha?.faixa || "").trim();
    if (!lerFaixa(chave)) {
      if (chave) avisos.push(`Faixa "${chave}" ignorada: formato não reconhecido.`);
      continue;
    }
    const atual = porFaixa.get(chave);
    if (atual) {
      atual.impressoes += linha.impressoes || 0;
      atual.cliquesNoLink += linha.cliquesNoLink || 0;
      atual.resultados += linha.resultados || 0;
      atual.gasto += linha.gasto || 0;
    } else {
      porFaixa.set(chave, {
        faixa: chave,
        impressoes: linha.impressoes || 0,
        cliquesNoLink: linha.cliquesNoLink || 0,
        resultados: linha.resultados || 0,
        gasto: linha.gasto || 0,
      });
    }
  }

  const ordenadas = Array.from(porFaixa.values()).sort(
    (a, b) => (lerFaixa(a.faixa)!.min) - (lerFaixa(b.faixa)!.min),
  );

  const totalDeCliques = ordenadas.reduce((s, l) => s + l.cliquesNoLink, 0);
  const totalDeResultados = ordenadas.reduce((s, l) => s + l.resultados, 0);
  const taxaAgregada = totalDeCliques > 0 ? totalDeResultados / totalDeCliques : 0;

  const faixas: FaixaAnalisada[] = ordenadas.map((l) => {
    const { min, max } = lerFaixa(l.faixa)!;
    const esperado = l.cliquesNoLink * taxaAgregada;
    const julgavel = esperado >= esperadoMinimo;
    const probabilidade = julgavel ? poissonAcumulada(l.resultados, esperado) : null;

    let veredicto: Veredicto;
    let motivo: string;
    if (!julgavel) {
      veredicto = "sem_amostra";
      motivo = totalDeResultados === 0
        ? `sem nenhum resultado no período inteiro, não há taxa para comparar`
        : `volume insuficiente: ${l.cliquesNoLink} cliques renderiam ${esperado.toFixed(1)} ${nome}(s) na média, e abaixo de ${esperadoMinimo} nem um zero absoluto seria significativo`;
    } else if (probabilidade !== null && probabilidade < alfa && l.resultados < esperado) {
      veredicto = "fraca";
      motivo = `${l.resultados} ${nome}(s) contra ${esperado.toFixed(1)} esperadas; chance de ser azar ${(probabilidade * 100).toFixed(1)}%, abaixo do limite de ${(alfa * 100).toFixed(0)}%`;
    } else {
      veredicto = "boa";
      motivo = `${l.resultados} ${nome}(s) contra ${esperado.toFixed(1)} esperadas, dentro do que a média explica`;
    }

    return {
      faixa: l.faixa, min, max,
      impressoes: l.impressoes,
      cliquesNoLink: l.cliquesNoLink,
      resultados: l.resultados,
      gasto: Number(l.gasto.toFixed(2)),
      custoPorResultado: l.resultados > 0 ? Number((l.gasto / l.resultados).toFixed(2)) : null,
      esperado: Number(esperado.toFixed(2)),
      probabilidade: probabilidade === null ? null : Number(probabilidade.toFixed(4)),
      veredicto, motivo,
    };
  });

  const temBase = faixas.some((f) => f.veredicto !== "sem_amostra");

  if (totalDeResultados === 0 && totalDeCliques > 0) {
    avisos.push(
      `Nenhuma ${nome} registrada no período, em ${totalDeCliques} cliques. ` +
      `Isso costuma ser falha de medição, não público ruim: sem o evento chegando, toda faixa aparece zerada e nenhuma pode ser comparada.`,
    );
  }

  // A Meta segmenta idade por UM intervalo contínuo, então só dá para aparar as
  // pontas. Faixa fraca no meio não é representável e vira aviso, não corte.
  let recomendacao: { min: number; max: number } | null = null;
  if (temBase) {
    let inicio = 0;
    let fim = faixas.length - 1;
    while (inicio <= fim && faixas[inicio].veredicto === "fraca") inicio++;
    while (fim >= inicio && faixas[fim].veredicto === "fraca") fim--;

    if (inicio <= fim) {
      const fracasNoMeio = faixas.slice(inicio, fim + 1).filter((f) => f.veredicto === "fraca");
      for (const f of fracasNoMeio) {
        avisos.push(
          `A faixa ${f.faixa} ficou fraca mas está no meio do intervalo e não pode ser excluída por idade: ` +
          `a Meta aceita um intervalo contínuo. Se incomodar, separe em outro conjunto.`,
        );
      }
      recomendacao = { min: faixas[inicio].min, max: faixas[fim].max ?? 65 };
      const semCorte = inicio === 0 && fim === faixas.length - 1;
      if (semCorte) {
        avisos.push(`Nenhuma ponta do intervalo se mostrou fraca, então a recomendação mantém a faixa atual.`);
      }
    } else {
      avisos.push(`Todas as faixas julgáveis saíram fracas. Isso aponta para problema de oferta, criativo ou página, não de idade.`);
    }
  }

  const julgadas = faixas.filter((f) => f.veredicto !== "sem_amostra").length;
  const resumo = !temBase
    ? `Sem base estatística: nenhuma das ${faixas.length} faixas acumulou volume para ser julgada (precisa de ${esperadoMinimo} ${nome}(s) esperadas por faixa). Não decida idade por estes números.`
    : `${julgadas} de ${faixas.length} faixas julgáveis, sobre ${totalDeCliques} cliques e ${totalDeResultados} ${nome}(s), taxa agregada de ${(taxaAgregada * 100).toFixed(1)}%.` +
      (recomendacao ? ` Faixa sugerida: ${recomendacao.min} a ${recomendacao.max === 65 ? "65+" : recomendacao.max}.` : ` Sem faixa sugerida.`);

  return { temBase, recomendacao, faixas, taxaAgregada, totalDeCliques, totalDeResultados, resumo, avisos };
}
