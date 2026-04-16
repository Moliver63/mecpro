import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import UserMenu from "@/components/shared/UserMenu";

// ── Nav items ──────────────────────────────────────────────────────────────
const NAV_USER = [
  { icon: "⊞",  label: "Dashboard",        path: "/dashboard" },
  { icon: "◫",  label: "Projetos",          path: "/projects" },
  { icon: "◈",  label: "Meta Ads",          path: "/meta-campaigns" },
  { icon: "◉",  label: "Google Ads",        path: "/google-campaigns" },
  { icon: "◍",  label: "TikTok Ads",        path: "/tiktok-campaigns" },
  { icon: "⟳",  label: "Agente Autônomo",   path: "/autonomous-agent" },
  { icon: "▣",  label: "Mídia Paga",        path: "/unified-dashboard" },
  { icon: "◎",  label: "Verba de Mídia",    path: "/media-budget" },
  { icon: "⊛",  label: "Rateio de Verba",   path: "/budget-distribution" },
  { icon: "⋈",  label: "Pagar Plataformas", path: "/platform-payment" },
  { icon: "⊙",  label: "Academia",          path: "/academy" },
  { icon: "◻",  label: "Notificações",      path: "/notifications" },
  { icon: "◷",  label: "Mensagens",         path: "/messages" },
  { icon: "⊘",  label: "Assinatura",        path: "/my-subscription" },
  { icon: "⚙",  label: "Configurações",     path: "/settings" },
];

const NAV_ADMIN = [
  { icon: "⊛",  label: "Admin",             path: "/admin" },
  { icon: "⊞",  label: "Usuários",          path: "/admin/users" },
  { icon: "◫",  label: "Projetos",          path: "/admin/projects" },
  { icon: "▣",  label: "Analytics",         path: "/admin/analytics" },
  { icon: "⋈",  label: "Assinaturas",       path: "/admin/manage-subscriptions" },
  { icon: "◎",  label: "Planos",            path: "/admin/plans" },
  { icon: "◉",  label: "Financeiro",        path: "/admin/financeiro" },
  { icon: "◷",  label: "Admins",            path: "/admin/manage-admins" },
  { icon: "◻",  label: "Convites",          path: "/admin/invites" },
  { icon: "⊙",  label: "Moderação",         path: "/admin/moderation" },
];

// ── WhatsApp Button ────────────────────────────────────────────────────────
function WhatsAppButton() {
  const [expanded, setExpanded] = useState(false);
  const WA_NUMBER  = "554799465824";
  const WA_MESSAGE = "Olá! Preciso de ajuda com o MECPro. 😊";

  return (
    <>
      <style>{`
        @keyframes wa-pulse {
          0%,100% { transform: translateY(-50%) scale(1); }
          50%      { transform: translateY(-50%) scale(1.04); }
        }
        .wa-tab {
          position: fixed; right: 0; top: 50%; transform: translateY(-50%);
          z-index: 9999; cursor: pointer; border: none; background: none; padding: 0;
          animation: wa-pulse 3s ease-in-out infinite;
        }
        .wa-tab-pill {
          background: linear-gradient(180deg, #30d158, #1a9e3f);
          color: white; font-size: 11px; font-weight: 700;
          padding: 16px 7px; border-radius: 12px 0 0 12px;
          writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg);
          letter-spacing: 1.5px; box-shadow: -4px 0 20px rgba(48,209,88,0.35);
          user-select: none; white-space: nowrap; transition: all 0.2s;
        }
        .wa-tab:hover .wa-tab-pill {
          padding: 18px 8px; box-shadow: -6px 0 28px rgba(48,209,88,0.5);
        }
        .wa-panel {
          position: fixed; right: 0; top: 50%; transform: translateY(-50%);
          z-index: 9998; width: 260px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(32px) saturate(200%);
          border: 1px solid rgba(255,255,255,0.7);
          border-radius: 20px 0 0 20px;
          box-shadow: -8px 0 40px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset;
          padding: 22px;
          animation: slideInRight 0.3s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateY(-50%) translateX(30px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
      `}</style>

      {!expanded && (
        <button className="wa-tab" onClick={() => setExpanded(true)} title="Suporte via WhatsApp">
          <span className="wa-tab-pill">💬 AJUDA</span>
        </button>
      )}

      {expanded && (
        <div className="wa-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#30d158,#1a9e3f)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(48,209,88,0.3)" }}>
                <svg width="22" height="22" viewBox="0 0 32 32" fill="white"><path d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>Michel Leal</p>
                <p style={{ fontSize: 11, color: "#30d158", fontWeight: 600, margin: 0 }}>● Gerente de Relacionamento</p>
              </div>
            </div>
            <button onClick={() => setExpanded(false)} style={{ background: "rgba(0,0,0,0.06)", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", color: "#86868b", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>

          <div style={{ background: "rgba(48,209,88,0.08)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, border: "1px solid rgba(48,209,88,0.15)" }}>
            <p style={{ fontSize: 13, color: "#1d1d1f", lineHeight: 1.55, margin: 0 }}>
              👋 Precisa de ajuda com o MECPro? Nossa equipe responde rápido.
            </p>
          </div>

          <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_MESSAGE)}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg,#30d158,#1a9e3f)", color: "white", borderRadius: 12, padding: "12px 16px", fontWeight: 700, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 16px rgba(48,209,88,0.35)" }}>
            <svg width="18" height="18" viewBox="0 0 32 32" fill="white"><path d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
            Chamar no WhatsApp
          </a>

          <p style={{ fontSize: 11, color: "#86868b", textAlign: "center", marginTop: 10 }}>
            Seg–Sex, 9h–18h · Resposta em até 24h
          </p>
        </div>
      )}
    </>
  );
}

// ── Sidebar nav item with tooltip ─────────────────────────────────────────
function NavItem({ item, active, collapsed }: {
  item: { icon: string; label: string; path: string };
  active: boolean;
  collapsed: boolean;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div style={{ position: "relative" }}
      onMouseEnter={() => collapsed && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}>
      <a
        href={item.path}
        className={`sidebar-nav-item ${active ? "active" : ""}`}
        style={{ justifyContent: collapsed ? "center" : undefined }}
      >
        <span className="nav-icon" style={{ fontSize: 18 }}>{item.icon}</span>
        <span className="nav-label">{item.label}</span>
      </a>
      {collapsed && showTip && (
        <div style={{
          position: "absolute", left: "calc(100% + 10px)", top: "50%", transform: "translateY(-50%)",
          background: "rgba(29,29,31,0.92)", backdropFilter: "blur(12px)",
          color: "white", fontSize: 12, fontWeight: 600, padding: "6px 12px",
          borderRadius: 8, whiteSpace: "nowrap", zIndex: 999,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          animation: "fadeIn 0.15s ease",
          pointerEvents: "none",
        }}>
          {item.label}
          <div style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", border: "5px solid transparent", borderRightColor: "rgba(29,29,31,0.92)" }} />
        </div>
      )}
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────
interface LayoutProps { children: React.ReactNode; }

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin  = ["admin","superadmin"].includes(user?.role ?? "");
  const navItems = isAdmin && location.startsWith("/admin") ? NAV_ADMIN : NAV_USER;

  // Persist collapse state
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "1"; } catch { return false; }
  });

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("sidebar-collapsed", next ? "1" : "0"); } catch {}
  };

  // Active page title
  const activeItem = navItems.find(i => location === i.path || location.startsWith(i.path + "/"));
  const pageTitle  = activeItem?.label ?? "MECPro";

  return (
    <div className="app-layout">

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>

        {/* Logo + toggle */}
        <div className="sidebar-logo">
          <img src="/logo.jpg" alt="MECPro" />
          <span className="sidebar-logo-text">
            MEC<span className="pro">PRO</span>
          </span>
          <button className="sidebar-toggle" onClick={toggle} title={collapsed ? "Expandir" : "Recolher"}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        {/* Nav */}
        <nav>
          {navItems.map(item => (
            <NavItem
              key={item.path}
              item={item}
              collapsed={collapsed}
              active={location === item.path || location.startsWith(item.path + "/")}
            />
          ))}

          {/* Admin shortcut */}
          {isAdmin && !location.startsWith("/admin") && (
            <>
              <div className="sidebar-section-label">Admin</div>
              <NavItem
                item={{ icon: "⊛", label: "Painel Admin", path: "/admin" }}
                collapsed={collapsed}
                active={location === "/admin"}
              />
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <NavItem
            item={{ icon: "◷", label: "Perfil", path: "/profile" }}
            collapsed={collapsed}
            active={location === "/profile"}
          />
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="app-main">

        {/* Topbar */}
        <header className="app-topbar">
          <div className="app-topbar-left">
            {/* Mobile menu toggle */}
            <div className="app-topbar-title">{pageTitle}</div>
          </div>
          <UserMenu />
        </header>

        {/* Content */}
        <main className="app-content animate-fade-in">
          {children}
        </main>
      </div>

      {/* WhatsApp */}
      <WhatsAppButton />
    </div>
  );
}
