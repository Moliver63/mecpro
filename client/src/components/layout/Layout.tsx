import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import UserMenu from "@/components/shared/UserMenu";

const NAV_USER = [
  { icon: "📊", label: "Dashboard",       path: "/dashboard" },
  { icon: "📁", label: "Projetos",        path: "/projects" },
  { icon: "📘", label: "Campanhas Meta",  path: "/meta-campaigns" },
  { icon: "🎓", label: "Academia",        path: "/academy" },
  { icon: "🔔", label: "Notificações",    path: "/notifications" },
  { icon: "💬", label: "Mensagens",       path: "/messages" },
  { icon: "💳", label: "Assinatura",      path: "/my-subscription" },
  { icon: "⚙️", label: "Configurações",  path: "/settings" },
];

const NAV_ADMIN = [
  { icon: "🛡️", label: "Admin",          path: "/admin" },
  { icon: "👥", label: "Usuários",        path: "/admin/users" },
  { icon: "📁", label: "Projetos",        path: "/admin/projects" },
  { icon: "📊", label: "Analytics",       path: "/admin/analytics" },
  { icon: "💳", label: "Assinaturas",     path: "/admin/manage-subscriptions" },
  { icon: "🏷️", label: "Planos",          path: "/admin/plans" },
  { icon: "💰", label: "Financeiro",      path: "/admin/financeiro" },
  { icon: "👑", label: "Admins",          path: "/admin/manage-admins" },
  { icon: "✉️", label: "Convites",        path: "/admin/invites" },
  { icon: "🔒", label: "Moderação",       path: "/admin/moderation" },
];

// ── Botão flutuante WhatsApp ───────────────────────────────────────────────
const WA_NUMBER = "554799465824";
const WA_MESSAGE = "Olá! Preciso de ajuda com o MECPro. 😊";

function WhatsAppButton() {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <style>{`
        @keyframes wa-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes wa-shake {
          0%,100% { transform: translateY(-50%) rotate(0deg); }
          15%     { transform: translateY(-50%) rotate(-12deg) scale(1.08); }
          30%     { transform: translateY(-50%) rotate(12deg) scale(1.08); }
          45%     { transform: translateY(-50%) rotate(-8deg); }
          60%     { transform: translateY(-50%) rotate(8deg); }
          75%     { transform: translateY(-50%) rotate(0deg); }
        }
        .wa-tab {
          position: fixed;
          right: -2px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 9999;
          display: flex;
          align-items: center;
          cursor: pointer;
          border: none;
          background: none;
          padding: 0;
          transition: right 0.2s ease;
        }
        .wa-tab:hover {
          right: 0;
        }
        .wa-tab-label {
          background: linear-gradient(180deg, #25d366, #128c7e);
          color: white;
          font-size: 11px;
          font-weight: 800;
          padding: 14px 6px;
          border-radius: 8px 0 0 8px;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transform: rotate(180deg);
          letter-spacing: 1.5px;
          box-shadow: -2px 0 10px rgba(37,211,102,0.3);
          user-select: none;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .wa-tab-circle {
          display: none;
        }
        .wa-tab:hover .wa-tab-label {
          padding: 16px 7px;
          box-shadow: -4px 0 16px rgba(37,211,102,0.45);
        }
        .wa-expanded-panel {
          position: fixed;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          z-index: 9998;
          background: white;
          border-radius: 16px 0 0 16px;
          box-shadow: -8px 0 40px rgba(0,0,0,0.15);
          padding: 20px 20px 20px 24px;
          width: 240px;
          border-left: 4px solid #25d366;
          animation: slideIn 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-50%) translateX(20px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
      `}</style>

      {/* Aba recolhida — tab fina colada na borda */}
      {!expanded && (
        <div className="wa-tab" onClick={() => setExpanded(true)} title="Suporte via WhatsApp">
          <span className="wa-tab-label">💬 AJUDA</span>
        </div>
      )}

      {/* Painel expandido */}
      {expanded && (
        <div className="wa-expanded-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#25d366,#128c7e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z" fill="white"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M22.003 18.978c-.32-.16-1.892-.932-2.185-1.038-.293-.107-.506-.16-.72.16-.213.32-.826 1.038-.013 1.305.293.107.586.267.88.427.907.48 1.893.64 2.612.32.4-.16.64-.427.8-.747.16-.32.16-.693 0-.88-.16-.186-.373-.293-.693-.293-.32 0-.614.053-.907.267zm-6.003 3.89c-1.413 0-2.8-.373-4-.107-1.2.267-2.293 1.173-3.52.747-1.707-.613-3.2-1.84-4.427-3.253-1.227-1.413-2.08-3.04-2.08-4.8 0-3.04 1.76-5.707 4.48-7.04 2.72-1.333 5.76-.96 8.16.48 1.28.8 2.4 1.92 3.2 3.2.8 1.28 1.28 2.773 1.28 4.32 0 2.88-1.6 5.493-4.093 6.933z" fill="#25d366"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: 0 }}>Michel Leal</p>
                <p style={{ fontSize: 11, color: "#25d366", fontWeight: 600, margin: 0 }}>● Gerente de Relacionamento</p>
              </div>
            </div>
            <button onClick={() => setExpanded(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 4 }}>
              ×
            </button>
          </div>

          <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, margin: 0 }}>
              👋 Olá! Precisa de ajuda com o MECPro? Fale diretamente com nossa equipe no WhatsApp.
            </p>
          </div>

          <a
            href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_MESSAGE)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(135deg,#25d366,#128c7e)",
              color: "white", borderRadius: 10, padding: "11px 16px",
              fontWeight: 800, fontSize: 13, textDecoration: "none",
              boxShadow: "0 4px 14px rgba(37,211,102,0.4)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z" fill="white"/>
            </svg>
            Chamar no WhatsApp
          </a>

          <p style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", marginTop: 10, margin: "10px 0 0" }}>
            Seg–Sex, 9h–18h · Resp. em até 24h
          </p>
        </div>
      )}
    </>
  );
}

interface LayoutProps { children: React.ReactNode; }

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin = ["admin", "superadmin"].includes(user?.role ?? "");
  const navItems = isAdmin && location.startsWith("/admin") ? NAV_ADMIN : NAV_USER;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.jpg" alt="MECPro" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>MEC<span className="pro">PRO</span></span>
        </div>
        <nav>
          {navItems.map(item => (
            <a
              key={item.path}
              href={item.path}
              className={`sidebar-nav-item ${location === item.path || location.startsWith(item.path + "/") ? "active" : ""}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </a>
          ))}
          {isAdmin && !location.startsWith("/admin") && (
            <>
              <div className="sidebar-section-label">Admin</div>
              <a href="/admin" className="sidebar-nav-item">
                <span className="icon">🛡️</span>Painel Admin
              </a>
            </>
          )}
        </nav>
        <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <a href="/profile" className="sidebar-nav-item">
            <span className="icon">👤</span>Perfil
          </a>
        </div>
      </aside>
      {/* Main */}
      <div className="app-main">
        <header className="app-topbar">
          <span className="app-topbar-title">
            {navItems.find(i => location.startsWith(i.path))?.label ?? "MECPro"}
          </span>
          <UserMenu />
        </header>
        <main className="app-content">
          {children}
        </main>
      </div>

      {/* Botão flutuante WhatsApp */}
      <WhatsAppButton />
    </div>
  );
}
