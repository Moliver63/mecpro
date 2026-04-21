import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import SEO, { SEO_CONFIGS } from "@/components/SEO";

// ─── Planos ────────────────────────────────────────────────────────────────────
const PLANS = [
  { name: "Basic",   monthly: 97,  slug: "basic",   color: "#6b7280" },
  { name: "Premium", monthly: 197, slug: "premium",  color: "#16a34a", popular: true },
  { name: "VIP",     monthly: 397, slug: "vip",      color: "#7c3aed" },
];
const annualPrice = (m: number) => Math.floor(m * 0.8) * 12;
const creditVal   = (m: number) => Math.round(annualPrice(m) * 0.6);
const fmt         = (v: number) => `R$\u00a0${v.toLocaleString("pt-BR")}`;

// ─── Countdown 72h ────────────────────────────────────────────────────────────
function useCountdown() {
  const end = useRef(Date.now() + 72 * 3600 * 1000);
  const [left, setLeft] = useState(end.current - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, end.current - Date.now())), 1000);
    return () => clearInterval(t);
  }, []);
  const p = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return { h: p(left / 3.6e6), m: p((left % 3.6e6) / 6e4), s: p((left % 6e4) / 1e3) };
}

// ─── Vagas ─────────────────────────────────────────────────────────────────────
const VAGAS_TOTAL = 50;
const VAGAS_USADAS = 37;
const VAGAS_REST = VAGAS_TOTAL - VAGAS_USADAS;
const VAGAS_PCT = Math.round((VAGAS_USADAS / VAGAS_TOTAL) * 100);

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
const WA = "554799465824";
const WA_MSG = encodeURIComponent("Olá! Tenho interesse no MECPro. Pode me ajudar? 😊");

function WABtn() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div style={{ position:"fixed",bottom:88,right:20,zIndex:9999,width:288,background:"#fff",borderRadius:16,boxShadow:"0 8px 40px rgba(0,0,0,.18)",padding:"18px 16px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <svg width="22" height="22" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
              </div>
              <div>
                <p style={{ margin:0,fontWeight:800,fontSize:13,color:"#111" }}>Michel Leal</p>
                <p style={{ margin:0,fontSize:11,color:"#25d366",fontWeight:600 }}>● Online agora</p>
              </div>
            </div>
            <button onClick={()=>setOpen(false)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#9ca3af",padding:"2px 6px" }}>×</button>
          </div>
          <div style={{ background:"#f0fdf4",borderRadius:10,padding:"10px 13px",marginBottom:14 }}>
            <p style={{ margin:0,fontSize:12,color:"#374151",lineHeight:1.6 }}>👋 Olá! Posso ajudar com dúvidas sobre o MECPro ou o crédito promocional. Fale agora!</p>
          </div>
          <a href={`https://wa.me/${WA}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
            style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",borderRadius:10,padding:"11px 16px",fontWeight:800,fontSize:13,textDecoration:"none" }}>
            Chamar no WhatsApp
          </a>
          <p style={{ margin:"10px 0 0",fontSize:10,color:"#9ca3af",textAlign:"center" }}>(47) 99465-824 · Seg–Sex, 9h–18h</p>
        </div>
      )}
      <button onClick={()=>setOpen(!open)} aria-label="Falar no WhatsApp"
        style={{ position:"fixed",bottom:22,right:22,zIndex:9998,width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(37,211,102,.55)" }}>
        {open
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
          : <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z" fill="white"/><path d="M21.5 19.3c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-1.75-.87-2.9-1.56-4.06-3.53-.3-.53.3-.49.87-1.63.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.91-2.19-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.57-.09 1.75-.72 2-1.41.24-.7.24-1.3.17-1.42-.07-.12-.27-.19-.57-.34z" fill="#128c7e"/></svg>
        }
      </button>
    </>
  );
}

// ─── JSON-LD ──────────────────────────────────────────────────────────────────
const LD = {
  "@context":"https://schema.org",
  "@graph":[
    {"@type":"SoftwareApplication","name":"MECPro","url":"https://mecproai.com","description":"Plataforma de inteligência de campanhas com IA — assine o plano anual e receba até R$ 1.900 em créditos para campanhas.","applicationCategory":"BusinessApplication","operatingSystem":"Web Browser","inLanguage":"pt-BR","isAccessibleForFree":true,"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"127","bestRating":"5"}},
    {"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"O crédito promocional é real?","acceptedAnswer":{"@type":"Answer","text":"Sim. Após confirmar o pagamento do plano anual, você recebe o crédito equivalente em até 10 dias úteis, diretamente na sua conta MECPro. O crédito é usado para campanhas dentro da plataforma."}},
      {"@type":"Question","name":"Quanto de crédito eu recebo?","acceptedAnswer":{"@type":"Answer","text":"No plano Basic você recebe R$ 562. No Premium, R$ 1.139. No VIP, R$ 1.900. Os valores são creditados em até 10 dias úteis após a confirmação do pagamento anual."}},
    ]},
  ],
};

const MINI_COURSES = [
  {slug:"campanha-zero-mecpro",icon:"◈",tag:"GRATUITO",tagColor:"#16a34a",title:"Campanha do Zero com MECPro",desc:"Aprenda a criar sua primeira campanha completa — passo a passo em 45 minutos.",duration:"45 min",lessons:6,level:"Iniciante",highlight:true},
  {slug:"analise-concorrentes-ia",icon:"🔍",tag:"PRO",tagColor:"#7c3aed",title:"Análise de Concorrentes com IA",desc:"Domine o módulo de concorrentes e extraia insights que a concorrência não sabe.",duration:"6h 15min",lessons:24,level:"Intermediário",highlight:false},
  {slug:"copy-ia-guia-pratico",icon:"✍️",tag:"GRATUITO",tagColor:"#16a34a",title:"Copy com IA — Guia Prático",desc:"Use o gerador de copy do MECPro para criar anúncios que convertem.",duration:"1h 20min",lessons:8,level:"Iniciante",highlight:false},
  {slug:"marketing-meta-ads",icon:"📘",tag:"PRO",tagColor:"#7c3aed",title:"Meta Ads do Zero ao Avançado",desc:"Campanha, público, criativo e orçamento — tudo dentro do MECPro conectado ao Meta Ads.",duration:"12h 30min",lessons:48,level:"Completo",highlight:false},
  {slug:"estrategia-ecommerce",icon:"🛒",tag:"PRO",tagColor:"#7c3aed",title:"Estratégia para E-commerce",desc:"Escale sua loja com tráfego pago, remarketing e funil automatizado.",duration:"10h 20min",lessons:42,level:"Avançado",highlight:false},
  {slug:"relatorios-e-metricas",icon:"📊",tag:"GRATUITO",tagColor:"#16a34a",title:"Relatórios e Métricas que Importam",desc:"Exporte relatórios PDF/XLSX e saiba quais KPIs impactam seus resultados.",duration:"4h 30min",lessons:18,level:"Iniciante",highlight:false},
];

// ═════════════════════════════════════════════════════════════════════════════
export default function Landing() {
  const [, setLocation] = useLocation();
  const [planIdx, setPlanIdx] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const { h, m, s } = useCountdown();

  const plan   = PLANS[planIdx];
  const total  = annualPrice(plan.monthly);
  const credit = creditVal(plan.monthly);

  // VIP tem maior valor de crédito — usado na headline
  const maxCredit = creditVal(397);

  const goCheckout = () => {
    if (!termsAccepted) { setTermsError(true); document.getElementById("termos-section")?.scrollIntoView({behavior:"smooth"}); return; }
    setTermsError(false);
    setLocation(`/checkout-anual?plan=${plan.slug}`);
  };

  const goCheckoutDirect = () => setLocation(`/checkout-anual?plan=${plan.slug}`);

  return (
    <>
      <SEO
        title={SEO_CONFIGS.landing.title}
        description={SEO_CONFIGS.landing.description}
        keywords={SEO_CONFIGS.landing.keywords}
        canonical={SEO_CONFIGS.landing.canonical}
        ogType="website"
        structuredData={LD}
      />

      <style>{`
        *{box-sizing:border-box}
        @keyframes pulse-g{0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,.5)}60%{box-shadow:0 0 0 16px rgba(22,163,74,0)}}
        @keyframes floatY{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-6px)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes slideIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        .cta-main{
          display:inline-flex;align-items:center;gap:10;
          background:linear-gradient(135deg,#16a34a,#15803d);
          color:#fff;font-weight:900;border:none;cursor:pointer;
          border-radius:14px;transition:transform .15s,filter .15s;
          animation:pulse-g 2.6s infinite;
          font-family:inherit;letter-spacing:-.3px;
        }
        .cta-main:hover{transform:scale(1.04);filter:brightness(1.08);}
        .cta-sec{
          display:inline-flex;align-items:center;gap:8px;
          background:#fff;color:#16a34a;font-weight:800;border:2px solid #16a34a;
          cursor:pointer;border-radius:14px;transition:all .15s;font-family:inherit;
        }
        .cta-sec:hover{background:#f0fdf4;}
        .card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:28px;}
        .val-green{color:#16a34a;font-weight:900;}
        .badge-promo{
          display:inline-flex;align-items:center;gap:8px;
          background:#f0fdf4;border:1.5px solid #86efac;
          border-radius:99px;padding:6px 18px;
        }
        @media(max-width:640px){
          .sm-hide{display:none!important}
          .grid-3{grid-template-columns:1fr!important}
          .grid-2{grid-template-columns:1fr!important}
          .grid-4{grid-template-columns:1fr 1fr!important}
        }
      `}</style>

      <div style={{fontFamily:"'Geist',system-ui,sans-serif",background:"#fff",color:"#111",lineHeight:1.5}}>

        {/* ══ BARRA URGÊNCIA TOPO ════════════════════════════════════════════ */}
        <div style={{background:"linear-gradient(90deg,#15803d,#16a34a)",padding:"10px 16px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:12,flexWrap:"wrap",position:"relative",zIndex:200}}>
          <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>
            🔥 O MECPro está colocando até <strong>{fmt(maxCredit)}</strong> na sua conta — plano anual com crédito ativo
          </span>
          <span style={{background:"rgba(0,0,0,.25)",color:"#fff",fontWeight:900,fontSize:14,padding:"3px 14px",borderRadius:99,fontVariantNumeric:"tabular-nums",letterSpacing:2}}>
            ⏰ {h}:{m}:{s}
          </span>
          <button onClick={goCheckoutDirect} style={{background:"#fff",color:"#16a34a",fontWeight:800,fontSize:12,padding:"5px 16px",borderRadius:99,border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>
            Ativar agora →
          </button>
        </div>

        {/* ══ NAV ════════════════════════════════════════════════════════════ */}
        <nav style={{position:"sticky",top:0,zIndex:100,height:60,background:"rgba(255,255,255,.97)",backdropFilter:"blur(16px)",borderBottom:"1px solid #f0f0f0"}}>
          <div style={{maxWidth:1080,margin:"0 auto",padding:"0 24px",height:"100%",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <a href="/" style={{textDecoration:"none",display:"flex",alignItems:"center"}}>
              <img src="/logo-512.png" alt="MECPro" height={44} style={{display:"block",borderRadius:10}}/>
            </a>
            <nav className="sm-hide" style={{display:"flex",gap:24}}>
              {[{l:"Plataforma",h:"/#recursos"},{l:"Academy",h:"/courses"},{l:"Preços",h:"/pricing"},{l:"FAQ",h:"/faq"}].map(x=>(
                <a key={x.l} href={x.h} style={{fontSize:14,color:"#6b7280",textDecoration:"none",fontWeight:500}}>{x.l}</a>
              ))}
            </nav>
            <div style={{display:"flex",gap:8}}>
              <button className="cta-sec" style={{padding:"8px 16px",fontSize:13,borderRadius:10}} onClick={()=>setLocation("/login")}>Entrar</button>
              <button className="cta-main" style={{padding:"9px 20px",fontSize:13,borderRadius:10,animation:"none"}} onClick={goCheckoutDirect}>
                💰 Ativar crédito
              </button>
            </div>
          </div>
        </nav>

        {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
        <header style={{padding:"72px 24px 60px",textAlign:"center",maxWidth:820,margin:"0 auto"}}>

          {/* Selo */}
          <div className="badge-promo" style={{marginBottom:28}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:"#16a34a",display:"inline-block",animation:"blink 1.4s infinite"}}/>
            <span style={{fontSize:12,fontWeight:700,color:"#15803d",textTransform:"uppercase",letterSpacing:.8}}>
              Oferta real · {VAGAS_REST} vagas restantes · Tempo limitado
            </span>
          </div>

          {/* Headline principal com valor em R$ */}
          <h1 style={{fontSize:"clamp(38px,5.8vw,70px)",fontWeight:900,letterSpacing:-2.5,lineHeight:1.04,marginBottom:24}}>
            O MECPro coloca até<br/>
            <span style={{
              background:"linear-gradient(135deg,#16a34a,#4ade80)",
              WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",
              display:"inline-block",
            }}>
              {fmt(maxCredit)} na sua conta
            </span><br/>
            para você anunciar
          </h1>

          <p style={{fontSize:"clamp(17px,2.2vw,21px)",color:"#4b5563",lineHeight:1.7,maxWidth:580,margin:"0 auto 14px"}}>
            Assine o plano anual e receba crédito em dinheiro real para rodar campanhas no Meta, Google e TikTok — direto dentro do MECPro.
          </p>

          <p style={{fontSize:14,color:"#dc2626",fontWeight:700,marginBottom:8}}>
            ⚠️ Disponível por tempo limitado ou até esgotar o saldo promocional
          </p>
          <p style={{fontSize:13,color:"#9ca3af",marginBottom:36}}>
            Não é desconto. Não é cashback. É crédito real que entra na sua conta para você anunciar.
          </p>

          {/* Calculadora interativa */}
          <div style={{background:"#f9fafb",border:"2px solid #e5e7eb",borderRadius:20,padding:"28px 28px 24px",maxWidth:540,margin:"0 auto 36px",textAlign:"left"}}>
            <p style={{fontSize:11,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>
              🧮 Calcule quanto você recebe
            </p>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {PLANS.map((p,i)=>(
                <button key={p.slug} onClick={()=>setPlanIdx(i)} style={{
                  flex:1,padding:"10px 6px",borderRadius:10,
                  border:`2px solid ${planIdx===i?p.color:"#e5e7eb"}`,
                  background:planIdx===i?"#f0fdf4":"#fff",
                  color:planIdx===i?p.color:"#9ca3af",
                  fontWeight:800,fontSize:13,cursor:"pointer",transition:"all .15s",
                  fontFamily:"inherit",
                }}>
                  {p.name}
                  {p.popular && <span style={{display:"block",fontSize:9,color:"#16a34a",marginTop:2}}>★ POPULAR</span>}
                </button>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
              <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#9ca3af",marginBottom:6,fontWeight:600}}>VOCÊ PAGA/ANO</div>
                <div style={{fontSize:19,fontWeight:900,color:"#111"}}>{fmt(total)}</div>
              </div>
              <div style={{background:"#f0fdf4",border:"2px solid #86efac",borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#16a34a",marginBottom:6,fontWeight:700}}>💰 VOCÊ RECEBE</div>
                <div style={{fontSize:22,fontWeight:900,color:"#16a34a"}}>+{fmt(credit)}</div>
              </div>
              <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#9ca3af",marginBottom:6,fontWeight:600}}>CUSTO REAL</div>
                <div style={{fontSize:19,fontWeight:900,color:"#111"}}>{fmt(total-credit)}</div>
              </div>
            </div>

            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#92400e",lineHeight:1.5}}>
              💡 Você paga <strong>{fmt(total)}</strong> e recebe de volta <strong style={{color:"#16a34a"}}>{fmt(credit)}</strong> em créditos para anunciar. Custo efetivo: apenas <strong>{fmt(total-credit)}</strong>.
            </div>
          </div>

          {/* CTAs hero */}
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginBottom:16}}>
            <button className="cta-main" style={{padding:"17px 36px",fontSize:17}} onClick={goCheckout}>
              💰 Ativar meus {fmt(credit)} agora
            </button>
            <button className="cta-sec" style={{padding:"17px 28px",fontSize:15}} onClick={()=>setLocation("/register")}>
              Começar grátis →
            </button>
          </div>
          <p style={{fontSize:12,color:"#9ca3af"}}>
            Pagamento via Pix ou cartão · Crédito liberado em até 10 dias · Cancele quando quiser
          </p>
        </header>

        {/* ══ BANNER CLICÁVEL A ══════════════════════════════════════════════ */}
        <div style={{maxWidth:1080,margin:"0 auto 0",padding:"0 24px"}}>
          <button onClick={goCheckoutDirect} style={{width:"100%",background:"linear-gradient(135deg,#052e16,#14532d)",border:"none",borderRadius:16,padding:"22px 28px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <span style={{fontSize:36}}>💰</span>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>Libere até {fmt(maxCredit)} para suas campanhas</div>
                <div style={{fontSize:13,color:"#86efac"}}>Plano anual · Crédito real na conta · {VAGAS_REST} vagas</div>
              </div>
            </div>
            <span style={{background:"#16a34a",color:"#fff",fontWeight:800,fontSize:15,padding:"12px 28px",borderRadius:10,whiteSpace:"nowrap"}}>
              Liberar meu crédito →
            </span>
          </button>
        </div>

        {/* ══ TRUST STRIP ════════════════════════════════════════════════════ */}
        <div style={{background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"16px 24px",marginTop:24}}>
          <div style={{maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:600,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.8,whiteSpace:"nowrap"}}>Confiado por</span>
            <div style={{width:1,height:18,background:"#e5e7eb"}}/>
            {["500+ Agências","E-commerces","Consultorias","Freelancers","SaaS"].map(l=>(
              <span key={l} style={{fontSize:14,fontWeight:600,color:"#6b7280"}}>{l}</span>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              {"★★★★★".split("").map((_,i)=><span key={i} style={{color:"#f59e0b",fontSize:16}}>★</span>)}
              <span style={{fontSize:13,color:"#6b7280",fontWeight:600}}>4.9 · 127 avaliações</span>
            </div>
          </div>
        </div>

        {/* ══ STATS ══════════════════════════════════════════════════════════ */}
        <section style={{background:"#111",padding:"52px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:24,textAlign:"center"}} className="grid-4">
            {[{v:"500+",l:"Agências ativas"},{v:"10.000+",l:"Campanhas geradas"},{v:"7 camadas",l:"Pipeline de IA"},{v:fmt(maxCredit),l:"Crédito máximo/ano"}].map(s=>(
              <div key={s.v}>
                <div style={{fontSize:30,fontWeight:900,color:"#4ade80",letterSpacing:-1}}>{s.v}</div>
                <div style={{fontSize:12,color:"#6b7280",marginTop:6}}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ SEÇÃO DE VALOR / EXPLICAÇÃO ════════════════════════════════════ */}
        <section style={{padding:"88px 24px",maxWidth:1080,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:56}}>
            <div style={{display:"inline-block",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:99,padding:"5px 16px",fontSize:11,fontWeight:700,color:"#15803d",textTransform:"uppercase",letterSpacing:.8,marginBottom:16}}>
              Entenda a oferta
            </div>
            <h2 style={{fontSize:"clamp(30px,4vw,48px)",fontWeight:900,letterSpacing:-2,lineHeight:1.1,marginBottom:16}}>
              Você paga o plano.<br/>
              <span className="val-green">O MECPro coloca dinheiro de volta.</span>
            </h2>
            <p style={{fontSize:17,color:"#6b7280",lineHeight:1.7,maxWidth:520,margin:"0 auto"}}>
              É simples: cada plano anual vem com crédito em reais para você anunciar. O crédito entra na sua conta e você usa quando quiser nas campanhas.
            </p>
          </div>

          {/* Cards por plano */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20,marginBottom:40}} className="grid-3">
            {PLANS.map((p,i)=>(
              <div key={p.slug} className="card" style={{border:p.popular?`2px solid ${p.color}`:"1px solid #e5e7eb",position:"relative",overflow:"hidden"}}>
                {p.popular && (
                  <>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:"linear-gradient(90deg,#16a34a,#4ade80)"}}/>
                    <div style={{position:"absolute",top:12,right:12,background:"#16a34a",color:"#fff",fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:99,textTransform:"uppercase",letterSpacing:.5}}>Mais popular</div>
                  </>
                )}
                <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>{p.name}</div>

                <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Você paga por ano:</div>
                <div style={{fontSize:22,fontWeight:800,color:"#111",marginBottom:16}}>{fmt(annualPrice(p.monthly))}</div>

                <div style={{background:i===0?"#f9fafb":i===1?"#f0fdf4":"#faf5ff",border:`1.5px solid ${i===0?"#e5e7eb":i===1?"#86efac":"#ddd6fe"}`,borderRadius:12,padding:"16px",marginBottom:16,textAlign:"center"}}>
                  <div style={{fontSize:11,fontWeight:700,color:p.color,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>💰 Crédito que entra na sua conta</div>
                  <div style={{fontSize:36,fontWeight:900,color:p.color,letterSpacing:-1}}>+{fmt(creditVal(p.monthly))}</div>
                  <div style={{fontSize:11,color:"#9ca3af",marginTop:4}}>em até 10 dias úteis</div>
                </div>

                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b7280",marginBottom:20,padding:"10px 0",borderTop:"1px solid #f0f0f0"}}>
                  <span>Custo real efetivo</span>
                  <strong style={{color:"#111"}}>{fmt(annualPrice(p.monthly)-creditVal(p.monthly))}</strong>
                </div>

                <button className="cta-main" style={{width:"100%",padding:"13px",fontSize:14,borderRadius:10,justifyContent:"center"}} onClick={goCheckout}>
                  Ativar {p.name} e liberar {fmt(creditVal(p.monthly))}
                </button>
              </div>
            ))}
          </div>

          {/* Micro CTA explicativo */}
          <div style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:16,padding:"24px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:24,flexWrap:"wrap"}}>
            <div>
              <p style={{fontSize:16,fontWeight:800,color:"#111",marginBottom:4}}>
                🎯 No plano Premium: você paga {fmt(annualPrice(197))} e recebe <span className="val-green">+{fmt(creditVal(197))}</span> em créditos.
              </p>
              <p style={{fontSize:14,color:"#6b7280",margin:0}}>
                Custo real de apenas {fmt(annualPrice(197)-creditVal(197))} no ano inteiro — e você ainda anunciou com crédito.
              </p>
            </div>
            <button className="cta-main" style={{padding:"14px 28px",fontSize:15,flexShrink:0,whiteSpace:"nowrap"}} onClick={goCheckout}>
              Começar com vantagem →
            </button>
          </div>
        </section>

        {/* ══ BANNERS CLICÁVEIS B ════════════════════════════════════════════ */}
        <div style={{padding:"0 24px 48px",maxWidth:1080,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}} className="grid-3">
          {[
            {emoji:"🎯",t:"Ative seu bônus de campanha",s:"Crédito real na sua conta MECPro",bg:"#111",col:"#fff",sub:"#6b7280"},
            {emoji:"🚀",t:"Comece com vantagem no tráfego",s:"Seus concorrentes pagam do bolso",bg:"#f0fdf4",col:"#15803d",sub:"#16a34a"},
            {emoji:"💸",t:`Libere ${fmt(maxCredit)} para anunciar`,s:"Plano VIP anual com crédito máximo",bg:"#faf5ff",col:"#7c3aed",sub:"#9333ea"},
          ].map((b,i)=>(
            <button key={i} onClick={goCheckoutDirect} style={{background:b.bg,border:`1px solid ${i===0?"#222":i===1?"#86efac":"#ddd6fe"}`,borderRadius:14,padding:"18px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"transform .15s,box-shadow .15s",textAlign:"left",fontFamily:"inherit"}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1.02)";(e.currentTarget as HTMLElement).style.boxShadow="0 4px 20px rgba(0,0,0,.1)";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
              <span style={{fontSize:28,flexShrink:0}}>{b.emoji}</span>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:b.col,lineHeight:1.3}}>{b.t}</div>
                <div style={{fontSize:11,color:b.sub,marginTop:3}}>{b.s} →</div>
              </div>
            </button>
          ))}
        </div>

        {/* ══ SEÇÃO ESCASSEZ / URGÊNCIA ══════════════════════════════════════ */}
        <section style={{background:"#fef2f2",borderTop:"1px solid #fecaca",borderBottom:"1px solid #fecaca",padding:"64px 24px"}}>
          <div style={{maxWidth:680,margin:"0 auto",textAlign:"center"}}>

            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:99,padding:"6px 18px",marginBottom:24}}>
              <span style={{animation:"blink 1s infinite",fontSize:14}}>🔴</span>
              <span style={{fontSize:12,fontWeight:700,color:"#dc2626",textTransform:"uppercase",letterSpacing:.8}}>Saldo promocional limitado</span>
            </div>

            <h2 style={{fontSize:"clamp(28px,4vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14,color:"#111"}}>
              Restam apenas <span style={{color:"#dc2626"}}>{VAGAS_REST} vagas</span><br/>com crédito ativo
            </h2>
            <p style={{fontSize:16,color:"#6b7280",marginBottom:32,lineHeight:1.7}}>
              Quando o saldo acabar, o plano anual continua disponível — mas <strong style={{color:"#111"}}>sem nenhum crédito</strong>. Não haverá segunda chance com essa condição.
            </p>

            {/* Barra de progresso */}
            <div style={{background:"#e5e7eb",borderRadius:99,height:16,overflow:"hidden",marginBottom:8,maxWidth:460,margin:"0 auto 8px"}}>
              <div style={{width:`${VAGAS_PCT}%`,height:"100%",background:"linear-gradient(90deg,#ef4444,#dc2626)",borderRadius:99}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",maxWidth:460,margin:"0 auto 28px",fontSize:12,color:"#9ca3af"}}>
              <span>{VAGAS_USADAS} vagas preenchidas</span>
              <span style={{color:"#dc2626",fontWeight:700}}>{VAGAS_PCT}% do saldo comprometido</span>
            </div>

            {/* Contador */}
            <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:32}}>
              {[{v:h,l:"horas"},{v:m,l:"minutos"},{v:s,l:"segundos"}].map(t=>(
                <div key={t.l} style={{background:"#111",borderRadius:12,padding:"16px 18px",minWidth:76,textAlign:"center"}}>
                  <div style={{fontSize:34,fontWeight:900,color:"#fff",fontVariantNumeric:"tabular-nums",lineHeight:1}}>{t.v}</div>
                  <div style={{fontSize:10,color:"#6b7280",marginTop:4,textTransform:"uppercase",letterSpacing:.8}}>{t.l}</div>
                </div>
              ))}
            </div>

            <button className="cta-main" style={{padding:"16px 40px",fontSize:17,justifyContent:"center"}} onClick={goCheckout}>
              Garantir minha vaga com crédito →
            </button>
          </div>
        </section>

        {/* ══ PLATAFORMA / FEATURES ══════════════════════════════════════════ */}
        <section id="recursos" style={{maxWidth:1080,margin:"0 auto",padding:"88px 24px"}}>
          <div style={{marginBottom:52}}>
            <div style={{display:"inline-block",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:99,padding:"5px 16px",fontSize:11,fontWeight:700,color:"#15803d",textTransform:"uppercase",letterSpacing:.8,marginBottom:16}}>Plataforma</div>
            <h2 style={{fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14}}>
              4 módulos. 1 campanha pronta.
            </h2>
            <p style={{fontSize:16,color:"#6b7280",maxWidth:480,lineHeight:1.7}}>A IA faz o trabalho pesado. Você escolhe quando publicar.</p>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:"#e5e7eb",border:"1px solid #e5e7eb",borderRadius:20,overflow:"hidden"}} className="grid-3">
            {[
              {n:"01",icon:"🎯",t:"Perfil do Cliente",d:"Mapeie dores, desejos e objeções com profundidade estratégica. A base de toda campanha que converte."},
              {n:"02",icon:"🔍",t:"Análise de Concorrentes",d:"Veja os anúncios que a concorrência está rodando via Meta Ads Library — copy, criativo e estratégia em tempo real."},
              {n:"03",icon:"📊",t:"Inteligência de Mercado",d:"A IA cruza dados e revela os gaps que seus concorrentes não viram. Você entra onde a oportunidade está."},
              {n:"04",icon:"◈",t:"Campanha Automática",d:"Ad sets, copy, orçamento, funil e segmentação — tudo gerado e pronto para publicar no Meta, Google ou TikTok."},
              {n:"05",icon:"◻",t:"Relatórios PDF & XLSX",d:"Documentos profissionais para apresentar a clientes ou implementar sem nenhuma edição extra."},
              {n:"06",icon:"⚡",t:"Publicação Integrada",d:"Conecte Meta, Google e TikTok. Publique campanhas sem sair da plataforma — 1 clique e está no ar."},
            ].map(f=>(
              <article key={f.n} style={{background:"#fff",padding:"26px 24px",transition:"background .2s",cursor:"default"}}
                onMouseEnter={e=>(e.currentTarget.style.background="#f9fafb")}
                onMouseLeave={e=>(e.currentTarget.style.background="#fff")}>
                <div style={{fontSize:22,marginBottom:10}}>{f.icon}</div>
                <div style={{fontSize:10,fontWeight:700,color:"#16a34a",letterSpacing:1,marginBottom:6}}>{f.n}</div>
                <h3 style={{fontSize:15,fontWeight:700,color:"#111",marginBottom:8}}>{f.t}</h3>
                <p style={{fontSize:13,color:"#6b7280",lineHeight:1.65,margin:0}}>{f.d}</p>
              </article>
            ))}
          </div>

          <div style={{textAlign:"center",marginTop:40}}>
            <button className="cta-main" style={{padding:"15px 36px",fontSize:16,justifyContent:"center"}} onClick={goCheckout}>
              Assinar e liberar meu crédito ⚡
            </button>
          </div>
        </section>

        {/* ══ BENEFÍCIOS ═════════════════════════════════════════════════════ */}
        <section style={{background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"80px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:52}}>
              <h2 style={{fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14}}>
                Com o crédito ativo, você<br/><span className="val-green">sai na frente desde o primeiro dia</span>
              </h2>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20,marginBottom:40}} className="grid-3">
              {[
                {icon:"📈",t:"Mais alcance",d:`Com ${fmt(credit)} em crédito você aparece para muito mais pessoas — sem tirar nada extra do bolso.`},
                {icon:"⚡",t:"Mais campanhas",d:"Crie e teste mais anúncios com verba que você já pagou. Quem testa mais, vende mais."},
                {icon:"🛡️",t:"Menor risco",d:"O crédito cobre quase metade do custo anual. Se uma campanha não performar, você não perdeu dinheiro real."},
                {icon:"🎯",t:"Vantagem real",d:"Seus concorrentes pagam tráfego do próprio bolso. Você usa crédito que a plataforma te deu. Isso é vantagem."},
                {icon:"🔒",t:"Preço garantido",d:"Assinou anual? Seu valor não sobe. Mesmo que os planos sejam reajustados, você fica no preço atual."},
                {icon:"🏆",t:"Suporte prioritário",d:"Assinantes anuais têm fila preferencial no suporte e acesso antecipado a novos recursos."},
              ].map(b=>(
                <div key={b.t} className="card" style={{textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:12}}>{b.icon}</div>
                  <div style={{fontWeight:800,fontSize:15,color:"#111",marginBottom:8}}>{b.t}</div>
                  <p style={{fontSize:13,color:"#6b7280",lineHeight:1.6,margin:0}}>{b.d}</p>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center"}}>
              <button className="cta-main" style={{padding:"15px 36px",fontSize:16,justifyContent:"center"}} onClick={goCheckout}>
                Ativar meus {fmt(credit)} agora →
              </button>
            </div>
          </div>
        </section>

        {/* ══ COMO FUNCIONA ══════════════════════════════════════════════════ */}
        <section id="como-funciona" style={{padding:"80px 24px",maxWidth:1080,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:52}}>
            <h2 style={{fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14}}>
              4 passos. Crédito na conta.
            </h2>
            <p style={{fontSize:16,color:"#6b7280"}}>Sem burocracia. Sem taxa oculta. Sem pegadinha.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:20,marginBottom:40}} className="grid-2">
            {[
              {n:"01",icon:"✍️",t:"Assina o plano anual",d:"Escolha Basic, Premium ou VIP. O desconto de 20% já é automático no anual."},
              {n:"02",icon:"⏳",t:"Aguarda até 10 dias úteis",d:"Confirmamos o pagamento e processamos o crédito na sua conta MECPro."},
              {n:"03",icon:"💰",t:"Crédito liberado na conta",d:`No Premium: ${fmt(creditVal(197))} disponíveis para usar nas campanhas.`},
              {n:"04",icon:"🚀",t:"Usa nos anúncios",d:"Crédito disponível para Meta, Google e TikTok — direto pela plataforma."},
            ].map(step=>(
              <div key={step.n} className="card" style={{textAlign:"center"}}>
                <div style={{width:52,height:52,borderRadius:16,background:"#f0fdf4",border:"2px solid #86efac",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px"}}>{step.icon}</div>
                <div style={{fontSize:10,fontWeight:800,color:"#16a34a",letterSpacing:1,marginBottom:6}}>{step.n}</div>
                <div style={{fontWeight:800,fontSize:15,color:"#111",marginBottom:8}}>{step.t}</div>
                <p style={{fontSize:13,color:"#6b7280",lineHeight:1.6,margin:0}}>{step.d}</p>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center"}}>
            <button className="cta-main" style={{padding:"15px 36px",fontSize:16,justifyContent:"center"}} onClick={goCheckout}>
              Começar agora e liberar meu crédito →
            </button>
          </div>
        </section>

        {/* ══ ACADEMY ════════════════════════════════════════════════════════ */}
        <section id="academy" style={{background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"80px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:48,flexWrap:"wrap",gap:20}}>
              <div>
                <div style={{display:"inline-block",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:99,padding:"5px 16px",fontSize:11,fontWeight:700,color:"#15803d",textTransform:"uppercase",letterSpacing:.8,marginBottom:14}}>MECPro Academy</div>
                <h2 style={{fontSize:"clamp(26px,3.5vw,40px)",fontWeight:900,letterSpacing:-1.5,marginBottom:12}}>
                  Aprenda a usar o crédito<br/>para gerar resultado de verdade
                </h2>
                <p style={{fontSize:15,color:"#6b7280",maxWidth:480,lineHeight:1.7,margin:0}}>
                  Mini cursos práticos ensinando como criar campanhas com o MECPro — incluso no plano anual.
                </p>
              </div>
              <a href="/courses" style={{fontSize:14,color:"#16a34a",fontWeight:700,textDecoration:"none",border:"1.5px solid #16a34a",padding:"10px 22px",borderRadius:10,whiteSpace:"nowrap"}}>
                Ver todos os cursos →
              </a>
            </div>
            {MINI_COURSES.filter(c=>c.highlight).map(c=>(
              <div key={c.slug} onClick={()=>setLocation(`/courses/${c.slug}`)} style={{background:"linear-gradient(135deg,#052e16,#14532d)",borderRadius:20,padding:"36px 44px",marginBottom:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:28,flexWrap:"wrap",border:"1px solid #16a34a"}}>
                <div>
                  <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center"}}>
                    <span style={{fontSize:26}}>{c.icon}</span>
                    <span style={{background:c.tagColor,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:99}}>{c.tag}</span>
                  </div>
                  <h3 style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:10}}>{c.title}</h3>
                  <p style={{fontSize:14,color:"#86efac",lineHeight:1.65,maxWidth:460,margin:"0 0 18px"}}>{c.desc}</p>
                  <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
                    {[{i:"⏱",v:c.duration},{i:"📚",v:`${c.lessons} aulas`},{i:"🎓",v:c.level}].map(x=>(
                      <span key={x.v} style={{fontSize:12,color:"#4ade80",display:"flex",alignItems:"center",gap:5}}>{x.i} {x.v}</span>
                    ))}
                  </div>
                </div>
                <button style={{background:"#fff",color:"#14532d",fontWeight:800,fontSize:14,padding:"12px 24px",border:"none",borderRadius:12,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                  Começar grátis →
                </button>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
              {MINI_COURSES.filter(c=>!c.highlight).map(c=>(
                <article key={c.slug} onClick={()=>setLocation(`/courses/${c.slug}`)} className="card" style={{cursor:"pointer",transition:"box-shadow .2s,transform .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.07)";e.currentTarget.style.transform="translateY(-2px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                    <span style={{fontSize:24}}>{c.icon}</span>
                    <span style={{background:c.tagColor,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:99}}>{c.tag}</span>
                  </div>
                  <h3 style={{fontSize:14,fontWeight:700,color:"#111",marginBottom:8,lineHeight:1.4}}>{c.title}</h3>
                  <p style={{fontSize:12,color:"#6b7280",lineHeight:1.6,marginBottom:14}}>{c.desc}</p>
                  <div style={{display:"flex",gap:12,borderTop:"1px solid #f0f0f0",paddingTop:12}}>
                    {[{i:"⏱",v:c.duration},{i:"📚",v:`${c.lessons} aulas`},{i:"🎓",v:c.level}].map(x=>(
                      <span key={x.v} style={{fontSize:11,color:"#9ca3af",display:"flex",alignItems:"center",gap:3}}>{x.i} {x.v}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══ AVERSÃO À PERDA ════════════════════════════════════════════════ */}
        <section style={{padding:"80px 24px",background:"#111"}}>
          <div style={{maxWidth:720,margin:"0 auto",textAlign:"center"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:99,padding:"6px 16px",marginBottom:28}}>
              <span style={{fontSize:14,animation:"blink 1.4s infinite"}}>⚠️</span>
              <span style={{fontSize:12,fontWeight:700,color:"#f87171",textTransform:"uppercase",letterSpacing:.8}}>Não perca essa oportunidade</span>
            </div>

            <h2 style={{fontSize:"clamp(26px,4vw,44px)",fontWeight:900,letterSpacing:-1.5,color:"#fff",marginBottom:24,lineHeight:1.1}}>
              Depois dessa campanha,<br/>
              <span style={{color:"#f87171"}}>o crédito some. O preço fica.</span>
            </h2>

            <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:"24px 28px",marginBottom:40,textAlign:"left"}}>
              {[
                {icon:"✕",text:`Depois que encerrar: plano anual continua sem nenhum crédito`,color:"#f87171"},
                {icon:"✕",text:"Quem entrar agora já estará anunciando com dinheiro da plataforma",color:"#f87171"},
                {icon:"✕",text:"Não haverá segunda chance — essa condição não se repete",color:"#f87171"},
                {icon:"✓",text:`Quem assina agora: paga ${fmt(annualPrice(197))} e anuncia com ${fmt(creditVal(197))} de crédito`,color:"#4ade80"},
              ].map((l,i)=>(
                <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:i<3?12:0}}>
                  <span style={{color:l.color,fontWeight:900,flexShrink:0,marginTop:1,fontSize:16}}>{l.icon}</span>
                  <span style={{fontSize:14,color:"#9ca3af",lineHeight:1.6}}>{l.text}</span>
                </div>
              ))}
            </div>

            {/* Comparativo agora x depois */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:40}} className="grid-2">
              <div style={{background:"rgba(22,163,74,.1)",border:"2px solid rgba(22,163,74,.4)",borderRadius:16,padding:"22px",textAlign:"center"}}>
                <div style={{fontSize:11,fontWeight:800,color:"#4ade80",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>✅ AGORA</div>
                <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Plano Premium anual</div>
                <div style={{fontSize:24,fontWeight:900,color:"#4ade80",marginBottom:4}}>{fmt(annualPrice(197))}</div>
                <div style={{fontSize:13,color:"#4ade80",fontWeight:700,marginBottom:10}}>+ {fmt(creditVal(197))} em crédito</div>
                <div style={{fontSize:11,color:"#6b7280"}}>Custo real: <strong style={{color:"#fff"}}>{fmt(annualPrice(197)-creditVal(197))}</strong></div>
              </div>
              <div style={{background:"rgba(239,68,68,.06)",border:"2px solid rgba(239,68,68,.2)",borderRadius:16,padding:"22px",textAlign:"center"}}>
                <div style={{fontSize:11,fontWeight:800,color:"#f87171",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>❌ DEPOIS</div>
                <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Plano Premium anual</div>
                <div style={{fontSize:24,fontWeight:900,color:"#f87171",marginBottom:4}}>{fmt(annualPrice(197))}</div>
                <div style={{fontSize:13,color:"#6b7280",fontWeight:700,marginBottom:10}}>sem crédito</div>
                <div style={{fontSize:11,color:"#6b7280"}}>Custo real: <strong style={{color:"#fff"}}>{fmt(annualPrice(197))}</strong></div>
              </div>
            </div>

            <button className="cta-main" style={{padding:"17px 44px",fontSize:17,justifyContent:"center"}} onClick={goCheckout}>
              ⚡ Ativar meus créditos agora
            </button>
            <p style={{fontSize:12,color:"#4b5563",marginTop:14}}>Pagamento seguro via Asaas · Pix ou cartão</p>
          </div>
        </section>

        {/* ══ PRICING ════════════════════════════════════════════════════════ */}
        <section style={{padding:"88px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:56}}>
              <h2 style={{fontSize:"clamp(28px,3.5vw,48px)",fontWeight:900,letterSpacing:-2,marginBottom:14}}>
                Escolha seu plano e<br/><span className="val-green">libere seu crédito</span>
              </h2>
              <p style={{fontSize:16,color:"#6b7280",lineHeight:1.7}}>
                Todos os planos anuais incluem crédito real · Academy completa · Cancele quando quiser
              </p>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}} className="grid-3">
              {PLANS.map(p=>(
                <article key={p.slug} style={{background:"#fff",border:`1.5px solid ${p.popular?"#16a34a":"#e5e7eb"}`,borderRadius:20,padding:32,position:"relative",boxShadow:p.popular?"0 0 0 4px rgba(22,163,74,.08)":"none"}}>
                  {p.popular && (
                    <>
                      <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:"linear-gradient(90deg,#16a34a,#4ade80)",borderRadius:"18px 18px 0 0"}}/>
                      <div style={{position:"absolute",top:-13,left:"50%",transform:"translateX(-50%)",background:"#16a34a",color:"#fff",fontSize:10,fontWeight:800,padding:"4px 16px",borderRadius:99,whiteSpace:"nowrap"}}>⭐ MAIS POPULAR</div>
                    </>
                  )}
                  <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>{p.name}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:4}}>
                    <span style={{fontSize:13,color:"#9ca3af"}}>R$</span>
                    <span style={{fontSize:44,fontWeight:900,color:"#111",letterSpacing:-2,lineHeight:1}}>{Math.floor(p.monthly*0.8)}</span>
                    <span style={{fontSize:13,color:"#9ca3af"}}>/mês</span>
                  </div>
                  <div style={{fontSize:12,color:"#9ca3af",marginBottom:6}}>cobrado anualmente · economize 20%</div>
                  <div style={{fontSize:13,color:"#6b7280",marginBottom:20}}>
                    Total anual: <strong style={{color:"#111"}}>{fmt(annualPrice(p.monthly))}</strong>
                  </div>

                  <div style={{background:"#f0fdf4",border:"2px solid #86efac",borderRadius:14,padding:"16px",marginBottom:20,textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#16a34a",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>💰 Crédito que entra na sua conta</div>
                    <div style={{fontSize:34,fontWeight:900,color:"#16a34a",letterSpacing:-1}}>+{fmt(creditVal(p.monthly))}</div>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:4}}>em até 10 dias úteis</div>
                  </div>

                  <div style={{fontSize:13,color:"#6b7280",marginBottom:24,display:"flex",justifyContent:"space-between",padding:"12px 0",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0"}}>
                    <span>Custo efetivo real</span>
                    <strong style={{color:"#111"}}>{fmt(annualPrice(p.monthly)-creditVal(p.monthly))}</strong>
                  </div>

                  <div style={{marginBottom:20}}>
                    {(p.slug==="basic"
                      ?["3 projetos","5 concorrentes/projeto","10 campanhas/mês","Academy gratuita","Suporte por e-mail"]
                      :p.slug==="premium"
                        ?["10 projetos","Concorrentes ilimitados","Campanhas ilimitadas","Academy completa + certificados","Relatórios PDF","Suporte prioritário"]
                        :["Projetos ilimitados","Tudo do Premium","Academy VIP + mentoria","API access","Manager dedicado","Onboarding personalizado"]
                    ).map(f=>(
                      <div key={f} style={{display:"flex",gap:8,fontSize:13,color:"#374151",marginBottom:8}}>
                        <span style={{color:"#16a34a",fontWeight:700}}>✓</span>{f}
                      </div>
                    ))}
                  </div>

                  <button className="cta-main" style={{width:"100%",padding:"14px",fontSize:14,justifyContent:"center",borderRadius:12}} onClick={goCheckout}>
                    Assinar {p.name} · Liberar {fmt(creditVal(p.monthly))}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══ TERMOS E RESPONSABILIDADE (OBRIGATÓRIO) ════════════════════════ */}
        <section id="termos-section" style={{background:"#f9fafb",borderTop:"1px solid #e5e7eb",borderBottom:"1px solid #e5e7eb",padding:"64px 24px"}}>
          <div style={{maxWidth:720,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:32}}>
              <div style={{display:"inline-block",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:99,padding:"5px 16px",fontSize:11,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:.8,marginBottom:16}}>
                ⚖️ Termos do crédito promocional
              </div>
              <h2 style={{fontSize:"clamp(22px,3vw,32px)",fontWeight:800,letterSpacing:-1,marginBottom:10}}>Leia antes de assinar</h2>
              <p style={{fontSize:15,color:"#6b7280",lineHeight:1.7}}>Queremos ser transparentes. O crédito é real, mas tem regras claras.</p>
            </div>

            <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:"28px 32px",marginBottom:24}}>
              {[
                {icon:"💰",title:"O que é o crédito",text:"É um valor promocional em reais creditado na sua conta MECPro, exclusivo para uso em campanhas dentro da plataforma. Não é dinheiro em espécie — é crédito de mídia."},
                {icon:"🚫",title:"O que o crédito NÃO é",text:"O crédito não pode ser sacado, transferido para terceiros, convertido em dinheiro ou utilizado fora da plataforma MECPro."},
                {icon:"📅",title:"Prazo de liberação",text:"O crédito é liberado em até 10 dias úteis após a confirmação do pagamento anual. O prazo pode variar conforme o método de pagamento escolhido."},
                {icon:"❌",title:"Cancelamento e créditos",text:"Em caso de cancelamento do plano anual: (1) créditos não utilizados são removidos imediatamente; (2) se os créditos foram total ou parcialmente utilizados, o valor correspondente pode ser cobrado proporcionalmente ao período não usufruído."},
                {icon:"✅",title:"Validade",text:"O crédito é válido durante a vigência do plano anual contratado. Créditos não utilizados não são transferidos para renovações futuras."},
              ].map((t,i)=>(
                <div key={i} style={{display:"flex",gap:16,alignItems:"flex-start",paddingBottom:i<4?20:0,marginBottom:i<4?20:0,borderBottom:i<4?"1px solid #f0f0f0":"none"}}>
                  <div style={{width:40,height:40,borderRadius:12,background:"#f9fafb",border:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{t.icon}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#111",marginBottom:4}}>{t.title}</div>
                    <p style={{fontSize:13,color:"#6b7280",lineHeight:1.65,margin:0}}>{t.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Checkbox de aceite — OBRIGATÓRIO */}
            <div style={{background:termsError?"#fef2f2":"#f0fdf4",border:`2px solid ${termsError?"#fca5a5":"#86efac"}`,borderRadius:14,padding:"20px 24px",animation:termsError?"shake .4s ease":"none"}}>
              <label style={{display:"flex",alignItems:"flex-start",gap:14,cursor:"pointer"}}>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e=>{setTermsAccepted(e.target.checked);if(e.target.checked)setTermsError(false);}}
                  style={{width:20,height:20,marginTop:2,accentColor:"#16a34a",cursor:"pointer",flexShrink:0}}
                />
                <div>
                  <span style={{fontSize:14,fontWeight:700,color:"#111",display:"block",marginBottom:4}}>
                    Li e aceito os termos do crédito promocional
                  </span>
                  <span style={{fontSize:13,color:"#6b7280",lineHeight:1.6}}>
                    Entendo que o crédito é exclusivo para uso dentro do MECPro, não pode ser sacado e será removido em caso de cancelamento do plano anual. Caso os créditos tenham sido utilizados, o valor proporcional pode ser cobrado.{" "}
                    <button onClick={()=>setShowTerms(!showTerms)} style={{background:"none",border:"none",color:"#16a34a",fontWeight:700,cursor:"pointer",padding:0,fontSize:13,fontFamily:"inherit",textDecoration:"underline"}}>
                      {showTerms?"Ocultar termos completos":"Ver termos completos"}
                    </button>
                  </span>
                </div>
              </label>

              {termsError && (
                <p style={{fontSize:13,color:"#dc2626",fontWeight:700,marginTop:12,marginLeft:34,animation:"slideIn .3s ease"}}>
                  ⚠️ Você precisa aceitar os termos para continuar
                </p>
              )}

              {showTerms && (
                <div style={{marginTop:16,marginLeft:34,fontSize:12,color:"#6b7280",lineHeight:1.8,background:"#fff",borderRadius:10,padding:"14px 16px",border:"1px solid #e5e7eb",animation:"slideIn .3s ease"}}>
                  <strong style={{color:"#111",display:"block",marginBottom:8}}>Termos completos do crédito promocional MECPro:</strong>
                  <ol style={{paddingLeft:18,margin:0}}>
                    <li>O crédito promocional é concedido exclusivamente a assinantes do plano anual MECPro.</li>
                    <li>O valor do crédito equivale a aproximadamente 60% do valor total pago pelo plano anual.</li>
                    <li>O crédito é depositado na conta MECPro do assinante em até 10 dias úteis após a confirmação do pagamento.</li>
                    <li>O crédito é válido exclusivamente para uso em campanhas dentro da plataforma MECPro (Meta Ads, Google Ads e TikTok Ads).</li>
                    <li>O crédito não pode ser sacado, transferido, revendido ou convertido em dinheiro.</li>
                    <li>Em caso de cancelamento do plano antes do término do período anual: (a) créditos não utilizados são cancelados sem direito a reembolso; (b) créditos utilizados podem ser cobrados proporcionalmente ao período de uso, conforme política de cancelamento vigente.</li>
                    <li>O crédito tem validade durante o período do plano anual contratado.</li>
                    <li>O MECPro reserva-se o direito de encerrar ou modificar a oferta de crédito promocional a qualquer momento para novos assinantes, sem afetar contratos já firmados.</li>
                    <li>Esta oferta não é cumulativa com outras promoções, descontos ou programas de indicação.</li>
                    <li>Ao aceitar estes termos, o assinante concorda com a Política de Privacidade e Termos de Serviço do MECPro disponíveis em mecproai.com/terms.</li>
                  </ol>
                </div>
              )}
            </div>

            <div style={{textAlign:"center",marginTop:28}}>
              <button className="cta-main" style={{padding:"16px 40px",fontSize:17,justifyContent:"center"}} onClick={goCheckout}>
                💰 Aceitar e ativar meus créditos
              </button>
              <p style={{fontSize:12,color:"#9ca3af",marginTop:12}}>
                {termsAccepted ? "✅ Termos aceitos — clique acima para continuar" : "⚠️ Aceite os termos acima para liberar o crédito"}
              </p>
            </div>
          </div>
        </section>

        {/* ══ FAQ ════════════════════════════════════════════════════════════ */}
        <section style={{padding:"80px 24px"}}>
          <div style={{maxWidth:720,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:40}}>
              <h2 style={{fontSize:"clamp(24px,3vw,38px)",fontWeight:900,letterSpacing:-1.5,marginBottom:10}}>Perguntas frequentes</h2>
            </div>
            {[
              {q:`Quanto de crédito eu recebo no plano Premium?`,a:`No plano Premium anual você paga ${fmt(annualPrice(197))} e recebe ${fmt(creditVal(197))} em crédito. No Basic são ${fmt(creditVal(97))} e no VIP são ${fmt(creditVal(397))}.`},
              {q:"O crédito entra como dinheiro de verdade?",a:"Sim — entra como crédito real na sua conta MECPro e você usa para pagar campanhas em Meta, Google e TikTok. É dinheiro de mídia. Não é desconto, não é cupom."},
              {q:"O que acontece se eu cancelar?",a:"Créditos não utilizados são cancelados. Se parte foi usada, o valor pode ser cobrado proporcionalmente. Recomendamos usar o crédito o quanto antes para aproveitar ao máximo."},
              {q:"Qual a forma de pagamento?",a:"O sistema usa Asaas — você pode pagar via Pix ou cartão de crédito. Após a confirmação, o crédito é liberado em até 10 dias úteis."},
              {q:"Funciona para qualquer tipo de negócio?",a:"Sim. Agências, e-commerces, SaaS, consultorias, freelancers — todos usam o MECPro. A IA adapta as campanhas para o seu segmento."},
            ].map((item,i)=>(
              <details key={i} style={{borderBottom:"1px solid #f0f0f0",padding:"18px 0"}}>
                <summary style={{fontWeight:700,fontSize:15,cursor:"pointer",color:"#111",listStyle:"none",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                  {item.q}
                  <span style={{fontSize:20,color:"#16a34a",fontWeight:300,flexShrink:0}}>+</span>
                </summary>
                <p style={{marginTop:12,fontSize:14,color:"#6b7280",lineHeight:1.7,marginBottom:0}}>{item.a}</p>
              </details>
            ))}
            <div style={{textAlign:"center",marginTop:32}}>
              <button className="cta-main" style={{padding:"14px 36px",fontSize:16,justifyContent:"center"}} onClick={goCheckout}>
                Liberar meu crédito agora ⚡
              </button>
            </div>
          </div>
        </section>

        {/* ══ RODAPÉ COM REFORÇO ═════════════════════════════════════════════ */}
        <section style={{background:"#111",padding:"72px 24px"}}>
          <div style={{maxWidth:640,margin:"0 auto",textAlign:"center"}}>

            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:99,padding:"6px 16px",marginBottom:24}}>
              <span style={{animation:"blink 1.4s infinite",fontSize:14}}>🔴</span>
              <span style={{fontSize:12,fontWeight:700,color:"#f87171",textTransform:"uppercase",letterSpacing:.8}}>
                Oferta encerra em {h}:{m}:{s} · {VAGAS_REST} vagas
              </span>
            </div>

            <h2 style={{fontSize:"clamp(26px,4vw,44px)",fontWeight:900,letterSpacing:-1.5,color:"#fff",marginBottom:16,lineHeight:1.1}}>
              Última chance de anunciar com<br/><span style={{color:"#4ade80"}}>{fmt(maxCredit)} de crédito</span>
            </h2>
            <p style={{fontSize:16,color:"#6b7280",marginBottom:36,lineHeight:1.7}}>
              Depois que essa campanha encerrar, o plano anual volta ao valor normal sem nenhum crédito. Quem entrou agora já está anunciando com vantagem.
            </p>

            <button className="cta-main" style={{padding:"18px 48px",fontSize:18,justifyContent:"center",marginBottom:20}} onClick={goCheckout}>
              ⚡ Ativar meus {fmt(credit)} agora
            </button>

            <div style={{display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap",marginBottom:48}}>
              {["Pagamento via Pix ou cartão","Cancele quando quiser","Crédito em até 10 dias"].map(t=>(
                <div key={t} style={{fontSize:12,color:"#4b5563",display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"#4ade80"}}>✓</span>{t}
                </div>
              ))}
            </div>

            <div style={{borderTop:"1px solid #1f2937",paddingTop:28,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14}}>
              <a href="/" style={{textDecoration:"none",fontSize:18,fontWeight:900,color:"#fff",display:"flex",alignItems:"center",gap:8}}>
                <img src="/logo-512.png" alt="MECPro" height={36} style={{display:"block",borderRadius:8}}/>
                MEC<span style={{color:"#4ade80"}}>PRO</span>
              </a>
              <nav style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                {[{l:"Preços",h:"/pricing"},{l:"Academy",h:"/courses"},{l:"Termos",h:"/terms"},{l:"Privacidade",h:"/privacy"},{l:"Contato",h:"/contact"}].map(x=>(
                  <a key={x.l} href={x.h} style={{fontSize:12,color:"#4b5563",textDecoration:"none"}}>{x.l}</a>
                ))}
              </nav>
              <span style={{fontSize:12,color:"#374151"}}>© 2026 MECPro</span>
            </div>
          </div>
        </section>

      </div>

      {/* ══ CTA FLUTUANTE ══════════════════════════════════════════════════ */}
      <div style={{position:"fixed",bottom:90,left:"50%",zIndex:9997,animation:"floatY 3s ease-in-out infinite",filter:"drop-shadow(0 6px 24px rgba(22,163,74,.5))"}}>
        <button onClick={goCheckout} style={{background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:900,fontSize:15,padding:"13px 28px",borderRadius:99,border:"none",cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 28px rgba(22,163,74,.5)",fontFamily:"inherit"}}>
          <span style={{fontSize:18}}>⚡</span>
          Ativar meus {fmt(credit)}
          <span style={{background:"rgba(0,0,0,.25)",borderRadius:99,fontSize:11,fontWeight:700,padding:"2px 8px"}}>
            {VAGAS_REST} vagas
          </span>
        </button>
      </div>

      <WABtn/>
    </>
  );
}
