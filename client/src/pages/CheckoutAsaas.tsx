/**
 * CheckoutAsaas.tsx — Checkout via Asaas (Pix ou Cartão de Crédito)
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
  const search  = useSearch();
  const params  = new URLSearchParams(search);
  const plan    = (params.get("plan")    || "premium") as "basic" | "premium" | "vip";
  const billing = (params.get("billing") || "monthly") as "monthly" | "yearly";
  const subId   = params.get("sub") || null;
  const { user } = useAuth();

  const [method, setMethod]   = useState<"pix" | "credit_card">("pix");
  const [cpf, setCpf]         = useState("");
  const [card, setCard]       = useState({ holderName:"", number:"", expiryMonth:"", expiryYear:"", ccv:"" });
  const setCardField = (f: keyof typeof card, v: string) => setCard(p => ({ ...p, [f]: v }));
  const [loading, setLoading] = useState(false);
  const [pix, setPix]         = useState<{ code: string; qr: string; expires: string } | null>(null);

  const checkout  = trpc.subscriptions.createCheckout.useMutation();
  const subStatus = trpc.subscriptions.getCheckoutPix.useQuery(
    { subId: subId! },
    { enabled: !!subId, retry: 3, retryDelay: 2000 }
  );

  useEffect(() => {
    const d = subStatus.data as any;
    if (d?.pixCode && !pix) setPix({ code: d.pixCode, qr: d.pixQr || "", expires: d.expiresAt || "" });
  }, [subStatus.data]);

  const monthly = PLAN_PRICES[plan] || 197;
  const amount  = billing === "yearly" ? Math.floor(monthly * 0.8) * 12 : monthly;
  const label   = PLAN_LABELS[plan] || plan;

  async function handlePay() {
    if (!cpf.replace(/\D/g, "").match(/^\d{11}$|\d{14}$/)) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido"); return;
    }
    if (method === "credit_card") {
      if (!card.holderName.trim())                     { toast.error("Informe o nome no cartão"); return; }
      if (card.number.replace(/\s/g,"").length < 13)   { toast.error("Número do cartão inválido"); return; }
      if (!card.expiryMonth || !card.expiryYear)       { toast.error("Informe a validade do cartão"); return; }
      if (!card.ccv || card.ccv.length < 3)            { toast.error("CVV inválido"); return; }
    }
    setLoading(true);
    try {
      const result = await checkout.mutateAsync({
        planSlug: plan, billing, cpfCnpj: cpf,
        paymentMethod: method,
        card: method === "credit_card" ? card : undefined,
      }) as any;
      if (result.pixCode) {
        setPix({ code: result.pixCode, qr: result.pixQr || "", expires: result.expiresAt || "" });
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao processar pagamento.");
    } finally { setLoading(false); }
  }

  function copyPix() {
    if (!pix?.code) return;
    navigator.clipboard.writeText(pix.code).then(() => toast.success("Código Pix copiado!"));
  }

  if (!user) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}><p>Redirecionando...</p></div>;

  const inp: React.CSSProperties = { width:"100%", padding:"11px 14px", borderRadius:10, border:"1.5px solid #d1d5db", fontSize:14, outline:"none", fontFamily:"inherit", boxSizing:"border-box", background:"#fff", color:"#111827" };
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.4 };

  return (
    <div style={{ fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", minHeight:"100vh", background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px 16px" }}>
      <div style={{ maxWidth:440, width:"100%" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <img src="/logo-512.png" alt="MECProAI" height={44} style={{ borderRadius:12, marginBottom:14 }} />
          <h1 style={{ fontSize:21, fontWeight:800, color:"#111827", margin:"0 0 4px" }}>Assinar plano {label}</h1>
          <p style={{ fontSize:13, color:"#6b7280", margin:0 }}>Pagamento seguro via Asaas</p>
        </div>

        {/* Resumo */}
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px 22px", marginBottom:18 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:14, fontWeight:700, color:"#111827" }}>Plano {label}</span>
            <span style={{ fontSize:11, background:"#f0fdf4", color:"#16a34a", padding:"3px 10px", borderRadius:99, fontWeight:700 }}>{billing === "yearly" ? "Anual · 20% off" : "Mensal"}</span>
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:4, marginTop:8 }}>
            <span style={{ fontSize:30, fontWeight:900, color:"#16a34a", letterSpacing:"-1px" }}>R$ {amount.toLocaleString("pt-BR")}</span>
            <span style={{ fontSize:13, color:"#9ca3af" }}>/{billing === "yearly" ? "ano" : "mês"}</span>
          </div>
          {billing === "yearly" && <p style={{ fontSize:12, color:"#16a34a", marginTop:4, fontWeight:600 }}>Você economiza R$ {monthly * 12 - amount}/ano</p>}
        </div>

        {/* Loading redirect */}
        {subId && !pix && subStatus.isLoading && (
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"32px", textAlign:"center" }}>
            <p style={{ fontSize:22, marginBottom:8 }}>⏳</p>
            <p style={{ fontSize:15, fontWeight:700, color:"#111827" }}>Gerando QR Code...</p>
            <p style={{ fontSize:13, color:"#6b7280", marginTop:6 }}>Aguarde alguns segundos</p>
          </div>
        )}

        {/* Formulário */}
        {!pix && !subId && (
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"22px" }}>

            {/* Seletor de método */}
            <div style={{ marginBottom:20 }}>
              <p style={{ ...lbl, marginBottom:10 }}>Forma de pagamento</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {(["pix","credit_card"] as const).map(m => (
                  <button key={m} onClick={() => setMethod(m)} style={{
                    padding:"12px 8px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14,
                    border: method === m ? `2px solid ${m === "pix" ? "#16a34a" : "#2563eb"}` : "2px solid #e5e7eb",
                    background: method === m ? (m === "pix" ? "#f0fdf4" : "#eff6ff") : "#fafafa",
                    color: method === m ? (m === "pix" ? "#16a34a" : "#2563eb") : "#6b7280",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all 0.15s",
                  }}>
                    <span style={{ fontSize:18 }}>{m === "pix" ? "⚡" : "💳"}</span>
                    {m === "pix" ? "Pix" : "Cartão"}
                  </button>
                ))}
              </div>
            </div>

            {/* CPF/CNPJ */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>CPF ou CNPJ *</label>
              <input value={cpf} onChange={e => setCpf(e.target.value)}
                placeholder={method === "pix" ? "000.000.000-00" : "CPF do titular"}
                maxLength={18} style={inp} />
              <p style={{ fontSize:11, color:"#9ca3af", marginTop:5 }}>
                {method === "pix" ? "Obrigatório para geração do Pix" : "CPF/CNPJ do titular do cartão"}
              </p>
            </div>

            {/* Campos do cartão */}
            {method === "credit_card" && (
              <div style={{ borderTop:"1px solid #f3f4f6", paddingTop:16 }}>
                <p style={{ ...lbl, color:"#2563eb", marginBottom:14 }}>Dados do cartão</p>

                <div style={{ marginBottom:14 }}>
                  <label style={lbl}>Nome impresso no cartão</label>
                  <input style={inp} placeholder="NOME SOBRENOME"
                    value={card.holderName}
                    onChange={e => setCardField("holderName", e.target.value.toUpperCase())} />
                </div>

                <div style={{ marginBottom:14 }}>
                  <label style={lbl}>Número do cartão</label>
                  <input style={{ ...inp, letterSpacing:3, fontFamily:"monospace,sans-serif" }}
                    placeholder="0000 0000 0000 0000" maxLength={19}
                    value={card.number}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g,"").slice(0,16);
                      setCardField("number", v.replace(/(.{4})/g,"$1 ").trim());
                    }} />
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:8 }}>
                  <div>
                    <label style={lbl}>Mês</label>
                    <select style={{ ...inp, paddingTop:10, paddingBottom:10 }}
                      value={card.expiryMonth} onChange={e => setCardField("expiryMonth", e.target.value)}>
                      <option value="">MM</option>
                      {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Ano</label>
                    <select style={{ ...inp, paddingTop:10, paddingBottom:10 }}
                      value={card.expiryYear} onChange={e => setCardField("expiryYear", e.target.value)}>
                      <option value="">AAAA</option>
                      {Array.from({length:10},(_,i)=>String(new Date().getFullYear()+i)).map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>CVV</label>
                    <input style={inp} placeholder="123" maxLength={4}
                      value={card.ccv} onChange={e => setCardField("ccv", e.target.value.replace(/\D/g,""))} />
                  </div>
                </div>

                <p style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>
                  🔒 Dados transmitidos com criptografia
                </p>
              </div>
            )}

            {/* Botão */}
            <button onClick={handlePay} disabled={loading} style={{
              width:"100%", marginTop:20,
              background: loading ? "#9ca3af" : method === "pix" ? "#16a34a" : "#2563eb",
              color:"#fff", border:"none", borderRadius:10, padding:"14px 0",
              fontSize:15, fontWeight:700, cursor: loading ? "not-allowed" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              {loading
                ? (method === "pix" ? "Gerando Pix..." : "Processando cartão...")
                : method === "pix"
                  ? `⚡ Pagar R$ ${amount.toLocaleString("pt-BR")} com Pix`
                  : `💳 Pagar R$ ${amount.toLocaleString("pt-BR")} com Cartão`}
            </button>

            <p style={{ textAlign:"center", fontSize:11, color:"#9ca3af", marginTop:10 }}>
              🔒 Pagamento processado pela Asaas · PCI DSS compliant
            </p>
          </div>
        )}

        {/* QR Code Pix */}
        {pix && (
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"24px", textAlign:"center" }}>
            <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
            <h2 style={{ fontSize:17, fontWeight:800, color:"#111827", marginBottom:4 }}>Pix gerado!</h2>
            <p style={{ fontSize:13, color:"#6b7280", marginBottom:20 }}>Escaneie o QR Code ou copie o código</p>
            {pix.qr && (
              <img src={`data:image/png;base64,${pix.qr}`} alt="QR Code"
                style={{ width:200, height:200, margin:"0 auto 16px", display:"block", borderRadius:12, border:"1px solid #e5e7eb" }} />
            )}
            <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 14px", marginBottom:14, wordBreak:"break-all", fontSize:11, color:"#374151", textAlign:"left", maxHeight:80, overflowY:"auto" }}>
              {pix.code}
            </div>
            <button onClick={copyPix} style={{ width:"100%", background:"#16a34a", color:"#fff", border:"none", borderRadius:10, padding:"13px 0", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:10 }}>
              📋 Copiar código Pix
            </button>
            <button onClick={() => setLocation("/dashboard")} style={{ width:"100%", background:"transparent", color:"#6b7280", border:"1px solid #e5e7eb", borderRadius:10, padding:"11px 0", fontSize:14, fontWeight:600, cursor:"pointer" }}>
              Ir para o Dashboard
            </button>
            <p style={{ fontSize:11, color:"#9ca3af", marginTop:12 }}>Plano ativado em até 5 minutos após o pagamento.</p>
          </div>
        )}

        <p style={{ textAlign:"center", fontSize:12, color:"#9ca3af", marginTop:16 }}>
          <button onClick={() => setLocation("/pricing")} style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", textDecoration:"underline" }}>
            ← Voltar aos planos
          </button>
        </p>
      </div>
    </div>
  );
}
