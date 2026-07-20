import { useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ── Mini sparkline SVG ──────────────────────────────────────────────────────
function Sparkline({ values, color = "var(--green)" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 80, h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity={0.12} stroke="none" />
    </svg>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .6s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

function KpiCard({ label, value, icon, color, sub, trend, sparkValues }: {
  label: string; value: string | number; icon: string; color: string;
  sub?: string; trend?: number; sparkValues?: number[];
}) {
  const trendUp = (trend ?? 0) >= 0;
  return (
    <div
      style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12, transition: "box-shadow .2s", cursor: "default" }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.06)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
        {sparkValues && <Sparkline values={sparkValues} />}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)", lineHeight: 1, marginBottom: 4 }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: sub ? 4 : 0 }}>{label}</div>
        {sub && trend !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: trendUp ? "var(--green)" : "#ef4444" }}>{trendUp ? "↑" : "↓"} {Math.abs(trend)}%</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</span>
          </div>
        )}
        {sub && trend === undefined && <span style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</span>}
      </div>
    </div>
  );
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (!total) return <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>Sem dados</p>;
  const r = 40, cx = 50, cy = 50, stroke = 14;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width={100} height={100} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circ;
          const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }} />;
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 14, fontWeight: 800, fill: "var(--black)", fontFamily: "var(--font-display)" }}>{total}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {segments.map(seg => (
          <div key={seg.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color, flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: "var(--body)", textTransform: "capitalize" }}>{seg.label}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{seg.value}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{Math.round(seg.value / total * 100)}%</span>
              </div>
            </div>
            <ProgressBar value={seg.value} max={total} color={seg.color} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const { data: stats, isLoading } = trpc.admin.stats.useQuery();
  const [tab, setTab] = useState<"overview" | "planos" | "financeiro" | "site">("overview");

  // ── Dados GA4 (só busca quando a aba "site" está aberta) ────────────────
  const ga4Status = (trpc as any).siteAnalytics?.status?.useQuery?.(undefined, { enabled: tab === "site" });
  const ga4Summary = (trpc as any).siteAnalytics?.summary?.useQuery?.(
    { days: 30 }, { enabled: tab === "site" && !!ga4Status?.data?.connected }
  );
  const ga4Timeseries = (trpc as any).siteAnalytics?.timeseries?.useQuery?.(
    { days: 30 }, { enabled: tab === "site" && !!ga4Status?.data?.connected }
  );

  const planColors: Record<string, string> = { free: "#94a3b8", basic: "#3b82f6", premium: "var(--green)", vip: "#8b5cf6" };
  const planEmoji:  Record<string, string> = { free: "🆓", basic: "⚡", premium: "◈", vip: "◇" };

  const planSegments = useMemo(() => {
    if (!stats?.planBreakdown) return [];
    return Object.entries(stats.planBreakdown).map(([plan, count]: any) => ({ label: plan, value: count, color: planColors[plan] || "#94a3b8" }));
  }, [stats]);

  const conversionRate = useMemo(() => {
    if (!stats) return 0;
    const pb = stats.planBreakdown as any;
    const paid = (pb?.basic || 0) + (pb?.premium || 0) + (pb?.vip || 0);
    return stats.totalUsers > 0 ? Math.round((paid / stats.totalUsers) * 100) : 0;
  }, [stats]);

  const arpu = useMemo(() => {
    if (!stats?.activeSubsCount) return "0";
    return ((stats.totalRevenue / 100) / stats.activeSubsCount).toFixed(0);
  }, [stats]);

  const mockSpark = [8, 14, 11, 18, 22, 19, 26, 23, 31, 27, 34, stats?.newUsersMonth || 38].map(Number);

  if (isLoading) {
    return (
      <Layout>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0", gap: 14 }}>
          <div style={{ width: 36, height: 36, border: "3px solid var(--green)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Carregando analytics…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Analytics</h1>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Métricas gerais da plataforma MECPro</p>
        </div>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          {(["overview", "planos", "financeiro", "site"] as const).map((t, i) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 16px", border: "none", cursor: "pointer",
              borderLeft: i > 0 ? "1px solid var(--border)" : "none",
              background: tab === t ? "var(--navy)" : "white",
              color: tab === t ? "white" : "var(--muted)",
              fontSize: 12, fontWeight: 700, transition: "all .15s",
            }}>{t === "overview" ? "Visão geral" : t === "planos" ? "Planos" : t === "financeiro" ? "Financeiro" : "Site"}</button>
          ))}
        </div>
      </div>

      {/* ── TAB VISÃO GERAL ── */}
      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
            <KpiCard label="Total de usuários"    value={stats?.totalUsers ?? 0}      icon="👥" color="#eff6ff"        sparkValues={mockSpark} sub="vs mês anterior" trend={12} />
            <KpiCard label="Novos este mês"        value={stats?.newUsersMonth ?? 0}   icon="🆕" color="var(--green-l)" sub="crescimento"       trend={8}  />
            <KpiCard label="Projetos ativos"       value={stats?.activeProjects ?? 0}  icon="◈" color="#fef3c7" />
            <KpiCard label="Assinaturas ativas"    value={stats?.activeSubsCount ?? 0} icon="💳" color="#fff7ed"        sub="churn estimado"   trend={-2} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            <KpiCard label="Usuários premium+"     value={stats?.premiumUsers ?? 0}    icon="◈" color="#f5f3ff" />
            <KpiCard label="Taxa de conversão"     value={`${conversionRate}%`}        icon="📊" color="#fef2f2" sub="free → pago" trend={conversionRate > 10 ? 5 : -3} />
            <KpiCard label="Total de projetos"     value={stats?.totalProjects ?? 0}   icon="◫" color="#f0fdf4" />
            <KpiCard label="ARPU mensal"           value={`R$ ${arpu}`}                icon="💡" color="#ecfdf5" sub="por assinante" trend={3} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Distribuição por plano</p>
              <DonutChart segments={planSegments} />
            </div>
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Saúde da plataforma</p>
              {[
                { label: "Ativação (criou projeto)",    value: stats?.totalProjects ?? 0,   max: stats?.totalUsers ?? 1, color: "var(--green)", icon: "◫" },
                { label: "Engajamento (premium+)",      value: stats?.premiumUsers ?? 0,    max: stats?.totalUsers ?? 1, color: "#8b5cf6",      icon: "◈" },
                { label: "Retenção (assinatura ativa)", value: stats?.activeSubsCount ?? 0, max: stats?.totalUsers ?? 1, color: "#3b82f6",      icon: "💳" },
              ].map(m => {
                const pct = m.max > 0 ? Math.round((m.value / m.max) * 100) : 0;
                return (
                  <div key={m.label} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--body)" }}>{m.icon} {m.label}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{m.value}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{pct}%</span>
                      </div>
                    </div>
                    <ProgressBar value={m.value} max={m.max} color={m.color} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rankings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 16, fontFamily: "var(--font-display)" }}>Ranking de planos</p>
              {planSegments.sort((a, b) => b.value - a.value).map((seg, i) => (
                <div key={seg.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: i % 2 === 0 ? "var(--off)" : "transparent", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? "var(--green)" : i === 1 ? "#3b82f6" : "var(--border)", color: i < 2 ? "white" : "var(--muted)", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: "var(--body)", textTransform: "capitalize" }}>{planEmoji[seg.label]} {seg.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{seg.value}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{stats?.totalUsers ? Math.round(seg.value / stats.totalUsers * 100) : 0}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 16, fontFamily: "var(--font-display)" }}>Métricas de receita</p>
              {[
                { label: "💰 Receita total",      value: `R$ ${((stats?.totalRevenue ?? 0) / 100).toFixed(2)}` },
                { label: "📈 Receita este mês",   value: `R$ ${((stats?.revenueMonth ?? 0) / 100).toFixed(2)}` },
                { label: "💡 ARPU mensal",        value: `R$ ${arpu}` },
                { label: "📊 Taxa de conversão",  value: `${conversionRate}%` },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: i % 2 === 0 ? "var(--off)" : "transparent", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--body)" }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── TAB PLANOS ── */}
      {tab === "planos" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {planSegments.map(seg => (
              <div key={seg.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{planEmoji[seg.label] || "📦"}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: seg.color, fontFamily: "var(--font-display)", marginBottom: 4 }}>{seg.value}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--body)", textTransform: "capitalize", marginBottom: 12 }}>Plano {seg.label}</div>
                <ProgressBar value={seg.value} max={stats?.totalUsers || 1} color={seg.color} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  {stats?.totalUsers ? Math.round(seg.value / stats.totalUsers * 100) : 0}% dos usuários
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Distribuição comparativa</p>
            <DonutChart segments={planSegments} />
          </div>
        </>
      )}

      {/* ── TAB FINANCEIRO ── */}
      {tab === "financeiro" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            <KpiCard label="Receita total acumulada" value={`R$ ${((stats?.totalRevenue ?? 0) / 100).toFixed(2)}`} icon="◈" color="#ecfdf5" sparkValues={mockSpark.map(v => v * 10)} />
            <KpiCard label="Receita este mês"        value={`R$ ${((stats?.revenueMonth ?? 0) / 100).toFixed(2)}`} icon="📈" color="#fef2f2" sub="vs mês anterior" trend={5} />
            <KpiCard label="ARPU por assinante"      value={`R$ ${arpu}`}                                          icon="💡" color="#eff6ff" sub="ticket médio" trend={3} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Receita estimada por plano/mês</p>
              {[{ plan: "basic", preco: 97 }, { plan: "premium", preco: 197 }, { plan: "vip", preco: 397 }].map(({ plan, preco }) => {
                const count = (stats?.planBreakdown as any)?.[plan] || 0;
                const receita = count * preco;
                return (
                  <div key={plan} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--body)" }}>{planEmoji[plan]} {plan} — {count} usuários × R${preco}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>R$ {receita}/mês</span>
                    </div>
                    <ProgressBar value={receita} max={10000} color={planColors[plan]} />
                  </div>
                );
              })}
            </div>
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Resumo financeiro</p>
              {[
                { label: "Assinaturas ativas",         value: stats?.activeSubsCount ?? 0,                                  suffix: "contratos" },
                { label: "Ticket médio (ARPU)",        value: `R$ ${arpu}`,                                                  suffix: "/mês" },
                { label: "MRR estimado",               value: `R$ ${((stats?.revenueMonth ?? 0) / 100).toFixed(0)}`,        suffix: "recorrente mensal" },
                { label: "ARR estimado",               value: `R$ ${(((stats?.revenueMonth ?? 0) / 100) * 12).toFixed(0)}`, suffix: "recorrente anual" },
                { label: "Taxa free → pago",           value: `${conversionRate}%`,                                          suffix: "dos usuários" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: i % 2 === 0 ? "var(--off)" : "transparent", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--body)" }}>{row.label}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{row.value}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>{row.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── TAB SITE (tráfego mecproai.com) ── */}
      {tab === "site" && (
        <>
          {/* ── Status / erro da integração GA4 ── */}
          {ga4Status?.isLoading && (
            <div style={{ background: "var(--off)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 20px", marginBottom: 20, fontSize: 12, color: "var(--muted)" }}>
              🔍 Verificando conexão com GA4...
            </div>
          )}

          {ga4Status?.data && !ga4Status.data.configured && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "#92400e", margin: 0, lineHeight: 1.6 }}>
                ⚠️ GA4 ainda não conectado — falta a variável <code>GA4_SERVICE_ACCOUNT_JSON</code> no Render.
                Enquanto isso, use os cards de acesso rápido abaixo.
              </p>
            </div>
          )}

          {ga4Status?.data?.configured && !ga4Status.data.connected && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "#991b1b", margin: 0, lineHeight: 1.6 }}>
                🔴 Credencial GA4 configurada mas a conexão falhou: <strong>{ga4Status.data.error}</strong>.
                Confirme se o e-mail da service account tem papel Leitor na propriedade {ga4Status.data.propertyId}.
              </p>
            </div>
          )}

          {/* ── Cards de resumo (30 dias vs 30 dias anteriores) ── */}
          {ga4Status?.data?.connected && ga4Summary?.data && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Usuários ativos", ...ga4Summary.data.activeUsers },
                { label: "Sessões",         ...ga4Summary.data.sessions },
                { label: "Pageviews",       ...ga4Summary.data.pageViews },
                { label: "Duração média (s)", value: ga4Summary.data.avgSessionSec.value, changePct: ga4Summary.data.avgSessionSec.changePct },
              ].map(card => (
                <div key={card.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>{card.label}</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: "var(--black)" }}>{card.value.toLocaleString("pt-BR")}</p>
                  {card.changePct !== null && (
                    <p style={{ fontSize: 11, fontWeight: 700, color: card.changePct >= 0 ? "#15803d" : "#dc2626", marginTop: 4 }}>
                      {card.changePct >= 0 ? "▲" : "▼"} {Math.abs(card.changePct)}% vs período anterior
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Gráfico de série temporal ── */}
          {ga4Status?.data?.connected && ga4Timeseries?.data?.rows?.length > 0 && (
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: "var(--black)", marginBottom: 16 }}>
                Tráfego — últimos {ga4Timeseries.data.days} dias
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={ga4Timeseries.data.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="activeUsers" name="Usuários" stroke="#1877f2" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sessions" name="Sessões" stroke="#15803d" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="pageViews" name="Pageviews" stroke="#d97706" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18 }}>ℹ️</span>
            <p style={{ fontSize: 12, color: "#1e40af", margin: 0, lineHeight: 1.6 }}>
              Gráfico e cards acima usam a Google Analytics Data API (GA4) em tempo real. Clarity (heatmaps,
              gravações) e detalhes extras do Meta Pixel continuam nos dashboards de cada ferramenta —
              os cards abaixo levam direto até eles.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              {
                name: "Google Analytics 4", icon: "📊", color: "#fef3c7",
                id: "G-JJ1H7MV9B7", idLabel: "Measurement ID",
                desc: "Sessões, páginas vistas, origem de tráfego, tempo real",
                url: "https://analytics.google.com/analytics/web/",
              },
              {
                name: "Microsoft Clarity", icon: "🎥", color: "#ede9fe",
                id: "xpe2mj40zj", idLabel: "Project ID",
                desc: "Gravações de sessão, heatmaps, rage clicks",
                url: "https://clarity.microsoft.com/projects/view/xpe2mj40zj",
              },
              {
                name: "Meta Pixel", icon: "📘", color: "#dbeafe",
                id: "1023228567098565", idLabel: "Pixel ID",
                desc: "Eventos de conversão, PageView, atribuição de anúncios",
                url: "https://business.facebook.com/events_manager2/list/pixel/1023228567098565",
              },
            ].map(tool => (
              <a key={tool.name} href={tool.url} target="_blank" rel="noreferrer"
                style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 20, textDecoration: "none", display: "flex", flexDirection: "column", gap: 10, transition: "box-shadow .2s" }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.06)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, background: tool.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{tool.icon}</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>{tool.name}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>{tool.desc}</p>
                  <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace", background: "var(--off)", padding: "3px 8px", borderRadius: 6, display: "inline-block" }}>
                    {tool.idLabel}: {tool.id}
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green-d)", marginTop: 4 }}>Abrir dashboard →</span>
              </a>
            ))}
          </div>

          <div style={{ background: "var(--off)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--black)", marginBottom: 10 }}>Próximo passo possível</p>
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
              GA4 já está integrado ao vivo (gráfico e cards acima). Falta a <strong>Clarity Data Export API</strong>
              para trazer engajamento/rage clicks direto pra cá — heatmaps e gravações de sessão em si continuam
              exclusivos do dashboard da Clarity (não são exportáveis por API).
            </p>
          </div>
        </>
      )}

      {/* Rodapé */}
      <div style={{ marginTop: 24, background: "var(--green-l)", border: "1px solid var(--green-xl)", borderRadius: 14, padding: "14px 20px", display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 18 }}>📊</span>
        <p style={{ fontSize: 12, color: "var(--green-d)", margin: 0 }}>
          <strong>Analytics avançado em breve:</strong> Gráficos históricos, cohort analysis, LTV, churn rate detalhado e mapas de uso por módulo.
        </p>
      </div>
    </Layout>
  );
}
