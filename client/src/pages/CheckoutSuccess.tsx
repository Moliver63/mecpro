import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();
  const { user, refetch } = useAuth() as any;
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    // Refetch user data to get updated plan
    if (refetch) refetch();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          setLocation("/dashboard");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const plan = (user as any)?.plan;
  const planLabels: Record<string, string> = {
    basic: "Basic",
    premium: "Premium",
    vip: "VIP"
  };
  const planName = planLabels[plan] ?? "Premium";

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24
    }}>
      <div style={{
        background: "white", borderRadius: 24, padding: "52px 48px",
        maxWidth: 520, width: "100%", textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,.08)"
      }}>
        {/* Success icon */}
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "var(--green-l)", border: "3px solid var(--green)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, margin: "0 auto 24px"
        }}>
          ✅
        </div>

        <div style={{
          display: "inline-block", background: "var(--green-l)", color: "var(--green-dk)",
          fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 20,
          letterSpacing: 1, marginBottom: 16
        }}>
          PAGAMENTO CONFIRMADO
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800,
          color: "var(--black)", marginBottom: 10
        }}>
          Bem-vindo ao plano {planName}! 🎉
        </h1>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6, marginBottom: 28 }}>
          Sua assinatura foi ativada com sucesso. Agora você tem acesso a todos os recursos do MECPro.
        </p>

        {/* Features unlocked */}
        <div style={{
          background: "var(--off)", borderRadius: 14, padding: "20px 24px",
          marginBottom: 28, textAlign: "left"
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)", marginBottom: 12 }}>
            🔓 Recursos desbloqueados:
          </p>
          {[
            "Projetos ilimitados com análise completa",
            "Análise de concorrentes com cascata 7 camadas",
            "Geração de campanhas com IA Gemini",
            "Exportação PDF e relatórios avançados",
            "Suporte prioritário"
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "var(--green)", fontSize: 14, fontWeight: 700 }}>✓</span>
              <span style={{ fontSize: 13, color: "var(--body)" }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button
            className="btn btn-md btn-green btn-full"
            onClick={() => setLocation("/dashboard")}
          >
            Ir para o Dashboard
          </button>
          <button
            className="btn btn-md btn-outline"
            style={{ flexShrink: 0 }}
            onClick={() => setLocation("/projects/new")}
          >
            Criar projeto
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Redirecionando automaticamente em <strong>{countdown}s</strong>...
        </p>

        {/* Invoice note */}
        <div style={{
          marginTop: 24, padding: "14px 18px",
          background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe"
        }}>
          <p style={{ fontSize: 12, color: "#1d4ed8" }}>
            📧 Uma confirmação foi enviada para seu e-mail com os detalhes da assinatura.
          </p>
        </div>
      </div>
    </div>
  );
}
