/**
 * AdminFinanceiro.tsx — Painel financeiro + controles de pagamento
 */
import { useState, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Toggle({ value, onChange, color = "#0071e3" }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 48, height: 26, borderRadius: 13, cursor: "pointer", position: "relative",
      background: value ? color : "#e2e8f0",
      transition: "background 0.25s cubic-bezier(0.34,1.56,0.64,1)",
      boxShadow: value ? `0 0 0 3px ${color}28` : "none",
      flexShrink: 0,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%", background: "white",
        position: "absolute", top: 3,
        left: value ? 25 : 3,
        transition: "left 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
      }} />
    </div>
  );
}

export default function AdminFinanceiro() {
  // Payment settings
  const { data: ps, refetch: refetchPS } = (trpc as any).admin?.getPaymentSettings?.useQuery?.() ?? { data: null };
  const savePS = (trpc as any).admin?.savePaymentSettings?.useMutation?.({
    onSuccess: () => { toast.success("◎ Configurações salvas!"); refetchPS?.(); },
    onError:   (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  // Financial overview
  const { data: overview, isLoading } = (trpc as any).admin?.financialOverview?.useQuery?.() ?? { data: null, isLoading: true };

  // Local state para settings
  const [modeWallet,  setModeWallet]  = useState(true);
  const [modeGuide,   setModeGuide]   = useState(true);
  const [feePercent,  setFeePercent]  = useState(10);
  const [dist,        setDist]        = useState({ meta: 50, google: 30, tiktok: 20 });
  const [landingMode, setLandingMode] = useState<"promo"|"normal">("normal");
  const [activeTab,   setActiveTab]   = useState<"overview"|"settings"|"transactions"|"creditos">("overview");

  // Controle de créditos
  const { data: userBalances, refetch: refetchBalances, isLoading: loadingBalances } =
    (trpc as any).admin?.listUserBalances?.useQuery?.() ?? { data: [], isLoading: true };
  const adjustCredits = (trpc as any).admin?.adjustUserCredits?.useMutation?.({
    onSuccess: () => { toast.success("✅ Créditos ajustados!"); refetchBalances?.(); setAdjustModal(null); },
    onError:   (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };
  const toggleFreeze = (trpc as any).admin?.toggleFreezeUser?.useMutation?.({
    onSuccess: () => { toast.success("✅ Status atualizado!"); refetchBalances?.(); },
    onError:   (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  const [adjustModal, setAdjustModal] = useState<{ userId: number; email: string; balance: number; frozen: boolean } | null>(null);
  const [adjustAmt,   setAdjustAmt]   = useState("");
  const [adjustNote,  setAdjustNote]  = useState("");
  const [searchUser,  setSearchUser]  = useState("");

  useEffect(() => {
    if (ps) {
      setModeWallet(ps.modeWallet);
      setModeGuide(ps.modeGuide);
      setFeePercent(ps.feePercent);
      if (ps.landingMode) setLandingMode(ps.landingMode);
      setDist(ps.defaultDist);
    }
  }, [ps]);

  function handleSaveSettings() {
    const totalDist = dist.meta + dist.google + dist.tiktok;
    if (Math.abs(totalDist - 100) > 1) {
      toast.error(`Distribuição deve somar 100% (atual: ${totalDist}%)`);
      return;
    }
    (savePS as any).mutate({ modeWallet, modeGuide, feePercent, defaultDist: dist, landingMode });
  }

  const tabs = [
    { key: "overview",     label: "📊 Visão Geral" },
    { key: "creditos",     label: "💰 Créditos" },
    { key: "settings",     label: "⚙️ Configurações" },
    { key: "transactions", label: "📋 Transações" },
  ];

  return (
    <Layout>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            💰 Financeiro — Painel Admin
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Controle de pagamentos, wallets e configurações do motor financeiro
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "rgba(0,0,0,0.04)", padding: 4, borderRadius: 12, width: "fit-content" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: "8px 18px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                background: activeTab === t.key ? "#fff" : "transparent",
                color:      activeTab === t.key ? "#0f172a" : "#64748b",
                boxShadow:  activeTab === t.key ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: OVERVIEW ── */}
        {activeTab === "overview" && (
          <div>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Saldo total (todos usuários)", value: R(overview?.totalBalance),   icon: "◈", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0" },
                { label: "Total depositado",             value: R(overview?.totalDeposited),  icon: "📥", color: "#0071e3", bg: "#eff6ff", border: "#bfdbfe" },
                { label: "Total de taxas (receita)",     value: R(overview?.totalFees),        icon: "🏷️", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
                { label: "Total em anúncios",            value: R(overview?.totalSpend),       icon: "📢", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
              ].map(m => (
                <div key={m.label} style={{ background: m.bg, border: `1.5px solid ${m.border}`, borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{m.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: m.color }}>{isLoading ? "…" : m.value}</div>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* Modos ativos */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 22px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>Modos de pagamento ativos</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { key: "wallet", label: "Modo A — Wallet Interna", desc: "Cliente deposita via Pix/Cartão no MECPro", active: ps?.modeWallet ?? true, icon: "💳" },
                  { key: "guide",  label: "Modo B — Guia de Compra",  desc: "MECPro guia cliente a comprar diretamente nas plataformas", active: ps?.modeGuide ?? true, icon: "🛒" },
                ].map(m => (
                  <div key={m.key} style={{ padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${m.active ? "#0071e330" : "#e2e8f0"}`, background: m.active ? "#eff6ff" : "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: m.active ? "#0071e3" : "#64748b" }}>{m.icon} {m.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: m.active ? "#0071e3" : "#e2e8f0", color: m.active ? "#fff" : "#64748b" }}>
                        {m.active ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top usuários */}
            {overview?.topUsers?.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                  👑 Top usuários por saldo
                </div>
                {overview.topUsers.map((u: any, i: number) => (
                  <div key={u.userId} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: i < overview.topUsers.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === 0 ? "#fbbf24" : "#e2e8f0", color: i === 0 ? "#fff" : "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{u.name || u.email}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{u.email}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{R(u.balance)}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>dep. {R(u.totalDeposited)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SETTINGS ── */}
        {activeTab === "settings" && (
          <div style={{ display: "grid", gap: 20 }}>

            {/* Modos de pagamento */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 24px" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800 }}>💳 Modos de Pagamento</h2>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>Ative ou desative cada modo para todos os usuários da plataforma</p>

              {/* Modo A */}
              <div style={{ padding: "18px", borderRadius: 14, border: `2px solid ${modeWallet ? "#0071e330" : "#e2e8f0"}`, background: modeWallet ? "#eff6ff" : "#f8fafc", marginBottom: 14, transition: "all 0.25s" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>💳</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: modeWallet ? "#0071e3" : "#0f172a" }}>Modo A — Wallet Interna</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: modeWallet ? "#0071e3" : "#e2e8f0", color: modeWallet ? "#fff" : "#64748b" }}>
                        {modeWallet ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 8px", lineHeight: 1.6 }}>
                      Cliente deposita Pix/Cartão no MECPro → MECPro controla saldo → Transfere para conta bancária → Cliente recarrega as plataformas
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#64748b" }}>◎ Controle total do saldo</span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#64748b" }}>◎ Pausa automática</span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#fef2f2", color: "#dc2626" }}>⚠️ Intermediação financeira</span>
                    </div>
                  </div>
                  <Toggle value={modeWallet} onChange={setModeWallet} color="#0071e3" />
                </div>
              </div>

              {/* Modo B */}
              <div style={{ padding: "18px", borderRadius: 14, border: `2px solid ${modeGuide ? "#05966930" : "#e2e8f0"}`, background: modeGuide ? "#f0fdf4" : "#f8fafc", transition: "all 0.25s" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>🛒</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: modeGuide ? "#059669" : "#0f172a" }}>Modo B — Guia de Compra</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: modeGuide ? "#059669" : "#e2e8f0", color: modeGuide ? "#fff" : "#64748b" }}>
                        {modeGuide ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 8px", lineHeight: 1.6 }}>
                      MECPro cobra 10% de taxa → calcula rateio → guia o cliente a comprar crédito direto em cada plataforma com o valor exato
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f0fdf4", color: "#059669" }}>◎ Zero intermediação</span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f0fdf4", color: "#059669" }}>◎ Cliente paga direto</span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f0fdf4", color: "#059669" }}>◎ 100% legal</span>
                    </div>
                  </div>
                  <Toggle value={modeGuide} onChange={setModeGuide} color="#059669" />
                </div>
              </div>

              {!modeWallet && !modeGuide && (
                <div style={{ marginTop: 12, padding: "10px 16px", background: "#fef2f2", borderRadius: 10, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                  ⚠️ Atenção: ambos os modos estão desativados. Os clientes não terão acesso ao sistema de pagamento.
                </div>
              )}
            </div>

            {/* Taxa de gestão */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 24px" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800 }}>🏷️ Taxa de Gestão</h2>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>Percentual descontado sobre cada depósito</p>

              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="range" min={0} max={30} step={1} value={feePercent}
                    onChange={e => setFeePercent(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#0071e3" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    <span>0%</span><span>15%</span><span>30%</span>
                  </div>
                </div>
                <div style={{ width: 80, textAlign: "center", padding: "12px", background: "#eff6ff", borderRadius: 12, border: "1.5px solid #0071e330" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#0071e3" }}>{feePercent}%</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>taxa</div>
                </div>
              </div>

              <div style={{ marginTop: 14, padding: "12px 16px", background: "#f8fafc", borderRadius: 10, fontSize: 12, color: "#64748b" }}>
                Exemplo: cliente deposita R$ 1.000 → taxa de {feePercent}% = R$ {(1000 * feePercent / 100).toFixed(2)} → R$ {(1000 - 1000 * feePercent / 100).toFixed(2)} para anúncios
              </div>
            </div>

            {/* ── Modo da Página Inicial ─────────────────────────────────── */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 24px" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>🏠 Modo da Página Inicial</h2>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
                Controla qual versão da landing page (<strong>mecproai.com</strong>) é exibida para visitantes.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {([
                  {
                    value: "promo",
                    label: "🔥 Modo Promoção",
                    desc: "Exibe a landing com oferta do plano anual, banner, crédito de 60%, contadores e urgência.",
                    color: "#16a34a",
                    bg: "#f0fdf4",
                    border: "#86efac",
                  },
                  {
                    value: "normal",
                    label: "🏢 Modo Normal",
                    desc: "Exibe a landing padrão sem promoção — foco em apresentação da plataforma e planos mensais.",
                    color: "#6b7280",
                    bg: "#f9fafb",
                    border: "#e5e7eb",
                  },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLandingMode(opt.value)}
                    style={{
                      padding: "18px 20px", borderRadius: 14, textAlign: "left", cursor: "pointer",
                      border: `2px solid ${landingMode === opt.value ? opt.border : "#e5e7eb"}`,
                      background: landingMode === opt.value ? opt.bg : "#fff",
                      transition: "all .15s", fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: landingMode === opt.value ? opt.color : "#374151" }}>
                        {opt.label}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                        background: landingMode === opt.value ? opt.color : "#e5e7eb",
                        color: landingMode === opt.value ? "#fff" : "#6b7280",
                      }}>
                        {landingMode === opt.value ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>{opt.desc}</p>
                  </button>
                ))}
              </div>

              {landingMode === "promo" && (
                <div style={{ marginTop: 14, padding: "12px 16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, fontSize: 12, color: "#15803d", lineHeight: 1.6 }}>
                  ✅ Landing com promoção ativa — banner, crédito de 60%, contador regressivo e checkout Asaas visíveis para visitantes.
                </div>
              )}
              {landingMode === "normal" && (
                <div style={{ marginTop: 14, padding: "12px 16px", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
                  ⚠️ Modo normal ativo — a promoção está oculta. Visitantes verão apenas a landing padrão sem oferta especial.
                </div>
              )}
            </div>

            {/* Distribuição padrão */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 24px" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800 }}>📊 Distribuição Padrão por Plataforma</h2>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>Percentual padrão quando não há dados de performance disponíveis. Total deve somar 100%.</p>

              {[
                { key: "meta",   label: "Meta Ads",   icon: "📘", color: "#1877f2" },
                { key: "google", label: "Google Ads",  icon: "🔵", color: "#1a73e8" },
                { key: "tiktok", label: "TikTok Ads",  icon: "⬛", color: "#010101" },
              ].map(p => (
                <div key={p.key} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{p.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: p.color, flex: 1 }}>{p.label}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: p.color, width: 44, textAlign: "right" }}>{(dist as any)[p.key]}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={5}
                    value={(dist as any)[p.key]}
                    onChange={e => setDist(prev => ({ ...prev, [p.key]: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: p.color }}
                  />
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: Math.abs(dist.meta + dist.google + dist.tiktok - 100) > 1 ? "#fef2f2" : "#f0fdf4", borderRadius: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Total:</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: Math.abs(dist.meta + dist.google + dist.tiktok - 100) > 1 ? "#dc2626" : "#059669" }}>
                  {dist.meta + dist.google + dist.tiktok}%
                  {Math.abs(dist.meta + dist.google + dist.tiktok - 100) > 1 && " ⚠️ deve ser 100%"}
                </span>
              </div>
            </div>

            {/* Salvar */}
            <button onClick={handleSaveSettings}
              disabled={(savePS as any).isPending}
              style={{ padding: "14px 32px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
                background: "linear-gradient(135deg,#0071e3,#5856d6)",
                color: "#fff", boxShadow: "0 4px 20px rgba(0,113,227,0.3)",
              }}>
              {(savePS as any).isPending ? "⏳ Salvando..." : "💾 Salvar configurações"}
            </button>
          </div>
        )}

        {/* ── TAB: CRÉDITOS ── */}
        {activeTab === "creditos" && (
          <div>
            {/* Busca e filtro */}
            <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                placeholder="🔍 Buscar por nome ou email…"
                value={searchUser} onChange={e => setSearchUser(e.target.value)}
                style={{ flex: 1, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
              <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                {loadingBalances ? "Carregando..." : `${(userBalances || []).length} usuários`}
              </div>
            </div>

            {/* Tabela de usuários */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 90px 100px", gap: 12, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>
                <span>Usuário</span>
                <span style={{ textAlign: "right" }}>Saldo</span>
                <span style={{ textAlign: "right" }}>Depositado</span>
                <span style={{ textAlign: "center" }}>Status</span>
                <span style={{ textAlign: "center" }}>Ações</span>
              </div>

              {(userBalances || [])
                .filter((u: any) =>
                  !searchUser ||
                  (u.email || "").toLowerCase().includes(searchUser.toLowerCase()) ||
                  (u.name  || "").toLowerCase().includes(searchUser.toLowerCase())
                )
                .map((u: any, i: number, arr: any[]) => (
                <div key={u.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 100px 100px 90px 100px",
                  gap: 12, padding: "12px 18px", alignItems: "center",
                  borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none",
                  background: u.frozen ? "rgba(239,68,68,0.03)" : "white",
                  transition: "background .1s",
                }}>
                  {/* Info usuário */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.name || "—"}
                      {u.frozen && <span style={{ marginLeft: 6, fontSize: 10, background: "#fef2f2", color: "#dc2626", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>🔒 CONGELADO</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
                      {(u.plan || "free").toUpperCase()} · ID {u.id}
                    </div>
                  </div>

                  {/* Saldo */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: u.balance > 0 ? "#059669" : "#94a3b8" }}>
                      {R(u.balance)}
                    </div>
                  </div>

                  {/* Depositado */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{R(u.totalDeposited)}</div>
                  </div>

                  {/* Status congelar */}
                  <div style={{ textAlign: "center" }}>
                    <button
                      onClick={() => (toggleFreeze as any).mutate({ userId: u.id, freeze: !u.frozen })}
                      title={u.frozen ? "Descongelar saldo" : "Congelar saldo"}
                      style={{
                        padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                        fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                        background: u.frozen ? "#fef2f2" : "#f0fdf4",
                        color: u.frozen ? "#dc2626" : "#059669",
                        transition: "all .15s",
                      }}>
                      {u.frozen ? "🔒 Congelado" : "✅ Ativo"}
                    </button>
                  </div>

                  {/* Ações */}
                  <div style={{ textAlign: "center", display: "flex", gap: 4, justifyContent: "center" }}>
                    <button
                      onClick={() => { setAdjustModal({ userId: u.id, email: u.email, balance: u.balance, frozen: u.frozen }); setAdjustAmt(""); setAdjustNote(""); }}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600, color: "#374151" }}>
                      ✏️ Ajustar
                    </button>
                  </div>
                </div>
              ))}

              {(userBalances || []).length === 0 && !loadingBalances && (
                <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Nenhum usuário com saldo cadastrado</div>
              )}
            </div>

            {/* Modal de ajuste de créditos */}
            {adjustModal && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
                onClick={() => setAdjustModal(null)}>
                <div style={{ background: "white", borderRadius: 18, padding: 28, maxWidth: 420, width: "90%", boxShadow: "0 24px 60px rgba(0,0,0,0.2)" }}
                  onClick={e => e.stopPropagation()}>

                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>✏️ Ajustar Créditos</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
                    {adjustModal.email} · Saldo atual: <strong style={{ color: "#059669" }}>{R(adjustModal.balance)}</strong>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                      Valor (positivo = adicionar, negativo = remover)
                    </label>
                    <input
                      type="number" step="0.01" placeholder="Ex: 50.00 ou -20.00"
                      value={adjustAmt} onChange={e => setAdjustAmt(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                    {adjustAmt && (
                      <div style={{ marginTop: 6, fontSize: 12, color: Number(adjustAmt) >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>
                        Novo saldo: {R(adjustModal.balance + Number(adjustAmt || 0))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                      Motivo (opcional)
                    </label>
                    <input
                      placeholder="Ex: Ajuste de cortesia, estorno..."
                      value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setAdjustModal(null)}
                      style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: "#374151" }}>
                      Cancelar
                    </button>
                    <button
                      disabled={!adjustAmt || isNaN(Number(adjustAmt)) || (adjustCredits as any).isPending}
                      onClick={() => (adjustCredits as any).mutate({ userId: adjustModal.userId, amount: Number(adjustAmt), reason: adjustNote || undefined })}
                      style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                        background: !adjustAmt || isNaN(Number(adjustAmt)) ? "#e2e8f0" : Number(adjustAmt) >= 0 ? "linear-gradient(135deg,#059669,#0284c7)" : "linear-gradient(135deg,#dc2626,#7c3aed)",
                        color: !adjustAmt || isNaN(Number(adjustAmt)) ? "#94a3b8" : "white",
                        opacity: (adjustCredits as any).isPending ? 0.7 : 1,
                      }}>
                      {(adjustCredits as any).isPending ? "⏳ Salvando..." : Number(adjustAmt) >= 0 ? `➕ Adicionar ${R(Number(adjustAmt || 0))}` : `➖ Remover ${R(Math.abs(Number(adjustAmt || 0)))}`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: TRANSACTIONS ── */}
        {activeTab === "transactions" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
              📋 Últimas 20 transações
            </div>
            {(overview?.recentTx || []).map((tx: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: i < (overview?.recentTx?.length - 1) ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  background: tx.type === "deposit" ? "#f0fdf4" : tx.type === "fee" ? "#fff7ed" : "#eff6ff" }}>
                  {tx.type === "deposit" ? "📥" : tx.type === "fee" ? "🏷️" : tx.method === "pix" ? "🟢" : "💳"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{tx.email}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {tx.type === "deposit" ? "Depósito" : tx.type === "fee" ? "Taxa" : "Gasto"} · {tx.method} · {new Date(tx.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: tx.type === "deposit" ? "#059669" : "#dc2626" }}>
                  {tx.type === "deposit" ? "+" : "−"}{R(tx.amount)}
                </div>
              </div>
            ))}
            {(!overview?.recentTx || overview.recentTx.length === 0) && (
              <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>Nenhuma transação ainda</div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
