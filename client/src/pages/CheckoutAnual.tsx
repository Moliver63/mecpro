/**
 * CheckoutAnual.tsx
 * Página de checkout do plano anual via Asaas (Pix).
 * Inclui: seleção de plano, CPF/CNPJ, geração do QR Code,
 * exibição da taxa de administração (10%) e crédito líquido,
 * polling automático de confirmação e termos obrigatórios.
 */
import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Planos ───────────────────────────────────────────────────────────────────
const PLANS = [
  { slug: "basic"   as const, name: "Basic",   monthly: 97  },
  { slug: "premium" as const, name: "Premium",  monthly: 197, popular: true },
  { slug: "vip"     as const, name: "VIP",      monthly: 397 },
];
const annualPrice = (m: number) => Math.floor(m * 0.8) * 12;
const creditGross = (m: number) => Math.round(annualPrice(m) * 0.6);
const adminFee    = (m: number) => Math.round(annualPrice(m) * 0.10);
const creditNet   = (m: number) => creditGross(m) - adminFee(m);
const fmt         = (v: number) => `R$\u00a0${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

// ─── Formata CPF/CNPJ enquanto digita ────────────────────────────────────────
function maskDoc(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_,a,b,c,e) =>
      [a, b, c].filter(Boolean).join(".") + (e ? "-" + e : "")
    );
  }
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_,a,b,c,d2,e) =>
    [a,b,c].join(".") + "/" + d2 + (e ? "-" + e : "")
  );
}

// ─── Countdown 24h ────────────────────────────────────────────────────────────
function useCountdown(expiryIso: string | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!expiryIso) return;
    const end = new Date(expiryIso).getTime();
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiryIso]);
  const p = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return { h: p(left / 3.6e6), m: p((left % 3.6e6) / 6e4), s: p((left % 6e4) / 1e3) };
}

// ═════════════════════════════════════════════════════════════════════════════
export default function CheckoutAnual() {
  const [, setLocation] = useLocation();
  const search          = useSearch();
  const params          = new URLSearchParams(search);
  const initPlan        = (params.get("plan") as "basic" | "premium" | "vip") || "premium";

  const [planSlug,      setPlanSlug]      = useState<"basic"|"premium"|"vip">(initPlan);
  const [doc,           setDoc]           = useState("");
  const [termsOk,       setTermsOk]       = useState(false);
  const [termsErr,      setTermsErr]      = useState(false);
  const [showTerms,     setShowTerms]     = useState(false);
  const [step,          setStep]          = useState<"form"|"pix"|"paid">("form");
  const [pixData,       setPixData]       = useState<any>(null);
  const [polling,       setPolling]       = useState(false);
  const pollingRef                        = useRef<ReturnType<typeof setInterval> | null>(null);

  const plan = PLANS.find(p => p.slug === planSlug)!;
  const { h, m, s } = useCountdown(pixData?.pixExpiry ?? null);

  // ─── TRPC mutation ──────────────────────────────────────────────────────────
  const mutation = (trpc as any).subscriptions?.createAsaasAnnual?.useMutation?.({
    onSuccess: (data: any) => {
      setPixData(data);
      setStep("pix");
      startPolling(data);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao gerar pagamento"),
  }) ?? { mutate: () => {}, isPending: false };

  // ─── Polling de confirmação ─────────────────────────────────────────────────
  function startPolling(data: any) {
    setPolling(true);
    let tries = 0;
    pollingRef.current = setInterval(async () => {
      tries++;
      if (tries > 120) { clearInterval(pollingRef.current!); setPolling(false); return; }
      try {
        const res  = await fetch("/trpc/mediaBudget.getBalance", { credentials: "include" });
        const json = await res.json();
        const bal  = json?.result?.data?.balance ?? 0;
        if (bal > 0) {
          clearInterval(pollingRef.current!);
          setPolling(false);
          setStep("paid");
          toast.success("🎉 Pix confirmado! Crédito liberado na sua conta.");
        }
      } catch { /* silencioso */ }
    }, 5000);
  }

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  // ─── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (!termsOk) { setTermsErr(true); return; }
    const clean = doc.replace(/\D/g, "");
    if (clean.length < 11) { toast.error("Informe um CPF ou CNPJ válido"); return; }
    setTermsErr(false);
    mutation.mutate({ planSlug, cpfCnpj: clean });
  }

  function copyPix() {
    navigator.clipboard.writeText(pixData?.pixPayload || "");
    toast.success("Código Pix copiado!");
  }

  // ─── Estilos ─────────────────────────────────────────────────────────────────
  const G = "#16a34a";

  return (
    <div style={{ minHeight:"100vh", background:"#f9fafb", fontFamily:"'Geist',system-ui,sans-serif" }}>
      <style>{`
        @keyframes pulse-g{0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,.5)}60%{box-shadow:0 0 0 14px rgba(22,163,74,0)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
        .cta{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-weight:900;border:none;cursor:pointer;border-radius:13px;transition:transform .15s,filter .15s;animation:pulse-g 2.8s infinite;font-family:inherit}
        .cta:hover{transform:scale(1.03);filter:brightness(1.08)}
        .cta:disabled{animation:none;opacity:.6;cursor:not-allowed}
        .card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:28px}
        .fade{animation:fadeIn .5s ease both}
      `}</style>

      {/* NAV */}
      <nav style={{ height:58, background:"#fff", borderBottom:"1px solid #f0f0f0", display:"flex", alignItems:"center", padding:"0 24px", position:"sticky", top:0, zIndex:100 }}>
        <button onClick={() => setLocation("/")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#6b7280", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
          ← Voltar
        </button>
        <div style={{ marginLeft:"auto", fontSize:18, fontWeight:900, color:"#111" }}>
          MEC<span style={{ color:G }}>PRO</span>
        </div>
      </nav>

      <div style={{ maxWidth:620, margin:"0 auto", padding:"40px 20px 80px" }}>

        {/* ══ STEP: PAID ════════════════════════════════════════════════════ */}
        {step === "paid" && (
          <div className="card fade" style={{ textAlign:"center", padding:"48px 32px" }}>
            <div style={{ fontSize:64, marginBottom:20 }}>🎉</div>
            <h1 style={{ fontSize:28, fontWeight:900, color:"#111", marginBottom:12, letterSpacing:-1 }}>
              Pix confirmado!
            </h1>
            <p style={{ fontSize:16, color:"#6b7280", lineHeight:1.7, marginBottom:8 }}>
              Seu pagamento foi recebido. O crédito de{" "}
              <strong style={{ color:G }}>{fmt(pixData?.creditNet ?? 0)}</strong>{" "}
              será liberado na sua conta em até <strong>10 dias úteis</strong>.
            </p>
            <p style={{ fontSize:13, color:"#9ca3af", marginBottom:32 }}>
              Você receberá um e-mail de confirmação quando o crédito for depositado.
            </p>
            <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:14, padding:"20px 24px", marginBottom:28 }}>
              <div style={{ fontSize:12, color:G, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:.8 }}>Resumo da contratação</div>
              {[
                { l:"Plano",           v:pixData?.planName + " Anual" },
                { l:"Valor pago",      v:fmt(pixData?.annualPrice ?? 0) },
                { l:"Taxa admin (10%)",v:`− ${fmt(pixData?.adminFee ?? 0)}` },
                { l:"Crédito líquido", v:`+ ${fmt(pixData?.creditNet ?? 0)}`, bold:true, color:G },
              ].map(r => (
                <div key={r.l} style={{ display:"flex", justifyContent:"space-between", fontSize:14, padding:"6px 0", borderBottom:"1px solid #dcfce7" }}>
                  <span style={{ color:"#6b7280" }}>{r.l}</span>
                  <strong style={{ color: r.color ?? "#111", fontWeight: r.bold ? 900 : 700 }}>{r.v}</strong>
                </div>
              ))}
            </div>
            <button className="cta" style={{ padding:"14px 36px", fontSize:16 }} onClick={() => setLocation("/financeiro")}>
              Ver meu saldo e créditos →
            </button>
          </div>
        )}

        {/* ══ STEP: PIX ════════════════════════════════════════════════════ */}
        {step === "pix" && pixData && (
          <div className="fade">
            {/* Header */}
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:99, padding:"6px 18px", marginBottom:16 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:G, display:"inline-block", animation:"none" }}/>
                <span style={{ fontSize:12, fontWeight:700, color:"#15803d", textTransform:"uppercase", letterSpacing:.8 }}>
                  Pix gerado · Expira em {h}:{m}:{s}
                </span>
              </div>
              <h1 style={{ fontSize:26, fontWeight:900, letterSpacing:-1, color:"#111", marginBottom:8 }}>
                Escaneie o QR Code para pagar
              </h1>
              <p style={{ fontSize:15, color:"#6b7280" }}>
                Pague com qualquer banco. Confirmação automática em segundos.
              </p>
            </div>

            {/* Resumo financeiro */}
            <div className="card" style={{ marginBottom:20, background:"linear-gradient(135deg,#052e16,#14532d)", border:"none", color:"#fff" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#86efac", textTransform:"uppercase", letterSpacing:.8, marginBottom:16 }}>
                Resumo do pagamento
              </div>
              {[
                { l:`Plano ${pixData.planName} Anual`,  v:fmt(pixData.annualPrice),  color:"#fff"    },
                { l:"Taxa de administração (10%)",       v:`− ${fmt(pixData.adminFee)}`, color:"#f87171" },
                { l:"Crédito líquido na conta",          v:`+ ${fmt(pixData.creditNet)}`, color:"#4ade80", big:true },
              ].map(r => (
                <div key={r.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
                  <span style={{ fontSize:13, color:"#86efac" }}>{r.l}</span>
                  <strong style={{ fontSize: r.big ? 20 : 14, color:r.color, fontWeight:900 }}>{r.v}</strong>
                </div>
              ))}
              <div style={{ marginTop:16, fontSize:13, color:"rgba(255,255,255,.5)", lineHeight:1.6 }}>
                ⚠️ O crédito é liberado em até 10 dias úteis após confirmação do Pix.<br/>
                Uso exclusivo em campanhas dentro do MECPro.
              </div>
            </div>

            {/* QR Code */}
            <div className="card" style={{ textAlign:"center", marginBottom:20 }}>
              {pixData.pixQrCode ? (
                <img
                  src={`data:image/png;base64,${pixData.pixQrCode}`}
                  alt="QR Code Pix"
                  style={{ width:220, height:220, margin:"0 auto 16px", display:"block", borderRadius:12 }}
                />
              ) : (
                <div style={{ width:220, height:220, background:"#f0fdf4", border:"2px dashed #86efac", borderRadius:12, margin:"0 auto 16px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#9ca3af" }}>
                  QR Code não disponível.<br/>Use o código abaixo.
                </div>
              )}
              <p style={{ fontSize:13, color:"#6b7280", marginBottom:16 }}>
                Ou copie o código Pix Copia e Cola:
              </p>
              <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 16px", fontSize:11, color:"#374151", wordBreak:"break-all", lineHeight:1.6, marginBottom:14, textAlign:"left", fontFamily:"monospace" }}>
                {pixData.pixPayload || "Código não disponível"}
              </div>
              <button onClick={copyPix} style={{ width:"100%", padding:"13px", background:G, color:"#fff", border:"none", borderRadius:11, fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
                📋 Copiar código Pix
              </button>
            </div>

            {/* Status polling */}
            {polling && (
              <div style={{ textAlign:"center", padding:"16px", fontSize:13, color:"#6b7280" }}>
                <div style={{ display:"inline-block", width:14, height:14, border:"2px solid #e5e7eb", borderTop:`2px solid ${G}`, borderRadius:"50%", animation:"spin 1s linear infinite", marginRight:8 }}/>
                Aguardando confirmação do pagamento...
              </div>
            )}

            <button onClick={() => setStep("form")} style={{ width:"100%", background:"none", border:"1px solid #e5e7eb", borderRadius:11, padding:"12px", fontSize:14, color:"#6b7280", cursor:"pointer", fontFamily:"inherit", marginTop:8 }}>
              ← Voltar e alterar plano
            </button>
          </div>
        )}

        {/* ══ STEP: FORM ═══════════════════════════════════════════════════ */}
        {step === "form" && (
          <div className="fade">
            {/* Título */}
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:99, padding:"6px 18px", marginBottom:16 }}>
                <span style={{ fontSize:12, fontWeight:700, color:"#15803d", textTransform:"uppercase", letterSpacing:.8 }}>
                  Checkout seguro · Asaas · Pix
                </span>
              </div>
              <h1 style={{ fontSize:"clamp(24px,4vw,34px)", fontWeight:900, letterSpacing:-1.5, color:"#111", marginBottom:10 }}>
                Assine o plano anual e<br/>
                <span style={{ color:G }}>receba crédito na sua conta</span>
              </h1>
              <p style={{ fontSize:15, color:"#6b7280", lineHeight:1.7 }}>
                Pague com Pix e receba o crédito em até 10 dias úteis.
              </p>
            </div>

            {/* Seleção de plano */}
            <div className="card" style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
                1. Escolha seu plano
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {PLANS.map(p => (
                  <label key={p.slug} style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 18px", border:`2px solid ${planSlug===p.slug?G:"#e5e7eb"}`, borderRadius:14, cursor:"pointer", background:planSlug===p.slug?"#f0fdf4":"#fff", transition:"all .15s", position:"relative" }}>
                    {p.popular && (
                      <div style={{ position:"absolute", top:-10, right:16, background:G, color:"#fff", fontSize:9, fontWeight:800, padding:"2px 10px", borderRadius:99, textTransform:"uppercase", letterSpacing:.5 }}>
                        Popular
                      </div>
                    )}
                    <input type="radio" name="plan" value={p.slug} checked={planSlug===p.slug} onChange={()=>setPlanSlug(p.slug)} style={{ accentColor:G, width:18, height:18, flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:"#111", marginBottom:2 }}>
                        {p.name} Anual
                        <span style={{ fontSize:12, fontWeight:600, color:"#9ca3af", marginLeft:8 }}>{fmt(Math.floor(p.monthly*0.8))}/mês</span>
                      </div>
                      <div style={{ fontSize:13, color:"#6b7280" }}>
                        Total: {fmt(annualPrice(p.monthly))} · Crédito líquido:{" "}
                        <strong style={{ color:G }}>{fmt(creditNet(p.monthly))}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:11, color:"#9ca3af" }}>você recebe</div>
                      <div style={{ fontSize:22, fontWeight:900, color:G }}>+{fmt(creditNet(p.monthly))}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Resumo financeiro com taxa */}
            <div className="card" style={{ marginBottom:20, background:"#f9fafb" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:16 }}>
                Detalhamento do crédito
              </div>
              {[
                { l:"Valor do plano anual",            v:fmt(annualPrice(plan.monthly)),  color:"#111"    },
                { l:"Crédito bruto (60% do plano)",    v:`+ ${fmt(creditGross(plan.monthly))}`, color:G  },
                { l:"Taxa de administração (10%)",     v:`− ${fmt(adminFee(plan.monthly))}`, color:"#dc2626" },
                { l:"Crédito líquido que você recebe", v:`+ ${fmt(creditNet(plan.monthly))}`, color:G, big:true },
              ].map(r => (
                <div key={r.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f0f0f0" }}>
                  <span style={{ fontSize:13, color:"#6b7280" }}>{r.l}</span>
                  <strong style={{ fontSize: r.big ? 18 : 14, color:r.color, fontWeight:900 }}>{r.v}</strong>
                </div>
              ))}
              <div style={{ marginTop:14, fontSize:12, color:"#9ca3af", lineHeight:1.6 }}>
                💡 A taxa de 10% cobre os custos operacionais do processamento do crédito. O valor líquido é depositado na sua conta MECPro em até 10 dias úteis.
              </div>
            </div>

            {/* CPF/CNPJ */}
            <div className="card" style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
                2. Seus dados para o Pix
              </div>
              <label style={{ display:"block", fontSize:13, fontWeight:700, color:"#374151", marginBottom:8 }}>
                CPF ou CNPJ <span style={{ color:"#dc2626" }}>*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={doc}
                onChange={e => setDoc(maskDoc(e.target.value))}
                style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #e5e7eb", borderRadius:11, fontSize:16, fontFamily:"monospace", outline:"none", letterSpacing:1 }}
              />
              <p style={{ fontSize:12, color:"#9ca3af", marginTop:8 }}>
                Necessário para identificação no Asaas (processador de pagamentos parceiro).
              </p>
            </div>

            {/* Termos obrigatórios */}
            <div id="termos-checkout" className="card" style={{ marginBottom:24, border:`2px solid ${termsErr?"#fca5a5":"#e5e7eb"}`, background:termsErr?"#fef2f2":"#fff", animation:termsErr?"shake .4s ease":"none" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:16 }}>
                3. Termos do crédito promocional
              </div>

              {/* Termos resumidos */}
              <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.8, marginBottom:16 }}>
                {[
                  "O crédito é exclusivo para campanhas dentro do MECPro",
                  "Não pode ser sacado, transferido ou convertido em dinheiro",
                  "Em caso de cancelamento: créditos não usados são removidos; créditos usados podem ser cobrados proporcionalmente",
                  "O crédito líquido já desconta a taxa de administração de 10%",
                  "Liberação em até 10 dias úteis após confirmação do Pix",
                ].map((t, i) => (
                  <div key={i} style={{ display:"flex", gap:10, marginBottom:6 }}>
                    <span style={{ color:G, flexShrink:0, fontWeight:700 }}>✓</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>

              {/* Toggle termos completos */}
              <button onClick={() => setShowTerms(!showTerms)} style={{ background:"none", border:"none", color:G, fontSize:13, fontWeight:700, cursor:"pointer", padding:0, fontFamily:"inherit", textDecoration:"underline", marginBottom:12 }}>
                {showTerms ? "Ocultar termos completos" : "Ler termos completos"}
              </button>

              {showTerms && (
                <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10, padding:"16px", fontSize:12, color:"#6b7280", lineHeight:1.8, marginBottom:16, animation:"fadeIn .3s ease" }}>
                  <strong style={{ color:"#111", display:"block", marginBottom:8 }}>Termos do Crédito Promocional MECPro</strong>
                  <ol style={{ paddingLeft:18, margin:0 }}>
                    <li>O crédito é concedido exclusivamente a assinantes do plano anual MECPro.</li>
                    <li>O valor bruto do crédito equivale a 60% do valor total do plano anual. Sobre este valor é aplicada uma taxa de administração de 10%, resultando no crédito líquido depositado.</li>
                    <li>O crédito é depositado na conta MECPro do assinante em até 10 dias úteis após confirmação do pagamento via Pix.</li>
                    <li>O crédito é válido exclusivamente para campanhas dentro da plataforma MECPro (Meta, Google e TikTok Ads).</li>
                    <li>Não pode ser sacado, transferido, revendido ou convertido em dinheiro em hipótese alguma.</li>
                    <li>Em caso de cancelamento: (a) créditos não utilizados são removidos sem reembolso; (b) créditos utilizados podem ser cobrados proporcionalmente ao período restante.</li>
                    <li>O crédito tem validade durante o período do plano anual contratado.</li>
                    <li>O MECPro pode encerrar ou modificar a oferta para novos assinantes sem afetar contratos já firmados.</li>
                    <li>Esta oferta não é cumulativa com outras promoções ou descontos.</li>
                    <li>O pagamento é processado pela Asaas Pagamentos S.A. (CNPJ 19.540.550/0001-21), parceira do MECPro.</li>
                  </ol>
                </div>
              )}

              {/* Checkbox aceite */}
              <label style={{ display:"flex", alignItems:"flex-start", gap:12, cursor:"pointer" }}>
                <input
                  type="checkbox"
                  checked={termsOk}
                  onChange={e => { setTermsOk(e.target.checked); if (e.target.checked) setTermsErr(false); }}
                  style={{ width:20, height:20, marginTop:2, accentColor:G, cursor:"pointer", flexShrink:0 }}
                />
                <span style={{ fontSize:14, color:"#111", fontWeight:700, lineHeight:1.5 }}>
                  Li e aceito os termos do crédito promocional e autorizo o processamento do pagamento via Pix pela Asaas.
                </span>
              </label>

              {termsErr && (
                <p style={{ fontSize:13, color:"#dc2626", fontWeight:700, marginTop:10, marginLeft:32 }}>
                  ⚠️ Você precisa aceitar os termos para continuar
                </p>
              )}
            </div>

            {/* CTA final */}
            <button
              className="cta"
              style={{ width:"100%", padding:"18px", fontSize:18 }}
              onClick={handleSubmit}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "⏳ Gerando seu Pix..."
                : `💰 Gerar Pix — ${fmt(annualPrice(plan.monthly))}`}
            </button>

            <div style={{ display:"flex", justifyContent:"center", gap:20, flexWrap:"wrap", marginTop:16 }}>
              {["Pix seguro via Asaas","Crédito em até 10 dias","Cancele quando quiser"].map(t => (
                <div key={t} style={{ fontSize:12, color:"#9ca3af", display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ color:G }}>✓</span>{t}
                </div>
              ))}
            </div>

            {/* Info Asaas */}
            <div style={{ marginTop:24, textAlign:"center" }}>
              <p style={{ fontSize:11, color:"#d1d5db", lineHeight:1.6 }}>
                Pagamento processado por{" "}
                <a href="https://asaas.com" target="_blank" rel="noreferrer" style={{ color:"#9ca3af", textDecoration:"underline" }}>
                  Asaas Pagamentos S.A.
                </a>
                {" "}· CNPJ 19.540.550/0001-21 · Instituição de pagamento autorizada pelo Banco Central do Brasil
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
