import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function AdminFinanceiro() {
  const { user } = useAuth();
  const isSuperadmin = (user as any)?.role === "superadmin";

  const { data: payments, isLoading } = trpc.admin.payments.useQuery();
  const { data: stats } = trpc.admin.stats.useQuery();
  const { data: settings, refetch: refetchSettings } = trpc.admin.getSettings.useQuery();
  const [filter, setFilter] = useState("all");

  const pixEnabled = (settings as any)?.pix_enabled !== "false";

  const saveSetting = trpc.admin.saveSettings.useMutation({
    onSuccess: () => { refetchSettings(); toast.success("✅ Configuração salva!"); },
    onError:   (e) => toast.error(e.message),
  });

  function togglePix() {
    saveSetting.mutate({ key: "pix_enabled", value: pixEnabled ? "false" : "true" });
  }

  const filtered = (payments || []).filter((p: any) => filter === "all" || p.status === filter);
  const statusColor: Record<string, string> = { completed: "badge-green", pending: "badge-navy", failed: "badge-error", refunded: "badge-gray" };

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Financeiro</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Histórico de pagamentos e receita</p>
      </div>

      {/* Painel Pix — exclusivo Superadmin */}
      {isSuperadmin && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 22px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Logo Pix */}
            <div style={{ width: 44, height: 44, borderRadius: 12, background: pixEnabled ? "#e0faf6" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 512 512" fill={pixEnabled ? "#1a9e90" : "#94a3b8"}>
                <path d="M242.4 292.5C247.8 287.1 255.1 284.5 262.5 284.5C269.9 284.5 277.2 287.1 282.6 292.5L395.4 405.4C419.3 429.3 458.7 429.3 482.6 405.4C506.5 381.5 506.5 342.1 482.6 318.2L369.8 205.4C365.2 200.9 365.2 193.5 369.8 189L482.6 76.18C506.5 52.29 506.5 12.86 482.6-11.03C458.7-34.92 419.3-34.92 395.4-11.03L282.6 101.8C277.2 107.2 269.9 109.8 262.5 109.8C255.1 109.8 247.8 107.2 242.4 101.8L129.6-11.03C105.7-34.92 66.29-34.92 42.4-11.03C18.51 12.86 18.51 52.29 42.4 76.18L155.2 189C159.8 193.5 159.8 200.9 155.2 205.4L42.4 318.2C18.51 342.1 18.51 381.5 42.4 405.4C66.29 429.3 105.7 429.3 129.6 405.4L242.4 292.5z"/>
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15, color: "var(--black)", marginBottom: 2 }}>
                Pagamento via Pix
                <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  background: pixEnabled ? "#dcfce7" : "#fee2e2",
                  color: pixEnabled ? "#16a34a" : "#dc2626" }}>
                  {pixEnabled ? "● ATIVO" : "● OCULTO"}
                </span>
              </p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                {pixEnabled
                  ? "Botão 'Pagar com Pix' está visível na página de planos para todos os usuários."
                  : "Botão 'Pagar com Pix' está oculto. Usuários só verão a opção de cartão."}
              </p>
            </div>
          </div>
          <button
            onClick={togglePix}
            disabled={saveSetting.isLoading}
            style={{
              padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13, flexShrink: 0,
              background: pixEnabled ? "#fee2e2" : "#dcfce7",
              color: pixEnabled ? "#dc2626" : "#16a34a",
              opacity: saveSetting.isLoading ? 0.6 : 1,
            }}>
            {saveSetting.isLoading ? "Salvando..." : pixEnabled ? "🚫 Ocultar Pix" : "✅ Exibir Pix"}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Receita total",     value: `R$ ${((stats?.totalRevenue || 0) / 100).toFixed(2)}`, icon: "💰", color: "var(--green-l)" },
          { label: "Receita este mês",  value: `R$ ${((stats?.revenueMonth || 0) / 100).toFixed(2)}`,  icon: "📈", color: "#eff6ff" },
          { label: "Total transações",  value: payments?.length || 0,                                    icon: "🧾", color: "#fef3c7" },
        ].map(k => (
          <div key={k.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 22 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: k.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10 }}>{k.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)", marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["all", "completed", "pending", "failed", "refunded"].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-outline"}`}>
            {s === "all" ? "Todos" : s}
          </button>
        ))}
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--off)" }}>
              {["ID", "Usuário", "Valor", "Status", "Método", "Data"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Carregando...</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Nenhum pagamento encontrado</td></tr>
            ) : filtered.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>#{p.id}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--black)" }}>User #{p.userId}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--black)" }}>R$ {((p.amount || 0) / 100).toFixed(2)}</td>
                <td style={{ padding: "12px 16px" }}><span className={`badge ${statusColor[p.status] || "badge-gray"}`} style={{ fontSize: 11 }}>{p.status}</span></td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{p.paymentMethod || "—"}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
