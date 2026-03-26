import { useState } from "react";
import Layout from "@/components/layout/Layout";

const MOCK = [
  { id: 1, user: "João Silva",    email: "joao@email.com", type: "Consultoria",   date: "2026-03-15 14:00", status: "confirmed" },
  { id: 2, user: "Maria Santos",  email: "maria@email.com", type: "Mentoria",     date: "2026-03-16 10:00", status: "pending"   },
  { id: 3, user: "Carlos Lima",   email: "carlos@email.com", type: "Consultoria", date: "2026-03-17 16:00", status: "confirmed" },
  { id: 4, user: "Ana Costa",     email: "ana@email.com",  type: "Mentoria",      date: "2026-03-20 09:00", status: "canceled"  },
];

export default function AdminAppointments() {
  const [filter, setFilter] = useState("all");
  const filtered = MOCK.filter(a => filter === "all" || a.status === filter);
  const statusColor: Record<string, string> = { confirmed: "badge-green", pending: "badge-navy", canceled: "badge-error" };

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Agendamentos</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Mentorias e consultorias agendadas</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Confirmados", value: MOCK.filter(a => a.status === "confirmed").length, color: "var(--green-l)" },
          { label: "Pendentes",   value: MOCK.filter(a => a.status === "pending").length,   color: "#eff6ff"       },
          { label: "Cancelados",  value: MOCK.filter(a => a.status === "canceled").length,  color: "#fef2f2"       },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📅</div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>{s.value}</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["all","confirmed","pending","canceled"].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`btn btn-sm ${filter===s?"btn-primary":"btn-outline"}`}>
            {s === "all" ? "Todos" : s}
          </button>
        ))}
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--off)" }}>
              {["Usuário","Tipo","Data/Hora","Status","Ações"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{a.user}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{a.email}</p>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>{a.type}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--black)", fontFamily: "monospace" }}>{a.date}</td>
                <td style={{ padding: "12px 16px" }}><span className={`badge ${statusColor[a.status]}`} style={{ fontSize: 11 }}>{a.status}</span></td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {a.status === "pending" && <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }}>Confirmar</button>}
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}>Detalhes</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
