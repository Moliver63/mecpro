import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import LiveAdPreviewModal from "@/components/LiveAdPreviewModal";
import BulkActionBar from "@/components/BulkActionBar";

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

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div style={{ width: "min(900px, 100%)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 20, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(15,23,42,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", padding: 20, borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{title}</h2>
            {subtitle && <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{subtitle}</p>}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

export default function TikTokCampaigns() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [campaigns, setCampaigns] = useState<TikTokCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<TikTokCampaign | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBudget, setEditBudget] = useState(0);
  const [editStatus, setEditStatus] = useState<"ENABLE" | "DISABLE" | "DELETE">("DISABLE");

  const bulkMutation = (trpc as any).tiktokBulk?.bulkAction?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success(`✅ ${data.total - data.failed} campanha(s) atualizadas${data.failed > 0 ? ` (${data.failed} falhou)` : ""}`);
      setBulkIds([]);
      load();
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutateAsync: async () => {} };

  const listMutation = trpc.tiktokCampaigns.list.useMutation({
    onSuccess: (data: any) => setCampaigns(data.campaigns || []),
    onError: (e) => toast.error(e.message),
  });
  const statusMutation = trpc.tiktokCampaigns.updateStatus.useMutation();
  const renameMutation = trpc.tiktokCampaigns.rename.useMutation();
  const budgetMutation = trpc.tiktokCampaigns.updateBudget.useMutation();

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

  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const openDetails = (campaign: TikTokCampaign) => {
    setSelectedCampaign(campaign);
    setDetailsOpen(true);
  };

  const openEdit = (campaign: TikTokCampaign) => {
    setSelectedCampaign(campaign);
    setEditName(campaign.name);
    setEditBudget(Math.max(1, Number(campaign.budget || 1)));
    const normalized = String(campaign.status || "").toUpperCase();
    setEditStatus((normalized.includes("DELETE") ? "DELETE" : normalized.includes("ENABLE") ? "ENABLE" : "DISABLE") as any);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!selectedCampaign) return;
    try {
      const tasks: Promise<any>[] = [];
      const trimmedName = editName.trim();
      const budgetValue = Number(editBudget);
      if (trimmedName && trimmedName !== selectedCampaign.name) {
        tasks.push(renameMutation.mutateAsync({ campaignId: selectedCampaign.id, name: trimmedName }));
      }
      if (Number.isFinite(budgetValue) && budgetValue > 0 && Math.abs(budgetValue - Number(selectedCampaign.budget || 0)) > 0.0001) {
        tasks.push(budgetMutation.mutateAsync({ campaignId: selectedCampaign.id, budget: budgetValue }));
      }
      const currentStatus = String(selectedCampaign.status || "").toUpperCase();
      if ((editStatus === "ENABLE" && !currentStatus.includes("ENABLE")) || (editStatus === "DISABLE" && !currentStatus.includes("DISABLE")) || (editStatus === "DELETE" && !currentStatus.includes("DELETE"))) {
        if (editStatus === "DELETE" && !window.confirm(`Remover a campanha "${selectedCampaign.name}" no TikTok Ads?`)) return;
        tasks.push(statusMutation.mutateAsync({ campaignId: selectedCampaign.id, status: editStatus }));
      }
      if (tasks.length === 0) {
        toast.info("Nenhuma alteração para salvar");
        setEditOpen(false);
        return;
      }
      await Promise.all(tasks);
      toast.success("Campanha TikTok atualizada");
      setEditOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar campanha TikTok");
    }
  };

  const busy = listMutation.isPending || statusMutation.isPending || renameMutation.isPending || budgetMutation.isPending;

  return (
    <Layout>
      <div className="page-shell" style={{ padding: 24, maxWidth: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>🎵 TikTok Ads</h1>
            <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>Detalhes e edição básica de campanhas já disponíveis no MECPro.</p>
          </div>
          <button className="btn btn-primary" onClick={load} disabled={listMutation.isPending}>Atualizar</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
          <MetricCard label="Campanhas" value={String(filtered.length)} />
          <MetricCard label="Gasto" value={R(totals.spend)} />
          <MetricCard label="Cliques" value={N(totals.clicks)} />
          <MetricCard label="CTR médio" value={P(avgCtr)} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou ID"
            style={{ flex: 2, minWidth: 240, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }} />
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
              <div key={c.id} style={{ background: "#fff", border: `2px solid ${bulkIds.includes(c.id) ? "#ff0050" : "var(--border)"}`, borderRadius: 18, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,.04)", transition: "border-color .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input type="checkbox" checked={bulkIds.includes(c.id)} onChange={() => setBulkIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                        style={{ width: 17, height: 17, cursor: "pointer", accentColor: "#ff0050", flexShrink: 0 }} />
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{c.name}</h3>
                      <span style={{ background: s.bg, color: s.color, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{s.label}</span>
                      <span style={{ background: "#f3f4f6", color: "#111827", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{c.objective || "TRAFFIC"}</span>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 13 }}>ID {c.id} • Criada em {c.createTime ? new Date(c.createTime).toLocaleDateString("pt-BR") : "—"} • Orçamento {R(c.budget)}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openDetails(c)}>Detalhes</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(c)}>Editar</button>
                    <button className="btn btn-sm" style={{ background: "linear-gradient(135deg,#ff0050,#010101)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }} onClick={() => { setSelectedCampaign(c); setPreviewOpen(true); }}>👁️ Preview</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => statusMutation.mutate({ campaignId: c.id, status: String(c.status || "").toUpperCase().includes("ENABLE") ? "DISABLE" : "ENABLE" as any }, { onSuccess: () => { toast.success("Status atualizado no TikTok Ads"); load(); }, onError: (e) => toast.error(e.message) })}>{String(c.status || "").toUpperCase().includes("ENABLE") ? "Pausar" : "Ativar"}</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10, marginTop: 16 }}>
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

      {detailsOpen && selectedCampaign && (
        <ModalShell title="Detalhes da campanha TikTok" subtitle={`${selectedCampaign.name} • ID ${selectedCampaign.id}`} onClose={() => setDetailsOpen(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
            <MetricCard label="Status" value={statusBadge(selectedCampaign.status).label} />
            <MetricCard label="Orçamento" value={R(selectedCampaign.budget)} />
            <MetricCard label="Cliques" value={N(selectedCampaign.metrics?.clicks)} />
            <MetricCard label="CTR" value={P(selectedCampaign.metrics?.ctr)} />
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "#f8fafc" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Objetivo</div>
              <div style={{ marginTop: 4, fontWeight: 800 }}>{selectedCampaign.objective || "TRAFFIC"}</div>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "#f8fafc" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Modo de orçamento</div>
              <div style={{ marginTop: 4, fontWeight: 800 }}>{selectedCampaign.budgetMode || "—"}</div>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "#fff" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Resumo de performance</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginTop: 12 }}>
                <div><strong>Impressões:</strong> {N(selectedCampaign.metrics?.impressions)}</div>
                <div><strong>Cliques:</strong> {N(selectedCampaign.metrics?.clicks)}</div>
                <div><strong>CPC:</strong> {R(selectedCampaign.metrics?.cpc)}</div>
                <div><strong>CPM:</strong> {R(selectedCampaign.metrics?.cpm)}</div>
                <div><strong>CTR:</strong> {P(selectedCampaign.metrics?.ctr)}</div>
                <div><strong>Gasto:</strong> {R(selectedCampaign.metrics?.spend)}</div>
              </div>
            </div>
            <div style={{ background: "#fdf2f8", color: "#9d174d", padding: 14, borderRadius: 14, fontSize: 13 }}>
              Próxima etapa sugerida: ampliar a edição de criativos para trocar imagem/vídeo diretamente no TikTok Ads.
            </div>
          </div>
        </ModalShell>
      )}

      {editOpen && selectedCampaign && (
        <ModalShell title="Editar campanha TikTok" subtitle="Nome, status e orçamento" onClose={() => setEditOpen(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Nome da campanha</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Status</span>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as any)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }}>
                  <option value="ENABLE">Ativa</option>
                  <option value="DISABLE">Pausada</option>
                  <option value="DELETE">Removida</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Orçamento (R$)</span>
                <input type="number" min={1} step="0.01" value={editBudget} onChange={(e) => setEditBudget(Number(e.target.value))} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }} />
              </label>
            </div>
            <div style={{ background: "#ecfeff", color: "#155e75", padding: 14, borderRadius: 14, fontSize: 13 }}>
              Edição básica aplicada agora. Troca de criativos, imagem e vídeo pode ser adicionada na próxima etapa sem mexer neste fluxo base.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={busy}>Salvar alterações</button>
            </div>
          </div>
        </ModalShell>
      )}

      {previewOpen && selectedCampaign && (
        <LiveAdPreviewModal
          platform="tiktok"
          campaignId={selectedCampaign.id}
          campaignName={selectedCampaign.name}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <BulkActionBar
        platform="tiktok"
        selectedCount={bulkIds.length}
        totalCount={filtered.length}
        onSelectAll={() => setBulkIds(filtered.map(c => c.id))}
        onClearAll={() => setBulkIds([])}
        onPause={async () => {
          if (!window.confirm(`Pausar ${bulkIds.length} campanha(s) no TikTok Ads?`)) return;
          setBulkLoading(true);
          try { await (bulkMutation as any).mutateAsync({ campaignIds: bulkIds, action: "PAUSE" }); }
          finally { setBulkLoading(false); }
        }}
        onDelete={async () => {
          if (!window.confirm(`Excluir ${bulkIds.length} campanha(s) no TikTok Ads? Esta ação não pode ser desfeita.`)) return;
          setBulkLoading(true);
          try { await (bulkMutation as any).mutateAsync({ campaignIds: bulkIds, action: "DELETE" }); }
          finally { setBulkLoading(false); }
        }}
        loading={bulkLoading}
      />
    </Layout>
  );
}
