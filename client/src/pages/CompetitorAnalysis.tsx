import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { ClientAdsCollector } from "@/components/ClientAdsCollector";
import { usePlanLimit } from "@/hooks/usePlanLimit";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { toast } from "sonner";
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function extractPageId(url: string): string | null {
  const m = url.match(/view_all_page_id=(\d+)/);
  if (m) return m[1];
  const m2 = url.match(/facebook\.com\/([^/?]+)/);
  if (m2 && !["ads","pages","watch","groups"].includes(m2[1])) return m2[1];
  return null;
}
function parseAdsLibraryUrl(url: string) {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    return { pageId: p.get("view_all_page_id") || extractPageId(url), activeOnly: p.get("active_status") === "active", country: p.get("country") || "BR" };
  } catch { return null; }
}
function buildAdsLibraryUrl(q: string, country = "BR") {
  const isNumeric = /^\d+$/.test(q.trim());
  const base = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&media_type=all&sort_data[direction]=desc&sort_data[mode]=total_impressions&is_targeted_country=false`;
  return isNumeric ? base + `&search_type=page&view_all_page_id=${q.trim()}` : base + `&search_type=keyword_unordered&q=${encodeURIComponent(q.trim())}`;
}
function extractIgHandle(input: string): string {
  const m = input.match(/instagram\.com\/([^/?]+)/);
  if (m) return "@" + m[1];
  return input.startsWith("@") ? input : "@" + input;
}
function formatDate(d: any): string {
  if (!d) return "?";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}
function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard?.writeText(text) ?? Promise.resolve();
}

// ─── Source badge ─────────────────────────────────────────────────────────────
function sourceBadge(source?: string) {
  if (!source || source === "unknown")    return { label: "⚠️ Estimado",            color: "#92400e", bg: "#fef3c7", isEstimated: true,  layer: 7 };
  if (source === "estimated")             return { label: "⚠️ Estimado",            color: "#92400e", bg: "#fef3c7", isEstimated: true,  layer: 7 };
  if (source === "estimated_ai")          return { label: "🤖 IA Estimado",         color: "#6d28d9", bg: "#ede9fe", isEstimated: true,  layer: 7 };
  if (source === "meta_ads_archive")      return { label: "◎ Meta API Oficial",    color: "#166534", bg: "#dcfce7", isEstimated: false, layer: 1 };
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
const CASCADE_LAYERS = [
  { n: 1, icon: "🏛️",  label: "Meta Ads API Oficial",       desc: "Token OAuth com permissão ads_read",      color: "#166534", bg: "#dcfce7" },
  { n: 2, icon: "🔎",  label: "HF Proxy → Ads Library",     desc: "Proxy reverso no HuggingFace Space",      color: "#1e40af", bg: "#dbeafe" },
  { n: 3, icon: "📡",  label: "Ads Library Direta",          desc: "Chamada direta pelo servidor Render",     color: "#1e40af", bg: "#e8f0fe" },
  { n: 4, icon: "📸",  label: "Instagram / Busca por Nome",  desc: "Handle @instagram ou nome comercial",     color: "#7c3aed", bg: "#f5f3ff" },
  { n: 5, icon: "🌐",  label: "Web Scraping do Site",        desc: "Extrai copy, CTAs e headlines do site",   color: "#0e7490", bg: "#e0f2fe" },
  { n: 6, icon: "🔍",  label: "Análise SEO/IA (Gemini)",     desc: "IA infere anúncios via posicionamento",   color: "#7c3aed", bg: "#ede9fe" },
  { n: 7, icon: "🤖",  label: "Mock por Nicho",              desc: "Anúncios de referência do nicho",         color: "#92400e", bg: "#fef3c7" },
];

function detectLayer(ads: any[]): number {
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
function CascadeStatus({ analyzing, successLayer, hasAds }: {
  analyzing: boolean;
  successLayer: number | null;
  hasAds: boolean;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (analyzing) {
      setCurrentStep(1);
      let step = 1;
      timerRef.current = setInterval(() => {
        step++;
        if (step <= 7) setCurrentStep(step);
        else clearInterval(timerRef.current);
      }, 2600);
    } else {
      clearInterval(timerRef.current);
      if (successLayer) setCurrentStep(successLayer);
    }
    return () => clearInterval(timerRef.current);
  }, [analyzing, successLayer]);

  if (!analyzing && !hasAds && successLayer === null) return null;

  const qualityMap: Record<number, { pct: number; label: string; color: string; desc: string }> = {
    1: { pct: 100, label: "Dados 100% reais",      color: "#16a34a", desc: "Meta API Oficial" },
    2: { pct: 90,  label: "Dados 90% reais",       color: "#2563eb", desc: "Ads Library pública" },
    3: { pct: 75,  label: "Dados 75% reais",       color: "#2563eb", desc: "Ads Library direta" },
    4: { pct: 60,  label: "Dados 60% reais",       color: "#7c3aed", desc: "Instagram / Nome" },
    5: { pct: 50,  label: "Dados 50% reais",       color: "#0e7490", desc: "Site do concorrente" },
    6: { pct: 30,  label: "Dados 30% estimados",   color: "#7c3aed", desc: "Análise SEO com IA" },
    7: { pct: 10,  label: "Dados 10% estimados",   color: "#b45309", desc: "Referência do nicho" },
  };

  const layer   = successLayer || (analyzing ? currentStep : 7);
  const quality = qualityMap[layer] || qualityMap[7];
  const animPct = analyzing ? Math.round((currentStep / 7) * 100) : quality.pct;
  const isGood  = quality.pct >= 50;

  const analyzingPhrases = [
    "Conectando à Meta API...", "Verificando Ads Library...", "Tentando acesso direto...",
    "Buscando pelo Instagram...", "Analisando o site...", "Análise com IA em andamento...", "Gerando referências do nicho...",
  ];
  const phrase = analyzing ? (analyzingPhrases[currentStep - 1] || "Analisando...") : quality.desc;

  return (
    <div style={{
      background: "white", border: `1.5px solid ${analyzing ? "var(--green)" : quality.color}22`,
      borderRadius: 16, padding: 20, marginBottom: 20, transition: "border-color .5s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: analyzing ? "var(--green-l)" : isGood ? "#f0fdf4" : "#fef3c7",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            animation: analyzing ? "pulse 1.5s infinite" : "none",
          }}>
            {analyzing ? "⏳" : isGood ? "◎" : "◬"}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>
              {analyzing ? "Analisando concorrente..." : quality.label}
            </p>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{phrase}</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1, color: analyzing ? "var(--green)" : quality.color, fontFamily: "var(--font-display)" }}>
            {analyzing ? `${animPct}%` : `${quality.pct}%`}
          </p>
          <p style={{ fontSize: 10, color: "var(--muted)", margin: 0, fontWeight: 600 }}>qualidade</p>
        </div>
      </div>
      <div style={{ height: 10, background: "#f1f5f9", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
        <div style={{
          height: "100%", borderRadius: 99,
          width: `${analyzing ? animPct : quality.pct}%`,
          background: analyzing ? "linear-gradient(90deg, var(--green), #34d399)"
            : quality.pct >= 75 ? "linear-gradient(90deg, #16a34a, #4ade80)"
            : quality.pct >= 40 ? "linear-gradient(90deg, #2563eb, #60a5fa)"
            : "linear-gradient(90deg, #b45309, #fbbf24)",
          transition: "width 1s ease, background 0.5s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        {[{ pct: 10, label: "Estimado" }, { pct: 50, label: "Parcial" }, { pct: 75, label: "Real" }, { pct: 100, label: "Oficial" }].map(seg => (
          <div key={seg.pct} style={{ textAlign: "center" }}>
            <p style={{ fontSize: 9, fontWeight: 700, margin: 0, color: (!analyzing && quality.pct >= seg.pct) ? quality.color : "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{seg.label}</p>
          </div>
        ))}
      </div>
      {!analyzing && quality.pct < 75 && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8 }}>
          <p style={{ fontSize: 11, color: "#713f12", margin: 0, lineHeight: 1.5 }}>
            💡 <strong>Para aumentar a qualidade:</strong>{" "}
            {quality.pct <= 10 ? "Adicione o site ou Instagram do concorrente"
              : quality.pct <= 30 ? "Adicione o Instagram ou site para análise mais precisa"
              : quality.pct <= 60 ? "Cadastre o Page ID do Facebook para dados reais"
              : "Solicite permissão Ads Library API no Facebook"}
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MODAL DE DETALHE DO ANÚNCIO
// ─────────────────────────────────────────────────────────────────────────────

// ── Gera URL pública para validar/visualizar o anúncio original ─────────────
function buildAdVerifyUrl(ad: any): { url: string; label: string; icon: string } | null {
  try {
    const raw   = JSON.parse(ad.rawData || "{}");
    const src   = ad.source || raw.source || "";

    // 1. Meta Ads Archive — snapshot oficial
    if (raw.snapshotUrl) return { url: raw.snapshotUrl, label: "Ver na Meta Ads Library", icon: "🔵" };

    // 2. adId real do Meta (não prefixados com estimated_, seo_, ws_, etc.)
    if (ad.adId && /^\d{10,}$/.test(ad.adId))
      return { url: `https://www.facebook.com/ads/library/?id=${ad.adId}`, label: "Ver na Meta Ads Library", icon: "🔵" };

    // 3. TikTok — id numérico
    if (src === "tiktok" || src?.startsWith("tiktok")) {
      if (ad.adId && /^\d+$/.test(ad.adId))
        return { url: `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?adId=${ad.adId}`, label: "Ver no TikTok Creative Center", icon: "🎵" };
    }

    // 4. Google Ads Transparency
    if (src === "google" || src?.startsWith("google")) {
      const query = ad.headline || raw.advertiserName || "";
      if (query) return { url: `https://adstransparency.google.com/?region=BR&query=${encodeURIComponent(query)}`, label: "Ver no Google Transparency", icon: "🔍" };
    }

    // 5. Fallback: busca genérica na Meta Ads Library pelo nome do anúncio
    if (ad.headline && !src.includes("estimated") && !src.includes("seo_") && !src.includes("ws_")) {
      return { url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(ad.headline)}&search_type=keyword_unordered`, label: "Buscar na Meta Ads Library", icon: "🔎" };
    }
  } catch {}
  return null;
}

function AdDetailModal({ ad, onClose }: { ad: any; onClose: () => void }) {
  const badge = sourceBadge(ad.source);
  const [copied, setCopied] = useState(false);

  const fullText = [
    ad.headline && `**Headline:** ${ad.headline}`,
    ad.bodyText  && `**Copy:** ${ad.bodyText}`,
    ad.cta       && `**CTA:** ${ad.cta}`,
    ad.adType    && `**Formato:** ${ad.adType}`,
  ].filter(Boolean).join("\n\n");

  async function handleCopy() {
    await copyToClipboard(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "white", borderRadius: 20, padding: 28, maxWidth: 560, width: "100%",
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,.4)",
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: badge.bg, color: badge.color, marginBottom: 8, display: "inline-block" }}>
              {badge.label}
            </span>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", margin: 0 }}>
              {ad.headline || "Sem headline"}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted)", padding: "0 4px" }}>✕</button>
        </div>

        {/* Formato + Status + Data */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "var(--off)", color: "var(--muted)" }}>
            {ad.adType === "video" ? "🎬" : ad.adType === "carousel" ? "🎠" : "🖼️"} {(ad.adType || "image").toUpperCase()}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: ad.isActive ? "#dcfce7" : "#fee2e2", color: ad.isActive ? "#166534" : "#dc2626" }}>
            {ad.isActive ? "● ATIVO" : "○ Inativo"}
          </span>
          {ad.startDate && (
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "var(--off)", color: "var(--muted)" }}>
              📅 Desde {formatDate(ad.startDate)}
            </span>
          )}
        </div>

        {/* Copy / Body */}
        {ad.bodyText && (
          <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>📝 Texto do anúncio</p>
            <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{ad.bodyText}</p>
          </div>
        )}

        {/* CTA */}
        {ad.cta && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>👆</span>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", margin: 0, marginBottom: 2 }}>CTA</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8", margin: 0 }}>{ad.cta}</p>
            </div>
          </div>
        )}

        {/* Landing page */}
        {ad.landingPageUrl && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>🔗 Landing Page</p>
            <a href={ad.landingPageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--green-d)", wordBreak: "break-all" }}>{ad.landingPageUrl}</a>
          </div>
        )}

        {/* Imagem/Vídeo */}
        {ad.imageUrl && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>🖼️ Criativo</p>
            <img src={ad.imageUrl} alt="Ad creative" style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid var(--border)" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        )}

        {/* Verificação — link para ver o anúncio real */}
        {(() => {
          const verify = buildAdVerifyUrl(ad);
          const isEstimated = (ad.source||"").includes("estimated") || (ad.source||"").includes("seo_") || (ad.source||"").includes("ws_");
          if (isEstimated) return (
            <div style={{ background:"#fef9c3", border:"1px solid #fde68a", borderRadius:10, padding:"8px 12px", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
              <span>◬</span>
              <p style={{ margin:0, fontSize:11, color:"#92400e" }}>
                <strong>Anúncio estimado por IA</strong> — não é um anúncio real coletado. Fonte: {ad.source || "estimado"}
              </p>
            </div>
          );
          if (verify) return (
            <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, padding:"8px 12px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:16 }}>◎</span>
                <div>
                  <p style={{ margin:0, fontSize:11, fontWeight:700, color:"#15803d" }}>Anúncio verificável</p>
                  <p style={{ margin:0, fontSize:10, color:"#166534" }}>Clique para confirmar que este anúncio existe</p>
                </div>
              </div>
              <a href={verify.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize:11, fontWeight:700, color:"white", background:"#16a34a", padding:"6px 12px", borderRadius:8, textDecoration:"none", flexShrink:0 }}>
                {verify.icon} {verify.label} ↗
              </a>
            </div>
          );
          return null;
        })()}

        {/* Ações */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-sm btn-green" onClick={handleCopy} style={{ flex: 1, justifyContent: "center" }}>
            {copied ? "◎ Copiado!" : "📋 Copiar texto"}
          </button>
          {ad.landingPageUrl && (
            <a href={ad.landingPageUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost" style={{ fontSize: 12 }}>
              🔗 Abrir landing page
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: CARD DO ANÚNCIO
// ─────────────────────────────────────────────────────────────────────────────
function AdCard({ ad, onClick }: { ad: any; onClick: () => any; [key: string]: any }) {
  const badge = sourceBadge(ad.source);
  const formatIcon = ad.adType === "video" ? "🎬" : ad.adType === "carousel" ? "🎠" : "🖼️";

  return (
    <div onClick={onClick} style={{
      background: "white", border: "1px solid var(--border)", borderRadius: 12,
      padding: 14, cursor: "pointer", transition: "all .15s",
      borderLeft: `3px solid ${badge.color}`,
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "var(--off)", color: "var(--muted)" }}>
            {formatIcon} {(ad.adType || "image").toUpperCase()}
          </span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: ad.isActive ? "#dcfce7" : "#f1f5f9", color: ad.isActive ? "#166534" : "#94a3b8" }}>
          {ad.isActive ? "● ATIVO" : "○ Inativo"}
        </span>
      </div>

      {/* Headline */}
      {ad.headline && (
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 6, lineHeight: 1.4 }}>
          {ad.headline.length > 80 ? ad.headline.slice(0, 80) + "…" : ad.headline}
        </p>
      )}

      {/* Hook (dados da camada 6) */}
      {(() => {
        try {
          const raw = JSON.parse(ad.rawData || "{}");
          if (raw.hook) return (
            <p style={{ fontSize: 11, color: "#7c3aed", fontStyle: "italic", marginBottom: 6, lineHeight: 1.4 }}>
              🎣 "{raw.hook}"
            </p>
          );
        } catch {}
        return null;
      })()}

      {/* Body preview */}
      {ad.bodyText && (
        <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>
          {ad.bodyText.length > 120 ? ad.bodyText.slice(0, 120) + "…" : ad.bodyText}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {ad.cta && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
              👆 {ad.cta}
            </span>
          )}
          {/* Badge verificável */}
          {(() => {
            const v = buildAdVerifyUrl(ad);
            const isEst = (ad.source||"").includes("estimated") || (ad.source||"").includes("seo_");
            if (isEst) return <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:10, background:"#fef9c3", color:"#92400e" }}>⚠️ Estimado</span>;
            if (v) return (
              <a href={v.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:10, background:"#f0fdf4", color:"#15803d", border:"1px solid #86efac", textDecoration:"none" }}>
                {v.icon} Verificar ↗
              </a>
            );
            return null;
          })()}
          {(() => {
            try {
              const raw = JSON.parse(ad.rawData || "{}");
              if (raw.funnelStage) return (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                  background: raw.funnelStage === "TOF" ? "#f0fdf4" : raw.funnelStage === "MOF" ? "#fef3c7" : "#fee2e2",
                  color: raw.funnelStage === "TOF" ? "#166534" : raw.funnelStage === "MOF" ? "#92400e" : "#dc2626" }}>
                  {raw.funnelStage}
                </span>
              );
            } catch {}
            return null;
          })()}
        </div>
        {ad.startDate && <span style={{ fontSize: 10, color: "var(--muted)" }}>📅 {formatDate(ad.startDate)}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: FORMULÁRIO DE ADIÇÃO
// ─────────────────────────────────────────────────────────────────────────────
interface AddFormProps { projectId: number; onDone: () => void; }

function AddCompetitorForm({ projectId, onDone }: AddFormProps) {
  const [saveError, setSaveError] = useState<string>("");
  const createComp = trpc.competitors.create.useMutation({
    onSuccess: () => {
      setSaveError("");
      toast.success("◎ Concorrente adicionado!");
      onDone();
    },
    onError: (e) => {
      const raw = e.message || "";
      const msg =
        raw.includes("FORBIDDEN")    ? "Limite do plano atingido — faça upgrade" :
        raw.includes("url")          ? "URL do site inválida — use https://..." :
        raw.includes("zodError")     ? "Verifique os campos obrigatórios" :
        raw.includes("Name")         ? "Nome obrigatório" :
        raw.includes("DB")           ? "Erro de banco de dados — tente novamente" :
        "Erro ao salvar — tente novamente";
      setSaveError(msg);
      toast.error("✕ " + msg);
    },
  });
  const [mode, setMode]         = useState<AddMode>("url");
  const [name, setName]         = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [nameQ, setNameQ]       = useState("");
  const [igInput, setIgInput]   = useState("");  // modo Instagram (localização)
  const [igSocial, setIgSocial] = useState("");  // campo Instagram das redes sociais
  const [discoveredPageId, setDiscoveredPageId] = useState<string>("");

  const discoverPageIdMutation = (trpc as any).competitors?.discoverPageId?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.found && data?.pageId) {
        setDiscoveredPageId(data.pageId);
        const methodLabel: Record<string, string> = {
          graph_direct_handle:  "Graph API",
          ig_oembed_fb_page:    "Instagram oEmbed",
          ads_library:          "Ads Library",
          my_pages_exact:       "Suas páginas",
          graph_pages_search:   "Busca de páginas",
          graph_slug_var:       "Graph API (variação)",
          gemini:               "IA",
        };
        const via = methodLabel[data.method] || data.method || "auto";
        const conf = data.confidence === "medium" ? " (confiança média — confirme o nome)" : "";
        toast.success(`◎ Page ID encontrado via ${via}: ${data.pageId}${data.pageName ? " — " + data.pageName : ""}${conf}`);
      } else {
        toast.error("✕ Page ID não encontrado automaticamente. Dica: tente usar o nome exato da Página do Facebook (ex: 'Triadi Imóveis') em vez do @instagram.");
      }
    },
    onError: () => toast.error("✕ Erro ao buscar Page ID. Verifique se a integração Meta está ativa."),
  }) ?? { mutate: () => {}, isPending: false };
  const [country, setCountry]   = useState("BR");
  const [website,      setWebsite]      = useState("");
  const [tiktokInput,  setTiktokInput]  = useState("");
  const [googleInput,  setGoogleInput]  = useState("");

  // Verificação de limite de plano
  const { canCreateCompetitor, planName } = usePlanLimit();
  const { data: existingComps } = trpc.competitors.list.useQuery({ projectId });
  const compCount = (existingComps as any[])?.length ?? 0;
  const planCheck = canCreateCompetitor(compCount);

  const urlInfo  = urlInput ? parseAdsLibraryUrl(urlInput) : null;
  const urlValid = !!urlInfo?.pageId;
  const previewUrl =
    mode === "name"      && nameQ.trim()   ? buildAdsLibraryUrl(nameQ, country) :
    mode === "instagram" && igInput.trim() ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(extractIgHandle(igInput))}&search_type=keyword_unordered` :
    null;

  const hasInput = mode === "url" ? !!urlInput : mode === "name" ? !!nameQ.trim() : !!igInput.trim();
  const canSave  = !!name.trim() && hasInput && planCheck.allowed;

  async function handleAdd() {
    if (!canSave) return;
    if (!planCheck.allowed) return;
    let adsUrl = "", pageId: string | null = null;
    if (mode === "url")       { adsUrl = urlInput; pageId = urlInfo?.pageId || null; }
    else if (mode === "name") { adsUrl = buildAdsLibraryUrl(nameQ, country); }
    else                      { adsUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(extractIgHandle(igInput))}&search_type=keyword_unordered`; }

    await createComp.mutateAsync({
      projectId, name: name.trim(),
      websiteUrl:      website.trim()             || undefined,
      facebookPageUrl: adsUrl                     || undefined,
      facebookPageId:  pageId || discoveredPageId || undefined,
      instagramUrl:    mode === "instagram" ? igInput : (igSocial.trim() || undefined),
      tiktokUrl:       tiktokInput.trim()         || undefined,
      googleAdsQuery:  googleInput.trim()         || undefined,
    });
  }

  return (
    <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 18, padding: 24, height: "fit-content" }}>
      {/* Alerta de limite de plano */}
      {!planCheck.allowed && (
        <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
          <p style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:4 }}>⚠️ Limite do plano {planName}</p>
          <p style={{ fontSize:12, color:"#b45309", marginBottom:8 }}>{planCheck.reason}</p>
          <a href="/pricing" style={{ fontSize:12, fontWeight:700, color:"#d97706" }}>Fazer upgrade →</a>
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>① Nome do concorrente *</label>
        <input className="input" placeholder="Ex: Nike Brasil, Empresa XYZ…" value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", fontSize: 14 }} autoFocus />
      </div>

      {/* Modo de localização */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>② Como localizar os anúncios</label>
        <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 14 }}>
          {([
            { key: "url", icon: "🔗", label: "URL Ads Library" },
            { key: "name", icon: "🔎", label: "Nome / ID" },
            { key: "instagram", icon: "📸", label: "Instagram" },
          ] as { key: AddMode; icon: string; label: string }[]).map((m, i) => (
            <button key={m.key} onClick={() => setMode(m.key)} style={{
              flex: 1, padding: "10px 6px", border: "none", cursor: "pointer",
              borderLeft: i > 0 ? "1px solid var(--border)" : "none",
              background: mode === m.key ? "var(--navy)" : "white",
              color: mode === m.key ? "white" : "var(--muted)",
              fontSize: 11, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {mode === "url" && (
          <div>
            <div style={{
              border: urlInput ? (urlValid ? "2px solid var(--green)" : "2px solid #f59e0b") : "2px dashed #94a3b8",
              borderRadius: 12, background: urlInput ? (urlValid ? "#f0fdf4" : "#fefce8") : "#f8fafc", padding: 14, marginBottom: 10,
            }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: urlInput ? (urlValid ? "var(--green-dk)" : "#92400e") : "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                {urlInput ? (urlValid ? "◎ URL válida — Page ID detectado" : "⚠️ Cole a URL completa da Ads Library") : "📋 Cole a URL da Ads Library aqui"}
              </p>
              <textarea rows={4} placeholder={"https://www.facebook.com/ads/library/?...&view_all_page_id=248724168983172..."} value={urlInput} onChange={e => setUrlInput(e.target.value)}
                style={{ width: "100%", resize: "none", border: "none", outline: "none", background: "transparent", fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, color: "var(--body)", boxSizing: "border-box" }} />
            </div>
            {urlValid && (
              <div style={{ display: "flex", gap: 12, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
                <span>Page ID: <strong>{urlInfo?.pageId}</strong></span>
                <span>País: <strong>{urlInfo?.country}</strong></span>
              </div>
            )}
            <div style={{ background: "var(--navy)", borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "white", marginBottom: 8 }}>📋 Como obter a URL:</p>
              {[
                { n: "1", t: "Acesse", link: "facebook.com/ads/library →", href: "https://www.facebook.com/ads/library" },
                { n: "2", t: "Pesquise o nome da empresa" },
                { n: "3", t: 'Clique em "Ver todos os anúncios"' },
                { n: "4", t: "Copie a URL e cole acima ↑" },
              ].map(s => (
                <div key={s.n} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(255,255,255,.15)", color: "white", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,.8)", margin: 0 }}>
                    {s.t} {s.href && <a href={s.href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green)", fontWeight: 700 }}>{s.link}</a>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "name" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input className="input" placeholder="Ex: Coca-Cola Brasil ou 248724168983172" value={nameQ} onChange={e => setNameQ(e.target.value)} style={{ width: "100%", paddingLeft: 36 }} />
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>🔎</span>
              </div>
              <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", cursor: "pointer" }}>
                <option value="BR">🇧🇷 BR</option>
                <option value="US">🇺🇸 US</option>
                <option value="PT">🇵🇹 PT</option>
                <option value="ALL">🌍 Todos</option>
              </select>
            </div>
            {previewUrl && (
              <div style={{ background: "var(--off)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>URL gerada:</p>
                <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--body)", wordBreak: "break-all", marginBottom: 8 }}>{previewUrl}</p>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "var(--green-d)", textDecoration: "none" }}>Verificar na Ads Library →</a>
              </div>
            )}
          </div>
        )}

        {mode === "instagram" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input className="input" placeholder="@empresa ou https://instagram.com/empresa" value={igInput} onChange={e => { setIgInput(e.target.value); setDiscoveredPageId(""); }} style={{ width: "100%", paddingLeft: 36 }} />
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>📸</span>
              </div>
              <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", cursor: "pointer" }}>
                <option value="BR">🇧🇷 BR</option>
                <option value="US">🇺🇸 US</option>
                <option value="PT">🇵🇹 PT</option>
              </select>
            </div>

            {/* Botão descobrir Page ID automaticamente */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <button
                onClick={() => {
                  if (!igInput.trim()) { toast.error("Digite o Instagram primeiro"); return; }
                  (discoverPageIdMutation as any).mutate({ instagramHandle: igInput, companyName: name });
                }}
                disabled={(discoverPageIdMutation as any).isPending || !igInput.trim()}
                style={{
                  background: (discoverPageIdMutation as any).isPending ? "#e2e8f0" : "#1877f2",
                  color: (discoverPageIdMutation as any).isPending ? "var(--muted)" : "white",
                  border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                  fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                }}>
                {(discoverPageIdMutation as any).isPending ? "⏳ Buscando Page ID..." : "🔍 Descobrir Page ID automaticamente"}
              </button>
              {discoveredPageId && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#15803d" }}>
                  ◎ Page ID: {discoveredPageId}
                </div>
              )}
            </div>

            <div style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 2 }}>ℹ️ Instagram + Meta Ads Library</p>
              <p style={{ fontSize: 11, color: "#6d28d9", lineHeight: 1.6 }}>
                Digite o @instagram e clique em "🔍 Descobrir Page ID" para encontrar automaticamente.
                Com o Page ID a análise usa dados reais da Meta Ads Library!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Site (opcional) */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>③ Site do concorrente <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional — enriquece análise)</span></label>
        <input className="input" placeholder="https://concorrente.com.br" value={website}
          onChange={e => {
            let v = e.target.value.trim();
            // Auto-adiciona https:// se usuário digitou sem
            if (v && !v.startsWith("http") && !v.startsWith("www.")) v = "https://" + v;
            else if (v && v.startsWith("www.")) v = "https://" + v;
            setWebsite(v || e.target.value);
          }}
          style={{ width: "100%" }} />
      </div>

      {/* Redes sociais adicionais */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>
          ④ Outras redes <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional — valida presença e melhora análise)</span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Instagram */}
          <div>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>📸</span>
              <input className="input" placeholder="@instagram ou URL" value={igSocial}
                onChange={e => setIgSocial(e.target.value)}
                style={{ width: "100%", paddingLeft: 32, fontSize: 13,
                  borderColor: igSocial ? "#a78bfa" : undefined }} />
            </div>
            {igSocial && (
              <InstagramVerifier
                handle={igSocial}
                onConfirm={h => setIgSocial(h)}
                onClear={() => setIgSocial("")}
              />
            )}
          </div>
          {/* TikTok */}
          <div>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🎵</span>
              <input className="input" placeholder="@tiktok ou URL do perfil" value={tiktokInput}
                onChange={e => setTiktokInput(e.target.value)}
                style={{ width: "100%", paddingLeft: 32, fontSize: 13,
                  borderColor: tiktokInput ? "#6b7280" : undefined }} />
            </div>
            {tiktokInput && (
              <TikTokVerifier
                handle={tiktokInput}
                onConfirm={h => setTiktokInput(h)}
                onClear={() => setTiktokInput("")}
              />
            )}
          </div>
          {/* Google */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
              <input className="input" placeholder="Termo de busca Google Ads (nome da empresa)" value={googleInput}
                onChange={e => setGoogleInput(e.target.value)}
                style={{ width: "100%", paddingLeft: 32, fontSize: 13 }} />
            </div>
            {googleInput && (
              <GoogleVerifier
                query={googleInput}
                onConfirm={q => setGoogleInput(q)}
                onClear={() => setGoogleInput("")}
              />
            )}
          </div>
        </div>
      </div>

      <button className="btn btn-lg btn-green" onClick={handleAdd} disabled={!canSave || createComp.isPending} style={{ width: "100%", justifyContent: "center" }}>
        {createComp.isPending ? "⏳ Salvando..." : !name.trim() ? "Preencha o nome" : !hasInput ? "Preencha como localizar" : "◎ Adicionar concorrente"}
      </button>
      {saveError && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8, textAlign: "center" }}>✕ {saveError}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: FORMULÁRIO DE EDIÇÃO INLINE
// ─────────────────────────────────────────────────────────────────────────────
function EditCompetitorForm({ comp, onDone, onCancel }: { comp: any; onDone: () => void; onCancel: () => void }) {
  const updateComp = trpc.competitors.update.useMutation({
    onSuccess: () => {
      toast.success("◎ Concorrente atualizado!");
      onDone();
    },
    onError: (e) => {
      const msg = e.message?.includes("url") ? "URL inválida — use https://..." : "Erro ao salvar";
      toast.error("✕ " + msg);
    },
  });
  const discoverPageId = (trpc as any).competitors?.discoverPageId?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.found && data?.pageId) {
        setPageId(data.pageId);
        toast.success(`◎ Page ID encontrado: ${data.pageId} (${data.pageName || "via " + data.method})`);
      } else {
        toast.error("✕ Não foi possível encontrar o Page ID automaticamente. Cadastre manualmente.");
      }
    },
    onError: () => toast.error("✕ Erro ao buscar Page ID."),
  }) ?? { mutate: () => {}, isPending: false };

  const [name, setName]             = useState(comp.name || "");
  const [pageId, setPageId]         = useState(comp.facebookPageId || "");
  const [pageUrl, setPageUrl]       = useState(comp.facebookPageUrl || "");
  const [igUrl, setIgUrl]           = useState(comp.instagramUrl || "");
  const [websiteUrl, setWebsiteUrl] = useState(comp.websiteUrl || "");
  const [notes, setNotes]           = useState(comp.notes || "");

  return (
    <div style={{ background: "#f8fafc", border: "2px solid var(--green)", borderRadius: 16, padding: 20, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)" }}>✏️ Editar: {comp.name}</p>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}>✕</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {[
          { label: "NOME *",          value: name,       set: setName,       placeholder: "Nome do concorrente" },
          { label: "URL ADS LIBRARY", value: pageUrl,    set: setPageUrl,    placeholder: "https://facebook.com/ads/library/..." },
          { label: "SITE",            value: websiteUrl, set: setWebsiteUrl, placeholder: "https://empresa.com.br" },
          { label: "NOTAS",           value: notes,      set: setNotes,      placeholder: "Observações…" },
        ].map(field => (
          <div key={field.label}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>{field.label}</label>
            <input className="input" value={field.value} onChange={e => field.set(e.target.value)} placeholder={field.placeholder} style={{ width: "100%", fontSize: 13 }} />
          </div>
        ))}

        {/* Facebook Page ID com botão de descoberta automática */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>
            FACEBOOK PAGE ID
            {pageId && <span style={{ marginLeft: 6, color: "#15803d", fontWeight: 600 }}>◎ Configurado</span>}
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="input" value={pageId} onChange={e => setPageId(e.target.value)}
              placeholder="248724168983172"
              style={{ flex: 1, fontSize: 13, borderColor: pageId ? "#86efac" : undefined }} />
            <button
              onClick={() => {
                const handle = igUrl || comp.name;
                if (!handle) { toast.error("Informe o Instagram primeiro"); return; }
                (discoverPageId as any).mutate({ instagramHandle: handle, companyName: comp.name });
              }}
              disabled={(discoverPageId as any).isPending}
              title="Descobrir Page ID automaticamente pelo Instagram"
              style={{
                background: (discoverPageId as any).isPending ? "#e2e8f0" : "#1877f2",
                color: (discoverPageId as any).isPending ? "var(--muted)" : "white",
                border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}>
              {(discoverPageId as any).isPending ? "⏳" : "🔍 Auto"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
            Clique em "🔍 Auto" para descobrir automaticamente pelo Instagram cadastrado
          </p>
        </div>

        {/* Instagram com verificador */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>INSTAGRAM</label>
          <input className="input" value={igUrl} onChange={e => setIgUrl(e.target.value)} placeholder="@handle ou URL"
            style={{ width: "100%", fontSize: 13, borderColor: igUrl ? "#a78bfa" : undefined }} />
          {igUrl && (
            <InstagramVerifier handle={igUrl} onConfirm={h => setIgUrl(h)} onClear={() => setIgUrl("")} />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm btn-green" onClick={() => updateComp.mutate({
          id: comp.id, name: name.trim(),
          facebookPageId: pageId || null, facebookPageUrl: pageUrl || null,
          instagramUrl: igUrl || null, websiteUrl: websiteUrl || null, notes: notes || null
        })} disabled={!name.trim() || updateComp.isPending} style={{ flex: 1, justifyContent: "center" }}>
          {updateComp.isPending ? "⏳ Salvando..." : "💾 Salvar alterações"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel} style={{ fontSize: 12 }}>Cancelar</button>
      </div>
      {updateComp.isError && (
        <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>
          ✕ {(updateComp.error as any)?.message?.includes("url") ? "URL inválida — use https://..." : "Erro ao salvar. Tente novamente."}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: RAIO-X (painel direito)
// ─────────────────────────────────────────────────────────────────────────────
interface RaioXProps { comp: any; onClose: () => void; onAnalyze: (id: number, force?: boolean) => void; analyzing: boolean; onEdit: () => void; projectId: number; onTikTokResult?: (data: any) => void; onRefetch?: () => void; }

function RaioX({ comp, onClose, onAnalyze, analyzing, onEdit, projectId, onTikTokResult, onRefetch }: RaioXProps) {
  const [adTab, setAdTab]           = useState<AdTab>("ativos");
  const [filter, setFilter]         = useState<AdFilter>("todos");
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [copyInsightsDone, setCopyInsightsDone] = useState(false);
  const [adsPage, setAdsPage]       = useState(1);
  const ADS_PER_PAGE = 12;

  // ── TikTok Intelligence — estados locais ao RaioX ──────────────────────────
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [tiktokResult,  setTiktokResult]  = useState<any>(null);

  const analyzeTikTokMut = trpc.competitors.analyzeTikTok.useMutation({
    onSuccess: (d) => {
      setTiktokResult(d);
      setTiktokLoading(false);
      onTikTokResult?.(d);  // propaga para o pai
      toast.success(`🎵 TikTok: ${(d as any).adsFound} anúncio(s) encontrado(s)!`);
    },
    onError: (e) => {
      setTiktokLoading(false);
      toast.error("Erro TikTok: " + e.message);
    },
  });

  const ads: any[]  = comp.scrapedAds || [];
  const adsAtivos   = ads.filter((a: any) => a.isActive === 1 || a.isActive === true);
  const adsTodos    = ads;

  // Filtro por formato
  const applyFilter = (list: any[]) =>
    filter === "todos" ? list :
    list.filter((a: any) => (a.adType || "image") === filter);

  const displayAds =
    adTab === "ativos" ? applyFilter(adsAtivos) :
    adTab === "todos"  ? applyFilter(adsTodos)  : [];

  // Paginação
  const totalPages = Math.ceil(displayAds.length / ADS_PER_PAGE);
  const pagedAds   = displayAds.slice(0, adsPage * ADS_PER_PAGE);

  // KPIs
  const formatDist = ads.reduce((acc: any, a: any) => {
    const k = a.adType || "image";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const ctaFreq = ads.reduce((acc: any, a: any) => {
    if (a.cta) acc[a.cta] = (acc[a.cta] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topCtaList = Object.entries(ctaFreq)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 5)
    .map(([cta, count]) => ({ cta, count: count as number }));

  const NON_REAL = new Set(["estimated", "estimated_ai", "seo_analysis", "website_scraping", "unknown"]);
  const estimatedCount = ads.filter((a: any) => {
    const src = a.source || (a.adId?.startsWith("estimated_") || a.adId?.startsWith("seo_") || a.adId?.startsWith("ws_") ? a.source : null) || "unknown";
    return NON_REAL.has(src) || src.startsWith("estimated") || !src;
  }).length;
  const realCount    = ads.length - estimatedCount;
  const successLayer = ads.length > 0 ? detectLayer(ads) : null;

  const sources    = ads.map((a: any) => a.source || "unknown");
  const hasOfficial = sources.some((s: string) => s === "meta_ads_archive");
  const hasLibrary  = sources.some((s: string) => s.startsWith("ads_library"));
  const hasWebsite  = sources.some((s: string) => s === "website_scraping");
  const hasSEO      = sources.some((s: string) => s === "seo_analysis");
  const hasEstAI    = sources.some((s: string) => s === "estimated_ai");
  const allEstimated = realCount === 0 && estimatedCount > 0;
  const mixed        = realCount > 0 && estimatedCount > 0;

  let insightBlocks: string[] = [];
  if (comp.aiInsights) insightBlocks = comp.aiInsights.split("\n\n").filter(Boolean);

  // Formato icon
  const fmtIcon = (t: string) => t === "video" ? "🎬" : t === "carousel" ? "🎠" : "🖼️";

  async function handleCopyInsights() {
    await copyToClipboard(comp.aiInsights || "");
    setCopyInsightsDone(true);
    setTimeout(() => setCopyInsightsDone(false), 2000);
  }

  // Banner qualidade
  type DataBanner = { icon: string; title: string; desc: string; bg: string; border: string; titleColor: string; descColor: string; };
  const dataBanner: DataBanner | null = ads.length === 0 ? null :
    hasOfficial  ? { icon: "◎", title: "Dados reais — Meta Ads API Oficial (camada 1)", desc: `${realCount} anúncio(s) via API oficial. Dados confiáveis e atualizados.`, bg: "#f0fdf4", border: "#86efac", titleColor: "#166534", descColor: "#15803d" } :
    hasLibrary && !mixed ? { icon: "🔎", title: "Dados reais — Ads Library pública (camada 2-3)", desc: `${realCount} anúncio(s) da Ads Library${comp.facebookPageId ? " · Page ID: " + comp.facebookPageId : ""}`, bg: "#eff6ff", border: "#93c5fd", titleColor: "#1e40af", descColor: "#1d4ed8" } :
    hasWebsite   ? { icon: "🌐", title: "Inferido do site (camada 5)", desc: `${realCount} anúncio(s) gerado(s) a partir do site de ${comp.name} — headlines e CTAs reais.`, bg: "#e0f2fe", border: "#7dd3fc", titleColor: "#0e7490", descColor: "#0369a1" } :
    hasSEO       ? { icon: "🔍", title: "Análise SEO/IA (camada 6)", desc: `${realCount} anúncio(s) inferido(s) via análise digital de ${comp.name}.`, bg: "#ede9fe", border: "#a78bfa", titleColor: "#7c3aed", descColor: "#6d28d9" } :
    mixed        ? { icon: "⚡", title: "Dados mistos (reais + estimados)", desc: `${realCount} real(is) + ${estimatedCount} estimado(s).`, bg: "#fefce8", border: "#fde047", titleColor: "#854d0e", descColor: "#92400e" } :
    hasEstAI     ? { icon: "🤖", title: "Estimativas IA — camada 7", desc: `Coleta bloqueada. MECPro AI gerou ${estimatedCount} anúncio(s) representativos do nicho.`, bg: "#faf5ff", border: "#c4b5fd", titleColor: "#6d28d9", descColor: "#7c3aed" } :
    { icon: "◬", title: "Estimativas por nicho — camada 7",
      desc: `Todas as camadas de coleta falharam para ${comp.name}. Causa mais provável: o App Meta ainda não tem aprovação para Ads Library API (code=10). Solução: acesse facebook.com/ads/library/api → "Get Access" com o mesmo App do seu token. O token de publicação de campanhas está funcionando normalmente — é apenas a leitura de anúncios de concorrentes que requer aprovação separada.`,
      bg: "#fef3c7", border: "#fcd34d", titleColor: "#92400e", descColor: "#b45309" };

  return (
    <>
      {/* Modal detalhe do ad */}
      {selectedAd && <AdDetailModal ad={selectedAd} onClose={() => setSelectedAd(null)} />}

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 18, padding: 24 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
              Raio-X: {comp.name}
            </h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{ads.length} anúncios · {adsAtivos.length} ativos</span>
              {realCount > 0      && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#e8f0fe", color: "#1877f2" }}>◎ {realCount} reais</span>}
              {estimatedCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#fef3c7", color: "#92400e" }}>⚠️ {estimatedCount} estimados</span>}
              {successLayer && CASCADE_LAYERS[successLayer-1] && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: CASCADE_LAYERS[successLayer-1]?.bg || "#f1f5f9", color: CASCADE_LAYERS[successLayer-1]?.color || "#64748b" }}>
                  {CASCADE_LAYERS[successLayer-1]?.icon} Camada {successLayer}
                </span>
              )}
              {comp.aiGeneratedAt && <span style={{ fontSize: 10, color: "var(--muted)" }}>⏱ {formatDate(comp.aiGeneratedAt)}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-sm btn-ghost" onClick={onEdit} style={{ fontSize: 11 }}>✏️ Editar</button>
            <button className="btn btn-sm btn-green" onClick={() => onAnalyze(comp.id, false)} disabled={analyzing} style={{ fontSize: 11 }}>
              {analyzing ? "⏳ Analisando..." : "🔄 Re-analisar"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowForceConfirm(true)} disabled={analyzing}
              style={{ fontSize: 11, color: "#dc2626", borderColor: "#fca5a5" }} title="Apagar dados e buscar novamente">
              🔥 Forçar
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", padding: "4px 8px" }}>✕</button>
          </div>
        </div>

        {/* Confirmação de forçar re-análise */}
        {showForceConfirm && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>🔥 Apagar todos os dados e buscar novamente?</p>
            <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 12 }}>
              Isso vai deletar todos os {ads.length} anúncio(s) salvos e tentar as 7 camadas de coleta do zero.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={() => { setShowForceConfirm(false); onAnalyze(comp.id, true); }}
                style={{ background: "#dc2626", color: "white", fontSize: 12, flex: 1, justifyContent: "center" }}>
                🔥 Sim, forçar re-análise
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowForceConfirm(false)} style={{ fontSize: 12 }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Cascata em tempo real */}
        <CascadeStatus analyzing={analyzing} successLayer={successLayer} hasAds={ads.length > 0} />

        {/* Banner qualidade */}
        {dataBanner && !analyzing && (
          <div style={{ background: dataBanner.bg, border: `1.5px solid ${dataBanner.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: dataBanner.titleColor, marginBottom: 4 }}>{dataBanner.icon} {dataBanner.title}</p>
            <p style={{ fontSize: 12, color: dataBanner.descColor, margin: 0 }}>{dataBanner.desc}</p>
          </div>
        )}

        {/* KPIs */}
        {ads.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 18 }}>
            {[
              { label: "Total", value: ads.length, color: "var(--navy)", bg: "#f0f4ff" },
              { label: "Ativos", value: adsAtivos.length, color: "#166534", bg: "#dcfce7" },
              { label: "Reais", value: realCount, color: "#1877f2", bg: "#e8f0fe" },
              { label: "Estimados", value: estimatedCount, color: "#92400e", bg: "#fef3c7" },
            ].map(k => (
              <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: k.color, margin: 0, lineHeight: 1 }}>{k.value}</p>
                <p style={{ fontSize: 10, color: k.color, margin: "4px 0 0", fontWeight: 600, opacity: 0.8 }}>{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Distribuição de formatos */}
        {ads.length > 0 && Object.keys(formatDist).length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>Distribuição de formatos</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(formatDist).map(([fmt, cnt]: any) => (
                <div key={fmt} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: "var(--off)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13 }}>{fmtIcon(fmt)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{fmt}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "var(--navy)", color: "white" }}>{cnt}</span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>{Math.round((cnt / ads.length) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top CTAs */}
        {topCtaList.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>CTAs mais usados</p>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {topCtaList.map(({ cta, count }) => (
                <div key={cta} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8" }}>👆 {cta}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 8, background: "#1d4ed8", color: "white" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 18 }}>
          {([
            { key: "ativos",   label: `Ativos (${adsAtivos.length})`,  icon: "●" },
            { key: "todos",    label: `Todos (${ads.length})`,         icon: "≡" },
            { key: "insights", label: "Insights IA",                   icon: "🤖" },
            { key: "cascade",  label: "Debug Cascata",                 icon: "🧪" },
          ] as { key: AdTab; label: string; icon: string }[]).map((t, i) => (
            <button key={t.key} onClick={() => { setAdTab(t.key); setAdsPage(1); }} style={{
              flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
              borderLeft: i > 0 ? "1px solid var(--border)" : "none",
              background: adTab === t.key ? "var(--navy)" : "white",
              color: adTab === t.key ? "white" : "var(--muted)",
              fontSize: 11, fontWeight: 700,
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Anúncios (ativos / todos) ─────────────────────────── */}
        {(adTab === "ativos" || adTab === "todos") && (
          <>
            {/* Filtros de formato */}
            {displayAds.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--muted)", paddingTop: 3 }}>Formato:</span>
                {(["todos", "image", "video", "carousel"] as AdFilter[]).map(f => (
                  <button key={f} onClick={() => { setFilter(f); setAdsPage(1); }} style={{
                    padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                    background: filter === f ? "var(--navy)" : "var(--off)",
                    color: filter === f ? "white" : "var(--muted)",
                  }}>
                    {f === "todos" ? "Todos" : `${fmtIcon(f)} ${f}`}
                    {f !== "todos" && ` (${(ads.filter((a: any) => (a.adType || "image") === f)).length})`}
                  </button>
                ))}
              </div>
            )}

            {displayAds.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>
                  {adTab === "ativos" ? "😶" : "📭"}
                </div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>
                  {adTab === "ativos" ? "Nenhum anúncio ativo encontrado" : "Nenhum anúncio ainda"}
                </p>
                {adTab === "ativos" && ads.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    Há {ads.length} anúncio(s) inativos na aba "Todos"
                  </p>
                )}
                {ads.length === 0 && (
                  <button className="btn btn-sm btn-green" onClick={() => onAnalyze(comp.id)} style={{ marginTop: 12 }}>
                    🔍 Analisar agora
                  </button>
                )}
              </div>
            ) : (
              <>
                <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                  Mostrando {pagedAds.length} de {displayAds.length} anúncio(s)
                  {allEstimated && " · ⚠️ Dados estimados"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pagedAds.map((ad: any, i: number) => (
                    <AdCard key={ad.id || i} ad={ad} onClick={() => setSelectedAd(ad) as any} />
                  ))}
                </div>
                {pagedAds.length < displayAds.length && (
                  <button className="btn btn-sm btn-ghost" onClick={() => setAdsPage(p => p + 1)}
                    style={{ width: "100%", justifyContent: "center", marginTop: 12, fontSize: 12 }}>
                    Carregar mais ({displayAds.length - pagedAds.length} restantes)
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* ── Tab: Insights IA ─────────────────────────────────────── */}
        {adTab === "insights" && (
          <div>
            {/* ── MECPro Analyzer — input manual ── */}
            <AdInputAnalyzer projectId={projectId} compName={comp.name} competitorId={comp.id} ads={ads} />

            {/* ── TikTok Dashboard ─────────────────────────────── */}
            {(() => {
              // Extrai vídeos TikTok salvos no banco
              const ttAds = ads.filter((a: any) => a.platform === "tiktok");
              const ttVideos = ttAds.map((a: any) => {
                let raw: any = {};
                try { raw = JSON.parse(a.rawData || "{}"); } catch {}
                return {
                  id:           a.adId,
                  title:        a.headline || "",
                  description:  a.bodyText || raw.description || "",
                  viewCount:    raw.viewCount    || 0,
                  likeCount:    raw.likeCount    || 0,
                  commentCount: raw.commentCount || 0,
                  shareCount:   raw.shareCount   || 0,
                  duration:     raw.duration     || 0,
                  coverUrl:     raw.coverUrl     || "",
                  shareUrl:     raw.shareUrl     || "",
                  createTime:   a.startDate ? new Date(a.startDate).getTime() / 1000 : 0,
                  profile:      raw.profile      || null,
                };
              });

              // Métricas agregadas
              const totalViews    = ttVideos.reduce((s: number, v: any) => s + v.viewCount, 0);
              const totalLikes    = ttVideos.reduce((s: number, v: any) => s + v.likeCount, 0);
              const totalComments = ttVideos.reduce((s: number, v: any) => s + v.commentCount, 0);
              const totalShares   = ttVideos.reduce((s: number, v: any) => s + v.shareCount, 0);
              const avgViews      = ttVideos.length ? Math.round(totalViews / ttVideos.length) : 0;
              const engRate       = totalViews > 0
                ? (((totalLikes + totalComments + totalShares) / totalViews) * 100).toFixed(2)
                : "0.00";
              const topVideo      = ttVideos.length
                ? ttVideos.reduce((a: any, b: any) => b.viewCount > a.viewCount ? b : a)
                : null;
              const avgDuration   = ttVideos.length
                ? Math.round(ttVideos.reduce((s: number, v: any) => s + v.duration, 0) / ttVideos.length)
                : 0;

              // Frequência de postagem
              const sorted = [...ttVideos].filter((v: any) => v.createTime > 0).sort((a: any, b: any) => b.createTime - a.createTime);
              let freqLabel = "—";
              if (sorted.length >= 2) {
                const diffs = sorted.slice(0, -1).map((v: any, i: number) =>
                  (v.createTime - sorted[i + 1].createTime) / 86400
                );
                const avgDiff = diffs.reduce((s: number, d: number) => s + d, 0) / diffs.length;
                freqLabel = avgDiff < 1 ? "Mais de 1x/dia" :
                            avgDiff < 3 ? `A cada ${avgDiff.toFixed(1)} dias` :
                            avgDiff < 7 ? "Algumas vezes/semana" :
                            avgDiff < 14 ? "Semanal" : "Quinzenal ou menos";
              }

              // Tendência (últimos 5 vs anteriores)
              const recent = ttVideos.slice(0, 5);
              const older  = ttVideos.slice(5, 10);
              const avgRecent = recent.length ? recent.reduce((s: number, v: any) => s + v.viewCount, 0) / recent.length : 0;
              const avgOlder  = older.length  ? older.reduce((s: number, v: any) => s + v.viewCount, 0)  / older.length  : 0;
              const trend = avgOlder === 0 ? "neutro" : avgRecent > avgOlder * 1.1 ? "crescendo" : avgRecent < avgOlder * 0.9 ? "caindo" : "estável";

              // Perfil TikTok (do primeiro vídeo com profile)
              const profileData = ttVideos.find((v: any) => v.profile)?.profile || null;

              return (
                <div style={{ marginTop: 12, background: "#0a0a0a", borderRadius: 16, overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a1a" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎵</div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "white" }}>TikTok Intelligence</p>
                        <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,.4)" }}>
                          {ttVideos.length > 0 ? `${ttVideos.length} vídeo(s) analisado(s)` : "Nenhum dado coletado ainda"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setTiktokLoading(true); analyzeTikTokMut.mutate({ competitorId: comp.id, projectId }); }}
                      disabled={tiktokLoading}
                      style={{ background: tiktokLoading ? "#333" : "#fe2c55", color: "white", border: "none",
                        borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700,
                        cursor: tiktokLoading ? "not-allowed" : "pointer" }}>
                      {tiktokLoading ? "⏳ Buscando…" : "🔄 Atualizar"}
                    </button>
                  </div>

                  {ttVideos.length === 0 ? (
                    <div style={{ padding: "32px 20px", textAlign: "center" }}>
                      <p style={{ fontSize: 32, margin: "0 0 8px" }}>🎵</p>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: 0 }}>Nenhum vídeo TikTok coletado.</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,.3)", margin: "4px 0 12px" }}>
                        Clique no botão 🎵 no card do concorrente para coletar vídeos
                      </p>
                      <button
                        onClick={() => { setTiktokLoading(true); analyzeTikTokMut.mutate({ competitorId: comp.id, projectId }); }}
                        disabled={tiktokLoading}
                        style={{ background: "#fe2c55", color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        🔍 Buscar vídeos agora
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: "14px 18px" }}>

                      {/* Perfil */}
                      {profileData && (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "10px 14px", background: "#1a1a1a", borderRadius: 12 }}>
                          {profileData.avatarUrl && (
                            <img src={profileData.avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "white" }}>{profileData.displayName || comp.name}</p>
                              {profileData.isVerified && <span style={{ fontSize: 12 }}>◎</span>}
                            </div>
                            <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                              {[
                                { l: "Seguidores", v: (profileData.followerCount || 0).toLocaleString("pt-BR") },
                                { l: "Likes totais", v: (profileData.likesCount || 0).toLocaleString("pt-BR") },
                                { l: "Vídeos", v: profileData.videoCount || "—" },
                              ].map((m: any) => (
                                <div key={m.l}>
                                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "white" }}>{m.v}</p>
                                  <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,.4)" }}>{m.l}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* KPIs */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 14 }}>
                        {[
                          { icon: "👁️", label: "Views médias",    value: avgViews.toLocaleString("pt-BR"),       color: "#fe2c55" },
                          { icon: "❤️", label: "Eng. Rate",        value: `${engRate}%`,                         color: "#ff9f43" },
                          { icon: "📈", label: "Tendência",        value: trend === "crescendo" ? "↑ Subindo" : trend === "caindo" ? "↓ Caindo" : "→ Estável",
                            color: trend === "crescendo" ? "#00f2ea" : trend === "caindo" ? "#fe2c55" : "#94a3b8" },
                          { icon: "🔁", label: "Frequência",       value: freqLabel,                             color: "#a78bfa" },
                          { icon: "⏱️", label: "Duração média",    value: avgDuration > 0 ? `${avgDuration}s` : "—", color: "#60a5fa" },
                          { icon: "📊", label: "Total views",      value: totalViews > 0 ? `${(totalViews/1000).toFixed(1)}K` : "—", color: "#34d399" },
                        ].map((k: any) => (
                          <div key={k.label} style={{ background: "#1a1a1a", borderRadius: 10, padding: "10px 12px", border: `1px solid ${k.color}22` }}>
                            <p style={{ margin: "0 0 4px", fontSize: 16 }}>{k.icon}</p>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: k.color, fontFamily: "var(--font-display)" }}>{k.value}</p>
                            <p style={{ margin: "2px 0 0", fontSize: 9, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>{k.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Top vídeo */}
                      {topVideo && (
                        <div style={{ marginBottom: 14, background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
                          <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#fe2c55", textTransform: "uppercase" }}>🏆 Top vídeo</span>
                          </div>
                          <div style={{ display: "flex", gap: 12, padding: "0 14px 12px", alignItems: "flex-start" }}>
                            {topVideo.coverUrl && (
                              <img src={topVideo.coverUrl} alt="" style={{ width: 56, height: 80, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "white", lineHeight: 1.4 }}>
                                {topVideo.title.slice(0, 80) || "Sem título"}
                              </p>
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {[
                                  { icon: "👁️", v: topVideo.viewCount.toLocaleString("pt-BR") },
                                  { icon: "❤️", v: topVideo.likeCount.toLocaleString("pt-BR") },
                                  { icon: "💬", v: topVideo.commentCount.toLocaleString("pt-BR") },
                                  { icon: "↗️", v: topVideo.shareCount.toLocaleString("pt-BR") },
                                ].map((m: any) => (
                                  <span key={m.icon} style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{m.icon} {m.v}</span>
                                ))}
                              </div>
                              {topVideo.shareUrl && (
                                <a href={topVideo.shareUrl} target="_blank" rel="noreferrer"
                                  style={{ display: "inline-block", marginTop: 6, fontSize: 10, color: "#fe2c55", textDecoration: "none", fontWeight: 700 }}>
                                  Ver vídeo →
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Lista de vídeos */}
                      <div>
                        <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>
                          Últimos {Math.min(ttVideos.length, 8)} vídeos
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {ttVideos.slice(0, 8).map((v: any, i: number) => {
                            const engV = v.viewCount > 0
                              ? (((v.likeCount + v.commentCount + v.shareCount) / v.viewCount) * 100).toFixed(1)
                              : "0.0";
                            const isTop = v === topVideo;
                            return (
                              <div key={i} style={{
                                display: "flex", gap: 10, alignItems: "center",
                                padding: "8px 10px", borderRadius: 9,
                                background: isTop ? "#1f0a0e" : "#111",
                                border: `1px solid ${isTop ? "#fe2c5533" : "#1a1a1a"}`,
                              }}>
                                {v.coverUrl && (
                                  <img src={v.coverUrl} alt="" style={{ width: 32, height: 44, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.85)", lineHeight: 1.3,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {v.title.slice(0, 60) || `Vídeo ${i + 1}`}
                                  </p>
                                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>👁️ {(v.viewCount/1000).toFixed(1)}K</span>
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>❤️ {(v.likeCount/1000).toFixed(1)}K</span>
                                    <span style={{ fontSize: 10, color: "#fe2c55" }}>⚡ {engV}%</span>
                                    {v.duration > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{v.duration}s</span>}
                                  </div>
                                </div>
                                {v.shareUrl && (
                                  <a href={v.shareUrl} target="_blank" rel="noreferrer"
                                    style={{ fontSize: 16, textDecoration: "none", opacity: 0.6, flexShrink: 0 }}>▶️</a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Insight TikTok via analyzeTikTok */}
                      {tiktokResult && (tiktokResult as any).insight && (
                        <div style={{ marginTop: 12, padding: "10px 14px", background: "#1a1a1a", borderRadius: 10, borderLeft: "3px solid #fe2c55" }}>
                          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color: "#fe2c55", textTransform: "uppercase" }}>💡 Insight IA</p>
                          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.7)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                            {(tiktokResult as any).insight}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {!comp.aiInsights ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🤖</div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>Insights ainda não gerados</p>
                <p style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>Clique em "Re-analisar" para gerar insights com IA</p>
                <button className="btn btn-sm btn-green" onClick={() => onAnalyze(comp.id)} style={{ fontSize: 12 }}>
                  🔄 Gerar insights agora
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                    🤖 Análise gerada em {formatDate(comp.aiGeneratedAt)}
                  </p>
                  <button className="btn btn-sm btn-ghost" onClick={handleCopyInsights} style={{ fontSize: 11 }}>
                    {copyInsightsDone ? "◎ Copiado!" : "📋 Copiar"}
                  </button>
                </div>

                {allEstimated && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", margin: "0 0 4px" }}>
                        ⚠️ Análise baseada em estimativas — sem acesso à Ads Library do Facebook.
                      </p>
                      <p style={{ fontSize: 11, color: "#78350f", margin: 0 }}>
                        O servidor não consegue acessar facebook.com. Use a coleta pelo browser abaixo para obter dados reais.
                      </p>
                    </div>
                    <ClientAdsCollector
                      competitorId={comp.id}
                      projectId={projectId}
                      compName={comp.name}
                      pageId={comp.facebookPageId}
                      onSuccess={() => { onRefetch?.(); onAnalyze(comp.id, false); }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {insightBlocks.map((block, i) => {
                    const isHeader = block.startsWith("##") || block.startsWith("**");
                    const cleanBlock = block.replace(/^##\s*/, "").replace(/\*\*/g, "");

                    return (
                      <div key={i} style={{
                        background: isHeader ? "var(--navy)" : "var(--off)",
                        borderRadius: 12, padding: "12px 16px",
                        borderLeft: !isHeader ? "3px solid var(--green)" : "none",
                      }}>
                        <p style={{
                          fontSize: isHeader ? 13 : 13,
                          fontWeight: isHeader ? 800 : 400,
                          color: isHeader ? "white" : "var(--body)",
                          lineHeight: 1.7, margin: 0,
                          whiteSpace: "pre-wrap",
                        }}>
                          {cleanBlock}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 16, padding: "12px 16px", background: "#f0fdf4", borderRadius: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                  <p style={{ fontSize: 12, color: "#166534", lineHeight: 1.6, margin: 0 }}>
                    Use estes insights para construir sua estratégia no <strong>Construtor de Campanhas</strong>.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: Debug Cascata ───────────────────────────────────── */}
        {adTab === "cascade" && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 14, textTransform: "uppercase" }}>
              🧪 Debug — Pipeline de 7 camadas
            </p>

            {/* Info do concorrente */}
            <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>Dados de entrada</p>
              {[
                { label: "Facebook Page ID", value: comp.facebookPageId, icon: "🔵" },
                { label: "Ads Library URL", value: comp.facebookPageUrl, icon: "🔗", truncate: true },
                { label: "Instagram", value: comp.instagramUrl, icon: "📸" },
                { label: "Site", value: comp.websiteUrl, icon: "🌐" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, width: 16 }}>{row.icon}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", width: 120, flexShrink: 0 }}>{row.label}:</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: row.value ? "var(--black)" : "#94a3b8", flex: 1, wordBreak: "break-all" }}>
                    {row.value ? (row.truncate && row.value.length > 60 ? row.value.slice(0, 60) + "…" : row.value) : "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Status por camada */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {CASCADE_LAYERS.map(layer => {
                const layerSources: Record<number, string[]> = {
                  1: ["meta_ads_archive"],
                  2: ["ads_library_public", "ads_library_public_regex"],
                  3: ["meta_api", "meta", "scraping"],
                  4: ["instagram_search"],
                  5: ["website_scraping"],
                  6: ["seo_analysis"],
                  7: ["estimated", "estimated_ai", "unknown"],
                };
                const lSrc = layerSources[layer.n] || [];
                const adsFromLayer = ads.filter((a: any) => lSrc.includes(a.source || "unknown") || (layer.n === 7 && (!a.source || a.source === "unknown")));
                const isSuccess = successLayer === layer.n;
                const wasTried  = successLayer !== null && layer.n < (successLayer || 0);
                const isActive  = analyzing;

                return (
                  <div key={layer.n} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 10,
                    background: isSuccess ? layer.bg : wasTried ? "#fef2f2" : "var(--off)",
                    border: `1.5px solid ${isSuccess ? layer.color : wasTried ? "#fca5a5" : "var(--border)"}`,
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
                      background: isSuccess ? layer.color : wasTried ? "#dc2626" : "#e2e8f0",
                      color: isSuccess || wasTried ? "white" : "var(--muted)", fontWeight: 700,
                    }}>
                      {isSuccess ? "✓" : wasTried ? "✕" : layer.n}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: isSuccess ? layer.color : "var(--black)", margin: 0 }}>
                        {layer.icon} {layer.label}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--muted)", margin: "2px 0 0" }}>{layer.desc}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isSuccess && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: layer.color, color: "white" }}>
                          {adsFromLayer.length} anúncios
                        </span>
                      )}
                      {wasTried && <span style={{ fontSize: 10, color: "#dc2626", fontWeight: 700 }}>FALHOU</span>}
                      {!isSuccess && !wasTried && <span style={{ fontSize: 10, color: "var(--muted)" }}>—</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Distribuição de sources */}
            {ads.length > 0 && (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase" }}>Distribuição por fonte</p>
                {Object.entries(
                  ads.reduce((acc: any, a: any) => {
                    const s = a.source || "unknown";
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).sort((a: any, b: any) => b[1] - a[1]).map(([src, cnt]: any) => {
                  const b = sourceBadge(src);
                  const pct = Math.round((cnt / ads.length) * 100);
                  return (
                    <div key={src} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: b.bg, color: b.color }}>{b.label}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{cnt} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: b.color, borderRadius: 3, width: `${pct}%`, transition: "width .5s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: VERIFICADOR DE TIKTOK
// Verifica existência do perfil via link direto — sem API necessária
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: MECPro Analyzer — análise de anúncio por input manual
// Não depende de API Meta, HF ou quota — usa Gemini direto
// ─────────────────────────────────────────────────────────────────────────────
function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value * 10}%`, background: color, borderRadius: 3, transition: "width .6s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color, minWidth: 24 }}>{value}</span>
    </div>
  );
}

function AdInputAnalyzer({ projectId, compName, competitorId, ads = [] }: {
  projectId: number; compName: string; competitorId: number; ads: any[]
}) {
  const [input,   setInput]   = useState(compName || "");
  const [nicho,   setNicho]   = useState("");
  const [result,  setResult]  = useState<any>(null);
  const [tab,     setTab]     = useState<"resumo"|"estrategia"|"melhorado"|"variacoes">("resumo");
  const [copied,  setCopied]  = useState("");
  const [useExisting, setUseExisting] = useState(ads.length > 0);

  // Detecta se parece nome de empresa (curto, sem pontuação de copy)
  const isCompanyName = input.trim().length < 60
    && !/[.!?]/.test(input)
    && !/\b(descubra|aproveite|garanta|clique|saiba|conheça|venha)\b/i.test(input)
    && input.trim().length > 0;

  // Contagem de anúncios disponíveis
  const realAds = ads.filter((a: any) => {
    try { const s = JSON.parse(a.rawData||"{}").source||""; return ["meta_ads_archive","ads_library_public"].includes(s); } catch { return false; }
  });
  const estAds = ads.filter((a: any) => {
    try { const s = JSON.parse(a.rawData||"{}").source||""; return !["meta_ads_archive","ads_library_public"].includes(s); } catch { return true; }
  });

  const analyzeMut = (trpc as any).competitors?.analyzeAdInput?.useMutation?.({
    onSuccess: (d: any) => { setResult(d?.data || null); setTab("resumo"); },
    onError:   (e: any) => { toast.error("✕ " + (e.message || "Erro ao analisar")); },
  }) ?? { mutate: () => {}, isPending: false };

  function handleCopy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  const score = result?.score_final || 0;
  const scoreColor = score >= 7 ? "#16a34a" : score >= 5 ? "#f59e0b" : "#dc2626";

  const tabs = [
    { key: "resumo",     label: "📊 Análise"    },
    { key: "estrategia", label: "🎯 Estratégia"  },
    { key: "melhorado",  label: "🚀 Melhorado"   },
    { key: "variacoes",  label: "✏️ Variações"   },
  ] as const;

  function handleAnalyze() {
    analyzeMut.mutate({
      input:        input.trim() || compName,
      nicho:        nicho || undefined,
      projectId,
      competitorId: useExisting ? competitorId : undefined,
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: "14px 14px 0 0", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "white" }}>MECPro Analyzer</p>
          <p style={{ margin: 0, fontSize: 10, color: "#94a3b8" }}>
            {ads.length > 0
              ? <><strong style={{color:"#4ade80"}}>{ads.length} anúncios coletados</strong> prontos para análise — ou cole um texto/nome para análise manual</>
              : <>Cole o <strong style={{color:"#4ade80"}}>nome da empresa</strong> ou o <strong style={{color:"#60a5fa"}}>texto do anúncio</strong> — a IA detecta e analisa</>
            }
          </p>
        </div>
        {compName && input !== compName && (
          <button onClick={() => { setInput(compName); setResult(null); }}
            style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
              background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.4)",
              color: "#4ade80", cursor: "pointer", whiteSpace: "nowrap" }}>
            🏢 Usar "{compName}"
          </button>
        )}
      </div>

      {/* Input */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderTop: "none", padding: 16 }}>

        {/* Toggle — usar anúncios coletados ou input manual */}
        {ads.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setUseExisting(true)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: useExisting ? "#0f172a" : "#f1f5f9", color: useExisting ? "white" : "var(--muted)" }}>
              📊 Analisar {ads.length} anúncio{ads.length > 1 ? "s" : ""} coletados
              {realAds.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, background: "#4ade80", color: "#0f172a", padding: "1px 6px", borderRadius: 10 }}>{realAds.length} reais</span>}
            </button>
            <button onClick={() => setUseExisting(false)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: !useExisting ? "#0f172a" : "#f1f5f9", color: !useExisting ? "white" : "var(--muted)" }}>
              ✏️ Análise por texto/nome
            </button>
          </div>
        )}

        {/* Input manual — só mostra quando não usa anúncios coletados */}
        {(!useExisting || ads.length === 0) && (
          <>
            <textarea
              rows={3}
              placeholder={`Digite o nome da empresa ou cole um texto de anúncio...\n\nEx: "${compName || "Triad Imóveis"}" ou "Perca 10kg em 30 dias..."`}
              value={input}
              onChange={e => { setInput(e.target.value); setResult(null); }}
              style={{ width: "100%", border: `1.5px solid ${isCompanyName ? "#4ade80" : "#60a5fa"}`, borderRadius: 10, padding: 12,
                fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit",
                outline: "none", boxSizing: "border-box", transition: "border-color .2s" }}
            />
            {input.trim().length > 2 && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  background: isCompanyName ? "rgba(74,222,128,.15)" : "rgba(96,165,250,.15)",
                  color: isCompanyName ? "#16a34a" : "#1d4ed8", border: `1px solid ${isCompanyName ? "#4ade80" : "#60a5fa"}` }}>
                  {isCompanyName ? "🏢 Modo: empresa — IA vai inferir a estratégia" : "📢 Modo: anúncio — IA vai analisar o copy"}
                </span>
              </div>
            )}
          </>
        )}

        {/* Preview dos anúncios que serão analisados */}
        {useExisting && ads.length > 0 && !result && (
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
              Anúncios que serão analisados ({ads.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
              {ads.slice(0, 8).map((ad: any, i: number) => {
                const src = (() => { try { return JSON.parse(ad.rawData||"{}").source||""; } catch { return ""; } })();
                const isReal = ["meta_ads_archive","ads_library_public"].includes(src);
                return (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", background: "white", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, flexShrink: 0,
                      background: isReal ? "#dcfce7" : "#fef9c3", color: isReal ? "#166534" : "#92400e" }}>
                      {isReal ? "◎ Real" : "⚠️ Est"}
                    </span>
                    <p style={{ margin: 0, fontSize: 11, color: "var(--black)", lineHeight: 1.4 }}>
                      <strong>{ad.headline || "—"}</strong>
                      {ad.bodyText && <span style={{ color: "var(--muted)" }}> · {ad.bodyText.slice(0, 60)}...</span>}
                    </p>
                  </div>
                );
              })}
              {ads.length > 8 && <p style={{ margin: 0, fontSize: 10, color: "var(--muted)", textAlign: "center" }}>+{ads.length - 8} mais</p>}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {!useExisting && (
            <input className="input" placeholder="Nicho (opcional — ex: imobiliária, academia)" value={nicho}
              onChange={e => setNicho(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
          )}
          <button
            className="btn btn-md btn-primary"
            disabled={(!input.trim() && !useExisting) || analyzeMut.isPending}
            onClick={handleAnalyze}
            style={{ flex: useExisting ? 1 : undefined, flexShrink: 0, fontSize: 13, fontWeight: 700, padding: "8px 20px" }}>
            {analyzeMut.isPending
              ? "⏳ Analisando..."
              : useExisting && ads.length > 0
                ? `🔍 Analisar ${ads.length} anúncio${ads.length > 1 ? "s" : ""}`
                : isCompanyName ? "🏢 Analisar empresa" : "🔍 Analisar anúncio"}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>

          {/* Score banner */}
          <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Resumo executivo</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--black)", lineHeight: 1.5 }}>{result.resumo}</p>
            </div>
            <div style={{ textAlign: "center", marginLeft: 16, flexShrink: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor }}>{score}/10</div>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>Score</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "white" }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, padding: "10px 4px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  borderBottom: tab === t.key ? "2px solid #0f172a" : "2px solid transparent",
                  color: tab === t.key ? "#0f172a" : "var(--muted)", background: "white" }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ background: "white", padding: 16, borderRadius: "0 0 14px 14px" }}>

            {/* ── Tab Análise ── */}
            {tab === "resumo" && (
              <div>
                {/* Interpretação */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "Nicho",      val: result.interpretacao?.nicho },
                    { label: "Produto",    val: result.interpretacao?.produto },
                    { label: "Público",    val: result.interpretacao?.publico },
                    { label: "Funil",      val: result.interpretacao?.funil },
                    { label: "Objetivo",   val: result.interpretacao?.objetivo },
                    { label: "Consciência",val: result.interpretacao?.nivelConsciencia },
                  ].map(item => item.val && (
                    <div key={item.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{item.label}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--black)", fontWeight: 600 }}>{item.val}</p>
                    </div>
                  ))}
                </div>

                {/* Scores */}
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Avaliação</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "Clareza",       val: result.avaliacao?.clareza,       color: "#3b82f6" },
                    { label: "Persuasão",     val: result.avaliacao?.persuasao,     color: "#8b5cf6" },
                    { label: "Oferta",        val: result.avaliacao?.oferta,        color: "#f59e0b" },
                    { label: "Diferenciação", val: result.avaliacao?.diferenciacao, color: "#06b6d4" },
                    { label: "Conversão",     val: result.avaliacao?.conversao,     color: "#10b981" },
                  ].map(s => s.val !== undefined && (
                    <div key={s.label}>
                      <p style={{ margin: "0 0 4px", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{s.label}</p>
                      <ScoreBar value={s.val} color={s.color} />
                    </div>
                  ))}
                </div>
                {result.avaliacao?.justificativa && (
                  <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", margin: "8px 0 0" }}>{result.avaliacao.justificativa}</p>
                )}

                {/* Falhas e Oportunidades */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                  <div style={{ background: "#fef2f2", borderRadius: 10, padding: 12 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "#dc2626" }}>✕ Falhas</p>
                    {(result.falhas || []).map((f: string, i: number) => (
                      <p key={i} style={{ margin: "0 0 4px", fontSize: 11, color: "#991b1b" }}>• {f}</p>
                    ))}
                  </div>
                  <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 12 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "#16a34a" }}>◎ Oportunidades</p>
                    {(result.oportunidades || []).map((o: string, i: number) => (
                      <p key={i} style={{ margin: "0 0 4px", fontSize: 11, color: "#15803d" }}>• {o}</p>
                    ))}
                  </div>
                </div>

                {/* Conclusão */}
                {result.conclusao && (
                  <div style={{ marginTop: 14, background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 10, padding: 14 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 800, color: "#4ade80" }}>🏆 Como ganhar desse concorrente</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{result.conclusao}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab Estratégia ── */}
            {tab === "estrategia" && (
              <div>
                {result.estrategia && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: "🎯 Promessa principal", val: result.estrategia.promessa },
                      { label: "💰 Tipo de oferta",    val: result.estrategia.oferta },
                      { label: "📍 Posicionamento",    val: result.estrategia.posicionamento },
                      { label: "🔀 Ângulo de venda",   val: result.estrategia.angulo },
                      { label: "❤️ Emoção dominante",  val: result.estrategia.emocao },
                      { label: "🧠 Lógica do anúncio", val: result.estrategia.logica },
                    ].map(item => item.val && (
                      <div key={item.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                        <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{item.label}</p>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--black)" }}>{item.val}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* Gatilhos */}
                {(result.gatilhos || []).length > 0 && (
                  <>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Gatilhos mentais</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {result.gatilhos.map((g: any, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderRadius: 8, background: g.status === "forte" ? "#f0fdf4" : g.status === "fraco" ? "#fefce8" : "#fef2f2" }}>
                          <span style={{ fontSize: 14, flexShrink: 0 }}>{g.status === "forte" ? "◎" : g.status === "fraco" ? "◬" : "✕"}</span>
                          <div>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{g.nome}</p>
                            {g.observacao && <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--muted)" }}>{g.observacao}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Tab Melhorado ── */}
            {tab === "melhorado" && result.campanha_melhorada && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { key: "angulo",      label: "🔀 Novo ângulo",      icon: "🎯" },
                  { key: "promessa",    label: "💥 Nova promessa",     icon: "💥" },
                  { key: "headline",    label: "📢 Headline",          icon: "📢" },
                  { key: "texto",       label: "📝 Texto principal",   icon: "📝" },
                  { key: "cta",         label: "👆 CTA ideal",         icon: "👆" },
                  { key: "criativo",    label: "🎨 Sugestão criativo", icon: "🎨" },
                  { key: "prova_social",label: "⭐ Prova social",      icon: "◈" },
                  { key: "urgencia",    label: "⏰ Urgência/Escassez", icon: "⏰" },
                ].map(item => {
                  const val = result.campanha_melhorada[item.key];
                  if (!val) return null;
                  return (
                    <div key={item.key} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{item.label}</p>
                        <button onClick={() => handleCopy(val, item.key)}
                          style={{ fontSize: 10, color: copied === item.key ? "#16a34a" : "#7c3aed", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                          {copied === item.key ? "◎ Copiado" : "📋 Copiar"}
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--black)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{val}</p>
                    </div>
                  );
                })}

                {/* Versão agressiva */}
                {result.versao_agressiva && (
                  <div style={{ background: "linear-gradient(135deg,#1e0533,#2d1554)", borderRadius: 12, padding: 16, marginTop: 4 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 800, color: "#e879f9" }}>🔥 Versão agressiva — alta conversão</p>
                    {[
                      { label: "Headline", val: result.versao_agressiva.headline },
                      { label: "Copy",     val: result.versao_agressiva.texto },
                      { label: "CTA",      val: result.versao_agressiva.cta },
                    ].map(v => v.val && (
                      <div key={v.label} style={{ marginBottom: 8 }}>
                        <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#c084fc" }}>{v.label}</p>
                        <p style={{ margin: 0, fontSize: 13, color: "white", lineHeight: 1.5 }}>{v.val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab Variações ── */}
            {tab === "variacoes" && (
              <div>
                {[
                  { label: "📢 Headlines", items: result.variacoes?.headlines },
                  { label: "📝 Textos",    items: result.variacoes?.textos },
                  { label: "👆 CTAs",      items: result.variacoes?.ctas },
                ].map(group => group.items?.length > 0 && (
                  <div key={group.label} style={{ marginBottom: 16 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{group.label}</p>
                    {group.items.map((item: string, i: number) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, marginBottom: 6 }}>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--black)", flex: 1, lineHeight: 1.5 }}>{i + 1}. {item}</p>
                        <button onClick={() => handleCopy(item, `${group.label}-${i}`)}
                          style={{ fontSize: 10, color: copied === `${group.label}-${i}` ? "#16a34a" : "#7c3aed", background: "none", border: "none", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
                          {copied === `${group.label}-${i}` ? "◎" : "📋"}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

function TikTokVerifier({ handle, onConfirm, onClear }: {
  handle:    string;
  onConfirm: (handle: string) => void;
  onClear:   () => void;
}) {
  const [status, setStatus] = useState<"idle"|"checking"|"done">("idle");
  const raw = handle.replace(/^@/, "").replace(/.*tiktok\.com\/@?/, "").replace(/\/$/, "").trim();
  if (!raw) return null;

  const profileUrl = `https://www.tiktok.com/@${raw}`;
  const adsUrl     = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?region=BR&keyword=${encodeURIComponent(raw)}`;

  return (
    <div style={{ marginTop: 5 }}>
      {status === "idle" && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <a href={profileUrl} target="_blank" rel="noreferrer"
            onClick={() => setStatus("checking")}
            style={{ fontSize: 11, fontWeight: 700, color: "#010101", background: "#f0f0f0", border: "1px solid #d1d5db", borderRadius: 8, padding: "4px 10px", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            🎵 Ver perfil @{raw} ↗
          </a>
          <a href={adsUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "4px 10px", textDecoration: "none" }}>
            🔍 Ver anúncios no Creative Center ↗
          </a>
        </div>
      )}
      {status === "checking" && (
        <div style={{ background: "#f0f0f0", border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎵</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#111" }}>@{raw}</p>
              <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Você verificou o perfil no TikTok?</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => { onConfirm(`@${raw}`); setStatus("done"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ◎ É esse!
            </button>
            <button onClick={() => { setStatus("idle"); onClear(); }}
              style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ✗ Não é
            </button>
          </div>
        </div>
      )}
      {status === "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
          <span>◎</span> @{raw} confirmado
          <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#64748b", textDecoration: "underline", marginLeft: 4 }}>alterar</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: VERIFICADOR DE GOOGLE ADS
// Abre Google Ads Transparency e pede confirmação ao usuário
// ─────────────────────────────────────────────────────────────────────────────
function GoogleVerifier({ query, onConfirm, onClear }: {
  query:     string;
  onConfirm: (q: string) => void;
  onClear:   () => void;
}) {
  const [status, setStatus] = useState<"idle"|"checking"|"done">("idle");
  const q = query.trim();
  if (!q) return null;

  const transparencyUrl = `https://adstransparency.google.com/?region=BR&query=${encodeURIComponent(q)}`;

  return (
    <div style={{ marginTop: 5 }}>
      {status === "idle" && (
        <a href={transparencyUrl} target="_blank" rel="noreferrer"
          onClick={() => setStatus("checking")}
          style={{ fontSize: 11, fontWeight: 700, color: "#ea4335", background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 8, padding: "4px 10px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          🔍 Buscar "{q}" no Google Ads Transparency ↗
        </a>
      )}
      {status === "checking" && (
        <div style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔍</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#111" }}>"{q}"</p>
              <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Encontrou anúncios desta empresa?</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => { onConfirm(q); setStatus("done"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ◎ Confirmado
            </button>
            <button onClick={() => { setStatus("idle"); onClear(); }}
              style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ✗ Não encontrei
            </button>
          </div>
        </div>
      )}
      {status === "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
          <span>◎</span> "{q}" confirmado no Google Ads
          <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#64748b", textDecoration: "underline", marginLeft: 4 }}>alterar</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: VERIFICADOR DE INSTAGRAM
// Confirma se o @handle existe e mostra foto/nome/bio para o usuário confirmar
// ─────────────────────────────────────────────────────────────────────────────
function InstagramVerifier({ handle, onConfirm, onClear }: {
  handle:    string;
  onConfirm: (handle: string) => void;
  onClear:   () => void;
}) {
  const [status, setStatus]   = useState<"idle"|"loading"|"found"|"not_found"|"exists"|"unverified"|"error">("idle");
  const [profile, setProfile] = useState<any>(null);
  const verifyMut = (trpc as any).competitors?.verifyInstagram?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.found === true)  setStatus(data.source === "exists" ? "exists" : "found");
      else if (data?.found === false) setStatus("not_found");
      else setStatus("unverified");
      setProfile(data);
    },
    onError: () => setStatus("error"),
  }) ?? { mutate: () => {}, isPending: false };

  const rawHandle = handle.replace(/^@/, "").trim();

  function verify() {
    if (!rawHandle) return;
    setStatus("loading");
    setProfile(null);
    verifyMut.mutate({ handle: rawHandle });
  }

  if (!rawHandle) return null;

  return (
    <div style={{ marginTop: 6 }}>
      {status === "idle" && (
        <button
          onClick={verify}
          style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <span>📸</span> Verificar @{rawHandle}
        </button>
      )}

      {status === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7c3aed" }}>
          <div style={{ width: 12, height: 12, border: "2px solid #c4b5fd", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
          Verificando @{rawHandle}...
        </div>
      )}

      {/* Perfil encontrado com detalhes */}
      {status === "found" && profile && (
        <div style={{ background: "white", border: "1px solid #c4b5fd", borderRadius: 12, padding: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
          {profile.avatar ? (
            <img src={profile.avatar} alt="" width={44} height={44} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} onError={e => { (e.target as any).style.display = "none"; }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📸</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>{profile.name}</span>
              {profile.verified && <span style={{ fontSize: 12, color: "#3b82f6" }}>✓</span>}
              <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>@{rawHandle}</span>
            </div>
            {profile.bio && <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{profile.bio}</p>}
            {profile.followers && <p style={{ margin: "3px 0 0", fontSize: 10, color: "#94a3b8" }}>{profile.followers} seguidores {profile.posts ? `· ${profile.posts} posts` : ""}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <button onClick={() => { onConfirm(`@${rawHandle}`); setStatus("idle"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ◎ É essa!
            </button>
            <button onClick={() => { setStatus("idle"); setProfile(null); onClear(); }}
              style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ✗ Não é
            </button>
          </div>
        </div>
      )}

      {/* Existe mas sem detalhes */}
      {status === "exists" && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>◎</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#15803d" }}>Perfil encontrado: @{rawHandle}</p>
              <p style={{ margin: 0, fontSize: 10, color: "#16a34a" }}>Perfil existe no Instagram</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <a href={`https://www.instagram.com/${rawHandle}/`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: "#7c3aed", textDecoration: "none", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 7, padding: "4px 8px" }}>
              Ver perfil ↗
            </a>
            <button onClick={() => { onConfirm(`@${rawHandle}`); setStatus("idle"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}>
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Não encontrado */}
      {status === "not_found" && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>✕</span>
            <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>@{rawHandle} não encontrado no Instagram</p>
          </div>
          <button onClick={() => { setStatus("idle"); onClear(); }}
            style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Corrigir
          </button>
        </div>
      )}

      {/* Incerto */}
      {status === "unverified" && (
        <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>◬</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#92400e" }}>Não foi possível verificar automaticamente</p>
              <p style={{ margin: 0, fontSize: 10, color: "#a16207" }}>O Instagram pode estar com acesso restrito</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <a href={`https://www.instagram.com/${rawHandle}/`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: "#7c3aed", textDecoration: "none", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 7, padding: "4px 8px" }}>
              Abrir manualmente ↗
            </a>
            <button onClick={() => { onConfirm(`@${rawHandle}`); setStatus("idle"); }}
              style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}>
              Usar assim mesmo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: BANNER COMPARATIVO — aparece após análise, 1 clique
// Auto-preenche dados do clientProfile; edição inline mínima se precisar
// ─────────────────────────────────────────────────────────────────────────────
function CompetitiveBanner({ comp, myCompany, profileLoaded, onCompare, onEditCompany }: {
  comp:           any;
  myCompany:      MyCompanyData;
  profileLoaded:  boolean;
  onCompare:      () => void;
  onEditCompany:  (updated: MyCompanyData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<MyCompanyData>(myCompany);

  // Sincroniza draft quando myCompany mudar (ex: carregou do perfil)
  useEffect(() => { setDraft(myCompany); }, [myCompany.name]);

  const hasData = !!myCompany.name.trim();

  function saveAndCompare() {
    onEditCompany(draft);
    setEditing(false);
    setTimeout(onCompare, 50); // aguarda state propagar
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {/* ── Estado: dados carregados do perfil → botão direto ── */}
      {!editing && hasData && (
        <div style={{
          background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",
          borderRadius: 14, padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⚔️</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "white" }}>
                Comparar <span style={{ color: "#4ade80" }}>{myCompany.name}</span> vs <span style={{ color: "#f87171" }}>{comp.name}</span>
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#475569" }}>
                SWOT Competitiva · Blue Ocean · Competitive Matrix
                {profileLoaded && <span style={{ marginLeft: 6, color: "#22c55e" }}>● dados do seu perfil</span>}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setEditing(true)}
              style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: "#94a3b8", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            >✏️</button>
            <button
              className="btn btn-md btn-primary"
              onClick={onCompare}
              style={{ fontSize: 12, padding: "8px 16px" }}
            >Ver análise →</button>
          </div>
        </div>
      )}

      {/* ── Estado: sem dados → mini formulário inline ── */}
      {!editing && !hasData && (
        <div style={{
          background: "linear-gradient(135deg,#0f172a,#1e3a5f)",
          borderRadius: 14, padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚔️</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "white" }}>Análise comparativa disponível</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#475569" }}>Informe o nome da sua empresa para gerar SWOT + Blue Ocean</p>
            </div>
          </div>
          <button
            className="btn btn-md btn-primary"
            style={{ fontSize: 12, flexShrink: 0 }}
            onClick={() => setEditing(true)}
          >Comparar com minha empresa →</button>
        </div>
      )}

      {/* ── Estado: edição inline compacta ── */}
      {editing && (
        <div style={{
          background: "white", border: "2px solid #4ade80", borderRadius: 14,
          padding: 16, animation: "fadeIn .15s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--black)" }}>🏢 Sua empresa</p>
            <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { key: "name",     label: "Nome *",    placeholder: "Minha Empresa" },
              { key: "facebook", label: "Facebook",  placeholder: "fb.com/pagina" },
              { key: "website",  label: "Site",      placeholder: "www.empresa.com" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>{f.label}</label>
                <input
                  className="input"
                  placeholder={f.placeholder}
                  value={draft[f.key as keyof MyCompanyData] || ""}
                  onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", fontSize: 12, padding: "7px 10px" }}
                  autoFocus={f.key === "name"}
                />
              </div>
            ))}
            {/* Instagram com verificador */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>Instagram</label>
              <input
                className="input"
                placeholder="@handle"
                value={draft.instagram || ""}
                onChange={e => setDraft(p => ({ ...p, instagram: e.target.value }))}
                style={{ width: "100%", fontSize: 12, padding: "7px 10px",
                  borderColor: draft.instagram ? "#a78bfa" : undefined }}
              />
              <InstagramVerifier
                handle={draft.instagram || ""}
                onConfirm={h => setDraft(p => ({ ...p, instagram: h }))}
                onClear={() => setDraft(p => ({ ...p, instagram: "" }))}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
            <button
              className="btn btn-sm btn-primary"
              disabled={!draft.name.trim()}
              onClick={saveAndCompare}
            >🚀 Gerar análise comparativa</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: PAINEL COMPARATIVO (Competitive Intelligence Matrix)
// Método: SWOT Competitiva + Blue Ocean Strategy + Jobs-to-be-Done
// ─────────────────────────────────────────────────────────────────────────────
interface MyCompanyData {
  name: string;
  instagram?: string;
  facebook?: string;
  website?: string;
}

function CompetitivePanel({ comp, myCompany, tiktokData, onClose }: {
  comp:        any;
  myCompany:   MyCompanyData;
  tiktokData?: any;
  onClose:     () => void;
}) {
  const ads: any[]  = comp.scrapedAds || [];
  const insights     = comp.aiInsights || "";

  // ── FONTES DISPONÍVEIS ─────────────────────────────────────────────────────
  const sources     = ads.map((a: any) => a.source || "unknown");
  const hasMeta     = ads.length > 0;
  const hasMetaReal = sources.some((s: string) => s === "meta_ads_archive" || s.startsWith("ads_library"));
  const hasMetaEst  = !hasMetaReal && ads.length > 0;
  const hasTikTok      = !!(tiktokData?.adsFound > 0);
  const googleKeywords = ads.filter((a: any) => a.source === "google_keyword_planner" || a.platform === "google");
  const hasGoogle      = googleKeywords.length > 0;

  // ── META ──────────────────────────────────────────────────────────────────
  const adsAtivos    = ads.filter((a: any) => a.isActive === 1 || a.isActive === true).length;
  const totalAds     = ads.length;
  const formats      = ads.reduce((acc: any, a: any) => { const k = a.adType||"image"; acc[k]=(acc[k]||0)+1; return acc; }, {} as Record<string,number>);
  const topFormat    = Object.entries(formats).sort((a: any,b: any)=>b[1]-a[1])[0]?.[0] || "imagem";
  const ctas         = ads.reduce((acc: any, a: any) => { if(a.cta) acc[a.cta]=(acc[a.cta]||0)+1; return acc; }, {} as Record<string,number>);
  const topCta       = Object.entries(ctas).sort((a: any,b: any)=>b[1]-a[1])[0]?.[0] || "Saiba mais";

  // ── TIKTOK ────────────────────────────────────────────────────────────────
  const tiktokAds    = tiktokData?.ads || [];
  const tiktokCount  = tiktokData?.adsFound || 0;
  const tiktokViews  = tiktokAds.reduce((s: number, a: any) => s+(a.viewCount||0), 0);
  const tiktokFormats= [...new Set(tiktokAds.map((a: any) => a.adType||"video"))];

  // ── SCORES REAIS CRUZADOS ─────────────────────────────────────────────────
  function scoreKW(text: string, kws: string[], base = 4, max = 10) {
    const t = text.toLowerCase(); let s = base;
    kws.forEach(k => { if(t.includes(k.toLowerCase())) s+=1; });
    return Math.min(max, s);
  }

  const compScores = {
    meta_presenca:    hasMeta ? Math.min(10, 2+Math.floor(totalAds/2)) : 0,
    meta_atividade:   hasMeta ? Math.min(10, 2+Math.floor(adsAtivos/2)) : 0,
    meta_diversidade: hasMeta ? Math.min(10, Object.keys(formats).length*2+(hasMetaReal?2:0)) : 0,
    tiktok_presenca:  hasTikTok ? Math.min(10, 3+Math.floor(tiktokCount/3)) : 0,
    tiktok_alcance:   hasTikTok ? (tiktokViews>1000000?9:tiktokViews>100000?7:tiktokViews>10000?5:3) : 0,
    maturidade:       scoreKW(insights, ["profissional","qualidade","posicionamento","premium","autoridade","branding"]),
    clareza:          scoreKW(insights, ["oferta","desconto","promoção","urgência","resultado","garantia"]),
  };
  const myScores = {
    meta_presenca:    myCompany.facebook ? 5 : 3,
    meta_atividade:   myCompany.facebook ? 5 : 3,
    meta_diversidade: 4,
    tiktok_presenca:  0,
    tiktok_alcance:   0,
    maturidade:       6,
    clareza:          6,
  };

  const dimensions = [
    { key:"meta_presenca",    label:"Presença Meta",        icon:"🔵", platform:"Meta",   color:"#1877f2" },
    { key:"meta_atividade",   label:"Anúncios Ativos",      icon:"📢", platform:"Meta",   color:"#1877f2" },
    { key:"meta_diversidade", label:"Diversidade Formatos", icon:"🎨", platform:"Meta",   color:"#1877f2" },
    { key:"tiktok_presenca",  label:"Presença TikTok",      icon:"🎵", platform:"TikTok", color:"#010101" },
    { key:"tiktok_alcance",   label:"Alcance TikTok",       icon:"🔥", platform:"TikTok", color:"#010101" },
    { key:"maturidade",       label:"Maturidade Mkt",       icon:"🧠", platform:"IA",     color:"#7c3aed" },
    { key:"clareza",          label:"Clareza da Oferta",    icon:"🎯", platform:"IA",     color:"#7c3aed" },
  ];

  const myAvg   = Object.values(myScores).reduce((a,b)=>a+b,0)/dimensions.length;
  const compAvg = Object.values(compScores).reduce((a,b)=>a+b,0)/dimensions.length;
  const myWins  = myAvg >= compAvg;
  const diff    = Math.abs(myAvg-compAvg).toFixed(1);

  const compVantagens = dimensions.filter(d => compScores[d.key as keyof typeof compScores] > myScores[d.key as keyof typeof myScores]);
  const myVantagens   = dimensions.filter(d => myScores[d.key as keyof typeof myScores]   > compScores[d.key as keyof typeof compScores]);
  const empates       = dimensions.filter(d => myScores[d.key as keyof typeof myScores]   === compScores[d.key as keyof typeof compScores]);

  const fontesBadge = [
    { label:"Meta Ads",   ok:hasMeta,   est:hasMetaEst, icon:"🔵", color:"#1877f2", bg:"#e8f0fe" },
    { label:"TikTok",     ok:hasTikTok, est:false,      icon:"🎵", color:"#010101", bg:"#f0f0f0" },
    { label:"Google Ads", ok:hasGoogle, est:false,      icon:"🔍", color:"#ea4335", bg:"#fde8e8" },
    { label:"IA Insights",ok:!!insights,est:false,      icon:"🧠", color:"#7c3aed", bg:"#f5f3ff" },
  ];

  const blueOcean = [
    hasTikTok
      ? { icon:"🎵", title:"TikTok — terreno do concorrente", desc:`${comp.name} tem ${tiktokCount} ad(s) no TikTok com ${tiktokViews.toLocaleString("pt-BR")} views. ${myScores.tiktok_presenca===0?"Sua empresa ainda não marcou presença — oportunidade antes que o mercado sature.":"Diferencie o formato."}` }
      : { icon:"🎵", title:"TikTok — canal não verificado", desc:`Não confirmado. Use "Buscar TikTok" no Raio-X para verificar presença do ${comp.name}.` },
    hasGoogle
      ? { icon:"🔍", title:`Google Ads — ${googleKeywords.length} keywords`, desc:`Palavras-chave do nicho: ${googleKeywords.slice(0,3).map((k:any)=>k.headline).join(", ")}` }
      : { icon:"🔍", title:"Google Ads — não coletado", desc:`Integre Google Ads em Configurações para incluir essa dimensão.` },
    { icon:"🎨", title:`Além do ${topFormat}`, desc:`${comp.name} foca em ${topFormat}. Explore formatos menos saturados.` },
    { icon:"🎯", title:`CTA além de "${topCta}"`, desc:`CTAs mais específicos ao momento do cliente convertem melhor que "${topCta}".` },
  ];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, width:"100%", maxWidth:900, maxHeight:"94vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,.35)" }}>

        {/* HEADER */}
        <div style={{ background:"linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius:"20px 20px 0 0", padding:"20px 26px", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
            <div>
              <p style={{ margin:0, fontSize:10, color:"#475569", fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Competitive Intelligence Matrix</p>
              <h2 style={{ margin:"4px 0 0", fontSize:19, fontWeight:900, color:"white" }}>
                <span style={{ color:"#4ade80" }}>{myCompany.name}</span>
                <span style={{ color:"#334155", fontWeight:400, margin:"0 8px" }}>vs</span>
                <span style={{ color:"#f87171" }}>{comp.name}</span>
              </h2>
              <div style={{ display:"flex", gap:5, marginTop:8, flexWrap:"wrap" }}>
                {fontesBadge.map(f => (
                  <span key={f.label} style={{ fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:20, background:f.ok?f.bg:"#f1f5f9", color:f.ok?f.color:"#94a3b8", border:`1px solid ${f.ok?f.color+"33":"#e2e8f0"}`, opacity:f.ok?1:0.55 }}>
                    {f.icon} {f.label} {f.ok?(f.est?"≈est":"✓"):"—"}
                  </span>
                ))}
                {!hasTikTok && <span style={{ fontSize:10, color:"#f59e0b", fontStyle:"italic" }}>⚡ Clique "Buscar TikTok" no Raio-X para dados reais</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,.1)", border:"none", color:"white", width:34, height:34, borderRadius:"50%", cursor:"pointer", fontSize:18, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
          </div>
        </div>

        <div style={{ padding:22, display:"flex", flexDirection:"column", gap:18 }}>

          {/* PLACAR */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:12, alignItems:"center" }}>
            <div style={{ background:myWins?"linear-gradient(135deg,#f0fdf4,#dcfce7)":"#f8fafc", border:`2px solid ${myWins?"#4ade80":"#e2e8f0"}`, borderRadius:14, padding:16, textAlign:"center" }}>
              <div style={{ width:42,height:42,borderRadius:"50%",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 8px" }}>🏢</div>
              <p style={{ margin:0,fontSize:14,fontWeight:900,color:"var(--black)" }}>{myCompany.name}</p>
              {myCompany.instagram && <p style={{ margin:"2px 0 6px",fontSize:11,color:"var(--muted)" }}>{myCompany.instagram}</p>}
              <p style={{ margin:"8px 0 2px",fontSize:30,fontWeight:900,color:myWins?"#16a34a":"#0f172a" }}>{myAvg.toFixed(1)}</p>
              <p style={{ margin:0,fontSize:10,color:"var(--muted)" }}>média / 10</p>
              {myWins && <div style={{ marginTop:8,display:"inline-block",fontSize:11,fontWeight:700,color:"#16a34a",background:"#dcfce7",padding:"3px 10px",borderRadius:20 }}>◎ Vantagem</div>}
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ width:46,height:46,borderRadius:"50%",background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:12,fontWeight:900,color:"#64748b" }}>VS</div>
              <p style={{ margin:"6px 0 0",fontSize:10,color:"var(--muted)",fontWeight:700 }}>Δ {diff} pts</p>
            </div>
            <div style={{ background:!myWins?"linear-gradient(135deg,#fef2f2,#fee2e2)":"#f8fafc", border:`2px solid ${!myWins?"#f87171":"#e2e8f0"}`, borderRadius:14, padding:16, textAlign:"center" }}>
              <div style={{ width:42,height:42,borderRadius:"50%",background:"#dc2626",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 8px" }}>🎯</div>
              <p style={{ margin:0,fontSize:14,fontWeight:900,color:"var(--black)" }}>{comp.name}</p>
              <p style={{ margin:"2px 0 6px",fontSize:11,color:"var(--muted)" }}>{totalAds} ads Meta{hasTikTok?` · ${tiktokCount} TikTok`:""}</p>
              <p style={{ margin:"8px 0 2px",fontSize:30,fontWeight:900,color:!myWins?"#dc2626":"#0f172a" }}>{compAvg.toFixed(1)}</p>
              <p style={{ margin:0,fontSize:10,color:"var(--muted)" }}>média / 10</p>
              {!myWins && <div style={{ marginTop:8,display:"inline-block",fontSize:11,fontWeight:700,color:"#dc2626",background:"#fee2e2",padding:"3px 10px",borderRadius:20 }}>⚠️ Atenção</div>}
            </div>
          </div>

          {/* COMPARATIVO POR PLATAFORMA */}
          <div style={{ background:"#f8fafc", borderRadius:14, padding:16 }}>
            <p style={{ margin:"0 0 14px",fontSize:13,fontWeight:800,color:"var(--black)" }}>📊 Comparativo por plataforma</p>
            {(["Meta","TikTok","IA"] as const).map(plat => {
              const dims = dimensions.filter(d => d.platform === plat);
              const platColor = dims[0]?.color||"#64748b";
              const platIcon  = plat==="Meta"?"🔵":plat==="TikTok"?"🎵":"🧠";
              const platHasData = plat==="Meta"?hasMeta:plat==="TikTok"?hasTikTok:!!insights;
              return (
                <div key={plat} style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:12 }}>{platIcon}</span>
                    <span style={{ fontSize:11,fontWeight:800,color:platColor,textTransform:"uppercase",letterSpacing:.8 }}>{plat}</span>
                    {!platHasData && (
                      <span style={{ fontSize:10,color:"#94a3b8",background:"#f1f5f9",padding:"1px 7px",borderRadius:10,marginLeft:4 }}>
                        {plat==="TikTok"?"busque no Raio-X":plat==="Meta"?"sem dados":"—"}
                      </span>
                    )}
                  </div>
                  {dims.map(d => {
                    const mine  = myScores[d.key as keyof typeof myScores];
                    const their = compScores[d.key as keyof typeof compScores];
                    const iWin  = mine >= their;
                    return (
                      <div key={d.key} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3 }}>
                          <span style={{ fontSize:12,fontWeight:600,color:"var(--black)" }}>{d.icon} {d.label}</span>
                          <div style={{ display:"flex",gap:5,alignItems:"center",fontSize:11 }}>
                            <span style={{ fontWeight:700,color:iWin?"#16a34a":"#6366f1" }}>{mine}/10</span>
                            <span style={{ color:"#cbd5e1" }}>|</span>
                            <span style={{ fontWeight:700,color:!iWin?"#dc2626":"#94a3b8" }}>{their}/10</span>
                          </div>
                        </div>
                        <div style={{ position:"relative",height:8,background:"#e2e8f0",borderRadius:4,overflow:"hidden" }}>
                          <div style={{ position:"absolute",left:0,top:0,height:"100%",width:`${their*10}%`,background:"rgba(239,68,68,.2)",transition:"width .7s" }}/>
                          <div style={{ position:"absolute",left:0,top:0,height:"100%",width:`${mine*10}%`,background:iWin?"rgba(34,197,94,.7)":"rgba(99,102,241,.5)",transition:"width .7s" }}/>
                        </div>
                        <div style={{ display:"flex",justifyContent:"space-between",marginTop:2 }}>
                          <span style={{ fontSize:9,color:iWin?"#16a34a":"#6366f1",fontWeight:600 }}>🏢 {myCompany.name}</span>
                          <span style={{ fontSize:9,color:"#ef4444",fontWeight:600 }}>{comp.name} 🎯</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* SWOT */}
          <div>
            <p style={{ margin:"0 0 10px",fontSize:13,fontWeight:800,color:"var(--black)" }}>⚔️ SWOT Competitiva</p>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div style={{ background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#16a34a" }}>💪 FORÇAS — {myCompany.name}</p>
                {myVantagens.length>0?myVantagens.map(d=>(
                  <div key={d.key} style={{ display:"flex",gap:5,marginBottom:5,alignItems:"center" }}>
                    <span style={{ fontSize:12 }}>{d.icon}</span>
                    <span style={{ fontSize:11,color:"#166534" }}>{d.label} <strong>+{myScores[d.key as keyof typeof myScores]-compScores[d.key as keyof typeof compScores]}pts</strong></span>
                  </div>
                )):<p style={{ fontSize:11,color:"#15803d",margin:0 }}>Equilibrado. Invista em diferenciais qualitativos.</p>}
              </div>
              <div style={{ background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#dc2626" }}>⚡ FORÇAS — {comp.name}</p>
                {compVantagens.length>0?compVantagens.map(d=>(
                  <div key={d.key} style={{ display:"flex",gap:5,marginBottom:5,alignItems:"center" }}>
                    <span style={{ fontSize:12 }}>{d.icon}</span>
                    <span style={{ fontSize:11,color:"#991b1b" }}>{d.label} <strong>+{compScores[d.key as keyof typeof compScores]-myScores[d.key as keyof typeof myScores]}pts</strong></span>
                  </div>
                )):<p style={{ fontSize:11,color:"#dc2626",margin:0 }}>Nenhuma vantagem detectada.</p>}
              </div>
              <div style={{ background:"#eff6ff",border:"1px solid #93c5fd",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#1d4ed8" }}>🔭 OPORTUNIDADES</p>
                {compVantagens.map(d=>(<p key={d.key} style={{ fontSize:11,color:"#1e40af",margin:"0 0 4px" }}>→ Melhorar <strong>{d.label}</strong> ({d.platform})</p>))}
                {!hasTikTok && <p style={{ fontSize:11,color:"#1e40af",margin:"0 0 4px" }}>→ Verificar TikTok — canal não analisado</p>}
                {hasGoogle
                  ? <p style={{ fontSize:11,color:"#16a34a",margin:"0 0 4px",fontWeight:700 }}>◎ {googleKeywords.length} keywords Google coletadas</p>
                  : <p style={{ fontSize:11,color:"#1e40af",margin:"0 0 4px" }}>→ Configure Google Ads em Integrações para coletar keywords</p>
                }
                {empates.length>0 && <p style={{ fontSize:11,color:"#1e40af",margin:0 }}>→ Empate em: {empates.map(d=>d.label).join(", ")}</p>}
              </div>
              <div style={{ background:"#fef9c3",border:"1px solid #fde047",borderRadius:12,padding:14 }}>
                <p style={{ margin:"0 0 8px",fontSize:11,fontWeight:800,color:"#854d0e" }}>⚠️ AMEAÇAS</p>
                {hasTikTok && tiktokCount>0 && <p style={{ fontSize:11,color:"#92400e",margin:"0 0 4px" }}>→ {comp.name} ativo no TikTok ({tiktokCount} ads · {tiktokViews.toLocaleString("pt-BR")} views)</p>}
                {compVantagens.length>0 && <p style={{ fontSize:11,color:"#92400e",margin:"0 0 4px" }}>→ Vantagem em {compVantagens.length} dimensão(ões)</p>}
                <p style={{ fontSize:11,color:"#92400e",margin:0 }}>→ Formato principal: {topFormat} com CTA "{topCta}"</p>
              </div>
            </div>
          </div>

          {/* TIKTOK DETALHADO */}
          {hasTikTok && (
            <div style={{ background:"#0f172a",borderRadius:14,padding:16 }}>
              <p style={{ margin:"0 0 12px",fontSize:13,fontWeight:800,color:"white" }}>🎵 TikTok — dados reais de {comp.name}</p>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10,marginBottom:10 }}>
                {[
                  { label:"Anúncios",     value:tiktokCount },
                  { label:"Total Views",  value:tiktokViews>1000000?`${(tiktokViews/1000000).toFixed(1)}M`:tiktokViews>1000?`${(tiktokViews/1000).toFixed(0)}k`:tiktokViews },
                  { label:"Formatos",     value:tiktokFormats.join(", ")||"video" },
                ].map(m=>(
                  <div key={m.label} style={{ background:"rgba(255,255,255,.07)",borderRadius:10,padding:"10px 12px",textAlign:"center" }}>
                    <p style={{ margin:0,fontSize:18,fontWeight:900,color:"white" }}>{m.value}</p>
                    <p style={{ margin:0,fontSize:10,color:"#64748b" }}>{m.label}</p>
                  </div>
                ))}
              </div>
              {tiktokData?.insight && <p style={{ margin:0,fontSize:11,color:"#94a3b8",lineHeight:1.6 }}>{tiktokData.insight}</p>}
            </div>
          )}

          {/* GOOGLE ADS */}
          <div style={{ background:"#fafafa",border:"1.5px dashed #e2e8f0",borderRadius:12,padding:14,display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ width:38,height:38,borderRadius:10,background:"#fde8e8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>🔍</div>
            <div>
              <p style={{ margin:0,fontSize:13,fontWeight:700,color:"var(--black)" }}>Google Ads — não coletado ainda</p>
              <p style={{ margin:"2px 0 0",fontSize:11,color:"var(--muted)" }}>
                Configure <strong>Configurações → Google Ads</strong> para incluir essa dimensão na análise.
              </p>
            </div>
          </div>

          {/* BLUE OCEAN */}
          <div style={{ background:"linear-gradient(135deg,#0f172a,#1e3a5f)",borderRadius:14,padding:16 }}>
            <p style={{ margin:"0 0 12px",fontSize:13,fontWeight:800,color:"white" }}>🌊 Blue Ocean — onde {myCompany.name} pode se diferenciar</p>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              {blueOcean.map((item,i)=>(
                <div key={i} style={{ background:"rgba(255,255,255,.06)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,.07)" }}>
                  <div style={{ display:"flex",gap:8,alignItems:"flex-start" }}>
                    <span style={{ fontSize:18,flexShrink:0 }}>{item.icon}</span>
                    <div>
                      <p style={{ margin:0,fontSize:11,fontWeight:800,color:"white",marginBottom:3 }}>{item.title}</p>
                      <p style={{ margin:0,fontSize:11,color:"#94a3b8",lineHeight:1.5 }}>{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VEREDICTO */}
          <div style={{ background:myWins?"linear-gradient(135deg,#f0fdf4,#dcfce7)":"linear-gradient(135deg,#fef2f2,#fee2e2)", border:`2px solid ${myWins?"#4ade80":"#f87171"}`, borderRadius:14, padding:16, textAlign:"center" }}>
            <p style={{ margin:"0 0 6px",fontSize:22 }}>{myWins?"◆":"💪"}</p>
            <p style={{ margin:"0 0 6px",fontSize:15,fontWeight:900,color:"var(--black)" }}>
              {myWins?`${myCompany.name} tem vantagem de ${diff} pontos`:`${comp.name} lidera por ${diff} pontos — hora de agir`}
            </p>
            <p style={{ margin:"0 0 8px",fontSize:12,color:"var(--muted)" }}>
              {myWins?"Continue monitorando. Amplie a vantagem com consistência nas plataformas.":`Priorize: ${compVantagens.slice(0,2).map(d=>d.label).join(", ")}.`}
            </p>
            <p style={{ margin:0,fontSize:10,color:"#94a3b8" }}>
              Cruzado: Meta {hasMeta?"✓":"—"} · TikTok {hasTikTok?"✓":"—"} · Google Ads — · IA {insights?"✓":"—"}
            </p>
          </div>

          <div style={{ display:"flex",justifyContent:"flex-end" }}>
            <button className="btn btn-md btn-ghost" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function CompetitorAnalysis() {
  const params    = useParams<{ id: string }>();
  const projectId = Number(params.id || 0);
  const [, setLocation] = useLocation();

  const { data: competitors, refetch, isLoading, isError } = trpc.competitors.list.useQuery(
    { projectId }, { enabled: !!projectId, refetchInterval: false }
  );
  const deleteComp  = trpc.competitors.delete.useMutation({ onSuccess: () => refetch() });
  const analyzeComp = trpc.competitors.analyze.useMutation({ onSuccess: () => refetch() });
  const fetchTikTokCompetitorMutation = (trpc as any).competitors?.fetchTikTokCompetitor?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.needsAuth) {
        toast.error(data.message);
        return;
      }
      if (data?.videosSaved > 0) {
        toast.success(data.message);
        refetch();
      } else {
        toast.error(data?.message || "✕ Nenhum vídeo TikTok encontrado.");
      }
    },
    onError: (e: any) => toast.error("✕ TikTok: " + (e?.message || "Erro ao buscar")),
  }) ?? { mutate: () => {}, isPending: false };

  const fetchAdsByPageIdMutation = (trpc as any).competitors?.fetchAdsByPageId?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.adsSaved > 0) {
        toast.success(data.message);
        refetch();
      } else {
        toast.error(data?.message || "✕ Nenhum dado encontrado. Verifique permissões do token Meta.");
      }
    },
    onError: (e: any) => toast.error("✕ " + (e?.message || "Erro ao buscar pelo Page ID")),
  }) ?? { mutate: () => {}, isPending: false };

  const [adding,    setAdding]    = useState(false);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [selected,  setSelected]  = useState<number | null>(null);
  const [editing,   setEditing]   = useState<number | null>(null);
  const [searchQ,   setSearchQ]   = useState("");

  // ── Minha empresa — carrega automaticamente do clientProfile ─────────────
  const { data: project       } = (trpc as any).projects?.get?.useQuery?.({ id: projectId }, { enabled: !!projectId }) ?? { data: null };
  const { data: clientProfile } = (trpc as any).clientProfile?.get?.useQuery?.({ projectId }, { enabled: !!projectId }) ?? { data: null };

  // Monta myCompany a partir do perfil salvo — usuário pode sobrescrever
  const derivedCompany: MyCompanyData = {
    name:      clientProfile?.companyName ?? project?.name ?? "",
    instagram: (() => {
      try {
        const links = JSON.parse(clientProfile?.socialLinks || "{}");
        return links.instagram || links.ig || "";
      } catch { return ""; }
    })(),
    facebook:  (() => {
      try {
        const links = JSON.parse(clientProfile?.socialLinks || "{}");
        return links.facebook || links.fb || "";
      } catch { return ""; }
    })(),
    website: clientProfile?.websiteUrl || "",
  };

  const [myCompany,       setMyCompany]       = useState<MyCompanyData>({ name: "", instagram: "", facebook: "", website: "" });
  const [showComparative, setShowComparative] = useState(false);
  const [compareTarget,   setCompareTarget]   = useState<any>(null);
  const [myCompanyReady,  setMyCompanyReady]  = useState(false);
  const [tiktokResultMap, setTiktokResultMap] = useState<Record<number,any>>({});

  // Sincroniza derivedCompany → myCompany quando carrega (apenas uma vez)
  useEffect(() => {
    if (!myCompanyReady && derivedCompany.name) {
      setMyCompany(derivedCompany);
      setMyCompanyReady(true);
    }
  }, [derivedCompany.name, myCompanyReady]);

  async function handleAnalyze(id: number, force = false) {
    setAnalyzing(id);
    try {
      await analyzeComp.mutateAsync({ competitorId: id, projectId, force });
      toast.success("Análise concluída!");
    } catch (err: any) {
      console.error("Analyze error", err);
      const msg = err?.message || "Erro desconhecido";
      if (msg.includes("TIMEOUT") || msg.includes("demorou")) {
        toast.error("A análise demorou mais que o esperado. Tente novamente.", { duration: 6000 });
      } else {
        toast.error(`Erro na análise: ${msg.slice(0, 120)}`, { duration: 8000 });
      }
    } finally {
      setAnalyzing(null);
      await refetch();
    }
  }

  const filteredCompetitors = (competitors || []).filter((c: any) =>
    !searchQ || c.name.toLowerCase().includes(searchQ.toLowerCase())
  );

  const selectedComp  = competitors?.find((c: any) => c.id === selected);
  const noCompetitors = (competitors?.length || 0) === 0;
  const gridCols =
    selected && !adding    ? "370px 1fr" :
    adding  && !selected   ? "1fr 1fr"   :
    noCompetitors && !adding ? "1fr"      : "370px 1fr";

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔍</div>
          <div>
            <button className="btn btn-sm btn-ghost" onClick={() => setLocation(`/projects/${projectId}/client`)} style={{ paddingLeft: 0, marginBottom: 6 }}>← Módulo 1</button>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>Análise de Concorrentes</h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Módulo 2 — Sistema de coleta com 7 camadas de fallback</p>
          </div>
        </div>

        {/* Banner cascata */}
        <div style={{ background: "var(--navy)", borderRadius: 14, padding: "14px 18px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>🧠</span>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 6 }}>Pipeline de coleta com 7 camadas de fallback:</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CASCADE_LAYERS.map((l) => (
                  <span key={l.n} style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: l.bg, color: l.color }}>
                    {l.n}. {l.icon} {l.label.split("→")[0].trim()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#dc2626", fontWeight: 700 }}>✕ Erro ao carregar concorrentes</p>
          <button className="btn btn-sm btn-ghost" onClick={() => refetch()} style={{ marginTop: 8 }}>Tentar novamente</button>
        </div>
      )}

      {!projectId ? (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>⚠️ Acesse esta página a partir de um projeto.</p>
        </div>
      ) : isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p style={{ fontSize: 14 }}>Carregando concorrentes…</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 22, alignItems: "start" }}>

          {/* ── COLUNA ESQUERDA ── */}
          <div>
            {/* Estado vazio */}
            {noCompetitors && !adding && (
              <div style={{ background: "white", border: "2px dashed var(--green)", borderRadius: 18, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>🏁</div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Adicione seu primeiro concorrente</h2>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 24, maxWidth: 380, margin: "0 auto 24px" }}>
                  Cole o link da Ads Library, pesquise pelo nome da empresa ou pelo @handle do Instagram. O sistema usará as 7 camadas para encontrar os anúncios.
                </p>
                <button className="btn btn-lg btn-green" onClick={() => setAdding(true)} style={{ margin: "0 auto" }}>+ Adicionar concorrente</button>
              </div>
            )}

            {/* Formulário de adição */}
            {adding && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>Novo concorrente</p>
                  <button onClick={() => setAdding(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>✕ Cancelar</button>
                </div>
                <AddCompetitorForm projectId={projectId} onDone={() => { refetch(); setAdding(false); }} />
              </>
            )}

            {/* ── Tabela comparativa de gasto dos concorrentes ── */}
            {(competitors?.length || 0) > 1 && !adding && (
              <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 18, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{"◈"}</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Estimativa de Investimento em Tráfego Pago</p>
                    <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Baseado em anúncios ativos, dias no ar, formato e CPM do nicho</p>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Concorrente", "Anúncios", "Dias no ar", "Formato", "Gasto estimado/mês", "Confiança"].map((h: string) => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" as const, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(competitors || []).map((comp: any) => {
                        const compAds   = comp.scrapedAds || [];
                        if (compAds.length === 0) return (
                          <tr key={comp.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{comp.name}</td>
                            <td colSpan={5} style={{ padding: "10px 12px", color: "var(--muted)", fontSize: 11 }}>Sem anúncios — analise o concorrente primeiro</td>
                          </tr>
                        );
                        const activeC  = compAds.filter((a: any) => a.isActive || a.isActive === 1).length;
                        const now3     = Date.now();
                        const daysC    = compAds.filter((a: any) => a.startDate).map((a: any) =>
                          Math.max(1, Math.round((now3 - new Date(a.startDate).getTime()) / 86400000)));
                        const avgDC    = daysC.length > 0 ? Math.round(daysC.reduce((s: number, d: number) => s + d, 0) / daysC.length) : 30;
                        const fmtsC    = compAds.map((a: any) => (a.adType || "image") as string);
                        const vidC     = fmtsC.filter((f: string) => f.toLowerCase().includes("video")).length;
                        const isVidC   = vidC > fmtsC.length * 0.5;
                        const multC    = isVidC ? 1.4 : 1.0;
                        const mfC      = 30 / Math.min(Math.max(avgDC, 1), 90);
                        const daily    = isVidC ? 800 : 500;
                        const spMin    = Math.round((Math.max(activeC,1) * avgDC * daily * 0.7 * 10 * multC / 1000) * mfC);
                        const spMax    = Math.round((Math.max(activeC,1) * avgDC * daily * 1.3 * 25 * multC / 1000) * mfC);
                        const conf     = activeC >= 10 && daysC.length >= 5 ? "alta" : activeC >= 3 ? "média" : "baixa";
                        const confClr  = conf === "alta" ? "#166534" : conf === "média" ? "#92400e" : "#64748b";
                        const confBg2  = conf === "alta" ? "#dcfce7" : conf === "média" ? "#fef3c7" : "#f1f5f9";
                        return (
                          <tr key={comp.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                            onClick={() => setSelected((selected === comp.id ? null : comp.id) as any)}>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--black)" }}>{comp.name}</td>
                            <td style={{ padding: "10px 12px", color: "var(--dark)" }}>{activeC}/{compAds.length}</td>
                            <td style={{ padding: "10px 12px", color: "var(--dark)" }}>{avgDC}d</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: isVidC ? "#ede9fe" : "#f0fdf4", color: isVidC ? "#7c3aed" : "#166534", fontWeight: 700 }}>
                                {isVidC ? "🎥 Vídeo" : "🖼️ Imagem"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>
                                {"R$ " + spMin.toLocaleString("pt-BR") + " – R$ " + spMax.toLocaleString("pt-BR")}
                              </span>
                              <span style={{ fontSize: 10, color: "var(--muted)", display: "block" }}>/mês</span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: confBg2, color: confClr, fontWeight: 700 }}>{conf}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
                  {"⚠️ Estimativa baseada em dados públicos da Meta Ads Library. Valores reais podem variar."}
                </p>
              </div>
            )}

            {/* Lista de concorrentes */}
            {(competitors?.length || 0) > 0 && (
              <div>
                {!adding && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>
                      Concorrentes <span style={{ color: "var(--muted)", fontWeight: 400 }}>({competitors?.length})</span>
                    </span>
                    <button className="btn btn-sm btn-primary" onClick={() => { setAdding(true); setSelected(null); }}>+ Adicionar</button>
                  </div>
                )}

                {/* Busca */}
                {(competitors?.length || 0) > 3 && !adding && (
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <input className="input" placeholder="Buscar concorrente…" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                      style={{ width: "100%", paddingLeft: 32, fontSize: 13 }} />
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14 }}>🔎</span>
                    {searchQ && <button onClick={() => setSearchQ("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--muted)" }}>✕</button>}
                  </div>
                )}

                {filteredCompetitors.map((c: any) => {
                  const hasAds      = (c.adsCount || 0) > 0;
                  const isActive    = selected === c.id;
                  const isEditing   = editing === c.id;
                  const isAnalyzing = analyzing === c.id;
                  const estCount    = (c.scrapedAds || []).filter((a: any) => {
                    const src = a.source || (a.adId?.startsWith("estimated_") ? "estimated" : null);
                    return !src || src === "unknown" || src === "estimated" || src === "estimated_ai";
                  }).length;
                  const allEst   = hasAds && estCount === (c.adsCount || 0);
                  const layer    = hasAds ? detectLayer(c.scrapedAds || []) : null;
                  const layerInfo = (layer && layer >= 1 && layer <= 7) ? CASCADE_LAYERS[layer - 1] : null;

                  return (
                    <div key={c.id}>
                      {isEditing && (
                        <EditCompetitorForm comp={c} onDone={() => { setEditing(null); refetch(); }} onCancel={() => setEditing(null)} />
                      )}

                      <div onClick={() => { if (!isAnalyzing && !isEditing) { setSelected(isActive ? null : c.id); setAdding(false); } }}
                        style={{
                          background: "white",
                          border: `1.5px solid ${isActive ? "var(--green)" : "var(--border)"}`,
                          borderRadius: 14, padding: 14, marginBottom: 10,
                          cursor: isAnalyzing || isEditing ? "default" : "pointer",
                          boxShadow: isActive ? "0 0 0 3px rgba(34,197,94,.08)" : "none",
                          opacity: isAnalyzing ? 0.7 : 1, transition: "all .2s",
                        }}>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {c.facebookPageId && <span style={{ fontSize: 10, color: "var(--muted)" }}>🔵 {c.facebookPageId}</span>}
                              {c.instagramUrl   && <span style={{ fontSize: 10, color: "#7c3aed" }}>📸 {extractIgHandle(c.instagramUrl)}</span>}
                              {c.websiteUrl     && <span style={{ fontSize: 10, color: "#0369a1" }}>🌐 site</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, marginLeft: 8 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap",
                              background: hasAds ? (allEst ? "#fef3c7" : "var(--green-xl)") : "var(--off)",
                              color:      hasAds ? (allEst ? "#92400e" : "var(--green-dk)") : "var(--muted)",
                            }}>
                              {hasAds ? (allEst ? `~${c.adsCount} estimados` : `${c.adsCount} anúncios`) : "Não analisado"}
                            </span>
                            {layerInfo && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: layerInfo.bg, color: layerInfo.color }}>
                                {layerInfo.icon} Camada {layer}
                              </span>
                            )}
                            {c.aiInsights && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#e8f0fe", color: "#1877f2" }}>🤖 IA</span>}
                          </div>
                        </div>

                        {/* Barra de progresso durante análise */}
                        {isAnalyzing && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", background: "var(--green)", borderRadius: 2, animation: "loading-bar 2s ease-in-out infinite", width: "60%" }} />
                            </div>
                            <p style={{ fontSize: 11, color: "var(--green-d)", marginTop: 3 }}>⏳ Tentando 7 camadas de coleta…</p>
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 5 }}>
                          <button className="btn btn-sm btn-green" disabled={isAnalyzing || isEditing}
                            onClick={e => { e.stopPropagation(); handleAnalyze(c.id); }}
                            style={{ flex: 1, fontSize: 11 }}>
                            {isAnalyzing ? "⏳ Analisando..." : hasAds ? "🔄 Re-analisar" : "🔍 Analisar"}
                          </button>
                          {c.instagramUrl && (
                            <button
                              title="Buscar vídeos/anúncios via TikTok API Oficial"
                              disabled={isAnalyzing}
                              onClick={e => {
                                e.stopPropagation();
                                const handle = (c.instagramUrl || "").replace(/^@/, "").replace(/.*tiktok\.com\/@?/, "");
                                (fetchTikTokCompetitorMutation as any).mutate({
                                  competitorId: c.id,
                                  projectId,
                                  tiktokHandle: handle,
                                });
                              }}
                              style={{
                                background: "#010101", color: "white", border: "none",
                                borderRadius: 8, padding: "0 8px", fontSize: 13,
                                cursor: "pointer", height: 30, display: "flex",
                                alignItems: "center", justifyContent: "center",
                              }}>
                              🎵
                            </button>
                          )}
                          {c.facebookPageId && (
                            <button
                              title="Buscar posts/anúncios pelo Page ID via token Meta"
                              disabled={isAnalyzing}
                              onClick={e => {
                                e.stopPropagation();
                                (fetchAdsByPageIdMutation as any).mutate({
                                  competitorId: c.id,
                                  projectId,
                                  pageId: c.facebookPageId,
                                });
                              }}
                              style={{
                                background: "#1877f2", color: "white", border: "none",
                                borderRadius: 8, padding: "0 8px", fontSize: 13,
                                cursor: "pointer", height: 30, display: "flex",
                                alignItems: "center", justifyContent: "center",
                                title: "Buscar pelo Page ID",
                              }}>
                              📡
                            </button>
                          )}
                          <button className="btn btn-sm btn-ghost"
                            onClick={e => { e.stopPropagation(); setEditing(isEditing ? null : c.id); setSelected(null); }}
                            style={{ fontSize: 11, padding: "0 10px" }}>✏️</button>
                          {c.facebookPageUrl && (
                            <a href={c.facebookPageUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, background: "var(--off)", fontSize: 13, textDecoration: "none" }}
                              title="Abrir Ads Library">🔗</a>
                          )}
                          <button className="btn btn-sm btn-ghost"
                            onClick={e => { e.stopPropagation(); if (confirm(`Remover "${c.name}"?`)) { deleteComp.mutate({ id: c.id }); if (selected === c.id) setSelected(null); }}}
                            style={{ fontSize: 12, color: "#ef4444", width: 30, padding: 0 }}>🗑</button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredCompetitors.length === 0 && searchQ && (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                    <p style={{ fontSize: 13 }}>Nenhum concorrente encontrado para "{searchQ}"</p>
                  </div>
                )}

                {/* Banner próximos passos */}
                {!adding && (
                  <div style={{ background: "var(--navy)", borderRadius: 12, padding: 16, marginTop: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 8 }}>🎯 Para anúncios reais:</p>
                    <a href="/settings" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(255,255,255,.08)", borderRadius: 8, textDecoration: "none" }}>
                      <span style={{ fontSize: 14 }}>📡</span>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "white", margin: 0 }}>Conectar Meta Ads</p>
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,.5)", margin: 0 }}>Ativa a camada 1 — API Oficial</p>
                      </div>
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--green)" }}>→</span>
                    </a>
                  </div>
                )}

                {/* CTA próximo módulo — igual ao padrão do Módulo 1 e Módulo 3 */}
                {!noCompetitors && !adding && (
                  <div style={{
                    background: "linear-gradient(135deg, var(--navy) 0%, #1a3a6e 100%)",
                    borderRadius: 16, padding: 20, marginTop: 12,
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
                  }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>
                        ◎ Concorrentes cadastrados! Próximo passo:
                      </p>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.5 }}>
                        Use os dados coletados para gerar a Análise de Mercado com IA.
                      </p>
                    </div>
                    <button
                      className="btn btn-green"
                      style={{ whiteSpace: "nowrap", fontWeight: 700, fontSize: 13, padding: "10px 20px" }}
                      onClick={() => setLocation(`/projects/${projectId}/market`)}
                    >
                      Ir para Módulo 3 →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── COLUNA DIREITA: Raio-X ── */}
          {selectedComp && !adding && (
            <>
              {/* Banner comparativo — aparece após análise, 1 clique só */}
              {selectedComp.aiInsights && (
                <CompetitiveBanner
                  comp={selectedComp}
                  myCompany={myCompany}
                  profileLoaded={myCompanyReady}
                  onCompare={() => { setCompareTarget(selectedComp); setShowComparative(true); }}
                  onEditCompany={(updated) => setMyCompany(updated)}
                />
              )}

              <RaioX
                comp={selectedComp}
                onClose={() => setSelected(null)}
                onAnalyze={handleAnalyze}
                analyzing={analyzing === selectedComp.id}
                onEdit={() => { setEditing(selected); setSelected(null); }}
                projectId={projectId}
                onTikTokResult={(data) => setTiktokResultMap(m => ({ ...m, [selectedComp.id]: data }))}
                onRefetch={refetch}
              />
            </>
          )}

          {/* Modal painel comparativo */}
          {showComparative && compareTarget && myCompany.name && (
            <CompetitivePanel
              comp={compareTarget}
              myCompany={myCompany}
              tiktokData={tiktokResultMap[compareTarget.id] ?? null}
              onClose={() => setShowComparative(false)}
            />
          )}

          {/* Coluna direita ao adicionar */}
          {adding && !selected && (
            <div style={{ background: "var(--navy)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 14 }}>🧠 Pipeline de 7 camadas</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", lineHeight: 1.7, marginBottom: 16 }}>
                Após adicionar, clique em "Analisar" e o sistema tentará automaticamente:
              </p>
              {CASCADE_LAYERS.map(l => (
                <div key={l.n} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: l.bg, color: l.color, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{l.n}</div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white", margin: 0 }}>{l.icon} {l.label}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,.4)", margin: 0 }}>{l.desc}</p>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 16, padding: 12, background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.6, margin: 0 }}>
                  💡 Dica: adicione o site do concorrente para ativar a camada 5 (web scraping) como fallback adicional.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes loading-bar { 0% { width: 0% } 50% { width: 80% } 100% { width: 60% } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
      `}</style>
    </Layout>
  );
}
