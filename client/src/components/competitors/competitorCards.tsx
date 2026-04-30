// competitorCards.tsx — Componentes de card/status
import { useState, useEffect, useRef } from "react";
import { sourceBadge, formatDate, copyToClipboard, detectLayer } from "./competitorHelpers";

export function CascadeStatus({ analyzing, successLayer, hasAds }: {
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
export function buildAdVerifyUrl(ad: any): { url: string; label: string; icon: string } | null {
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

export function AdDetailModal({ ad, onClose }: { ad: any; onClose: () => void }) {
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
export function AdCard({ ad, onClick }: { ad: any; onClick: () => any; [key: string]: any }) {
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
