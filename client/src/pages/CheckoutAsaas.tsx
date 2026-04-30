/**
 * CheckoutAsaas.tsx — Página de checkout via Pix (Asaas)
 * Rota: /checkout/asaas?plan=premium&billing=monthly
 */
import { useState } from "react";
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

  const { user } = useAuth();
  const [cpf, setCpf]         = useState("");
  const [loading, setLoading] = useState(false);
  const [pix, setPix]         = useState<{ code: string; qr: string; expires: string } | null>(null);

  const checkout = trpc.subscriptions.createCheckout.useMutation();

  const monthly  = PLAN_PRICES[plan] || 197;
  const amount   = billing === "yearly" ? Math.floor(monthly * 0.8) * 12 : monthly;
  const label    = PLAN_LABELS[plan] || plan;

  async function handlePay() {
    if (!cpf.replace(/\D/g, "").match(/^\d{11}$|^\d{14}$/)) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido");
      return;
    }
    setLoading(true);
    try {
      const result = await checkout.mutateAsync({ planSlug: plan, billing, cpfCnpj: cpf }) as any;

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

        {!pix ? (
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

            <button onClick={handlePay} disabled={loading}
              style={{ width: "100%", marginTop: 16, background: loading ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 10, padding: "14px 0", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "background .15s" }}>
              {loading ? "Gerando Pix..." : `Pagar R$ ${amount.toLocaleString("pt-BR")} via Pix`}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>🔒 Pagamento seguro via Asaas</span>
            </div>
          </div>
        ) : (
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
