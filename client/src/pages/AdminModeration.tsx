import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function AdminModeration() {
  const { data: logs, isLoading } = trpc.admin.auditLogs.useQuery();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    user_login:       { label: "Login",        color: "#eff6ff" },
    user_register:    { label: "Cadastro",     color: "var(--green-l)" },
    user_suspended:   { label: "Suspenso",     color: "#fef2f2" },
    plan_upgraded:    { label: "Upgrade",      color: "#f5f3ff" },
    project_created:  { label: "Proj. criado", color: "#fef9c3" },
    campaign_created: { label: "Campanha",     color: "var(--green-l)" },
    admin_promoted:   { label: "Admin",        color: "#f5f3ff" },
  };

  const filtered = (logs || []).filter((l: any) => {
    const matchSearch = !search || l.action?.includes(search) || String(l.userId)?.includes(search);
    const matchFilter = filter === "all" || l.action?.includes(filter);
    return matchSearch && matchFilter;
  });

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Moderação / Auditoria</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Log de atividades da plataforma</p>
      </div>

      {/* Stats rápidos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total eventos",   value: logs?.length || 0,                                              icon: "📋", color: "var(--off)" },
          { label: "Logins hoje",     value: (logs||[]).filter((l:any)=>l.action==="user_login").length,      icon: "🔑", color: "#eff6ff" },
          { label: "Novos cadastros", value: (logs||[]).filter((l:any)=>l.action==="user_register").length,   icon: "👤", color: "var(--green-l)" },
          { label: "Suspensos",       value: (logs||[]).filter((l:any)=>l.action==="user_suspended").length,  icon: "🚫", color: "#fef2f2" },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input className="input" placeholder="Buscar por ação ou usuário..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "login", "register", "suspended", "upgrade", "project"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline"}`}>
              {f === "all" ? "Todos" : f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--off)" }}>
              {["#", "Ação", "Usuário", "Detalhes", "IP", "Data"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Carregando...</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Nenhum log encontrado</td></tr>
            ) : filtered.slice(0, 100).map((l: any) => {
              const a = ACTION_LABELS[l.action] || { label: l.action, color: "var(--off)" };
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 16px", fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>#{l.id}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: a.color, color: "var(--black)", padding: "2px 8px", borderRadius: 4 }}>{a.label}</span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--black)" }}>#{l.userId || "—"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.details || "—"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{l.ipAddress || "—"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 11, color: "var(--muted)" }}>{l.createdAt ? new Date(l.createdAt).toLocaleString("pt-BR") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
