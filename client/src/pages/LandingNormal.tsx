/**
 * LandingNormal.tsx — MECProAI · Landing page principal
 * Design: editorial escuro, tipografia forte, acento verde
 */
import { useState } from "react";
import { useLocation } from "wouter";
import SEO, { SEO_CONFIGS } from "@/components/SEO";

const WA     = "554799465824";
const WA_MSG = encodeURIComponent("Olá! Tenho interesse no MECProAI. Pode me ajudar?");

function WABtn() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div style={{position:"fixed",bottom:90,right:20,zIndex:9999,width:290,background:"#fff",borderRadius:18,boxShadow:"0 20px 60px rgba(0,0,0,.18)",padding:"18px",border:"1px solid #e5e7eb"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="20" height="20" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
              </div>
              <div>
                <p style={{margin:0,fontWeight:800,fontSize:13,color:"#111"}}>Michel Leal</p>
                <p style={{margin:0,fontSize:11,color:"#25d366",fontWeight:600}}>● Online agora</p>
              </div>
            </div>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9ca3af"}}>×</button>
          </div>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
            <p style={{margin:0,fontSize:12,color:"#374151",lineHeight:1.6}}>Pode tirar dúvidas sobre o MECProAI. Fale agora!</p>
          </div>
          <a href={`https://wa.me/${WA}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",borderRadius:10,padding:"11px",fontWeight:800,fontSize:13,textDecoration:"none"}}>
            Chamar no WhatsApp
          </a>
        </div>
      )}
      <button onClick={()=>setOpen(!open)} aria-label="WhatsApp"
        style={{position:"fixed",bottom:22,right:22,zIndex:9998,width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(37,211,102,.5)"}}>
        <svg width="26" height="26" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
      </button>
    </>
  );
}

const PLANS = [
  { name:"Basic",   price:"97",  desc:"Para quem está começando",    highlight:false,
    features:["3 projetos","5 concorrentes/projeto","10 campanhas/mês","Academy gratuita","Suporte por e-mail"] },
  { name:"Premium", price:"197", desc:"O mais escolhido pelas agências", highlight:true,
    features:["10 projetos","Concorrentes ilimitados","Campanhas ilimitadas","Academy completa + certificados","Relatórios PDF/XLSX","Suporte prioritário"] },
  { name:"VIP",     price:"397", desc:"Para quem escala alto",        highlight:false,
    features:["Projetos ilimitados","Tudo do Premium","Academy VIP + mentoria","API access","Manager dedicado","Onboarding personalizado"] },
];

const FEATURES = [
  { n:"01", icon:"🎯", t:"Perfil do Cliente",        d:"Mapeie dores, desejos e objeções estrategicamente." },
  { n:"02", icon:"🔍", t:"Análise de Concorrentes",  d:"Monitore anúncios ativos via Meta Ads Library em tempo real." },
  { n:"03", icon:"📊", t:"Inteligência de Mercado",  d:"A IA revela gaps, oportunidades e posicionamento ideal." },
  { n:"04", icon:"◈",  t:"Campanha Automática",      d:"Ad sets, copy, orçamento e funil prontos para publicar." },
  { n:"05", icon:"◻",  t:"Relatórios PDF & XLSX",    d:"Documentos profissionais para clientes ou implementação." },
  { n:"06", icon:"⚡",  t:"Meta, Google & TikTok",   d:"Publique direto sem copiar e colar." },
];

const FAQS = [
  { q:"O MECProAI é fácil de usar?",           a:"Sim! Interface simples e intuitiva, sem código. Os mini cursos da Academy ensinam a usar cada módulo em poucos minutos." },
  { q:"Funciona para qualquer nicho?",          a:"Sim. Agências, e-commerces, SaaS, consultorias e freelancers. A IA adapta as campanhas para o seu contexto." },
  { q:"Posso cancelar quando quiser?",          a:"Sim, sem fidelidade. Cancele a qualquer momento direto no painel, sem burocracia e sem multa." },
  { q:"Integra com Meta Ads e Google Ads?",     a:"Sim! Integração nativa com Meta, Google e TikTok Ads — publique campanhas com 1 clique." },
  { q:"Tem plano gratuito?",                    a:"Sim! Crie sua conta gratuitamente em menos de 2 minutos. Sem cartão de crédito necessário." },
];

const LD = {
  "@context":"https://schema.org",
  "@graph":[{"@type":"SoftwareApplication","name":"MECProAI","url":"https://mecproai.com","description":"Plataforma de geração de campanhas com IA","applicationCategory":"BusinessApplication","operatingSystem":"Web Browser","inLanguage":"pt-BR","isAccessibleForFree":true,"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"127","bestRating":"5"}}],
};

export default function LandingNormal() {
  const [, setLocation] = useLocation();
  const G = "#4ade80"; // green accent
  const D = "#0a0a0a"; // dark bg

  return (
    <>
      <SEO title={SEO_CONFIGS.landing.title} description={SEO_CONFIGS.landing.description} keywords={SEO_CONFIGS.landing.keywords} canonical={SEO_CONFIGS.landing.canonical} ogType="website" structuredData={LD} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box}
        body{margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{opacity:.5}50%{opacity:1}}
        .fu{animation:fadeUp .7s cubic-bezier(.16,1,.3,1) both}
        .fu1{animation-delay:.1s}.fu2{animation-delay:.22s}.fu3{animation-delay:.38s}.fu4{animation-delay:.52s}
        .fc:hover{background:rgba(255,255,255,.05)!important;transform:translateY(-2px)}
        .fc{transition:all .2s}
        .pc{transition:transform .25s,box-shadow .25s}
        .pc:hover{transform:translateY(-6px)}
        .gb:hover{filter:brightness(1.1);transform:translateY(-2px)!important}
        .gb{transition:all .2s}
        .nl:hover{color:#4ade80!important}
        .nl{transition:color .15s}
        details.fq > summary::-webkit-details-marker{display:none}
        details.fq > summary .fq-plus{transition:transform .2s;display:inline-block}
        details.fq[open] > summary .fq-plus{transform:rotate(45deg)}
        @media(max-width:760px){
          .hm{display:none!important}
          .g3{grid-template-columns:1fr!important}
          .g2{grid-template-columns:1fr!important}
          .htl{font-size:clamp(38px,10vw,60px)!important}
          .hp{padding:72px 20px 64px!important}
          .sp{padding:64px 20px!important}
          .sg{grid-template-columns:repeat(2,1fr)!important}
          .cf{padding:52px 24px!important}
        }
      `}</style>

      <div style={{fontFamily:"'Inter',system-ui,sans-serif",background:D,color:"#f0f0f0",minHeight:"100vh"}}>

        {/* NAV */}
        <nav style={{position:"sticky",top:0,zIndex:100,height:68,background:"rgba(10,10,10,.94)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
          <div style={{maxWidth:1100,margin:"0 auto",padding:"0 24px",height:"100%",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <a href="/" style={{textDecoration:"none"}}><img src="/logo-512.png" alt="MECProAI" height={44} style={{display:"block",borderRadius:10}}/></a>
            <nav className="hm" style={{display:"flex",gap:28}}>
              {[{l:"Plataforma",h:"/#plataforma"},{l:"Academy",h:"/courses"},{l:"Marketplace",h:"/marketplace"},{l:"Preços",h:"/#precos"},{l:"FAQ",h:"/#faq"}].map(x=>(
                <a key={x.l} href={x.h} className="nl" style={{fontSize:13,color:"rgba(255,255,255,.45)",textDecoration:"none",fontWeight:500}}>{x.l}</a>
              ))}
            </nav>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setLocation("/login")} style={{background:"transparent",color:"rgba(255,255,255,.6)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Entrar</button>
              <button onClick={()=>setLocation("/register")} className="gb" style={{background:G,color:D,border:"none",borderRadius:8,padding:"8px 20px",fontSize:13,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(74,222,128,.25)"}}>Começar grátis</button>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <header className="hp" style={{padding:"104px 28px 92px",textAlign:"center",maxWidth:860,margin:"0 auto",position:"relative"}}>
          <div style={{position:"absolute",top:"15%",left:"50%",transform:"translateX(-50%)",width:700,height:500,background:"radial-gradient(ellipse,rgba(74,222,128,.07) 0%,transparent 65%)",pointerEvents:"none"}}/>
          <div className="fu" style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.2)",borderRadius:99,padding:"6px 16px",marginBottom:32}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:G,display:"inline-block",animation:"glow 2s ease infinite"}}/>
            <span style={{fontSize:12,fontWeight:700,color:G,letterSpacing:.6}}>Plataforma #1 em Geração de Campanhas com IA</span>
          </div>
          <h1 className="fu fu1 htl" style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(46px,6.5vw,80px)",fontWeight:900,lineHeight:1.01,letterSpacing:"-3px",marginBottom:26,color:"#fff",position:"relative"}}>
            Gere campanhas<br/><span style={{color:G}}>completas com IA</span><br/>em minutos
          </h1>
          <p className="fu fu2" style={{fontSize:17,color:"rgba(255,255,255,.5)",maxWidth:520,margin:"0 auto 44px",lineHeight:1.78,fontWeight:400,position:"relative"}}>
            Cruze dados do cliente, concorrentes e mercado. A IA cria a campanha — copy, ad sets, orçamento e funil. Prontos para rodar no Meta, Google e TikTok.
          </p>
          <div className="fu fu3" style={{display:"flex",gap:12,justifyContent:"center",marginBottom:18,flexWrap:"wrap",position:"relative"}}>
            <button onClick={()=>setLocation("/register")} className="gb"
              style={{background:G,color:D,border:"none",borderRadius:10,padding:"15px 34px",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 6px 24px rgba(74,222,128,.32)"}}>
              Criar conta grátis →
            </button>
            <button onClick={()=>setLocation("/courses")}
              style={{background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.7)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,padding:"15px 28px",fontSize:15,fontWeight:600,cursor:"pointer"}}>
              Ver Academy grátis
            </button>
          </div>
          <p className="fu fu4" style={{fontSize:12,color:"rgba(255,255,255,.28)",position:"relative"}}>Sem cartão de crédito · Plano gratuito para sempre · Mini cursos inclusos</p>
        </header>

        {/* TRUST */}
        <div style={{borderTop:"1px solid rgba(255,255,255,.06)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"14px 28px",background:"rgba(255,255,255,.02)"}}>
          <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",gap:24,flexWrap:"wrap",justifyContent:"center"}}>
            <span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.2)",textTransform:"uppercase",letterSpacing:1.2}}>Confiado por</span>
            {["Para sua Agência","E-commerce","SaaS","Consultorias","Freelancers"].map(l=>(
              <span key={l} style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.3)"}}>{l}</span>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
              {"★★★★★".split("").map((_,i)=><span key={i} style={{color:"#fbbf24",fontSize:13}}>★</span>)}
              <span style={{fontSize:12,color:"rgba(255,255,255,.35)",fontWeight:600,marginLeft:4}}>4.9 · 127 avaliações</span>
            </div>
          </div>
        </div>

        {/* STATS */}
        <section style={{padding:"52px 28px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div className="sg" style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1}}>
            {[{v:"",l:"Agências ativas",a:"#4ade80"},{v:"10.000+",l:"Campanhas geradas",a:"#60a5fa"},{v:"7 camadas",l:"Pipeline de IA",a:"#f472b6"},{v:"99,9%",l:"Uptime garantido",a:"#fb923c"}].map((s,i)=>(
              <div key={i} style={{textAlign:"center",padding:"28px 16px",background:"rgba(255,255,255,.02)",borderRight:i<3?"1px solid rgba(255,255,255,.06)":"none"}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:34,fontWeight:900,color:s.a,letterSpacing:-1.5,marginBottom:6}}>{s.v}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.35)",fontWeight:500}}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* PLATAFORMA */}
        <section id="plataforma" className="sp" style={{maxWidth:1100,margin:"0 auto",padding:"96px 28px"}}>
          <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:60,alignItems:"start"}}>
            <div>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(74,222,128,.07)",border:"1px solid rgba(74,222,128,.15)",borderRadius:6,padding:"4px 12px",marginBottom:18}}>
                <span style={{fontSize:10,fontWeight:700,color:G,letterSpacing:.6,textTransform:"uppercase"}}>Plataforma</span>
              </div>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,lineHeight:1.08,marginBottom:18,color:"#fff"}}>
                4 módulos.<br/>1 campanha<br/>pronta.
              </h2>
              <p style={{fontSize:14,color:"rgba(255,255,255,.4)",lineHeight:1.75,marginBottom:28}}>
                Cada módulo alimenta o próximo. A IA pensa a campanha por você — do briefing à publicação.
              </p>
              <button onClick={()=>setLocation("/register")} className="gb"
                style={{background:G,color:D,border:"none",borderRadius:8,padding:"12px 24px",fontSize:13,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(74,222,128,.22)"}}>
                Começar agora →
              </button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:1,border:"1px solid rgba(255,255,255,.07)",borderRadius:16,overflow:"hidden"}}>
              {FEATURES.map(f=>(
                <article key={f.n} className="fc"
                  style={{background:"rgba(255,255,255,.025)",padding:"22px 20px",borderBottom:"1px solid rgba(255,255,255,.05)",borderRight:"1px solid rgba(255,255,255,.05)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <span style={{fontSize:20}}>{f.icon}</span>
                    <span style={{fontSize:9,fontWeight:800,color:"rgba(74,222,128,.5)",letterSpacing:1}}>{f.n}</span>
                  </div>
                  <h3 style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:5,lineHeight:1.3}}>{f.t}</h3>
                  <p style={{fontSize:11,color:"rgba(255,255,255,.38)",lineHeight:1.6,margin:0}}>{f.d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="sp" style={{background:"rgba(255,255,255,.018)",borderTop:"1px solid rgba(255,255,255,.06)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"88px 28px"}}>
          <div style={{maxWidth:1100,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:52}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(74,222,128,.07)",border:"1px solid rgba(74,222,128,.15)",borderRadius:6,padding:"4px 12px",marginBottom:14}}>
                <span style={{fontSize:10,fontWeight:700,color:G,letterSpacing:.6,textTransform:"uppercase"}}>Como funciona</span>
              </div>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,color:"#fff",lineHeight:1.08}}>3 passos. Campanha pronta.</h2>
            </div>
            <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
              {[
                {n:"1",icon:"🎯",t:"Preencha o perfil",    d:"Informe segmento, público e objetivos. O MECProAI organiza tudo estrategicamente.",  accent:"#4ade80"},
                {n:"2",icon:"🔍",t:"IA analisa o mercado", d:"Pipeline de 7 camadas coleta dados reais de anúncios e estratégias da concorrência.", accent:"#60a5fa"},
                {n:"3",icon:"◈", t:"Receba pronto",        d:"Copy, ad sets, orçamento e funil gerados e prontos para publicar com 1 clique.",       accent:"#f472b6"},
              ].map(s=>(
                <div key={s.n} style={{background:"rgba(255,255,255,.025)",borderRadius:14,padding:"26px 22px",border:"1px solid rgba(255,255,255,.06)",borderTop:`3px solid ${s.accent}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <div style={{width:32,height:32,borderRadius:8,background:`${s.accent}18`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:15}}>{s.icon}</span>
                    </div>
                    <span style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:900,color:"rgba(255,255,255,.08)",letterSpacing:-1}}>{s.n}</span>
                  </div>
                  <h3 style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:8}}>{s.t}</h3>
                  <p style={{fontSize:12,color:"rgba(255,255,255,.4)",lineHeight:1.65,margin:0}}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* MARKETPLACE CALLOUT */}
        <section className="sp" style={{maxWidth:1100,margin:"0 auto",padding:"88px 28px"}}>
          <div style={{background:"linear-gradient(135deg,rgba(74,222,128,.06),rgba(96,165,250,.04))",border:"1px solid rgba(74,222,128,.14)",borderRadius:20,padding:"52px 44px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:36,flexWrap:"wrap"}}>
            <div style={{maxWidth:520}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.2)",borderRadius:6,padding:"4px 12px",marginBottom:16}}>
                <span style={{fontSize:10,fontWeight:700,color:G,letterSpacing:.6,textTransform:"uppercase"}}>Novo · Marketplace</span>
              </div>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(22px,3vw,36px)",fontWeight:900,letterSpacing:-1.5,color:"#fff",marginBottom:12,lineHeight:1.08}}>
                Publique e venda<br/>serviços com IA
              </h2>
              <p style={{fontSize:14,color:"rgba(255,255,255,.45)",lineHeight:1.75,margin:0}}>
                Landing pages geradas por IA, galeria de fotos, insights por nicho e score de qualidade automático.
              </p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10,flexShrink:0}}>
              <button onClick={()=>setLocation("/marketplace")} className="gb"
                style={{background:G,color:D,border:"none",borderRadius:10,padding:"13px 28px",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 6px 20px rgba(74,222,128,.26)"}}>
                Ver Marketplace →
              </button>
              <button onClick={()=>setLocation("/marketplace/publish")}
                style={{background:"transparent",color:"rgba(255,255,255,.45)",border:"1px solid rgba(255,255,255,.09)",borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                Publicar minha oferta
              </button>
            </div>
          </div>
        </section>

        {/* PREÇOS */}
        <section id="precos" className="sp" style={{background:"rgba(255,255,255,.018)",borderTop:"1px solid rgba(255,255,255,.06)",padding:"88px 28px"}}>
          <div style={{maxWidth:1100,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:52}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(74,222,128,.07)",border:"1px solid rgba(74,222,128,.15)",borderRadius:6,padding:"4px 12px",marginBottom:14}}>
                <span style={{fontSize:10,fontWeight:700,color:G,letterSpacing:.6,textTransform:"uppercase"}}>Preços</span>
              </div>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,color:"#fff",marginBottom:12,lineHeight:1.08}}>
                Simples e sem surpresa
              </h2>
              <p style={{fontSize:15,color:"rgba(255,255,255,.38)",lineHeight:1.7}}>Comece grátis. Escale quando precisar. Academy inclusa em todos os planos.</p>
            </div>
            <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
              {PLANS.map(p=>(
                <article key={p.name} className="pc"
                  style={{background:p.highlight?"rgba(74,222,128,.04)":"rgba(255,255,255,.02)",border:p.highlight?"1.5px solid rgba(74,222,128,.28)":"1px solid rgba(255,255,255,.07)",borderRadius:18,padding:"26px 22px",position:"relative",boxShadow:p.highlight?"0 0 0 4px rgba(74,222,128,.04)":"none"}}>
                  {p.highlight && <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:G,color:D,fontSize:9,fontWeight:800,padding:"4px 14px",borderRadius:99,whiteSpace:"nowrap",letterSpacing:.5}}>⭐ Mais popular</div>}
                  <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.28)",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{p.name}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.28)",marginBottom:14}}>{p.desc}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:2,marginBottom:4}}>
                    <span style={{fontSize:12,color:"rgba(255,255,255,.28)"}}>R$</span>
                    <span style={{fontFamily:"'Syne',sans-serif",fontSize:44,fontWeight:900,color:p.highlight?G:"#fff",letterSpacing:-2,lineHeight:1}}>{p.price}</span>
                    <span style={{fontSize:12,color:"rgba(255,255,255,.28)"}}>/mês</span>
                  </div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.22)",marginBottom:22}}>cobrado mensalmente</div>
                  <div style={{marginBottom:24}}>
                    {p.features.map(f=>(
                      <div key={f} style={{display:"flex",gap:8,fontSize:12,color:"rgba(255,255,255,.58)",marginBottom:9,alignItems:"flex-start"}}>
                        <span style={{color:G,fontWeight:700,flexShrink:0}}>✓</span>{f}
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setLocation("/register")}
                    style={{width:"100%",background:p.highlight?G:"rgba(255,255,255,.06)",color:p.highlight?D:"rgba(255,255,255,.65)",border:p.highlight?"none":"1px solid rgba(255,255,255,.09)",borderRadius:10,padding:"11px 0",fontSize:13,fontWeight:800,cursor:"pointer",transition:"all .15s"}}
                    className={p.highlight?"gb":""}>
                    Assinar {p.name}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="sp" style={{maxWidth:760,margin:"0 auto",padding:"88px 28px"}}>
          <div style={{textAlign:"center",marginBottom:44}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(74,222,128,.07)",border:"1px solid rgba(74,222,128,.15)",borderRadius:6,padding:"4px 12px",marginBottom:14}}>
              <span style={{fontSize:10,fontWeight:700,color:G,letterSpacing:.6,textTransform:"uppercase"}}>FAQ</span>
            </div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(24px,3vw,38px)",fontWeight:900,letterSpacing:-1.5,color:"#fff",lineHeight:1.08}}>Perguntas frequentes</h2>
          </div>
          {FAQS.map((item,i)=>(
            <details key={i} className="fq" style={{borderBottom:"1px solid rgba(255,255,255,.07)",padding:"16px 0"}}>
              <summary style={{fontWeight:700,fontSize:14,cursor:"pointer",color:"rgba(255,255,255,.75)",listStyle:"none",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                {item.q}
                <span className="fq-plus" style={{fontSize:20,color:G,fontWeight:300,flexShrink:0,lineHeight:1}}>+</span>
              </summary>
              <p style={{marginTop:10,fontSize:13,color:"rgba(255,255,255,.42)",lineHeight:1.75,marginBottom:0}}>{item.a}</p>
            </details>
          ))}
        </section>

        {/* CTA FINAL */}
        <section style={{padding:"0 28px 80px"}}>
          <div className="cf" style={{background:"linear-gradient(135deg,rgba(74,222,128,.07),rgba(96,165,250,.04))",border:"1px solid rgba(74,222,128,.14)",borderRadius:24,maxWidth:1100,margin:"0 auto",padding:"76px 60px",textAlign:"center",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:500,height:300,background:"radial-gradient(ellipse,rgba(74,222,128,.1),transparent 65%)",pointerEvents:"none"}}/>
            <h2 style={{fontFamily:"'Syne',sans-serif",color:"#fff",fontSize:"clamp(28px,4vw,52px)",fontWeight:900,letterSpacing:-2,marginBottom:14,lineHeight:1.03,position:"relative"}}>
              Pronto para gerar sua<br/>primeira campanha com IA?
            </h2>
            <p style={{fontSize:15,color:"rgba(255,255,255,.38)",marginBottom:38,position:"relative"}}>Comece grátis em menos de 2 minutos. Sem cartão.</p>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",position:"relative"}}>
              <button onClick={()=>setLocation("/register")} className="gb"
                style={{background:G,color:D,border:"none",borderRadius:10,padding:"15px 36px",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:"0 8px 28px rgba(74,222,128,.3)"}}>
                Criar conta grátis →
              </button>
              <button onClick={()=>setLocation("/courses")}
                style={{background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.55)",border:"1px solid rgba(255,255,255,.09)",borderRadius:10,padding:"15px 28px",fontSize:15,fontWeight:600,cursor:"pointer"}}>
                Explorar a Academy
              </button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{borderTop:"1px solid rgba(255,255,255,.06)",padding:"28px 24px"}}>
          <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
            <a href="/" style={{textDecoration:"none"}}><img src="/logo-512.png" alt="MECProAI" height={38} style={{display:"block",borderRadius:8}}/></a>
            <nav style={{display:"flex",gap:18,flexWrap:"wrap"}}>
              {[{l:"Plataforma",h:"/#plataforma"},{l:"Academy",h:"/courses"},{l:"Marketplace",h:"/marketplace"},{l:"Preços",h:"/#precos"},{l:"FAQ",h:"/#faq"},{l:"Termos",h:"/terms"},{l:"Privacidade",h:"/privacy"},{l:"Contato",h:"/contact"}].map(x=>(
                <a key={x.l} href={x.h} className="nl" style={{fontSize:12,color:"rgba(255,255,255,.25)",textDecoration:"none"}}>{x.l}</a>
              ))}
            </nav>
            <span style={{fontSize:11,color:"rgba(255,255,255,.18)"}}>© 2026 MECProAI</span>
          </div>
        </footer>

      </div>
      <WABtn/>
    </>
  );
}
