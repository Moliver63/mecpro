import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function AdminStudents() {
  const { data: users, isLoading, refetch } = trpc.admin.users.useQuery();
  const { data: projects } = trpc.admin.projects.useQuery();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const updatePlan = trpc.admin.updateUserPlan.useMutation({ onSuccess: () => refetch() });
  const suspend    = trpc.admin.suspendUser.useMutation({ onSuccess: () => refetch() });
  const unsuspend  = trpc.admin.unsuspendUser.useMutation({ onSuccess: () => refetch() });

  const projsByUser = (projects || []).reduce((acc: any, p: any) => {
    acc[p.userId] = (acc[p.userId] || 0) + 1; return acc;
  }, {});

  const filtered = (users || [])
    .filter((u: any) => u.role === "user")
    .filter((u: any) => {
      const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase());
      const matchPlan = planFilter === "all" || u.plan === planFilter;
      return matchSearch && matchPlan;
    });

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Estudantes / Clientes</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{filtered.length} usuários · gerenciamento completo</p>
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "free", "basic", "premium", "vip"].map(p => (
            <button key={p} onClick={() => setPlanFilter(p)} className={`btn btn-sm ${planFilter === p ? "btn-primary" : "btn-outline"}`}>
              {p === "all" ? "Todos" : p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--off)" }}>
              {["Usuário", "Plano", "Projetos", "Status", "Cadastro", "Ações"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Carregando...</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Nenhum usuário encontrado</td></tr>
            ) : filtered.map((u: any) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--green-dk)" }}>
                      {u.name?.[0]?.toUpperCase() || u.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{u.name || "—"}</p>
                      <p style={{ fontSize: 11, color: "var(--muted)" }}>{u.email}</p>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <select value={u.plan} onChange={e => updatePlan.mutate({ userId: u.id, plan: e.target.value as any })}
                    style={{ fontSize: 12, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", background: "white" }}>
                    {["free", "basic", "premium", "vip"].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>{projsByUser[u.id] || 0}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: u.status === "suspended" ? "#fef2f2" : "var(--green-xl)", color: u.status === "suspended" ? "#ef4444" : "var(--green-dk)" }}>
                    {u.status === "suspended" ? "Suspenso" : "Ativo"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
                <td style={{ padding: "12px 16px" }}>
                  {u.status === "suspended"
                    ? <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={() => unsuspend.mutate({ userId: u.id })}>Reativar</button>
                    : <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={() => suspend.mutate({ userId: u.id, reason: "Admin action" })}>Suspender</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
