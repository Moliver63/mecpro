/**
 * PlatformPayment.tsx
 *
 * Transfere saldo do Asaas para sua conta bancária
 * e guia a recarga em cada plataforma (Meta, Google, TikTok).
 */
import { useState } from "react";
import BackButton from "@/components/BackButton";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PLATFORMS = [
  {
    key: "meta",
    label: "Meta Ads",
    icon: "📘",
    color: "#1877f2",
    bg: "#eff6ff",
    rechargeUrl: "https://business.facebook.com/billing/manage/",
    steps: [
      "Acesse o painel Meta Ads",
      'Clique em "Configurações de pagamento"',
      'Selecione "Adicionar fundos"',
      "Escolha Pix, Boleto ou Cartão",
      "Informe o valor e confirme o pagamento",
    ],
  },
  {
    key: "google",
    label: "Google Ads",
    icon: "🔵",
    color: "#1a73e8",
    bg: "#f0f9ff",
    rechargeUrl: "https://ads.google.com/aw/billing/addfunds",
    steps: [
      "Acesse o painel Google Ads",
      'Clique em "Faturamento" → "Resumo"',
      'Clique em "Adicionar fundos"',
      "Selecione Pix como forma de pagamento",
      "Informe o valor → escaneia o QR Code gerado",
    ],
  },
  {
    key: "tiktok",
    label: "TikTok Ads",
    icon: "⬛",
    color: "#010101",
    bg: "#f8f8f8",
    rechargeUrl: "https://ads.tiktok.com/i18n/dashboard",
    steps: [
      "Acesse o painel TikTok Ads Manager",
      'Clique em "Conta" → "Saldo da conta"',
      'Clique em "Recarregar"',
      "Escolha Pix, Boleto ou Cartão",
      "Informe o valor e confirme",
    ],
  },
];

type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

export default function PlatformPayment() {
  const [pixKey,     setPixKey]     = useState("");
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("EMAIL");
  const [amount,     setAmount]     = useState("");
  const [desc,       setDesc]       = useState("");
  const [done,       setDone]       = useState<any>(null);
  const [loading,    setLoading]    = useState(false);
  const [openPlt,    setOpenPlt]    = useState<string | null>(null);

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;

  // Settings do admin
  const { data: ps } = (trpc as any).admin?.getPaymentSettings?.useQuery?.() ?? { data: null };

  // Saldo MECPro
  const { data: mecproBalance, refetch: refetchBalance } =
    (trpc as any).mediaBudget?.getBalance?.useQuery?.() ?? { data: null };

  // Saldo Asaas em tempo real
  const { data: asaasData, refetch: refetchAsaas } =
    (trpc as any).mediaBudget?.asaasBalance?.useQuery?.() ?? { data: null };

  // Rateio pendente de recarga
  const { data: recharge } =
    (trpc as any).mediaBudget?.rechargeNeeded?.useQuery?.() ?? { data: null };

  const transferMut = (trpc as any).mediaBudget?.asaasTransfer?.useMutation?.({
    onSuccess: (data: any) => {
      setDone(data);
      setLoading(false);
      refetchBalance?.();
      refetchAsaas?.();
      toast.success(`✅ R$ ${data.amount.toFixed(2)} transferidos!`);
    },
    onError: (e: any) => { setLoading(false); toast.error(e.message); },
  }) ?? { mutate: () => {} };

  // Bloquear se nenhum modo de pagamento ativo
  if (ps && !ps.modeWallet && !ps.modeGuide) {
    return (
      <Layout>
        <BackButton to="/financeiro" label="Financeiro" style={{ marginBottom: 20 }} />
      <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Sistema temporariamente indisponível</h2>
          <p style={{ color: "#64748b", fontSize: 14 }}>Os pagamentos estão desativados pelo administrador. Tente novamente mais tarde.</p>
        </div>
      </Layout>
    );
  }

  function handleTransfer() {
    if (!pixKey.trim()) { toast.error("Informe a chave Pix de destino"); return; }
    if (parsedAmount < 1) { toast.error("Informe o valor"); return; }
    if (mecproBalance && parsedAmount > mecproBalance.balance) {
      toast.error(`Saldo MECPro insuficiente (R$ ${mecproBalance.balance.toFixed(2)})`); return;
    }
    setLoading(true);
    (transferMut as any).mutate({
      amount: parsedAmount, pixKey: pixKey.trim(),
      pixKeyType, description: desc.trim() || undefined,
    });
  }

  // Monta lista de recargas pendentes por plataforma
  const pendingByPlatform: Record<string, number> = {};
  recharge?.summary?.byPlatform?.forEach((p: any) => {
    if (p.toRecharge > 0) pendingByPlatform[p.platform] = p.toRecharge;
  });
  const totalPending = Object.values(pendingByPlatform).reduce((s, v) => s + v, 0);

  return (
    <Layout>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "clamp(14px, 2.5vw, 28px) clamp(14px, 2vw, 20px)" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            💳 Pagamento das Plataformas
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Transfira o saldo do Asaas para sua conta e recarregue cada plataforma via Pix, Boleto ou Cartão
          </p>
        </div>

        {/* Saldos */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>SALDO MECPro (verba)</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#059669" }}>
              {mecproBalance ? R(mecproBalance.balance) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>disponível para transferir</div>
            {mecproBalance?.balance > 0 && (
              <button
                onClick={() => setAmount(mecproBalance.balance.toFixed(2))}
                style={{ marginTop: 8, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: "1px solid #059669", background: "#fff", color: "#059669", cursor: "pointer" }}>
                Usar saldo completo
              </button>
            )}
          </div>
          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>SALDO ASAAS (conta)</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#1877f2" }}>
              {asaasData ? R(asaasData.balance) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>disponível para transferir</div>
          </div>
        </div>

        {/* Alerta de recarga pendente */}
        {totalPending > 0 && (
          <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e", marginBottom: 8 }}>
              ⚠️ Recarga pendente: {R(totalPending)}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#92400e" }}>
              {Object.entries(pendingByPlatform).map(([plt, val]) => {
                const p = PLATFORMS.find(x => x.key === plt);
                return (
                  <span key={plt} style={{ background: "#fef3c7", padding: "3px 10px", borderRadius: 999, fontWeight: 700 }}>
                    {p?.icon} {p?.label}: {R(val)}
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#92400e", marginTop: 6 }}>
              Baseado no último rateio aprovado. Transfira abaixo e depois recarregue cada plataforma.
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

          {/* Formulário de transferência */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 24px" }}>
            <h2 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
              📤 Transferir do Asaas → sua conta
            </h2>

            {/* Tipo de chave */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Tipo de chave Pix</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
                {(["EMAIL","CPF","CNPJ","PHONE","EVP"] as PixKeyType[]).map(t => (
                  <button key={t} onClick={() => setPixKeyType(t)}
                    style={{ padding: "6px 4px", borderRadius: 8, border: `1.5px solid ${pixKeyType === t ? "#7c3aed" : "#e2e8f0"}`,
                      background: pixKeyType === t ? "#f5f3ff" : "#fff",
                      color: pixKeyType === t ? "#7c3aed" : "#64748b",
                      fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                    {t === "PHONE" ? "TEL" : t}
                  </button>
                ))}
              </div>
            </div>

            {/* Chave Pix */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                Chave Pix {pixKeyType === "EMAIL" ? "(seu e-mail)" : pixKeyType === "CPF" ? "(seu CPF)" : pixKeyType === "CNPJ" ? "(seu CNPJ)" : pixKeyType === "PHONE" ? "(seu telefone)" : "(chave aleatória)"}
              </label>
              <input value={pixKey} onChange={e => setPixKey(e.target.value)}
                placeholder={pixKeyType === "EMAIL" ? "seu@email.com" : pixKeyType === "PHONE" ? "+5547999999999" : "chave pix"}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13 }} />
            </div>

            {/* Valor */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                Valor (R$)
              </label>
              <input value={amount} onChange={e => setAmount(e.target.value)}
                placeholder={totalPending > 0 ? `Sugerido: ${totalPending.toFixed(2)}` : "0,00"}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 15, fontWeight: 700 }} />
              {totalPending > 0 && (
                <button onClick={() => setAmount(totalPending.toFixed(2))}
                  style={{ marginTop: 4, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, border: "1px solid #d97706", background: "#fffbeb", color: "#d97706", cursor: "pointer" }}>
                  Usar valor do rateio ({R(totalPending)})
                </button>
              )}
            </div>

            {/* Descrição */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Descrição (opcional)</label>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Ex: Recarga Meta Ads — cliente X"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13 }} />
            </div>

            <button onClick={handleTransfer} disabled={loading || parsedAmount < 1 || !pixKey.trim()}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700,
                background: loading || parsedAmount < 1 || !pixKey.trim() ? "#e2e8f0" : "linear-gradient(135deg,#7c3aed,#2563eb)",
                color: loading || parsedAmount < 1 || !pixKey.trim() ? "#94a3b8" : "#fff",
                cursor: loading || parsedAmount < 1 || !pixKey.trim() ? "not-allowed" : "pointer" }}>
              {loading ? "⏳ Transferindo..." : `Transferir ${parsedAmount > 0 ? R(parsedAmount) : ""} via Pix`}
            </button>

            {/* Resultado */}
            {done && (
              <div style={{ marginTop: 14, background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#059669", marginBottom: 6 }}>✅ Transferência realizada!</div>
                <div style={{ fontSize: 12, color: "#064e3b", lineHeight: 1.7 }}>
                  Valor: <strong>{R(done.amount)}</strong><br />
                  Destino: <strong>{done.pixKey}</strong><br />
                  Status: <strong>{done.status === "PENDING" ? "⏳ Processando" : done.status === "DONE" ? "✅ Concluída" : done.status}</strong><br />
                  ID Asaas: <code style={{ fontSize: 10 }}>{done.asaasId}</code>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "#059669" }}>
                  💡 Agora use esse valor para recarregar cada plataforma abaixo →
                </div>
              </div>
            )}
          </div>

          {/* Instruções de recarga */}
          <div>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
              📋 Como recarregar cada plataforma
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {PLATFORMS.map(plt => (
                <div key={plt.key} style={{ background: "#fff", border: `1.5px solid ${openPlt === plt.key ? plt.color + "60" : "#e2e8f0"}`, borderRadius: 14, overflow: "hidden" }}>

                  {/* Header clicável */}
                  <div
                    onClick={() => setOpenPlt(openPlt === plt.key ? null : plt.key)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer", background: openPlt === plt.key ? plt.bg : "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{plt.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: plt.color }}>{plt.label}</div>
                        {pendingByPlatform[plt.key] && (
                          <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700 }}>
                            Recarregar: {R(pendingByPlatform[plt.key])}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <a href={plt.rechargeUrl} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8, background: plt.color, color: "#fff", textDecoration: "none" }}>
                        Abrir painel →
                      </a>
                      <span style={{ color: "#94a3b8", fontSize: 16 }}>{openPlt === plt.key ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Passos */}
                  {openPlt === plt.key && (
                    <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${plt.color}20` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 10, marginTop: 12 }}>
                        Passo a passo:
                      </div>
                      {plt.steps.map((step, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: plt.color, color: "#fff",
                            fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                            {i + 1}
                          </div>
                          <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>{step}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 11, color: "#64748b" }}>
                        💳 Aceita: Pix · Boleto · Cartão de crédito/débito
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Aviso */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
          ℹ️ <strong>Como funciona:</strong> O saldo do Asaas é transferido para sua conta bancária via Pix. Com o dinheiro na conta, você acessa o painel de cada plataforma, clica em "Adicionar fundos" e escolhe Pix — a plataforma gera um QR Code que você paga pelo app do banco. O valor é creditado em minutos.
        </div>
      </div>
    </Layout>
  );
}
