/**
 * AdPreviewPanel.tsx
 *
 * Preview visual simulado dos anúncios por placement.
 * Mostra como o anúncio vai aparecer em cada placement com
 * proporção correta, copy, CTA e identidade visual.
 *
 * USO no CampaignResult.tsx (seção de criativos):
 *   import AdPreviewPanel from "@/components/AdPreviewPanel";
 *
 *   <AdPreviewPanel
 *     creative={creatives[0]}
 *     platform={campaign.platform}
 *     objective={campaign.objective}
 *     clientName={clientProfile?.companyName}
 *     mediaPreview={mediaPreview}   // URL da imagem/vídeo uploadada (opcional)
 *   />
 */

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

interface Creative {
  hook?:     string;
  headline?: string;
  copy?:     string;
  cta?:      string;
  format?:   string;
  type?:     string;
}

interface Props {
  creative:     Creative;
  platform:     string;
  objective?:   string;
  clientName?:  string;
  mediaPreview?: string; // URL de imagem/vídeo uploadada
  primaryColor?: string;  // cor da marca (opcional)
  creativeImageDataUrl?: string; // SVG gerado quando não há imagem real
}

type PreviewPlacement =
  | "ig_feed"    | "ig_story"   | "ig_reels"
  | "fb_feed"    | "fb_story"   | "fb_reels"
  | "tiktok"     | "google_display" | "google_search";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG DE PLACEMENTS
// ─────────────────────────────────────────────────────────────────────────────

interface PlacementPreviewConfig {
  id:         PreviewPlacement;
  label:      string;
  platform:   string;
  icon:       string;
  ratio:      string;      // ex: "9:16"
  width:      number;      // largura do preview em px
  height:     number;      // altura do preview em px
  hasFeed:    boolean;     // mostra contexto de feed ao redor
  hasStory:   boolean;     // mostra UI de stories
  bgColor:    string;
  accentColor: string;
}

const PREVIEW_PLACEMENTS: PlacementPreviewConfig[] = [
  {
    id: "ig_feed",  label: "Instagram Feed",  platform: "meta",   icon: "📸",
    ratio: "4:5",   width: 260, height: 325,
    hasFeed: true,  hasStory: false,
    bgColor: "#ffffff", accentColor: "#e1306c",
  },
  {
    id: "ig_story", label: "Instagram Stories", platform: "meta", icon: "⭕",
    ratio: "9:16",  width: 180, height: 320,
    hasFeed: false, hasStory: true,
    bgColor: "#000000", accentColor: "#e1306c",
  },
  {
    id: "ig_reels", label: "Instagram Reels",  platform: "meta",  icon: "🎬",
    ratio: "9:16",  width: 180, height: 320,
    hasFeed: false, hasStory: true,
    bgColor: "#000000", accentColor: "#e1306c",
  },
  {
    id: "fb_feed",  label: "Facebook Feed",    platform: "meta",  icon: "📘",
    ratio: "4:5",   width: 260, height: 325,
    hasFeed: true,  hasStory: false,
    bgColor: "#f0f2f5", accentColor: "#1877f2",
  },
  {
    id: "fb_story", label: "Facebook Stories", platform: "meta",  icon: "📘",
    ratio: "9:16",  width: 180, height: 320,
    hasFeed: false, hasStory: true,
    bgColor: "#000000", accentColor: "#1877f2",
  },
  {
    id: "tiktok",   label: "TikTok Feed",      platform: "tiktok", icon: "🎵",
    ratio: "9:16",  width: 180, height: 320,
    hasFeed: false, hasStory: true,
    bgColor: "#000000", accentColor: "#ff0050",
  },
  {
    id: "google_display", label: "Google Display", platform: "google", icon: "🔍",
    ratio: "16:9",  width: 300, height: 170,
    hasFeed: false, hasStory: false,
    bgColor: "#f8f9fa", accentColor: "#4285f4",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CTA MAP
// ─────────────────────────────────────────────────────────────────────────────

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE:       "Saiba mais",
  SIGN_UP:          "Cadastre-se",
  GET_QUOTE:        "Solicitar orçamento",
  CONTACT_US:       "Fale conosco",
  BUY_NOW:          "Comprar agora",
  SHOP_NOW:         "Ver oferta",
  BOOK_NOW:         "Agendar",
  DOWNLOAD:         "Baixar",
  SUBSCRIBE:        "Assinar",
  WATCH_MORE:       "Ver mais",
  GET_DIRECTIONS:   "Como chegar",
  APPLY_NOW:        "Candidatar-se",
  GET_OFFER:        "Ver oferta",
  ORDER_NOW:        "Pedir agora",
  REQUEST_TIME:     "Agendar",
  LISTEN_NOW:       "Ouvir agora",
  OPEN_LINK:        "Acessar",
  SEE_MORE:         "Ver mais",
};

function getCtaLabel(cta?: string): string {
  if (!cta) return "Saiba mais";
  return CTA_LABELS[cta.toUpperCase()] || cta;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTE: Preview de Feed (IG/FB)
// ─────────────────────────────────────────────────────────────────────────────

function FeedPreview({
  config, creative, clientName, mediaPreview, primaryColor, creativeImageDataUrl,
}: {
  config: PlacementPreviewConfig;
  creative: Creative;
  clientName?: string;
  mediaPreview?: string;
  primaryColor?: string;
  creativeImageDataUrl?: string;
}) {
  const accent   = primaryColor || config.accentColor;
  const name     = clientName || "Sua Marca";
  const headline = creative.headline || creative.hook || "Headline do anúncio";
  const copy     = creative.copy || "";
  const cta      = getCtaLabel(creative.cta);
  const isFB     = config.platform === "meta" && config.id.startsWith("fb");

  return (
    <div style={{
      width: config.width + 40, background: config.bgColor,
      borderRadius: 12, overflow: "hidden",
      border: "1px solid #e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Header do post */}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, background: "white" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 800, color: "white", flexShrink: 0,
        }}>
          {name[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{name}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", display: "flex", alignItems: "center", gap: 3 }}>
            <span>Patrocinado</span>
            {isFB && <span>· 🌍</span>}
          </div>
        </div>
        <div style={{ fontSize: 16, color: "#94a3b8" }}>···</div>
      </div>

      {/* Imagem/criativo */}
      <div style={{
        width: config.width + 40, height: config.height,
        background: mediaPreview
          ? `url(${mediaPreview}) center/cover no-repeat`
          : creativeImageDataUrl
            ? `url(${creativeImageDataUrl}) center/cover no-repeat`
            : `linear-gradient(135deg, ${accent}22, ${accent}44)`,
        position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {!mediaPreview && !creativeImageDataUrl && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
            <div style={{ fontSize: 11, color: accent, fontWeight: 700, maxWidth: 180, lineHeight: 1.4 }}>
              {headline.slice(0, 60)}{headline.length > 60 ? "..." : ""}
            </div>
          </div>
        )}
        {/* Badge de proporção */}
        <div style={{
          position: "absolute", top: 8, right: 8,
          fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 10,
          background: "rgba(0,0,0,0.6)", color: "white",
        }}>
          {config.ratio}
        </div>
        {/* Indicador de vídeo */}
        {(creative.format === "video" || creative.type === "video") && (
          <div style={{
            position: "absolute", bottom: 8, left: 8,
            background: "rgba(0,0,0,0.7)", borderRadius: 10, padding: "2px 8px",
            fontSize: 9, color: "white", fontWeight: 700,
          }}>▶ Vídeo</div>
        )}
      </div>

      {/* Copy e CTA */}
      <div style={{ padding: "10px 12px", background: "white" }}>
        {copy && (
          <div style={{ fontSize: 11, color: "#334155", marginBottom: 8, lineHeight: 1.5, maxHeight: 48, overflow: "hidden" }}>
            {copy.slice(0, 120)}{copy.length > 120 ? "..." : ""}
          </div>
        )}
        <div style={{
          background: "#f0f2f5", borderRadius: 8, padding: "8px 12px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>
            {headline.slice(0, 35)}{headline.length > 35 ? "..." : ""}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 6,
            background: accent, color: "white", whiteSpace: "nowrap", flexShrink: 0, marginLeft: 8,
          }}>
            {cta}
          </div>
        </div>
      </div>

      {/* Reações (IG) */}
      <div style={{ padding: "6px 12px 10px", background: "white", display: "flex", gap: 12 }}>
        {["❤️", "💬", "📤"].map(icon => (
          <span key={icon} style={{ fontSize: 14, cursor: "pointer" }}>{icon}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTE: Preview de Story/Reels/TikTok
// ─────────────────────────────────────────────────────────────────────────────

function StoryPreview({
  config, creative, clientName, mediaPreview, primaryColor, creativeImageDataUrl,
}: {
  config: PlacementPreviewConfig;
  creative: Creative;
  clientName?: string;
  mediaPreview?: string;
  primaryColor?: string;
  creativeImageDataUrl?: string;
}) {
  const accent   = primaryColor || config.accentColor;
  const name     = clientName || "Sua Marca";
  const headline = creative.headline || creative.hook || "";
  const copy     = creative.copy || "";
  const cta      = getCtaLabel(creative.cta);
  const isTikTok = config.platform === "tiktok";
  const isReels  = config.id.includes("reels");

  return (
    <div style={{
      width: config.width,
      height: config.height,
      background: mediaPreview
        ? `url(${mediaPreview}) center/cover no-repeat`
        : creativeImageDataUrl
          ? `url(${creativeImageDataUrl}) center/cover no-repeat`
          : `linear-gradient(160deg, #1a1a2e, #16213e, #0f3460)`,
      borderRadius: 16, overflow: "hidden", position: "relative",
      border: "2px solid #1a1a2e", fontFamily: "-apple-system, sans-serif",
    }}>
      {/* Barra de progresso (Stories) */}
      {!isReels && !isTikTok && (
        <div style={{ position: "absolute", top: 8, left: 8, right: 8, display: "flex", gap: 3, zIndex: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i === 1 ? "white" : "rgba(255,255,255,0.4)" }} />
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ position: "absolute", top: 18, left: 10, right: 10, display: "flex", alignItems: "center", gap: 8, zIndex: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: "white",
          border: "2px solid white",
        }}>
          {name[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "white" }}>{name}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.7)" }}>Patrocinado</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 16, color: "rgba(255,255,255,0.8)" }}>✕</div>
      </div>

      {/* Badge de proporção */}
      <div style={{
        position: "absolute", top: 50, right: 8, zIndex: 10,
        fontSize: 8, fontWeight: 800, padding: "2px 6px", borderRadius: 8,
        background: "rgba(0,0,0,0.6)", color: "white",
      }}>
        {config.ratio}
      </div>

      {/* Placeholder de imagem se não tiver mídia */}
      {!mediaPreview && !creativeImageDataUrl && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{isTikTok ? "🎵" : isReels ? "🎬" : "⭕"}</div>
          {headline && (
            <div style={{ fontSize: 12, color: "white", fontWeight: 700, textAlign: "center", padding: "0 20px", lineHeight: 1.4, maxWidth: config.width - 20 }}>
              {headline.slice(0, 80)}{headline.length > 80 ? "..." : ""}
            </div>
          )}
        </div>
      )}

      {/* TikTok sidebar de ações */}
      {isTikTok && (
        <div style={{ position: "absolute", right: 8, bottom: 80, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", zIndex: 10 }}>
          {["❤️","💬","↗️","🔖"].map(icon => (
            <div key={icon} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18 }}>{icon}</div>
              <div style={{ fontSize: 8, color: "white" }}>0</div>
            </div>
          ))}
        </div>
      )}

      {/* Reels sidebar */}
      {isReels && (
        <div style={{ position: "absolute", right: 8, bottom: 80, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", zIndex: 10 }}>
          {["❤️","💬","📤"].map(icon => (
            <div key={icon} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16 }}>{icon}</div>
            </div>
          ))}
        </div>
      )}

      {/* Copy overlay */}
      {copy && (
        <div style={{
          position: "absolute", bottom: 60, left: 10, right: 40,
          fontSize: 10, color: "white", lineHeight: 1.4, zIndex: 10,
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          maxHeight: 50, overflow: "hidden",
        }}>
          {copy.slice(0, 100)}{copy.length > 100 ? "..." : ""}
        </div>
      )}

      {/* Swipe up / CTA */}
      <div style={{
        position: "absolute", bottom: 12, left: 10, right: 10, zIndex: 10,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      }}>
        {!isTikTok && !isReels && (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>↑ Deslize para cima</div>
        )}
        <div style={{
          background: "white", borderRadius: 20, padding: "5px 16px",
          fontSize: 10, fontWeight: 800, color: "#0f172a",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}>
          {cta}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTE: Preview Google Display
// ─────────────────────────────────────────────────────────────────────────────

function GoogleDisplayPreview({
  config, creative, clientName, mediaPreview, primaryColor, creativeImageDataUrl,
}: {
  config: PlacementPreviewConfig;
  creative: Creative;
  clientName?: string;
  mediaPreview?: string;
  primaryColor?: string;
  creativeImageDataUrl?: string;
}) {
  const accent   = primaryColor || "#4285f4";
  const name     = clientName || "sua-marca.com.br";
  const headline = creative.headline || creative.hook || "Headline do anúncio";
  const copy     = creative.copy || "";
  const cta      = getCtaLabel(creative.cta);

  return (
    <div style={{
      width: config.width, height: config.height,
      border: "1px solid #dadce0", borderRadius: 8, overflow: "hidden",
      fontFamily: "Arial, sans-serif", background: "white", position: "relative",
    }}>
      {/* Imagem à esquerda */}
      <div style={{ display: "flex", height: "100%" }}>
        <div style={{
          width: 110, flexShrink: 0,
          background: mediaPreview
            ? `url(${mediaPreview}) center/cover no-repeat`
            : creativeImageDataUrl
              ? `url(${creativeImageDataUrl}) center/cover no-repeat`
              : `linear-gradient(135deg, ${accent}22, ${accent}44)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {!mediaPreview && !creativeImageDataUrl && <span style={{ fontSize: 28 }}>🖼️</span>}
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#202124", marginBottom: 4, lineHeight: 1.3 }}>
              {headline.slice(0, 40)}{headline.length > 40 ? "..." : ""}
            </div>
            {copy && (
              <div style={{ fontSize: 10, color: "#5f6368", lineHeight: 1.4, maxHeight: 36, overflow: "hidden" }}>
                {copy.slice(0, 80)}{copy.length > 80 ? "..." : ""}
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: "#0a7c42" }}>{name}</div>
            <div style={{
              fontSize: 9, fontWeight: 700, padding: "4px 10px", borderRadius: 4,
              background: accent, color: "white",
            }}>
              {cta}
            </div>
          </div>
        </div>
      </div>

      {/* Badge Ad */}
      <div style={{
        position: "absolute", top: 4, left: 4,
        fontSize: 8, padding: "1px 4px", borderRadius: 3,
        border: "1px solid #dadce0", color: "#70757a",
      }}>
        Anúncio
      </div>

      {/* Badge proporção */}
      <div style={{
        position: "absolute", top: 4, right: 4,
        fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 6,
        background: "rgba(66,133,244,0.1)", color: "#4285f4",
      }}>
        {config.ratio}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function AdPreviewPanel({
  creative, platform, objective, clientName, mediaPreview, primaryColor, creativeImageDataUrl,
}: Props) {
  const [activePreview, setActivePreview] = useState<PreviewPlacement>("ig_feed");
  const [showAll, setShowAll] = useState(false);

  // Filtra placements relevantes para a plataforma
  const relevantPlacements = PREVIEW_PLACEMENTS.filter(p => {
    if (platform === "meta")   return p.platform === "meta";
    if (platform === "google") return p.platform === "google";
    if (platform === "tiktok") return p.platform === "tiktok";
    if (platform === "both")   return p.platform === "meta" || p.platform === "google";
    return true;
  });

  const displayPlacements = showAll ? relevantPlacements : relevantPlacements.slice(0, 4);
  const activeConfig = relevantPlacements.find(p => p.id === activePreview) || relevantPlacements[0];

  if (!activeConfig || relevantPlacements.length === 0) return null;

  const renderPreview = (config: PlacementPreviewConfig) => {
    const props = { config, creative, clientName, mediaPreview, primaryColor, creativeImageDataUrl };
    if (config.id === "google_display" || config.id === "google_search") {
      return <GoogleDisplayPreview {...props} />;
    }
    if (config.hasStory) return <StoryPreview {...props} />;
    return <FeedPreview {...props} />;
  };

  return (
    <div style={{
      background: "white", border: "1px solid #e2e8f0",
      borderRadius: 18, padding: 24, marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>
            📱 Preview por Placement
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Veja como seu anúncio vai aparecer em cada placement
          </div>
        </div>
        {!mediaPreview && (
          <div style={{
            fontSize: 10, padding: "4px 10px", borderRadius: 20,
            background: "#fffbeb", color: "#d97706", border: "1px solid #fcd34d", fontWeight: 700,
          }}>
            💡 Faça upload de imagem para preview real
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* Seletor de placements */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
            Placements
          </div>
          {displayPlacements.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePreview(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                background: activePreview === p.id ? "#eff6ff" : "transparent",
                color: activePreview === p.id ? "#1d4ed8" : "#475569",
                fontWeight: activePreview === p.id ? 700 : 500,
                fontSize: 12, textAlign: "left", transition: "all 0.15s",
              }}
            >
              <span>{p.icon}</span>
              <span style={{ flex: 1 }}>{p.label}</span>
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 6,
                background: activePreview === p.id ? "#1d4ed8" : "#f1f5f9",
                color: activePreview === p.id ? "white" : "#94a3b8",
                fontWeight: 700,
              }}>
                {p.ratio}
              </span>
            </button>
          ))}
          {relevantPlacements.length > 4 && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                fontSize: 11, color: "#0891b2", background: "none", border: "none",
                cursor: "pointer", textAlign: "left", padding: "4px 12px", fontWeight: 700,
              }}
            >
              {showAll ? "▲ Menos" : `▼ +${relevantPlacements.length - 4} mais`}
            </button>
          )}

          {/* Info do placement ativo */}
          {activeConfig && (
            <div style={{
              marginTop: 8, background: "#f8fafc", borderRadius: 10,
              padding: "10px 12px", border: "1px solid #e2e8f0",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>
                Especificações
              </div>
              {[
                { l: "Proporção", v: activeConfig.ratio },
                { l: "Plataforma", v: activeConfig.platform },
                { l: "Formato",    v: activeConfig.hasFeed ? "Feed" : activeConfig.hasStory ? "Vertical" : "Display" },
              ].map(item => (
                <div key={item.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{item.l}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#334155" }}>{item.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview principal */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            background: "#f8fafc", borderRadius: 14, padding: 20,
            display: "flex", justifyContent: "center", alignItems: "center",
            minHeight: 360,
          }}>
            {activeConfig && renderPreview(activeConfig)}
          </div>

          {/* Avisos de compatibilidade */}
          <div style={{ marginTop: 12, width: "100%", maxWidth: 400 }}>
            {activeConfig?.hasStory && (creative.format === "image" || !creative.format) && (
              <div style={{
                fontSize: 11, padding: "8px 12px", borderRadius: 8, marginBottom: 6,
                background: "#fffbeb", border: "1px solid #fcd34d", color: "#d97706",
              }}>
                ⚠️ Este placement exige proporção 9:16 para melhor resultado
              </div>
            )}
            {activeConfig?.id === "ig_reels" || activeConfig?.id === "fb_reels" || activeConfig?.id === "tiktok" ? (
              (creative.format !== "video" && creative.type !== "video") && (
                <div style={{
                  fontSize: 11, padding: "8px 12px", borderRadius: 8,
                  background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626",
                }}>
                  ❌ Reels e TikTok exigem vídeo — imagens não são aceitas neste placement
                </div>
              )
            ) : null}
            {activeConfig?.id === "google_display" && (
              <div style={{
                fontSize: 11, padding: "8px 12px", borderRadius: 8,
                background: "#eff6ff", border: "1px solid #93c5fd", color: "#1d4ed8",
              }}>
                💡 Display Google aparece em sites parceiros — mantenha o visual limpo e legível
              </div>
            )}
          </div>
        </div>

        {/* Grid de todos os placements (mini) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
            Todos os formatos
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {relevantPlacements.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePreview(p.id)}
                style={{
                  width: 72, height: 72, borderRadius: 10, overflow: "hidden",
                  border: `2px solid ${activePreview === p.id ? "#1d4ed8" : "#e2e8f0"}`,
                  cursor: "pointer", background: "none", padding: 0, position: "relative",
                  transition: "all 0.15s",
                }}
              >
                {/* Miniatura do formato */}
                <div style={{
                  width: "100%", height: "100%",
                  background: mediaPreview
                    ? `url(${mediaPreview}) center/cover no-repeat`
                    : `linear-gradient(135deg, ${p.accentColor}15, ${p.accentColor}30)`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {/* Proporção visual */}
                  <div style={{
                    width: p.hasStory ? 18 : 36,
                    height: p.hasStory ? 32 : p.id === "google_display" ? 20 : 28,
                    border: `2px solid ${p.accentColor}`,
                    borderRadius: 3, marginBottom: 4,
                    background: mediaPreview ? "transparent" : `${p.accentColor}20`,
                  }} />
                  <div style={{ fontSize: 8, fontWeight: 700, color: p.accentColor }}>{p.ratio}</div>
                </div>
                {/* Label */}
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: "rgba(0,0,0,0.7)", fontSize: 7, color: "white",
                  padding: "2px 4px", textAlign: "center", fontWeight: 600,
                }}>
                  {p.icon} {p.label.split(" ").slice(-1)[0]}
                </div>
                {activePreview === p.id && (
                  <div style={{
                    position: "absolute", top: 3, right: 3,
                    background: "#1d4ed8", borderRadius: "50%",
                    width: 14, height: 14, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 8, color: "white",
                  }}>✓</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
