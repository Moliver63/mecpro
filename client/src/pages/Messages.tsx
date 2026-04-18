import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  id: number;
  from: string;
  fromAvatar: string;
  subject: string;
  preview: string;
  time: string;
  read: boolean;
  type: "support" | "system" | "notification";
}

const MOCK_MESSAGES: Message[] = [
  { id: 1, from: "Suporte MECPro", fromAvatar: "🛡️", subject: "Bem-vindo ao MECPro!", preview: "Olá! Seja bem-vindo à plataforma. Se precisar de ajuda com qualquer funcionalidade...", time: "Hoje 09:12", read: false, type: "support" },
  { id: 2, from: "Sistema", fromAvatar: "⚙️", subject: "Sua análise de concorrentes foi concluída", preview: "A análise dos concorrentes para o projeto 'Minha Empresa' foi concluída com sucesso...", time: "Ontem 14:35", read: false, type: "system" },
  { id: 3, from: "Sistema", fromAvatar: "◈", subject: "Campanha gerada com sucesso", preview: "Sua campanha 'Lançamento de Produto Q1' foi gerada pela IA e está pronta para revisão...", time: "23/03 11:20", read: true, type: "notification" },
  { id: 4, from: "Suporte MECPro", fromAvatar: "🛡️", subject: "Dica: Use a cascata 7 camadas", preview: "Para obter os melhores resultados na análise de concorrentes, recomendamos conectar...", time: "22/03 16:45", read: true, type: "support" },
  { id: 5, from: "Sistema", fromAvatar: "💳", subject: "Fatura do mês disponível", preview: "Sua fatura referente ao mês de março já está disponível. Acesse a seção de assinatura...", time: "01/03 08:00", read: true, type: "notification" },
];

export default function Messages() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Message | null>(null);
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unreadCount = messages.filter(m => !m.read).length;
  const filtered = filter === "unread" ? messages.filter(m => !m.read) : messages;

  function openMessage(msg: Message) {
    setSelected(msg);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
  }

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
          Mensagens {unreadCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#ef4444", color: "white", fontSize: 11, fontWeight: 700, marginLeft: 8 }}>
              {unreadCount}
            </span>
          )}
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Comunicados do sistema e suporte</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.5fr" : "1fr", gap: 20 }}>
        {/* Lista de mensagens */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          {/* Filtros */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
            {(["all", "unread"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: filter === f ? "var(--black)" : "transparent",
                color: filter === f ? "white" : "var(--muted)",
                transition: "all .15s"
              }}>
                {f === "all" ? "Todas" : `Não lidas (${unreadCount})`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Nenhuma mensagem não lida</p>
            </div>
          ) : (
            filtered.map(msg => (
              <div key={msg.id}
                onClick={() => openMessage(msg)}
                style={{
                  padding: "14px 20px", borderBottom: "1px solid var(--border)",
                  cursor: "pointer", transition: "background .1s",
                  background: selected?.id === msg.id ? "var(--green-l)" : msg.read ? "white" : "#f0fdf4"
                }}
                onMouseEnter={e => { if (selected?.id !== msg.id) e.currentTarget.style.background = "var(--off)"; }}
                onMouseLeave={e => { if (selected?.id !== msg.id) e.currentTarget.style.background = msg.read ? "white" : "#f0fdf4"; }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "var(--off)", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 16, flexShrink: 0
                  }}>
                    {msg.fromAvatar}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <p style={{ fontSize: 13, fontWeight: msg.read ? 500 : 700, color: "var(--dark)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                        {msg.from}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0, marginLeft: 8 }}>{msg.time}</p>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: msg.read ? 400 : 600, color: "var(--dark)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {msg.subject}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {msg.preview}
                    </p>
                  </div>
                  {!msg.read && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", flexShrink: 0, marginTop: 4 }} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Visualização da mensagem */}
        {selected && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)" }}>{selected.subject}</p>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)" }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--off)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  {selected.fromAvatar}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)" }}>{selected.from}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>{selected.time}</p>
                </div>
              </div>
              <div style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.7 }}>
                <p style={{ marginBottom: 12 }}>Olá, <strong>{user?.name?.split(" ")[0] ?? "usuário"}</strong>!</p>
                <p style={{ marginBottom: 12 }}>{selected.preview}</p>
                <p>Se precisar de mais informações ou suporte, não hesite em nos contatar através do chat ou e-mail.</p>
                <p style={{ marginTop: 20, color: "var(--muted)" }}>Atenciosamente,<br /><strong>Equipe MECPro</strong></p>
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
              <button className="btn btn-sm btn-outline" onClick={() => setSelected(null)}>← Voltar</button>
              {selected.type === "support" && (
                <button className="btn btn-sm btn-green" onClick={() => window.open("mailto:contato@mecproai.com")}>
                  Responder
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Banner novo canal */}
      <div style={{
        marginTop: 20, background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 3 }}>💬 Chat ao vivo em breve</p>
          <p style={{ fontSize: 12, color: "#94a3b8" }}>Estamos desenvolvendo um sistema de chat em tempo real. Em breve!</p>
        </div>
        <div style={{ display: "inline-block", background: "rgba(255,255,255,.1)", borderRadius: 8, padding: "6px 14px", color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>
          Em desenvolvimento
        </div>
      </div>
    </Layout>
  );
}
