/**
 * Dashboard.tsx — Redesign completo
 * Mesmo padrão do sidebar: Liquid Glass · Geist · CSS vars · sem hardcode
 */
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

const NAV_CARDS = [
  { icon: "◈", label: "Meta Ads",       sub: "Campanhas e criativos",      path: "/meta-campaigns",     color: "#1877f2" },
  { icon: "◉", label: "Google Ads",     sub: "Search e Display",           path: "/google-campaigns",   color: "#1a73e8" },
  { icon: "◍", label: "TikTok Ads",     sub: "Vídeos e performance",       path: "/tiktok-campaigns",   color: "#333"   },
  { icon: "⟳", label: "Agente IA",      sub: "Automação autônoma",         path: "/autonomous-agent",   color: "#5856d6" },
  { icon: "▣", label: "Financeiro",     sub: "Saldo e verba de mídia",     path: "/financeiro",         color: "#30d158" },
  { icon: "⊙", label: "Academia",       sub: "Cursos e certificados",      path: "/academy",            color: "#ff9f0a" },
  { icon: "◻", label: "Notificações",   sub: "Alertas e mensagens",        path: "/notifications",      color: "#0071e3" },
  { icon: "⊘", label: "Assinatura",     sub: "Plano e cobrança",           path: "/my-subscription",   color: "#ff3b30" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  const active    = projects?.filter(p => p.status !== "archived") ?? [];
  const completed = projects?.filter(p => p.status === "completed") ?? [];

  const STATS = [
    { icon: "◫",  label: "Projetos ativos",    value: String(active.length),    color: "var(--green)",  bg: "rgba(48,209,88,0.1)"  },
    { icon: "▣",  label: "Campanhas geradas",   value: String(completed.length), color: "var(--blue)",   bg: "var(--blue-l)"        },
    { icon: "⭐", label: "Plano atual",          value: (user?.plan ?? "FREE").toUpperCase(), color: "var(--orange)", bg: "rgba(255,159,10,0.1)" },
  ];

  return (
    <Layout>
      <style>{`
        .dash-card   { transition: all .2s var(--ease); }
        .dash-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md) !important; border-color: var(--border2) !important; }
        .dash-nav:hover  { border-color: var(--blue) !important; box-shadow: var(--shadow-blue) !important; }
        .dash-nav:hover .dash-nav-icon { transform: scale(1.1); }
        .dash-nav-icon   { transition: transform .15s; }
        .proj-row:hover  { background: var(--off) !important; }
        .dash-stat:hover { transform: translateY(-2px); box-shadow: var(--shadow-md) !important; }
        .dash-stat { transition: all .2s; }
      `}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px", fontFamily: "var(--font)" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: "var(--grad-primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, boxShadow: "var(--shadow-blue)", flexShrink: 0, color: "white",
            }}>⊞</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.04em" }}>
                Olá, {user?.name?.split(" ")[0] ?? "Usuário"} 👋
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Aqui está o resumo dos seus projetos e campanhas
              </p>
            </div>
          </div>
          <button className="btn btn-primary btn-md" onClick={() => setLocation("/projects/new")}>
            + Novo projeto
          </button>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 22 }}>
          {STATS.map(s => (
            <div key={s.label} className="dash-stat card" style={{ padding: "16px 20px", cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, background: s.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, color: s.color,
                }}>{s.icon}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {s.label}
                </span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.color, letterSpacing: "-0.05em", lineHeight: 1 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Layout principal: projetos + acesso rápido ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 20 }}>

          {/* Projetos recentes */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.02em" }}>
                  Projetos recentes
                </h2>
                <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {projects?.length ?? 0} projetos no total
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setLocation("/projects")}>
                Ver todos →
              </button>
            </div>

            {isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                Carregando...
              </div>
            ) : !projects?.length ? (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◫</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 6 }}>Nenhum projeto ainda</p>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
                  Crie seu primeiro projeto e gere campanhas com IA
                </p>
                <button className="btn btn-primary btn-md" onClick={() => setLocation("/projects/new")}>
                  Criar primeiro projeto
                </button>
              </div>
            ) : (
              <div>
                {projects.slice(0, 8).map(proj => (
                  <div key={proj.id} className="proj-row"
                    onClick={() => setLocation(`/projects/${proj.id}`)}
                    style={{
                      padding: "12px 20px", borderBottom: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: "pointer", transition: "background .1s",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, background: "var(--blue-l)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, color: "var(--blue)", flexShrink: 0,
                      }}>◫</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{proj.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                          {proj.description || "Sem descrição"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className={`badge ${
                        proj.status === "completed" ? "badge-green" :
                        proj.status === "analyzing" ? "badge-blue" :
                        proj.status === "draft"     ? "badge-gray" : "badge-gray"
                      }`}>
                        {proj.status === "completed" ? "Concluído" :
                         proj.status === "analyzing" ? "Analisando" :
                         proj.status === "draft"     ? "Rascunho"   : "Arquivado"}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>→</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acesso rápido vertical */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 0 6px" }}>
              Acesso rápido
            </div>

            {/* Consulta CPF/CNPJ */}
            <div className="card dash-card" onClick={() => setLocation("/consultas")}
              style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: "var(--blue-l)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
              }}>🔍</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)" }}>Consulta CPF/CNPJ</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>Receita · CNJ · Gratuito</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>→</span>
            </div>

            {/* Dashboard unificado */}
            <div className="card dash-card" onClick={() => setLocation("/unified-dashboard")}
              style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: "var(--blue-l)", borderColor: "rgba(0,113,227,0.2)" }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: "var(--blue)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
              }}>📊</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)" }}>Dashboard Unificado</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>Meta · Google · TikTok</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--blue)", flexShrink: 0 }}>→</span>
            </div>

            {/* Plataformas */}
            {[
              { icon: "📘", label: "Meta Ads",   path: "/meta-campaigns",   color: "#1877f2", bg: "rgba(24,119,242,0.08)" },
              { icon: "🔵", label: "Google Ads", path: "/google-campaigns", color: "#1a73e8", bg: "rgba(26,115,232,0.08)" },
              { icon: "◼",  label: "TikTok Ads", path: "/tiktok-campaigns", color: "#111",    bg: "rgba(0,0,0,0.04)"     },
            ].map(p => (
              <div key={p.path} className="card dash-card" onClick={() => setLocation(p.path)}
                style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: p.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{p.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--dark)" }}>{p.label}</div>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>→</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Matching Engine ── */}
        {active.length > 0 && (
          <div className="card" style={{
            padding: "20px 24px", marginBottom: 16,
            background: "linear-gradient(135deg, rgba(0,113,227,0.06), rgba(88,86,214,0.06))",
            borderColor: "rgba(0,113,227,0.15)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>
                  🧠 Intelligent Matching Engine
                </p>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  Score de compatibilidade para seu próximo setup de campanha
                </p>
              </div>
              <button className="btn btn-gradient btn-sm"
                onClick={() => setLocation(`/projects/${active[0]?.id}/campaign`)}>
                Calcular Match →
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { icon: "🎯", label: "Plataforma ideal", desc: "Meta, Google ou TikTok" },
                { icon: "💡", label: "Ângulo criativo",  desc: "Copy e formato certos"  },
                { icon: "📊", label: "Score 0–100",      desc: "Compatibilidade do setup" },
              ].map(item => (
                <div key={item.label} style={{
                  background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)",
                  border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px",
                }}>
                  <p style={{ fontSize: 16, marginBottom: 4 }}>{item.icon}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 2 }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Grid de módulos ── */}
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Módulos
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
          {NAV_CARDS.map(card => (
            <button key={card.path} onClick={() => setLocation(card.path)} className="dash-nav"
              style={{
                padding: "16px 14px", borderRadius: "var(--r)", border: "1.5px solid var(--border)",
                background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)",
                cursor: "pointer", textAlign: "center", transition: "all .2s",
                fontFamily: "var(--font)",
              }}>
              <div className="dash-nav-icon" style={{
                width: 38, height: 38, borderRadius: 10, margin: "0 auto 10px",
                background: card.color + "14",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, color: card.color,
              }}>{card.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 3 }}>{card.label}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{card.sub}</div>
            </button>
          ))}
        </div>

        {/* ── CTA upgrade ── */}
        {user?.plan === "free" && (
          <div className="card" style={{
            padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "linear-gradient(135deg, var(--black) 0%, #1a1a2e 100%)",
            borderColor: "rgba(255,255,255,0.08)",
          }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 4 }}>
                Desbloqueie todo o potencial do MECPro
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                Projetos ilimitados · IA completa · Exportação PDF/XLSX
              </p>
            </div>
            <button className="btn btn-sm" style={{ background: "var(--green)", color: "var(--black)", fontWeight: 800, flexShrink: 0 }}
              onClick={() => setLocation("/pricing")}>
              Ver planos →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
