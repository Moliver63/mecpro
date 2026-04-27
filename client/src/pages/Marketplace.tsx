/**
 * Marketplace.tsx — Vitrine pública + Landing page individual
 * Rota: /marketplace           (vitrine, sem login)
 * Rota: /marketplace/:slug     (landing page do produto)
 */
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";

// ─── Constantes ───────────────────────────────────────────────────────────────
const NICHES = [
  { key: "",                 label: "Todos" },
  { key: "imobiliario",     label: "🏠 Imobiliário" },
  { key: "servicos",        label: "⚙️ Serviços" },
  { key: "infoprodutos",    label: "🎓 Infoprodutos" },
  { key: "produtos_fisicos",label: "📦 Produtos físicos" },
  { key: "negocios_locais", label: "📍 Negócios locais" },
  { key: "saude_beleza",    label: "💆 Saúde & Beleza" },
  { key: "educacao",        label: "📚 Educação" },
  { key: "alimentacao",     label: "🍽️ Alimentação" },
  { key: "ecommerce",       label: "🛒 E-commerce" },
];

const PRICE_TYPES = [
  { key: "",           label: "Qualquer preço" },
  { key: "free",       label: "Gratuito" },
  { key: "fixed",      label: "Preço fixo" },
  { key: "monthly",    label: "Mensal" },
  { key: "negotiable", label: "A negociar" },
];

const NICHE_COLORS: Record<string, { bg: string; color: string }> = {
  imobiliario:      { bg: "#e6f1fb", color: "#185fa5" },
  servicos:         { bg: "#eaf3de", color: "#3b6d11" },
  infoprodutos:     { bg: "#eeedfe", color: "#534ab7" },
  produtos_fisicos: { bg: "#fbeaf0", color: "#993556" },
  negocios_locais:  { bg: "#e1f5ee", color: "#0f6e56" },
  saude_beleza:     { bg: "#faeeda", color: "#854f0b" },
  educacao:         { bg: "#e6f1fb", color: "#185fa5" },
  alimentacao:      { bg: "#fcebeb", color: "#a32d2d" },
  ecommerce:        { bg: "#eeedfe", color: "#534ab7" },
  outros:           { bg: "#f1efe8", color: "#5f5e5a" },
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
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{
            flex: 1, background: "var(--blue)", color: "white",
            borderRadius: 10, padding: "7px 0", fontSize: 12, fontWeight: 700, textAlign: "center",
          }}>Ver oferta →</div>
          {listing.aiScore && (
            <div style={{
              background: "var(--off)", borderRadius: 8, padding: "6px 8px",
              fontSize: 10, fontWeight: 700, color: "var(--muted)", textAlign: "center",
            }}>IA {listing.aiScore}</div>
          )}
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
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [contactSent, setContactSent] = useState(false);

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

        {/* Breadcrumb */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setLocation("/marketplace")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>
            ← Marketplace
          </button>
          <span style={{ color: "var(--border)", fontSize: 12 }}>/</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{listing.title?.slice(0, 40)}...</span>
        </div>

        {/* Hero */}
        <div style={{
          background: `linear-gradient(135deg, ${nc.color}18, ${nc.bg}44)`,
          border: `1px solid ${nc.color}33`,
          borderRadius: 20, margin: "0 16px 24px", padding: "36px 32px", textAlign: "center",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--card)", borderRadius: 20, padding: "4px 12px",
            fontSize: 10, fontWeight: 700, color: nc.color, marginBottom: 16,
            border: `1px solid ${nc.color}33`, textTransform: "uppercase", letterSpacing: 1,
          }}>🤖 Gerado com MecProAI</div>

          <h1 style={{ fontSize: "clamp(22px,4vw,34px)", fontWeight: 900, color: "var(--black)", margin: "0 0 12px", lineHeight: 1.2, letterSpacing: "-0.03em" }}>
            {lp?.hero?.headline || listing.headline || listing.title}
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", margin: "0 0 28px", maxWidth: 540, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
            {lp?.hero?.subheadline || listing.subheadline || listing.description}
          </p>

          <button className="lp-btn" onClick={handleCta} style={{
            background: nc.color, color: "white", border: "none", cursor: "pointer",
            borderRadius: 14, padding: "14px 40px", fontSize: 15, fontWeight: 800, letterSpacing: 0.3,
          }}>{ctaText}</button>

          {listing.price && (
            <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
              <strong style={{ fontSize: 20, color: nc.color, fontWeight: 900 }}>
                R$ {Number(listing.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </strong>
              {listing.priceType === "monthly" && <span>/mês</span>}
              {listing.priceType === "negotiable" && <span style={{ color: "var(--muted)", fontSize: 12 }}> · A negociar</span>}
            </div>
          )}
        </div>

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

        {/* Filtros nicho */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
          {NICHES.map(n => (
            <button key={n.key} className={`niche-chip${niche === n.key ? " active" : ""}`}
              onClick={() => setNiche(n.key)}
              style={{
                border: "1px solid var(--border)", borderRadius: 20,
                padding: "5px 14px", fontSize: 12, fontWeight: 600,
                background: niche === n.key ? "var(--blue)" : "var(--card)",
                color: niche === n.key ? "white" : "var(--muted)",
              }}>{n.label}</button>
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
