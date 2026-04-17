import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import LiveAdPreviewModal from "@/components/LiveAdPreviewModal";
import BulkActionBar from "@/components/BulkActionBar";

type GoogleCampaign = {
  id: string;
  name: string;
  status: string;
  channelType?: string;
  startDate?: string | null;
  endDate?: string | null;
  budgetMicros?: number;
  metrics?: {
    impressions?: number;
    clicks?: number;
    costMicros?: number;
    averageCpc?: number;
    averageCpm?: number;
    ctr?: number;
  };
};

type GoogleCampaignDetails = {
  adGroups?: any[];
  ads?: any[];
};

const R = (v?: number) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const N = (v?: number) => Number(v || 0).toLocaleString("pt-BR");
const P = (v?: number) => `${Number(v || 0).toFixed(2)}%`;

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ENABLED: { bg: "#dcfce7", color: "#166534", label: "Ativa" },
    PAUSED: { bg: "#fef3c7", color: "#92400e", label: "Pausada" },
    REMOVED: { bg: "#fee2e2", color: "#991b1b", label: "Removida" },
  };
  return map[status] || { bg: "#e2e8f0", color: "#334155", label: status || "—" };
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
      <div style={{ width: "min(960px, 100%)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 20, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(15,23,42,.18)" }}>
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

export default function GoogleCampaigns() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [campaigns, setCampaigns] = useState<GoogleCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<GoogleCampaign | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<GoogleCampaignDetails | null>(null);
  const [editName, setEditName] = useState("");
  const [editBudget, setEditBudget] = useState(0);
  const [editStatus, setEditStatus] = useState<"ENABLED" | "PAUSED" | "REMOVED">("PAUSED");

  const bulkMutation = (trpc as any).googleCampaigns.bulkAction.useMutation({
    onSuccess: (data: any) => {
      toast.success(`✅ ${data.total - data.failed} campanha(s) atualizadas${data.failed > 0 ? ` (${data.failed} falhou)` : ""}`);
      setSelectedIds([]);
      load();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const listMutation = trpc.googleCampaigns.list.useMutation({
    onSuccess: (data: any) => setCampaigns(data.campaigns || []),
    onError: (e) => toast.error(e.message),
  });
  const detailsMutation = trpc.googleCampaigns.details.useMutation({
    onSuccess: (data: any) => setDetailsData(data || { adGroups: [], ads: [] }),
    onError: (e) => toast.error(e.message),
  });
  const statusMutation = trpc.googleCampaigns.updateStatus.useMutation();
  const renameMutation = trpc.googleCampaigns.rename.useMutation();
  const budgetMutation = trpc.googleCampaigns.updateBudget.useMutation();

  const load = () => listMutation.mutate({ period });
  useEffect(() => { load(); }, [period]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleBulk(action: "PAUSE" | "DELETE") {
    if (selectedIds.length === 0) return;
    const verb = action === "PAUSE" ? "pausar" : "excluir";
    if (!window.confirm(`Deseja ${verb} ${selectedIds.length} campanha(s) no Google Ads?`)) return;
    setBulkLoading(true);
    try { await (bulkMutation as any).mutateAsync({ campaignIds: selectedIds, action }); }
    finally { setBulkLoading(false); }
  }

  const filtered = useMemo(() => campaigns.filter((c) => {
    const byText = !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search.trim());
    const byStatus = status === "all" || c.status === status;
    return byText && byStatus;
  }), [campaigns, search, status]);

  const totals = useMemo(() => filtered.reduce((acc, c) => {
    acc.spend += Number(c.metrics?.costMicros || 0) / 1_000_000;
    acc.clicks += Number(c.metrics?.clicks || 0);
    acc.impressions += Number(c.metrics?.impressions || 0);
    return acc;
  }, { spend: 0, clicks: 0, impressions: 0 }), [filtered]);

  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const openDetails = (campaign: GoogleCampaign) => {
    setSelectedCampaign(campaign);
    setDetailsData(null);
    setDetailsOpen(true);
    detailsMutation.mutate({ campaignId: campaign.id, period });
  };

  const openEdit = (campaign: GoogleCampaign) => {
    setSelectedCampaign(campaign);
    setEditName(campaign.name);
    setEditBudget(Math.max(1, Number(campaign.budgetMicros || 0) / 1_000_000 || 1));
    setEditStatus((["ENABLED", "PAUSED", "REMOVED"].includes(campaign.status) ? campaign.status : "PAUSED") as any);
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
      if (Number.isFinite(budgetValue) && budgetValue > 0) {
        const currentBudget = Number(selectedCampaign.budgetMicros || 0) / 1_000_000;
        if (Math.abs(budgetValue - currentBudget) > 0.0001) {
          tasks.push(budgetMutation.mutateAsync({ campaignId: selectedCampaign.id, dailyBudget: budgetValue }));
        }
      }
      if (editStatus !== selectedCampaign.status) {
        if (editStatus === "REMOVED" && !window.confirm(`Remover a campanha "${selectedCampaign.name}" no Google Ads?`)) return;
        tasks.push(statusMutation.mutateAsync({ campaignId: selectedCampaign.id, status: editStatus }));
      }
      if (tasks.length === 0) {
        toast.info("Nenhuma alteração para salvar");
        setEditOpen(false);
        return;
      }
      await Promise.all(tasks);
      toast.success("Campanha Google atualizada");
      setEditOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar campanha Google");
    }
  };

  const busy = listMutation.isPending || detailsMutation.isPending || statusMutation.isPending || renameMutation.isPending || budgetMutation.isPending;

  return (
    <Layout>
      <div className="page-shell" style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>🔵 Google Ads</h1>
            <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>Agora com detalhes da campanha.</p>
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
            <option value="ENABLED">Ativas</option>
            <option value="PAUSED">Pausadas</option>
            <option value="REMOVED">Removidas</option>
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
            const spend = Number(c.metrics?.costMicros || 0) / 1_000_000;
            return (
              <div key={c.id} style={{ background: "#fff", border: `2px solid ${selectedIds.includes(c.id) ? "#4285f4" : "var(--border)"}`, borderRadius: 18, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,.04)", transition: "border-color .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)}
                        style={{ width: 17, height: 17, cursor: "pointer", accentColor: "#4285f4", flexShrink: 0 }} />
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{c.name}</h3>
                      <span style={{ background: s.bg, color: s.color, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{s.label}</span>
                      <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{c.channelType || "SEARCH"}</span>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 13 }}>ID {c.id} • Início {c.startDate || "—"} • Fim {c.endDate || "—"} • Orçamento {R(Number(c.budgetMicros || 0) / 1_000_000)}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openDetails(c)}>Detalhes</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(c)}>Editar</button>
                    <button className="btn btn-sm" style={{ background: "linear-gradient(135deg,#4285f4,#34a853)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }} onClick={() => { setSelectedCampaign(c); setPreviewOpen(true); }}>👁️ Preview</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => statusMutation.mutate({ campaignId: c.id, status: c.status === "ENABLED" ? "PAUSED" : "ENABLED" as any }, { onSuccess: () => { toast.success("Status atualizado no Google Ads"); load(); }, onError: (e) => toast.error(e.message) })}>{c.status === "ENABLED" ? "Pausar" : "Ativar"}</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10, marginTop: 16 }}>
                  {[
                    ["Gasto", R(spend)],
                    ["Impressões", N(c.metrics?.impressions)],
                    ["Cliques", N(c.metrics?.clicks)],
                    ["CPC", R(Number(c.metrics?.averageCpc || 0) / 1_000_000)],
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
              Nenhuma campanha Google encontrada para os filtros atuais.
            </div>
          )}
        </div>
      </div>

      {detailsOpen && selectedCampaign && (
        <ModalShell title="Detalhes da campanha Google" subtitle={`${selectedCampaign.name} • ID ${selectedCampaign.id}`} onClose={() => setDetailsOpen(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
            <MetricCard label="Status" value={statusBadge(selectedCampaign.status).label} />
            <MetricCard label="Orçamento" value={R(Number(selectedCampaign.budgetMicros || 0) / 1_000_000)} />
            <MetricCard label="Cliques" value={N(selectedCampaign.metrics?.clicks)} />
            <MetricCard label="CTR" value={P(selectedCampaign.metrics?.ctr)} />
          </div>

          {detailsMutation.isPending && <p style={{ color: "var(--muted)" }}>Carregando ad groups e anúncios…</p>}

          {!detailsMutation.isPending && (
            <div style={{ display: "grid", gap: 18 }}>
              <section>
                <h3 style={{ marginTop: 0 }}>Ad groups</h3>
                <div style={{ display: "grid", gap: 10 }}>
                  {(detailsData?.adGroups || []).map((row: any, idx: number) => {
                    const adGroup = row.adGroup || row.ad_group || {};
                    const metrics = row.metrics || {};
                    return (
                      <div key={`${adGroup.id || idx}`} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "#f8fafc" }}>
                        <div style={{ fontWeight: 800 }}>{adGroup.name || `Ad Group ${idx + 1}`}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>ID {adGroup.id || "—"} • Status {adGroup.status || "—"}</div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 13 }}>
                          <span>Impr. {N(metrics.impressions)}</span>
                          <span>Cliques {N(metrics.clicks)}</span>
                          <span>CTR {P(metrics.ctr)}</span>
                          <span>Gasto {R(Number(metrics.costMicros ?? metrics.cost_micros ?? 0) / 1_000_000)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!(detailsData?.adGroups || []).length && <p style={{ color: "var(--muted)" }}>Nenhum ad group retornado para esta campanha.</p>}
                </div>
              </section>

              <section>
                <h3 style={{ marginTop: 0 }}>Anúncios</h3>
                <div style={{ display: "grid", gap: 10 }}>
                  {(detailsData?.ads || []).map((row: any, idx: number) => {
                    const adGroupAd = row.adGroupAd || row.ad_group_ad || {};
                    const ad = adGroupAd.ad || {};
                    const rsa = ad.responsiveSearchAd || ad.responsive_search_ad || {};
                    const headlines = (rsa.headlines || []).map((h: any) => h.text).filter(Boolean);
                    const descriptions = (rsa.descriptions || []).map((d: any) => d.text).filter(Boolean);
                    const finalUrls = ad.finalUrls || ad.final_urls || [];
                    return (
                      <div key={`${ad.id || idx}`} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "#fff" }}>
                        <div style={{ fontWeight: 800 }}>Anúncio {ad.id || idx + 1}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>Status {adGroupAd.status || "—"}</div>
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Headlines</div>
                          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>{headlines.length ? headlines.map((text: string) => <span key={text} style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{text}</span>) : <span style={{ color: "var(--muted)" }}>—</span>}</div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Descrições</div>
                          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{descriptions.length ? descriptions.map((text: string) => <li key={text}>{text}</li>) : <li>—</li>}</ul>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 13 }}><strong>URL final:</strong> {finalUrls[0] || "—"}</div>
                      </div>
                    );
                  })}
                  {!(detailsData?.ads || []).length && <p style={{ color: "var(--muted)" }}>Nenhum anúncio retornado para esta campanha.</p>}
                </div>
              </section>
            </div>
          )}
        </ModalShell>
      )}

      {editOpen && selectedCampaign && (
        <ModalShell title="Editar campanha Google" subtitle="Nome, status e orçamento diário" onClose={() => setEditOpen(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Nome da campanha</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Status</span>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as any)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }}>
                  <option value="ENABLED">Ativa</option>
                  <option value="PAUSED">Pausada</option>
                  <option value="REMOVED">Removida</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Orçamento diário (R$)</span>
                <input type="number" min={1} step="0.01" value={editBudget} onChange={(e) => setEditBudget(Number(e.target.value))} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff" }} />
              </label>
            </div>
            <div style={{ background: "#eff6ff", color: "#1d4ed8", padding: 14, borderRadius: 14, fontSize: 13 }}>
              Edição básica disponível agora: nome, status e orçamento. Edição de criativos/keywords pode ser adicionada na próxima etapa.
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
          platform="google"
          campaignId={selectedCampaign.id}
          campaignName={selectedCampaign.name}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <BulkActionBar
        platform="google"
        selectedCount={selectedIds.length}
        totalCount={filtered.length}
        onSelectAll={() => setSelectedIds(filtered.map(c => c.id))}
        onClearAll={() => setSelectedIds([])}
        onPause={() => handleBulk("PAUSE")}
        onDelete={() => handleBulk("DELETE")}
        loading={bulkLoading}
      />
    </Layout>
  );
}
