import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";

const MY_CONNECTIONS = [
  { id: "1", name: "Ana Martins", role: "Growth Hacker", company: "Agência Click", avatar: "A", mutual: 8, online: true, tags: ["Meta Ads", "E-commerce"] },
  { id: "2", name: "Carlos Rodrigues", role: "Social Media Manager", company: "StartupBR", avatar: "C", mutual: 5, online: false, tags: ["Content", "Estratégia"] },
  { id: "3", name: "Fernanda Lima", role: "Media Buyer", company: "Freelancer", avatar: "F", mutual: 12, online: true, tags: ["Tráfego Pago", "Google Ads"] },
  { id: "4", name: "Ricardo Souza", role: "CMO", company: "E-com Brasil", avatar: "R", mutual: 3, online: false, tags: ["E-commerce", "CRO"] },
];

const MY_GROUPS = [
  { id: "1", name: "Meta Ads Brasil", members: 1240, unread: 14, icon: "📘", lastMessage: "Alguém testou o novo formato de anúncios Reels?", time: "10min" },
  { id: "2", name: "Agências e Freelancers", members: 875, unread: 3, icon: "💼", lastMessage: "Novo template de proposta disponível no drive da comunidade", time: "1h" },
  { id: "3", name: "IA & Automação", members: 650, unread: 27, icon: "🤖", lastMessage: "Resultado incrível usando Gemini para gerar textos de anúncios!", time: "2h" },
];

export default function CommunityConnections() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"connections" | "groups" | "requests">("connections");
  const [searchConn, setSearchConn] = useState("");
  const [messagingSent, setMessagingSent] = useState<string[]>([]);

  const filteredConns = MY_CONNECTIONS.filter(c =>
    !searchConn || c.name.toLowerCase().includes(searchConn.toLowerCase()) || c.role.toLowerCase().includes(searchConn.toLowerCase())
  );

  function sendMessage(id: string) {
    setMessagingSent(prev => [...prev, id]);
  }

  const tabs = [
    { id: "connections", label: "Conexões", count: MY_CONNECTIONS.length },
    { id: "groups", label: "Meus Grupos", count: MY_GROUPS.length },
    { id: "requests", label: "Solicitações", count: 2 },
  ] as const;

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
          Minhas Conexões
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Gerencie suas conexões e grupos na comunidade MECPro</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "👥", label: "Conexões", value: MY_CONNECTIONS.length, color: "#eff6ff" },
          { icon: "💬", label: "Grupos", value: MY_GROUPS.length, color: "#f0fdf4" },
          { icon: "🔔", label: "Mensagens não lidas", value: MY_GROUPS.reduce((a, g) => a + g.unread, 0), color: "#fef3c7" },
          { icon: "👋", label: "Solicitações", value: 2, color: "#fdf4ff" },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10 }}>{s.icon}</div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--off)", borderRadius: 12, padding: 4 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: "9px 14px", borderRadius: 10, border: "none",
            cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all .15s",
            background: activeTab === tab.id ? "white" : "transparent",
            color: activeTab === tab.id ? "var(--black)" : "var(--muted)",
            boxShadow: activeTab === tab.id ? "var(--shadow-xs)" : "none"
          }}>
            {tab.label} {tab.count > 0 && <span style={{ background: activeTab === tab.id ? "var(--green-l)" : "rgba(0,0,0,.08)", color: activeTab === tab.id ? "var(--green-dk)" : "var(--muted)", fontSize: 11, padding: "1px 7px", borderRadius: 10, marginLeft: 4 }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Conexões */}
      {activeTab === "connections" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <input
              type="text" value={searchConn} onChange={e => setSearchConn(e.target.value)}
              placeholder="🔍 Buscar conexão..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, outline: "none" }}
            />
            <button className="btn btn-sm btn-green" onClick={() => setLocation("/community/explore")}>
              + Encontrar pessoas
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {filteredConns.map(conn => (
              <div key={conn.id} style={{
                background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px"
              }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%", background: "var(--green-l)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, fontWeight: 700, color: "var(--green-dk)"
                    }}>
                      {conn.avatar}
                    </div>
                    {conn.online && (
                      <div style={{
                        position: "absolute", bottom: 0, right: 0,
                        width: 12, height: 12, borderRadius: "50%", background: "#22c55e",
                        border: "2px solid white"
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)" }}>{conn.name}</p>
                    <p style={{ fontSize: 12, color: "var(--muted)" }}>{conn.role}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{conn.company}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {conn.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 600, background: "var(--off)", color: "var(--muted)", padding: "2px 8px", borderRadius: 5 }}>{tag}</span>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
                  {conn.mutual} conexões em comum
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-sm btn-green btn-full"
                    onClick={() => sendMessage(conn.id)}
                    disabled={messagingSent.includes(conn.id)}
                  >
                    {messagingSent.includes(conn.id) ? "◎ Enviado" : "💬 Mensagem"}
                  </button>
                  <button className="btn btn-sm btn-outline" style={{ flexShrink: 0 }}>Perfil</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grupos */}
      {activeTab === "groups" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button className="btn btn-sm btn-green" onClick={() => setLocation("/community/explore")}>
              + Explorar grupos
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {MY_GROUPS.map(group => (
              <div key={group.id} style={{
                background: "white", border: "1px solid var(--border)", borderRadius: 14,
                padding: "16px 20px", cursor: "pointer", display: "flex", gap: 14, alignItems: "center"
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--green)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--off)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {group.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)" }}>{group.name}</p>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{group.time}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>👥 {group.members.toLocaleString("pt-BR")} membros</p>
                  <p style={{ fontSize: 12, color: "var(--body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 400 }}>
                    {group.lastMessage}
                  </p>
                </div>
                {group.unread > 0 && (
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#ef4444", color: "white", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {group.unread > 9 ? "9+" : group.unread}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Solicitações */}
      {activeTab === "requests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { name: "Julia Santos", role: "Media Buyer", mutual: 6, avatar: "J" },
            { name: "Pedro Costa", role: "Social Media", mutual: 2, avatar: "P" },
          ].map((req, i) => (
            <div key={i} style={{
              background: "white", border: "1px solid var(--border)", borderRadius: 14,
              padding: "16px 20px", display: "flex", gap: 14, alignItems: "center"
            }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "var(--green-dk)", flexShrink: 0 }}>
                {req.avatar}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 2 }}>{req.name}</p>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>{req.role} • {req.mutual} conexões em comum</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm btn-green">◎ Aceitar</button>
                <button className="btn btn-sm btn-outline">✕ Recusar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
