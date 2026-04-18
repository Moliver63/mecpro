import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const PLAN_FEATURES: Record<string, string[]> = {
  free:    ["1 projeto ativo", "2 concorrentes por projeto", "Análise básica", "Sem geração de campanha com IA"],
  basic:   ["3 projetos ativos", "5 concorrentes por projeto", "Análise completa", "3 campanhas/mês com IA", "Suporte por e-mail"],
  premium: ["10 projetos ativos", "Concorrentes ilimitados", "Análise avançada", "Campanhas ilimitadas", "Relatórios exportáveis", "Suporte prioritário"],
  vip:     ["Projetos ilimitados", "Concorrentes ilimitados", "Todos os recursos", "API access", "Manager dedicado", "Treinamento incluído"],
};

export default function MySubscription() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: plans } = trpc.plans.list.useQuery();
  const plan = (user as any)?.plan || "free";
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

  const planColors: Record<string, string> = {
    free: "#64748b", basic: "#2563eb", premium: "var(--green-d)", vip: "#7c3aed"
  };
  const color = planColors[plan] || "#64748b";

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Minha Assinatura</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Gerencie seu plano e histórico de pagamentos</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Plano atual */}
        <div style={{ background: "var(--navy)", borderRadius: 16, padding: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Plano atual</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: "white", fontFamily: "var(--font-display)", textTransform: "capitalize" }}>{plan}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginBottom: 6 }}>{plan === "free" ? "Gratuito" : "/mês"}</span>
          </div>
          <div style={{ marginBottom: 20 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: plan === "free" && i > 2 ? "#ef4444" : "var(--green)" }}>
                  {plan === "free" && i > 2 ? "✗" : "✓"}
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.8)" }}>{f}</span>
              </div>
            ))}
          </div>
          {plan !== "vip" && (
            <button className="btn btn-md btn-green btn-full" onClick={() => setLocation("/billing")}>
              ⬆ Fazer upgrade
            </button>
          )}
        </div>

        {/* Info conta */}
        <div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 14 }}>Detalhes da assinatura</p>
            {[
              ["Status", <span style={{ color: "var(--green-d)", fontWeight: 700 }}>✓ Ativo</span>],
              ["Plano", <span style={{ textTransform: "capitalize", fontWeight: 700 }}>{plan}</span>],
              ["Próximo pagamento", plan === "free" ? "—" : "Em breve"],
              ["Método de pagamento", plan === "free" ? "—" : "Cartão •••• 0000"],
            ].map(([k, v]: any) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{k}</span>
                <span style={{ fontSize: 13, color: "var(--black)" }}>{v}</span>
              </div>
            ))}
          </div>

          {plan !== "free" && (
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 14 }}>Ações</p>
              <button className="btn btn-sm btn-outline btn-full" style={{ marginBottom: 8 }}>📄 Baixar recibo</button>
              <button className="btn btn-sm btn-ghost btn-full" style={{ color: "#ef4444" }}>Cancelar assinatura</button>
            </div>
          )}
        </div>
      </div>

      {/* Upgrade plans */}
      {plan !== "vip" && (
        <>
          <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)", marginBottom: 16 }}>Fazer upgrade</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {plans?.filter((p: any) => p.slug !== plan && p.slug !== "free").map((p: any) => (
              <div key={p.id} style={{ background: "white", border: `2px solid ${p.slug === "premium" ? "var(--green)" : "var(--border)"}`, borderRadius: 14, padding: 20, position: "relative" }}>
                {p.slug === "premium" && (
                  <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "var(--green)", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 12px", borderRadius: 20 }}>RECOMENDADO</div>
                )}
                <p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)", textTransform: "capitalize", marginBottom: 4 }}>{p.name || p.slug}</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)", marginBottom: 12 }}>R$ {p.priceMonthly || "—"}<span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted)" }}>/mês</span></p>
                <button className={`btn btn-sm btn-full ${p.slug === "premium" ? "btn-green" : "btn-outline"}`}
                  onClick={() => setLocation("/billing")}>
                  Escolher {p.slug}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
