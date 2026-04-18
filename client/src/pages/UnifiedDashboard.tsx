import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

const R  = (v?: number | null) => v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const N  = (v?: number) => { const n = Number(v||0); return n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(1)}K`:String(Math.round(n)); };
const PCT= (v?: number) => v==null?"—":`${(Number(v)*100).toFixed(2)}%`;

const PLATFORMS = {
  meta:   { label: "Meta Ads",   sub: "Facebook & Instagram", icon: "📘", color: "#1877f2", light: "#eff6ff", border: "#bfdbfe" },
  google: { label: "Google Ads", sub: "Search & Display",     icon: "🔵", color: "#1a73e8", light: "#eff6ff", border: "#93c5fd" },
  tiktok: { label: "TikTok Ads", sub: "Short Video",          icon: "🎵", color: "#010101", light: "#f8fafc", border: "#e2e8f0" },
} as const;

type Platform = keyof typeof PLATFORMS;

interface PlatformMetrics {
  connected: boolean; loading: boolean; error?: string;
  campaigns: number; spend: number; impressions: number;
  clicks: number; cpc: number; cpm: number; ctr: number; roas?: number;
}

interface BillingInfo {
  connected: boolean; error?: string;
  balance?: number | null; spent?: number; cap?: number | null;
  remaining?: number | null; currency?: string; status?: number | string;
  daysLeft?: number | null; dailyAvg?: number; fundingType?: string | null;
  rechargeUrl?: string; alert?: "critical" | "warning" | null;
  isManager?: boolean;
}

function MetricPill({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 3 }}>{icon} {label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function BillingCard({ platform, billing }: { platform: Platform; billing: BillingInfo }) {
  const cfg = PLATFORMS[platform];
  if (!billing.connected) return null;
  if (billing.error) return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", fontSize: 12, color: "#dc2626" }}>
      ⚠️ Erro ao carregar billing: {billing.error}
    </div>
  );
  return (
    <div style={{ background: "#fff", border: `1.5px solid ${cfg.border}`, borderRadius: 14, padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>💳 Billing & Saldo</div>
        {billing.rechargeUrl && (
          <a href={billing.rechargeUrl} target="_blank" rel="noopener noreferrer" style={{
            fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 8,
            background: cfg.color, color: "#fff", textDecoration: "none",
          }}>
            ➕ Recarregar
          </a>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
        {billing.balance != null && <MetricPill label="Saldo disponível" value={R(billing.balance)} icon="◈" />}
        {billing.spent   != null && <MetricPill label="Gasto total"      value={R(billing.spent)}   icon="📤" />}
        {billing.remaining != null && <MetricPill label="Limite restante" value={R(billing.remaining)} icon="🎯" />}
        {billing.dailyAvg != null && billing.dailyAvg > 0 && <MetricPill label="Média diária" value={R(billing.dailyAvg)} icon="📅" />}
      </div>
      {billing.daysLeft != null && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
          📆 Previsão de esgotamento:{" "}
          <strong style={{ color: billing.daysLeft <= 5 ? "#dc2626" : billing.daysLeft <= 10 ? "#d97706" : "#059669" }}>
            {billing.daysLeft} dia{billing.daysLeft !== 1 ? "s" : ""}
          </strong>
          {billing.dailyAvg && billing.dailyAvg > 0 && ` (R$ ${billing.dailyAvg.toFixed(2)}/dia)`}
        </div>
      )}
      {billing.alert === "critical" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", marginTop: 12 }}>
          <span>🔴</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>
            Saldo crítico — {billing.daysLeft != null ? `${billing.daysLeft} dia(s) restante(s)` : "saldo muito baixo"}
          </span>
        </div>
      )}
      {billing.alert === "warning" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", marginTop: 12 }}>
          <span>🟡</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#d97706" }}>
            Saldo baixo — {billing.daysLeft != null ? `${billing.daysLeft} dias restantes` : "considere recarregar"}
          </span>
        </div>
      )}
      {billing.isManager && (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>ℹ️ Conta gerente (MCC)</div>
      )}
    </div>
  );
}

function PlatformBlock({ platform, metrics, billing, onRefresh }: { platform: Platform; metrics: PlatformMetrics; billing: BillingInfo; onRefresh: () => void }) {
  const cfg = PLATFORMS[platform];
  const [, setLocation] = useLocation();
  const paths: Record<Platform, string> = { meta: "/meta-campaigns", google: "/google-campaigns", tiktok: "/tiktok-campaigns" };

  return (
    <div style={{ background: "#fff", border: `2px solid ${metrics.connected ? cfg.color + "30" : "#e2e8f0"}`, borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: metrics.connected ? `0 4px 24px ${cfg.color}10` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap" as const, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, fontSize: 24, background: cfg.light, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${cfg.border}` }}>
            {cfg.icon}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{cfg.label}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{cfg.sub}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: metrics.connected ? "#dcfce7" : "#fef9c3", color: metrics.connected ? "#166534" : "#713f12" }}>
            {metrics.connected ? "✓ Conectado" : "⚠ Não conectado"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {metrics.connected && (
            <button onClick={onRefresh} disabled={metrics.loading} style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
              {metrics.loading ? "⏳" : "🔄"}
            </button>
          )}
          <button onClick={() => setLocation(paths[platform])} style={{ background: cfg.color, border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" }}>
            Gerenciar →
          </button>
        </div>
      </div>

      {!metrics.connected && (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔌</div>
          <p style={{ margin: 0, fontSize: 14 }}>Conecte sua conta em <strong>Configurações</strong> para ver métricas.</p>
        </div>
      )}
      {metrics.connected && metrics.loading && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#64748b" }}>⏳ Carregando…</div>
      )}
      {metrics.connected && !metrics.loading && metrics.error && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, padding: 12, color: "#b91c1c", fontSize: 13 }}>⚠️ {metrics.error}</div>
      )}
      {metrics.connected && !metrics.loading && !metrics.error && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 10 }}>Performance</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 20 }}>
            <MetricPill label="Campanhas"  value={String(metrics.campaigns)}     icon="📊" />
            <MetricPill label="Gasto"      value={R(metrics.spend/100)}          icon="◍" />
            <MetricPill label="Impressões" value={N(metrics.impressions)}        icon="👁️" />
            <MetricPill label="Cliques"    value={N(metrics.clicks)}             icon="👆" />
            <MetricPill label="CPC"        value={R(metrics.cpc/100)}            icon="💳" />
            <MetricPill label="CPM"        value={R(metrics.cpm/100)}            icon="📣" />
            <MetricPill label="CTR"        value={PCT(metrics.ctr)}              icon="📈" />
            {metrics.roas != null && metrics.roas > 0 && <MetricPill label="ROAS" value={`${metrics.roas.toFixed(2)}x`} icon="🎯" />}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 10 }}>Orçamento & Saldo</div>
          <BillingCard platform={platform} billing={billing} />
        </div>
      )}
    </div>
  );
}

export default function UnifiedDashboard() {
  const [period, setPeriod] = useState<"7d"|"30d"|"90d">("30d");
  const EMPTY = (): PlatformMetrics => ({ connected: false, loading: false, campaigns: 0, spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0, ctr: 0 });
  const [meta,   setMeta]   = useState<PlatformMetrics>(EMPTY());
  const [google, setGoogle] = useState<PlatformMetrics>(EMPTY());
  const [tiktok, setTikTok] = useState<PlatformMetrics>(EMPTY());

  const metaMetrics   = trpc.unified.metaMetrics.useMutation();
  const googleMetrics = trpc.unified.googleMetrics.useMutation();
  const tiktokMetrics = trpc.unified.tiktokMetrics.useMutation();
  const { data: billingData, refetch: refetchBilling } = (trpc as any).unified?.billing?.useQuery?.() ?? { data: null, refetch: () => {} };

  const billing: Record<Platform, BillingInfo> = {
    meta:   (billingData as any)?.meta   ?? { connected: false },
    google: (billingData as any)?.google ?? { connected: false },
    tiktok: (billingData as any)?.tiktok ?? { connected: false },
  };

  const notConfigured = (msg: string) => msg.includes("não configurada") || msg.includes("não configurado");

  const load = async () => {
    refetchBilling?.();
    setMeta(f  => ({ ...f, loading: true }));
    metaMetrics.mutateAsync({ period })
      .then((d: any) => setMeta({ connected: true, loading: false, campaigns: d.campaigns, spend: d.spend, impressions: d.impressions, clicks: d.clicks, cpc: d.cpc, cpm: d.cpm, ctr: d.ctr, roas: d.roas }))
      .catch((e: any) => setMeta(f => ({ ...f, loading: false, connected: !notConfigured(e.message), error: notConfigured(e.message) ? undefined : e.message })));
    setGoogle(f => ({ ...f, loading: true }));
    googleMetrics.mutateAsync({ period })
      .then((d: any) => setGoogle({ connected: true, loading: false, campaigns: d.campaigns, spend: d.spend, impressions: d.impressions, clicks: d.clicks, cpc: d.cpc, cpm: d.cpm, ctr: d.ctr }))
      .catch((e: any) => setGoogle(f => ({ ...f, loading: false, connected: !notConfigured(e.message), error: notConfigured(e.message) ? undefined : e.message })));
    setTikTok(f => ({ ...f, loading: true }));
    tiktokMetrics.mutateAsync({ period })
      .then((d: any) => setTikTok({ connected: true, loading: false, campaigns: d.campaigns, spend: d.spend, impressions: d.impressions, clicks: d.clicks, cpc: d.cpc, cpm: d.cpm, ctr: d.ctr }))
      .catch((e: any) => setTikTok(f => ({ ...f, loading: false, connected: !notConfigured(e.message), error: notConfigured(e.message) ? undefined : e.message })));
  };

  useEffect(() => { load(); }, [period]);

  const all = [meta, google, tiktok];
  const totalSpend  = all.reduce((s,p) => s + (!p.error && p.connected ? p.spend   : 0), 0);
  const totalImpr   = all.reduce((s,p) => s + (!p.error && p.connected ? p.impressions : 0), 0);
  const totalClicks = all.reduce((s,p) => s + (!p.error && p.connected ? p.clicks  : 0), 0);
  const totalCamps  = all.reduce((s,p) => s + (!p.error && p.connected ? p.campaigns : 0), 0);
  const avgCTR = totalImpr > 0 ? totalClicks / totalImpr : 0;

  const alerts = (["meta","google","tiktok"] as Platform[]).filter(p => billing[p]?.alert);

  return (
    <Layout>
      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "clamp(14px, 2.5vw, 28px) clamp(14px, 2vw, 20px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap" as const, gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>📊 Dashboard de Mídia Paga</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Performance e orçamento consolidado — Meta · Google · TikTok</p>
          </div>
          <div style={{ display: "flex", gap: 6, background: "#f1f5f9", borderRadius: 12, padding: 4 }}>
            {(["7d","30d","90d"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: period===p ? "#1a73e8" : "transparent", color: period===p ? "#fff" : "#64748b", transition: "all .15s" }}>
                {p==="7d"?"7 dias":p==="30d"?"30 dias":"90 dias"}
              </button>
            ))}
          </div>
        </div>

        {alerts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {alerts.map(p => {
              const isCrit = billing[p].alert === "critical";
              return (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderRadius: 12, background: isCrit ? "#fef2f2" : "#fffbeb", border: `1.5px solid ${isCrit ? "#fecaca" : "#fde68a"}`, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{isCrit ? "🚨" : "◬"}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: isCrit ? "#dc2626" : "#d97706" }}>
                      Saldo {isCrit ? "crítico" : "baixo"} — {PLATFORMS[p].label}
                    </div>
                    <div style={{ fontSize: 11, color: isCrit ? "#ef4444" : "#f59e0b" }}>
                      {billing[p].daysLeft != null ? `${billing[p].daysLeft} dia(s) restante(s)` : "Considere recarregar em breve"}
                    </div>
                  </div>
                  {billing[p].rechargeUrl && (
                    <a href={billing[p].rechargeUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8, background: isCrit ? "#dc2626" : "#d97706", color: "#fff", textDecoration: "none" }}>
                      Recarregar →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ background: "linear-gradient(135deg,#1a73e8,#7c3aed)", borderRadius: 20, padding: 24, marginBottom: 24, color: "#fff" }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: .8, marginBottom: 16 }}>🌐 Consolidado — todas as plataformas</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
            {[
              { label: "Total Gasto", value: R(totalSpend/100), icon: "◈" },
              { label: "Impressões",  value: N(totalImpr),      icon: "👁️" },
              { label: "Cliques",     value: N(totalClicks),    icon: "👆" },
              { label: "Campanhas",   value: String(totalCamps),icon: "📊" },
              { label: "CTR médio",   value: PCT(avgCTR),       icon: "📈" },
            ].map(m => (
              <div key={m.label} style={{ flex: 1, minWidth: 110, background: "rgba(255,255,255,.15)", borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ fontSize: 10, opacity: .8, marginBottom: 3 }}>{m.icon} {m.label}</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        <PlatformBlock platform="meta"   metrics={meta}   billing={billing.meta}   onRefresh={load} />
        <PlatformBlock platform="google" metrics={google} billing={billing.google} onRefresh={load} />
        <PlatformBlock platform="tiktok" metrics={tiktok} billing={billing.tiktok} onRefresh={load} />

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 16px", fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
          ℹ️ <strong>Sobre recargas:</strong> Meta, Google e TikTok não permitem depósito via API — é uma restrição das plataformas. Os botões "Recarregar" abrem diretamente a página de billing de cada plataforma.
        </div>
      </div>
    </Layout>
  );
}
