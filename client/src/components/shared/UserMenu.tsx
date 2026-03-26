import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function UserMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    setLocation("/login");
    window.location.reload();
  };

  if (!user) return null;
  const initials = user.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "white", cursor: "pointer", transition: "border-color .15s" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#adb5bd")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--green-l)", border: "1.5px solid var(--green-xl)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--green-dk)" }}>{initials}</div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--dark)" }}>{user.name?.split(" ")[0] ?? user.email}</span>
        <svg style={{ width: 14, height: 14, color: "var(--muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 220, background: "white", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-md)", zIndex: 20, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{user.name ?? "Usuário"}</p>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{user.email}</p>
              <span className="badge badge-green" style={{ marginTop: 6, fontSize: 11 }}>{user.plan}</span>
            </div>
            <div style={{ padding: "6px 0" }}>
              {[
                { label: "Dashboard", path: "/dashboard" },
                { label: "Projetos", path: "/projects" },
                { label: "Perfil", path: "/profile" },
                { label: "Assinatura", path: "/my-subscription" },
                { label: "Configurações", path: "/settings" },
              ].map(item => (
                <button key={item.path} onClick={() => { setLocation(item.path); setOpen(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 14, color: "var(--body)", background: "none", border: "none", cursor: "pointer", transition: "background .1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--off)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  {item.label}
                </button>
              ))}
              {["admin", "superadmin"].includes(user.role) && (
                <button onClick={() => { setLocation("/admin"); setOpen(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 14, color: "var(--green-dk)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--green-l)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  🛡️ Painel Admin
                </button>
              )}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
                <button onClick={logout}
                  style={{ width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 14, color: "var(--error)", background: "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--error-l)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  Sair
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
