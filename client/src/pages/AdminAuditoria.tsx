/**
 * AdminAuditoria.tsx — Auditoria de campanhas
 * Classifica todas as campanhas em: ✅ OK | ⚠️ Parcial | ❌ Erro
 */
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const PLATFORM: Record<string, { label: string; icon: string; color: string }> = {
  meta:   { label: "Meta Ads",   icon: "📘", color: "#1877f2" },
  google: { label: "Google Ads",  icon: "🔵", color: "#1a73e8" },
  tiktok: { label: "TikTok Ads",  icon: "⬛", color: "#010101" },
};

const HEALTH: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ok:      { label: "Funcionando",  icon: "✅", color: "#059669", bg: "#f0fdf4" },
  partial: { label: "Parcial",      icon: "⚠️", color: "#d97706", bg: "#fffbeb" },
  error:   { label: "Com erro",     icon: "❌", color: "#dc2626", bg: "#fef2f2" },
};

export default function AdminAuditoria() {
  const { data, isLoading, refetch } =
    (trpc as any).admin?.auditCampaigns?.useQuery?.() ?? { data: null, isLoading: true };

  const R = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <Layout>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
              🔍 Auditoria de Campanhas
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Status em tempo real de todas as campanhas publicadas
            </p>
          </div>
          <button onClick={() => refetch?.()}
            style={{ padding: "9px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            🔄 Atualizar
          </button>
        </div>

        {/* KPIs */}
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total",       value: data.total,   color: "#0f172a", bg: "#f8fafc", border: "#e2e8f0" },
              { label: "✅ OK",        value: data.ok,      color: "#059669", bg: "#f0fdf4", border: "#bbf7d0" },
              { label: "⚠️ Parcial",   value: data.partial, color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
              { label: "❌ Com erro",  value: data.error,   color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
            ].map(k => (
              <div key={k.label} style={{ background: k.bg, border: `1.5px solid ${k.border}`, borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginTop: 3 }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Lista */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Carregando auditoria...</div>
        )}

        {data?.campaigns?.map((c: any) => {
          const plt = PLATFORM[c.platform] || { label: c.platform, icon: "📊", color: "#64748b" };
          const h   = HEALTH[c.health];
          return (
            <div key={c.id} style={{
              background: "#fff", border: `1.5px solid ${h.bg === "#fef2f2" ? "#fecaca" : h.bg === "#fffbeb" ? "#fde68a" : "#e2e8f0"}`,
              borderLeft: `4px solid ${h.color}`,
              borderRadius: 12, padding: "14px 18px", marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {/* Plataforma */}
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#f1f5f9", color: plt.color }}>
                  {plt.icon} {plt.label}
                </span>

                {/* Status de saúde */}
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: h.bg, color: h.color }}>
                  {h.icon} {h.label}
                </span>

                {/* Nome */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {c.userEmail} · publicada {c.publishedAt ? new Date(c.publishedAt).toLocaleDateString("pt-BR") : "—"}
                  </div>
                </div>

                {/* Gasto */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c.spendToday > 0 ? "#059669" : "#94a3b8" }}>
                    {R(c.spendToday)}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>gasto hoje</div>
                </div>
              </div>

              {/* Issues */}
              {c.issues?.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {c.issues.map((issue: string, i: number) => (
                    <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#64748b" }}>
                      {issue}
                    </span>
                  ))}
                </div>
              )}

              {/* Platform ID */}
              {c.platformId && (
                <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8" }}>
                  ID: {c.platformId}
                  {c.lastSyncAt && ` · sync ${new Date(c.lastSyncAt).toLocaleTimeString("pt-BR")}`}
                </div>
              )}
            </div>
          );
        })}

        {data?.campaigns?.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
            Nenhuma campanha publicada encontrada
          </div>
        )}

        {data && (
          <div style={{ marginTop: 16, fontSize: 11, color: "#94a3b8", textAlign: "right" }}>
            Gerado em {new Date(data.generatedAt).toLocaleTimeString("pt-BR")}
          </div>
        )}
      </div>
    </Layout>
  );
}
