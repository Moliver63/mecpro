import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";


type TikTokCampaign = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  budget?: number;
  budgetMode?: string | null;
  createTime?: string | null;
  metrics?: {
    spend?: number;
    impressions?: number;
    clicks?: number;
    cpc?: number;
    cpm?: number;
    ctr?: number;
  };
};

const R = (v?: number) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const N = (v?: number) => Number(v || 0).toLocaleString("pt-BR");
const P = (v?: number) => `${Number(v || 0).toFixed(2)}%`;

function statusBadge(status: string) {
  const key = String(status || "").toUpperCase();
  if (key.includes("ENABLE")) return { bg: "#dcfce7", color: "#166534", label: "Ativa" };
  if (key.includes("DISABLE")) return { bg: "#fef3c7", color: "#92400e", label: "Pausada" };
  if (key.includes("DELETE")) return { bg: "#fee2e2", color: "#991b1b", label: "Removida" };
  return { bg: "#e2e8f0", color: "#334155", label: status || "—" };
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 16, minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default function TikTokCampaigns() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [campaigns, setCampaigns] = useState<TikTokCampaign[]>([]);

  const listMutation = trpc.tiktokCampaigns.list.useMutation({
    onSuccess: (data: any) => setCampaigns(data.campaigns || []),
    onError: (e) => toast.error(e.message),
  });
  const statusMutation = trpc.tiktokCampaigns.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado no TikTok Ads"); load(); },
    onError: (e) => toast.error(e.message),
  });
  const renameMutation = trpc.tiktokCampaigns.rename.useMutation({
    onSuccess: () => { toast.success("Nome atualizado"); load(); },
    onError: (e) => toast.error(e.message),
  });
  const budgetMutation = trpc.tiktokCampaigns.updateBudget.useMutation({
    onSuccess: () => { toast.success("Orçamento atualizado"); load(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.tiktokCampaigns.updateStatus.useMutation({
    onSuccess: () => { toast.success("Campanha removida"); load(); },
    onError: (e) => toast.error(e.message),
  });

  const load = () => listMutation.mutate({ period });
  useEffect(() => { load(); }, [period]);

  const filtered = useMemo(() => campaigns.filter((c) => {
    const byText = !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search.trim());
    const normalized = String(c.status || "").toUpperCase();
    const byStatus = status === "all"
      || (status === "ENABLE" && normalized.includes("ENABLE"))
      || (status === "DISABLE" && normalized.includes("DISABLE"))
      || (status === "DELETE" && normalized.includes("DELETE"));
    return byText && byStatus;
  }), [campaigns, search, status]);

  const totals = useMemo(() => filtered.reduce((acc, c) => {
    acc.spend += Number(c.metrics?.spend || 0);
    acc.clicks += Number(c.metrics?.clicks || 0);
    acc.impressions += Number(c.metrics?.impressions || 0);
    return acc;
  }, { spend: 0, clicks: 0, impressions: 0 }), [filtered]);

  const avgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  return (
    <Layout>
      <div className="page-shell" style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>🎵 TikTok Ads</h1>
            <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>Gerencie campanhas TikTok, nome, orçamento e publicação em um só lugar.</p>
          </div>
          <button className="btn btn-primary" onClick={load} disabled={listMutation.isPending}>Atualizar</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
          <MetricCard label="Campanhas" value={String(filtered.length)} />
          <MetricCard label="Gasto" value={R(totals.spend)} />
          <MetricCard label="Cliques" value={N(totals.clicks)} />
          <MetricCard label="CTR médio" value={P(avgCtr)} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou ID"
            style={{ flex: 2, minWidth: 240, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }}>
            <option value="all">Todos os status</option>
            <option value="ENABLE">Ativas</option>
            <option value="DISABLE">Pausadas</option>
            <option value="DELETE">Removidas</option>
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value as any)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }}>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="90d">90 dias</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {filtered.map((c) => {
            const s = statusBadge(c.status);
            return (
              <div key={c.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 18, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{c.name}</h3>
                      <span style={{ background: s.bg, color: s.color, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{s.label}</span>
                      <span style={{ background: "#f3f4f6", color: "#111827", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{c.objective || "TRAFFIC"}</span>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 13 }}>ID {c.id} • Criada em {c.createTime ? new Date(c.createTime).toLocaleDateString("pt-BR") : "—"} • Orçamento {R(c.budget)}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => {
                      const next = String(c.status || "").toUpperCase().includes("ENABLE") ? "DISABLE" : "ENABLE";
                      statusMutation.mutate({ campaignId: c.id, status: next as any });
                    }}>{String(c.status || "").toUpperCase().includes("ENABLE") ? "Pausar" : "Ativar"}</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => {
                      const name = window.prompt("Novo nome da campanha", c.name);
                      if (name && name.trim() && name.trim() !== c.name) renameMutation.mutate({ campaignId: c.id, name: name.trim() });
                    }}>Renomear</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => {
                      const raw = window.prompt("Novo orçamento da campanha em R$", String(Math.max(1, Math.round(Number(c.budget || 1)))));
                      if (!raw) return;
                      const value = Number(String(raw).replace(",", "."));
                      if (!Number.isFinite(value) || value <= 0) return toast.error("Informe um orçamento válido");
                      budgetMutation.mutate({ campaignId: c.id, budget: value });
                    }}>Orçamento</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: "#b91c1c" }} onClick={() => {
                      if (!window.confirm(`Remover a campanha "${c.name}" no TikTok Ads?`)) return;
                      deleteMutation.mutate({ campaignId: c.id, status: "DELETE" as any });
                    }}>Remover</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10, marginTop: 16 }}>
                  {[
                    ["Gasto", R(c.metrics?.spend)],
                    ["Impressões", N(c.metrics?.impressions)],
                    ["Cliques", N(c.metrics?.clicks)],
                    ["CPC", R(c.metrics?.cpc)],
                    ["CTR", P(c.metrics?.ctr)],
                  ].map(([label, value]) => (
                    <div key={String(label)} style={{ background: "#f8fafc", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{label}</div>
                      <div style={{ marginTop: 4, fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {!listMutation.isPending && filtered.length === 0 && (
            <div style={{ background: "#fff", border: "1px dashed var(--border)", borderRadius: 18, padding: 32, textAlign: "center", color: "var(--muted)" }}>
              Nenhuma campanha TikTok encontrada para os filtros atuais.
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
