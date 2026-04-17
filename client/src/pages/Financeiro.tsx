/**
 * Financeiro.tsx — Hub financeiro com navegação Back/Next
 * Design: Liquid Glass identico ao sidebar · MECPro AI v2
 */
import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const fmt = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const TABS = [
  { id: "overview",     icon: "▣",  label: "Visão Geral",     color: "#0071e3" },
  { id: "deposit",      icon: "◫",  label: "Depositar",        color: "#0071e3" },
  { id: "credits",      icon: "◈",  label: "Créditos",         color: "#30d158" },
  { id: "distribution", icon: "◉",  label: "Rateio de verba",  color: "#5856d6" },
  { id: "transfer",     icon: "◍",  label: "Transferir",       color: "#ff9f0a" },
];

const PLATS = [
  { key: "meta",   label: "Meta Ads",   icon: "📘", color: "#1877f2" },
  { key: "google", label: "Google Ads", icon: "🔵", color: "#1a73e8" },
  { key: "tiktok", label: "TikTok Ads", icon: "◼",  color: "#333"   },
];

function SectionHeader({ icon, color, title, sub }: { icon: string; color: string; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.03em" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>
      </div>
    </div>
  );
}

function DisabledMode({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{ background: "var(--off)", borderRadius: 14, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>◻</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export default function Financeiro() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState(0);

  const { data: balance } = (trpc as any).mediaBudget?.getBalance?.useQuery?.()       ?? {};
  const { data: ps }      = (trpc as any).admin?.getPaymentSettings?.useQuery?.()     ?? {};
  const { data: asaas }   = (trpc as any).mediaBudget?.asaasBalance?.useQuery?.()     ?? {};
  const { data: summary } = (trpc as any).mediaBudget?.financialSummary?.useQuery?.() ?? {};

  const feePercent = (ps as any)?.feePercent ?? 10;
  const modeWallet = (ps as any)?.modeWallet !== false;
  const modeGuide  = (ps as any)?.modeGuide  !== false;

  const isFirst = tab === 0;
  const isLast  = tab === TABS.length - 1;

  const KPIS = [
    { label: "Saldo wallet", value: fmt((balance as any)?.balance),         icon: "◈", color: "#30d158" },
    { label: "Saldo Asaas",  value: fmt((asaas as any)?.balance),           icon: "◉", color: "#0071e3" },
    { label: "Gasto hoje",   value: fmt((summary as any)?.totalSpendToday), icon: "▣", color: "#ff9f0a" },
    { label: "Taxa gestão",  value: `${feePercent}%`,                       icon: "⚙", color: "#5856d6" },
  ];

  const card: React.CSSProperties = {
    background: "var(--glass-bg)",
    backdropFilter: "var(--glass-blur)",
    border: "1px solid var(--glass-border)",
    borderRadius: 16,
    boxShadow: "var(--glass-shadow)",
  };

  const actionBtn = (g: string): React.CSSProperties => ({
    width: "100%", padding: "13px 20px", borderRadius: 12, border: "none",
    background: g, color: "white", fontWeight: 700, fontSize: 14,
    cursor: "pointer", fontFamily: "var(--font)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)", transition: "opacity .15s",
  });

  return (
    <Layout>
      <style>{`
        .fn-nav:hover{background:rgba(0,0,0,0.05)!important;color:var(--dark)!important}
        .fn-nav:hover .fn-icon{transform:scale(1.1)}
        .fn-ab:hover{opacity:.85}
        .fn-sc:hover{border-color:var(--blue)!important;box-shadow:var(--shadow-blue)!important}
        .fn-sc:hover .fn-arr{color:var(--blue);transform:translateX(2px)}
        .fn-icon{transition:transform .15s}
        .fn-arr{transition:all .2s}
        .fn-kpi:hover{transform:translateY(-1px);box-shadow:var(--shadow-md)!important}
      `}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "var(--shadow-blue)", flexShrink: 0 }}>
            ▣
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.04em" }}>Financeiro</h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Gerencie saldo, créditos e verba de mídia</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
          {KPIS.map(k => (
            <div key={k.label} className="fn-kpi" style={{ ...card, padding: "14px 16px", transition: "all .2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: k.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: k.color }}>
                  {k.icon}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: k.color, letterSpacing: "-0.04em" }}>{k.value || "—"}</div>
            </div>
          ))}
        </div>

        {/* Layout: sidebar nav + content */}
        <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 14, marginBottom: 16 }}>

          {/* Nav lateral — mesmo estilo do sidebar */}
          <div style={{ ...card, padding: "10px 10px", height: "fit-content", position: "sticky", top: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 10px 8px" }}>
              Módulos
            </div>
            {TABS.map((t, i) => {
              const active = tab === i;
              return (
                <button key={t.id} onClick={() => setTab(i)} className="fn-nav" style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 10, border: "none",
                  cursor: "pointer", width: "100%", textAlign: "left",
                  fontFamily: "var(--font)", fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? t.color : "var(--muted)",
                  background: active ? t.color + "14" : "transparent",
                  position: "relative", transition: "all .15s var(--ease)",
                  marginBottom: 2,
                }}>
                  {active && (
                    <div style={{ position: "absolute", left: 0, top: "20%", height: "60%", width: 3, background: t.color, borderRadius: "0 2px 2px 0" }} />
                  )}
                  <div className="fn-icon" style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16,
                    background: active ? t.color + "18" : "rgba(0,0,0,0.04)",
                    color: active ? t.color : "var(--muted)",
                  }}>
                    {t.icon}
                  </div>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Conteúdo da aba */}
          <div style={{ ...card, padding: 26, minHeight: 400 }}>

            {/* ── Visão Geral ── */}
            {tab === 0 && (
              <div>
                <SectionHeader icon="▣" color="#0071e3" title="Visão Geral" sub="Resumo financeiro e acesso rápido aos módulos" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                  <div style={{ background: "var(--off)", borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 12 }}>Gasto por plataforma</div>
                    {PLATS.map((p, i) => (
                      <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < PLATS.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <span style={{ fontSize: 18 }}>{p.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.label}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{fmt((summary as any)?.spendMonth?.[p.key])} no mês</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dark)" }}>{fmt((summary as any)?.spendToday?.[p.key])}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "var(--off)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700 }}>Últimas movimentações</div>
                    {(summary as any)?.recentMovements?.slice(0, 5).map((m: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                        <span>{m.type === "deposit" ? "📥" : m.type === "fee" ? "🏷️" : m.type === "transfer" ? "💸" : "📢"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.type === "deposit" ? "Depósito" : m.type === "fee" ? "Taxa" : m.type === "transfer" ? "Transferência" : m.platform || "Gasto"}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{new Date(m.createdAt).toLocaleDateString("pt-BR")}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: m.direction === "credit" ? "#30d158" : "var(--red)", flexShrink: 0 }}>
                          {m.direction === "credit" ? "+" : "−"}{fmt(m.amount)}
                        </div>
                      </div>
                    ))}
                    {!(summary as any)?.recentMovements?.length && (
                      <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Nenhuma movimentação ainda</div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Acesso rápido</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {TABS.slice(1).map((t, i) => (
                    <button key={t.id} onClick={() => setTab(i + 1)} className="fn-sc"
                      style={{ padding: "14px 10px", borderRadius: 12, border: "1.5px solid var(--border)", background: "white", cursor: "pointer", textAlign: "center", transition: "all .2s", fontFamily: "var(--font)" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, margin: "0 auto 8px", background: t.color + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: t.color }}>
                        {t.icon}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dark)", marginBottom: 4 }}>{t.label}</div>
                      <div className="fn-arr" style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Acessar →</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Depositar ── */}
            {tab === 1 && (
              <div>
                <SectionHeader icon="◫" color="#0071e3" title="Depositar via Pix" sub="Adicione saldo à sua wallet via Pix ou Cartão de Crédito" />
                {modeWallet ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ background: "rgba(0,113,227,0.06)", border: "1.5px solid rgba(0,113,227,0.2)", borderRadius: 14, padding: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", marginBottom: 6 }}>◈ Wallet ativa</div>
                      <div style={{ fontSize: 12 }}>Saldo atual: <strong style={{ color: "#30d158" }}>{fmt((balance as any)?.balance)}</strong></div>
                    </div>
                    <button className="fn-ab" onClick={() => setLocation("/media-budget")} style={actionBtn("var(--grad-primary)")}>
                      Ir para Depósito via Pix →
                    </button>
                  </div>
                ) : <DisabledMode label="Modo wallet desabilitado" sub="Configure em Admin → Financeiro" />}
              </div>
            )}

            {/* ── Créditos ── */}
            {tab === 2 && (
              <div>
                <SectionHeader icon="◈" color="#30d158" title="Comprar Créditos" sub="Guia para comprar créditos direto nas plataformas de anúncios" />
                {modeGuide ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      {PLATS.map(p => (
                        <div key={p.key} style={{ border: `2px solid ${p.color}20`, borderRadius: 14, padding: "18px 14px", textAlign: "center", background: p.color + "06" }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: p.color }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{fmt((summary as any)?.spendMonth?.[p.key])} no mês</div>
                        </div>
                      ))}
                    </div>
                    <button className="fn-ab" onClick={() => setLocation("/recharge-guide")} style={actionBtn("linear-gradient(135deg,#30d158,#248a3d)")}>
                      Ver Guia Completo →
                    </button>
                  </div>
                ) : <DisabledMode label="Modo guia desabilitado" sub="Configure em Admin → Financeiro" />}
              </div>
            )}

            {/* ── Rateio ── */}
            {tab === 3 && (
              <div>
                <SectionHeader icon="◉" color="#5856d6" title="Rateio de Verba" sub="Distribua o orçamento automaticamente por performance entre plataformas" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {PLATS.map(p => {
                    const pct = (ps as any)?.defaultDist?.[p.key] ?? 33;
                    return (
                      <div key={p.key} style={{ background: "var(--off)", borderRadius: 14, padding: "18px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>{p.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: p.color, marginBottom: 8 }}>{p.label}</div>
                        <div style={{ fontSize: 30, fontWeight: 900, color: p.color, letterSpacing: "-0.05em", lineHeight: 1 }}>{pct}%</div>
                        <div style={{ height: 5, background: "var(--border2)", borderRadius: 99, overflow: "hidden", marginTop: 12 }}>
                          <div style={{ width: pct + "%", height: "100%", background: p.color, borderRadius: 99, transition: "width .6s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button className="fn-ab" onClick={() => setLocation("/budget-distribution")} style={actionBtn("linear-gradient(135deg,#5856d6,#4c46c4)")}>
                  Configurar Rateio →
                </button>
              </div>
            )}

            {/* ── Transferir ── */}
            {tab === 4 && (
              <div>
                <SectionHeader icon="◍" color="#ff9f0a" title="Transferir via Asaas" sub="Envie saldo do Asaas para sua conta bancária cadastrada" />
                <div style={{ background: "rgba(255,159,10,0.08)", border: "1.5px solid rgba(255,159,10,0.25)", borderRadius: 14, padding: 22, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Saldo disponível Asaas</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: "#ff9f0a", letterSpacing: "-0.05em" }}>{fmt((asaas as any)?.balance)}</div>
                </div>
                <button className="fn-ab" onClick={() => setLocation("/platform-payment")} style={actionBtn("linear-gradient(135deg,#ff9f0a,#d97706)")}>
                  Realizar Transferência →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Back / Dots / Next ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...card, padding: "14px 20px" }}>

          {/* ← Back */}
          <button onClick={() => setTab(t => Math.max(0, t - 1))} disabled={isFirst} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 18px", borderRadius: 10,
            border: "1.5px solid var(--border)",
            background: isFirst ? "var(--off)" : "white",
            color: isFirst ? "var(--muted)" : "var(--dark)",
            fontWeight: 700, fontSize: 13, cursor: isFirst ? "not-allowed" : "pointer",
            opacity: isFirst ? 0.4 : 1, fontFamily: "var(--font)",
            boxShadow: isFirst ? "none" : "var(--shadow-xs)", transition: "all .2s",
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500, lineHeight: 1, marginBottom: 2 }}>Anterior</div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{!isFirst ? TABS[tab - 1].label : "—"}</div>
            </div>
          </button>

          {/* Dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {TABS.map((t, i) => (
              <button key={t.id} onClick={() => setTab(i)} style={{
                width: i === tab ? 22 : 7, height: 7, borderRadius: 99,
                border: "none", padding: 0, cursor: "pointer",
                background: i === tab ? t.color : "var(--border2)",
                transition: "all .3s var(--ease)",
              }} />
            ))}
          </div>

          {/* Next → */}
          <button onClick={() => setTab(t => Math.min(TABS.length - 1, t + 1))} disabled={isLast} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 18px", borderRadius: 10, border: "none",
            background: isLast ? "var(--off)" : "var(--grad-primary)",
            color: isLast ? "var(--muted)" : "white",
            fontWeight: 700, fontSize: 13, cursor: isLast ? "not-allowed" : "pointer",
            opacity: isLast ? 0.4 : 1, fontFamily: "var(--font)",
            boxShadow: isLast ? "none" : "var(--shadow-blue)", transition: "all .2s",
          }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 500, lineHeight: 1, marginBottom: 2, opacity: 0.75 }}>Próximo</div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{!isLast ? TABS[tab + 1].label : "—"}</div>
            </div>
            <span style={{ fontSize: 18, lineHeight: 1 }}>→</span>
          </button>
        </div>

      </div>
    </Layout>
  );
}
