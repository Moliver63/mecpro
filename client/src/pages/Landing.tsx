import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import SEO, { SEO_CONFIGS } from "@/components/SEO";

// ── Dados dos planos ──────────────────────────────────────────────────────────
const PLANS = [
  { name: "Basic",   monthly: 97,  slug: "basic"   },
  { name: "Premium", monthly: 197, slug: "premium", popular: true },
  { name: "VIP",     monthly: 397, slug: "vip"      },
];
const annualTotal  = (m: number) => Math.floor(m * 0.8) * 12;
const credit60     = (m: number) => Math.round(annualTotal(m) * 0.6);
const R            = (v: number) => `R$\u00a0${v.toLocaleString("pt-BR")}`;

// ── Contador regressivo 72h ───────────────────────────────────────────────────
function useCountdown() {
  const end = useRef(Date.now() + 72 * 3600 * 1000);
  const [left, setLeft] = useState(end.current - Date.now());
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, end.current - Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return {
    h: pad(left / 3600000),
    m: pad((left % 3600000) / 60000),
    s: pad((left % 60000) / 1000),
  };
}

// ── Vagas simuladas ───────────────────────────────────────────────────────────
const TOTAL_VAGAS = 50;
const USADAS      = 37;
const VAGAS_LEFT  = TOTAL_VAGAS - USADAS;
const PCT         = Math.round((USADAS / TOTAL_VAGAS) * 100);

// ── WhatsApp ──────────────────────────────────────────────────────────────────
const WA_NUMBER = "554799465824";
const WA_MSG    = encodeURIComponent("Olá! Tenho interesse no MECPro. Pode me ajudar? 😊");

function WAButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div style={{ position:"fixed",bottom:88,right:20,zIndex:9999,width:286,background:"white",borderRadius:16,boxShadow:"0 8px 36px rgba(0,0,0,.18)",padding:"18px 16px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <svg width="22" height="22" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
              </div>
              <div>
                <p style={{ margin:0,fontWeight:800,fontSize:13,color:"#111" }}>Michel Leal</p>
                <p style={{ margin:0,fontSize:11,color:"#25d366",fontWeight:600 }}>● Gerente de Relacionamento</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9ca3af",lineHeight:1,padding:"2px 6px" }}>×</button>
          </div>
          <div style={{ background:"#f0fdf4",borderRadius:10,padding:"10px 13px",marginBottom:14 }}>
            <p style={{ margin:0,fontSize:12,color:"#374151",lineHeight:1.6 }}>👋 Olá! Posso ajudar com dúvidas sobre o <strong>MECPro</strong> ou nossos planos. Fale comigo agora!</p>
          </div>
          <a href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
            style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"linear-gradient(135deg,#25d366,#128c7e)",color:"white",borderRadius:10,padding:"11px 16px",fontWeight:800,fontSize:13,textDecoration:"none",boxShadow:"0 4px 14px rgba(37,211,102,.4)" }}>
            <svg width="17" height="17" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
            Chamar no WhatsApp
          </a>
          <p style={{ margin:"10px 0 0",fontSize:10,color:"#9ca3af",textAlign:"center" }}>(47) 99465-824 · Seg–Sex, 9h–18h</p>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-label="Falar no WhatsApp"
        style={{ position:"fixed",bottom:22,right:22,zIndex:9998,width:58,height:58,borderRadius:"50%",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(37,211,102,.55)",transform:open?"scale(1.08)":"scale(1)",transition:"transform .2s" }}>
        {open
          ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
          : <svg width="30" height="30" viewBox="0 0 32 32" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z" fill="white"/><path d="M21.5 19.3c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-1.75-.87-2.9-1.56-4.06-3.53-.3-.53.3-.49.87-1.63.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.91-2.19-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.57-.09 1.75-.72 2-1.41.24-.7.24-1.3.17-1.42-.07-.12-.27-.19-.57-.34z" fill="#128c7e"/></svg>
        }
      </button>
    </>
  );
}

// ── JSON-LD ───────────────────────────────────────────────────────────────────
const LANDING_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type":"SoftwareApplication","name":"MECPro","url":"https://mecproai.com","description":"Plataforma de inteligência de campanhas com IA.","applicationCategory":"BusinessApplication","operatingSystem":"Web Browser","inLanguage":"pt-BR","isAccessibleForFree":true,"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"127","bestRating":"5"} },
    { "@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"O que é o MECPro?","acceptedAnswer":{"@type":"Answer","text":"MECPro é a plataforma líder em geração de campanhas com IA."}},
      {"@type":"Question","name":"Como funciona o crédito de 60%?","acceptedAnswer":{"@type":"Answer","text":"Ao assinar o plano anual, você recebe 60% do valor pago em créditos para usar em campanhas dentro da plataforma, em até 10 dias úteis."}},
    ]},
  ],
};

// ── Mini Cursos ───────────────────────────────────────────────────────────────
const MINI_COURSES = [
  { slug:"campanha-zero-mecpro",icon:"◈",tag:"GRATUITO",tagColor:"#16a34a",title:"Campanha do Zero com MECPro",desc:"Aprenda a criar sua primeira campanha completa usando a plataforma — passo a passo em 45 minutos.",duration:"45 min",lessons:6,level:"Iniciante",highlight:true },
  { slug:"analise-concorrentes-ia",icon:"🔍",tag:"PRO",tagColor:"#7c3aed",title:"Análise de Concorrentes com IA",desc:"Domine o módulo de concorrentes do MECPro e extraia insights que nenhum concorrente sabe que você tem.",duration:"6h 15min",lessons:24,level:"Intermediário",highlight:false },
  { slug:"copy-ia-guia-pratico",icon:"✍️",tag:"GRATUITO",tagColor:"#16a34a",title:"Copy com IA — Guia Prático",desc:"Como usar o gerador de copy do MECPro para criar anúncios que convertem — com exemplos reais.",duration:"1h 20min",lessons:8,level:"Iniciante",highlight:false },
  { slug:"marketing-meta-ads",icon:"📘",tag:"PRO",tagColor:"#7c3aed",title:"Meta Ads do Zero ao Avançado",desc:"Campanha, público, criativo e orçamento — tudo dentro do MECPro conectado ao Meta Ads.",duration:"12h 30min",lessons:48,level:"Completo",highlight:false },
  { slug:"estrategia-ecommerce",icon:"🛒",tag:"PRO",tagColor:"#7c3aed",title:"Estratégia para E-commerce",desc:"Use o MECPro para escalar sua loja com tráfego pago, remarketing e funil de vendas automatizado.",duration:"10h 20min",lessons:42,level:"Avançado",highlight:false },
  { slug:"relatorios-e-metricas",icon:"📊",tag:"GRATUITO",tagColor:"#16a34a",title:"Relatórios e Métricas que Importam",desc:"Exporte relatórios PDF/XLSX pelo MECPro e saiba quais KPIs realmente impactam seus resultados.",duration:"4h 30min",lessons:18,level:"Iniciante",highlight:false },
];

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
export default function Landing() {
  const [, setLocation] = useLocation();
  const [planIdx, setPlanIdx] = useState(1);
  const { h, m, s } = useCountdown();

  const plan   = PLANS[planIdx];
  const total  = annualTotal(plan.monthly);
  const credit = credit60(plan.monthly);

  const goCheckout = () => setLocation("/pricing");

  return (
    <>
      <SEO
        title={SEO_CONFIGS.landing.title}
        description={SEO_CONFIGS.landing.description}
        keywords={SEO_CONFIGS.landing.keywords}
        canonical={SEO_CONFIGS.landing.canonical}
        ogType="website"
        structuredData={LANDING_JSONLD}
      />

      <style>{`
        @keyframes pulse-g { 0%,100%{box-shadow:0 0 0 0 rgba(48,209,88,.45)} 60%{box-shadow:0 0 0 14px rgba(48,209,88,0)} }
        @keyframes floatY  { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-5px)} }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .btn-g {
          background: linear-gradient(135deg,#30d158,#248a3d);
          color:#fff; font-weight:800; border:none; cursor:pointer;
          border-radius:12px; transition:transform .15s,filter .15s;
          animation: pulse-g 2.8s infinite;
        }
        .btn-g:hover { transform:scale(1.03); filter:brightness(1.08); }
        .promo-card { background:#fff; border:1px solid #e5e7eb; border-radius:18px; padding:28px; }
        @media(max-width:640px){
          .hide-sm { display:none!important; }
          .grid-3  { grid-template-columns:1fr!important; }
          .grid-2  { grid-template-columns:1fr!important; }
        }
      `}</style>

      <div style={{ fontFamily:"var(--font-body,sans-serif)", background:"#fff", color:"#111" }}>

        {/* ══ BARRA URGÊNCIA TOPO ══════════════════════════════════════════ */}
        <div style={{ background:"linear-gradient(90deg,#16a34a,#15803d)", padding:"9px 16px", textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, fontWeight:700, color:"#fff" }}>
            🔥 OFERTA LIMITADA — Assine o plano anual e ganhe <strong>60% em créditos</strong>
          </span>
          <span style={{ background:"rgba(0,0,0,.2)", color:"#fff", fontWeight:800, fontSize:13, padding:"3px 12px", borderRadius:99, fontVariantNumeric:"tabular-nums", letterSpacing:1 }}>
            ⏰ {h}:{m}:{s}
          </span>
          <button onClick={goCheckout} style={{ background:"#fff", color:"#16a34a", fontWeight:800, fontSize:12, padding:"5px 14px", borderRadius:99, border:"none", cursor:"pointer" }}>
            Ativar agora →
          </button>
        </div>

        {/* ══ NAV ══════════════════════════════════════════════════════════ */}
        <nav style={{ position:"sticky",top:0,zIndex:100,height:60,background:"rgba(255,255,255,.96)",backdropFilter:"blur(16px)",borderBottom:"1px solid #f0f0f0" }}>
          <div style={{ maxWidth:1080,margin:"0 auto",padding:"0 24px",height:"100%",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <a href="/" style={{ textDecoration:"none",display:"flex",alignItems:"center" }}>
              <img src="/logo.png" alt="MECPro" height={36} style={{ display:"block" }} />
            </a>
            <nav className="hide-sm" style={{ display:"flex",gap:24 }}>
              {[{label:"Plataforma",href:"/#recursos"},{label:"Academy",href:"/courses"},{label:"Preços",href:"/pricing"},{label:"FAQ",href:"/faq"}].map(l=>(
                <a key={l.label} href={l.href} style={{ fontSize:14,color:"#6b7280",textDecoration:"none",fontWeight:500 }}>{l.label}</a>
              ))}
            </nav>
            <div style={{ display:"flex",gap:8 }}>
              <button className="btn btn-md btn-ghost" onClick={()=>setLocation("/login")}>Entrar</button>
              <button className="btn-g" style={{ padding:"9px 20px",fontSize:14,borderRadius:10 }} onClick={goCheckout}>
                60% de crédito →
              </button>
            </div>
          </div>
        </nav>

        {/* ══ HERO ═════════════════════════════════════════════════════════ */}
        <header style={{ padding:"72px 24px 64px",textAlign:"center",maxWidth:800,margin:"0 auto" }}>

          {/* Selo */}
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:99,padding:"6px 18px",marginBottom:28 }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:"#16a34a",display:"inline-block",animation:"blink 1.4s infinite" }} />
            <span style={{ fontSize:12,fontWeight:700,color:"#15803d",textTransform:"uppercase",letterSpacing:.8 }}>Oferta exclusiva · Tempo limitado · {VAGAS_LEFT} vagas</span>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize:"clamp(36px,5.5vw,66px)",fontWeight:900,letterSpacing:-2,lineHeight:1.06,marginBottom:22 }}>
            Assine o plano anual e<br />
            <span style={{ color:"#16a34a" }}>ganhe 60% de volta</span><br />
            em créditos de campanha
          </h1>

          <p style={{ fontSize:"clamp(16px,2.2vw,20px)",color:"#6b7280",lineHeight:1.75,maxWidth:560,margin:"0 auto 16px" }}>
            Você investe no plano anual e recebe <strong style={{ color:"#111" }}>60% do valor em créditos</strong> para impulsionar suas campanhas no Meta, Google e TikTok — direto na plataforma.
          </p>

          <p style={{ fontSize:14,color:"#ef4444",fontWeight:700,marginBottom:36 }}>
            ⚠️ Disponível por tempo limitado ou até esgotar os {VAGAS_LEFT} créditos restantes
          </p>

          {/* Calculadora rápida no hero */}
          <div style={{ background:"#f9fafb",border:"1.5px solid #e5e7eb",borderRadius:18,padding:"24px 28px",maxWidth:520,margin:"0 auto 36px",textAlign:"left" }}>
            <p style={{ fontSize:11,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:14 }}>Escolha seu plano e veja o retorno</p>
            <div style={{ display:"flex",gap:8,marginBottom:20 }}>
              {PLANS.map((p,i)=>(
                <button key={p.slug} onClick={()=>setPlanIdx(i)} style={{ flex:1,padding:"9px 6px",borderRadius:9,border:`2px solid ${planIdx===i?"#16a34a":"#e5e7eb"}`,background:planIdx===i?"#f0fdf4":"#fff",color:planIdx===i?"#16a34a":"#6b7280",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .15s" }}>
                  {p.name}
                </button>
              ))}
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
              <div style={{ background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"14px 12px",textAlign:"center" }}>
                <div style={{ fontSize:10,color:"#9ca3af",marginBottom:4 }}>Você paga/ano</div>
                <div style={{ fontSize:20,fontWeight:900,color:"#111" }}>{R(total)}</div>
              </div>
              <div style={{ background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:12,padding:"14px 12px",textAlign:"center" }}>
                <div style={{ fontSize:10,color:"#16a34a",marginBottom:4,fontWeight:700 }}>Crédito que recebe</div>
                <div style={{ fontSize:20,fontWeight:900,color:"#16a34a" }}>+{R(credit)}</div>
              </div>
              <div style={{ background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"14px 12px",textAlign:"center" }}>
                <div style={{ fontSize:10,color:"#9ca3af",marginBottom:4 }}>Custo real</div>
                <div style={{ fontSize:20,fontWeight:900,color:"#111" }}>{R(total-credit)}</div>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginBottom:16 }}>
            <button className="btn-g" style={{ padding:"16px 36px",fontSize:17,borderRadius:13 }} onClick={goCheckout}>
              ⚡ Quero ativar meu crédito agora
            </button>
            <button className="btn btn-lg btn-outline" onClick={()=>setLocation("/register")}>
              Começar grátis →
            </button>
          </div>
          <p style={{ fontSize:12,color:"#9ca3af" }}>Pagamento seguro · Cancele quando quiser · Créditos em até 10 dias</p>
        </header>

        {/* ══ BANNER CLICÁVEL 1 ════════════════════════════════════════════ */}
        <div style={{ background:"linear-gradient(135deg,#052e16,#14532d)",margin:"0 24px 0",borderRadius:16,maxWidth:1080,marginLeft:"auto",marginRight:"auto" }}>
          <button onClick={goCheckout} style={{ width:"100%",padding:"22px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,background:"none",border:"none",cursor:"pointer",flexWrap:"wrap" }}>
            <div style={{ display:"flex",alignItems:"center",gap:16 }}>
              <span style={{ fontSize:32 }}>💰</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:17,fontWeight:800,color:"#fff" }}>Ganhe 60% em crédito agora</div>
                <div style={{ fontSize:13,color:"#86efac" }}>Assine o plano anual · {VAGAS_LEFT} vagas restantes</div>
              </div>
            </div>
            <span style={{ background:"#16a34a",color:"#fff",fontWeight:800,fontSize:14,padding:"10px 24px",borderRadius:10,whiteSpace:"nowrap" }}>
              Ativar crédito →
            </span>
          </button>
        </div>

        {/* ══ TRUST STRIP ══════════════════════════════════════════════════ */}
        <div style={{ background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"16px 24px",marginTop:24 }}>
          <div style={{ maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",gap:24,flexWrap:"wrap" }}>
            <span style={{ fontSize:12,fontWeight:500,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.8,whiteSpace:"nowrap" }}>Usado por</span>
            <div style={{ width:1,height:18,background:"#e5e7eb" }} />
            {["Agências","E-commerce","SaaS","Consultorias","Freelancers"].map(l=>(
              <span key={l} style={{ fontSize:14,fontWeight:600,color:"#6b7280" }}>{l}</span>
            ))}
          </div>
        </div>

        {/* ══ STATS ════════════════════════════════════════════════════════ */}
        <section style={{ background:"#111",padding:"52px 24px" }}>
          <div style={{ maxWidth:1080,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:24,textAlign:"center" }} className="grid-3">
            {[{v:"500+",l:"Agências ativas"},{v:"10.000+",l:"Campanhas geradas"},{v:"7 camadas",l:"Pipeline de IA"},{v:"99,9%",l:"Uptime garantido"}].map(s=>(
              <div key={s.v}>
                <div style={{ fontSize:34,fontWeight:800,color:"#30d158",letterSpacing:-1 }}>{s.v}</div>
                <div style={{ fontSize:13,color:"#6b7280",marginTop:6 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ SEÇÃO DE VALOR ═══════════════════════════════════════════════ */}
        <section style={{ padding:"80px 24px",maxWidth:1080,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:52 }}>
            <div className="badge badge-green" style={{ marginBottom:14 }}>Entenda a oferta</div>
            <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)",fontWeight:800,letterSpacing:-1,marginBottom:14 }}>
              Você paga o plano e recebe<br /><span style={{ color:"#16a34a" }}>60% de volta em créditos</span>
            </h2>
            <p style={{ fontSize:16,color:"#6b7280",lineHeight:1.7,maxWidth:500,margin:"0 auto" }}>
              Simples assim. Não é desconto — é dinheiro real que volta pra você em forma de crédito para rodar campanhas.
            </p>
          </div>

          {/* Cards por plano */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20,marginBottom:40 }} className="grid-3">
            {PLANS.map(p=>(
              <div key={p.slug} className="promo-card" style={{ border:p.popular?"2px solid #16a34a":"1px solid #e5e7eb",position:"relative" }}>
                {p.popular && <div style={{ position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:"#16a34a",color:"#fff",fontSize:10,fontWeight:800,padding:"3px 14px",borderRadius:99,whiteSpace:"nowrap" }}>MAIS POPULAR</div>}
                <div style={{ fontSize:12,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.7,marginBottom:8 }}>Plano {p.name}</div>
                <div style={{ fontSize:15,color:"#374151",marginBottom:16 }}>
                  Você paga <strong>{R(annualTotal(p.monthly))}</strong>/ano
                </div>
                <div style={{ background:"#f0fdf4",borderRadius:10,padding:"14px 16px",marginBottom:16 }}>
                  <div style={{ fontSize:11,color:"#16a34a",fontWeight:700,marginBottom:4 }}>💰 Crédito que recebe</div>
                  <div style={{ fontSize:28,fontWeight:900,color:"#16a34a" }}>+{R(credit60(p.monthly))}</div>
                </div>
                <div style={{ fontSize:13,color:"#6b7280",marginBottom:20 }}>
                  Custo real efetivo: <strong style={{ color:"#111" }}>{R(annualTotal(p.monthly)-credit60(p.monthly))}</strong>
                </div>
                <button className="btn-g" style={{ width:"100%",padding:"13px",fontSize:14,borderRadius:10 }} onClick={goCheckout}>
                  Ativar {p.name} →
                </button>
              </div>
            ))}
          </div>

          {/* Micro CTA */}
          <div style={{ textAlign:"center",background:"#f9fafb",borderRadius:14,padding:"24px 32px",border:"1px solid #e5e7eb" }}>
            <p style={{ fontSize:16,fontWeight:700,color:"#111",marginBottom:16 }}>
              🎯 No plano Premium: você paga {R(annualTotal(197))} e recebe <span style={{ color:"#16a34a" }}>+{R(credit60(197))}</span> em créditos.<br />
              <span style={{ fontWeight:400,color:"#6b7280",fontSize:14 }}>Custo real de apenas {R(annualTotal(197)-credit60(197))} no ano.</span>
            </p>
            <button className="btn-g" style={{ padding:"14px 36px",fontSize:16,borderRadius:12 }} onClick={goCheckout}>
              Ativar meu crédito agora ⚡
            </button>
          </div>
        </section>

        {/* ══ BANNER CLICÁVEL 2 ════════════════════════════════════════════ */}
        <div style={{ margin:"0 24px",maxWidth:1080,marginLeft:"auto",marginRight:"auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:0 }} className="grid-2">
          {[
            { emoji:"🎯",title:"Ative seu bônus de campanha",sub:"Crédito direto na plataforma" },
            { emoji:"🚀",title:"Comece com vantagem no tráfego",sub:"60% do plano volta em crédito" },
          ].map((b,i)=>(
            <button key={i} onClick={goCheckout} style={{ background:i===0?"#111":"#f0fdf4",border:i===0?"1px solid #222":"1.5px solid #86efac",borderRadius:14,padding:"20px 24px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"transform .15s" }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="scale(1.02)"}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}>
              <span style={{ fontSize:32 }}>{b.emoji}</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:15,fontWeight:800,color:i===0?"#fff":"#15803d" }}>{b.title}</div>
                <div style={{ fontSize:12,color:i===0?"#6b7280":"#16a34a",marginTop:2 }}>{b.sub} →</div>
              </div>
            </button>
          ))}
        </div>

        {/* ══ SEÇÃO ESCASSEZ / URGÊNCIA ════════════════════════════════════ */}
        <section style={{ background:"#fef2f2",borderTop:"1px solid #fecaca",borderBottom:"1px solid #fecaca",padding:"60px 24px",margin:"48px 0" }}>
          <div style={{ maxWidth:720,margin:"0 auto",textAlign:"center" }}>
            <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:99,padding:"6px 16px",marginBottom:24 }}>
              <span style={{ animation:"blink 1s infinite",fontSize:14 }}>🔴</span>
              <span style={{ fontSize:12,fontWeight:700,color:"#dc2626",textTransform:"uppercase",letterSpacing:.8 }}>Quantidade limitada de créditos disponíveis</span>
            </div>

            <h2 style={{ fontSize:"clamp(26px,3.5vw,40px)",fontWeight:800,letterSpacing:-1,marginBottom:16,color:"#111" }}>
              Apenas <span style={{ color:"#dc2626" }}>{VAGAS_LEFT} vagas</span> com crédito restantes
            </h2>
            <p style={{ fontSize:16,color:"#6b7280",marginBottom:32 }}>
              Quando as vagas acabarem, o plano anual continua — mas <strong style={{ color:"#111" }}>sem o crédito de 60%</strong>. Sem segunda chance.
            </p>

            {/* Barra de progresso */}
            <div style={{ background:"#e5e7eb",borderRadius:99,height:14,overflow:"hidden",marginBottom:10,maxWidth:480,margin:"0 auto 10px" }}>
              <div style={{ width:`${PCT}%`,height:"100%",background:"linear-gradient(90deg,#ef4444,#dc2626)",borderRadius:99,transition:"width 1s" }} />
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",maxWidth:480,margin:"0 auto 32px",fontSize:12,color:"#9ca3af" }}>
              <span>{USADAS} vagas preenchidas</span>
              <span style={{ color:"#dc2626",fontWeight:700 }}>{PCT}% ocupado</span>
            </div>

            {/* Contador */}
            <div style={{ display:"flex",gap:12,justifyContent:"center",marginBottom:32 }}>
              {[{v:h,l:"horas"},{v:m,l:"minutos"},{v:s,l:"segundos"}].map(t=>(
                <div key={t.l} style={{ background:"#111",borderRadius:12,padding:"16px 20px",minWidth:72,textAlign:"center" }}>
                  <div style={{ fontSize:32,fontWeight:900,color:"#fff",fontVariantNumeric:"tabular-nums",lineHeight:1 }}>{t.v}</div>
                  <div style={{ fontSize:10,color:"#6b7280",marginTop:4,textTransform:"uppercase",letterSpacing:.8 }}>{t.l}</div>
                </div>
              ))}
            </div>

            <button className="btn-g" style={{ padding:"16px 40px",fontSize:17,borderRadius:13 }} onClick={goCheckout}>
              Garantir minha vaga agora →
            </button>
          </div>
        </section>

        {/* ══ FEATURES / PLATAFORMA ════════════════════════════════════════ */}
        <section id="recursos" style={{ maxWidth:1080,margin:"0 auto",padding:"80px 24px" }}>
          <div style={{ marginBottom:52 }}>
            <div className="badge badge-green" style={{ marginBottom:14 }}>Plataforma</div>
            <h2 style={{ fontSize:"clamp(28px,3.5vw,42px)",fontWeight:800,letterSpacing:-1,marginBottom:14 }}>4 módulos. 1 campanha pronta.</h2>
            <p style={{ fontSize:16,color:"#6b7280",maxWidth:500,lineHeight:1.7 }}>Cada módulo alimenta o próximo. A IA pensa a campanha por você.</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:"#e5e7eb",border:"1px solid #e5e7eb",borderRadius:16,overflow:"hidden" }} className="grid-3">
            {[
              {n:"01",icon:"🎯",t:"Perfil do Cliente",d:"Mapeie dores, desejos, objeções e proposta de valor. A base da campanha ideal."},
              {n:"02",icon:"🔍",t:"Análise de Concorrentes",d:"Monitore anúncios via Meta Ads Library. Extraia copy e estratégias em tempo real."},
              {n:"03",icon:"📊",t:"Inteligência de Mercado",d:"A IA cruza todos os dados e revela gaps, oportunidades e posicionamento ideal."},
              {n:"04",icon:"◈",t:"Campanha Automática",d:"Gere ad sets, copy, orçamento e funil completos prontos para rodar."},
              {n:"05",icon:"◻",t:"Exportação PDF & XLSX",d:"Relatórios profissionais para apresentar ou implementar imediatamente."},
              {n:"06",icon:"⚡",t:"Meta, Google & TikTok",d:"Integração nativa. Publique campanhas direto do MECPro, sem copiar e colar."},
            ].map(f=>(
              <article key={f.n} style={{ background:"#fff",padding:"26px 24px",transition:"background .2s",cursor:"default" }}
                onMouseEnter={e=>(e.currentTarget.style.background="#f9fafb")}
                onMouseLeave={e=>(e.currentTarget.style.background="#fff")}>
                <div style={{ fontSize:22,marginBottom:10 }}>{f.icon}</div>
                <div style={{ fontSize:10,fontWeight:700,color:"#16a34a",letterSpacing:1,marginBottom:6 }}>{f.n}</div>
                <h3 style={{ fontSize:15,fontWeight:700,color:"#111",marginBottom:8 }}>{f.t}</h3>
                <p style={{ fontSize:13,color:"#6b7280",lineHeight:1.65,margin:0 }}>{f.d}</p>
              </article>
            ))}
          </div>

          {/* CTA após features */}
          <div style={{ textAlign:"center",marginTop:40 }}>
            <button className="btn-g" style={{ padding:"15px 36px",fontSize:16,borderRadius:12 }} onClick={goCheckout}>
              Assinar e receber 60% em crédito ⚡
            </button>
          </div>
        </section>

        {/* ══ SEÇÃO: BENEFÍCIOS ════════════════════════════════════════════ */}
        <section style={{ background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"80px 24px" }}>
          <div style={{ maxWidth:1080,margin:"0 auto" }}>
            <div style={{ textAlign:"center",marginBottom:52 }}>
              <div className="badge badge-green" style={{ marginBottom:14 }}>Por que vale a pena</div>
              <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)",fontWeight:800,letterSpacing:-1,marginBottom:14 }}>
                Você sai no lucro desde o<br />primeiro mês
              </h2>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20,marginBottom:40 }} className="grid-3">
              {[
                {icon:"📈",title:"Mais alcance",desc:"Com créditos de campanha você aparece para mais pessoas sem tirar dinheiro extra do bolso."},
                {icon:"⚡",title:"Mais campanhas",desc:"Crie e teste mais campanhas com verba que você já pagou. Mais teste = mais resultado."},
                {icon:"🛡️",title:"Menor risco",desc:"O dinheiro que você investiu volta em crédito. O custo real cai quase pela metade."},
                {icon:"🎯",title:"Vantagem competitiva",desc:"Seus concorrentes pagam tráfego do próprio bolso. Você usa crédito que a plataforma te deu."},
                {icon:"🔒",title:"Preço travado",desc:"Assinou anual? Seu preço não sobe mesmo que os planos sejam reajustados."},
                {icon:"🏆",title:"Suporte prioritário",desc:"Assinantes anuais têm prioridade no suporte e acesso a recursos beta primeiro."},
              ].map(b=>(
                <div key={b.title} className="promo-card" style={{ textAlign:"center" }}>
                  <div style={{ fontSize:32,marginBottom:12 }}>{b.icon}</div>
                  <div style={{ fontWeight:700,fontSize:15,color:"#111",marginBottom:8 }}>{b.title}</div>
                  <p style={{ fontSize:13,color:"#6b7280",lineHeight:1.6,margin:0 }}>{b.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ textAlign:"center" }}>
              <button className="btn-g" style={{ padding:"15px 36px",fontSize:16,borderRadius:12 }} onClick={goCheckout}>
                Quero esses benefícios agora →
              </button>
            </div>
          </div>
        </section>

        {/* ══ COMO FUNCIONA ════════════════════════════════════════════════ */}
        <section id="como-funciona" style={{ padding:"80px 24px",maxWidth:1080,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:52 }}>
            <div className="badge badge-green" style={{ marginBottom:14 }}>Simples assim</div>
            <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)",fontWeight:800,letterSpacing:-1,marginBottom:14 }}>
              Em 4 passos você está<br />rodando com crédito
            </h2>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:20,marginBottom:40 }} className="grid-2">
            {[
              {n:"01",icon:"✍️",t:"Assina o plano anual",d:"Escolha Basic, Premium ou VIP. 20% de desconto já aplicado automaticamente."},
              {n:"02",icon:"⏳",t:"Aguarda até 10 dias",d:"Confirmamos o pagamento e processamos os créditos na sua conta."},
              {n:"03",icon:"💰",t:"Recebe 60% em créditos",d:`No Premium você recebe ${R(credit60(197))} em créditos prontos para usar.`},
              {n:"04",icon:"🚀",t:"Usa nas campanhas",d:"Créditos disponíveis para Meta, Google e TikTok diretamente na plataforma."},
            ].map(step=>(
              <div key={step.n} className="promo-card" style={{ textAlign:"center" }}>
                <div style={{ width:48,height:48,borderRadius:14,background:"#f0fdf4",border:"1.5px solid #86efac",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 14px" }}>
                  {step.icon}
                </div>
                <div style={{ fontSize:10,fontWeight:800,color:"#16a34a",letterSpacing:1,marginBottom:6 }}>{step.n}</div>
                <div style={{ fontWeight:700,fontSize:15,color:"#111",marginBottom:8 }}>{step.t}</div>
                <p style={{ fontSize:13,color:"#6b7280",lineHeight:1.6,margin:0 }}>{step.d}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign:"center" }}>
            <button className="btn-g" style={{ padding:"15px 36px",fontSize:16,borderRadius:12 }} onClick={goCheckout}>
              Começar agora e receber meu crédito →
            </button>
          </div>
        </section>

        {/* ══ ACADEMY ══════════════════════════════════════════════════════ */}
        <section id="academy" style={{ background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"80px 24px" }}>
          <div style={{ maxWidth:1080,margin:"0 auto" }}>
            <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:48,flexWrap:"wrap",gap:20 }}>
              <div>
                <div className="badge badge-green" style={{ marginBottom:14 }}>MECPro Academy</div>
                <h2 style={{ fontSize:"clamp(26px,3.5vw,40px)",fontWeight:800,letterSpacing:-1,marginBottom:12 }}>
                  Aprenda a criar campanhas<br />usando a ferramenta
                </h2>
                <p style={{ fontSize:15,color:"#6b7280",maxWidth:480,lineHeight:1.7,margin:0 }}>
                  Mini cursos práticos do zero ao avançado — inclusos no plano anual.
                </p>
              </div>
              <a href="/courses" style={{ fontSize:14,color:"#16a34a",fontWeight:700,textDecoration:"none",border:"1.5px solid #16a34a",padding:"10px 22px",borderRadius:10,whiteSpace:"nowrap" }}>
                Ver todos os cursos →
              </a>
            </div>

            {MINI_COURSES.filter(c=>c.highlight).map(c=>(
              <div key={c.slug} onClick={()=>setLocation(`/courses/${c.slug}`)} style={{ background:"linear-gradient(135deg,#052e16,#14532d)",borderRadius:20,padding:"36px 44px",marginBottom:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:28,flexWrap:"wrap",border:"1px solid #16a34a" }}>
                <div>
                  <div style={{ display:"flex",gap:10,marginBottom:12,alignItems:"center" }}>
                    <span style={{ fontSize:26 }}>{c.icon}</span>
                    <span style={{ background:c.tagColor,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:99 }}>{c.tag}</span>
                  </div>
                  <h3 style={{ fontSize:22,fontWeight:800,color:"#fff",marginBottom:10 }}>{c.title}</h3>
                  <p style={{ fontSize:14,color:"#86efac",lineHeight:1.65,maxWidth:460,margin:"0 0 18px" }}>{c.desc}</p>
                  <div style={{ display:"flex",gap:18,flexWrap:"wrap" }}>
                    {[{icon:"⏱",v:c.duration},{icon:"📚",v:`${c.lessons} aulas`},{icon:"🎓",v:c.level}].map(m=>(
                      <span key={m.v} style={{ fontSize:12,color:"#4ade80",display:"flex",alignItems:"center",gap:5 }}>{m.icon} {m.v}</span>
                    ))}
                  </div>
                </div>
                <button className="btn btn-lg" style={{ background:"#fff",color:"#14532d",fontWeight:800,borderRadius:12,whiteSpace:"nowrap",flexShrink:0 }}>
                  Começar grátis →
                </button>
              </div>
            ))}

            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16 }}>
              {MINI_COURSES.filter(c=>!c.highlight).map(c=>(
                <article key={c.slug} onClick={()=>setLocation(`/courses/${c.slug}`)} style={{ background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:"22px",cursor:"pointer",transition:"box-shadow .2s,transform .2s" }}
                  onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.07)"; e.currentTarget.style.transform="translateY(-2px)"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="none"; }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
                    <span style={{ fontSize:24 }}>{c.icon}</span>
                    <span style={{ background:c.tagColor,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:99 }}>{c.tag}</span>
                  </div>
                  <h3 style={{ fontSize:14,fontWeight:700,color:"#111",marginBottom:8,lineHeight:1.4 }}>{c.title}</h3>
                  <p style={{ fontSize:12,color:"#6b7280",lineHeight:1.6,marginBottom:14 }}>{c.desc}</p>
                  <div style={{ display:"flex",gap:12,borderTop:"1px solid #f0f0f0",paddingTop:12 }}>
                    {[{icon:"⏱",v:c.duration},{icon:"📚",v:`${c.lessons} aulas`},{icon:"🎓",v:c.level}].map(m=>(
                      <span key={m.v} style={{ fontSize:11,color:"#9ca3af",display:"flex",alignItems:"center",gap:3 }}>{m.icon} {m.v}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══ AVERSÃO À PERDA ══════════════════════════════════════════════ */}
        <section style={{ padding:"80px 24px",background:"#111" }}>
          <div style={{ maxWidth:720,margin:"0 auto",textAlign:"center" }}>
            <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:99,padding:"6px 16px",marginBottom:28 }}>
              <span style={{ fontSize:14,animation:"blink 1.4s infinite" }}>⚠️</span>
              <span style={{ fontSize:12,fontWeight:700,color:"#f87171",textTransform:"uppercase",letterSpacing:.8 }}>Não perca essa chance</span>
            </div>

            <h2 style={{ fontSize:"clamp(26px,3.5vw,42px)",fontWeight:800,letterSpacing:-1,color:"#fff",marginBottom:24 }}>
              Depois que essa campanha encerrar,<br />
              <span style={{ color:"#f87171" }}>o plano volta sem créditos</span>
            </h2>

            <div style={{ display:"flex",flexDirection:"column",gap:14,marginBottom:40,textAlign:"left",background:"rgba(255,255,255,.04)",borderRadius:16,padding:"24px 28px" }}>
              {[
                "Depois que essa campanha encerrar, o plano anual volta ao valor normal sem nenhum crédito",
                "Quem entra agora começa com vantagem — quem espera paga mais caro",
                "Você pode usar os créditos para testar mais campanhas sem gastar nada extra",
                "Seus concorrentes que entraram antes já estão rodando com crédito grátis",
              ].map((t,i)=>(
                <div key={i} style={{ display:"flex",gap:12,alignItems:"flex-start" }}>
                  <span style={{ color:"#f87171",flexShrink:0,marginTop:1 }}>✕</span>
                  <span style={{ fontSize:14,color:"#9ca3af",lineHeight:1.6 }}>{t}</span>
                </div>
              ))}
            </div>

            {/* Comparativo */}
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:40 }} className="grid-2">
              <div style={{ background:"rgba(22,163,74,.1)",border:"1.5px solid rgba(22,163,74,.4)",borderRadius:16,padding:"22px",textAlign:"center" }}>
                <div style={{ fontSize:11,fontWeight:800,color:"#4ade80",textTransform:"uppercase",letterSpacing:.8,marginBottom:8 }}>AGORA</div>
                <div style={{ fontSize:22,fontWeight:900,color:"#4ade80",marginBottom:4 }}>{R(annualTotal(197))}</div>
                <div style={{ fontSize:12,color:"#4ade80",marginBottom:12 }}>+ {R(credit60(197))} em créditos</div>
                <div style={{ fontSize:11,color:"#6b7280" }}>Custo real: <strong style={{ color:"#fff" }}>{R(annualTotal(197)-credit60(197))}</strong></div>
              </div>
              <div style={{ background:"rgba(239,68,68,.07)",border:"1.5px solid rgba(239,68,68,.2)",borderRadius:16,padding:"22px",textAlign:"center" }}>
                <div style={{ fontSize:11,fontWeight:800,color:"#f87171",textTransform:"uppercase",letterSpacing:.8,marginBottom:8 }}>DEPOIS</div>
                <div style={{ fontSize:22,fontWeight:900,color:"#f87171",marginBottom:4 }}>{R(annualTotal(197))}</div>
                <div style={{ fontSize:12,color:"#f87171",marginBottom:12 }}>sem créditos</div>
                <div style={{ fontSize:11,color:"#6b7280" }}>Custo real: <strong style={{ color:"#fff" }}>{R(annualTotal(197))}</strong></div>
              </div>
            </div>

            <button className="btn-g" style={{ padding:"17px 44px",fontSize:17,borderRadius:14 }} onClick={goCheckout}>
              ⚡ Não quero perder essa oportunidade
            </button>
            <p style={{ fontSize:12,color:"#4b5563",marginTop:14 }}>Pagamento seguro · Cancele quando quiser</p>
          </div>
        </section>

        {/* ══ PRICING ══════════════════════════════════════════════════════ */}
        <section style={{ padding:"80px 24px" }}>
          <div style={{ maxWidth:1080,margin:"0 auto" }}>
            <div style={{ textAlign:"center",marginBottom:52 }}>
              <div className="badge badge-green" style={{ marginBottom:14 }}>Planos</div>
              <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)",fontWeight:800,letterSpacing:-1,marginBottom:14 }}>
                Escolha seu plano e<br /><span style={{ color:"#16a34a" }}>ative os créditos</span>
              </h2>
              <p style={{ fontSize:16,color:"#6b7280",lineHeight:1.7 }}>Todos os planos anuais incluem 60% de crédito · Academy completa inclusa</p>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20 }} className="grid-3">
              {PLANS.map(p=>(
                <article key={p.slug} style={{ background:"#fff",border:`1.5px solid ${p.popular?"#16a34a":"#e5e7eb"}`,borderRadius:18,padding:28,position:"relative",boxShadow:p.popular?"0 0 0 4px rgba(22,163,74,.08)":"none" }}>
                  {p.popular && <div style={{ position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:"#16a34a",color:"#fff",fontSize:10,fontWeight:800,padding:"3px 14px",borderRadius:99,whiteSpace:"nowrap" }}>Mais popular</div>}
                  <div style={{ fontSize:12,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.7,marginBottom:10 }}>{p.name}</div>
                  <div style={{ fontSize:40,fontWeight:900,color:"#111",letterSpacing:-1,lineHeight:1,marginBottom:4 }}>
                    <sup style={{ fontSize:17,verticalAlign:"top",marginTop:6 }}>R$</sup>{Math.floor(p.monthly*0.8)}
                  </div>
                  <div style={{ fontSize:12,color:"#9ca3af",marginBottom:8 }}>por mês · cobrado anualmente</div>
                  <div style={{ background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"10px 14px",marginBottom:20 }}>
                    <div style={{ fontSize:11,color:"#16a34a",fontWeight:700,marginBottom:2 }}>💰 Crédito anual que recebe</div>
                    <div style={{ fontSize:20,fontWeight:900,color:"#16a34a" }}>+ {R(credit60(p.monthly))}</div>
                  </div>
                  <button className="btn-g" style={{ width:"100%",padding:"13px",fontSize:14,borderRadius:10,animation:"none" }} onClick={goCheckout}>
                    Assinar {p.name} e ativar crédito →
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══ FAQ ══════════════════════════════════════════════════════════ */}
        <section style={{ padding:"0 24px 80px" }}>
          <div style={{ maxWidth:720,margin:"0 auto" }}>
            <div style={{ textAlign:"center",marginBottom:40 }}>
              <div className="badge badge-green" style={{ marginBottom:14 }}>FAQ</div>
              <h2 style={{ fontSize:"clamp(24px,3vw,36px)",fontWeight:800,letterSpacing:-1,marginBottom:10 }}>Perguntas frequentes</h2>
            </div>
            {[
              {q:"O crédito de 60% é real? Posso usar de verdade?",a:"Sim! Os créditos são depositados na sua conta MECPro em até 10 dias úteis após a confirmação do pagamento anual. Você usa para impulsionar campanhas em Meta, Google e TikTok diretamente pela plataforma."},
              {q:"O que acontece se eu cancelar o plano anual?",a:"Você pode cancelar quando quiser, sem multa. Os créditos já utilizados não são devolvidos. O acesso continua até o fim do período pago."},
              {q:"Os créditos têm prazo de validade?",a:"Os créditos são válidos durante a vigência do plano anual. Use-os durante o ano para maximizar o retorno."},
              {q:"Funciona para qualquer nicho?",a:"Sim! O MECPro é usado por agências, e-commerces, SaaS, consultorias e freelancers de todos os segmentos. A IA adapta as campanhas para o contexto do seu negócio."},
              {q:"Posso cancelar quando quiser?",a:"Sim, sem fidelidade. Cancele a qualquer momento direto no painel, sem burocracia."},
            ].map((item,i)=>(
              <details key={i} style={{ borderBottom:"1px solid #f0f0f0",padding:"18px 0" }}>
                <summary style={{ fontWeight:600,fontSize:15,cursor:"pointer",color:"#111",listStyle:"none",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12 }}>
                  {item.q}
                  <span style={{ fontSize:20,color:"#16a34a",fontWeight:300,flexShrink:0 }}>+</span>
                </summary>
                <p style={{ marginTop:12,fontSize:14,color:"#6b7280",lineHeight:1.7,marginBottom:0 }}>{item.a}</p>
              </details>
            ))}
            <div style={{ textAlign:"center",marginTop:32 }}>
              <button className="btn-g" style={{ padding:"14px 36px",fontSize:16,borderRadius:12 }} onClick={goCheckout}>
                Ativar meu crédito de 60% ⚡
              </button>
            </div>
          </div>
        </section>

        {/* ══ RODAPÉ COM REFORÇO ═══════════════════════════════════════════ */}
        <section style={{ background:"#111",padding:"72px 24px" }}>
          <div style={{ maxWidth:640,margin:"0 auto",textAlign:"center" }}>
            <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:99,padding:"6px 16px",marginBottom:24 }}>
              <span style={{ animation:"blink 1.4s infinite",fontSize:14 }}>🔴</span>
              <span style={{ fontSize:12,fontWeight:700,color:"#f87171",textTransform:"uppercase",letterSpacing:.8 }}>
                Oferta encerra em {h}:{m}:{s} · {VAGAS_LEFT} vagas
              </span>
            </div>

            <h2 style={{ fontSize:"clamp(26px,4vw,42px)",fontWeight:800,letterSpacing:-1,color:"#fff",marginBottom:16 }}>
              Última chance de assinar com<br /><span style={{ color:"#30d158" }}>60% de crédito</span>
            </h2>
            <p style={{ fontSize:16,color:"#6b7280",marginBottom:36,lineHeight:1.7 }}>
              Depois que essa campanha encerrar, o plano anual volta ao valor normal — sem crédito, sem bônus. Essa condição não vai se repetir.
            </p>

            <button className="btn-g" style={{ padding:"18px 48px",fontSize:18,borderRadius:14,marginBottom:20 }} onClick={goCheckout}>
              ⚡ Ativar 60% de crédito agora
            </button>

            <div style={{ display:"flex",justifyContent:"center",gap:24,flexWrap:"wrap",marginBottom:48 }}>
              {["Pagamento seguro","Cancele quando quiser","Suporte em português"].map(t=>(
                <div key={t} style={{ fontSize:12,color:"#4b5563",display:"flex",alignItems:"center",gap:6 }}>
                  <span style={{ color:"#30d158" }}>✓</span>{t}
                </div>
              ))}
            </div>

            {/* Footer links */}
            <div style={{ borderTop:"1px solid #1f2937",paddingTop:32,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16 }}>
              <a href="/" style={{ textDecoration:"none",fontSize:18,fontWeight:800,color:"#fff" }}>
                MEC<span style={{ color:"#30d158" }}>PRO</span>
              </a>
              <nav style={{ display:"flex",gap:16,flexWrap:"wrap" }}>
                {[{label:"Preços",href:"/pricing"},{label:"Academy",href:"/courses"},{label:"Termos",href:"/terms"},{label:"Privacidade",href:"/privacy"},{label:"Contato",href:"/contact"}].map(l=>(
                  <a key={l.label} href={l.href} style={{ fontSize:13,color:"#4b5563",textDecoration:"none" }}>{l.label}</a>
                ))}
              </nav>
              <span style={{ fontSize:12,color:"#374151" }}>© 2026 MECPro</span>
            </div>
          </div>
        </section>

      </div>

      {/* ══ CTA FLUTUANTE ════════════════════════════════════════════════ */}
      <div style={{ position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",zIndex:9997,animation:"floatY 3s ease-in-out infinite",filter:"drop-shadow(0 6px 24px rgba(48,209,88,.45))" }}>
        <button onClick={goCheckout} style={{ background:"linear-gradient(135deg,#30d158,#16a34a)",color:"#fff",fontWeight:800,fontSize:15,padding:"13px 28px",borderRadius:99,border:"none",cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 28px rgba(48,209,88,.5)" }}>
          <span style={{ fontSize:18 }}>⚡</span>
          Ativar 60% de crédito
          <span style={{ background:"rgba(0,0,0,.2)",borderRadius:99,fontSize:11,fontWeight:700,padding:"2px 8px" }}>
            {VAGAS_LEFT} vagas
          </span>
        </button>
      </div>

      <WAButton />
    </>
  );
}
