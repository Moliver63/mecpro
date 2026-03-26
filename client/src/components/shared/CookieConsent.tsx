import { useState, useEffect } from "react";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (!localStorage.getItem("mecpro_cookies")) setVisible(true); }, []);
  if (!visible) return null;
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, padding: "16px 24px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", background: "white", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-lg)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--dark)", marginBottom: 3 }}>Usamos cookies 🍪</p>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Para melhorar sua experiência. Veja nossa <a href="/privacy" style={{ color: "var(--green-d)" }}>Política de Privacidade</a>.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button className="btn btn-sm btn-outline" onClick={() => { localStorage.setItem("mecpro_cookies", "false"); setVisible(false); }}>Recusar</button>
          <button className="btn btn-sm btn-green" onClick={() => { localStorage.setItem("mecpro_cookies", "true"); setVisible(false); }}>Aceitar</button>
        </div>
      </div>
    </div>
  );
}
