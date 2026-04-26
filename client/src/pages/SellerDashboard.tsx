/**
 * SellerDashboard.tsx — Painel do vendedor no Marketplace
 * Rota: /marketplace/seller (protegida)
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { toast } from "sonner";

function MetricCard({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || "var(--black)", letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function CtrBar({ ctr }: { ctr: number }) {
  const color = ctr >= 5 ? "#30d158" : ctr >= 3 ? "#ff9f0a" : "#ff453a";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>CTR</span>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{ctr.toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: "var(--off)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(ctr * 10, 100)}%`, background: color, borderRadius: 2, transition: "width .6s" }} />
      </div>
    </div>
  );
}

export default function SellerDashboard() {
  const [, setLocation] = useLocation();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState<number | null>(null);
  const [activeTab, setActiveTab]   = useState<"listings" | "orders">("listings");

  useEffect(() => {
    fetch("/api/marketplace/seller/dashboard", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); else setData(MOCK_DATA); })
      .catch(() => setData(MOCK_DATA))
      .finally(() => setLoading(false));
  }, []);

  async function optimize(listingId: number) {
    setOptimizing(listingId);
    try {
      const res  = await fetch(`/api/marketplace/${listingId}/optimize`, { method: "POST", credentials: "include" });
      const resp = await res.json();
      if (resp.success) {
        toast.success("✦ IA gerou sugestões de otimização!");
        // Atualiza listing na lista
        setData((prev: any) => ({
          ...prev,
          listings: prev.listings.map((l: any) =>
            l.id === listingId ? { ...l, aiSuggestions: resp.suggestions } : l
          ),
        }));
      } else {
        toast.error(resp.error || "Erro ao otimizar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setOptimizing(null);
    }
  }

  async function toggleStatus(listing: any) {
    const newStatus = listing.status === "active" ? "paused" : "active";
    try {
      await fetch(`/api/marketplace/${listing.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setData((prev: any) => ({
        ...prev,
        listings: prev.listings.map((l: any) =>
          l.id === listing.id ? { ...l, status: newStatus } : l
        ),
      }));
      toast.success(`Listagem ${newStatus === "active" ? "reativada" : "pausada"}`);
    } catch {
      toast.error("Erro ao atualizar status");
    }
  }

  const s = data?.stats;

  return (
    <Layout>
      <style>{`
        .listing-row:hover { background: var(--off) !important; }
        .order-row:hover { background: var(--off) !important; }
        .action-btn:hover { opacity: .8; }
      `}</style>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 60px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--black)", letterSpacing: "-0.04em" }}>
              🛒 Dashboard do Vendedor
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>Gerencie suas listagens e acompanhe vendas em tempo real</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-md" onClick={() => setLocation("/marketplace")} style={{ fontSize: 12 }}>Ver vitrine →</button>
            <button className="btn btn-md btn-primary" onClick={() => setLocation("/marketplace/publish")}
              style={{ fontWeight: 700, fontSize: 12, background: "#30d158" }}>+ Nova oferta</button>
          </div>
        </div>

        {/* Métricas */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
            {Array(5).fill(0).map((_, i) => <div key={i} style={{ height: 90, background: "var(--off)", borderRadius: 14 }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
            <MetricCard icon="◫"  label="Listagens ativas"   value={String(s?.activeListings || 0)} />
            <MetricCard icon="👁" label="Visualizações"      value={(s?.totalViews || 0).toLocaleString("pt-BR")} />
            <MetricCard icon="↗" label="Cliques totais"     value={(s?.totalClicks || 0).toLocaleString("pt-BR")} />
            <MetricCard icon="✓"  label="Pedidos"            value={String(s?.totalOrders || 0)} color="#30d158" />
            <MetricCard icon="R$" label="Receita gerada"     value={`R$ ${(s?.totalRevenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="var(--blue)" />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          {(["listings", "orders"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                background: activeTab === t ? "var(--off)" : "transparent",
                color: activeTab === t ? "var(--black)" : "var(--muted)",
                borderBottom: activeTab === t ? "2px solid var(--blue)" : "2px solid transparent",
                borderRadius: "8px 8px 0 0",
              }}>
              {t === "listings" ? `📋 Minhas listagens (${data?.listings?.length || 0})` : `🧾 Pedidos (${data?.recentOrders?.length || 0})`}
            </button>
          ))}
        </div>

        {/* Listagens */}
        {activeTab === "listings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(data?.listings || []).length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Nenhuma listagem ainda</div>
                <button className="btn btn-md btn-primary" style={{ fontWeight: 700 }}
                  onClick={() => setLocation("/marketplace/publish")}>+ Publicar primeira oferta</button>
              </div>
            )}
            {(data?.listings || []).map((l: any) => {
              const ctr = l.views > 0 ? (l.clicks / l.views * 100) : 0;
              const isLow = ctr < 3 && l.views > 50;
              return (
                <div key={l.id} className="listing-row"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", transition: "background .15s" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
                          background: l.status === "active" ? "rgba(48,209,88,.15)" : "var(--off)",
                          color: l.status === "active" ? "#30d158" : "var(--muted)",
                        }}>{l.status === "active" ? "● Ativo" : "⏸ Pausado"}</span>
                        {isLow && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: "rgba(255,159,10,.15)", color: "#ff9f0a" }}>⚡ CTR baixo</span>}
                        {l.boostActive && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: "rgba(90,200,250,.15)", color: "#5ac8fa" }}>🚀 Boost ativo</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 3, lineHeight: 1.3 }}>{l.title}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {l.views} views · {l.clicks} cliques · {l.conversions || 0} conversões
                        {l.price && ` · R$ ${Number(l.price).toLocaleString("pt-BR")}`}
                      </div>
                    </div>

                    <div style={{ width: 140, flexShrink: 0 }}>
                      <CtrBar ctr={ctr} />
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                        Receita: <strong style={{ color: "var(--black)" }}>R$ {Number(l.revenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      {isLow && (
                        <button className="btn btn-sm action-btn" onClick={() => optimize(l.id)}
                          disabled={optimizing === l.id}
                          style={{ fontSize: 11, background: "rgba(255,159,10,.12)", color: "#ff9f0a", fontWeight: 700, border: "1px solid rgba(255,159,10,.3)" }}>
                          {optimizing === l.id ? "⏳ Otimizando..." : "✦ Otimizar com IA"}
                        </button>
                      )}
                      <button className="btn btn-sm action-btn" onClick={() => setLocation(`/marketplace/${l.slug}`)}
                        style={{ fontSize: 11, fontWeight: 600 }}>Ver oferta →</button>
                      <button className="btn btn-sm action-btn" onClick={() => toggleStatus(l)}
                        style={{ fontSize: 11, fontWeight: 600 }}>{l.status === "active" ? "⏸ Pausar" : "▶ Reativar"}</button>
                    </div>
                  </div>

                  {/* Sugestões da IA */}
                  {l.aiSuggestions && (
                    <div style={{ marginTop: 10, background: "var(--blue-l)", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--blue)", marginBottom: 4 }}>💡 Sugestões da IA</div>
                      {(Array.isArray(l.aiSuggestions) ? l.aiSuggestions : l.aiSuggestions.improvements || []).slice(0, 3).map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 11, color: "var(--blue)", marginBottom: 2 }}>• {s}</div>
                      ))}
                      {l.aiSuggestions.newHeadline && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                          Nova headline sugerida: <strong style={{ color: "var(--black)" }}>"{l.aiSuggestions.newHeadline}"</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pedidos */}
        {activeTab === "orders" && (
          <div>
            {(data?.recentOrders || []).length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhum pedido ainda</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Seus pedidos aparecerão aqui quando os clientes converterem</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(data?.recentOrders || []).map((o: any, i: number) => (
                <div key={i} className="order-row"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14, transition: "background .15s" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: o.status === "completed" ? "rgba(48,209,88,.15)" : "var(--off)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                  }}>{o.status === "completed" ? "✓" : "⏳"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{o.buyerName || o.buyerEmail}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{o.listingTitle || "Oferta"} · {new Date(o.createdAt).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#30d158" }}>R$ {Number(o.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>Comissão: R$ {Number(o.commission || 0).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Banner boost */}
        <div style={{
          marginTop: 28, background: "linear-gradient(135deg, var(--blue-l), var(--card))",
          border: "1px solid var(--blue-l)", borderRadius: 16, padding: "18px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>🚀 Aumente sua visibilidade com Boost</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Destaque sua oferta no topo do marketplace por 7, 15 ou 30 dias</div>
          </div>
          <button className="btn btn-md btn-primary" style={{ fontWeight: 700, fontSize: 12 }}>
            Ver planos de destaque →
          </button>
        </div>
      </div>
    </Layout>
  );
}

// Mock para preview
const MOCK_DATA = {
  stats: { activeListings: 3, totalViews: 1247, totalClicks: 58, totalOrders: 4, totalRevenue: 840 },
  listings: [
    { id:1, slug:"aptos-centro-sp", title:"Apartamentos no Centro de SP", niche:"imobiliario", status:"active", views:892, clicks:43, conversions:2, price:"380000", revenue:"0", boostActive:false, aiSuggestions:["Adicionar vídeo de tour virtual","Incluir urgência: 'Apenas 3 restantes'","Adicionar número de unidades"] },
    { id:2, slug:"gestao-trafego-pro", title:"Gestão de Tráfego Pago — Resultados em 30 dias", niche:"servicos", status:"active", views:255, clicks:8, conversions:1, price:"1200", revenue:"1200", boostActive:true },
    { id:3, slug:"curso-emagrecimento", title:"Curso Emagrecimento Definitivo 21 Dias", niche:"infoprodutos", status:"paused", views:100, clicks:2, conversions:1, price:"197", revenue:"197" },
  ],
  recentOrders: [
    { buyerName:"João Silva", buyerEmail:"joao@email.com", listingTitle:"Curso Emagrecimento", amount:"197", commission:"19.70", status:"completed", createdAt:new Date().toISOString() },
    { buyerName:"Maria Fernanda", buyerEmail:"maria@email.com", listingTitle:"Gestão de Tráfego", amount:"1200", commission:"120.00", status:"completed", createdAt:new Date(Date.now()-86400000).toISOString() },
  ],
};
