/**
 * LandingNormal.tsx — MECProAI · Landing page principal
 * Tema claro, tipografia limpa, sem dependências externas de fonte
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
        <div style={{position:"fixed",bottom:90,right:20,zIndex:9999,width:290,background:"#fff",borderRadius:18,boxShadow:"0 20px 60px rgba(0,0,0,.15)",padding:"18px",border:"1px solid #e5e7eb"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="20" height="20" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
              </div>
              <div>
                <p style={{margin:0,fontWeight:700,fontSize:13,color:"#111"}}>Michel Leal</p>
                <p style={{margin:0,fontSize:11,color:"#16a34a",fontWeight:600}}>&#9679; Online agora</p>
              </div>
            </div>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9ca3af",lineHeight:1}}>x</button>
          </div>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
            <p style={{margin:0,fontSize:13,color:"#374151",lineHeight:1.6}}>Tire suas duvidas sobre o MECProAI. Fale agora!</p>
          </div>
          <a href={"https://wa.me/"+WA+"?text="+WA_MSG} target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",borderRadius:10,padding:"11px",fontWeight:700,fontSize:13,textDecoration:"none"}}>
            Chamar no WhatsApp
          </a>
        </div>
      )}
      <button onClick={()=>setOpen(!open)} aria-label="WhatsApp"
        style={{position:"fixed",bottom:22,right:22,zIndex:9998,width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(37,211,102,.45)"}}>
        <svg width="26" height="26" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
      </button>
    </>
  );
}

const PLANS = [
  { name:"Basic",   price:"97",  highlight:false, desc:"Para quem esta comecando",
    features:["3 projetos","5 concorrentes/projeto","10 campanhas/mes","Academy gratuita","Suporte por e-mail"] },
  { name:"Premium", price:"197", highlight:true,  desc:"O mais escolhido pelas agencias",
    features:["10 projetos","Concorrentes ilimitados","Campanhas ilimitadas","Academy completa + certificados","Relatorios PDF/XLSX","Suporte prioritario"] },
  { name:"VIP",     price:"397", highlight:false, desc:"Para quem escala alto",
    features:["Projetos ilimitados","Tudo do Premium","Academy VIP + mentoria","API access","Manager dedicado","Onboarding personalizado"] },
];

const STEPS = [
  { n:"1", icon:"target", t:"Preencha o perfil do cliente", d:"Informe segmento, publico e objetivos. O MECProAI organiza tudo estrategicamente.", color:"#16a34a" },
  { n:"2", icon:"search", t:"IA analisa o mercado",         d:"Pipeline de 7 camadas coleta dados reais de anuncios e estrategias da concorrencia.", color:"#2563eb" },
  { n:"3", icon:"check",  t:"Receba a campanha pronta",     d:"Copy, ad sets, orcamento e funil gerados e prontos para publicar com 1 clique.", color:"#7c3aed" },
];

const FEATURES = [
  { icon:"01", t:"Perfil do Cliente",        d:"Mapeie dores, desejos e objecoes com profundidade estrategica." },
  { icon:"02", t:"Analise de Concorrentes",  d:"Monitore anuncios ativos via Meta Ads Library em tempo real." },
  { icon:"03", t:"Inteligencia de Mercado",  d:"A IA revela gaps, oportunidades e posicionamento ideal." },
  { icon:"04", t:"Campanha Automatica",      d:"Ad sets, copy, orcamento e funil prontos para publicar." },
  { icon:"05", t:"Relatorios PDF e XLSX",    d:"Documentos profissionais para clientes ou implementacao." },
  { icon:"06", t:"Meta, Google e TikTok",   d:"Publique direto do MECProAI sem copiar e colar." },
];

const FAQS = [
  { q:"O MECProAI e facil de usar?",         a:"Sim! Interface simples e intuitiva, sem codigo. Os mini cursos da Academy ensinam a usar cada modulo em poucos minutos." },
  { q:"Funciona para qualquer nicho?",        a:"Sim. Agencias, e-commerces, SaaS, consultorias e freelancers. A IA adapta as campanhas para o seu contexto." },
  { q:"Posso cancelar quando quiser?",        a:"Sim, sem fidelidade. Cancele a qualquer momento direto no painel, sem burocracia e sem multa." },
  { q:"Integra com Meta Ads e Google Ads?",   a:"Sim! Integracao nativa com Meta, Google e TikTok Ads. Publique campanhas com 1 clique." },
  { q:"Tem plano gratuito?",                  a:"Sim! Crie sua conta gratuitamente em menos de 2 minutos. Sem cartao de credito necessario." },
];

const LD = {
  "@context":"https://schema.org",
  "@graph":[{"@type":"SoftwareApplication","name":"MECProAI","url":"https://mecproai.com","description":"Plataforma de geracao de campanhas com IA","applicationCategory":"BusinessApplication","operatingSystem":"Web Browser","inLanguage":"pt-BR","isAccessibleForFree":true,"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"127","bestRating":"5"}}],
};

// Cores centralizadas
const GREEN  = "#16a34a";
const GREENBG = "#f0fdf4";
const DARK   = "#111827";
const MUTED  = "#6b7280";
const BORDER = "#e5e7eb";
const BG     = "#ffffff";
const OFFBG  = "#f9fafb";

export default function LandingNormal() {
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <SEO title={SEO_CONFIGS.landing.title} description={SEO_CONFIGS.landing.description}
        keywords={SEO_CONFIGS.landing.keywords} canonical={SEO_CONFIGS.landing.canonical}
        ogType="website" structuredData={LD} />

      <style>{`
        *{box-sizing:border-box}
        body{margin:0;padding:0;background:#fff}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .lfu{animation:fadeUp .6s ease both}
        .lfu1{animation-delay:.1s}.lfu2{animation-delay:.2s}.lfu3{animation-delay:.32s}
        .lhover{transition:all .18s}
        .lhover:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.09)!important}
        .lbtn{transition:all .15s;cursor:pointer}
        .lbtn:hover{filter:brightness(.93)}
        .lnav:hover{color:#16a34a!important}
        .lnav{transition:color .15s}
        @media(max-width:760px){
          .lhide{display:none!important}
          .lg3{grid-template-columns:1fr!important}
          .lg2{grid-template-columns:1fr!important}
          .lhero h1{font-size:clamp(32px,9vw,52px)!important}
          .lpad{padding:64px 20px!important}
          .lstats{grid-template-columns:repeat(2,1fr)!important}
        }
      `}</style>

      <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",background:BG,color:DARK,minHeight:"100vh"}}>

        {/* NAV */}
        <nav style={{position:"sticky",top:0,zIndex:100,height:64,background:"rgba(255,255,255,.97)",backdropFilter:"blur(12px)",borderBottom:"1px solid "+BORDER}}>
          <div style={{maxWidth:1080,margin:"0 auto",padding:"0 24px",height:"100%",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <a href="/" style={{textDecoration:"none"}}>
              <img src="/logo-512.png" alt="MECProAI" height={42} style={{display:"block",borderRadius:10}}/>
            </a>
            <nav className="lhide" style={{display:"flex",gap:28}}>
              {[{l:"Plataforma",h:"/#plataforma"},{l:"Academy",h:"/courses"},{l:"Marketplace",h:"/marketplace"},{l:"Precos",h:"/#precos"},{l:"FAQ",h:"/#faq"}].map(x=>(
                <a key={x.l} href={x.h} className="lnav" style={{fontSize:14,color:MUTED,textDecoration:"none",fontWeight:500}}>{x.l}</a>
              ))}
            </nav>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setLocation("/login")} className="lbtn"
                style={{background:"transparent",color:DARK,border:"1px solid "+BORDER,borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:600}}>
                Entrar
              </button>
              <button onClick={()=>setLocation("/register")} className="lbtn"
                style={{background:GREEN,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontSize:13,fontWeight:700,boxShadow:"0 2px 8px rgba(22,163,74,.3)"}}>
                Comecar gratis
              </button>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <header className="lhero lpad" style={{padding:"88px 24px 80px",textAlign:"center",maxWidth:760,margin:"0 auto"}}>
          <div className="lfu" style={{display:"inline-flex",alignItems:"center",gap:6,background:GREENBG,border:"1px solid #bbf7d0",borderRadius:99,padding:"5px 14px",marginBottom:28}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:GREEN,display:"inline-block"}}/>
            <span style={{fontSize:12,fontWeight:600,color:GREEN}}>Plataforma n1 em Geracao de Campanhas com IA</span>
          </div>
          <h1 className="lfu lfu1" style={{fontSize:"clamp(36px,5.5vw,60px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-1.5px",marginBottom:20,color:DARK}}>
            Gere campanhas completas<br/>
            <span style={{color:GREEN}}>com IA em minutos</span>
          </h1>
          <p className="lfu lfu2" style={{fontSize:17,color:MUTED,maxWidth:500,margin:"0 auto 36px",lineHeight:1.7,fontWeight:400}}>
            Cruze dados do cliente, concorrentes e mercado. A IA cria copy, ad sets, orcamento e funil — prontos para Meta, Google e TikTok.
          </p>
          <div className="lfu lfu3" style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:16}}>
            <button onClick={()=>setLocation("/register")} className="lbtn"
              style={{background:GREEN,color:"#fff",border:"none",borderRadius:10,padding:"14px 32px",fontSize:15,fontWeight:700,boxShadow:"0 4px 16px rgba(22,163,74,.35)"}}>
              Criar conta gratis
            </button>
            <button onClick={()=>setLocation("/courses")} className="lbtn"
              style={{background:"transparent",color:DARK,border:"1px solid "+BORDER,borderRadius:10,padding:"14px 26px",fontSize:15,fontWeight:600}}>
              Ver Academy gratis
            </button>
          </div>
          <p style={{fontSize:13,color:"#9ca3af"}}>Sem cartao de credito - Plano gratuito para sempre - Mini cursos inclusos</p>
        </header>

        {/* TRUST */}
        <div style={{background:OFFBG,borderTop:"1px solid "+BORDER,borderBottom:"1px solid "+BORDER,padding:"14px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",justifyContent:"center"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1}}>Confiado por</span>
            {["500+ Agencias","E-commerce","SaaS","Consultorias","Freelancers"].map(l=>(
              <span key={l} style={{fontSize:13,fontWeight:600,color:MUTED}}>{l}</span>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}>
              {"12345".split("").map((_,i)=><span key={i} style={{color:"#f59e0b",fontSize:13}}>&#9733;</span>)}
              <span style={{fontSize:12,color:MUTED,fontWeight:600,marginLeft:6}}>4.9 - 127 avaliacoes</span>
            </div>
          </div>
        </div>

        {/* STATS */}
        <section style={{background:DARK,padding:"48px 24px"}}>
          <div className="lstats" style={{maxWidth:1080,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:32,textAlign:"center"}}>
            {[
              {v:"500+",    l:"Agencias ativas"},
              {v:"10.000+", l:"Campanhas geradas"},
              {v:"7 camadas",l:"Pipeline de IA"},
              {v:"99,9%",   l:"Uptime garantido"},
            ].map(s=>(
              <div key={s.v}>
                <div style={{fontSize:32,fontWeight:800,color:"#4ade80",letterSpacing:"-1px",marginBottom:6}}>{s.v}</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* PLATAFORMA */}
        <section id="plataforma" className="lpad" style={{maxWidth:1080,margin:"0 auto",padding:"88px 24px"}}>
          <div style={{marginBottom:48}}>
            <span style={{display:"inline-block",background:GREENBG,color:GREEN,fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:99,marginBottom:12,border:"1px solid #bbf7d0"}}>Plataforma</span>
            <h2 style={{fontSize:"clamp(26px,3.5vw,40px)",fontWeight:800,letterSpacing:"-1px",marginBottom:12,color:DARK,lineHeight:1.2}}>4 modulos. 1 campanha pronta.</h2>
            <p style={{fontSize:15,color:MUTED,maxWidth:480,lineHeight:1.7}}>Cada modulo alimenta o proximo. A IA pensa a campanha por voce.</p>
          </div>
          <div className="lg3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:BORDER,borderRadius:16,overflow:"hidden",border:"1px solid "+BORDER}}>
            {FEATURES.map(f=>(
              <article key={f.icon} className="lhover"
                style={{background:BG,padding:"24px 20px",borderBottom:"1px solid "+BORDER,borderRight:"1px solid "+BORDER,cursor:"default"}}>
                <div style={{fontSize:11,fontWeight:800,color:GREEN,marginBottom:8,letterSpacing:".5px"}}>{f.icon}</div>
                <h3 style={{fontSize:14,fontWeight:700,color:DARK,marginBottom:6}}>{f.t}</h3>
                <p style={{fontSize:12,color:MUTED,lineHeight:1.6,margin:0}}>{f.d}</p>
              </article>
            ))}
          </div>
          <div style={{textAlign:"center",marginTop:32}}>
            <button onClick={()=>setLocation("/register")} className="lbtn"
              style={{background:GREEN,color:"#fff",border:"none",borderRadius:10,padding:"13px 28px",fontSize:14,fontWeight:700,boxShadow:"0 4px 14px rgba(22,163,74,.3)"}}>
              Comecar gratis agora
            </button>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="lpad" style={{background:OFFBG,borderTop:"1px solid "+BORDER,borderBottom:"1px solid "+BORDER,padding:"80px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:48}}>
              <span style={{display:"inline-block",background:GREENBG,color:GREEN,fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:99,marginBottom:12,border:"1px solid #bbf7d0"}}>Como funciona</span>
              <h2 style={{fontSize:"clamp(26px,3.5vw,40px)",fontWeight:800,letterSpacing:"-1px",color:DARK,lineHeight:1.2}}>3 passos. Campanha pronta.</h2>
            </div>
            <div className="lg3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
              {STEPS.map(s=>(
                <div key={s.n} style={{background:BG,borderRadius:14,padding:"28px 24px",border:"1px solid "+BORDER,borderTop:"3px solid "+s.color}}>
                  <div style={{width:36,height:36,borderRadius:10,background:s.color+"18",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
                    <span style={{fontWeight:800,fontSize:15,color:s.color}}>{s.n}</span>
                  </div>
                  <h3 style={{fontSize:15,fontWeight:700,color:DARK,marginBottom:8}}>{s.t}</h3>
                  <p style={{fontSize:13,color:MUTED,lineHeight:1.65,margin:0}}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* MARKETPLACE CALLOUT */}
        <section className="lpad" style={{maxWidth:1080,margin:"0 auto",padding:"80px 24px"}}>
          <div style={{background:"linear-gradient(135deg,#f0fdf4,#eff6ff)",border:"1px solid #bbf7d0",borderRadius:20,padding:"48px 44px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:32,flexWrap:"wrap"}}>
            <div style={{maxWidth:500}}>
              <span style={{display:"inline-block",background:GREEN,color:"#fff",fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:99,marginBottom:14}}>Novo - Marketplace</span>
              <h2 style={{fontSize:"clamp(22px,3vw,34px)",fontWeight:800,letterSpacing:"-1px",color:DARK,marginBottom:10,lineHeight:1.2}}>Publique e venda servicos com IA</h2>
              <p style={{fontSize:14,color:MUTED,lineHeight:1.7,margin:0}}>Landing pages geradas por IA, galeria de fotos, insights por nicho e score de qualidade automatico.</p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10,flexShrink:0}}>
              <button onClick={()=>setLocation("/marketplace")} className="lbtn"
                style={{background:GREEN,color:"#fff",border:"none",borderRadius:10,padding:"13px 28px",fontSize:14,fontWeight:700,boxShadow:"0 4px 14px rgba(22,163,74,.3)"}}>
                Ver Marketplace
              </button>
              <button onClick={()=>setLocation("/marketplace/publish")} className="lbtn"
                style={{background:"transparent",color:MUTED,border:"1px solid "+BORDER,borderRadius:10,padding:"11px 28px",fontSize:13,fontWeight:600}}>
                Publicar minha oferta
              </button>
            </div>
          </div>
        </section>

        {/* PRECOS */}
        <section id="precos" className="lpad" style={{background:OFFBG,borderTop:"1px solid "+BORDER,padding:"80px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:48}}>
              <span style={{display:"inline-block",background:GREENBG,color:GREEN,fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:99,marginBottom:12,border:"1px solid #bbf7d0"}}>Precos</span>
              <h2 style={{fontSize:"clamp(26px,3.5vw,40px)",fontWeight:800,letterSpacing:"-1px",color:DARK,marginBottom:10,lineHeight:1.2}}>Simples e sem surpresa</h2>
              <p style={{fontSize:15,color:MUTED,lineHeight:1.7}}>Comece gratis. Escale quando precisar. Academy inclusa em todos os planos.</p>
            </div>
            <div className="lg3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
              {PLANS.map(p=>(
                <article key={p.name} className="lhover"
                  style={{background:BG,border:p.highlight?"2px solid "+GREEN:"1px solid "+BORDER,borderRadius:18,padding:"28px 22px",position:"relative",boxShadow:p.highlight?"0 4px 20px rgba(22,163,74,.12)":"0 1px 4px rgba(0,0,0,.04)"}}>
                  {p.highlight && <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:GREEN,color:"#fff",fontSize:10,fontWeight:700,padding:"4px 14px",borderRadius:99,whiteSpace:"nowrap"}}>Mais popular</div>}
                  <div style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>{p.name}</div>
                  <div style={{fontSize:12,color:MUTED,marginBottom:14}}>{p.desc}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:2,marginBottom:2}}>
                    <span style={{fontSize:13,color:MUTED}}>R$</span>
                    <span style={{fontSize:46,fontWeight:800,color:p.highlight?GREEN:DARK,letterSpacing:"-2px",lineHeight:1}}>{p.price}</span>
                    <span style={{fontSize:13,color:MUTED}}>/mes</span>
                  </div>
                  <div style={{fontSize:11,color:"#9ca3af",marginBottom:22}}>cobrado mensalmente</div>
                  <div style={{marginBottom:24}}>
                    {p.features.map(f=>(
                      <div key={f} style={{display:"flex",gap:8,fontSize:13,color:DARK,marginBottom:10,alignItems:"flex-start"}}>
                        <span style={{color:GREEN,fontWeight:700,flexShrink:0}}>v</span>{f}
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setLocation("/register")} className="lbtn"
                    style={{width:"100%",background:p.highlight?GREEN:"transparent",color:p.highlight?"#fff":DARK,border:p.highlight?"none":"1px solid "+BORDER,borderRadius:10,padding:"12px 0",fontSize:13,fontWeight:700,boxShadow:p.highlight?"0 4px 14px rgba(22,163,74,.3)":"none"}}>
                    Assinar {p.name}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="lpad" style={{maxWidth:720,margin:"0 auto",padding:"80px 24px"}}>
          <div style={{textAlign:"center",marginBottom:44}}>
            <span style={{display:"inline-block",background:GREENBG,color:GREEN,fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:99,marginBottom:12,border:"1px solid #bbf7d0"}}>FAQ</span>
            <h2 style={{fontSize:"clamp(24px,3vw,36px)",fontWeight:800,letterSpacing:"-1px",color:DARK,lineHeight:1.2}}>Perguntas frequentes</h2>
          </div>
          {FAQS.map((item,i)=>(
            <div key={i} style={{borderBottom:"1px solid "+BORDER}}>
              <button onClick={()=>setOpenFaq(openFaq===i?null:i)}
                style={{width:"100%",background:"none",border:"none",padding:"18px 0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left"}}>
                <span style={{fontWeight:600,fontSize:14,color:DARK}}>{item.q}</span>
                <span style={{fontSize:20,color:GREEN,fontWeight:300,flexShrink:0,lineHeight:1,transform:openFaq===i?"rotate(45deg)":"none",transition:"transform .2s"}}>+</span>
              </button>
              {openFaq===i && (
                <p style={{margin:"0 0 18px",fontSize:13,color:MUTED,lineHeight:1.75,paddingRight:32}}>{item.a}</p>
              )}
            </div>
          ))}
        </section>

        {/* CTA FINAL */}
        <section style={{padding:"0 24px 72px"}}>
          <div style={{background:DARK,borderRadius:20,maxWidth:1080,margin:"0 auto",padding:"64px 48px",textAlign:"center"}}>
            <h2 style={{color:"#fff",fontSize:"clamp(26px,3.5vw,44px)",fontWeight:800,letterSpacing:"-1px",marginBottom:12,lineHeight:1.15}}>
              Pronto para gerar sua primeira campanha com IA?
            </h2>
            <p style={{fontSize:15,color:"rgba(255,255,255,.5)",marginBottom:32}}>Comece gratis em menos de 2 minutos. Sem cartao.</p>
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setLocation("/register")} className="lbtn"
                style={{background:"#fff",color:DARK,border:"none",borderRadius:10,padding:"14px 32px",fontSize:15,fontWeight:700,boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
                Criar conta gratis
              </button>
              <button onClick={()=>setLocation("/courses")} className="lbtn"
                style={{background:"transparent",color:"rgba(255,255,255,.6)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:"14px 26px",fontSize:15,fontWeight:600}}>
                Explorar a Academy
              </button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{borderTop:"1px solid "+BORDER,padding:"28px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
            <a href="/" style={{textDecoration:"none"}}>
              <img src="/logo-512.png" alt="MECProAI" height={38} style={{display:"block",borderRadius:8}}/>
            </a>
            <nav style={{display:"flex",gap:18,flexWrap:"wrap"}}>
              {[{l:"Plataforma",h:"/#plataforma"},{l:"Academy",h:"/courses"},{l:"Marketplace",h:"/marketplace"},{l:"Precos",h:"/#precos"},{l:"FAQ",h:"/#faq"},{l:"Termos",h:"/terms"},{l:"Privacidade",h:"/privacy"},{l:"Contato",h:"/contact"}].map(x=>(
                <a key={x.l} href={x.h} className="lnav" style={{fontSize:12,color:"#9ca3af",textDecoration:"none"}}>{x.l}</a>
              ))}
            </nav>
            <span style={{fontSize:12,color:"#9ca3af"}}>2026 MECProAI</span>
          </div>
        </footer>

      </div>
      <WABtn/>
    </>
  );
}
