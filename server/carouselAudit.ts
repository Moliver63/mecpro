import { getCarouselEditorialIssues } from "../shared/campaignCopyQuality";

/**
 * carouselAudit.ts — extraído de server/mcpServer.ts em 13/09 (publicação
 * via chat). Achado real: importar estas 3 funções DE mcpServer.ts (mesmo
 * só usando named exports) arrastava os efeitos colaterais do arquivo
 * inteiro — incluindo uma tentativa real de conexão com banco de dados no
 * carregamento do módulo, confirmado por um teste automatizado falhando
 * com "connect ECONNREFUSED" mesmo sem nenhuma chamada de rede no próprio
 * teste. Módulos ES não fazem avaliação parcial — importar um export
 * nomeado executa TODO o código de nível superior do arquivo.
 *
 * Nenhuma lógica mudou nesta extração — só o arquivo onde vive. Tanto
 * mcpServer.ts (ferramenta publish_campaign) quanto server/campaignPublish.ts
 * (ferramenta de chat publicar_campanha) importam daqui, garantindo que a
 * auditoria de carrossel seja idêntica nos dois caminhos.
 */

export function getCreativeMedia(c: any) {
  return {
    hash: c?.feedImageHash || c?.imageHash || c?.metaImageHash,
    url: c?.feedImageUrl || c?.imageUrl || c?.mediaUrl,
  };
}

/**
 * Video ja enviado para a Meta e vinculado ao criativo (upload_creative_video /
 * updateCreativeImage). A publicacao real resolve esse videoId via
 * buildPublishMediaFromCreative; as checagens de "tem midia" precisam contar
 * com ele, senao um criativo so de video e recusado como "sem imagem"
 * (campanha 817, 20/11/2026).
 */
export function getCreativeVideoId(c: any): string | null {
  const direto = c?.storyVideoId || c?.feedVideoId || c?.squareVideoId
    || c?.publishMedia?.videoId
    || c?.creativeSystemV2?.legacyProjection?.publishMedia?.videoId;
  if (direto) return String(direto);
  const placements = c?.creativeSystemV2?.channels?.meta?.placements;
  if (placements && typeof placements === "object") {
    for (const p of Object.values(placements) as any[]) {
      const vid = p?.legacyProjection?.publishMedia?.videoId;
      if (vid) return String(vid);
    }
  }
  return null;
}

/** Este criativo tem imagem (hash/url) ou video para publicar? */
export function criativoTemMidia(c: any): boolean {
  const m = getCreativeMedia(c);
  return !!(m.hash || m.url || getCreativeVideoId(c));
}

/**
 * Criativo do Feed: entre os que TEM midia, o de maior score (preferindo os de formato feed).
 * Sem nenhum com midia, devolve null para quem chama manter a regra antiga.
 * Campanha 817 (20/11/2026): o carrossel sem midia (score 67) ganhava do video (65) e a
 * Meta recusava o anuncio por falta de thumbnail.
 */
export function escolherCriativoComMidia(
  creatives: any[],
  isFeedLike: (c: any) => boolean,
  score: (c: any) => number,
): any | null {
  const comMidia = (creatives || []).filter(criativoTemMidia);
  if (comMidia.length === 0) return null;
  const melhor = (lista: any[]) => [...lista].sort((a, b) => score(b) - score(a))[0];
  const doFeed = comMidia.filter(isFeedLike);
  return melhor(doFeed.length ? doFeed : comMidia);
}

/** Imagens (hash/url) ou videos aptos a publicar, em qualquer criativo. */
export function campanhaTemMidiaPublicavel(creatives: any[]): boolean {
  return (creatives || []).some((c: any) => {
    const m = getCreativeMedia(c);
    return !!(m.hash || m.url || getCreativeVideoId(c));
  });
}

export function orderedCreativesForCarousel(creatives: any[]): any[] {
  return creatives
    .map((creative, index) => ({ creative, index }))
    .sort((a, b) => {
      const aFeatured = a.creative?.isFeaturedPhoto === true ? 0 : 1;
      const bFeatured = b.creative?.isFeaturedPhoto === true ? 0 : 1;
      if (aFeatured !== bFeatured) return aFeatured - bFeatured;
      const aOriginal = Number.isFinite(Number(a.creative?.photoOriginalIndex)) ? Number(a.creative.photoOriginalIndex) : Number.MAX_SAFE_INTEGER;
      const bOriginal = Number.isFinite(Number(b.creative?.photoOriginalIndex)) ? Number(b.creative.photoOriginalIndex) : Number.MAX_SAFE_INTEGER;
      if (aOriginal !== bOriginal) return aOriginal - bOriginal;
      return a.index - b.index;
    })
    .map((item) => item.creative);
}

export function auditCarouselCreatives(creatives: any[]) {
  const mediaCreatives = orderedCreativesForCarousel(creatives)
    .filter((creative) => {
      const media = getCreativeMedia(creative);
      return media.hash || media.url;
    })
    .slice(0, 10);

  if (mediaCreatives.length < 2) return { ok: true, issues: [] as string[], orderedCreatives: mediaCreatives };

  const issues: string[] = getCarouselEditorialIssues(mediaCreatives);
  const seenHeadlines = new Map<string, number>();
  const seenDescriptions = new Map<string, number>();
  const normalize = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

  mediaCreatives.forEach((creative, index) => {
    const card = index + 1;
    const headline = normalize(creative?.headline || creative?.title || creative?.name);
    const description = normalize(creative?.description || creative?.shortDescription);
    const body = normalize(creative?.copy || creative?.bodyText || creative?.primaryText || creative?.text);

    if (headline.length < 8) issues.push(`Card ${card}: headline ausente ou curta demais.`);
    if (description.length < 4) issues.push(`Card ${card}: description/shortDescription ausente ou curta demais.`);
    if (body.length < 80) issues.push(`Card ${card}: copy/bodyText principal curto demais para carrossel.`);

    const previousHeadline = headline ? seenHeadlines.get(headline) : undefined;
    if (previousHeadline !== undefined) issues.push(`Card ${card}: headline repetida do card ${previousHeadline + 1}.`);
    if (headline) seenHeadlines.set(headline, index);

    const previousDescription = description ? seenDescriptions.get(description) : undefined;
    if (previousDescription !== undefined) issues.push(`Card ${card}: description repetida do card ${previousDescription + 1}.`);
    if (description) seenDescriptions.set(description, index);
  });

  return { ok: issues.length === 0, issues, orderedCreatives: mediaCreatives };
}

/**
 * Funil com 1 criativo por conjunto: devolve o indice do criativo que o conjunto deve usar,
 * ou null para manter a regra antiga (melhor criativo com midia).
 * So se aplica quando o chamador nao fixou creativeIndex, ha 2+ conjuntos e 2+ criativos,
 * e o criativo de mesmo indice do conjunto tem midia publicavel.
 */
export function escolherIndiceDoCriativoDoConjunto(args: {
  creativeIndex?: number | null;
  adSetIndex?: number | null;
  adSetsCount: number;
  creatives: any[];
}): number | null {
  if (typeof args.creativeIndex === "number") return null;
  if (args.adSetsCount < 2 || (args.creatives?.length ?? 0) < 2) return null;
  const idx = args.adSetIndex ?? 0;
  const candidato = args.creatives[idx];
  return candidato && criativoTemMidia(candidato) ? idx : null;
}
