import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  const active = projects?.filter(p => p.status !== "archived") ?? [];
  const completed = projects?.filter(p => p.status === "completed") ?? [];

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:4 }}>
          Olá, {user?.name?.split(" ")[0] ?? "Usuário"} 👋
        </h1>
        <p style={{ fontSize:14, color:"var(--muted)" }}>Aqui está o resumo dos seus projetos e campanhas.</p>
      </div>


      {/* Acesso rápido — Consulta CPF/CNPJ */}
      <div
        onClick={() => setLocation("/consultas")}
        style={{
          background: "white", border: "1px solid var(--border)", borderRadius: 16,
          padding: "18px 24px", marginBottom: 28, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "box-shadow .15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.08)")}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
            🔍
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>Consulta CPF / CNPJ</p>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              Dados cadastrais da Receita Federal · Processos judiciais CNJ · Gratuito
            </p>
          </div>
        </div>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>→</span>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:28 }}>
        {[
          { label:"Projetos ativos", value: active.length, icon:"📁", color:"var(--green-l)", text:"var(--green-dk)" },
          { label:"Campanhas geradas", value: completed.length, icon:"🚀", color:"#eff6ff", text:"#1d4ed8" },
          { label:"Plano atual", value: user?.plan?.toUpperCase() ?? "FREE", icon:"⭐", color:"var(--off2)", text:"var(--muted)" },
        ].map(s => (
          <div key={s.label} style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, padding:22 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, marginBottom:12 }}>{s.icon}</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:28, fontWeight:800, color:"var(--black)", lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Projetos recentes */}
      <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
        <div style={{ padding:"18px 24px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:700, color:"var(--black)" }}>Projetos recentes</h2>
            <p style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>{projects?.length ?? 0} projetos no total</p>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => setLocation("/projects/new")}>+ Novo projeto</button>
        </div>

        {isLoading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--muted)", fontSize:14 }}>Carregando...</div>
        ) : !projects?.length ? (
          <div style={{ padding:48, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📁</div>
            <p style={{ fontSize:15, fontWeight:600, color:"var(--dark)", marginBottom:6 }}>Nenhum projeto ainda</p>
            <p style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>Crie seu primeiro projeto e gere campanhas inteligentes com IA</p>
            <button className="btn btn-md btn-green" onClick={() => setLocation("/projects/new")}>Criar primeiro projeto</button>
          </div>
        ) : (
          <div>
            {projects.slice(0,8).map(proj => (
              <div key={proj.id} onClick={() => setLocation(`/projects/${proj.id}`)}
                style={{ padding:"14px 24px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", transition:"background .1s" }}
                onMouseEnter={e=>(e.currentTarget.style.background="var(--off)")}
                onMouseLeave={e=>(e.currentTarget.style.background="white")}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:"var(--green-l)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📁</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:"var(--dark)" }}>{proj.name}</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{proj.description || "Sem descrição"}</div>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span className={`badge ${proj.status === "completed" ? "badge-green" : proj.status === "analyzing" ? "badge-navy" : "badge-gray"}`} style={{ fontSize:11 }}>
                    {proj.status === "completed" ? "Concluído" : proj.status === "analyzing" ? "Analisando" : proj.status === "draft" ? "Rascunho" : "Arquivado"}
                  </span>
                  <span style={{ fontSize:12, color:"var(--muted)" }}>→</span>
                </div>
              </div>
            ))}
            {projects.length > 8 && (
              <div style={{ padding:"12px 24px", textAlign:"center" }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/projects")}>Ver todos os projetos →</button>
              </div>
            )}
          </div>
        )}
      </div>


      {/* ── Matching Engine Card ── */}
      {active.length > 0 && (
        <div style={{ marginTop: 24, background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", borderRadius: 16, padding: "22px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, color: "white", marginBottom: 3 }}>
                🧠 Intelligent Matching Engine
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>
                Score de compatibilidade para seu próximo setup de campanha
              </p>
            </div>
            <button
              onClick={() => setLocation(`/projects/${active[0]?.id}/campaign`)}
              style={{ background: "linear-gradient(135deg,#25d366,#128c7e)", color: "white", fontWeight: 700, fontSize: 12, padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
              ✨ Calcular Match →
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { icon: "🎯", label: "Plataforma ideal", desc: "Meta, Google ou TikTok" },
              { icon: "💡", label: "Ângulo criativo", desc: "Copy e formato certos" },
              { icon: "📊", label: "Score 0–100", desc: "Compatibilidade do setup" },
            ].map(item => (
              <div key={item.label} style={{ background: "rgba(255,255,255,.08)", borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 2 }}>{item.label}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA upgrade se free */}
      {user?.plan === "free" && (
        <div style={{ marginTop:24, background:"var(--black)", borderRadius:16, padding:"24px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <p style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:700, color:"white", marginBottom:4 }}>Desbloqueie todo o potencial do MECPro</p>
            <p style={{ fontSize:13, color:"#9ca3af" }}>Projetos ilimitados, IA completa e exportação PDF/XLSX</p>
          </div>
          <button className="btn btn-md" style={{ background:"var(--green)", color:"white", flexShrink:0 }} onClick={() => setLocation("/pricing")}>
            Ver planos →
          </button>
        </div>
      )}

  {/* Unified Dashboard quick link */}
  <a href="/unified-dashboard"
    style={{ display:"flex", alignItems:"center", gap:10, background:"linear-gradient(135deg,#1a73e8,#7c3aed)",
      color:"#fff", borderRadius:14, padding:"14px 20px", textDecoration:"none",
      fontWeight:700, fontSize:14, marginBottom:20 }}>
    <span style={{ fontSize:22 }}>📊</span>
    <div>
      <p style={{ margin:0, fontWeight:800 }}>Dashboard Unificado</p>
      <p style={{ margin:0, fontSize:11, opacity:.8 }}>Meta · Google · TikTok — métricas consolidadas</p>
    </div>
    <span style={{ marginLeft:"auto", fontSize:18 }}>→</span>
  </a>

    </Layout>
  );
}
