/**
 * BudgetDistribution.tsx — Rateio Inteligente Multi-Plataforma
 */
import { useState, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PLATFORM: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  meta:    { label: "Meta Ads",   icon: "📘", color: "#1877f2", bg: "#eff6ff" },
  google:  { label: "Google Ads", icon: "🔵", color: "#1a73e8", bg: "#f0f9ff" },
  tiktok:  { label: "TikTok Ads", icon: "⬛", color: "#010101", bg: "#f8f8f8" },
};

const METRIC: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: "📱", color: "#25d366" },
  leads:    { label: "Leads",    icon: "📋", color: "#1a73e8" },
  roas:     { label: "ROAS",     icon: "💰", color: "#059669" },
  ctr:      { label: "CTR",      icon: "📈", color: "#7c3aed" },
};

interface Campaign {
  platform: "meta" | "google" | "tiktok";
  id: string; name: string; spend: number; clicks: number; ctr: number;
  metric: string; metricValue: number; score: number;
  waClicks: number; leads: number; allocation: number; isManual: boolean;
  currentBudget?: number; budgetResourceName?: string;
  hasData?: boolean;
}

function distribute(campaigns: Campaign[], total: number, overrides: Record<string, number>): Campaign[] {
  const totalOverride = Object.values(overrides).reduce((s, v) => s + v, 0);
  const remaining     = Math.max(0, total - totalOverride);
  const free          = campaigns.filter(c => overrides[`${c.platform}_${c.id}`] === undefined);
  const totalExp      = free.reduce((s, c) => s + Math.pow(c.score || 0.001, 1.5), 0);
  return campaigns.map(c => {
    const key = `${c.platform}_${c.id}`;
    if (overrides[key] !== undefined) return { ...c, allocation: overrides[key], isManual: true };
    const exp  = Math.pow(c.score || 0.001, 1.5);
    const alloc = totalExp > 0 ? (exp / totalExp) * remaining : remaining / Math.max(free.length, 1);
    return { ...c, allocation: +alloc.toFixed(2), isManual: false };
  });
}

export default function BudgetDistribution() {
  const [period,    setPeriod]    = useState<"7d"|"30d"|"90d">("30d");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [amount,    setAmount]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [applying,  setApplying]  = useState(false);
  const [result,    setResult]    = useState<any>(null);
  const [errors,    setErrors]    = useState<string[]>([]);
  const [done,      setDone]      = useState(false);
  const [excluded,  setExcluded]  = useState<Set<string>>(new Set());
  const [editing,   setEditing]   = useState<string | null>(null);

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;

  const { data: balance, refetch: refetchBalance } =
    (trpc as any).mediaBudget?.getBalance?.useQuery?.() ?? { data: null, refetch: () => {} };

  const { data: platforms, isLoading: loadingPlatforms } =
    (trpc as any).mediaBudget?.platformBalances?.useQuery?.() ?? { data: null, isLoading: false };

  useEffect(() => {
    if (balance?.balance > 0 && !amount) setAmount(balance.balance.toFixed(2));
  }, [balance]);

  const visibleCamps = campaigns.filter(c => !excluded.has(`${c.platform}_${c.id}`));
  const distributed  = parsedAmount > 0 && visibleCamps.length > 0
    ? distribute(visibleCamps, parsedAmount, overrides) : visibleCamps;
  const totalAllocated = distributed.reduce((s, c) => s + c.allocation, 0);

  const fetchMut = (trpc as any).mediaBudget?.allPlatformCampaigns?.useMutation?.({
    onSuccess: (data: any) => {
      setCampaigns(data.campaigns || []);
      setErrors(data.errors || []);
      setOverrides({});
      setLoading(false);
      setDone(false);
      if (!data.campaigns.length) toast.error("Nenhuma campanha com dados encontrada — tente outro período");
      else toast.success(`${data.campaigns.length} campanha(s) carregada(s)`);
    },
    onError: (e: any) => { setLoading(false); toast.error(e.message); },
  }) ?? { mutate: () => {} };

  const applyMut = (trpc as any).mediaBudget?.applyDistribution?.useMutation?.({
    onSuccess: (data: any) => {
      setApplying(false); setResult(data); setDone(true);
      refetchBalance?.();
      if (data.applied.length) toast.success(`✅ ${data.applied.length} campanha(s) atualizadas!`);
      if (data.failed.length)  toast.error(`⚠️ ${data.failed.length} falha(s)`);
    },
    onError: (e: any) => { setApplying(false); toast.error(e.message); },
  }) ?? { mutate: () => {} };

  function handleFetch() {
    if (parsedAmount < 1) { toast.error("Informe o valor antes de buscar"); return; }
    setLoading(true); setCampaigns([]); setDone(false); setResult(null); setExcluded(new Set()); setEditing(null);
    (fetchMut as any).mutate({ period });
  }

  function handleApply() {
    const items = distributed.filter(c => c.allocation > 0).map(c => ({ platform: c.platform, campaignId: c.id, amount: c.allocation }));
    if (!items.length) { toast.error("Nenhum valor para aplicar"); return; }
    setApplying(true);
    (applyMut as any).mutate({ items, totalAmount: totalAllocated, deductFromBalance: true });
  }

  function setManual(key: string, val: string) {
    const n = parseFloat(val.replace(",", "."));
    if (!val || isNaN(n)) setOverrides(p => { const nx = {...p}; delete nx[key]; return nx; });
    else setOverrides(p => ({ ...p, [key]: n }));
  }

  return (
    <Layout>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px" }}>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>🎯 Rateio de Verba — Multi-Plataforma</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Distribui seu saldo entre Meta, Google e TikTok com base no desempenho real de cada campanha
          </p>
        </div>

        {/* Painel de saldo nas plataformas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            {
              key: "meta", label: "Meta Ads", icon: "📘", color: "#1877f2", bg: "#eff6ff",
              data: platforms?.meta,
            },
            {
              key: "google", label: "Google Ads", icon: "🔵", color: "#1a73e8", bg: "#f0f9ff",
              data: platforms?.google,
            },
            {
              key: "tiktok", label: "TikTok Ads", icon: "⬛", color: "#010101", bg: "#f8f8f8",
              data: platforms?.tiktok,
            },
          ].map(({ key, label, icon, color, bg, data: pd }) => (
            <div key={key} style={{
              background: bg, borderRadius: 14, padding: "14px 18px",
              border: `1.5px solid ${pd?.alert === "critical" ? "#fca5a5" : pd?.alert === "warning" ? "#fde68a" : color + "30"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>{icon} {label}</span>
                {pd?.rechargeUrl && (
                  <a href={pd.rechargeUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#fff", color, border: `1px solid ${color}30`, textDecoration: "none" }}>
                    + Recarregar
                  </a>
                )}
              </div>

              {loadingPlatforms && <div style={{ fontSize: 12, color: "#94a3b8" }}>Consultando...</div>}

              {!loadingPlatforms && !pd && <div style={{ fontSize: 12, color: "#94a3b8" }}>Não conectado</div>}

              {pd?.error && <div style={{ fontSize: 11, color: "#dc2626" }}>⚠️ {pd.error.slice(0, 60)}</div>}

              {pd && !pd.error && (
                <>
                  {/* META e TIKTOK: mostram saldo real */}
                  {(key === "meta" || key === "tiktok") && pd.balance != null && (
                    <>
                      <div style={{ fontSize: 22, fontWeight: 900, color: pd.alert === "critical" ? "#dc2626" : pd.alert === "warning" ? "#d97706" : "#059669" }}>
                        R$ {Number(pd.balance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>saldo disponível</div>
                      {pd.alert === "critical" && <div style={{ fontSize: 10, color: "#dc2626", marginTop: 4, fontWeight: 700 }}>🔴 Saldo crítico — recarregue agora</div>}
                      {pd.alert === "warning"  && <div style={{ fontSize: 10, color: "#d97706", marginTop: 4, fontWeight: 700 }}>🟡 Saldo baixo</div>}
                    </>
                  )}
                  {key === "meta" && pd.spent != null && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>gasto total: R$ {Number(pd.spent).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                  )}

                  {/* GOOGLE: mostra gasto do mês (não expõe saldo via API) */}
                  {key === "google" && (
                    <>
                      {pd.spentThisMonth != null && (
                        <>
                          <div style={{ fontSize: 22, fontWeight: 900, color: "#1a73e8" }}>
                            R$ {Number(pd.spentThisMonth).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>gasto este mês</div>
                        </>
                      )}
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                        ℹ️ Google não expõe saldo via API
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Controles */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>SALDO DISPONÍVEL</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#059669" }}>{balance ? R(balance.balance) : "—"}</div>
            {balance?.totalDeposited > 0 && <div style={{ fontSize: 11, color: "#94a3b8" }}>de {R(balance.totalDeposited)}</div>}
            {balance?.balance > 0 && (
              <button onClick={() => setAmount(balance.balance.toFixed(2))}
                style={{ marginTop: 8, width: "100%", fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid #059669", background: "#fff", color: "#059669", cursor: "pointer" }}>
                📥 Usar saldo completo
              </button>
            )}
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Valor a distribuir (R$)</label>
              <input value={amount} onChange={e => { setAmount(e.target.value); setCampaigns([]); }}
                placeholder="Ex: 2000"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 15, fontWeight: 700, border: `1.5px solid ${balance && parsedAmount > balance.balance ? "#fca5a5" : "#e2e8f0"}` }} />
              {balance && parsedAmount > balance.balance && parsedAmount > 0 && (
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 3 }}>⚠️ Maior que saldo disponível</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Período</label>
              <select value={period} onChange={e => { setPeriod(e.target.value as any); setCampaigns([]); }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13 }}>
                <option value="7d">7 dias</option>
                <option value="30d">30 dias</option>
                <option value="90d">90 dias</option>
              </select>
            </div>
            <button onClick={handleFetch} disabled={loading || parsedAmount < 1}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", whiteSpace: "nowrap",
                background: loading || parsedAmount < 1 ? "#e2e8f0" : "linear-gradient(135deg,#7c3aed,#2563eb)",
                color: loading || parsedAmount < 1 ? "#94a3b8" : "#fff", fontSize: 13, fontWeight: 700, cursor: loading || parsedAmount < 1 ? "not-allowed" : "pointer" }}>
              {loading ? "⏳ Buscando..." : "🔍 Buscar campanhas"}
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 16px", marginBottom: 14, fontSize: 12, color: "#92400e" }}>
            ⚠️ Plataformas com erro: {errors.join(" · ")}
          </div>
        )}

        {!loading && !campaigns.length && !done && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Informe o valor e clique em "Buscar campanhas"</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Analisa Meta Ads, Google Ads e TikTok Ads automaticamente</div>
          </div>
        )}

        {/* Ranking */}
        {distributed.length > 0 && !done && (
          <>
            {/* Pills de plataforma */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {["meta","google","tiktok"].map(plt => {
                const pCamps = distributed.filter(c => c.platform === plt);
                if (!pCamps.length) return null;
                const cfg = PLATFORM[plt];
                return (
                  <div key={plt} style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}40`, borderRadius: 10, padding: "8px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: cfg.color }}>{cfg.icon} {cfg.label}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{pCamps.length} camp. · {R(pCamps.reduce((s,c)=>s+c.allocation,0))}</div>
                  </div>
                );
              })}
              <div style={{ background: "#f5f3ff", border: "1.5px solid #7c3aed40", borderRadius: 10, padding: "8px 14px", marginLeft: "auto" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed" }}>📊 Total</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{R(totalAllocated)}</div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
              🧠 Score: WhatsApp {'>'} Leads {'>'} ROAS {'>'} CTR · Distribuição exponencial · Edite para ajuste manual
            </div>

            {/* Cards */}
            <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
              {distributed.map((c, i) => {
                const plt = PLATFORM[c.platform];
                const met = METRIC[c.metric] || METRIC.ctr;
                const key = `${c.platform}_${c.id}`;
                const pct = parsedAmount > 0 ? (c.allocation / parsedAmount * 100).toFixed(1) : "0";
                const isTop = i === 0 && c.hasData;
                const isEditing = editing === key;

                return (
                  <div key={key} style={{ background: "#fff", borderRadius: 14, padding: "14px 18px",
                    border: `2px solid ${isTop ? "#7c3aed30" : "#f1f5f9"}`,
                    borderLeft: `4px solid ${isTop ? "#7c3aed" : plt.color}`,
                    opacity: c.hasData ? 1 : 0.75,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

                      {/* Rank */}
                      <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, fontWeight: 900, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                        background: isTop ? "linear-gradient(135deg,#7c3aed,#2563eb)" : "#f1f5f9",
                        color: isTop ? "#fff" : "#64748b" }}>#{i+1}</div>

                      {/* Badges */}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: plt.bg, color: plt.color }}>{plt.icon} {plt.label}</span>
                      {!c.hasData && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#fef9c3", color: "#854d0e" }}>⚠️ sem dados no período</span>}

                      {/* Nome e métricas */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                          {c.hasData && <span style={{ color: met.color, fontWeight: 700 }}>{met.icon} {met.label}: {c.metricValue}/R$100</span>}
                          {c.hasData && <span>Score: {c.score}</span>}
                          {c.spend > 0 && <span>Gasto: R$ {c.spend}</span>}
                          {c.waClicks > 0 && <span>📱 {c.waClicks} WA</span>}
                          {c.leads > 0 && <span>📋 {c.leads} leads</span>}
                          {c.ctr > 0 && <span>CTR: {c.ctr}%</span>}
                          {c.currentBudget != null && c.currentBudget > 0 && <span style={{color:"#94a3b8"}}>Atual: R$ {c.currentBudget.toFixed(2)}/dia</span>}
                        </div>
                      </div>

                      {/* Valor + ações */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

                        {/* Edição inline */}
                        {isEditing ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              autoFocus
                              type="number"
                              defaultValue={overrides[key] ?? c.allocation}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  setManual(key, (e.target as HTMLInputElement).value);
                                  setEditing(null);
                                }
                                if (e.key === "Escape") setEditing(null);
                              }}
                              onBlur={e => { setManual(key, e.target.value); setEditing(null); }}
                              style={{ width: 100, padding: "6px 10px", borderRadius: 8, border: "2px solid #7c3aed", fontSize: 14, fontWeight: 800, textAlign: "right", outline: "none" }}
                            />
                            <span style={{ fontSize: 10, color: "#94a3b8" }}>Enter ✓</span>
                          </div>
                        ) : (
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: overrides[key] !== undefined ? "#d97706" : "#0f172a" }}>
                              {R(c.allocation)}
                            </div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>{pct}% do total</div>
                            {overrides[key] !== undefined && (
                              <div style={{ fontSize: 10, color: "#d97706", cursor: "pointer" }} onClick={() => setManual(key, "")}>
                                ⚙️ manual · resetar
                              </div>
                            )}
                          </div>
                        )}

                        {/* Botão editar */}
                        <button
                          onClick={() => setEditing(isEditing ? null : key)}
                          title="Editar valor"
                          style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${isEditing ? "#7c3aed" : "#e2e8f0"}`,
                            background: isEditing ? "#f5f3ff" : "#f8fafc", color: isEditing ? "#7c3aed" : "#64748b",
                            fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          ✏️
                        </button>

                        {/* Botão excluir */}
                        <button
                          onClick={() => {
                            setExcluded(prev => new Set([...prev, key]));
                            setManual(key, "");
                            toast.success(`"${c.name.slice(0,30)}" removida do rateio`);
                          }}
                          title="Remover do rateio"
                          style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #fecaca",
                            background: "#fef2f2", color: "#dc2626",
                            fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    <div style={{ marginTop: 10, height: 4, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 999, transition: "width .3s",
                        width: `${Math.min(100, Number(pct))}%`,
                        background: isTop ? "linear-gradient(90deg,#7c3aed,#2563eb)" : c.hasData ? plt.color + "90" : "#e2e8f0" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Campanhas excluídas */}
            {excluded.size > 0 && (
              <div style={{ marginBottom: 14, padding: "10px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
                  Removidas do rateio ({excluded.size}):
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[...excluded].map(key => {
                    const [plt, ...idParts] = key.split("_");
                    const id = idParts.join("_");
                    const camp = campaigns.find(c => c.platform === plt && c.id === id);
                    return (
                      <button key={key}
                        onClick={() => setExcluded(prev => { const n = new Set(prev); n.delete(key); return n; })}
                        style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}>
                        {PLATFORM[plt]?.icon} {camp?.name?.slice(0,20) || id} · restaurar
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ações */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={handleApply} disabled={applying || parsedAmount < 1}
                style={{ padding: "12px 28px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, cursor: applying ? "not-allowed" : "pointer",
                  background: applying ? "#e2e8f0" : "linear-gradient(135deg,#059669,#10b981)",
                  color: applying ? "#94a3b8" : "#fff" }}>
                {applying ? "⏳ Aplicando..." : `✅ Aplicar ${R(totalAllocated)} nas campanhas`}
              </button>
              {Object.keys(overrides).length > 0 && (
                <button onClick={() => setOverrides({})}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  🔄 Automático
                </button>
              )}
              <button onClick={() => { const t = distributed.map(c=>`[${PLATFORM[c.platform].label}] ${c.name}: ${R(c.allocation)}`).join("\n"); navigator.clipboard.writeText(t); toast.success("Copiado!"); }}
                style={{ padding: "10px 16px", borderRadius: 10, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1a73e8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                📋 Copiar rateio
              </button>
              {balance && totalAllocated > 0 && (
                <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
                  Saldo após aplicação: <strong style={{ color: "#059669" }}>{R(balance.balance - totalAllocated)}</strong>
                </div>
              )}
            </div>

            <div style={{ marginTop: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 16px", fontSize: 12, color: "#065f46", lineHeight: 1.7 }}>
              💳 <strong>Pagamento:</strong> Debitado do seu <strong>saldo de verba</strong> (Pix ou Cartão). O orçamento diário de cada campanha é atualizado via API. Você repõe os créditos nas plataformas com o saldo Asaas no seu tempo.
            </div>
          </>
        )}

        {/* Resultado */}
        {done && result && (
          <div>
            <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "20px 24px", marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#059669", marginBottom: 10 }}>✅ Rateio aplicado!</div>
              <div style={{ display: "flex", gap: 20, fontSize: 13, flexWrap: "wrap" }}>
                <span>Aplicado: <strong>{R(result.totalApplied)}</strong></span>
                <span>Campanhas: <strong>{result.applied.length}</strong></span>
                {result.failed.length > 0 && <span style={{ color: "#dc2626" }}>⚠️ Falhas: {result.failed.length}</span>}
              </div>
            </div>
            {result.applied.map((a: any, i: number) => (
              <div key={i} style={{ fontSize: 12, padding: "6px 14px", background: "#f8fafc", borderRadius: 8, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{PLATFORM[a.platform]?.icon} {a.campaignId}</span>
                <strong style={{ color: "#059669" }}>Orçamento diário: {R(a.amount)}</strong>
              </div>
            ))}
            {result.failed.map((f: any, i: number) => (
              <div key={i} style={{ fontSize: 12, padding: "6px 14px", background: "#fef2f2", borderRadius: 8, marginBottom: 4 }}>
                {PLATFORM[f.platform]?.icon} {f.campaignId}: {f.error}
              </div>
            ))}
            <button onClick={() => { setDone(false); setResult(null); setCampaigns([]); setAmount(""); }}
              style={{ marginTop: 14, padding: "10px 20px", borderRadius: 10, border: "1.5px solid #7c3aed", background: "#f5f3ff", color: "#7c3aed", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              🔄 Novo rateio
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
