/**
 * CheckoutAsaas.tsx — Página de checkout via Pix (Asaas)
 * Rota: /checkout/asaas?plan=premium&billing=monthly
 */
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const PLAN_LABELS: Record<string, string> = { basic: "Basic", premium: "Premium", vip: "VIP" };
const PLAN_PRICES: Record<string, number> = { basic: 97, premium: 197, vip: 397 };

export default function CheckoutAsaas() {
  const [, setLocation] = useLocation();
  const search   = useSearch();
  const params   = new URLSearchParams(search);
  const plan     = (params.get("plan") || "premium") as "basic" | "premium" | "vip";
  const billing  = (params.get("billing") || "monthly") as "monthly" | "yearly";
  const subId    = params.get("sub") || null;

  const { user } = useAuth();
  const [cpf, setCpf]         = useState("");
  const [loading, setLoading] = useState(false);
  const [method, setMethod]   = useState<"pix" | "credit_card">("pix");
  const [card, setCard]       = useState({ holderName:"", number:"", expiryMonth:"", expiryYear:"", ccv:"" });
  const setCardField = (f: keyof typeof card, v: string) => setCard(p => ({ ...p, [f]: v }));
  const [pix, setPix]         = useState<{ code: string; qr: string; expires: string } | null>(null);

  const checkout = trpc.subscriptions.createCheckout.useMutation();

  const subStatus = trpc.subscriptions.getCheckoutPix.useQuery(
    { subId: subId! },
    { enabled: !!subId, retry: 3, retryDelay: 2000 }
  );

  useEffect(() => {
    const d = subStatus.data as any;
    if (d?.pixCode && !pix) {
      setPix({ code: d.pixCode, qr: d.pixQr || "", expires: d.expiresAt || "" });
    }
  }, [subStatus.data]);


  const monthly  = PLAN_PRICES[plan] || 197;
  const amount   = billing === "yearly" ? Math.floor(monthly * 0.8) * 12 : monthly;
  const label    = PLAN_LABELS[plan] || plan;

  async function handlePay() {
    if (!cpf.replace(/\D/g, "").match(/^\d{11}$|\d{14}$/)) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido");
      return;
    }
    if (method === "credit_card") {
      if (!card.holderName.trim()) { toast.error("Informe o nome no cartão"); return; }
      if (card.number.replace(/\s/g, "").length < 13) { toast.error("Número do cartão inválido"); return; }
      if (!card.expiryMonth || !card.expiryYear) { toast.error("Informe a validade do cartão"); return; }
      if (!card.ccv || card.ccv.length < 3) { toast.error("CVV inválido"); return; }
    }
    setLoading(true);
    try {
      const result = await checkout.mutateAsync({
        planSlug: plan, billing, cpfCnpj: cpf,
        paymentMethod: method,
        card: method === "credit_card" ? card : undefined,
      }) as any;

      if (result.pixCode) {
        // Gateway retornou Pix direto
        setPix({ code: result.pixCode, qr: result.pixQr || "", expires: result.expiresAt || "" });
      } else if (result.url) {
        // Gateway retornou URL (Stripe fallback ou redirect)
        window.location.href = result.url;
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar pagamento");
    } finally {
      setLoading(false);
    }
  }

  function copyPix() {
    if (!pix?.code) return;
    navigator.clipboard.writeText(pix.code).then(() => toast.success("Código Pix copiado!"));
  }

  if (!user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p>Redirecionando...</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: 440, width: "100%" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/logo-512.png" alt="MECProAI" height={48} style={{ borderRadius: 12, marginBottom: 16 }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 6 }}>
            Assinar {label}
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280" }}>
            Pagamento seguro via Pix
          </p>
        </div>

        {/* Resumo do plano */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Plano {label}</span>
            <span style={{ fontSize: 11, background: "#f0fdf4", color: "#16a34a", padding: "3px 10px", borderRadius: 99, fontWeight: 700 }}>
              {billing === "yearly" ? "Anual · 20% off" : "Mensal"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: "#16a34a", letterSpacing: "-1px" }}>
              R$ {amount.toLocaleString("pt-BR")}
            </span>
            <span style={{ fontSize: 14, color: "#9ca3af" }}>
              /{billing === "yearly" ? "ano" : "mês"}
            </span>
          </div>
          {billing === "yearly" && (
            <p style={{ fontSize: 12, color: "#16a34a", marginTop: 4, fontWeight: 600 }}>
              Equivale a R$ {Math.floor(amount / 12)}/mês — você economiza R$ {monthly * 12 - amount}/ano
            </p>
          )}
        </div>

        {subId && !pix && subStatus.isLoading && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "32px", textAlign: "center" }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>⏳</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Gerando QR Code Pix...</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>Aguarde alguns segundos</p>
          </div>
        )}

        {!pix && !subId && (
          /* Formulário CPF/CNPJ */
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              CPF ou CNPJ *
            </label>
            <input
              value={cpf}
              onChange={e => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              maxLength={18}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 15, outline: "none", fontFamily: "inherit" }}
            />
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
              Necessário para emissão do Pix no Asaas
            </p>

            {/* Campos do cartão */}
            {method === "credit_card" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Nome no cartão</label>
                  <input className="input" placeholder="NOME SOBRENOME"
                    value={card.holderName}
                    onChange={e => setCardField("holderName", e.target.value.toUpperCase())}
                    style={{ width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Número do cartão</label>
                  <input className="input" placeholder="0000 0000 0000 0000" maxLength={19}
                    value={card.number}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                      setCardField("number", v.replace(/(.{4})/g, "$1 ").trim());
                    }}
                    style={{ width: "100%", boxSizing: "border-box", letterSpacing: 2 }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Mês</label>
                    <select className="input" value={card.expiryMonth}
                      onChange={e => setCardField("expiryMonth", e.target.value)} style={{ width: "100%" }}>
                      <option value="">MM</option>
                      {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m =>
                        <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Ano</label>
                    <select className="input" value={card.expiryYear}
                      onChange={e => setCardField("expiryYear", e.target.value)} style={{ width: "100%" }}>
                      <option value="">AAAA</option>
                      {Array.from({length:10},(_,i)=>String(new Date().getFullYear()+i)).map(y =>
                        <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>CVV</label>
                    <input className="input" placeholder="123" maxLength={4}
                      value={card.ccv}
                      onChange={e => setCardField("ccv", e.target.value.replace(/\D/g, ""))}
                      style={{ width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
            )}

            <button onClick={handlePay} disabled={loading}
              style={{ width: "100%", marginTop: 16, background: loading ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 10, padding: "14px 0", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "background .15s" }}>
              {loading ? "Gerando Pix..." : `Pagar R$ ${amount.toLocaleString("pt-BR")} via Pix`}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>🔒 Pagamento seguro via Asaas</span>
            </div>
          </div>
        )}

        {pix && (
          /* QR Code Pix */
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Pix gerado com sucesso!</h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
              Escaneie o QR Code ou copie o código abaixo
            </p>

            {pix.qr && (
              <img src={`data:image/png;base64,${pix.qr}`} alt="QR Code Pix"
                style={{ width: 200, height: 200, margin: "0 auto 16px", display: "block", borderRadius: 12, border: "1px solid #e5e7eb" }} />
            )}

            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", marginBottom: 14, wordBreak: "break-all", fontSize: 11, color: "#374151", textAlign: "left", maxHeight: 80, overflowY: "auto" }}>
              {pix.code}
            </div>

            <button onClick={copyPix}
              style={{ width: "100%", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              Copiar código Pix
            </button>

            <button onClick={() => setLocation("/dashboard")}
              style={{ width: "100%", background: "transparent", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Ir para o Dashboard
            </button>

            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 12 }}>
              Após o pagamento, seu plano será ativado automaticamente em até 5 minutos.
            </p>
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", marginTop: 16 }}>
          <button onClick={() => setLocation("/pricing")} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", textDecoration: "underline" }}>
            ← Voltar aos planos
          </button>
        </p>
      </div>
    </div>
  );
}
