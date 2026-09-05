/**
 * offerPlanning.ts — planejamento de argumentos de copy, compartilhado por
 * todos os motores do MecProAI (IA, econômico, templates, fallback).
 *
 * Fase 1 desta frente: só a ficha da oferta + o planejador de sequência de
 * argumentos. NÃO religa ainda os 4 caminhos de geração — isso é a Fase 2
 * (ver docs/MEC_PRO_AI_CURRENT_STATE.md). Este módulo é puro e testável por
 * si só: dado um segmento e o que está de fato confirmado nos fatos da
 * campanha, devolve uma sequência de papéis de argumento.
 *
 * Reaproveita a taxonomia de segmentos já existente (shared/segmentConfig.ts)
 * em vez de criar uma segunda categorização — "não crie outro conjunto
 * independente de regras" é o princípio que já guiou as correções anteriores.
 */

/**
 * Papel que um argumento (card/creative) pode cumprir dentro da sequência
 * de uma oferta. Cada papel é uma FUNÇÃO retórica, não um texto pronto — o
 * gerador de copy de cada motor decide as palavras; o plano só decide QUAL
 * argumento entra e em que ordem.
 */
export type ArgumentRole =
  | "produto_ou_espaco"        // o que é a oferta (sempre disponível)
  | "necessidade"               // dor/necessidade do público (sempre disponível)
  | "localizacao"                // onde — requer endereço/cidade confirmados
  | "estrutura_ou_ingredientes"  // características físicas/composição confirmadas
  | "diferencial_comprovado"     // diferencial — requer característica confirmada
  | "beneficio_comprovado"       // efeito/benefício — requer benefício confirmado pelo cliente
  | "prova_social"               // depoimentos/resultados — requer prova social confirmada
  | "condicoes"                  // preço/condições — requer preço confirmado
  | "experiencia"                // uso/experiência (sempre disponível, mas não factual específico)
  | "cta_step";                  // chamada final (sempre disponível)

/**
 * O que precisa estar confirmado nos fatos da campanha para um papel poder
 * entrar na sequência. `null` = sem requisito, o papel sempre pode entrar.
 */
export const ARGUMENT_REQUIREMENTS: Record<ArgumentRole, keyof OfferArgumentAvailability | null> = {
  produto_ou_espaco: null,
  necessidade: null,
  experiencia: null,
  cta_step: null,
  localizacao: "hasLocation",
  estrutura_ou_ingredientes: "hasConfirmedCharacteristics",
  diferencial_comprovado: "hasConfirmedCharacteristics",
  beneficio_comprovado: "hasConfirmedBenefit",
  prova_social: "hasSocialProof",
  condicoes: "hasPriceOrConditions",
};

/**
 * Sequência de argumentos "ideal" por categoria de oferta, na ordem em que
 * fariam sentido para o público — mas planCopyArguments() abaixo é quem
 * decide, na prática, quais entram, filtrando pelos fatos confirmados.
 *
 * As chaves são as MESMAS de shared/segmentConfig.ts (SEGMENT_CONFIG) — não
 * inventamos uma segunda taxonomia de nicho.
 */
export const ARGUMENT_SEQUENCES: Record<string, ArgumentRole[]> = {
  // Sala comercial / imóvel: Espaço → localização → estrutura → visita
  imoveis_venda:    ["produto_ou_espaco", "localizacao", "estrutura_ou_ingredientes", "condicoes", "cta_step"],
  imoveis_locacao:  ["produto_ou_espaco", "localizacao", "estrutura_ou_ingredientes", "condicoes", "cta_step"],
  // Cosmético: Produto → benefícios comprovados → uso → compra
  saude_estetica:   ["produto_ou_espaco", "beneficio_comprovado", "experiencia", "condicoes", "cta_step"],
  // Serviço profissional: Necessidade → serviço oferecido → diferenciais comprovados → contato
  servicos_locais:  ["necessidade", "produto_ou_espaco", "diferencial_comprovado", "cta_step"],
  // Restaurante: Prato → ingredientes → experiência → pedido
  alimentacao:      ["produto_ou_espaco", "estrutura_ou_ingredientes", "experiencia", "cta_step"],
  ecommerce:        ["produto_ou_espaco", "beneficio_comprovado", "condicoes", "cta_step"],
  infoprodutos:     ["necessidade", "produto_ou_espaco", "prova_social", "cta_step"],
  moda_varejo:      ["produto_ou_espaco", "experiencia", "condicoes", "cta_step"],
  b2b:              ["necessidade", "produto_ou_espaco", "diferencial_comprovado", "cta_step"],
  outro:            ["produto_ou_espaco", "beneficio_comprovado", "condicoes", "cta_step"],
};

export interface OfferArgumentAvailability {
  hasLocation: boolean;
  hasConfirmedCharacteristics: boolean;
  hasConfirmedBenefit: boolean;
  hasSocialProof: boolean;
  hasPriceOrConditions: boolean;
}

/**
 * Decide a sequência de argumentos para uma oferta: parte da sequência
 * "ideal" do segmento e remove qualquer papel cujo requisito não está
 * confirmado nos fatos da campanha — em vez de inventar o dado que falta.
 * Exemplo: sem depoimentos/resultados confirmados, "prova_social" sai da
 * lista e o gerador escolhe outro argumento, em vez de forçar um
 * depoimento genérico.
 *
 * Garante um mínimo utilizável: produto_ou_espaco e cta_step nunca são
 * removidos (não dependem de nenhuma alegação, são estruturais); se a
 * filtragem deixar só esses dois, "experiencia" entra como argumento do
 * meio (também sem requisito) para a sequência não ficar rasa demais.
 */
export function planCopyArguments(
  segment: string,
  availability: OfferArgumentAvailability,
): ArgumentRole[] {
  const baseSequence = ARGUMENT_SEQUENCES[segment] || ARGUMENT_SEQUENCES.outro;

  const filtered = baseSequence.filter((role) => {
    const requirement = ARGUMENT_REQUIREMENTS[role];
    if (requirement === null) return true;
    return !!availability[requirement];
  });

  const hasStructuralOnly = filtered.every((role) => role === "produto_ou_espaco" || role === "cta_step");
  if (hasStructuralOnly && !filtered.includes("experiencia")) {
    const ctaIndex = filtered.indexOf("cta_step");
    const withExperience = [...filtered];
    withExperience.splice(ctaIndex === -1 ? withExperience.length : ctaIndex, 0, "experiencia");
    return withExperience;
  }

  return filtered;
}

/**
 * Monta o objeto de disponibilidade a partir dos fatos já extraídos pelo
 * Fact Guard (server/campaignFactGuard.ts) — mantém a ficha da oferta como
 * fonte única, sem duplicar a lógica de extração aqui.
 */
export function buildArgumentAvailability(facts: {
  confirmedCharacteristics: string[];
  confirmedClaimsRaw: string;
  socialProofRaw: string;
  genericProductPrice?: string;
  realEstate: { address?: string; price?: string };
}): OfferArgumentAvailability {
  return {
    hasLocation: !!facts.realEstate.address,
    hasConfirmedCharacteristics: facts.confirmedCharacteristics.length > 0,
    // Um benefício só conta como confirmado se o próprio texto do cliente
    // contém linguagem de efeito (não basta ter características) — ver
    // detectUnconfirmedBenefitClaims em server/campaignFactGuard.ts, que
    // usa o mesmo confirmedClaimsRaw para decidir se um benefício citado
    // na copy tem lastro. Aqui, na fase de planejamento, usamos um sinal
    // mais simples: existe alguma alegação de benefício no que o próprio
    // cliente escreveu?
    hasConfirmedBenefit: /benefici|resultado|efeito|melhora|aumenta|reduz|economiz/i.test(facts.confirmedClaimsRaw),
    hasSocialProof: facts.socialProofRaw.length > 0,
    hasPriceOrConditions: !!(facts.realEstate.price || facts.genericProductPrice),
  };
}
