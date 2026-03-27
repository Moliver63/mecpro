// ─── PLACEMENT CONFIG v2 ─────────────────────────────────────────────────────
// Estrutura escalável de placements por plataforma
// Para adicionar novos placements: apenas adicionar aqui, sem refatoração
// v2: integrado com CreativeDistributionEngine para validação por proporção

export type PlacementMode = "auto" | "manual";

export interface Placement {
  id:          string;
  label:       string;
  icon:        string;
  format:      ("image" | "video" | "both" | "carousel")[];
  orientation: ("vertical" | "horizontal" | "square" | "any")[];
  tooltip:     string;
  // v2: metadados de proporção
  idealRatios?:   string[];  // ex: ["9:16"]
  blockedRatios?: string[];  // ex: ["16:9"]
  minResolution?: string;    // ex: "1080×1920"
  maxDuration?:   number;    // segundos (vídeo)
  performanceTip?: string;
}

export interface PlacementGroup {
  platform:   string;
  label:      string;
  icon:       string;
  color:      string;
  placements: Placement[];
}

export const PLACEMENT_GROUPS: PlacementGroup[] = [
  // ── FACEBOOK ──────────────────────────────────────────────────────────────
  {
    platform: "meta", label: "Facebook", icon: "📘", color: "#1877f2",
    placements: [
      {
        id: "fb_feed", label: "Feed", icon: "🏠",
        format: ["image","video","both","carousel"],
        orientation: ["horizontal","square"],
        tooltip: "Feed do Facebook. Ideal 4:5 ou 1:1. Evite 9:16 — será cortado.",
        idealRatios: ["4:5","1:1"],
        blockedRatios: ["9:16"],
        minResolution: "600×600",
        performanceTip: "4:5 ocupa mais espaço no feed mobile",
      },
      {
        id: "fb_story", label: "Story", icon: "⬆️",
        format: ["image","video","both"],
        orientation: ["vertical"],
        tooltip: "Stories do Facebook. Recomendamos formato vertical 9:16.",
        idealRatios: ["9:16"],
        blockedRatios: ["16:9","1.91:1"],
        minResolution: "500×889",
        maxDuration: 15,
        performanceTip: "9:16 imersivo — maior atenção",
      },
      {
        id: "fb_reels", label: "Reels", icon: "🎬",
        format: ["video"],
        orientation: ["vertical"],
        tooltip: "Reels do Facebook. Apenas vídeo 9:16. Outros formatos causam barras pretas.",
        idealRatios: ["9:16"],
        blockedRatios: ["16:9","1:1","4:5","1.91:1"],
        minResolution: "500×889",
        maxDuration: 30,
        performanceTip: "Hook impactante nos primeiros 3s",
      },
      {
        id: "fb_marketplace", label: "Marketplace", icon: "🛒",
        format: ["image","video","both"],
        orientation: ["square"],
        tooltip: "Marketplace do Facebook. Ideal 1:1 para evitar cortes.",
        idealRatios: ["1:1"],
        blockedRatios: ["9:16"],
        minResolution: "600×600",
        performanceTip: "1:1 padrão do marketplace",
      },
    ],
  },

  // ── INSTAGRAM ─────────────────────────────────────────────────────────────
  {
    platform: "meta", label: "Instagram", icon: "📸", color: "#e1306c",
    placements: [
      {
        id: "ig_feed", label: "Feed", icon: "🏠",
        format: ["image","video","both","carousel"],
        orientation: ["vertical","square"],
        tooltip: "Feed do Instagram. 4:5 é o premium — maior área no scroll.",
        idealRatios: ["4:5","1:1"],
        blockedRatios: ["9:16","16:9"],
        minResolution: "600×600",
        performanceTip: "4:5 é o formato premium do feed mobile",
      },
      {
        id: "ig_story", label: "Story", icon: "⬆️",
        format: ["image","video","both"],
        orientation: ["vertical"],
        tooltip: "Stories do Instagram. Recomendamos formato vertical 9:16.",
        idealRatios: ["9:16"],
        blockedRatios: ["1:1","16:9","1.91:1"],
        minResolution: "500×889",
        maxDuration: 15,
        performanceTip: "Stories 9:16 têm CTR 35% acima da média",
      },
      {
        id: "ig_reels", label: "Reels", icon: "🎬",
        format: ["video"],
        orientation: ["vertical"],
        tooltip: "Reels do Instagram. Apenas vídeo 9:16. Maior alcance orgânico.",
        idealRatios: ["9:16"],
        blockedRatios: ["1:1","16:9","4:5","1.91:1"],
        minResolution: "500×889",
        maxDuration: 30,
        performanceTip: "Reels 9:16 — maior alcance orgânico da plataforma",
      },
      {
        id: "ig_explore", label: "Explore", icon: "🔍",
        format: ["image","video","both"],
        orientation: ["square","vertical"],
        tooltip: "Aba Explore do Instagram. Audiência em modo descoberta.",
        idealRatios: ["1:1","4:5"],
        blockedRatios: ["9:16"],
        minResolution: "600×600",
        performanceTip: "Explore tem audiência em modo descoberta — visual forte",
      },
    ],
  },

  // ── GOOGLE ────────────────────────────────────────────────────────────────
  {
    platform: "google", label: "Google", icon: "🔍", color: "#4285f4",
    placements: [
      {
        id: "google_search", label: "Search", icon: "🔎",
        format: ["image"],
        orientation: ["any"],
        tooltip: "Anúncios de texto no Google Search. Sem criativo visual.",
        performanceTip: "Search é texto — criativos visuais não se aplicam",
      },
      {
        id: "google_display", label: "Display", icon: "🖥️",
        format: ["image","video","both"],
        orientation: ["horizontal","square"],
        tooltip: "Rede de Display do Google. Aceita múltiplos formatos.",
        idealRatios: ["16:9","1.91:1","1:1"],
        blockedRatios: ["9:16","4:5"],
        minResolution: "300×250",
        performanceTip: "Display precisa de múltiplos formatos para melhor cobertura",
      },
      {
        id: "google_youtube", label: "YouTube", icon: "▶️",
        format: ["video"],
        orientation: ["horizontal"],
        tooltip: "YouTube In-Stream. Apenas vídeo 16:9. Primeiros 5s são críticos.",
        idealRatios: ["16:9"],
        blockedRatios: ["9:16","1:1","4:5"],
        minResolution: "1280×720",
        maxDuration: 180,
        performanceTip: "Primeiros 5s críticos (skip após isso)",
      },
      {
        id: "google_pmax", label: "Performance Max", icon: "🚀",
        format: ["image","video","both"],
        orientation: ["horizontal","square","vertical"],
        tooltip: "PMax usa múltiplos formatos automaticamente. Envie variações.",
        idealRatios: ["1.91:1","1:1","4:5"],
        minResolution: "600×314",
        performanceTip: "Envie múltiplos formatos — PMax escolhe automaticamente",
      },
    ],
  },

  // ── TIKTOK ────────────────────────────────────────────────────────────────
  {
    platform: "tiktok", label: "TikTok", icon: "🎵", color: "#010101",
    placements: [
      {
        id: "tiktok_feed", label: "TikTok Feed", icon: "🎵",
        format: ["video"],
        orientation: ["vertical"],
        tooltip: "Feed do TikTok. Apenas vídeo 9:16. Hook nos primeiros 2s.",
        idealRatios: ["9:16"],
        blockedRatios: ["16:9","1:1","4:5","1.91:1"],
        minResolution: "540×960",
        maxDuration: 60,
        performanceTip: "Hook impactante nos primeiros 2s — TikTok é 100% vertical",
      },
      {
        id: "tiktok_topview", label: "TopView", icon: "⭐",
        format: ["video"],
        orientation: ["vertical"],
        tooltip: "Primeiro anúncio ao abrir o app. Alto impacto. Apenas 9:16.",
        idealRatios: ["9:16"],
        blockedRatios: ["16:9","1:1","4:5"],
        minResolution: "540×960",
        maxDuration: 60,
        performanceTip: "TopView é o primeiro anúncio ao abrir o app — alto impacto",
      },
    ],
  },
];

// ── Placements recomendados por objetivo de campanha ──────────────────────
export const AUTO_PLACEMENTS: Record<string, string[]> = {
  leads:      ["fb_feed", "ig_feed", "ig_story", "fb_story", "ig_reels"],
  sales:      ["fb_feed", "ig_feed", "ig_story", "fb_story", "ig_reels", "fb_reels"],
  branding:   ["ig_reels", "fb_reels", "ig_story", "fb_story", "ig_explore"],
  traffic:    ["fb_feed", "ig_feed", "ig_explore", "google_search", "google_display"],
  engagement: ["ig_reels", "ig_feed", "ig_story", "ig_explore"],
};

// ── Placements recomendados por plataforma de campanha ────────────────────
export const PLATFORM_PLACEMENTS: Record<string, string[]> = {
  meta:   ["fb_feed", "ig_feed", "ig_story", "fb_story", "ig_reels", "fb_reels"],
  google: ["google_search", "google_display", "google_youtube", "google_pmax"],
  tiktok: ["tiktok_feed"],
  both:   ["fb_feed", "ig_feed", "ig_story", "fb_story", "google_search", "google_display"],
  all:    ["fb_feed", "ig_feed", "ig_story", "fb_story", "ig_reels", "fb_reels", "google_search", "google_display", "tiktok_feed"],
};

// ── Validações por placement ───────────────────────────────────────────────
export interface PlacementValidation {
  warning?:       string;
  requiresVideo?: boolean;
  blockedReason?: string;
  // v2: alertas de proporção
  ratioAlert?:    string;
  idealRatio?:    string;
}

export function validatePlacement(placementId: string, hasVideo: boolean, ratio?: string): PlacementValidation {
  const videoOnly       = ["fb_reels", "ig_reels", "tiktok_feed", "tiktok_topview", "google_youtube"];
  const verticalOnly    = ["fb_story", "ig_story", "fb_reels", "ig_reels", "tiktok_feed", "tiktok_topview"];
  const horizontalOnly  = ["google_youtube"];
  const squarePreferred = ["fb_feed", "ig_feed", "fb_marketplace"];

  // Vídeo obrigatório
  if (videoOnly.includes(placementId) && !hasVideo) {
    const labels: Record<string, string> = {
      fb_reels: "Reels (Facebook)", ig_reels: "Reels (Instagram)",
      tiktok_feed: "TikTok Feed", tiktok_topview: "TikTok TopView",
      google_youtube: "YouTube",
    };
    return {
      warning:        `${labels[placementId] || placementId} exige vídeo`,
      requiresVideo:  true,
    };
  }

  // v2: alertas de proporção
  if (ratio) {
    if (verticalOnly.includes(placementId) && ratio !== "9:16" && ratio !== "4:5") {
      return {
        ratioAlert:  `⚠️ ${placementId} é vertical — proporcão ${ratio} causará barras ou cortes`,
        idealRatio:  "9:16",
      };
    }
    if (horizontalOnly.includes(placementId) && ratio !== "16:9" && ratio !== "1.91:1") {
      return {
        ratioAlert:  `⚠️ YouTube exige 16:9 horizontal — proporção ${ratio} não é ideal`,
        idealRatio:  "16:9",
      };
    }
    if (squarePreferred.includes(placementId) && ratio === "9:16") {
      return {
        ratioAlert:  `💡 ${placementId} prefere 4:5 ou 1:1 — 9:16 será cortado no topo/base`,
        idealRatio:  "4:5",
      };
    }
  }

  // Aviso de proporção vertical recomendada (sem blocking)
  if (verticalOnly.includes(placementId)) {
    return { warning: `Recomendamos formato vertical 9:16 para melhor performance` };
  }

  return {};
}

// ── v2: Helper para obter spec de placement ───────────────────────────────
export function getPlacementById(id: string): Placement | undefined {
  for (const group of PLACEMENT_GROUPS) {
    const found = group.placements.find(p => p.id === id);
    if (found) return found;
  }
  return undefined;
}

// ── v2: Verifica se placement é compatível com proporção ─────────────────
export function isRatioCompatible(placementId: string, ratio: string): "ideal" | "accepted" | "blocked" | "unknown" {
  const placement = getPlacementById(placementId);
  if (!placement) return "unknown";
  if (placement.idealRatios?.includes(ratio))   return "ideal";
  if (placement.blockedRatios?.includes(ratio))  return "blocked";
  return "accepted";
}
