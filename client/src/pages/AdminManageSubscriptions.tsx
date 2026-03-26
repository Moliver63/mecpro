import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function AdminManageSubscriptions() {
  const { data: subs, isLoading } = trpc.admin.subscriptions.useQuery();
  const { data: users } = trpc.admin.users.useQuery();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]));

  const filtered = (subs || []).filter((s: any) => {
    const user = userMap[s.userId];
    const matchSearch = !search || user?.email?.includes(search) || user?.name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || s.status === filter;
    return matchSearch && matchFilter;
  });

  const statusColor: Record<string, string> = {
    active: "badge-green", canceled: "badge-gray", past_due: "badge-error", trialing: "badge-navy"
  };

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Assinaturas</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{subs?.length || 0} assinaturas no total</p>
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" placeholder="Buscar por usuário..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "active", "canceled", "past_due", "trialing"].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-outline"}`}>
              {s === "all" ? "Todas" : s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--off)" }}>
              {["Usuário", "Plano", "Status", "Stripe ID", "Início", "Próx. cobrança"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Carregando...</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Nenhuma assinatura encontrada</td></tr>
            ) : filtered.map((s: any) => {
              const user = userMap[s.userId];
              return (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{user?.name || "—"}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{user?.email || `ID: ${s.userId}`}</p>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "var(--green-xl)", color: "var(--green-dk)", padding: "2px 8px", borderRadius: 4 }}>Plano {s.planId}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className={`badge ${statusColor[s.status] || "badge-gray"}`} style={{ fontSize: 11 }}>{s.status}</span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{s.stripeSubscriptionId?.slice(0, 20) || "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{s.currentPeriodStart ? new Date(s.currentPeriodStart).toLocaleDateString("pt-BR") : "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
