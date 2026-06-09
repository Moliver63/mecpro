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

const PUB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  success: { label: "✅ Publicada",  color: "#059669", bg: "#f0fdf4" },
  error:   { label: "❌ Erro",       color: "#dc2626", bg: "#fef2f2" },
  draft:   { label: "📝 Rascunho",   color: "#64748b", bg: "#f8fafc" },
  pending: { label: "⏳ Pendente",   color: "#d97706", bg: "#fffbeb" },
};

// ── Painel de campanhas de um projeto ────────────────────────────────────────
function CampaignPanel({ projectId }: { projectId: number }) {
  const [openCampaign, setOpenCampaign] = useState<number | null>(null);
  const { data: campaigns, isLoading } =
    (trpc as any).admin?.campaignDetail?.useQuery?.({ projectId }) ?? { data: null, isLoading: true };

  if (isLoading) return (
    <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13 }}>Carregando campanhas...</div>
  );
  if (!campaigns?.length) return (
    <div style={{ padding: "16px 0", color: "#94a3b8", fontSize: 13 }}>Nenhuma campanha encontrada para este projeto.</div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10 }}>
        CAMPANHAS ({campaigns.length})
      </div>
      {campaigns.map((c: any) => {
        const ps  = PUB_STATUS[c.publishStatus] || PUB_STATUS.draft;
        const isOpen = openCampaign === c.id;
        return (
          <div key={c.id} style={{
            border: `1.5px solid ${c.hasError ? "#fecaca" : "#e2e8f0"}`,
            borderLeft: `3px solid ${c.hasError ? "#dc2626" : c.isPublished ? "#059669" : "#94a3b8"}`,
            borderRadius: 10, marginBottom: 8, overflow: "hidden",
          }}>
            {/* Cabeçalho da campanha */}
            <div style={{ padding: "12px 14px", cursor: "pointer", display: "flex",
              alignItems: "center", gap: 10, background: "white" }}
              onClick={() => setOpenCampaign(isOpen ? null : c.id)}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px",
                borderRadius: 999, background: ps.bg, color: ps.color }}>
                {ps.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                  {c.platform} · {c.objective}
                  {c.publishedAt ? ` · ${new Date(c.publishedAt).toLocaleDateString("pt-BR")}` : ""}
                  {c.metaCampaignId ? ` · ID: ${c.metaCampaignId}` : ""}
                </div>
              </div>
              {c.suggestedBudgetMonthly > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", flexShrink: 0 }}>
                  R${c.suggestedBudgetMonthly}/mês
                </span>
              )}
              <span style={{ color: "#94a3b8" }}>{isOpen ? "▲" : "▼"}</span>
            </div>

            {/* Erro de publicação */}
            {c.hasError && c.publishError && (
              <div style={{ padding: "8px 14px", background: "#fef2f2",
                borderTop: "1px solid #fecaca" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>
                  ❌ Erro de publicação
                </div>
                <div style={{ fontSize: 11, color: "#991b1b", fontFamily: "monospace",
                  whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {c.publishError}
                </div>
              </div>
            )}

            {/* Detalhes expandidos */}
            {isOpen && (
              <div style={{ borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>

                {/* Copies / Criativos */}
                {c.creatives?.length > 0 && (
                  <div style={{ padding: "14px 14px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                      📝 COPIES GERADAS ({c.creatives.length} criativos)
                    </div>
                    {c.creatives.map((cr: any, i: number) => (
                      <div key={i} style={{ background: "white", border: "1px solid #e2e8f0",
                        borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          {cr.funnelStage && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px",
                              borderRadius: 999, background: "#eff6ff", color: "#1d4ed8" }}>
                              {cr.funnelStage}
                            </span>
                          )}
                          {cr.format && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px",
                              borderRadius: 999, background: "#f0fdf4", color: "#166534" }}>
                              {cr.format}
                            </span>
                          )}
                          {cr.type && (
                            <span style={{ fontSize: 10, color: "#64748b" }}>{cr.type}</span>
                          )}
                        </div>
                        {cr.headline && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Título: </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{cr.headline}</span>
                          </div>
                        )}
                        {cr.copy && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: 2 }}>Copy:</span>
                            <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.6,
                              whiteSpace: "pre-wrap" }}>{cr.copy}</span>
                          </div>
                        )}
                        {cr.hook && (
                          <div style={{ marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>Hook: </span>
                            <span style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>{cr.hook}</span>
                          </div>
                        )}
                        {cr.cta && (
                          <div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>CTA: </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed" }}>{cr.cta}</span>
                          </div>
                        )}
                        {cr.complianceScore !== undefined && (
                          <div style={{ marginTop: 6, fontSize: 10, color: cr.complianceScore >= 80 ? "#059669" : "#d97706" }}>
                            Compliance score: {cr.complianceScore}/100
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* AdSets */}
                {c.adSets?.length > 0 && (
                  <div style={{ padding: "14px 14px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                      🎯 CONJUNTOS DE ANÚNCIOS ({c.adSets.length})
                    </div>
                    {c.adSets.map((s: any, i: number) => (
                      <div key={i} style={{ background: "white", border: "1px solid #e2e8f0",
                        borderRadius: 8, padding: "10px 14px", marginBottom: 6,
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{s.name || `Conjunto ${i + 1}`}</div>
                          {s.audience && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.audience}</div>}
                          {s.interests && <div style={{ fontSize: 11, color: "#64748b" }}>Interesses: {Array.isArray(s.interests) ? s.interests.join(", ") : s.interests}</div>}
                        </div>
                        {s.budget && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#059669",
                            flexShrink: 0, background: "#f0fdf4", padding: "2px 8px", borderRadius: 6 }}>
                            {s.budget}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* IDs Meta */}
                {(c.metaCampaignId || c.metaAdSetId || c.metaAdId) && (
                  <div style={{ padding: "12px 14px", margin: "12px 14px", background: "#eff6ff",
                    border: "1px solid #bfdbfe", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>
                      📘 IDs META ADS
                    </div>
                    {c.metaCampaignId && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#1e40af" }}>Campanha: {c.metaCampaignId}</div>}
                    {c.metaAdSetId    && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#1e40af" }}>AdSet: {c.metaAdSetId}</div>}
                    {c.metaAdId       && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#1e40af" }}>Ad: {c.metaAdId}</div>}
                    {c.metaCreativeId && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#1e40af" }}>Creative: {c.metaCreativeId}</div>}
                  </div>
                )}

                <div style={{ padding: "8px 14px 12px", fontSize: 11, color: "#94a3b8" }}>
                  Campanha #{c.id} · Gerada em {new Date(c.generatedAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function AdminProjects() {
  const { data: projects, isLoading, refetch } =
    (trpc as any).admin?.projectsAudit?.useQuery?.() ?? { data: null, isLoading: true };

  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState<"all"|"ok"|"partial"|"error">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [tab,      setTab]      = useState<"conformidade"|"campanhas">("conformidade");

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
              Projetos dos usuários — conformidade, copies e status de campanhas
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
            { label: "Total",       value: projects?.length ?? 0, color: "#0f172a", bg: "#f8fafc", border: "#e2e8f0", f: "all"     },
            { label: "✅ Conformes", value: counts.ok ?? 0,        color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", f: "ok"      },
            { label: "⚠️ Parciais",  value: counts.partial ?? 0,   color: "#d97706", bg: "#fffbeb", border: "#fde68a", f: "partial" },
            { label: "❌ Incompletos",value: counts.error ?? 0,    color: "#dc2626", bg: "#fef2f2", border: "#fecaca", f: "error"   },
          ].map(k => (
            <div key={k.label} onClick={() => setFilter(k.f as any)}
              style={{ background: filter === k.f ? k.bg : "white",
                border: `1.5px solid ${filter === k.f ? k.border : "#e2e8f0"}`,
                borderRadius: 12, padding: "14px 18px", cursor: "pointer", transition: "all .15s" }}>
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
        </div>

        {/* Lista */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Carregando projetos...</div>
        )}

        {filtered.map((p: any) => {
          const conf   = STATUS_CONF[p.conformityStatus] || STATUS_CONF.error;
          const isOpen = expanded === p.id;
          const failedChecks = Object.entries(p.checks || {}).filter(([, v]) => !v);

          return (
            <div key={p.id} style={{
              background: "white",
              border: `1.5px solid ${isOpen ? conf.border : "#e2e8f0"}`,
              borderLeft: `4px solid ${conf.color}`,
              borderRadius: 12, marginBottom: 10, overflow: "hidden",
            }}>
              {/* Linha principal */}
              <div style={{ padding: "14px 18px", cursor: "pointer", display: "flex",
                alignItems: "center", gap: 14 }}
                onClick={() => { setExpanded(isOpen ? null : p.id); setTab("conformidade"); }}>

                {/* Score */}
                <div style={{ width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                  background: conf.bg, border: `2px solid ${conf.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: conf.color }}>
                    {p.conformityScore}%
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{p.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px",
                      borderRadius: 999, background: conf.bg, color: conf.color }}>
                      {conf.label}
                    </span>
                    {p.metaConnected && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px",
                        borderRadius: 999, background: "#eff6ff", color: "#1d4ed8" }}>
                        📘 Meta
                      </span>
                    )}
                    {p.errorCampaigns > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px",
                        borderRadius: 999, background: "#fef2f2", color: "#dc2626" }}>
                        ❌ {p.errorCampaigns} erro{p.errorCampaigns > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                    {p.userEmail}{p.companyName ? ` · ${p.companyName}` : ""}{p.niche ? ` · ${p.niche}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                  {[
                    { v: p.publishedCampaigns, label: "publicadas", color: p.publishedCampaigns > 0 ? "#059669" : "#94a3b8" },
                    { v: p.totalCampaigns,     label: "total",      color: "#0f172a" },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.v}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <span style={{ color: "#94a3b8", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Painel expandido */}
              {isOpen && (
                <div style={{ borderTop: "1px solid #f1f5f9" }}>
                  {/* Tabs */}
                  <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0",
                    background: "#f8fafc" }}>
                    {(["conformidade", "campanhas"] as const).map(t => (
                      <button key={t} onClick={() => setTab(t)}
                        style={{ padding: "10px 20px", fontSize: 12, fontWeight: 700,
                          cursor: "pointer", border: "none", outline: "none",
                          borderBottom: tab === t ? "2px solid #16a34a" : "2px solid transparent",
                          background: "transparent",
                          color: tab === t ? "#16a34a" : "#64748b" }}>
                        {t === "conformidade" ? "✅ Conformidade" : `📋 Campanhas (${p.totalCampaigns})`}
                      </button>
                    ))}
                  </div>

                  <div style={{ padding: "16px 18px", background: "#fafafa" }}>
                    {/* Tab Conformidade */}
                    {tab === "conformidade" && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 6, marginBottom: 14 }}>
                          {Object.entries(p.checks || {}).map(([key, val]) => (
                            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8,
                              padding: "6px 10px", borderRadius: 8,
                              background: val ? "#f0fdf4" : "#fef2f2",
                              border: `1px solid ${val ? "#bbf7d0" : "#fecaca"}` }}>
                              <span>{val ? "✅" : "❌"}</span>
                              <span style={{ fontSize: 12, fontWeight: 600,
                                color: val ? "#166534" : "#991b1b" }}>
                                {CHECK_LABELS[key] || key}
                              </span>
                            </div>
                          ))}
                        </div>

                        {failedChecks.length > 0 && (
                          <div style={{ background: "#fffbeb", border: "1px solid #fde68a",
                            borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
                              ⚠️ Pendências
                            </div>
                            {failedChecks.map(([key]) => (
                              <div key={key} style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
                                → {CHECK_LABELS[key] || key}
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                          {[
                            { label: "Usuário",  value: p.userName || p.userEmail },
                            { label: "Website",  value: p.websiteUrl || "❌ Não informado", color: p.websiteUrl ? "#16a34a" : "#dc2626" },
                            { label: "Última publicação", value: p.lastPublishedAt ? new Date(p.lastPublishedAt).toLocaleDateString("pt-BR") : "—" },
                          ].map(d => (
                            <div key={d.label} style={{ background: "white", border: "1px solid #e2e8f0",
                              borderRadius: 8, padding: "10px 14px" }}>
                              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{d.label.toUpperCase()}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2,
                                color: (d as any).color || "#0f172a", wordBreak: "break-all" }}>
                                {d.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Tab Campanhas */}
                    {tab === "campanhas" && <CampaignPanel projectId={p.id} />}
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
