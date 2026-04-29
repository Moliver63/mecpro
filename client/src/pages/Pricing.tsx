import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const plans = [
  {
    name: "Basic",
    slug: "basic" as const,
    price: "97",
    description: "Para profissionais autônomos",
    features: ["3 projetos","5 concorrentes/projeto","10 campanhas/mês","Suporte por e-mail"],
    notIncluded: ["Relatórios PDF","Suporte prioritário","API access"],
    cta: "Assinar Basic",
    popular: false,
    style: "outline",
  },
  {
    name: "Premium",
    slug: "premium" as const,
    price: "197",
    description: "Para agências e times",
    features: ["10 projetos","Concorrentes ilimitados","Campanhas ilimitadas","Relatórios PDF","Suporte prioritário"],
    notIncluded: ["API access","Manager dedicado"],
    cta: "Assinar Premium",
    popular: true,
    style: "green",
  },
  {
    name: "VIP",
    slug: "vip" as const,
    price: "397",
    description: "Para grandes operações",
    features: ["Projetos ilimitados","Tudo do Premium","API access","Manager dedicado","Onboarding personalizado"],
    notIncluded: [],
    cta: "Assinar VIP",
    popular: false,
    style: "dark",
  },
];

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { isAuthenticated } = useAuth();
  const createCheckout   = trpc.subscriptions.createCheckout.useMutation();
  const createAsaas      = (trpc as any).subscriptions?.createAsaasAnnual?.useMutation?.();
  const { data: gatewayData } = (trpc as any).public?.getPaymentGateway?.useQuery?.() ?? { data: null };
  const activeGateway: "stripe" | "asaas" = gatewayData?.gateway ?? "stripe";

  const getPrice = (base: string) => {
    const num = parseInt(base);
    return billing === "annual" ? Math.floor(num * 0.8) : num;
  };

  const handleSubscribe = async (slug: "basic" | "premium" | "vip") => {
    if (!isAuthenticated) { window.location.href = "/login?next=/pricing"; return; }
    setError("");
    setLoadingPlan(slug);
    try {
      if (activeGateway === "asaas") {
        // Asaas: redireciona para checkout interno com Pix/boleto
        window.location.href = `/checkout/asaas?plan=${slug}&billing=${billing}`;
      } else {
        // Stripe: abre checkout hospedado
        const result = await createCheckout.mutateAsync({ planSlug: slug, billing } as any);
        if ((result as any).url) window.open((result as any).url, "_blank");
      }
    } catch (e: any) {
      setError(e.message || "Erro ao criar checkout. Tente novamente.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--off)", fontFamily:"var(--font-body)" }}>

      {/* NAV */}
      <nav style={{ height:60, background:"white", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", padding:"0 32px", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <a href="/" style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:800, color:"var(--black)", textDecoration:"none" }}>
            MEC<span style={{ color:"var(--green-d)" }}>PRO</span>
          </a>
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-md btn-ghost" onClick={()=>setLocation("/login")}>Entrar</button>
            <button className="btn btn-md btn-primary" onClick={()=>setLocation("/register")}>Criar conta grátis</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ textAlign:"center", padding:"64px 32px 48px", maxWidth:640, margin:"0 auto" }}>
        <div className="badge badge-green" style={{ marginBottom:16 }}>Planos e Preços</div>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:"clamp(32px,4vw,48px)", fontWeight:800, color:"var(--black)", letterSpacing:-1, marginBottom:14 }}>
          Simples e sem surpresa
        </h1>
        <p style={{ fontSize:16, color:"var(--muted)", lineHeight:1.7, marginBottom:32 }}>
          Comece com o plano que faz sentido para o seu negócio. Cancele quando quiser.
        </p>
        {/* Billing toggle */}
        <div style={{ display:"inline-flex", background:"white", border:"1px solid var(--border)", borderRadius:12, padding:4, gap:4 }}>
          <button onClick={()=>setBilling("monthly")} style={{ padding:"8px 20px", borderRadius:8, border:"none", cursor:"pointer", fontSize:14, fontWeight:600, background:billing==="monthly"?"var(--black)":"transparent", color:billing==="monthly"?"white":"var(--muted)", transition:"all .15s" }}>
            Mensal
          </button>
          <button onClick={()=>setBilling("annual")} style={{ padding:"8px 20px", borderRadius:8, border:"none", cursor:"pointer", fontSize:14, fontWeight:600, background:billing==="annual"?"var(--black)":"transparent", color:billing==="annual"?"white":"var(--muted)", transition:"all .15s", display:"flex", alignItems:"center", gap:8 }}>
            Anual
            <span style={{ background:"var(--green-l)", color:"var(--green-d)", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99 }}>-20%</span>
          </button>
        </div>
      </div>

      {/* CARDS */}
      <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 32px 80px" }}>
        {error && (
          <div style={{ background:"var(--error-l)", border:"1px solid #fecaca", borderRadius:10, padding:"10px 16px", fontSize:13, color:"var(--error)", marginBottom:24, textAlign:"center" }}>
            ⚠️ {error}
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
          {plans.map(plan=>(
            <div key={plan.slug} style={{ background:"white", border:`1.5px solid ${plan.popular?"var(--green)":"var(--border)"}`, borderRadius:20, padding:28, position:"relative", boxShadow:plan.popular?"0 0 0 4px rgba(34,197,94,.07)":"none", display:"flex", flexDirection:"column" }}>
              {plan.popular&&(
                <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:"var(--green-d)", color:"white", fontSize:11, fontWeight:700, padding:"4px 16px", borderRadius:99, whiteSpace:"nowrap" }}>Mais popular</div>
              )}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".7px", marginBottom:6 }}>{plan.name}</div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:42, fontWeight:800, color:"var(--black)", letterSpacing:-1, lineHeight:1 }}>
                  <sup style={{ fontSize:18, verticalAlign:"top", marginTop:8, fontWeight:600 }}>R$</sup>{getPrice(plan.price)}
                </div>
                <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>{billing==="annual"?"por mês · cobrado anualmente":"por mês"}</div>
                <div style={{ fontSize:13, color:"var(--muted)", marginTop:6 }}>{plan.description}</div>
              </div>
              <div style={{ height:1, background:"var(--border)", margin:"0 0 18px" }} />
              <div style={{ flex:1, marginBottom:24 }}>
                {plan.features.map(f=>(
                  <div key={f} style={{ display:"flex", gap:8, fontSize:13.5, color:"var(--body)", marginBottom:9 }}>
                    <span style={{ color:"var(--green)", fontWeight:700, flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
                {plan.notIncluded.map(f=>(
                  <div key={f} style={{ display:"flex", gap:8, fontSize:13.5, color:"#ced4da", marginBottom:9 }}>
                    <span style={{ color:"var(--border2)", fontWeight:700, flexShrink:0 }}>—</span>{f}
                  </div>
                ))}
              </div>
              <button
                className={`btn btn-full btn-lg ${plan.style==="green"?"btn-green":plan.style==="dark"?"btn-primary":"btn-outline"}`}
                disabled={loadingPlan===plan.slug}
                style={{ opacity:loadingPlan===plan.slug?.7:1 }}
                onClick={()=>handleSubscribe(plan.slug)}>
                {loadingPlan===plan.slug?"Redirecionando...":plan.cta}
              </button>
            </div>
          ))}
        </div>
        <div style={{ textAlign:"center", marginTop:40 }}>
          <p style={{ fontSize:13, color:"#adb5bd" }}>🔒 Pagamento seguro via Stripe · Cancele a qualquer momento · Sem taxas ocultas</p>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ borderTop:"1px solid var(--border)", background:"white" }}>
        <div style={{ maxWidth:720, margin:"0 auto", padding:"64px 32px" }}>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:28, fontWeight:800, color:"var(--black)", textAlign:"center", marginBottom:40 }}>Perguntas frequentes</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            {[
              { q:"Posso cancelar a qualquer momento?", a:"Sim! Cancele quando quiser, sem multas. Seu acesso continua até o final do período pago." },
              { q:"Como funciona o plano anual?", a:"No plano anual você paga 12 meses de uma vez com 20% de desconto em relação ao plano mensal." },
              { q:"Posso mudar de plano depois?", a:"Sim. Você pode fazer upgrade ou downgrade a qualquer momento pela sua área de assinatura." },
              { q:"O pagamento é seguro?", a:"Sim. Todos os pagamentos são processados pelo Stripe com segurança PCI-DSS nível 1. Não armazenamos dados de cartão." },
            ].map(item=>(
              <div key={item.q} style={{ borderBottom:"1px solid var(--border)", paddingBottom:24 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"var(--black)", marginBottom:8 }}>{item.q}</div>
                <div style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7 }}>{item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop:"1px solid var(--border)", padding:"24px 32px" }}>
        <div style={{ maxWidth:1080, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:800, color:"var(--black)" }}>MECPRO</span>
          <div style={{ display:"flex", gap:24 }}>
            {[{label:"Termos",href:"/terms"},{label:"Privacidade",href:"/privacy"},{label:"Contato",href:"/contact"}].map(l=>(
              <a key={l.label} href={l.href} style={{ fontSize:13, color:"var(--muted)", textDecoration:"none" }}>{l.label}</a>
            ))}
          </div>
          <span style={{ fontSize:12, color:"#adb5bd" }}>© 2026 MECPro</span>
        </div>
      </div>
    </div>
  );
}
