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
