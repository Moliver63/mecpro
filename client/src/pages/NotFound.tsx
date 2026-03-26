import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24
    }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        {/* Big 404 */}
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 120, fontWeight: 900,
          color: "var(--green)", lineHeight: 1, marginBottom: 0,
          letterSpacing: -4, opacity: 0.15
        }}>
          404
        </div>
        <div style={{ marginTop: -32, marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800,
            color: "var(--black)", marginBottom: 10
          }}>
            Página não encontrada
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6 }}>
            A página que você está procurando não existe ou foi movida.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-md btn-green" onClick={() => setLocation("/dashboard")}>
            🏠 Ir para o Dashboard
          </button>
          <button className="btn btn-md btn-outline" onClick={() => history.back()}>
            ← Voltar
          </button>
          <button className="btn btn-md btn-ghost" onClick={() => setLocation("/projects")}>
            📁 Meus Projetos
          </button>
        </div>

        {/* Quick links */}
        <div style={{
          marginTop: 40, padding: 24, background: "white",
          borderRadius: 16, border: "1px solid var(--border)"
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)", marginBottom: 14 }}>
            Links úteis:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "📊 Dashboard", path: "/dashboard" },
              { label: "📁 Projetos", path: "/projects" },
              { label: "🔍 Consultas", path: "/consultas" },
              { label: "⚙️ Configurações", path: "/settings" },
            ].map(l => (
              <button key={l.path} onClick={() => setLocation(l.path)}
                style={{
                  background: "var(--off)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                  fontSize: 13, color: "var(--dark)", fontWeight: 500,
                  transition: "all .15s"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--green)"; e.currentTarget.style.background = "var(--green-l)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--off)"; }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
