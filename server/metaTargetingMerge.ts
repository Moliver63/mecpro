/**
 * metaTargetingMerge.ts — editar targeting de ad set sem apagar o resto.
 *
 * O problema que este módulo existe para resolver: a Meta SUBSTITUI o objeto
 * `targeting` inteiro no POST do ad set. Ela não faz merge. Então todo campo
 * que não for copiado para o payload é apagado de verdade na campanha ativa:
 * interesses (`flexible_spec`), públicos salvos, gênero, idioma, exclusões,
 * comportamentos.
 *
 * O `updateAdSetPlacements` montava o targeting do zero a cada edição. Isso já
 * custou duas regressões silenciosas em campanha de cliente rodando:
 *
 *   1. a faixa etária voltava para 18-65 em qualquer edição de posicionamento;
 *   2. a localização voltava para "Brasil inteiro".
 *
 * As duas foram corrigidas caso a caso, tratando idade e geo na mão. Os
 * interesses seriam a terceira, pelo mesmo motivo. A correção caso a caso não
 * escala, porque a lista de campos de targeting da Meta cresce e o próximo
 * campo novo entra já quebrado.
 *
 * A inversão aqui: em vez de listar o que preservar, parte-se do targeting real
 * e sobrescreve-se SÓ o que a edição pediu. Campo novo da Meta passa a ser
 * preservado por padrão, sem ninguém precisar lembrar dele.
 *
 * Por que cópia integral e não uma lista de campos permitidos: uma lista
 * permitida erra em silêncio (o campo fora da lista é descartado sem aviso),
 * enquanto a cópia integral, no pior caso, faz a Meta recusar o POST inteiro
 * com erro explícito — e aí nada é perdido, porque a chamada falha por completo.
 * Falha alta é melhor que perda muda.
 */

export interface MapaDePlacement {
  [idInterno: string]: { pub: string; pos: string };
}

export interface EdicaoDeTargeting {
  /** Targeting que a Meta devolveu para este ad set. Base de tudo. */
  atual: Record<string, any>;
  /** Faixa já resolvida pelo chamador (input > atual > padrão). */
  ageMin: number;
  ageMax: number;
  /** geo_locations já resolvido pelo chamador. */
  geoLocations: any;
  /**
   * Só preenchidos quando a edição realmente mexe em posicionamento.
   * `undefined` nos dois significa "não toque nos posicionamentos" — é o que
   * faz uma edição de idade parar de jogar a campanha para Advantage+.
   */
  placementMode?: "auto" | "manual";
  placements?: string[];
  mapaDePlacement?: MapaDePlacement;
}

/**
 * Campos que descrevem posicionamento. Precisam ser limpos juntos: deixar
 * `facebook_positions` para trás depois de trocar `publisher_platforms` gera
 * combinação inválida e a Meta recusa com erro pouco óbvio.
 */
export const CAMPOS_DE_PLACEMENT = [
  "publisher_platforms",
  "facebook_positions",
  "instagram_positions",
  "audience_network_positions",
  "messenger_positions",
  "threads_positions",
] as const;

/** Houve intenção explícita de mexer em posicionamento? */
export function temIntencaoDePlacement(edicao: {
  placementMode?: "auto" | "manual";
  placements?: string[];
}): boolean {
  return edicao.placementMode !== undefined || (edicao.placements?.length || 0) > 0;
}

/**
 * Monta o objeto `targeting` do POST preservando o que não foi pedido.
 *
 * Não decide nada sobre idade e geo: recebe os dois já resolvidos, porque
 * resolver geo exige rede (busca de chave de cidade) e este módulo é puro de
 * propósito, para poder ser testado sem tocar na Meta.
 */
export function mesclarTargeting(edicao: EdicaoDeTargeting): Record<string, any> {
  const base: Record<string, any> = { ...(edicao.atual || {}) };

  base.age_min = edicao.ageMin;
  base.age_max = edicao.ageMax;
  base.geo_locations = edicao.geoLocations;

  // `age_range` é um campo legado que a Meta às vezes devolve junto e que
  // conflita com age_min/age_max no POST. Idade nova manda; o legado sai.
  delete base.age_range;

  // device_platforms é obrigatório em alguns fluxos (erro #1885366), mas só
  // preenche quando a Meta não trouxe o valor real do ad set.
  if (!base.device_platforms) base.device_platforms = ["mobile", "desktop"];

  if (!temIntencaoDePlacement(edicao)) return base;

  const placements = edicao.placements ?? [];
  const modo = edicao.placementMode ?? (placements.length > 0 ? "manual" : "auto");

  for (const campo of CAMPOS_DE_PLACEMENT) delete base[campo];

  if (modo === "manual" && placements.length > 0) {
    const mapa = edicao.mapaDePlacement || {};
    const publishers = new Set<string>();
    const fbPos: string[] = [];
    const igPos: string[] = [];
    const audPos: string[] = [];

    for (const id of placements) {
      const item = mapa[id];
      if (!item) continue;
      publishers.add(item.pub);
      if (item.pub === "facebook") fbPos.push(item.pos);
      if (item.pub === "instagram") igPos.push(item.pos);
      if (item.pub === "audience_network") audPos.push(item.pos);
    }

    // Nenhum id reconhecido: não dá para publicar publisher_platforms vazio,
    // a Meta recusa. Melhor cair em Advantage+ do que mandar lista vazia.
    if (publishers.size > 0) {
      base.publisher_platforms = Array.from(publishers);
      if (fbPos.length > 0) base.facebook_positions = fbPos;
      if (igPos.length > 0) base.instagram_positions = igPos;
      if (audPos.length > 0) base.audience_network_positions = audPos;
    }
  }
  // modo "auto": sem publisher_platforms, a Meta liga Advantage+ Placements.

  return base;
}
