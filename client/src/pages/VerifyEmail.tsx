/**
 * VerifyEmail.tsx — Verificação de email
 * Design: Liquid Glass · MECPro AI Design System
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type Status = "loading" | "success" | "error" | "missing";

export default function VerifyEmail() {
  const [status,  setStatus]  = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [email,   setEmail]   = useState("");
  const [resent,  setResent]  = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setStatus("missing"); return; }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) { setStatus("success"); setEmail(data.email || ""); }
        else { setStatus("error"); setMessage(data.error ?? "Token inválido ou expirado."); }
      })
      .catch(() => { setStatus("error"); setMessage("Erro de conexão. Tente novamente."); });
  }, []);

  const handleResend = async () => {
    const emailParam = new URLSearchParams(window.location.search).get("email") || "";
    if (!emailParam) return;
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam }),
      });
      setResent(true);
    } catch { /* silencioso */ }
  };

  const STATUS_CONFIG = {
    loading: { icon: "◷", color: "var(--blue)",   bg: "var(--blue-l)",         title: "Verificando…",         sub: "Aguarde um instante." },
    success: { icon: "◎", color: "var(--green-d)", bg: "rgba(48,209,88,0.1)",   title: "Email confirmado",     sub: "Sua conta está ativa." },
    error:   { icon: "✕", color: "var(--red)",     bg: "rgba(255,59,48,0.08)",  title: "Link inválido",        sub: message },
    missing: { icon: "◬", color: "var(--orange)",  bg: "rgba(255,159,10,0.08)", title: "Link incompleto",      sub: "Verifique seu email e tente novamente." },
  };

  const cfg = STATUS_CONFIG[status];

  return (
    <div style={{ minHeight: "100vh", background: "var(--off)", display: "flex", flexDirection: "column", fontFamily: "var(--font)" }}>

      {/* Nav */}
      <nav style={{ height: 56, background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 32px" }}>
        <a href="/" style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", textDecoration: "none", letterSpacing: "-0.04em" }}>
          MEC<span style={{ color: "var(--green-d)" }}>PRO</span>
        </a>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(16px, 4vw, 40px)" }}>
        <div style={{
          background: "var(--glass-bg)", backdropFilter: "var(--glass-blur)",
          border: "1px solid var(--glass-border)", borderRadius: "var(--r-xl)",
          padding: "clamp(28px,5vw,52px)", maxWidth: 440, width: "100%",
          textAlign: "center", boxShadow: "var(--glass-shadow)",
        }}>

          {/* Ícone de status */}
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: cfg.bg, border: `1.5px solid ${cfg.color}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, color: cfg.color, margin: "0 auto 24px",
            fontWeight: 300, lineHeight: 1,
            animation: status === "loading" ? "spin 1.5s linear infinite" : undefined,
          }}>
            {cfg.icon}
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--black)", marginBottom: 8, letterSpacing: "-0.03em" }}>
            {cfg.title}
          </h1>

          {status === "success" && email && (
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
              <strong style={{ color: "var(--dark)" }}>{email}</strong>
            </p>
          )}

          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, marginBottom: 28 }}>
            {cfg.sub}
          </p>

          {/* Ações por status */}
          {status === "success" && (
            <button
              onClick={() => navigate("/dashboard")}
              className="btn btn-primary btn-lg btn-full"
              style={{ marginBottom: 16 }}>
              Acessar plataforma →
            </button>
          )}

          {(status === "error" || status === "missing") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {!resent ? (
                <button onClick={handleResend} className="btn btn-primary btn-md btn-full">
                  Reenviar link de verificação
                </button>
              ) : (
                <div style={{ padding: "12px 16px", background: "rgba(48,209,88,0.08)", border: "1px solid rgba(48,209,88,0.2)", borderRadius: "var(--r-sm)", fontSize: 13, color: "var(--green-d)", fontWeight: 600 }}>
                  ◎ Novo link enviado para seu email
                </div>
              )}
              <button onClick={() => navigate("/login")} className="btn btn-ghost btn-md btn-full">
                ← Voltar ao login
              </button>
            </div>
          )}

          {status === "loading" && (
            <p style={{ fontSize: 12, color: "var(--muted)" }}>Verificando token…</p>
          )}

          {/* Footer */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              Precisa de ajuda?{" "}
              <a href="/contact" style={{ color: "var(--blue)", fontWeight: 600, textDecoration: "none" }}>Fale conosco</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
