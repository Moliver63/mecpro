/**
 * CreativeDistributionEngine.ts
 *
 * Motor de distribuição inteligente de anúncios por formato, proporção e placement.
 * Integrado ao PlacementConfig.ts existente — não duplica código.
 *
 * ARQUITETURA:
 *   PlacementConfig.ts  → configurações estáticas de placements
 *   CreativeDistributionEngine.ts → lógica dinâmica de compatibilidade
 *   PlacementSelector.tsx → UI (usa ambos)
 *   CampaignBuilder.tsx → consome recomendações
 */

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE PROPORÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export type AspectRatio =
  | "9:16"   // vertical full (Stories, Reels, TikTok)
  | "4:5"    // vertical feed premium (melhor para feed mobile)
  | "1:1"    // quadrado (feed universal)
  | "16:9"   // horizontal (YouTube, banners)
  | "1.91:1" // horizontal feed (link ads)
  | "4:3"    // horizontal clássico
  | "unknown";

export type CreativeOrientation = "vertical" | "square" | "horizontal";
export type CreativeType        = "image" | "video" | "carousel" | "story" | "reel";
export type Platform            = "meta" | "google" | "tiktok" | "both" | "all";
export type CampaignObjective   = "leads" | "sales" | "traffic" | "engagement" | "branding";

export interface CreativeSpec {
  width:       number;
  height:      number;
  ratio:       AspectRatio;
  orientation: CreativeOrientation;
  type:        CreativeType;
  fileSizeMB?: number;
  durationSec?: number; // para vídeos
}

export interface PlacementCompatibility {
  placementId:   string;
  label:         string;
  platform:      string;
  compatible:    boolean;
  priority:      "high" | "medium" | "low" | "blocked";
  reason:        string;
  alert?:        string;
  suggestion?:   string;
}

export interface DistributionRecommendation {
  // Placements recomendados (em ordem de prioridade)
  priorityPlacements:  string[];
  // Placements compatíveis mas não prioritários
  compatiblePlacements: string[];
  // Placements bloqueados (causariam má experiência)
  blockedPlacements:   string[];
  // Alertas visuais para o usuário
  alerts:              DistributionAlert[];
  // Variações sugeridas
  suggestedVariations: VariationSuggestion[];
  // Score de qualidade da distribuição (0–100)
  qualityScore:        number;
  // Resumo para o usuário
  summary:             string;
}

export interface DistributionAlert {
  type:       "error" | "warning" | "info" | "success";
  icon:       string;
  title:      string;
  message:    string;
  placementId?: string;
}

export interface VariationSuggestion {
  fromRatio:   AspectRatio;
  toRatio:     AspectRatio;
  forPlacements: string[];
  priority:    "high" | "medium" | "low";
  reason:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESPECIFICAÇÕES TÉCNICAS POR PLACEMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface PlacementSpec {
  id:           string;
  label:        string;
  platform:     string;
  // Proporções ideais (em ordem de prioridade)
  idealRatios:  AspectRatio[];
  // Proporções aceitas (com degradação de qualidade)
  acceptedRatios: AspectRatio[];
  // Proporções bloqueadas (causam corte ruim ou rejeição)
  blockedRatios:  AspectRatio[];
  // Tipos de criativo suportados
  supportedTypes: CreativeType[];
  // Dimensões mínimas
  minWidth:     number;
  minHeight:    number;
  // Dimensões máximas (0 = sem limite)
  maxWidth:     number;
  maxHeight:    number;
  // Duração máxima de vídeo em segundos (0 = sem vídeo)
  maxVideoDuration: number;
  // Tamanho máximo em MB
  maxFileSizeMB: number;
  // Dica de performance
  performanceTip: string;
}

export const PLACEMENT_SPECS: Record<string, PlacementSpec> = {
  // ── META FACEBOOK ─────────────────────────────────────────────────────────
  fb_feed: {
    id: "fb_feed", label: "Facebook Feed", platform: "meta",
    idealRatios:    ["4:5", "1:1"],
    acceptedRatios: ["1.91:1", "16:9"],
    blockedRatios:  ["9:16"],
    supportedTypes: ["image", "video", "carousel"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 240, maxFileSizeMB: 30,
    performanceTip: "4:5 ocupa mais espaço no feed mobile — aumenta visibilidade até 20%",
  },
  fb_story: {
    id: "fb_story", label: "Facebook Story", platform: "meta",
    idealRatios:    ["9:16"],
    acceptedRatios: ["4:5", "1:1"],
    blockedRatios:  ["16:9", "1.91:1", "4:3"],
    supportedTypes: ["image", "video"],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 15, maxFileSizeMB: 30,
    performanceTip: "9:16 ocupa a tela inteira — máxima atenção e imersão",
  },
  fb_reels: {
    id: "fb_reels", label: "Facebook Reels", platform: "meta",
    idealRatios:    ["9:16"],
    acceptedRatios: [],
    blockedRatios:  ["1:1", "16:9", "4:5", "1.91:1"],
    supportedTypes: ["video"],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 30, maxFileSizeMB: 4000,
    performanceTip: "Reels exige vídeo 9:16 — qualquer outra proporção causa barras pretas",
  },
  fb_marketplace: {
    id: "fb_marketplace", label: "Facebook Marketplace", platform: "meta",
    idealRatios:    ["1:1"],
    acceptedRatios: ["4:5", "1.91:1"],
    blockedRatios:  ["9:16", "16:9"],
    supportedTypes: ["image", "video"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 240, maxFileSizeMB: 30,
    performanceTip: "1:1 é o padrão do marketplace — evita cortes automáticos",
  },

  // ── META INSTAGRAM ────────────────────────────────────────────────────────
  ig_feed: {
    id: "ig_feed", label: "Instagram Feed", platform: "meta",
    idealRatios:    ["4:5", "1:1"],
    acceptedRatios: ["1.91:1"],
    blockedRatios:  ["9:16", "16:9"],
    supportedTypes: ["image", "video", "carousel"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 60, maxFileSizeMB: 30,
    performanceTip: "4:5 é o formato premium do feed — maior área de destaque no scroll",
  },
  ig_story: {
    id: "ig_story", label: "Instagram Stories", platform: "meta",
    idealRatios:    ["9:16"],
    acceptedRatios: ["4:5"],
    blockedRatios:  ["1:1", "16:9", "1.91:1"],
    supportedTypes: ["image", "video"],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 15, maxFileSizeMB: 30,
    performanceTip: "Stories imersivos em 9:16 têm CTR 35% acima da média",
  },
  ig_reels: {
    id: "ig_reels", label: "Instagram Reels", platform: "meta",
    idealRatios:    ["9:16"],
    acceptedRatios: [],
    blockedRatios:  ["1:1", "16:9", "4:5", "1.91:1"],
    supportedTypes: ["video"],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 30, maxFileSizeMB: 4000,
    performanceTip: "Reels 9:16 com hook nos primeiros 3s — maior alcance orgânico",
  },
  ig_explore: {
    id: "ig_explore", label: "Instagram Explore", platform: "meta",
    idealRatios:    ["1:1", "4:5"],
    acceptedRatios: ["1.91:1"],
    blockedRatios:  ["9:16"],
    supportedTypes: ["image", "video"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 60, maxFileSizeMB: 30,
    performanceTip: "Explore tem audiência em modo descoberta — criativo visual forte converte",
  },

  // ── GOOGLE ────────────────────────────────────────────────────────────────
  google_search: {
    id: "google_search", label: "Google Search", platform: "google",
    idealRatios:    [],
    acceptedRatios: [],
    blockedRatios:  [],
    supportedTypes: ["image"],
    minWidth: 0, minHeight: 0, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 0, maxFileSizeMB: 0,
    performanceTip: "Search é texto — criativos visuais não se aplicam aqui",
  },
  google_display: {
    id: "google_display", label: "Google Display", platform: "google",
    idealRatios:    ["16:9", "1.91:1", "1:1"],
    acceptedRatios: ["4:3"],
    blockedRatios:  ["9:16", "4:5"],
    supportedTypes: ["image", "video"],
    minWidth: 300, minHeight: 250, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 30, maxFileSizeMB: 5,
    performanceTip: "Display precisa de múltiplos formatos — sistema escolhe automaticamente",
  },
  google_youtube: {
    id: "google_youtube", label: "YouTube Ads", platform: "google",
    idealRatios:    ["16:9"],
    acceptedRatios: ["4:3"],
    blockedRatios:  ["9:16", "1:1", "4:5"],
    supportedTypes: ["video"],
    minWidth: 1280, minHeight: 720, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 180, maxFileSizeMB: 0,
    performanceTip: "YouTube 16:9 HD — primeiros 5s são críticos (skip após isso)",
  },
  google_pmax: {
    id: "google_pmax", label: "Google PMax", platform: "google",
    idealRatios:    ["1.91:1", "1:1", "4:5"],
    acceptedRatios: ["16:9"],
    blockedRatios:  [],
    supportedTypes: ["image", "video"],
    minWidth: 600, minHeight: 314, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 30, maxFileSizeMB: 5,
    performanceTip: "PMax usa múltiplos formatos automaticamente — envie variações",
  },

  // ── TIKTOK ────────────────────────────────────────────────────────────────
  tiktok_feed: {
    id: "tiktok_feed", label: "TikTok Feed", platform: "tiktok",
    idealRatios:    ["9:16"],
    acceptedRatios: ["1:1"],
    blockedRatios:  ["16:9", "1.91:1", "4:3", "4:5"],
    supportedTypes: ["video"],
    minWidth: 540, minHeight: 960, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 60, maxFileSizeMB: 500,
    performanceTip: "TikTok é 100% vertical — vídeos 9:16 com hook impactante nos primeiros 2s",
  },
  tiktok_topview: {
    id: "tiktok_topview", label: "TikTok TopView", platform: "tiktok",
    idealRatios:    ["9:16"],
    acceptedRatios: [],
    blockedRatios:  ["16:9", "1:1", "4:5"],
    supportedTypes: ["video"],
    minWidth: 540, minHeight: 960, maxWidth: 0, maxHeight: 0,
    maxVideoDuration: 60, maxFileSizeMB: 500,
    performanceTip: "TopView é o primeiro anúncio ao abrir o app — alto impacto, exige produção",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS DE PROPORÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export function detectAspectRatio(width: number, height: number): AspectRatio {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (ratio >= 0.54 && ratio <= 0.58)  return "9:16";    // 0.5625
  if (ratio >= 0.79 && ratio <= 0.81)  return "4:5";     // 0.8
  if (ratio >= 0.98 && ratio <= 1.02)  return "1:1";     // 1.0
  if (ratio >= 1.32 && ratio <= 1.35)  return "4:3";     // 1.333
  if (ratio >= 1.75 && ratio <= 1.80)  return "16:9";    // 1.778
  if (ratio >= 1.89 && ratio <= 1.93)  return "1.91:1";  // 1.91
  return "unknown";
}

export function getOrientation(ratio: AspectRatio): CreativeOrientation {
  if (ratio === "9:16" || ratio === "4:5") return "vertical";
  if (ratio === "1:1")                     return "square";
  return "horizontal";
}

export function getRatioLabel(ratio: AspectRatio): string {
  const labels: Record<AspectRatio, string> = {
    "9:16":   "Vertical (9:16) — Stories/Reels/TikTok",
    "4:5":    "Vertical Feed (4:5) — Feed Mobile Premium",
    "1:1":    "Quadrado (1:1) — Feed Universal",
    "16:9":   "Horizontal (16:9) — YouTube/Display",
    "1.91:1": "Horizontal Link (1.91:1) — Feed/Display",
    "4:3":    "Horizontal Clássico (4:3)",
    "unknown": "Proporção desconhecida",
  };
  return labels[ratio];
}

export function getRatioIcon(ratio: AspectRatio): string {
  const icons: Record<AspectRatio, string> = {
    "9:16": "📱", "4:5": "📲", "1:1": "⬜",
    "16:9": "🖥️", "1.91:1": "📺", "4:3": "🖼️", "unknown": "❓",
  };
  return icons[ratio];
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE COMPATIBILIDADE
// ─────────────────────────────────────────────────────────────────────────────

export function checkPlacementCompatibility(
  placementId: string,
  creative: CreativeSpec
): PlacementCompatibility {
  const spec = PLACEMENT_SPECS[placementId];

  if (!spec) {
    return {
      placementId, label: placementId, platform: "unknown",
      compatible: true, priority: "low",
      reason: "Placement não catalogado — sem validação disponível",
    };
  }

  // Verifica tipo de criativo
  if (!spec.supportedTypes.includes(creative.type)) {
    return {
      placementId, label: spec.label, platform: spec.platform,
      compatible: false, priority: "blocked",
      reason: `${spec.label} não suporta ${creative.type}`,
      alert: `❌ ${spec.label} não suporta este tipo de criativo`,
      suggestion: `Use ${spec.supportedTypes.join(" ou ")} para este placement`,
    };
  }

  // Verifica duração de vídeo
  if (creative.type === "video" && creative.durationSec && spec.maxVideoDuration > 0) {
    if (creative.durationSec > spec.maxVideoDuration) {
      return {
        placementId, label: spec.label, platform: spec.platform,
        compatible: false, priority: "blocked",
        reason: `Vídeo de ${creative.durationSec}s excede limite de ${spec.maxVideoDuration}s`,
        alert: `⏱️ Vídeo muito longo para ${spec.label} (máx ${spec.maxVideoDuration}s)`,
        suggestion: `Corte o vídeo para até ${spec.maxVideoDuration} segundos`,
      };
    }
  }

  // Verifica dimensões mínimas
  if (spec.minWidth > 0 && creative.width < spec.minWidth) {
    return {
      placementId, label: spec.label, platform: spec.platform,
      compatible: false, priority: "blocked",
      reason: `Largura ${creative.width}px abaixo do mínimo ${spec.minWidth}px`,
      alert: `📐 Resolução insuficiente para ${spec.label}`,
      suggestion: `Mínimo: ${spec.minWidth}×${spec.minHeight}px`,
    };
  }

  const ratio = creative.ratio;

  // Proporção bloqueada
  if (ratio !== "unknown" && spec.blockedRatios.includes(ratio)) {
    const isVerticalInHorizontal = getOrientation(ratio) === "vertical" && spec.idealRatios.every(r => getOrientation(r) !== "vertical");
    const isHorizontalInVertical = getOrientation(ratio) === "horizontal" && spec.idealRatios.every(r => getOrientation(r) === "vertical");

    const alertMsg = isVerticalInHorizontal
      ? `⬆️ Criativo vertical não é adequado para ${spec.label} — causará cortes ruins`
      : isHorizontalInVertical
      ? `⬇️ Criativo horizontal em ${spec.label} terá barras pretas laterais`
      : `⚠️ Proporção ${ratio} bloqueada em ${spec.label}`;

    const suggestRatio = spec.idealRatios[0];
    return {
      placementId, label: spec.label, platform: spec.platform,
      compatible: false, priority: "blocked",
      reason: `Proporção ${ratio} bloqueada — causaria má experiência visual`,
      alert: alertMsg,
      suggestion: suggestRatio ? `Crie uma versão ${suggestRatio} (${getRatioLabel(suggestRatio)})` : undefined,
    };
  }

  // Proporção ideal
  if (ratio !== "unknown" && spec.idealRatios.includes(ratio)) {
    return {
      placementId, label: spec.label, platform: spec.platform,
      compatible: true, priority: "high",
      reason: `Proporção ${ratio} é ideal para ${spec.label}`,
      alert: undefined,
      suggestion: undefined,
    };
  }

  // Proporção aceita (com degradação)
  if (ratio !== "unknown" && spec.acceptedRatios.includes(ratio)) {
    return {
      placementId, label: spec.label, platform: spec.platform,
      compatible: true, priority: "medium",
      reason: `Proporção ${ratio} é aceita em ${spec.label}, mas não ideal`,
      alert: `⚠️ ${spec.label}: proporção ${ratio} aceita, mas ${spec.idealRatios[0]} teria melhor performance`,
      suggestion: spec.idealRatios[0] ? `Versão ${spec.idealRatios[0]} otimizaria a performance` : undefined,
    };
  }

  // Proporção desconhecida — aceita com aviso
  if (ratio === "unknown") {
    return {
      placementId, label: spec.label, platform: spec.platform,
      compatible: true, priority: "low",
      reason: "Proporção não detectada — verifique as dimensões do criativo",
      alert: `❓ Verifique se as dimensões são adequadas para ${spec.label}`,
    };
  }

  // Proporção não catalogada — aceita com baixa prioridade
  return {
    placementId, label: spec.label, platform: spec.platform,
    compatible: true, priority: "low",
    reason: `Proporção ${ratio} não está na lista de ${spec.label}`,
    alert: `💡 Teste ${spec.idealRatios[0] || "outros formatos"} para melhor performance em ${spec.label}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMENDAÇÃO COMPLETA DE DISTRIBUIÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export function getDistributionRecommendation(
  creative: CreativeSpec,
  platform: Platform,
  objective: CampaignObjective
): DistributionRecommendation {
  // Placements relevantes por plataforma
  const relevantPlacements = Object.values(PLACEMENT_SPECS).filter(spec => {
    if (platform === "meta")   return spec.platform === "meta";
    if (platform === "google") return spec.platform === "google";
    if (platform === "tiktok") return spec.platform === "tiktok";
    if (platform === "both")   return spec.platform === "meta" || spec.platform === "google";
    return true; // all
  });

  const priority: string[]   = [];
  const compatible: string[] = [];
  const blocked: string[]    = [];
  const alerts: DistributionAlert[] = [];
  const variations: VariationSuggestion[] = [];
  const suggestedRatios = new Set<AspectRatio>();

  for (const spec of relevantPlacements) {
    const check = checkPlacementCompatibility(spec.id, creative);

    if (check.priority === "blocked" || !check.compatible) {
      blocked.push(spec.id);
      if (check.alert) {
        alerts.push({
          type: "error", icon: "❌",
          title: `${spec.label} bloqueado`,
          message: check.alert,
          placementId: spec.id,
        });
      }
      // Sugere variação se há razão de proporção
      if (spec.idealRatios.length > 0) {
        const targetRatio = spec.idealRatios[0];
        if (!suggestedRatios.has(targetRatio)) {
          suggestedRatios.add(targetRatio);
          variations.push({
            fromRatio:     creative.ratio,
            toRatio:       targetRatio,
            forPlacements: [spec.id],
            priority:      "high",
            reason:        `Necessário para usar ${spec.label}`,
          });
        } else {
          // Adiciona placement à variação existente
          const existing = variations.find(v => v.toRatio === targetRatio);
          if (existing) existing.forPlacements.push(spec.id);
        }
      }
    } else if (check.priority === "high") {
      priority.push(spec.id);
      if (spec.performanceTip) {
        alerts.push({
          type: "success", icon: "✅",
          title: `${spec.label} — ideal`,
          message: spec.performanceTip,
          placementId: spec.id,
        });
      }
    } else if (check.priority === "medium") {
      compatible.push(spec.id);
      if (check.alert) {
        alerts.push({
          type: "warning", icon: "⚠️",
          title: `${spec.label} — aceito`,
          message: check.alert,
          placementId: spec.id,
        });
      }
    } else {
      compatible.push(spec.id);
    }
  }

  // Adiciona alertas de variações sugeridas
  for (const variation of variations) {
    alerts.push({
      type: "info", icon: "💡",
      title: `Crie versão ${variation.toRatio}`,
      message: `${getRatioIcon(variation.toRatio)} ${getRatioLabel(variation.toRatio)} — libera ${variation.forPlacements.length} placement(s) adicional(is)`,
    });
  }

  // Score de qualidade
  const total = relevantPlacements.length || 1;
  const qualityScore = Math.round(
    ((priority.length * 1.0 + compatible.length * 0.6) / total) * 100
  );

  // Resumo
  const ratioLabel = getRatioLabel(creative.ratio);
  const summary = priority.length > 0
    ? `✅ ${creative.ratio} funciona bem em ${priority.length} placement(s). ${blocked.length > 0 ? `${blocked.length} placement(s) bloqueado(s) — crie variações para maximizar alcance.` : ""}`
    : blocked.length > 0
    ? `⚠️ ${creative.ratio} está bloqueado em ${blocked.length} placement(s). Recomendamos criar variações para melhor distribuição.`
    : `ℹ️ ${ratioLabel} — distribuição compatível com ${compatible.length} placement(s).`;

  return {
    priorityPlacements:   priority,
    compatiblePlacements: compatible,
    blockedPlacements:    blocked,
    alerts,
    suggestedVariations:  variations,
    qualityScore,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMENDAÇÃO DE FORMATO POR PLATAFORMA + OBJETIVO
// ─────────────────────────────────────────────────────────────────────────────

export interface FormatRecommendation {
  ratio:       AspectRatio;
  type:        CreativeType;
  priority:    "primary" | "secondary" | "optional";
  placements:  string[];
  reason:      string;
  specs:       string;
}

export function getFormatRecommendations(
  platform: Platform,
  objective: CampaignObjective
): FormatRecommendation[] {
  const recs: FormatRecommendation[] = [];

  if (platform === "meta" || platform === "both" || platform === "all") {
    // Meta: formatos por objetivo
    if (objective === "leads" || objective === "sales") {
      recs.push({
        ratio: "4:5", type: "image", priority: "primary",
        placements: ["ig_feed", "fb_feed"],
        reason: "Maior área no feed mobile — CTR superior para conversão",
        specs: "1080×1350px, JPG/PNG, máx 30MB",
      });
      recs.push({
        ratio: "9:16", type: "video", priority: "primary",
        placements: ["ig_story", "fb_story", "ig_reels"], // fb_reels removido — API rejeita
        reason: "Stories e Reels têm custo por lead menor em média 40%",
        specs: "1080×1920px, MP4, máx 15s (Story) ou 30s (Reels)",
      });
      recs.push({
        ratio: "1:1", type: "carousel", priority: "secondary",
        placements: ["ig_feed", "fb_feed"],
        reason: "Carrossel quadrado funciona em ambos os feeds",
        specs: "1080×1080px por card, 2–10 cards",
      });
    }

    if (objective === "branding" || objective === "engagement") {
      recs.push({
        ratio: "9:16", type: "video", priority: "primary",
        placements: ["ig_reels", "ig_story", "fb_story"], // fb_reels removido — API rejeita
        reason: "Reels têm alcance orgânico boosted — ideal para awareness",
        specs: "1080×1920px, MP4, 15–30s com música/hook forte",
      });
      recs.push({
        ratio: "4:5", type: "image", priority: "secondary",
        placements: ["ig_feed", "fb_feed", "ig_explore"],
        reason: "Feed com imagem impactante para engajamento",
        specs: "1080×1350px, JPG/PNG",
      });
    }

    if (objective === "traffic") {
      recs.push({
        ratio: "1.91:1", type: "image", priority: "primary",
        placements: ["fb_feed"],
        reason: "Link ads horizontais têm CPC menor para tráfego",
        specs: "1200×628px, JPG/PNG",
      });
      recs.push({
        ratio: "1:1", type: "image", priority: "secondary",
        placements: ["ig_feed", "fb_feed"],
        reason: "Quadrado funciona em todos os feeds",
        specs: "1080×1080px",
      });
    }
  }

  if (platform === "google" || platform === "both" || platform === "all") {
    recs.push({
      ratio: "16:9", type: "video", priority: "primary",
      placements: ["google_youtube"],
      reason: "YouTube in-stream — alto alcance com segmentação precisa",
      specs: "1920×1080px, máx 30s (pular após 5s)",
    });
    recs.push({
      ratio: "1.91:1", type: "image", priority: "secondary",
      placements: ["google_display", "google_pmax"],
      reason: "Display horizontal — padrão para banners Google",
      specs: "1200×628px, JPG/PNG, máx 5MB",
    });
    recs.push({
      ratio: "1:1", type: "image", priority: "optional",
      placements: ["google_display", "google_pmax"],
      reason: "Formato quadrado para PMax e Display responsivo",
      specs: "1200×1200px",
    });
  }

  if (platform === "tiktok" || platform === "all") {
    recs.push({
      ratio: "9:16", type: "video", priority: "primary",
      placements: ["tiktok_feed"],
      reason: "TikTok é 100% vertical — vídeo 9:16 é obrigatório",
      specs: "1080×1920px, MP4, 15–60s, com hook impactante nos 2 primeiros segundos",
    });
  }

  return recs;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO COM INTELLIGENCE ENGINE (learning de performance)
// ─────────────────────────────────────────────────────────────────────────────

export interface FormatPerformanceData {
  ratio:       AspectRatio;
  placement:   string;
  platform:    string;
  avgScore:    number;
  sampleCount: number;
  avgCtr:      number;
  avgCpc:      number;
}

/**
 * Gera ranking de formatos por performance real (baseado na learning base).
 * Conecta com o campaignIntelligenceEngine.ts existente.
 */
export function rankFormatsByPerformance(
  learningData: any[],
  platform: Platform,
  objective: CampaignObjective
): FormatPerformanceData[] {
  if (!learningData || learningData.length === 0) return [];

  const performanceMap = new Map<string, FormatPerformanceData>();

  for (const entry of learningData) {
    if (entry.platform !== platform && platform !== "all") continue;

    let topFormat = "unknown";
    try {
      const formats = JSON.parse(entry.top_ad_formats || "{}");
      const entries = Object.entries(formats).sort((a, b) => (b[1] as number) - (a[1] as number));
      topFormat = entries[0]?.[0] || "unknown";
    } catch {}

    let topPlacement = "auto";
    try {
      const placements = JSON.parse(entry.top_placements || "{}");
      const entries    = Object.entries(placements).sort((a, b) => (b[1] as number) - (a[1] as number));
      topPlacement = entries[0]?.[0] || "auto";
    } catch {}

    // Mapeia formato do engine para AspectRatio
    const formatToRatio: Record<string, AspectRatio> = {
      "reels":          "9:16",
      "video_curto":    "9:16",
      "stories":        "9:16",
      "video_longo":    "16:9",
      "video":          "16:9",
      "carrossel":      "1:1",
      "carousel":       "1:1",
      "imagem_produto": "4:5",
      "imagem_pessoa":  "4:5",
      "image":          "1:1",
    };

    const ratio = formatToRatio[topFormat] || "unknown";
    const key   = `${ratio}_${topPlacement}`;

    if (!performanceMap.has(key)) {
      performanceMap.set(key, {
        ratio, placement: topPlacement, platform: entry.platform,
        avgScore: 0, sampleCount: 0, avgCtr: 0, avgCpc: 0,
      });
    }

    const existing = performanceMap.get(key)!;
    const n = existing.sampleCount + entry.sample_count;
    existing.avgScore    = (existing.avgScore * existing.sampleCount + (entry.avg_score || 0) * entry.sample_count) / n;
    existing.avgCtr      = (existing.avgCtr   * existing.sampleCount + (entry.avg_ctr   || 0) * entry.sample_count) / n;
    existing.avgCpc      = (existing.avgCpc   * existing.sampleCount + (entry.avg_cpc   || 0) * entry.sample_count) / n;
    existing.sampleCount = n;
  }

  return Array.from(performanceMap.values())
    .filter(d => d.ratio !== "unknown")
    .sort((a, b) => b.avgScore - a.avgScore);
}
