// ─── PLACEMENT CONFIG ────────────────────────────────────────────────────────
// Estrutura escalável de placements por plataforma
// Para adicionar novos placements: apenas adicionar aqui, sem refatoração
// ─────────────────────────────────────────────────────────────────────────────

export type PlacementMode = "auto" | "manual";

export interface Placement {
  id:          string;
  label:       string;
  icon:        string;
  format:      ("image" | "video" | "both")[];
  orientation?: ("vertical" | "horizontal" | "square")[];
  tooltip:     string;
  recommended?: boolean;
}

export interface PlacementGroup {
  platform:   string;
  label:      string;
  icon:       string;
  color:      string;
  placements: Placement[];
}

export const PLACEMENT_GROUPS: PlacementGroup[] = [
  {
    platform: "facebook",
    label:    "Facebook",
    icon:     "📘",
    color:    "#1877f2",
    placements: [
      { id: "fb_feed",         label: "Feed",           icon: "🏠", format: ["image","video","both"], tooltip: "Aparece no feed principal do Facebook. Aceita imagem e vídeo.", recommended: true },
      { id: "fb_story",        label: "Story",          icon: "⬆️", format: ["image","video","both"], orientation: ["vertical"], tooltip: "Stories do Facebook. Recomendamos formato vertical 9:16." },
      { id: "fb_reels",        label: "Reels",          icon: "🎬", format: ["video"],               orientation: ["vertical"], tooltip: "Reels do Facebook. Exige vídeo vertical 9:16." },
      { id: "fb_instream",     label: "In-Stream",      icon: "▶️", format: ["video"],               tooltip: "Anúncio exibido dentro de vídeos. Exige vídeo de no mínimo 5 segundos." },
      { id: "fb_marketplace",  label: "Marketplace",    icon: "🛒", format: ["image","both"],        tooltip: "Aparece no Marketplace do Facebook. Ideal para produtos." },
      { id: "fb_search",       label: "Search",         icon: "🔍", format: ["image","both"],        tooltip: "Resultados de busca do Facebook." },
      { id: "fb_right_column", label: "Right Column",   icon: "📰", format: ["image"],               tooltip: "Coluna lateral do Facebook (desktop). Apenas imagem." },
      { id: "fb_audience_net", label: "Audience Net.",  icon: "🌐", format: ["image","video","both"], tooltip: "Rede de aplicativos parceiros do Facebook." },
    ],
  },
  {
    platform: "instagram",
    label:    "Instagram",
    icon:     "📸",
    color:    "#e1306c",
    placements: [
      { id: "ig_feed",    label: "Feed",       icon: "🏠", format: ["image","video","both"], tooltip: "Feed principal do Instagram. Aceita imagem e vídeo.", recommended: true },
      { id: "ig_story",   label: "Story",      icon: "⬆️", format: ["image","video","both"], orientation: ["vertical"], tooltip: "Stories do Instagram. Recomendamos formato vertical 9:16." },
      { id: "ig_reels",   label: "Reels",      icon: "🎬", format: ["video"],               orientation: ["vertical"], tooltip: "Reels do Instagram. Exige vídeo vertical 9:16.", recommended: true },
      { id: "ig_explore", label: "Explore",    icon: "🔍", format: ["image","video","both"], tooltip: "Aba Explorar do Instagram. Alto alcance para novos públicos." },
      { id: "ig_shop",    label: "Shop",       icon: "🛍️", format: ["image","both"],        tooltip: "Aba de compras do Instagram. Ideal para e-commerce." },
    ],
  },
  {
    platform: "tiktok",
    label:    "TikTok",
    icon:     "🎵",
    color:    "#010101",
    placements: [
      { id: "tt_feed",     label: "For You (Feed)", icon: "🏠", format: ["video"], orientation: ["vertical"], tooltip: "Feed principal do TikTok. Exige vídeo vertical 9:16.", recommended: true },
      { id: "tt_topview",  label: "TopView",        icon: "👑", format: ["video"], orientation: ["vertical"], tooltip: "Primeiro anúncio que o usuário vê ao abrir o app. Alta visibilidade." },
      { id: "tt_infeed",   label: "In-Feed Ads",    icon: "📱", format: ["video"], orientation: ["vertical"], tooltip: "Aparece entre os vídeos do feed. Nativo e menos intrusivo." },
      { id: "tt_spark",    label: "Spark Ads",      icon: "⚡", format: ["video"], orientation: ["vertical"], tooltip: "Impulsiona conteúdo orgânico existente do TikTok." },
    ],
  },
  {
    platform: "google",
    label:    "Google",
    icon:     "🔍",
    color:    "#4285f4",
    placements: [
      { id: "g_search",    label: "Search",           icon: "🔍", format: ["both"], tooltip: "Anúncios de texto nos resultados de busca do Google.", recommended: true },
      { id: "g_display",   label: "Display",          icon: "🖼️", format: ["image","both"], tooltip: "Banners em sites parceiros da Rede de Display do Google." },
      { id: "g_yt_stream", label: "YouTube In-stream", icon: "▶️", format: ["video"], tooltip: "Antes/durante vídeos no YouTube. Pode ser pulável ou não pulável." },
      { id: "g_yt_shorts", label: "YouTube Shorts",   icon: "🎬", format: ["video"], orientation: ["vertical"], tooltip: "Shorts do YouTube. Exige vídeo vertical 9:16." },
      { id: "g_discovery", label: "Discovery",        icon: "💡", format: ["image","both"], tooltip: "Feed do YouTube, Gmail e Discover. Alto alcance." },
    ],
  },
];

// Placements recomendados por objetivo de campanha
export const AUTO_PLACEMENTS: Record<string, string[]> = {
  leads:      ["fb_feed", "ig_feed", "ig_story", "fb_story"],
  traffic:    ["fb_feed", "ig_feed", "g_search", "g_display"],
  sales:      ["fb_feed", "ig_feed", "ig_shop", "g_search"],
  engagement: ["fb_feed", "ig_feed", "ig_reels", "fb_reels"],
  awareness:  ["fb_feed", "ig_feed", "ig_story", "fb_story", "g_display"],
  video:      ["ig_reels", "fb_reels", "tt_feed", "g_yt_stream"],
};

// Placements recomendados por plataforma de campanha
export const PLATFORM_PLACEMENTS: Record<string, string[]> = {
  meta:    ["fb_feed", "ig_feed", "ig_story", "fb_story", "ig_reels"],
  google:  ["g_search", "g_display", "g_yt_stream"],
  tiktok:  ["tt_feed", "tt_infeed"],
  both:    ["fb_feed", "ig_feed", "ig_story", "g_search", "g_display"],
  all:     ["fb_feed", "ig_feed", "ig_reels", "tt_feed", "g_search"],
};

// Validações por placement
export interface PlacementValidation {
  warning?: string;
  requiresVideo?: boolean;
  requiresVertical?: boolean;
}

export function validatePlacement(placementId: string, hasVideo: boolean): PlacementValidation {
  const videoOnly = ["fb_reels","ig_reels","fb_instream","tt_feed","tt_topview","tt_infeed","tt_spark","g_yt_stream","g_yt_shorts"];
  const verticalRec = ["ig_story","fb_story","ig_reels","fb_reels","tt_feed","tt_topview","tt_infeed","tt_spark","g_yt_shorts"];

  if (videoOnly.includes(placementId) && !hasVideo) {
    const labels: Record<string,string> = {
      fb_reels: "Reels", ig_reels: "Reels", fb_instream: "In-Stream",
      tt_feed: "TikTok Feed", tt_topview: "TopView", tt_infeed: "In-Feed",
      tt_spark: "Spark Ads", g_yt_stream: "YouTube In-stream", g_yt_shorts: "YouTube Shorts",
    };
    return { warning: `${labels[placementId] || placementId} exige vídeo`, requiresVideo: true };
  }
  if (verticalRec.includes(placementId)) {
    return { warning: "Recomendamos vídeo/imagem vertical 9:16 para melhor performance" };
  }
  return {};
}
