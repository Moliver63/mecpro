import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

const MOCK_COMMUNITY = [
  { id: "1", name: "Grupo Meta Ads Brasil", members: 1240, category: "Tráfego Pago", icon: "📘", new: true, desc: "Discussões sobre estratégias e novidades do Meta Ads." },
  { id: "2", name: "Agências e Freelancers", members: 875, category: "Negócios", icon: "💼", new: false, desc: "Networking e troca de experiências para profissionais de marketing." },
  { id: "3", name: "E-commerce Brasil", members: 2100, category: "E-commerce", icon: "🛒", new: false, desc: "Dicas, estratégias e cases para lojas virtuais brasileiras." },
  { id: "4", name: "IA & Automação", members: 650, category: "Tecnologia", icon: "🤖", new: true, desc: "Inteligência artificial aplicada ao marketing digital." },
  { id: "5", name: "Copywriters BR", members: 980, category: "Copy & Conteúdo", icon: "✍️", new: false, desc: "Comunidade de copywriters e redatores publicitários." },
  { id: "6", name: "SEO & Orgânico", members: 760, category: "SEO", icon: "🟢", new: false, desc: "Estratégias de SEO, tráfego orgânico e ranqueamento." },
];

const FEATURED_POSTS = [
  { id: "1", author: "Ana M.", avatar: "A", community: "Meta Ads Brasil", title: "Como aumentei o ROAS em 3x usando a análise de concorrentes do MECPro", likes: 87, comments: 23, time: "2h atrás" },
  { id: "2", author: "Carlos R.", avatar: "C", community: "E-commerce Brasil", title: "Checklist: 10 pontos para otimizar campanhas no Q2 2026", likes: 64, comments: 18, time: "4h atrás" },
  { id: "3", author: "Fernanda L.", avatar: "F", community: "IA & Automação", title: "Testei o Gemini para gerar copies de anúncios — resultados surpreendentes", likes: 102, comments: 41, time: "6h atrás" },
];

const CATEGORIES = ["Todos", "Tráfego Pago", "E-commerce", "Negócios", "Tecnologia", "Copy & Conteúdo", "SEO"];

export default function CommunityExplore() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");

  const filtered = MOCK_COMMUNITY.filter(g => {
    const matchSearch = !search || g.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "Todos" || g.category === category;
    return matchSearch && matchCat;
  });

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
          Explorar Comunidade
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Conecte-se com profissionais de marketing e compartilhe conhecimento</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
        {/* Conteúdo principal */}
        <div>
          {/* Posts em destaque */}
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>
            🔥 Em destaque
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {FEATURED_POSTS.map(post => (
              <div key={post.id} style={{
                background: "white", border: "1px solid var(--border)", borderRadius: 14,
                padding: "16px 20px", cursor: "pointer", transition: "all .15s"
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--green)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "var(--green-dk)", flexShrink: 0 }}>
                    {post.avatar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)" }}>{post.author}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>em</span>
                      <span style={{ fontSize: 11, background: "var(--off)", padding: "2px 8px", borderRadius: 5, fontWeight: 600, color: "var(--muted)" }}>{post.community}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{post.time}</span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--dark)", lineHeight: 1.4, marginBottom: 10 }}>
                      {post.title}
                    </p>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>👍 {post.likes} curtidas</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>💬 {post.comments} comentários</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Grupos */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, color: "var(--black)" }}>
              👥 Grupos disponíveis
            </h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/community/connections")}>
              Meus grupos →
            </button>
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Buscar grupo..."
              style={{ flex: 1, minWidth: 150, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, outline: "none" }}
            />
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ padding: "9px 13px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", cursor: "pointer" }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map(group => (
              <div key={group.id} style={{
                background: "white", border: "1px solid var(--border)", borderRadius: 14,
                padding: "16px 18px", cursor: "pointer", position: "relative", transition: "all .15s"
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--green)"; e.currentTarget.style.background = "#f0fdf4"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "white"; }}
              >
                {group.new && (
                  <div style={{
                    position: "absolute", top: 10, right: 10,
                    background: "#ef4444", color: "white", fontSize: 9,
                    fontWeight: 700, padding: "2px 6px", borderRadius: 4
                  }}>NOVO</div>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {group.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)" }}>{group.name}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>👥 {group.members.toLocaleString("pt-BR")} membros</p>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>{group.desc}</p>
                <button className="btn btn-sm btn-green btn-full" onClick={e => { e.stopPropagation(); setLocation("/community/connections"); }}>
                  Participar
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Perfil da comunidade */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px", marginBottom: 16 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 12 }}>
              📊 Sua atividade
            </h3>
            {[
              { label: "Grupos participando", value: "3" },
              { label: "Posts publicados", value: "7" },
              { label: "Curtidas recebidas", value: "42" },
              { label: "Conexões feitas", value: "18" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)" }}>{s.value}</span>
              </div>
            ))}
            <button className="btn btn-sm btn-green btn-full" onClick={() => setLocation("/community/connections")}>
              Ver minhas conexões →
            </button>
          </div>

          {/* Regras da comunidade */}
          <div style={{ background: "var(--off)", borderRadius: 14, padding: "18px 20px" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--dark)", marginBottom: 10 }}>
              📋 Regras da comunidade
            </h3>
            {[
              "Seja respeitoso e profissional",
              "Compartilhe conteúdo relevante",
              "Não faça spam ou autopromoção excessiva",
              "Mantenha o foco em marketing digital",
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 700 }}>{i + 1}.</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
