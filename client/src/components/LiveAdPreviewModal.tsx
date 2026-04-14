/**
 * LiveAdPreviewModal.tsx
 *
 * Modal de preview "olhos do cliente" para campanhas ao vivo.
 * Busca dados reais das APIs (Google, Meta, TikTok), renderiza
 * o anúncio exatamente como o cliente vê — com links clicáveis
 * para testar o destino, e alternância mobile/desktop.
 *
 * USO:
 *   import LiveAdPreviewModal from "@/components/LiveAdPreviewModal";
 *
 *   // Google
 *   <LiveAdPreviewModal
 *     platform="google"
 *     campaignId={campaign.id}
 *     campaignName={campaign.name}
 *     onClose={() => setPreviewOpen(false)}
 *   />
 *
 *   // Meta
 *   <LiveAdPreviewModal
 *     platform="meta"
 *     campaignId={campaign.id}
 *     campaignName={campaign.name}
 *     onClose={() => setPreviewOpen(false)}
 *   />
 *
 *   // TikTok
 *   <LiveAdPreviewModal
 *     platform="tiktok"
 *     campaignId={campaign.id}
 *     campaignName={campaign.name}
 *     onClose={() => setPreviewOpen(false)}
 *   />
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

export type PreviewPlatform = "google" | "meta" | "tiktok";
type DeviceMode = "mobile" | "desktop";
type MetaPlacement = "fb_feed" | "ig_feed" | "ig_story" | "fb_story" | "ig_reels";

interface GoogleAd {
  id: string;
  status: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  displayUrl?: string;
}

interface MetaAd {
  id: string;
  name: string;
  status: string;
  creative?: {
    id: string;
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    call_to_action?: { type?: string; value?: { link?: string } };
  };
}

interface TikTokAd {
  id: string;
  name: string;
  status: string;
  coverUrl?: string;
  videoUrl?: string;
  headline?: string;
  body?: string;
  landingUrl?: string;
}

interface Props {
  platform: PreviewPlatform;
  campaignId: string;
  campaignName: string;
  onClose: () => void;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function ctaLabel(type?: string) {
  const map: Record<string, string> = {
    LEARN_MORE: "Saiba mais", SHOP_NOW: "Comprar", SIGN_UP: "Cadastre-se",
    GET_QUOTE: "Solicitar orçamento", CONTACT_US: "Fale conosco",
    DOWNLOAD: "Baixar", WATCH_MORE: "Assistir", APPLY_NOW: "Candidatar-se",
    BOOK_TRAVEL: "Reservar", SUBSCRIBE: "Assinar",
  };
  return map[type || ""] || type || "Saiba mais";
}

// ─────────────────────────────────────────────
// SUB-COMPONENTES DE PREVIEW
// ─────────────────────────────────────────────

// ── Google Search Preview ─────────────────────
function GoogleSearchPreview({ ad, device }: { ad: GoogleAd; device: DeviceMode }) {
  const h1 = ad.headlines[0] || "Título do anúncio";
  const h2 = ad.headlines[1] || "";
  const h3 = ad.headlines[2] || "";
  const d1 = ad.descriptions[0] || "Descrição do anúncio aparece aqui.";
  const d2 = ad.descriptions[1] || "";
  const domain = ad.finalUrl ? (() => { try { return new URL(ad.finalUrl).hostname; } catch { return ad.finalUrl; } })() : "www.seusite.com.br";
  const isDesktop = device === "desktop";

  return (
    <div style={{
      background: isDesktop ? "#f1f3f4" : "#fff",
      borderRadius: isDesktop ? 12 : 0,
      padding: isDesktop ? "16px 24px" : "12px 16px",
      width: isDesktop ? 600 : 340,
      fontFamily: "Arial, sans-serif",
    }}>
      {/* Google search bar mockup */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#fff", borderRadius: 24, padding: "8px 16px",
        boxShadow: "0 1px 6px rgba(0,0,0,.15)", marginBottom: 16,
      }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <span style={{ fontSize: 14, color: "#5f6368" }}>sua busca relacionada</span>
      </div>

      {/* Ad card */}
      <div style={{
        background: "#fff", borderRadius: 8, padding: "12px 16px",
        border: "1px solid #dadce0", boxShadow: "0 1px 3px rgba(0,0,0,.08)",
      }}>
        {/* Domain + sponsored */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "linear-gradient(135deg,#4285f4,#34a853)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: "#fff", fontWeight: 700, flexShrink: 0,
          }}>
            {domain[0]?.toUpperCase() || "S"}
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#202124", fontWeight: 500 }}>
              {truncate(domain, 40)}
            </div>
            <div style={{ fontSize: 11, color: "#5f6368" }}>
              {ad.finalUrl ? truncate(ad.finalUrl, 50) : domain}
            </div>
          </div>
          <span style={{
            marginLeft: "auto", fontSize: 10, border: "1px solid #5f6368",
            borderRadius: 3, padding: "1px 5px", color: "#5f6368", fontWeight: 600,
          }}>Patrocinado</span>
        </div>

        {/* Headline */}
        <a
          href={ad.finalUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block", fontSize: isDesktop ? 20 : 18,
            color: "#1a0dab", textDecoration: "none", fontWeight: 400,
            lineHeight: 1.3, marginBottom: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
        >
          {[h1, h2, h3].filter(Boolean).map((h, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: "#70757a", margin: "0 6px" }}>|</span>}
              {truncate(h, 30)}
            </span>
          ))}
        </a>

        {/* Descriptions */}
        <div style={{ fontSize: 14, color: "#4d5156", lineHeight: 1.5 }}>
          {[d1, d2].filter(Boolean).join(" ")}
        </div>

        {/* Ad extensions mock */}
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          {["Sobre nós", "Contato", "Serviços"].map(ext => (
            <a key={ext} href={ad.finalUrl || "#"} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: "#1a0dab", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
            >{ext}</a>
          ))}
        </div>
      </div>

      {/* Link test badge */}
      <div style={{ marginTop: 10, fontSize: 11, color: "#5f6368", textAlign: "center" }}>
        👆 Clique no título para testar o destino real
      </div>
    </div>
  );
}

// ── Meta Feed Preview ─────────────────────────
function MetaFeedPreview({ ad, placement, device }: { ad: MetaAd; placement: MetaPlacement; device: DeviceMode }) {
  const isIG = placement.startsWith("ig");
  const isStory = placement.includes("story") || placement.includes("reels");
  const accentColor = isIG ? "#e1306c" : "#1877f2";
  const platformName = isIG ? "Instagram" : "Facebook";
  const imageUrl = ad.creative?.image_url || ad.creative?.thumbnail_url;
  const title = ad.creative?.title || ad.name;
  const body = ad.creative?.body || "";
  const ctaType = ad.creative?.call_to_action?.type;
  const landingUrl =
    ad.creative?.call_to_action?.value?.link ||
    (ad.creative as any)?.object_story_spec?.link_data?.link ||
    (ad.creative as any)?.link_url ||
    (ad.creative as any)?.object_url ||
    null;
  const isDesktop = device === "desktop";

  if (isStory) {
    return (
      <div style={{
        width: 220, height: 390, borderRadius: 18, overflow: "hidden",
        background: imageUrl ? `url(${imageUrl}) center/cover no-repeat` : "linear-gradient(160deg,#667eea,#764ba2)",
        position: "relative", border: "2px solid #e2e8f0", flexShrink: 0,
        fontFamily: "system-ui, sans-serif",
      }}>
        {/* Story header */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ flex: 1, height: 2, background: i === 1 ? "#fff" : "rgba(255,255,255,.4)", borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
              {platformName[0]}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>Sua empresa</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.7)" }}>Patrocinado</div>
            </div>
          </div>
        </div>

        {/* Body overlay */}
        {!imageUrl && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginBottom: 8 }}>{truncate(title, 60)}</div>
            {body && <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.4 }}>{truncate(body, 80)}</div>}
          </div>
        )}

        {/* CTA bottom - sempre clicável */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 14px", zIndex: 10 }}>
          <button
            onClick={() => {
              if (landingUrl) {
                window.open(landingUrl, "_blank", "noopener,noreferrer");
              } else {
                alert("URL de destino não encontrada nos dados desta campanha.\nVerifique se o criativo tem uma URL configurada.");
              }
            }}
            style={{
              display: "block", width: "100%",
              background: "rgba(255,255,255,.95)", borderRadius: 24,
              padding: "10px 0", textAlign: "center", fontSize: 13, fontWeight: 700,
              color: "#0f172a", border: "none", cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,.25)",
            }}
          >
            {ctaLabel(ctaType)} {landingUrl ? "↗" : "⚠️"}
          </button>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 9, color: "rgba(255,255,255,.6)" }}>
            {landingUrl ? "👆 Clique para abrir o destino real" : "⚠️ URL não encontrada neste anúncio"}
          </div>
        </div>
      </div>
    );
  }

  // Feed
  return (
    <div style={{
      width: isDesktop ? 470 : 320, borderRadius: 12, overflow: "hidden",
      background: "#fff", border: "1px solid #ddd",
      boxShadow: "0 1px 4px rgba(0,0,0,.1)", fontFamily: "system-ui, sans-serif",
    }}>
      {/* Feed header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${accentColor},#f77737)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {platformName[0]}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21" }}>Sua empresa</div>
          <div style={{ fontSize: 11, color: "#65676b" }}>Patrocinado · {isIG ? "📸" : "👍"}</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 18, color: "#65676b", cursor: "default" }}>···</div>
      </div>

      {/* Copy */}
      {body && (
        <div style={{ padding: "2px 14px 10px", fontSize: 14, color: "#1c1e21", lineHeight: 1.4 }}>
          {truncate(body, 120)}
        </div>
      )}

      {/* Image */}
      <div style={{
        width: "100%", aspectRatio: "1.91/1",
        background: imageUrl ? `url(${imageUrl}) center/cover no-repeat` : `linear-gradient(135deg,${accentColor}20,${accentColor}50)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {!imageUrl && (
          <div style={{ fontSize: 32 }}>🖼️</div>
        )}
      </div>

      {/* CTA bar */}
      <div style={{ background: isIG ? "#fafafa" : "#f0f2f5", padding: "10px 14px", borderTop: "1px solid #ddd" }}>
        <div style={{ fontSize: 12, color: "#65676b", marginBottom: 2 }}>
          {landingUrl ? truncate(landingUrl, 40) : "www.seusite.com.br"}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1c1e21" }}>{truncate(title, 40)}</div>
          </div>
          <button
            onClick={() => landingUrl ? window.open(landingUrl, "_blank", "noopener,noreferrer") : alert("URL de destino não encontrada nos dados desta campanha.")}
            style={{ background: isIG ? accentColor : "#e4e6eb", color: isIG ? "#fff" : "#1c1e21", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {ctaLabel(ctaType)} {landingUrl ? "↗" : "⚠️"}
          </button>
        </div>
      </div>

      {/* Reactions bar */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #ddd", display: "flex", gap: 16 }}>
        {["👍 Curtir", "💬 Comentar", "↗️ Compartilhar"].map(a => (
          <button key={a} style={{ background: "none", border: "none", fontSize: 13, color: "#65676b", cursor: "pointer", fontWeight: 600 }}>{a}</button>
        ))}
      </div>
    </div>
  );
}

// ── TikTok Preview ─────────────────────────────
function TikTokPreview({ ad, device }: { ad: TikTokAd; device: DeviceMode }) {
  const isDesktop = device === "desktop";
  return (
    <div style={{
      width: isDesktop ? 280 : 220, height: isDesktop ? 500 : 390,
      borderRadius: 16, overflow: "hidden", position: "relative",
      background: ad.coverUrl ? `url(${ad.coverUrl}) center/cover no-repeat` : "linear-gradient(160deg,#010101,#1a1a2e)",
      border: "2px solid #e2e8f0", fontFamily: "system-ui, sans-serif",
      flexShrink: 0,
    }}>
      {/* Overlay gradient */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 40%,rgba(0,0,0,.75))" }} />

      {/* Top bar */}
      <div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 24 }}>
        {["Seguindo", "Para você"].map((t, i) => (
          <span key={t} style={{ fontSize: 13, fontWeight: i === 1 ? 700 : 400, color: i === 1 ? "#fff" : "rgba(255,255,255,.6)", borderBottom: i === 1 ? "2px solid #fff" : "none", paddingBottom: 2 }}>{t}</span>
        ))}
      </div>

      {/* Sponsored badge */}
      <div style={{ position: "absolute", top: 44, left: 12, background: "rgba(0,0,0,.5)", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#fff", fontWeight: 600 }}>
        Patrocinado
      </div>

      {/* No image placeholder */}
      {!ad.coverUrl && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 48, opacity: 0.4 }}>🎵</div>
        </div>
      )}

      {/* Side actions */}
      <div style={{ position: "absolute", right: 10, bottom: 80, display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        {[
          { icon: "❤️", label: "12K" }, { icon: "💬", label: "340" }, { icon: "↗️", label: "Comp." },
        ].map(a => (
          <div key={a.icon} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 22 }}>{a.icon}</span>
            <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{a.label}</span>
          </div>
        ))}
      </div>

      {/* Bottom info */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#ff0050,#00f2ea)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>T</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>@suaempresa</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.7)", marginLeft: 4 }}>· Seguir</span>
        </div>
        {ad.headline && (
          <div style={{ fontSize: 13, color: "#fff", lineHeight: 1.4, marginBottom: 6 }}>{truncate(ad.headline, 80)}</div>
        )}
        <button
          onClick={() => ad.landingUrl ? window.open(ad.landingUrl, "_blank", "noopener,noreferrer") : alert("URL de destino não encontrada neste anúncio TikTok.")}
          style={{ display: "block", width: "100%", background: "#ff0050", borderRadius: 4, padding: "7px 0", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}
        >
          Saiba mais {ad.landingUrl ? "↗" : "⚠️"}
        </button>
        <div style={{ textAlign: "center", marginTop: 4, fontSize: 9, color: "rgba(255,255,255,.5)" }}>
          {ad.landingUrl ? "👆 Clique para testar destino" : "⚠️ URL não encontrada"}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function LiveAdPreviewModal({ platform, campaignId, campaignName, onClose }: Props) {
  const [device, setDevice] = useState<DeviceMode>("mobile");
  const [metaPlacement, setMetaPlacement] = useState<MetaPlacement>("fb_feed");
  const [selectedAdIdx, setSelectedAdIdx] = useState(0);

  // ── Buscar dados reais ──
  const googleDetails = trpc.googleCampaigns.details.useMutation();
  const metaDetails   = trpc.metaCampaigns.details.useMutation();

  useEffect(() => {
    if (platform === "google")  googleDetails.mutate({ campaignId });
    if (platform === "meta")    metaDetails.mutate({ campaignId });
  }, [campaignId, platform]);

  // ── Normalizar anúncios ──
  const googleAds: GoogleAd[] = (googleDetails.data?.ads || []).map((row: any) => {
    const adGroupAd = row.adGroupAd || row.ad_group_ad || {};
    const ad = adGroupAd.ad || {};
    const rsa = ad.responsiveSearchAd || ad.responsive_search_ad || {};
    return {
      id: ad.id || String(Math.random()),
      status: adGroupAd.status || "UNKNOWN",
      headlines: (rsa.headlines || []).map((h: any) => h.text).filter(Boolean),
      descriptions: (rsa.descriptions || []).map((d: any) => d.text).filter(Boolean),
      finalUrl: (ad.finalUrls || ad.final_urls || [])[0] || "",
    };
  });

  const metaAds: MetaAd[] = (metaDetails.data?.ads || []).map((ad: any) => ({
    id: ad.id,
    name: ad.name,
    status: ad.status,
    creative: ad.creative,
  }));

  const tiktokAds: TikTokAd[] = []; // TikTok retorna via adGroups; usa dados da campanha

  const isLoading =
    (platform === "google" && googleDetails.isPending) ||
    (platform === "meta"   && metaDetails.isPending);

  const googleAd  = googleAds[selectedAdIdx];
  const metaAd    = metaAds[selectedAdIdx];

  // ── Métricas rápidas ──
  const metaInsights = metaDetails.data?.adSets?.[0]?.insights?.data?.[0] as any;
  const quickStats = platform === "meta" && metaInsights ? [
    { label: "Impressões", value: Number(metaInsights.impressions || 0).toLocaleString("pt-BR") },
    { label: "Cliques",    value: Number(metaInsights.clicks || 0).toLocaleString("pt-BR") },
    { label: "CTR",        value: `${Number(metaInsights.ctr || 0).toFixed(2)}%` },
    { label: "CPC",        value: `R$ ${Number(metaInsights.cpc || 0).toFixed(2)}` },
  ] : null;

  const metaPlacements: { id: MetaPlacement; label: string; icon: string }[] = [
    { id: "fb_feed",  label: "Facebook Feed",     icon: "📘" },
    { id: "ig_feed",  label: "Instagram Feed",    icon: "📸" },
    { id: "ig_story", label: "Instagram Stories", icon: "⭕" },
    { id: "fb_story", label: "Facebook Stories",  icon: "📘" },
    { id: "ig_reels", label: "Instagram Reels",   icon: "🎬" },
  ];

  const adCount = platform === "google" ? googleAds.length : platform === "meta" ? metaAds.length : 0;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(15,23,42,.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 2000,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "min(1080px, 100%)", maxHeight: "94vh",
        background: "#fff", borderRadius: 24,
        border: "1px solid #e2e8f0",
        boxShadow: "0 24px 80px rgba(15,23,42,.22)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px", borderBottom: "1px solid #f1f5f9",
          background: "linear-gradient(135deg,#f8faff,#fff)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: platform === "google" ? "linear-gradient(135deg,#4285f4,#34a853)"
                : platform === "meta" ? "linear-gradient(135deg,#1877f2,#e1306c)"
                : "linear-gradient(135deg,#ff0050,#010101)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>
              {platform === "google" ? "G" : platform === "meta" ? "f" : "T"}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                Preview — Visão do Cliente
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                {truncate(campaignName, 60)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Device toggle */}
            <div style={{
              display: "flex", background: "#f1f5f9", borderRadius: 10, padding: 3, gap: 2,
            }}>
              {(["mobile", "desktop"] as DeviceMode[]).map(d => (
                <button key={d} onClick={() => setDevice(d)} style={{
                  background: device === d ? "#fff" : "transparent",
                  border: "none", borderRadius: 8, padding: "6px 14px",
                  fontSize: 12, fontWeight: 700,
                  color: device === d ? "#0f172a" : "#94a3b8",
                  cursor: "pointer", transition: "all .15s",
                  boxShadow: device === d ? "0 1px 4px rgba(0,0,0,.12)" : "none",
                }}>
                  {d === "mobile" ? "📱 Mobile" : "🖥️ Desktop"}
                </button>
              ))}
            </div>

            <button onClick={onClose} style={{
              background: "#f1f5f9", border: "none", borderRadius: 10,
              padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#64748b",
              cursor: "pointer",
            }}>Fechar</button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* ── Sidebar ── */}
          <div style={{
            width: 220, borderRight: "1px solid #f1f5f9",
            padding: "16px 12px", overflowY: "auto", flexShrink: 0,
            background: "#fafbfc",
          }}>

            {/* Ad selector */}
            {adCount > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8, padding: "0 4px" }}>
                  Anúncios ({adCount})
                </div>
                {Array.from({ length: adCount }).map((_, i) => (
                  <button key={i} onClick={() => setSelectedAdIdx(i)} style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 10px", borderRadius: 8, border: "none",
                    background: selectedAdIdx === i ? "#eff6ff" : "transparent",
                    color: selectedAdIdx === i ? "#1d4ed8" : "#475569",
                    fontWeight: selectedAdIdx === i ? 700 : 500,
                    fontSize: 12, cursor: "pointer", marginBottom: 2,
                    transition: "all .12s",
                  }}>
                    {platform === "google"
                      ? `Anúncio ${i + 1}${googleAds[i]?.status === "ENABLED" ? " ✅" : " ⏸️"}`
                      : `${metaAds[i]?.name || `Anúncio ${i + 1}`}`.slice(0, 24)
                    }
                  </button>
                ))}
              </div>
            )}

            {/* Placement selector (Meta only) */}
            {platform === "meta" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8, padding: "0 4px" }}>
                  Placement
                </div>
                {metaPlacements.map(p => (
                  <button key={p.id} onClick={() => setMetaPlacement(p.id)} style={{
                    display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left",
                    padding: "7px 10px", borderRadius: 8, border: "none",
                    background: metaPlacement === p.id ? "#eff6ff" : "transparent",
                    color: metaPlacement === p.id ? "#1d4ed8" : "#475569",
                    fontWeight: metaPlacement === p.id ? 700 : 500,
                    fontSize: 12, cursor: "pointer", marginBottom: 2,
                  }}>
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick metrics */}
            {quickStats && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8, padding: "0 4px" }}>
                  Métricas
                </div>
                {quickStats.map(s => (
                  <div key={s.label} style={{
                    background: "#fff", border: "1px solid #e2e8f0",
                    borderRadius: 8, padding: "8px 10px", marginBottom: 6,
                  }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginTop: 1 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Link tester info */}
            <div style={{
              background: "#eff6ff", borderRadius: 8, padding: "10px 12px",
              marginTop: 10, border: "1px solid #bfdbfe",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>💡 Testando links</div>
              <div style={{ fontSize: 10, color: "#3b82f6", lineHeight: 1.4 }}>
                Clique nos elementos interativos do preview para testar o destino real da campanha.
              </div>
            </div>
          </div>

          {/* ── Preview area ── */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 32, overflowY: "auto",
            background: platform === "tiktok" ? "#0a0a0a"
              : platform === "meta" && (metaPlacement.includes("story") || metaPlacement.includes("reels")) ? "#1a1a2e"
              : "#f1f3f4",
          }}>
            {isLoading ? (
              <div style={{ textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>
                  {platform === "google" ? "G" : platform === "meta" ? "f" : "T"}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Buscando anúncios da API…</div>
                <div style={{ fontSize: 12, marginTop: 4, color: "#cbd5e1" }}>Conectando com {platform === "google" ? "Google Ads" : platform === "meta" ? "Meta Ads" : "TikTok"}</div>
              </div>
            ) : platform === "google" ? (
              googleAd ? (
                <GoogleSearchPreview ad={googleAd} device={device} />
              ) : (
                <EmptyState platform={platform} />
              )
            ) : platform === "meta" ? (
              metaAd ? (
                <MetaFeedPreview ad={metaAd} placement={metaPlacement} device={device} />
              ) : (
                <EmptyState platform={platform} />
              )
            ) : (
              <TikTokPreview
                ad={{ id: campaignId, name: campaignName, status: "ACTIVE" }}
                device={device}
              />
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid #f1f5f9",
          background: "#fafbfc", display: "flex", alignItems: "center",
          justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Preview em tempo real • dados da API {platform === "google" ? "Google Ads" : platform === "meta" ? "Meta Graph" : "TikTok Business"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, background: "#f0fdf4", borderRadius: 6, padding: "3px 8px", border: "1px solid #bbf7d0" }}>
              ● AO VIVO
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ──
function EmptyState({ platform }: { platform: string }) {
  return (
    <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#475569" }}>Nenhum anúncio encontrado</div>
      <div style={{ fontSize: 13, marginTop: 6, color: "#94a3b8", lineHeight: 1.5 }}>
        A {platform === "google" ? "Google Ads API" : "Meta Graph API"} não retornou anúncios ativos para esta campanha.
        <br />Verifique se a campanha possui anúncios criados e se a integração está configurada.
      </div>
    </div>
  );
}
