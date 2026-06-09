import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const STATUS_CONF: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ok:      { label: "Conforme",   color: "#059669", bg: "#f0fdf4", border: "#bbf7d0" },
  partial: { label: "Parcial",    color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  error:   { label: "Incompleto", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

const CHECK_LABELS: Record<string, string> = {
  hasProfile:       "Perfil cadastrado",
  hasWebsite:       "Website informado",
  hasProduct:       "Produto definido",
  hasDifferentials: "Diferenciais preenchidos",
  hasProofPoints:   "Provas sociais",
  hasCampaign:      "Campanha gerada",
  hasPublished:     "Campanha publicada",
  metaConnected:    "Meta Ads conectado",
};

export default function AdminProjects() {
  const { data: projects, isLoading, refetch } =
    (trpc as any).admin?.projectsAudit?.useQuery?.() ?? { data: null, isLoading: true };

  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState<"all"|"ok"|"partial"|"error">("all");
  const [expanded, setExpanded]   = useState<number | null>(null);

  const filtered = (projects ?? []).filter((p: any) => {
    const matchSearch = `${p.name} ${p.userEmail} ${p.companyName || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || p.conformityStatus === filter;
    return matchSearch && matchFilter;
  });

  const counts = (projects ?? []).reduce((acc: any, p: any) => {
    acc[p.conformityStatus] = (acc[p.conformityStatus] || 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
              🗂️ Auditoria de Projetos
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Todos os projetos dos usuários — conformidade e status de integração
            </p>
          </div>
          <button onClick={() => refetch?.()}
            style={{ padding: "9px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0",
              background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            🔄 Atualizar
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",      value: projects?.length ?? 0, color: "#0f172a", bg: "#f8fafc", border: "#e2e8f0" },
            { label: "✅ Conforme",  value: counts.ok ?? 0,       color: "#059669", bg: "#f0fdf4", border: "#bbf7d0" },
            { label: "⚠️ Parcial",   value: counts.partial ?? 0,  color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
            { label: "❌ Incompleto",value: counts.error ?? 0,    color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
          ].map(k => (
            <div key={k.label} onClick={() => setFilter(k.label.includes("Conforme") ? "ok" : k.label.includes("Parcial") ? "partial" : k.label.includes("Incompleto") ? "error" : "all")}
              style={{ background: k.bg, border: `1.5px solid ${k.border}`, borderRadius: 12,
                padding: "14px 18px", cursor: "pointer" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por projeto, email ou empresa..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, padding: "9px 14px", borderRadius: 10,
              border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none" }}
          />
          {(["all","ok","partial","error"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "8px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: "pointer", border: `1.5px solid ${filter===f?"#16a34a":"#e2e8f0"}`,
                background: filter===f?"#16a34a":"white",
                color: filter===f?"white":"#64748b" }}>
              {f==="all"?"Todos":f==="ok"?"✅ Conformes":f==="partial"?"⚠️ Parciais":"❌ Incompletos"}
            </button>
          ))}
        </div>

        {/* Lista */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Carregando projetos...</div>
        )}

        {filtered.map((p: any) => {
          const conf = STATUS_CONF[p.conformityStatus] || STATUS_CONF.error;
          const isOpen = expanded === p.id;
          const failedChecks = Object.entries(p.checks || {}).filter(([,v]) => !v);
          const passedChecks = Object.entries(p.checks || {}).filter(([,v]) => v);

          return (
            <div key={p.id} style={{
              background: "white", border: `1.5px solid ${conf.border}`,
              borderLeft: `4px solid ${conf.color}`,
              borderRadius: 12, marginBottom: 10, overflow: "hidden",
            }}>
              {/* Linha principal */}
              <div style={{ padding: "14px 18px", cursor: "pointer", display: "flex",
                alignItems: "center", gap: 14 }}
                onClick={() => setExpanded(isOpen ? null : p.id)}>

                {/* Score */}
                <div style={{ width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                  background: conf.bg, border: `2px solid ${conf.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column" }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: conf.color }}>
                    {p.conformityScore}%
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px",
                      borderRadius: 999, background: conf.bg, color: conf.color }}>
                      {conf.label}
                    </span>
                    {p.metaConnected && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px",
                        borderRadius: 999, background: "#eff6ff", color: "#1d4ed8" }}>
                        📘 Meta conectado
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                    {p.userEmail} {p.companyName ? `· ${p.companyName}` : ""}
                    {p.niche ? ` · ${p.niche}` : ""}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                      {p.publishedCampaigns}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>publicadas</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800,
                      color: p.errorCampaigns > 0 ? "#dc2626" : "#94a3b8" }}>
                      {p.errorCampaigns}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>erros</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                      {p.totalCampaigns}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>campanhas</div>
                  </div>
                </div>

                <span style={{ color: "#94a3b8", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Detalhes expandidos */}
              {isOpen && (
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 18px",
                  background: "#fafafa" }}>

                  {/* Checks de conformidade */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                      CHECKLIST DE CONFORMIDADE
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 6 }}>
                      {Object.entries(p.checks || {}).map(([key, val]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 10px", borderRadius: 8,
                          background: val ? "#f0fdf4" : "#fef2f2",
                          border: `1px solid ${val ? "#bbf7d0" : "#fecaca"}` }}>
                          <span style={{ fontSize: 14 }}>{val ? "✅" : "❌"}</span>
                          <span style={{ fontSize: 12, fontWeight: 600,
                            color: val ? "#166534" : "#991b1b" }}>
                            {CHECK_LABELS[key] || key}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pendências */}
                  {failedChecks.length > 0 && (
                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a",
                      borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
                        ⚠️ Pendências ({failedChecks.length})
                      </div>
                      {failedChecks.map(([key]) => (
                        <div key={key} style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
                          → {CHECK_LABELS[key] || key}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dados adicionais */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    <div style={{ background: "white", border: "1px solid #e2e8f0",
                      borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>USUÁRIO</div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{p.userName || "—"}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{p.userEmail}</div>
                    </div>
                    <div style={{ background: "white", border: "1px solid #e2e8f0",
                      borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>WEBSITE</div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: p.websiteUrl ? "#16a34a" : "#dc2626" }}>
                        {p.websiteUrl || "❌ Não informado"}
                      </div>
                    </div>
                    <div style={{ background: "white", border: "1px solid #e2e8f0",
                      borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>ÚLTIMA PUBLICAÇÃO</div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                        {p.lastPublishedAt
                          ? new Date(p.lastPublishedAt).toLocaleDateString("pt-BR")
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
                    Projeto #{p.id} · Criado em {p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—"}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
            Nenhum projeto encontrado
          </div>
        )}
      </div>
    </Layout>
  );
}
