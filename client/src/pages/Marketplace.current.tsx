/**
 * Marketplace.tsx — Vitrine pública + Landing page individual
 * Rota: /marketplace           (vitrine, sem login)
 * Rota: /marketplace/:slug     (landing page do produto)
 */
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { NICHE_TAXONOMY, NICHE_GROUPS } from "@/lib/nicheTaxonomy";

// ─── Constantes ───────────────────────────────────────────────────────────────
// Niches from taxonomy - built dynamically
const NICHES = [
  { key: "", label: "Todos", icon: "🔍" },
  ...NICHE_TAXONOMY.map(n => ({ key: n.key, label: n.label, icon: n.icon })),
];

const PRICE_TYPES = [
  { key: "",           label: "Qualquer preço" },
  { key: "free",       label: "Gratuito" },
  { key: "fixed",      label: "Preço fixo" },
  { key: "monthly",    label: "Mensal" },
  { key: "negotiable", label: "A negociar" },
];

// Dynamic colors from taxonomy
const NICHE_COLORS: Record<string, { bg: string; color: string }> = {
  ...Object.fromEntries(NICHE_TAXONOMY.map(n => [n.key, { bg: n.bg, color: n.color }])),
  outros: { bg: "#f1efe8", color: "#5f5e5a" },
};

// ─── Componente card da vitrine ───────────────────────────────────────────────
function ListingCard({ listing, onClick }: { listing: any; onClick: () => void }) {
  const nc = NICHE_COLORS[listing.niche] || NICHE_COLORS.outros;
  const nicheLabel = NICHES.find(n => n.key === listing.niche)?.label || listing.niche;
  return (
    <div onClick={onClick} className="mp-card" style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 16, overflow: "hidden", cursor: "pointer",
      transition: "all .2s var(--ease)", display: "flex", flexDirection: "column",
    }}>
      <div style={{
        height: 130, background: `linear-gradient(135deg,${nc.bg},${nc.color}22)`,
        display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        {listing.imageUrl
          ? <img src={listing.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 36 }}>{NICHES.find(n => n.key === listing.niche)?.label?.split(" ")[0] || "🛒"}</span>
        }
        {listing.boostActive && (
          <div style={{
            position: "absolute", top: 8, right: 8,
            background: "#ff9f0a", color: "white",
            fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 20, letterSpacing: 1,
          }}>⚡ Destaque</div>
        )}
      </div>
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: nc.bg, color: nc.color,
          }}>{nicheLabel}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", lineHeight: 1.35, marginBottom: 4, flex: 1 }}>
          {listing.title}
        </div>
        {listing.subheadline && (
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4, marginBottom: 8 }}>
            {listing.subheadline.slice(0, 80)}{listing.subheadline.length > 80 ? "..." : ""}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          <div>
            {listing.price
              ? <span style={{ fontSize: 15, fontWeight: 800, color: "var(--blue)" }}>
                  R$ {Number(listing.price).toLocaleString("pt-BR")}
                  {listing.priceType === "monthly" ? "/mês" : ""}
                </span>
              : <span style={{ fontSize: 13, color: "var(--muted)" }}>A negociar</span>
            }
          </div>
          {(listing.city || listing.state) && (
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              📍 {[listing.city, listing.state].filter(Boolean).join(", ")}
            </span>
          )}
          {listing.views > 0 && (
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              👁 {listing.views > 999 ? `${(listing.views/1000).toFixed(1)}k` : listing.views}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{
            flex: 1, background: "var(--blue)", color: "white",
            borderRadius: 10, padding: "7px 0", fontSize: 12, fontWeight: 700, textAlign: "center",
          }}>Ver oferta →</div>
          {listing.aiScore && (() => {
            const s = listing.aiScore;
            const grade = s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : "D";
            const col = s >= 80 ? "#16a34a" : s >= 65 ? "#2563eb" : s >= 50 ? "#d97706" : "#dc2626";
            const bg  = s >= 80 ? "#dcfce7" : s >= 65 ? "#dbeafe" : s >= 50 ? "#fef3c7" : "#fee2e2";
            return (
              <div title={`Score de qualidade: ${grade} (${s}/100)`} style={{
                background: bg, borderRadius: 8, padding: "4px 8px",
                fontSize: 10, fontWeight: 800, color: col, textAlign: "center",
                border: `1px solid ${col}33`,
              }}>{grade} {s}</div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ height: 130, background: "var(--off)" }} />
      <div style={{ padding: "12px 14px" }}>
        <div style={{ height: 14, background: "var(--off)", borderRadius: 6, marginBottom: 10, width: "60%" }} />
        <div style={{ height: 16, background: "var(--off)", borderRadius: 6, marginBottom: 6 }} />
        <div style={{ height: 16, background: "var(--off)", borderRadius: 6, width: "80%", marginBottom: 16 }} />
        <div style={{ height: 32, background: "var(--off)", borderRadius: 10 }} />
      </div>
    </div>
  );
}

// ─── Landing page individual ──────────────────────────────────────────────────
function ListingLanding({ slug }: { slug: string }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [activeMedia, setActiveMedia] = useState(0); // índice da mídia ativa na galeria
  const [showVideo,   setShowVideo]   = useState(false);

  // SEO: schema.org JSON-LD + meta tags quando listing carrega
  useEffect(() => {
    if (!listing) return;
    document.title = `${listing.title} — MecProAI Marketplace`;
    // Schema.org para SEO
    const existing = document.getElementById("mp-schema");
    if (existing) existing.remove();
    const schema = document.createElement("script");
    schema.id = "mp-schema";
    schema.type = "application/ld+json";
    schema.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": listing.niche?.includes("imovel") ? "RealEstateListing" : "Product",
      "name": listing.title,
      "description": listing.description || listing.headline || "",
      "image": listing.imageUrl || "",
      "url": `https://www.mecproai.com/marketplace/${listing.slug}`,
      "offers": listing.price ? {
        "@type": "Offer",
        "price": listing.price,
        "priceCurrency": "BRL",
        "availability": "https://schema.org/InStock",
      } : undefined,
      "provider": { "@type": "Organization", "name": "MecProAI" },
    });
    document.head.appendChild(schema);
    return () => { document.getElementById("mp-schema")?.remove(); };
    // Description meta
    const descEl = (document.querySelector('meta[name="description"]') || (() => { const m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); return m; })()) as HTMLMetaElement;
    descEl.content = (listing.description || listing.headline || listing.title).slice(0, 155);
    // OG title
    const ogEl = (document.querySelector('meta[property="og:title"]') || (() => { const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); document.head.appendChild(m); return m; })()) as HTMLMetaElement;
    ogEl.content = listing.title;
    // OG image
    if (listing.imageUrl) {
      const ogImgEl = (document.querySelector('meta[property="og:image"]') || (() => { const m = document.createElement('meta'); m.setAttribute('property', 'og:image'); document.head.appendChild(m); return m; })()) as HTMLMetaElement;
      ogImgEl.content = listing.imageUrl;
    }
    return () => { document.title = 'MecProAI'; };
  }, [listing]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/marketplace/${slug}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.listing) setListing(d.listing);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <Layout>
      <div style={{ maxWidth: 800, margin: "60px auto", padding: "0 16px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>⏳ Carregando oferta...</div>
      </div>
    </Layout>
  );

  if (notFound) return (
    <Layout>
      <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 16px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <h2 style={{ fontWeight: 900, margin: "0 0 8px" }}>Oferta não encontrada</h2>
        <p style={{ color: "var(--muted)", marginBottom: 20 }}>Esta oferta pode ter sido removida ou o link está incorreto.</p>
        <button className="btn btn-md btn-primary" onClick={() => setLocation("/marketplace")} style={{ fontWeight: 700 }}>
          ← Ver todas as ofertas
        </button>
      </div>
    </Layout>
  );

  const lp = listing.landingPage?.sections;
  const theme = listing.landingPage?.theme || {};
  const nc = NICHE_COLORS[listing.niche] || NICHE_COLORS.outros;
  const ctaHref = listing.checkoutUrl ||
    (listing.whatsappNumber ? `https://wa.me/55${listing.whatsappNumber.replace(/\D/g, "")}` : null);
  const ctaText = lp?.hero?.cta || listing.ctaText || "Entrar em contato";

  function handleCta() {
    // Registra clique
    fetch(`/api/marketplace/${listing.id}/click`, { method: "POST", credentials: "include" }).catch(() => {});
    if (ctaHref) window.open(ctaHref, "_blank");
    else setContactSent(true);
  }

  return (
    <Layout>
      <style>{`
        .lp-btn { transition: all .2s; }
        .lp-btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
        .faq-item { cursor: pointer; }
        .faq-item:hover { background: var(--off) !important; }
      `}</style>
      <div style={{ fontFamily: "var(--font)", maxWidth: 780, margin: "0 auto", padding: "0 0 80px" }}>

        {/* Breadcrumb + barra do dono */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setLocation("/marketplace")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>
              ← Marketplace
            </button>
            <span style={{ color: "var(--border)", fontSize: 12 }}>/</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{listing.title?.slice(0, 40)}...</span>
          </div>
          {/* ── Painel de sugestões da IA para o dono ── */}
          {user && user.id === listing.userId && listing.aiSuggestions && (() => {
            const suggs = Array.isArray(listing.aiSuggestions) ? listing.aiSuggestions : (listing.aiSuggestions?.improvements || []);
            if (!suggs.length) return null;
            return (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12,
                padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", marginBottom: 8,
                  textTransform: "uppercase", letterSpacing: 1 }}>
                  🤖 Sugestões da IA para melhorar sua oferta
                </div>
                {suggs.slice(0, 3).map((s: string, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 12, color: "#78350f" }}>
                    <span style={{ flexShrink: 0 }}>→</span><span>{s}</span>
                  </div>
                ))}
                {listing.aiScore && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#92400e" }}>
                    Score atual: <strong>{listing.aiScore}/100</strong> — otimize para aumentar visibilidade
                  </div>
                )}
              </div>
            );
          })()}

          {/* Botão de editar para o dono — aparece quando logado como dono */}
          {user && user.id === listing.userId && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setLocation(`/marketplace/seller?edit=${listing.id}`)}
                style={{ fontSize: 12, fontWeight: 700, background: "#334155", color: "white", border: "none", borderRadius: 10, padding: "7px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                ✏️ Editar oferta
              </button>
              {/* Upload de mídia direta na landing page */}
              {(() => {
                let gl: any[] = [];
                try { gl = listing.gallery ? JSON.parse(listing.gallery) : []; } catch {}
                const total = Math.min(5, gl.length + (listing.imageUrl && !gl.some((m: any) => m.url === listing.imageUrl) ? 1 : 0));
                const remaining = 5 - total;
                return (
              <label style={{ fontSize: 12, fontWeight: 700,
                background: remaining > 0 ? "#16a34a" : "#94a3b8",
                color: "white", border: "none", borderRadius: 10, padding: "7px 14px",
                cursor: remaining > 0 ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 5 }}
                title={remaining > 0 ? `${remaining} vaga(s) restante(s)` : "Limite atingido"}>
                <input type="file" accept="image/*,video/mp4,video/mov,video/webm" multiple
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    // Conta mídias já existentes
                    let currentGallery: any[] = [];
                    try { currentGallery = listing.gallery ? JSON.parse(listing.gallery) : []; } catch {}
                    if (listing.imageUrl && !currentGallery.length) currentGallery = [{ type: "image", url: listing.imageUrl }];
                    const remaining = Math.max(0, 5 - currentGallery.length);
                    if (remaining === 0) { alert("Limite de 5 fotos/vídeos atingido. Remova uma mídia antes de adicionar."); return; }
                    const toUpload = files.slice(0, remaining);
                    if (files.length > remaining) alert(`Apenas ${remaining} arquivo(s) serão enviados — limite de 5 mídias por oferta.`);
                    for (const file of toUpload) {
                      const fd = new FormData();
                      fd.append("file", file);
                      try {
                        const res = await fetch(`/api/marketplace/${listing.id}/upload-gallery`, {
                          method: "POST", body: fd, credentials: "include"
                        });
                        const data = await res.json();
                        if (data.success) {
                          // Reload para mostrar nova mídia
                          setListing((prev: any) => ({
                            ...prev,
                            imageUrl: data.type === "image" && !prev.imageUrl ? data.url : prev.imageUrl,
                            videoUrl: data.type === "video" && !prev.videoUrl ? data.url : prev.videoUrl,
                            gallery: JSON.stringify(data.gallery),
                          }));
                          setActiveMedia(0);
                        }
                      } catch {}
                    }
                    e.target.value = "";
                  }} />
                📸 {(() => {
                  let gl2: any[] = [];
                  try { gl2 = listing.gallery ? JSON.parse(listing.gallery) : []; } catch {}
                  const tot = Math.min(5, gl2.length + (listing.imageUrl && !gl2.some((m: any) => m.url === listing.imageUrl) ? 1 : 0));
                  return `Adicionar fotos/vídeo (${tot}/5)`;
                })()}
              </label>
                );
              })()}
              <button
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/marketplace/${listing.slug}`).then(() => alert("Link copiado!"))}
                style={{ fontSize: 12, fontWeight: 600, background: "var(--off)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 12px", cursor: "pointer" }}>
                🔗 Copiar link
              </button>
            </div>
          )}
        </div>

        {/* ── Galeria + Info principal (estilo Shopee/Mercado Livre) ── */}
        {(() => {
          // Monta galeria
          const gallery: { type: "image" | "video"; url: string; thumb?: string }[] = [];
          if (listing.imageUrl) gallery.push({ type: "image", url: listing.imageUrl });
          if (listing.videoUrl) gallery.push({ type: "video", url: listing.videoUrl, thumb: listing.thumbnailUrl || listing.imageUrl });
          try {
            const extra = listing.gallery ? JSON.parse(listing.gallery) : [];
            (extra as any[]).forEach((m: any) => gallery.push(m));
          } catch {}
          const hasMedia = gallery.length > 0;
          const active   = gallery[Math.min(activeMedia, gallery.length - 1)];
          const goNext   = () => { setShowVideo(false); setActiveMedia(i => (i + 1) % gallery.length); };
          const goPrev   = () => { setShowVideo(false); setActiveMedia(i => (i - 1 + gallery.length) % gallery.length); };

          // Insights por nicho
          const niche = listing.niche || "";
          const lp2: any = (() => { try { return listing.landingPage ? JSON.parse(listing.landingPage) : null; } catch { return null; } })();
          const nicheInsights: { icon: string; label: string; value: string }[] = [];
          if (niche.includes("imovel")) {
            if (listing.price)     nicheInsights.push({ icon: "💰", label: "Valor",       value: `R$ ${Number(listing.price).toLocaleString("pt-BR")}${listing.priceType === "monthly" ? "/mês" : ""}` });
            if (lp2?.details?.area || listing.area)       nicheInsights.push({ icon: "📐", label: "Área",        value: `${lp2?.details?.area || listing.area} m²` });
            if (lp2?.details?.rooms || listing.rooms)     nicheInsights.push({ icon: "🛏", label: "Quartos",     value: String(lp2?.details?.rooms || listing.rooms || "–") });
            if (lp2?.details?.garage || listing.garage)   nicheInsights.push({ icon: "🚗", label: "Vagas",       value: String(lp2?.details?.garage || listing.garage || "–") });
            if (listing.city || listing.state)            nicheInsights.push({ icon: "📍", label: "Localização", value: [listing.city, listing.state].filter(Boolean).join(", ") });
          } else if (niche.includes("saude") || niche.includes("estetica") || niche.includes("clinica")) {
            if (lp2?.details?.duration) nicheInsights.push({ icon: "⏱", label: "Duração",    value: lp2.details.duration });
            if (listing.price)          nicheInsights.push({ icon: "💰", label: "Valor",      value: `R$ ${Number(listing.price).toLocaleString("pt-BR")}` });
            nicheInsights.push({ icon: "📅", label: "Agendamento", value: "Online ou presencial" });
            if (listing.city)           nicheInsights.push({ icon: "📍", label: "Local",      value: listing.city });
          } else if (niche.includes("curso") || niche.includes("educacao") || niche.includes("infoproduto")) {
            if (lp2?.details?.duration)  nicheInsights.push({ icon: "⏱", label: "Duração",    value: lp2.details.duration });
            if (lp2?.details?.lessons)   nicheInsights.push({ icon: "🎓", label: "Aulas",      value: String(lp2.details.lessons) });
            nicheInsights.push({ icon: "🌐", label: "Formato",   value: "Online — acesso imediato" });
            if (lp2?.details?.guarantee) nicheInsights.push({ icon: "🛡", label: "Garantia",   value: lp2.details.guarantee });
          } else if (niche.includes("servico") || niche.includes("profissional")) {
            if (lp2?.details?.delivery)  nicheInsights.push({ icon: "⚡", label: "Entrega",    value: lp2.details.delivery });
            if (listing.price)           nicheInsights.push({ icon: "💰", label: "A partir de",value: `R$ ${Number(listing.price).toLocaleString("pt-BR")}` });
            nicheInsights.push({ icon: "✅", label: "Satisfação",  value: "Garantida ou reembolso" });
            if (listing.city || listing.isNational) nicheInsights.push({ icon: "📍", label: "Atendimento", value: listing.isNational ? "Todo o Brasil" : listing.city || "" });
          } else if (niche.includes("produto") || niche.includes("alimento")) {
            if (listing.price)           nicheInsights.push({ icon: "💰", label: "Preço",      value: `R$ ${Number(listing.price).toLocaleString("pt-BR")}` });
            nicheInsights.push({ icon: "🚚", label: "Entrega",    value: "Consultar frete" });
            nicheInsights.push({ icon: "🔄", label: "Troca",      value: "30 dias garantidos" });
          } else {
            // Genérico
            if (listing.price)           nicheInsights.push({ icon: "💰", label: "Valor",      value: `R$ ${Number(listing.price).toLocaleString("pt-BR")}${listing.priceType === "monthly" ? "/mês" : ""}` });
            if (listing.city || listing.isNational) nicheInsights.push({ icon: "📍", label: "Atendimento", value: listing.isNational ? "Todo o Brasil" : listing.city || "" });
          }

          return (
            <div style={{ margin: "0 0 0" }}>
              {/* ── GALERIA com navegação ← → ── */}
              {hasMedia && (
                <div style={{ position: "relative", background: "#0f172a", marginBottom: 0,
                  maxHeight: 440, overflow: "hidden",
                  aspectRatio: "4/3",
                }}>
                  {/* Imagem ou vídeo ativo */}
                  {active?.type === "video" && showVideo ? (
                    <video src={active.url} controls autoPlay
                      style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : active?.type === "video" ? (
                    <>
                      {active.thumb
                        ? <img src={active.thumb} alt="video" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }} />
                        : <div style={{ width: "100%", height: "100%", background: "#1e293b" }} />}
                      <button onClick={() => setShowVideo(true)}
                        style={{ position: "absolute", inset: 0, background: "none", border: "none", cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.15)",
                          border: "2px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 26 }}>▶</div>
                        <span style={{ color: "white", fontSize: 13, fontWeight: 700,
                          background: "rgba(0,0,0,0.5)", padding: "5px 14px", borderRadius: 20 }}>Assistir vídeo</span>
                      </button>
                    </>
                  ) : (
                    <img src={active?.url || ""} alt={listing.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}

                  {/* Setas navegação ← → */}
                  {gallery.length > 1 && (
                    <>
                      <button onClick={goPrev}
                        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                          width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.55)",
                          border: "none", color: "white", fontSize: 16, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          backdropFilter: "blur(4px)", zIndex: 2 }}>←</button>
                      <button onClick={goNext}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                          width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.55)",
                          border: "none", color: "white", fontSize: 16, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          backdropFilter: "blur(4px)", zIndex: 2 }}>→</button>
                    </>
                  )}

                  {/* Indicador de posição (bolinhas) */}
                  {gallery.length > 1 && (
                    <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
                      display: "flex", gap: 5, zIndex: 2 }}>
                      {gallery.slice(0, 5).map((_, i) => (
                        <div key={i} onClick={() => { setActiveMedia(i); setShowVideo(false); }}
                          style={{ width: activeMedia === i ? 18 : 7, height: 7, borderRadius: 4,
                            background: activeMedia === i ? "white" : "rgba(255,255,255,0.5)",
                            cursor: "pointer", transition: "all .2s" }} />
                      ))}
                    </div>
                  )}

                  {/* Badge tipo */}
                  <div style={{ position: "absolute", top: 10, right: 10,
                    background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
                    color: "white", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                    {active?.type === "video" ? "🎬 Vídeo" : `🖼 ${activeMedia + 1}/${gallery.length}`}
                  </div>
                </div>
              )}

              {/* Thumbnails clicáveis abaixo da galeria */}
              {gallery.length > 1 && (
                <div style={{ display: "flex", gap: 6, padding: "8px 16px",
                  background: "var(--off)", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
                  {gallery.slice(0, 5).map((m, i) => (
                    <div key={i} onClick={() => { setActiveMedia(i); setShowVideo(false); }}
                      style={{ width: 58, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                        cursor: "pointer", border: `2px solid ${activeMedia === i ? nc.color : "var(--border)"}`,
                        background: "#0f172a", position: "relative", transition: "border-color .15s" }}>
                      {m.type === "video"
                        ? <>{m.thumb && <img src={m.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }} />}
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                              justifyContent: "center", fontSize: 14, color: "white" }}>▶</div></>
                        : <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                  ))}
                </div>
              )}

              {/* ── BLOCO PRINCIPAL: título + preço + insights + CTA ── */}
              <div style={{ padding: "20px 16px", borderBottom: "1px solid var(--border)" }}>
                {/* Nicho badge */}
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                    background: nc.bg, color: nc.color, textTransform: "uppercase", letterSpacing: 1 }}>
                    {NICHES.find(n => n.key === listing.niche)?.label || listing.niche}
                  </span>
                </div>

                {/* Título principal */}
                <h1 style={{ fontSize: "clamp(18px,5vw,28px)", fontWeight: 900, color: "var(--black)",
                  margin: "0 0 6px", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
                  {lp?.hero?.headline || listing.headline || listing.title}
                </h1>

                {/* Subtítulo/descritivo */}
                {(lp?.hero?.subheadline || listing.subheadline || listing.description) && (
                  <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.65 }}>
                    {lp?.hero?.subheadline || listing.subheadline || listing.description}
                  </p>
                )}

                {/* Preço em destaque */}
                {listing.price && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: nc.color, letterSpacing: "-0.03em" }}>
                      R$ {Number(listing.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                    {listing.priceType === "monthly" && <span style={{ fontSize: 14, color: "var(--muted)" }}>/mês</span>}
                    {listing.priceType === "negotiable" && <span style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>Negociável</span>}
                    {listing.guarantee && (
                      <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534",
                        padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>🛡 {listing.guarantee.slice(0, 30)}</span>
                    )}
                  </div>
                )}

                {/* ── Insights por nicho (estilo ficha técnica) ── */}
                {nicheInsights.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                    gap: 8, marginBottom: 16, padding: "12px", background: "var(--off)",
                    borderRadius: 12, border: "1px solid var(--border)" }}>
                    {nicheInsights.map((ins, i) => (
                      <div key={i} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, marginBottom: 2 }}>{ins.icon}</div>
                        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase",
                          letterSpacing: "0.05em", marginBottom: 1 }}>{ins.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--black)" }}>{ins.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA principal */}
                <button className="lp-btn" onClick={handleCta}
                  style={{ width: "100%", background: nc.color, color: "white", border: "none",
                    cursor: "pointer", borderRadius: 12, padding: "14px 0",
                    fontSize: 15, fontWeight: 800, letterSpacing: 0.3, marginBottom: 8 }}>
                  {ctaText}
                </button>

                {/* CTA secundário — WhatsApp */}
                {listing.whatsappNumber && listing.checkoutType !== "whatsapp" && (
                  <button onClick={() => window.open(`https://wa.me/${listing.whatsappNumber}`, "_blank")}
                    style={{ width: "100%", background: "#25d366", color: "white", border: "none",
                      cursor: "pointer", borderRadius: 12, padding: "12px 0",
                      fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 6 }}>
                    💬 Perguntar no WhatsApp
                  </button>
                )}

                {/* Trust signals */}
                <div style={{ display: "flex", gap: 12, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    🔒 Anúncio verificado
                  </span>
                  {listing.views > 0 && (
                    <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                      👁 {listing.views} pessoas viram este anúncio
                    </span>
                  )}
                  {listing.clicks > 0 && (
                    <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                      ❤️ {listing.clicks} demonstraram interesse
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Problema */}
        {lp?.problem && (
          <div style={{ margin: "0 16px 20px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", margin: "0 0 16px" }}>
              {lp.problem.title}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(lp.problem.points || []).map((p: string, i: number) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#ff453a", flexShrink: 0, marginTop: 1 }}>✕</span>
                  <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Benefícios */}
        {(lp?.benefits?.items || listing.benefits) && (
          <div style={{ margin: "0 16px 20px" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>
              {lp?.benefits?.title || "O que você vai ter"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              {(lp?.benefits?.items || listing.benefits || []).map((b: any, i: number) => (
                <div key={i} style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 12, padding: "14px 16px", display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <span style={{ color: nc.color, flexShrink: 0, fontWeight: 900, marginTop: 1 }}>
                    {b.icon || "✓"}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 3 }}>
                      {b.title || b}
                    </div>
                    {b.desc && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{b.desc}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Depoimentos */}
        {(lp?.social?.testimonials || listing.testimonials) && (
          <div style={{ margin: "0 16px 20px" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>O que dizem os clientes</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              {(lp?.social?.testimonials || listing.testimonials || []).map((t: any, i: number) => (
                <div key={i} style={{
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px",
                }}>
                  <div style={{ color: "#ff9f0a", marginBottom: 6, fontSize: 12 }}>
                    {"★".repeat(t.rating || 5)}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5, margin: "0 0 10px" }}>
                    "{t.text}"
                  </p>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--black)" }}>— {t.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA central */}
        <div style={{
          margin: "0 16px 20px", background: `linear-gradient(135deg,${nc.color}18,${nc.bg}44)`,
          border: `1px solid ${nc.color}33`, borderRadius: 16, padding: "28px 24px", textAlign: "center",
        }}>
          {listing.price && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: nc.color }}>
                R$ {Number(listing.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
              {listing.priceType === "monthly" && <span style={{ color: "var(--muted)", fontSize: 14 }}>/mês</span>}
            </div>
          )}
          {lp?.pricing?.guarantee && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>🛡️ {lp.pricing.guarantee}</p>
          )}
          <button className="lp-btn" onClick={handleCta} style={{
            background: nc.color, color: "white", border: "none", cursor: "pointer",
            borderRadius: 14, padding: "14px 40px", fontSize: 15, fontWeight: 800,
          }}>{ctaText}</button>
          {contactSent && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#30d158", fontWeight: 700 }}>
              ✓ Solicitação enviada! O vendedor entrará em contato.
            </div>
          )}
        </div>

        {/* FAQ */}
        {(lp?.faq?.items || listing.faq) && (
          <div style={{ margin: "0 16px 20px" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>Perguntas frequentes</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(lp?.faq?.items || listing.faq || []).map((f: any, i: number) => (
                <FaqItem key={i} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        )}

        {/* Footer da landing */}
        <div style={{ margin: "24px 16px 0", textAlign: "center" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--off)", borderRadius: 20, padding: "6px 14px",
            fontSize: 10, color: "var(--muted)",
          }}>
            🤖 Produto gerado com tecnologia{" "}
            <strong style={{ color: "var(--blue)" }}>MecProAI</strong>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
            {listing.city && `📍 ${[listing.city, listing.state].filter(Boolean).join(", ")} · `}
            Vendido por {listing.sellerName || "MecProAI Seller"}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item" onClick={() => setOpen(o => !o)} style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "14px 16px", transition: "background .15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", flex: 1, paddingRight: 12 }}>❓ {q}</span>
        <span style={{ color: "var(--muted)", fontSize: 16, flexShrink: 0 }}>{open ? "−" : "+"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Vitrine principal ────────────────────────────────────────────────────────
function MarketplaceHome() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [niche, setNiche]       = useState("");
  const [priceType, setPriceType] = useState("");
  const [page, setPage]         = useState(1);
  const [hasMore, setHasMore]   = useState(true);

  async function fetchListings(reset = false) {
    setLoading(true);
    try {
      const p = reset ? 1 : page;
      const params = new URLSearchParams({ page: String(p), limit: "12" });
      if (search)    params.set("search", search);
      if (niche)     params.set("niche", niche);
      if (priceType) params.set("priceType", priceType);
      const res  = await fetch(`/api/marketplace?${params}`, { credentials: "include" });
      const data = await res.json();
      if (reset) { setListings(data.listings || []); setPage(2); }
      else       { setListings(prev => [...prev, ...(data.listings || [])]); setPage(p + 1); }
      setHasMore((data.listings || []).length === 12);
    } catch {
      setListings(MOCK_LISTINGS);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchListings(true); }, [niche, priceType]);

  function handleSearch(e: React.FormEvent) { e.preventDefault(); fetchListings(true); }

  return (
    <Layout>
      <style>{`
        .mp-card:hover { transform:translateY(-3px); box-shadow:var(--shadow-md); border-color:var(--blue-l)!important; }
        .niche-chip { transition:all .15s; cursor:pointer; }
        .niche-chip:hover { border-color:var(--blue)!important; color:var(--blue)!important; }
        .niche-chip.active { background:var(--blue)!important; color:white!important; border-color:var(--blue)!important; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 60px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "var(--blue-l)", borderRadius: 20, padding: "4px 14px",
            fontSize: 11, fontWeight: 700, color: "var(--blue)", marginBottom: 14,
            textTransform: "uppercase", letterSpacing: 1,
          }}>🛒 MecProAI Marketplace</div>
          <h1 style={{ fontSize: "clamp(24px,4vw,40px)", fontWeight: 900, color: "var(--black)", margin: "0 0 10px", letterSpacing: "-0.04em" }}>
            Ofertas geradas com <span style={{ color: "var(--blue)" }}>inteligência artificial</span>
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", maxWidth: 520, margin: "0 auto 24px" }}>
            Produtos, serviços e oportunidades com landing pages otimizadas por IA — prontos para converter.
          </p>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, maxWidth: 560, margin: "0 auto" }}>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, nicho, cidade..." style={{ flex: 1, fontSize: 14 }} />
            <button className="btn btn-md btn-primary" type="submit" style={{ fontSize: 13, fontWeight: 700 }}>🔍 Buscar</button>
            <button type="button" className="btn btn-md"
              style={{ background: "#30d158", color: "white", fontWeight: 700, fontSize: 13, flexShrink: 0 }}
              onClick={() => user ? setLocation("/marketplace/publish") : setLocation("/login?redirect=/marketplace/publish")}>
              + Publicar
            </button>
          </form>
        </div>

        {/* Filtros de nicho — agrupados */}
        <div style={{ marginBottom: 16 }}>
          {/* Botão "Todos" */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 8 }}>
            <button className={`niche-chip${niche === "" ? " active" : ""}`} onClick={() => setNiche("")}
              style={{ border: "1px solid var(--border)", borderRadius: 20, padding: "5px 14px",
                fontSize: 12, fontWeight: 600, background: niche === "" ? "var(--blue)" : "var(--card)",
                color: niche === "" ? "white" : "var(--muted)" }}>🔍 Todos</button>
          </div>
          {/* Grupos de nichos */}
          {NICHE_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
                letterSpacing: 1, marginBottom: 4, textAlign: "center" }}>{group.label}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
                {group.keys.map(k => {
                  const nc = NICHE_TAXONOMY.find(n => n.key === k);
                  if (!nc) return null;
                  const isActive = niche === k;
                  return (
                    <button key={k} className={`niche-chip${isActive ? " active" : ""}`}
                      onClick={() => setNiche(isActive ? "" : k)}
                      style={{
                        border: `1px solid ${isActive ? nc.color : "var(--border)"}`,
                        borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600,
                        background: isActive ? nc.bg : "var(--card)",
                        color: isActive ? nc.color : "var(--muted)",
                      }}>{nc.icon} {nc.label.replace(/[^a-zA-ZÀ-ú\s\u0080-\uFFFF]/g, "").trim() || nc.label}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Filtro preço */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
          {PRICE_TYPES.map(p => (
            <button key={p.key} onClick={() => setPriceType(p.key)} style={{
              border: `1px solid ${priceType === p.key ? "var(--blue)" : "var(--border)"}`,
              borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 600,
              background: priceType === p.key ? "var(--blue-l)" : "transparent",
              color: priceType === p.key ? "var(--blue)" : "var(--muted)", cursor: "pointer",
            }}>{p.label}</button>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
          {loading && listings.length === 0
            ? Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
            : listings.map(l => (
                <ListingCard key={l.id} listing={l} onClick={() => setLocation(`/marketplace/${l.slug}`)} />
              ))
          }
        </div>

        {/* Empty state */}
        {!loading && listings.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Nenhuma oferta encontrada</div>
            <div style={{ fontSize: 13 }}>Tente outros filtros ou seja o primeiro a publicar neste nicho!</div>
            <button className="btn btn-md btn-primary" style={{ marginTop: 16, fontWeight: 700 }}
              onClick={() => user ? setLocation("/marketplace/publish") : setLocation("/login?redirect=/marketplace/publish")}>
              + Publicar minha oferta
            </button>
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && listings.length > 0 && (
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <button className="btn btn-md" style={{ fontWeight: 700 }} onClick={() => fetchListings(false)}>
              Carregar mais ofertas
            </button>
          </div>
        )}

        {loading && listings.length > 0 && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>⏳ Carregando...</div>
        )}

        {/* Banner CTA — sempre visível */}
        <div style={{
          marginTop: 40, background: "linear-gradient(135deg,var(--blue-l),var(--card))",
          border: "1px solid var(--blue-l)", borderRadius: 16, padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
              🚀 Publique sua oferta no marketplace
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {user
                ? "Transforme campanhas do MecProAI em vitrine de vendas com landing page gerada por IA"
                : "Crie uma conta grátis e publique seu produto ou serviço com landing page gerada por IA em minutos"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {user && (
              <button className="btn btn-md" onClick={() => setLocation("/marketplace/seller")}
                style={{ fontSize: 12, fontWeight: 700 }}>Meu dashboard →</button>
            )}
            <button className="btn btn-md btn-primary"
              onClick={() => user ? setLocation("/marketplace/publish") : setLocation("/login?redirect=/marketplace/publish")}
              style={{ fontSize: 12, fontWeight: 700, background: "#30d158" }}>
              {user ? "+ Publicar oferta" : "🚀 Publicar grátis"}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── Roteador principal ───────────────────────────────────────────────────────
export default function Marketplace() {
  const params = useParams<{ slug?: string }>();
  // /:slug route only matches real listing slugs (publish/seller handled by dedicated routes)
  if (params?.slug) {
    return <ListingLanding slug={params.slug} />;
  }
  return <MarketplaceHome />;
}

// ─── Mock para preview offline ────────────────────────────────────────────────
const MOCK_LISTINGS = [
  { id:1, slug:"aptos-centro-sp", niche:"imobiliario", title:"Apartamentos no Centro de SP — Oportunidade de Investimento", subheadline:"2 e 3 dormitórios com documentação 100% digital e financiamento facilitado", price:"380000", priceType:"fixed", city:"São Paulo", state:"SP", aiScore:87 },
  { id:2, slug:"gestao-trafego-pro", niche:"servicos", title:"Gestão de Tráfego Pago — Resultados em 30 dias ou devolvemos", subheadline:"Especialistas em Meta Ads e Google Ads para negócios locais e e-commerce", price:"1200", priceType:"monthly", isNational:true, aiScore:92, boostActive:true },
  { id:3, slug:"curso-emagrecimento-21d", niche:"infoprodutos", title:"Emagrecimento Definitivo em 21 Dias — Método Aprovado por Nutricionistas", subheadline:"Mais de 3.200 alunos transformados sem dietas malucas ou exercícios extremos", price:"197", priceType:"fixed", isNational:true, aiScore:78 },
  { id:4, slug:"consultoria-marketing-local", niche:"negocios_locais", title:"Consultoria de Marketing para Negócios Locais — 1ª Sessão Grátis", subheadline:"Triplique seus clientes em 60 dias com estratégias validadas no mercado brasileiro", price:"350", priceType:"fixed", city:"Balneário Camboriú", state:"SC", aiScore:84 },
  { id:5, slug:"ebook-copy-vendas", niche:"infoprodutos", title:"E-book: A Bíblia do Copywriting — 247 Técnicas de Vendas Comprovadas", subheadline:"Do zero ao copy profissional que vende todos os dias de forma previsível", price:"47", priceType:"fixed", isNational:true, aiScore:81 },
  { id:6, slug:"clinica-estetica-sc", niche:"saude_beleza", title:"Clínica Estética Premium — Resultados Visíveis a Partir da 1ª Sessão", subheadline:"Harmonização facial, limpeza de pele e tratamentos corporais com tecnologia de ponta", price:null, priceType:"negotiable", city:"Florianópolis", state:"SC", aiScore:74 },
];
