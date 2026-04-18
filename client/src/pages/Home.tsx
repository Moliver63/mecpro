import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import Layout from "@/components/layout/Layout";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: projects } = trpc.projects.list.useQuery();

  const quickLinks = [
    { icon: "📁", label: "Meus Projetos", desc: "Gerencie todos os seus projetos", path: "/projects", color: "#eff6ff" },
    { icon: "🔍", label: "Análise Competidores", desc: "Monitore concorrentes no Meta", path: "/projects", color: "#f0fdf4" },
    { icon: "🚀", label: "Criar Campanha", desc: "Gere campanhas com IA", path: "/projects", color: "#fef3c7" },
    { icon: "📊", label: "Inteligência de Mercado", desc: "Análise completa do seu nicho", path: "/projects", color: "#fdf4ff" },
    { icon: "🔎", label: "Consulta CPF/CNPJ", desc: "Dados da Receita Federal", path: "/consultas", color: "#fff7ed" },
    { icon: "⚙️", label: "Configurações", desc: "Perfil e integrações", path: "/settings", color: "#f8fafc" },
  ];

  const recentProjects = projects?.slice(0, 3) ?? [];

  return (
    <Layout>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        borderRadius: 20, padding: "clamp(16px, 3vw, 32px) clamp(16px, 3vw, 36px)", marginBottom: 28, color: "white"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>
              👋 Bem-vindo de volta
            </p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {user?.name?.split(" ")[0] ?? "Usuário"}!
            </h1>
            <p style={{ fontSize: 14, color: "#cbd5e1", maxWidth: 420 }}>
              Sua plataforma de inteligência de marketing com IA. O que vamos criar hoje?
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              background: "rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 20px",
              border: "1px solid rgba(255,255,255,.15)"
            }}>
              <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Plano atual</p>
              <p style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-display)" }}>
                {(user as any)?.plan?.toUpperCase() ?? "FREE"}
              </p>
              {(user as any)?.plan === "free" && (
                <button
                  onClick={() => setLocation("/billing")}
                  style={{ marginTop: 8, background: "var(--green)", border: "none", color: "white", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  Fazer upgrade →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--black)", marginBottom: 14 }}>
        Acesso rápido
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        {quickLinks.map(link => (
          <div
            key={link.path + link.label}
            onClick={() => setLocation(link.path)}
            style={{
              background: "white", border: "1px solid var(--border)", borderRadius: 14,
              padding: "18px 20px", cursor: "pointer", transition: "all .15s"
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--green)"; e.currentTarget.style.background = link.color; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "white"; }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>{link.icon}</div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 3 }}>{link.label}</p>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>{link.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Projetos recentes */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--black)" }}>Projetos recentes</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/projects")}>Ver todos →</button>
          </div>
          {!recentProjects.length ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Nenhum projeto ainda</p>
              <button className="btn btn-sm btn-green" onClick={() => setLocation("/projects/new")}>
                + Criar projeto
              </button>
            </div>
          ) : (
            recentProjects.map((p: any) => (
              <div key={p.id} onClick={() => setLocation(`/projects/${p.id}`)}
                style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--off)")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📁</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{p.name}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{p.status}</p>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
              </div>
            ))
          )}
        </div>

        {/* Dicas e novidades */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--black)" }}>🧠 Dicas MECPro</h3>
          </div>
          <div style={{ padding: 20 }}>
            {[
              { icon: "🎯", title: "Analise seus concorrentes", desc: "Use a cascata 7 camadas para obter anúncios reais do Meta Ads Library." },
              { icon: "📈", title: "Gere campanhas com IA", desc: "Crie anúncios otimizados baseados nos dados de mercado do seu nicho." },
              { icon: "🔗", title: "Conecte o Meta Ads", desc: "Integre sua conta para publicar campanhas diretamente pelo MECPro." },
            ].map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < 2 ? 16 : 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {tip.icon}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)", marginBottom: 2 }}>{tip.title}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{tip.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <button className="btn btn-sm btn-green btn-full" onClick={() => setLocation("/dashboard")}>
              Ir para o dashboard →
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
