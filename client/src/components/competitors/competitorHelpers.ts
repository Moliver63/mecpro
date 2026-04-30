// competitorHelpers.ts — Funções utilitárias puras (sem React)
// Extraídas de CompetitorAnalysis.tsx para reutilização e testabilidade

export function extractPageId(url: string): string | null {
  const m = url.match(/view_all_page_id=(\d+)/);
  if (m) return m[1];
  const m2 = url.match(/facebook\.com\/([^/?]+)/);
  if (m2 && !["ads","pages","watch","groups"].includes(m2[1])) return m2[1];
  return null;
}
export function parseAdsLibraryUrl(url: string) {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    return { pageId: p.get("view_all_page_id") || extractPageId(url), activeOnly: p.get("active_status") === "active", country: p.get("country") || "BR" };
  } catch { return null; }
}
export function buildAdsLibraryUrl(q: string, country = "BR") {
  const isNumeric = /^\d+$/.test(q.trim());
  const base = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&media_type=all&sort_data[direction]=desc&sort_data[mode]=total_impressions&is_targeted_country=false`;
  return isNumeric ? base + `&search_type=page&view_all_page_id=${q.trim()}` : base + `&search_type=keyword_unordered&q=${encodeURIComponent(q.trim())}`;
}
export function extractIgHandle(input: string): string {
  const m = input.match(/instagram\.com\/([^/?]+)/);
  if (m) return "@" + m[1];
  return input.startsWith("@") ? input : "@" + input;
}
export function formatDate(d: any): string {
  if (!d) return "?";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}
export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard?.writeText(text) ?? Promise.resolve();
}

// ─── Source badge ─────────────────────────────────────────────────────────────
export function sourceBadge(source?: string) {
  if (!source || source === "unknown")    return { label: "⚠️ Estimado",            color: "#92400e", bg: "#fef3c7", isEstimated: true,  layer: 7 };
  if (source === "estimated")             return { label: "⚠️ Estimado",            color: "#92400e", bg: "#fef3c7", isEstimated: true,  layer: 7 };
  if (source === "estimated_ai")          return { label: "🤖 IA Estimado",         color: "#6d28d9", bg: "#ede9fe", isEstimated: true,  layer: 7 };
  if (source === "meta_ads_archive")      return { label: "◎ Meta API Oficial",    color: "#166534", bg: "#dcfce7", isEstimated: false, layer: 1 };
  if (source === "meta_page_posts")       return { label: "📄 Posts da Página",      color: "#1877f2", bg: "#e8f0fe", isEstimated: false, layer: 3 };
  if (source === "ads_library_public" || source === "ads_library_public_regex")
                                          return { label: "🔎 Ads Library",         color: "#1e40af", bg: "#dbeafe", isEstimated: false, layer: 2 };
  if (source === "meta_api" || source === "meta")
                                          return { label: "📡 Meta",                color: "#1877f2", bg: "#e8f0fe", isEstimated: false, layer: 2 };
  if (source === "scraping")              return { label: "🕷️ Scraping",            color: "#92400e", bg: "#fef3c7", isEstimated: false, layer: 3 };
  if (source === "instagram_search")      return { label: "📸 Instagram",           color: "#7c3aed", bg: "#f5f3ff", isEstimated: false, layer: 4 };
  if (source === "website_scraping")      return { label: "🌐 Site do Concorrente", color: "#0e7490", bg: "#e0f2fe", isEstimated: false, layer: 5 };
  if (source === "seo_analysis")          return { label: "🔍 Análise SEO/IA",      color: "#7c3aed", bg: "#ede9fe", isEstimated: false, layer: 6 };
  return { label: "⚠️ Estimado", color: "#92400e", bg: "#fef3c7", isEstimated: true, layer: 7 };
}

// ─── Cascata de 7 camadas ────────────────────────────────────────────────────
export const CASCADE_LAYERS = [
  { n: 1, icon: "🏛️",  label: "Meta Ads API Oficial",       desc: "Token OAuth com permissão ads_read",      color: "#166534", bg: "#dcfce7" },
  { n: 2, icon: "🔎",  label: "HF Proxy → Ads Library",     desc: "Proxy reverso no HuggingFace Space",      color: "#1e40af", bg: "#dbeafe" },
  { n: 3, icon: "📡",  label: "Ads Library Direta",          desc: "Chamada direta pelo servidor Render",     color: "#1e40af", bg: "#e8f0fe" },
  { n: 4, icon: "📸",  label: "Instagram / Busca por Nome",  desc: "Handle @instagram ou nome comercial",     color: "#7c3aed", bg: "#f5f3ff" },
  { n: 5, icon: "🌐",  label: "Web Scraping do Site",        desc: "Extrai copy, CTAs e headlines do site",   color: "#0e7490", bg: "#e0f2fe" },
  { n: 6, icon: "🔍",  label: "Análise SEO/IA (Gemini)",     desc: "IA infere anúncios via posicionamento",   color: "#7c3aed", bg: "#ede9fe" },
  { n: 7, icon: "🤖",  label: "Mock por Nicho",              desc: "Anúncios de referência do nicho",         color: "#92400e", bg: "#fef3c7" },
];

export function detectLayer(ads: any[]): number {
  const sources = ads.map((a: any) => a.source || "unknown");
  if (sources.some((s: string) => s === "meta_ads_archive"))          return 1;
  if (sources.some((s: string) => s.startsWith("ads_library")))       return 2;
  if (sources.some((s: string) => s === "meta_api" || s === "meta"))  return 3;
  if (sources.some((s: string) => s === "instagram_search" || s === "scraping")) return 4;
  if (sources.some((s: string) => s === "website_scraping"))          return 5;
  if (sources.some((s: string) => s === "seo_analysis"))              return 6;
  return 7;
}

type AddMode = "url" | "name" | "instagram";
type AdTab   = "ativos" | "todos" | "insights" | "cascade";
type AdFilter = "todos" | "image" | "video" | "carousel";

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: CASCATA VISUAL EM TEMPO REAL
// ─────────────────────────────────────────────────────────────────────────────
