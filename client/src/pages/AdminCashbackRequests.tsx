import { useState } from "react";
import Layout from "@/components/layout/Layout";

const MOCK = [
  { id: 1, user: "João Silva",   email: "joao@email.com",  amount: 4700, type: "Indicação", status: "pending",  createdAt: "2026-03-01" },
  { id: 2, user: "Maria Santos", email: "maria@email.com", amount: 9700, type: "Cashback",  status: "approved", createdAt: "2026-02-28" },
  { id: 3, user: "Carlos Lima",  email: "carlos@email.com",amount: 1970, type: "Indicação", status: "paid",     createdAt: "2026-02-25" },
  { id: 4, user: "Ana Costa",    email: "ana@email.com",   amount: 4700, type: "Cashback",  status: "rejected", createdAt: "2026-02-20" },
];

export default function AdminCashbackRequests() {
  const [filter, setFilter] = useState("all");
  const [items, setItems]   = useState(MOCK);

  const filtered = items.filter(i => filter === "all" || i.status === filter);
  const totalPending = items.filter(i => i.status === "pending").reduce((a, b) => a + b.amount, 0);

  function approve(id: number) { setItems(is => is.map(i => i.id === id ? { ...i, status: "approved" } : i)); }
  function reject(id: number)  { setItems(is => is.map(i => i.id === id ? { ...i, status: "rejected" } : i)); }

  const statusColor: Record<string, string> = { pending: "badge-navy", approved: "badge-green", paid: "badge-gray", rejected: "badge-error" };

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Solicitações de Cashback</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Indicações e cashbacks pendentes de aprovação</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Pendentes",  value: items.filter(i => i.status === "pending").length,  color: "#fef9c3" },
          { label: "Aprovados",  value: items.filter(i => i.status === "approved").length, color: "var(--green-l)" },
          { label: "Pagos",      value: items.filter(i => i.status === "paid").length,     color: "#eff6ff" },
          { label: "A pagar",    value: `R$ ${(totalPending/100).toFixed(2)}`,             color: "#fef2f2" },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 8 }}>💰</div>
            <p style={{ fontSize: 22, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)", marginBottom: 2 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["all","pending","approved","paid","rejected"].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`btn btn-sm ${filter===s?"btn-primary":"btn-outline"}`}>
            {s === "all" ? "Todos" : s}
          </button>
        ))}
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--off)" }}>
              {["Usuário","Tipo","Valor","Data","Status","Ações"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{item.user}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{item.email}</p>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{item.type}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--black)" }}>R$ {(item.amount/100).toFixed(2)}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{item.createdAt}</td>
                <td style={{ padding: "12px 16px" }}><span className={`badge ${statusColor[item.status]}`} style={{ fontSize: 11 }}>{item.status}</span></td>
                <td style={{ padding: "12px 16px" }}>
                  {item.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-sm btn-outline" style={{ fontSize: 11, color: "var(--green-d)" }} onClick={() => approve(item.id)}>Aprovar</button>
                      <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, color: "#ef4444" }} onClick={() => reject(item.id)}>Rejeitar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
