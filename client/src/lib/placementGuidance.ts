export type PlacementGuidanceStatus = "ideal" | "warning" | "info";

export type PlacementGuidanceItem = {
  title: string;
  status: PlacementGuidanceStatus;
  message: string;
  recommendation: string;
  suggestedCta: string[];
};

export type PlacementGuidanceGroup = Record<string, PlacementGuidanceItem>;

export type PlacementGuidanceMap = {
  feed: PlacementGuidanceGroup;
  stories: PlacementGuidanceGroup;
  reels: PlacementGuidanceGroup;
  carousel: PlacementGuidanceGroup;
};

export const placementGuidance: PlacementGuidanceMap = {
  feed: {
    ideal_image_4_5: {
      title: "Feed — formato ideal",
      status: "ideal",
      message:
        "Sua mídia atual está no formato 4:5, que é o mais recomendado para Feed do Facebook e Instagram. Esse formato aproveita melhor o espaço da tela e tende a gerar melhor leitura do anúncio. Você pode publicar assim mesmo.",
      recommendation: "Mantenha título curto e CTA direto para o feed.",
      suggestedCta: ["Saiba mais", "Fale conosco", "Ver opções", "Agendar agora"],
    },
    compatible_image_1_1: {
      title: "Feed — formato compatível",
      status: "ideal",
      message:
        "Sua mídia atual está no formato 1:1, que é compatível com Feed do Facebook e Instagram. O formato mais recomendado continua sendo 4:5, mas seu anúncio pode ser publicado normalmente. Você pode publicar assim mesmo.",
      recommendation: "Se quiser mais destaque no feed, prefira 4:5.",
      suggestedCta: ["Saiba mais", "Fale conosco", "Ver opções", "Agendar agora"],
    },
    ideal_video_4_5: {
      title: "Feed — vídeo em formato recomendado",
      status: "ideal",
      message:
        "Seu vídeo atual está em 4:5, formato recomendado para Feed. Esse formato costuma entregar boa visualização sem cortes relevantes. Você pode publicar assim mesmo.",
      recommendation: "Para Feed, vídeos entre 15 e 30 segundos costumam funcionar melhor.",
      suggestedCta: ["Saiba mais", "Fale conosco", "Ver opções", "Agendar agora"],
    },
    vertical_9_16_used_in_feed: {
      title: "Feed — mídia vertical usada em placement de feed",
      status: "warning",
      message:
        "Sua mídia atual está em 9:16. Para Feed, o formato mais recomendado é 4:5 ou 1:1. O anúncio pode aparecer com enquadramento menos eficiente ou perder área útil no preview. Você pode publicar assim mesmo.",
      recommendation: "Para Feed, prefira 4:5.",
      suggestedCta: ["Saiba mais", "Fale conosco", "Ver opções", "Agendar agora"],
    },
    horizontal_not_recommended: {
      title: "Feed — formato não recomendado",
      status: "info",
      message:
        "Sua mídia atual está em formato horizontal. Para Feed do Facebook e Instagram, o formato mais recomendado é 4:5, com 1:1 como alternativa. O anúncio pode ocupar menos espaço visual e ter menor destaque. Você pode publicar assim mesmo.",
      recommendation: "Ajuste a peça para 4:5 para melhor presença no feed.",
      suggestedCta: ["Saiba mais", "Fale conosco", "Ver opções", "Agendar agora"],
    },
  },

  stories: {
    ideal_image_9_16: {
      title: "Stories — formato ideal",
      status: "ideal",
      message:
        "Sua mídia atual está em 9:16, que é o formato ideal para Stories. Esse formato ocupa a tela inteira e oferece a melhor experiência visual no placement. Você pode publicar assim mesmo.",
      recommendation: "Use texto curto e objetivo nas primeiras linhas da peça.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Fale conosco", "Agendar agora"],
    },
    ideal_video_9_16: {
      title: "Stories — vídeo em formato ideal",
      status: "ideal",
      message:
        "Seu vídeo atual está em 9:16, formato ideal para Stories. Isso ajuda a evitar cortes e melhora a experiência de visualização em tela cheia. Você pode publicar assim mesmo.",
      recommendation: "Em Stories, vídeos curtos e diretos costumam performar melhor.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Fale conosco", "Agendar agora"],
    },
    format_4_5_acceptable: {
      title: "Stories — formato aceitável com ajuste visual",
      status: "warning",
      message:
        "Sua mídia atual está em 4:5. Para Stories, o formato recomendado é 9:16. O anúncio pode aparecer com espaço vazio, cortes automáticos ou menor aproveitamento da tela. Você pode publicar assim mesmo.",
      recommendation: "Para Stories, prefira mídia vertical 9:16.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Fale conosco", "Agendar agora"],
    },
    square_1_1_in_vertical: {
      title: "Stories — formato quadrado em placement vertical",
      status: "warning",
      message:
        "Sua mídia atual está em 1:1. Para Stories, o formato ideal é 9:16. O conteúdo pode perder impacto visual por não preencher a tela inteira. Você pode publicar assim mesmo.",
      recommendation: "Ajuste a mídia para 9:16 antes da próxima publicação.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Fale conosco", "Agendar agora"],
    },
    horizontal_not_recommended: {
      title: "Stories — formato não recomendado",
      status: "info",
      message:
        "Sua mídia atual está em formato horizontal. Para Stories, o formato recomendado é 9:16. Há maior chance de cortes, bordas ou redução de impacto visual. Você pode publicar assim mesmo.",
      recommendation: "Use mídia vertical 9:16 para melhor aproveitamento da tela.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Fale conosco", "Agendar agora"],
    },
  },

  reels: {
    ideal_video_9_16: {
      title: "Reels — formato ideal",
      status: "ideal",
      message:
        "Seu vídeo atual está em 9:16, que é o formato ideal para Reels. Esse padrão oferece melhor exibição em tela cheia e maior aderência ao placement. Você pode publicar assim mesmo.",
      recommendation: "Destaque a mensagem principal logo nos primeiros segundos.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Ver mais", "Agendar agora"],
    },
    video_4_5_compatible: {
      title: "Reels — vídeo compatível, mas fora do formato ideal",
      status: "warning",
      message:
        "Seu vídeo atual está em 4:5. Para Reels, o formato recomendado é 9:16. O anúncio pode ser publicado, mas pode perder impacto visual ou ficar menos natural no placement. Você pode publicar assim mesmo.",
      recommendation: "Para Reels, use vídeo vertical 9:16.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Ver mais", "Agendar agora"],
    },
    image_9_16_allowed_but_video_preferred: {
      title: "Reels — imagem permitida, mas vídeo é mais recomendado",
      status: "warning",
      message:
        "Sua mídia atual está em 9:16, porém é uma imagem. Para Reels, o formato mais recomendado é vídeo vertical 9:16. A publicação pode continuar, mas o resultado tende a ser menos alinhado ao comportamento esperado desse placement. Você pode publicar assim mesmo.",
      recommendation: "Para Reels, prefira vídeo vertical entre 15 e 30 segundos.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Ver mais", "Agendar agora"],
    },
    image_4_5_or_1_1_not_recommended: {
      title: "Reels — formato não recomendado",
      status: "info",
      message:
        "Sua mídia atual não está no formato ideal para Reels. O recomendado é usar vídeo vertical 9:16. A publicação pode continuar, mas o criativo pode perder desempenho visual e parecer menos adequado ao placement. Você pode publicar assim mesmo.",
      recommendation: "Use vídeo 9:16 para melhor resultado em Reels.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Ver mais", "Agendar agora"],
    },
    horizontal_low_adherence: {
      title: "Reels — baixa aderência ao placement",
      status: "info",
      message:
        "Sua mídia atual está em formato horizontal. Para Reels, o ideal é vídeo vertical 9:16. O anúncio pode aparecer com adaptação visual menos eficiente e menor aderência ao placement. Você pode publicar assim mesmo.",
      recommendation: "Substitua por vídeo vertical 9:16 para melhorar a experiência.",
      suggestedCta: ["Saiba mais", "Enviar mensagem", "Ver mais", "Agendar agora"],
    },
  },

  carousel: {
    ideal_images_1_1: {
      title: "Carrossel — formato ideal",
      status: "ideal",
      message:
        "Seu carrossel está com 2 ou mais imagens em 1:1, formato ideal para esse placement. Isso ajuda a manter consistência visual entre os cards. Você pode publicar assim mesmo.",
      recommendation: "Mantenha a mesma identidade visual em todos os cards.",
      suggestedCta: ["Ver opções", "Saiba mais", "Consultar valores", "Fale conosco"],
    },
    compatible_images_4_5: {
      title: "Carrossel — formato compatível",
      status: "ideal",
      message:
        "Seu carrossel está com 2 ou mais imagens em 4:5, formato compatível com esse placement. A publicação pode seguir normalmente. Você pode publicar assim mesmo.",
      recommendation: "Verifique se todos os cards mantêm o mesmo enquadramento.",
      suggestedCta: ["Ver opções", "Saiba mais", "Consultar valores", "Fale conosco"],
    },
    mixed_ratios_warning: {
      title: "Carrossel — tamanhos diferentes entre os cards",
      status: "warning",
      message:
        "Seu carrossel possui imagens com proporções diferentes. O formato ideal é manter todos os cards em 1:1 ou todos em 4:5. A publicação pode continuar, mas a aparência pode ficar inconsistente entre os slides. Você pode publicar assim mesmo.",
      recommendation: "Padronize todos os cards no mesmo formato.",
      suggestedCta: ["Ver opções", "Saiba mais", "Consultar valores", "Fale conosco"],
    },
    minimum_cards_warning: {
      title: "Carrossel — quantidade mínima recomendada atingida",
      status: "warning",
      message:
        "Seu carrossel possui o número mínimo de imagens para publicação. Ele pode ser publicado normalmente, mas carrosséis com mais variedade visual tendem a comunicar melhor a proposta. Você pode publicar assim mesmo.",
      recommendation: "Use pelo menos 3 cards quando possível.",
      suggestedCta: ["Ver opções", "Saiba mais", "Consultar valores", "Fale conosco"],
    },
    non_standard_media_info: {
      title: "Carrossel — mídia fora do padrão mais recomendado",
      status: "info",
      message:
        "Seu carrossel contém mídia fora do padrão mais recomendado para esse placement. O ideal é usar múltiplas imagens padronizadas em 1:1 ou 4:5. A publicação pode continuar, mas o resultado visual pode ficar menos consistente. Você pode publicar assim mesmo.",
      recommendation: "Para carrossel, prefira imagens estáticas com o mesmo formato entre os cards.",
      suggestedCta: ["Ver opções", "Saiba mais", "Consultar valores", "Fale conosco"],
    },
  },
};

export type PlacementType = keyof typeof placementGuidance;
export type MediaType = "image" | "video" | "mixed" | "unknown";
export type NormalizedRatio =
  | "1:1"
  | "4:5"
  | "9:16"
  | "horizontal"
  | "mixed"
  | "unknown";

export type GetPlacementGuidanceInput = {
  placement: PlacementType;
  mediaType: MediaType;
  ratio?: string | number | null;
  cardsCount?: number;
};

function almostEqual(a: number, b: number, tolerance = 0.03): boolean {
  return Math.abs(a - b) <= tolerance;
}

function parseNumericRatio(value: string): number | null {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePairRatio(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return a / b;
}

function classifyRatioValue(value: number): NormalizedRatio {
  if (almostEqual(value, 1)) return "1:1";
  if (almostEqual(value, 4 / 5)) return "4:5";
  if (almostEqual(value, 9 / 16)) return "9:16";
  if (value > 1) return "horizontal";
  return "unknown";
}

export function normalizeRatio(ratio?: string | number | null): NormalizedRatio {
  if (ratio == null) return "unknown";

  if (typeof ratio === "number") {
    if (!Number.isFinite(ratio) || ratio <= 0) return "unknown";
    return classifyRatioValue(ratio);
  }

  const raw = ratio.trim().toLowerCase();
  if (!raw) return "unknown";

  if (["mixed", "misto", "variado", "varied"].includes(raw)) return "mixed";
  if (["square", "quadrado"].includes(raw)) return "1:1";
  if (["vertical", "portrait", "retrato"].includes(raw)) return "9:16";
  if (["horizontal", "landscape"].includes(raw)) return "horizontal";

  const dimensionMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i);
  if (dimensionMatch) {
    const width = Number(dimensionMatch[1].replace(",", "."));
    const height = Number(dimensionMatch[2].replace(",", "."));
    const parsed = parsePairRatio(width, height);
    return parsed ? classifyRatioValue(parsed) : "unknown";
  }

  const colonMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)$/);
  if (colonMatch) {
    const a = Number(colonMatch[1].replace(",", "."));
    const b = Number(colonMatch[2].replace(",", "."));
    const parsed = parsePairRatio(a, b);
    return parsed ? classifyRatioValue(parsed) : "unknown";
  }

  const numeric = parseNumericRatio(raw);
  if (numeric) {
    return classifyRatioValue(numeric);
  }

  return "unknown";
}

export function getPlacementGuidance({
  placement,
  mediaType,
  ratio,
  cardsCount = 1,
}: GetPlacementGuidanceInput): PlacementGuidanceItem {
  const normalizedRatio = normalizeRatio(ratio);

  if (placement === "feed") {
    if (mediaType === "video" && normalizedRatio === "4:5") {
      return placementGuidance.feed.ideal_video_4_5;
    }
    if (mediaType === "image" && normalizedRatio === "4:5") {
      return placementGuidance.feed.ideal_image_4_5;
    }
    if (mediaType === "image" && normalizedRatio === "1:1") {
      return placementGuidance.feed.compatible_image_1_1;
    }
    if (normalizedRatio === "9:16") {
      return placementGuidance.feed.vertical_9_16_used_in_feed;
    }
    return placementGuidance.feed.horizontal_not_recommended;
  }

  if (placement === "stories") {
    if (mediaType === "video" && normalizedRatio === "9:16") {
      return placementGuidance.stories.ideal_video_9_16;
    }
    if (mediaType === "image" && normalizedRatio === "9:16") {
      return placementGuidance.stories.ideal_image_9_16;
    }
    if (normalizedRatio === "4:5") {
      return placementGuidance.stories.format_4_5_acceptable;
    }
    if (normalizedRatio === "1:1") {
      return placementGuidance.stories.square_1_1_in_vertical;
    }
    return placementGuidance.stories.horizontal_not_recommended;
  }

  if (placement === "reels") {
    if (mediaType === "video" && normalizedRatio === "9:16") {
      return placementGuidance.reels.ideal_video_9_16;
    }
    if (mediaType === "video" && normalizedRatio === "4:5") {
      return placementGuidance.reels.video_4_5_compatible;
    }
    if (mediaType === "image" && normalizedRatio === "9:16") {
      return placementGuidance.reels.image_9_16_allowed_but_video_preferred;
    }
    if (mediaType === "image" && (normalizedRatio === "4:5" || normalizedRatio === "1:1")) {
      return placementGuidance.reels.image_4_5_or_1_1_not_recommended;
    }
    return placementGuidance.reels.horizontal_low_adherence;
  }

  if (placement === "carousel") {
    if (mediaType !== "image") {
      return placementGuidance.carousel.non_standard_media_info;
    }
    if (normalizedRatio === "mixed") {
      return placementGuidance.carousel.mixed_ratios_warning;
    }
    if (cardsCount < 3) {
      return placementGuidance.carousel.minimum_cards_warning;
    }
    if (normalizedRatio === "1:1") {
      return placementGuidance.carousel.ideal_images_1_1;
    }
    if (normalizedRatio === "4:5") {
      return placementGuidance.carousel.compatible_images_4_5;
    }
    return placementGuidance.carousel.non_standard_media_info;
  }

  return placementGuidance.feed.horizontal_not_recommended;
}
