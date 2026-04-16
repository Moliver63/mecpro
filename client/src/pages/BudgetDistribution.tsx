/**
 * BudgetDistribution.tsx
 *
 * Rateio inteligente de verba de mídia por campanha.
 * Score automático baseado na melhor métrica de cada campanha
 * (WhatsApp > Leads > ROAS > CTR), com distribuição proporcional
 * e possibilidade de ajuste manual por campanha.
 */

import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METRIC_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: "WhatsApp",  icon: "📱", color: "#25d366" },
  leads:    { label: "Leads",     icon: "📋", color: "#1a73e8" },
  roas:     { label: "ROAS",      icon: "💰", color: "#059669" },
  ctr:      { label: "CTR",       icon: "📈", color: "#7c3aed" },
};

interface Campaign {
  id: string; name: string; rank: number;
  primaryMetric: string; primaryValue: number; score: number;
  allocation: number; allocationPct: number; isManual: boolean;
  spend: number; clicks: number; ctr: number;
  waClicks: number; leads: number;
}

export default function BudgetDistribution() {
  const [amount,    setAmount]    = useState("");
  const [period,    setPeriod]    = useState<"7d"|"30d"|"90d">("30d");
  const [result,    setResult]    = useState<any>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(false);

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;

  // Saldo disponível
  const { data: balance } = (trpc as any).mediaBudget?.getBalance?.useQuery?.() ?? { data: null };

  const calcMutation = (trpc as any).mediaBudget?.calcDistribution?.useMutation?.({
    onSuccess: (data: any) => {
      setResult(data);
      setLoading(false);
      toast.success(`✅ Rateio calculado para ${data.campaigns.length} campanha(s)`);
    },
    onError: (e: any) => { setLoading(false); toast.error(e.message); },
  }) ?? { mutate: () => {} };

  function handleCalc() {
    if (parsedAmount < 1) { toast.error("Informe o valor a distribuir"); return; }
    setLoading(true);
    const numericOverrides: Record<string, number> = {};
    Object.entries(overrides).forEach(([k, v]) => {
      const n = parseFloat(v.replace(",", "."));
      if (!isNaN(n) && n > 0) numericOverrides[k] = n;
    });
    (calcMutation as any).mutate({ amount: parsedAmount, period, overrides: numericOverrides });
  }

  function handleRecalc() {
    const numericOverrides: Record<string, number> = {};
    Object.entries(overrides).forEach(([k, v]) => {
      const n = parseFloat(v.replace(",", "."));
      if (!isNaN(n) && n > 0) numericOverrides[k] = n;
    });
    (calcMutation as any).mutate({ amount: parsedAmount, period, overrides: numericOverrides });
  }

  const totalOverride = Object.values(overrides)
    .reduce((s, v) => s + (parseFloat(v.replace(",", ".")) || 0), 0);

  const camps: Campaign[] = result?.campaigns || [];
  const topCamp = camps[0];

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            🎯 Rateio Inteligente de Verba
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Distribui verba proporcionalmente com base na melhor métrica de cada campanha ativa
          </p>
        </div>

        {/* Saldo + Configuração */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 24 }}>

          {/* Saldo */}
          {balance && (
            <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>SALDO DISPONÍVEL</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#059669" }}>{R(balance.balance)}</div>
              <button
                onClick={() => setAmount(String(balance.balance))}
                style={{ marginTop: 8, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: "1px solid #059669", background: "#fff", color: "#059669", cursor: "pointer" }}
              >
                Usar saldo completo
              </button>
            </div>
          )}

          {/* Configuração */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 140 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                Valor a distribuir (R$)
              </label>
              <input
                value={amount}
                onChange={e => { setAmount(e.target.value); setResult(null); }}
                placeholder="Ex: 2000"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 16, fontWeight: 700 }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                Período de análise
              </label>
              <select
                value={period}
                onChange={e => setPeriod(e.target.value as any)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13 }}
              >
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="90d">Últimos 90 dias</option>
              </select>
            </div>
            <button
              onClick={handleCalc}
              disabled={loading || parsedAmount < 1}
              style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: loading || parsedAmount < 1 ? "#e2e8f0" : "linear-gradient(135deg,#7c3aed,#2563eb)",
                color: loading || parsedAmount < 1 ? "#94a3b8" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: loading || parsedAmount < 1 ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "⏳ Calculando..." : "🧮 Calcular rateio"}
            </button>
          </div>
        </div>

        {/* Resultado */}
        {result && camps.length === 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "16px 20px", fontSize: 13, color: "#92400e", lineHeight: 1.7 }}>
            ⚠️ <strong>Nenhuma campanha com dados encontrada.</strong><br />
            Possíveis causas:
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
              <li>Nenhuma campanha teve gastos nos últimos {period === "7d" ? "7" : period === "30d" ? "30" : "90"} dias</li>
              <li>Campanhas estão com status DELETED ou ARCHIVED</li>
              <li>A conta Meta não tem campanhas publicadas pelo MECPro</li>
            </ul>
            <div style={{ marginTop: 10 }}>
              Tente ampliar o período para <strong>90 dias</strong> ou verifique o painel Meta Ads.
            </div>
          </div>
        )}

        {camps.length > 0 && (
          <div>
            {/* Resumo */}
            <div style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)", borderRadius: 16, padding: "18px 24px", marginBottom: 20, color: "#fff", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, opacity: .8 }}>Total distribuído</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{R(result.distributed)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: .8 }}>Campanhas</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{camps.length}</div>
              </div>
              {topCamp && (
                <div>
                  <div style={{ fontSize: 11, opacity: .8 }}>Top campanha</div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{topCamp.name.slice(0, 30)}</div>
                </div>
              )}
              <div style={{ marginLeft: "auto", fontSize: 12, opacity: .8, lineHeight: 1.6 }}>
                Período: {period === "7d" ? "7 dias" : period === "30d" ? "30 dias" : "90 dias"}<br />
                {result.hasOverrides && "⚙️ Com ajustes manuais"}
              </div>
            </div>

            {/* Como funciona */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "#64748b" }}>
              🧠 <strong>Lógica automática:</strong> Score = WhatsApp &gt; Leads &gt; ROAS &gt; CTR (por R$100 gastos). Distribuição exponencial — campanha com o dobro do score recebe proporcionalmente mais que o dobro da verba. Edite os valores para ajuste manual.
            </div>

            {/* Cards das campanhas */}
            <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
              {camps.map((c, i) => {
                const mc = METRIC_CONFIG[c.primaryMetric] || METRIC_CONFIG.ctr;
                const isTop = i === 0;
                return (
                  <div key={c.id} style={{
                    background: "#fff",
                    border: `2px solid ${isTop ? "#7c3aed40" : "#e2e8f0"}`,
                    borderLeft: `4px solid ${isTop ? "#7c3aed" : "#e2e8f0"}`,
                    borderRadius: 14, padding: "16px 20px",
                    boxShadow: isTop ? "0 4px 16px rgba(124,58,237,.08)" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>

                      {/* Rank */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: isTop ? "linear-gradient(135deg,#7c3aed,#2563eb)" : "#f1f5f9",
                        color: isTop ? "#fff" : "#64748b",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, fontWeight: 900,
                      }}>
                        #{c.rank}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                            {c.name.length > 45 ? c.name.slice(0, 45) + "…" : c.name}
                          </span>
                          {isTop && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#f5f3ff", color: "#7c3aed" }}>
                              🏆 Top performer
                            </span>
                          )}
                          {c.isManual && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#fffbeb", color: "#d97706" }}>
                              ⚙️ Manual
                            </span>
                          )}
                        </div>

                        {/* Métricas */}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "#64748b" }}>
                          <span style={{ fontWeight: 700, color: mc.color }}>
                            {mc.icon} {mc.label}: {c.primaryValue.toFixed(2)}/R$100
                          </span>
                          <span>Score: {c.score}</span>
                          <span>Gasto: R$ {c.spend}</span>
                          {c.waClicks > 0 && <span>📱 WA: {c.waClicks}</span>}
                          {c.leads > 0 && <span>📋 Leads: {c.leads}</span>}
                          <span>CTR: {c.ctr}%</span>
                        </div>
                      </div>

                      {/* Alocação */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{R(c.allocation)}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{c.allocationPct}% do total</div>

                        {/* Input de ajuste manual */}
                        <input
                          type="number"
                          placeholder={R(c.allocation)}
                          value={overrides[c.id] || ""}
                          onChange={e => {
                            const val = e.target.value;
                            setOverrides(prev => val ? { ...prev, [c.id]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== c.id)));
                          }}
                          style={{
                            width: 100, padding: "6px 10px", borderRadius: 8, textAlign: "right",
                            border: `1.5px solid ${overrides[c.id] ? "#d97706" : "#e2e8f0"}`,
                            fontSize: 12, fontWeight: 700,
                            background: overrides[c.id] ? "#fffbeb" : "#fff",
                          }}
                        />
                        {overrides[c.id] && (
                          <div style={{ fontSize: 10, color: "#d97706", marginTop: 2 }}>valor manual</div>
                        )}
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    <div style={{ marginTop: 12, height: 6, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 999,
                        width: `${Math.min(100, c.allocationPct)}%`,
                        background: isTop ? "linear-gradient(90deg,#7c3aed,#2563eb)" : "#94a3b8",
                        transition: "width .3s",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botões de ação */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {Object.keys(overrides).length > 0 && (
                <button
                  onClick={handleRecalc}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d97706", background: "#fffbeb", color: "#d97706", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  ♻️ Recalcular com ajustes manuais ({R(totalOverride)} fixo)
                </button>
              )}
              <button
                onClick={() => { setOverrides({}); handleCalc(); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                🔄 Resetar para automático
              </button>
              <button
                onClick={() => {
                  const text = camps.map(c => `${c.name}: ${R(c.allocation)} (${c.allocationPct}%)`).join("\n");
                  navigator.clipboard.writeText(text);
                  toast.success("Rateio copiado!");
                }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1a73e8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                📋 Copiar rateio
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
