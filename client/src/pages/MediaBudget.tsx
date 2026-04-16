/**
 * MediaBudget.tsx
 *
 * Página de gestão de verba de mídia.
 * O cliente deposita verba pelo MECPro (Pix ou Cartão).
 * 10% de taxa de gestão é descontada.
 * Admin aprova os depósitos e o saldo é creditado.
 */

import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const R = (v?: number | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Method = "pix" | "card";

export default function MediaBudget() {
  const { user } = useAuth();

  // Verifica se Modo A está habilitado pelo admin
  const { data: ps } = (trpc as any).admin?.getPaymentSettings?.useQuery?.() ?? { data: null };
  if (ps && !ps.modeWallet) {
    return (
      <Layout>
        <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Modo indisponível</h2>
          <p style={{ color: "#64748b", fontSize: 14 }}>
            O depósito via wallet interna está temporariamente desativado pelo administrador.<br />
            Use o <a href="/recharge-guide" style={{ color: "#0071e3" }}>Guia de Compra</a> para investir em anúncios.
          </p>
        </div>
      </Layout>
    );
  }
  const isAdmin = ["admin", "superadmin"].includes((user as any)?.role || "");

  const [amount,    setAmount]  = useState("");
  const [method,    setMethod]  = useState<Method>("pix");
  const [notes,     setNotes]   = useState("");
  const [cpf,       setCpf]     = useState("");
  const [pixData,   setPixData] = useState<any>(null);
  const [loading,   setLoading] = useState(false);

  const feePercent = 10;
  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;
  const feeAmount  = parsedAmount * feePercent / 100;
  const netAmount  = parsedAmount - feeAmount;

  // Saldo e histórico do cliente
  const { data: balance, refetch: refetchBalance } =
    (trpc as any).mediaBudget?.getBalance?.useQuery?.() ?? { data: null, refetch: () => {} };

  // Admin: depósitos pendentes
  const { data: pending, refetch: refetchPending } =
    (trpc as any).mediaBudget?.adminListPending?.useQuery?.() ?? { data: null, refetch: () => {} };

  const pixMutation = (trpc as any).mediaBudget?.requestPixDeposit?.useMutation?.({
    onSuccess: (data: any) => {
      setPixData(data);
      setLoading(false);
      toast.success("Solicitação de depósito criada! Realize o Pix para prosseguir.");
    },
    onError: (e: any) => { setLoading(false); toast.error(e.message); },
  }) ?? { mutate: () => {} };

  const approveMutation = (trpc as any).mediaBudget?.adminApprove?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success(`✅ Depósito aprovado! ${R(data.creditedAmount)} creditados.`);
      refetchPending?.();
      refetchBalance?.();
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {} };

  function handleDeposit() {
    if (parsedAmount < 50) { toast.error("Valor mínimo: R$ 50,00"); return; }
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length < 11) { toast.error("Informe um CPF ou CNPJ válido"); return; }
    setLoading(true);
    setPixData(null);
    if (method === "pix") {
      (pixMutation as any).mutate({ amount: parsedAmount, cpfCnpj: cpf.trim() || undefined, notes: notes.trim() || undefined });
    } else {
      toast.info("Pagamento por cartão em breve.");
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            💰 Verba de Mídia
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Deposite verba para suas campanhas. Taxa de gestão de {feePercent}% deduzida automaticamente.
          </p>
        </div>

        {/* Saldo atual */}
        {balance && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
            gap: 14, marginBottom: 24,
          }}>
            {[
              { label: "Saldo disponível", value: balance.balance,        color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", icon: "💰" },
              { label: "Total depositado", value: balance.totalDeposited,  color: "#1a73e8", bg: "#eff6ff", border: "#bfdbfe", icon: "📥" },
              { label: "Total de taxas",   value: balance.totalFees,       color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "🏷️" },
            ].map(m => (
              <div key={m.label} style={{ background: m.bg, border: `1.5px solid ${m.border}`, borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{R(m.value)}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 4 }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Formulário de depósito */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
              Nova recarga
            </h2>

            {/* Método */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                Método de pagamento
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { key: "pix",  label: "🟢 Pix",    sub: "Instantâneo · sem taxa extra" },
                  { key: "card", label: "💳 Cartão",  sub: "Crédito/Débito · em breve" },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMethod(m.key as Method)}
                    disabled={m.key === "card"}
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 10, cursor: m.key === "card" ? "not-allowed" : "pointer",
                      border: `2px solid ${method === m.key ? "#059669" : "#e2e8f0"}`,
                      background: method === m.key ? "#f0fdf4" : "#fff",
                      opacity: m.key === "card" ? .5 : 1,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{m.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Valor */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                Valor a depositar (R$)
              </label>
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Ex: 1000"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 15, fontWeight: 700 }}
              />
              {parsedAmount >= 50 && (
                <div style={{ marginTop: 8, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>Valor bruto:</span>
                    <strong>{R(parsedAmount)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#d97706" }}>
                    <span>Taxa de gestão ({feePercent}%):</span>
                    <strong>− {R(feeAmount)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, color: "#059669", borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
                    <span>Saldo creditado:</span>
                    <strong>{R(netAmount)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* CPF/CNPJ */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                CPF ou CNPJ <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14 }}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Necessário para emissão da cobrança Pix</span>
            </div>

            {/* Observações */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                Observações (opcional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex: verba para campanha de julho"
                rows={2}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical" }}
              />
            </div>

            <button
              onClick={handleDeposit}
              disabled={loading || parsedAmount < 50}
              style={{
                width: "100%", padding: "12px", borderRadius: 10, border: "none",
                background: loading || parsedAmount < 50 ? "#e2e8f0" : "linear-gradient(135deg,#059669,#10b981)",
                color: loading || parsedAmount < 50 ? "#94a3b8" : "#fff",
                fontSize: 14, fontWeight: 700, cursor: loading || parsedAmount < 50 ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "⏳ Gerando..." : `Solicitar recarga de ${R(parsedAmount)}`}
            </button>
          </div>

          {/* QR Code / instruções Pix */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
            {pixData ? (
              <div>
                <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                  🟢 Pix gerado — realize o pagamento
                </h2>

                {/* QR Code */}
                {pixData.pixQrCode && (
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <img
                      src={`data:image/png;base64,${pixData.pixQrCode}`}
                      alt="QR Code Pix"
                      style={{ width: 180, height: 180, borderRadius: 8, border: "2px solid #bbf7d0" }}
                    />
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "Valor a pagar", value: R(pixData.amount), color: "#1a73e8" },
                    { label: "Saldo creditado", value: R(pixData.netAmount), color: "#059669" },
                    { label: "Taxa de gestão", value: R(pixData.feeAmount), color: "#d97706" },
                    { label: "Prazo", value: "24 horas", color: "#64748b" },
                  ].map(m => (
                    <div key={m.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{m.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  ℹ️ {pixData.instructions}
                </div>

                {pixData.pixPayload && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(pixData.pixPayload); toast.success("Código Pix copiado!"); }}
                    style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #059669", background: "#fff", color: "#059669", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    📋 Copiar código Pix (Copia e Cola)
                  </button>
                )}
              </div>
            ) : (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#94a3b8", textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Como funciona</div>
                <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>
                  1. Informe o valor e clique em solicitar<br />
                  2. Realize o Pix para a chave indicada<br />
                  3. Admin confirma em até 2 horas<br />
                  4. Saldo creditado (taxa de 10% descontada)<br />
                  5. Use o saldo nas suas campanhas
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Histórico */}
        {balance?.history?.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>
              Histórico de recargas
            </h2>
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
              {balance.history.map((h: any, i: number) => (
                <div key={h.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 20px", gap: 12, flexWrap: "wrap",
                  borderBottom: i < balance.history.length - 1 ? "1px solid #f1f5f9" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 18 }}>{h.method === "pix" ? "🟢" : "💳"}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{R(h.amount)}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {new Date(h.createdAt).toLocaleDateString("pt-BR")} · {h.notes || "Recarga de mídia"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>+{R(h.netAmount)} creditado</div>
                      <div style={{ fontSize: 10, color: "#d97706" }}>taxa: {R(h.feeAmount)}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                      background: h.status === "approved" ? "#f0fdf4" : h.status === "pending" ? "#fffbeb" : "#fef2f2",
                      color:      h.status === "approved" ? "#059669" : h.status === "pending" ? "#d97706" : "#dc2626",
                    }}>
                      {h.status === "approved" ? "✓ Aprovado" : h.status === "pending" ? "⏳ Pendente" : "✗ Rejeitado"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Painel Admin */}
        {isAdmin && pending && pending.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#dc2626", marginBottom: 12 }}>
              🔴 Depósitos pendentes de aprovação ({pending.length})
            </h2>
            <div style={{ background: "#fff", border: "1.5px solid #fecaca", borderRadius: 14, overflow: "hidden" }}>
              {pending.map((p: any, i: number) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px", gap: 12, flexWrap: "wrap",
                  borderBottom: i < pending.length - 1 ? "1px solid #fee2e2" : "none",
                  background: "#fff",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                      {p.email} — {R(p.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {new Date(p.createdAt).toLocaleString("pt-BR")} · {p.method === "pix" ? "Pix" : "Cartão"}
                      {p.notes && ` · ${p.notes}`}
                    </div>
                    <div style={{ fontSize: 11, color: "#059669" }}>
                      Crédito líquido: {R(p.netAmount)} (taxa: {R(p.feeAmount)})
                    </div>
                  </div>
                  <button
                    onClick={() => (approveMutation as any).mutate({ depositId: p.id })}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    ✓ Aprovar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
