import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function Unauthorized() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #fff5f5 0%, #fee2e2 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24
    }}>
      <div style={{
        background: "white", borderRadius: 24, padding: "48px 44px",
        maxWidth: 480, width: "100%", textAlign: "center",
        boxShadow: "0 16px 48px rgba(0,0,0,.08)"
      }}>
        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "#fee2e2", border: "3px solid #fca5a5",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, margin: "0 auto 20px"
        }}>
          🚫
        </div>

        <div style={{
          display: "inline-block", background: "#fee2e2", color: "#dc2626",
          fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 20,
          letterSpacing: 1, marginBottom: 16
        }}>
          ACESSO NEGADO — 403
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800,
          color: "var(--black)", marginBottom: 10
        }}>
          Sem permissão de acesso
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, marginBottom: 28 }}>
          Você não tem permissão para acessar esta página.
          {user ? " Sua conta não possui o nível de acesso necessário." : " Faça login com uma conta autorizada."}
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {user ? (
            <>
              <button className="btn btn-md btn-green" onClick={() => setLocation("/dashboard")}>
                Ir para o Dashboard
              </button>
              <button className="btn btn-md btn-outline" onClick={() => history.back()}>
                ← Voltar
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-md btn-green" onClick={() => setLocation("/login")}>
                Fazer Login
              </button>
              <button className="btn btn-md btn-outline" onClick={() => setLocation("/")}>
                Página inicial
              </button>
            </>
          )}
        </div>

        {!user && (
          <p style={{ marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
            Ainda não tem conta?{" "}
            <a href="/register" style={{ color: "var(--green-d)", fontWeight: 600, textDecoration: "none" }}>
              Registre-se gratuitamente
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
