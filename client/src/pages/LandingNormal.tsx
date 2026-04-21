/**
 * LandingNormal.tsx
 * Página inicial padrão do MECPro — sem promoção ativa.
 * Ativada pelo admin via toggle em Admin > Financeiro > Modo da Landing.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import SEO, { SEO_CONFIGS } from "@/components/SEO";

const WA     = "554799465824";
const WA_MSG = encodeURIComponent("Olá! Tenho interesse no MECPro. Pode me ajudar? 😊");

function WABtn() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div style={{position:"fixed",bottom:88,right:20,zIndex:9999,width:288,background:"#fff",borderRadius:16,boxShadow:"0 8px 40px rgba(0,0,0,.18)",padding:"18px 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="22" height="22" viewBox="0 0 32 32" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/></svg>
              </div>
              <div>
                <p style={{margin:0,fontWeight:800,fontSize:13,color:"#111"}}>Michel Leal</p>
                <p style={{margin:0,fontSize:11,color:"#25d366",fontWeight:600}}>● Online agora</p>
              </div>
            </div>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#9ca3af",padding:"2px 6px"}}>×</button>
          </div>
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 13px",marginBottom:14}}>
            <p style={{margin:0,fontSize:12,color:"#374151",lineHeight:1.6}}>👋 Olá! Posso ajudar com dúvidas sobre o MECPro ou nossos planos. Fale agora!</p>
          </div>
          <a href={`https://wa.me/${WA}?text=${WA_MSG}`} target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",borderRadius:10,padding:"11px 16px",fontWeight:800,fontSize:13,textDecoration:"none"}}>
            Chamar no WhatsApp
          </a>
          <p style={{margin:"10px 0 0",fontSize:10,color:"#9ca3af",textAlign:"center"}}>(47) 99465-824 · Seg–Sex, 9h–18h</p>
        </div>
      )}
      <button onClick={()=>setOpen(!open)} aria-label="Falar no WhatsApp"
        style={{position:"fixed",bottom:22,right:22,zIndex:9998,width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(37,211,102,.55)"}}>
        {open
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
          : <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z" fill="white"/><path d="M21.5 19.3c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-1.75-.87-2.9-1.56-4.06-3.53-.3-.53.3-.49.87-1.63.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.91-2.19-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.57-.09 1.75-.72 2-1.41.24-.7.24-1.3.17-1.42-.07-.12-.27-.19-.57-.34z" fill="#128c7e"/></svg>
        }
      </button>
    </>
  );
}

const PLANS = [
  {name:"Basic",  price:"97",  features:["3 projetos","5 concorrentes/projeto","10 campanhas/mês","Academy gratuita","Suporte por e-mail"],pop:false,style:"outline"},
  {name:"Premium",price:"197", features:["10 projetos","Concorrentes ilimitados","Campanhas ilimitadas","Academy completa + certificados","Relatórios PDF","Suporte prioritário"],pop:true,style:"green"},
  {name:"VIP",    price:"397", features:["Projetos ilimitados","Tudo do Premium","Academy VIP + mentoria","API access","Manager dedicado","Onboarding personalizado"],pop:false,style:"dark"},
];

const MINI_COURSES = [
  {slug:"campanha-zero-mecpro",icon:"◈",tag:"GRATUITO",tagColor:"#16a34a",title:"Campanha do Zero com MECPro",desc:"Crie sua primeira campanha completa — passo a passo em 45 minutos.",duration:"45 min",lessons:6,level:"Iniciante",highlight:true},
  {slug:"analise-concorrentes-ia",icon:"🔍",tag:"PRO",tagColor:"#7c3aed",title:"Análise de Concorrentes com IA",desc:"Extraia insights que a concorrência não sabe que você tem.",duration:"6h 15min",lessons:24,level:"Intermediário",highlight:false},
  {slug:"copy-ia-guia-pratico",icon:"✍️",tag:"GRATUITO",tagColor:"#16a34a",title:"Copy com IA — Guia Prático",desc:"Crie anúncios que convertem com o gerador de copy do MECPro.",duration:"1h 20min",lessons:8,level:"Iniciante",highlight:false},
  {slug:"marketing-meta-ads",icon:"📘",tag:"PRO",tagColor:"#7c3aed",title:"Meta Ads do Zero ao Avançado",desc:"Tudo dentro do MECPro conectado ao Meta Ads.",duration:"12h 30min",lessons:48,level:"Completo",highlight:false},
  {slug:"estrategia-ecommerce",icon:"🛒",tag:"PRO",tagColor:"#7c3aed",title:"Estratégia para E-commerce",desc:"Escale sua loja com tráfego pago e funil automatizado.",duration:"10h 20min",lessons:42,level:"Avançado",highlight:false},
  {slug:"relatorios-e-metricas",icon:"📊",tag:"GRATUITO",tagColor:"#16a34a",title:"Relatórios e Métricas que Importam",desc:"Exporte relatórios PDF/XLSX e monitore os KPIs certos.",duration:"4h 30min",lessons:18,level:"Iniciante",highlight:false},
];

const LD = {
  "@context":"https://schema.org",
  "@graph":[
    {"@type":"SoftwareApplication","name":"MECPro","url":"https://mecproai.com","description":"Plataforma de inteligência de campanhas com IA — analise concorrentes, gere campanhas completas e publique no Meta, Google e TikTok.","applicationCategory":"BusinessApplication","operatingSystem":"Web Browser","inLanguage":"pt-BR","isAccessibleForFree":true,"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"127","bestRating":"5"}},
  ],
};

export default function LandingNormal() {
  const [, setLocation] = useLocation();

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
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .animate-fade-up{animation:fadeUp .6s ease both}
        @media(max-width:640px){.sm-hide{display:none!important}.grid-3{grid-template-columns:1fr!important}.grid-2{grid-template-columns:1fr!important}}
      `}</style>

      <div style={{fontFamily:"var(--font-body,'Geist',sans-serif)",background:"#fff",color:"#111"}}>

        {/* NAV */}
        <nav style={{position:"sticky",top:0,zIndex:100,height:60,background:"rgba(255,255,255,.96)",backdropFilter:"blur(16px)",borderBottom:"1px solid #f0f0f0"}}>
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
              <button className="btn btn-md btn-ghost" onClick={()=>setLocation("/login")}>Entrar</button>
              <button className="btn btn-md btn-primary" onClick={()=>setLocation("/register")}>Começar grátis</button>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <header style={{padding:"96px 24px 80px",textAlign:"center",maxWidth:800,margin:"0 auto"}}>
          <div className="badge badge-green animate-fade-up" style={{marginBottom:28}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"var(--green,#16a34a)",display:"inline-block",marginRight:8}}/>
            Plataforma #1 em Geração de Campanhas com IA
          </div>
          <h1 className="animate-fade-up" style={{fontSize:"clamp(40px,5.5vw,68px)",fontWeight:900,letterSpacing:-2.5,lineHeight:1.06,marginBottom:22,animationDelay:".1s"}}>
            Gere campanhas completas<br/><span style={{color:"var(--green-d,#15803d)"}}>em minutos com IA</span>
          </h1>
          <p className="animate-fade-up" style={{fontSize:18,color:"#6b7280",maxWidth:560,margin:"0 auto 40px",lineHeight:1.75,animationDelay:".2s"}}>
            Cruze dados do cliente, concorrentes e mercado. A IA cria a campanha completa — copy, ad sets, orçamento e funil. Prontos para rodar no Meta, Google e TikTok.
          </p>
          <div className="animate-fade-up" style={{display:"flex",gap:10,justifyContent:"center",marginBottom:14,animationDelay:".3s",flexWrap:"wrap"}}>
            <button className="btn btn-lg btn-primary" onClick={()=>setLocation("/register")}>Criar conta grátis</button>
            <button className="btn btn-lg btn-outline" onClick={()=>setLocation("/courses")}>Ver Academy grátis →</button>
          </div>
          <p style={{fontSize:13,color:"#9ca3af"}}>Sem cartão de crédito · Plano gratuito para sempre · Mini cursos inclusos</p>
        </header>

        {/* TRUST STRIP */}
        <div style={{background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"16px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",gap:28,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:600,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.8,whiteSpace:"nowrap"}}>Confiado por</span>
            <div style={{width:1,height:18,background:"#e5e7eb"}}/>
            {["500+ Agências","E-commerce","SaaS","Consultorias","Freelancers"].map(l=>(
              <span key={l} style={{fontSize:14,fontWeight:600,color:"#6b7280"}}>{l}</span>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              {"★★★★★".split("").map((_,i)=><span key={i} style={{color:"#f59e0b",fontSize:15}}>★</span>)}
              <span style={{fontSize:13,color:"#6b7280",fontWeight:600}}>4.9 · 127 avaliações</span>
            </div>
          </div>
        </div>

        {/* STATS */}
        <section style={{background:"#111",padding:"52px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:24,textAlign:"center"}} className="grid-2">
            {[{v:"500+",l:"Agências ativas"},{v:"10.000+",l:"Campanhas geradas"},{v:"7 camadas",l:"Pipeline de IA"},{v:"99,9%",l:"Uptime garantido"}].map(s=>(
              <div key={s.v}>
                <div style={{fontSize:32,fontWeight:900,color:"#4ade80",letterSpacing:-1}}>{s.v}</div>
                <div style={{fontSize:12,color:"#6b7280",marginTop:6}}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section id="recursos" style={{maxWidth:1080,margin:"0 auto",padding:"88px 24px"}}>
          <div style={{marginBottom:52}}>
            <div className="badge badge-green" style={{marginBottom:14}}>Plataforma</div>
            <h2 style={{fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14}}>4 módulos. 1 campanha pronta.</h2>
            <p style={{fontSize:16,color:"#6b7280",maxWidth:500,lineHeight:1.7}}>Cada módulo alimenta o próximo. A IA pensa a campanha por você.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:"#e5e7eb",border:"1px solid #e5e7eb",borderRadius:20,overflow:"hidden"}} className="grid-3">
            {[
              {n:"01",icon:"🎯",t:"Perfil do Cliente",d:"Mapeie dores, desejos e objeções com profundidade estratégica."},
              {n:"02",icon:"🔍",t:"Análise de Concorrentes",d:"Monitore anúncios ativos via Meta Ads Library em tempo real."},
              {n:"03",icon:"📊",t:"Inteligência de Mercado",d:"A IA revela gaps, oportunidades e posicionamento ideal."},
              {n:"04",icon:"◈",t:"Campanha Automática",d:"Ad sets, copy, orçamento e funil prontos para publicar."},
              {n:"05",icon:"◻",t:"Relatórios PDF & XLSX",d:"Documentos profissionais para clientes ou implementação."},
              {n:"06",icon:"⚡",t:"Meta, Google & TikTok",d:"Publique direto do MECPro sem copiar e colar."},
            ].map(f=>(
              <article key={f.n} style={{background:"#fff",padding:"26px 24px",transition:"background .2s"}}
                onMouseEnter={e=>(e.currentTarget.style.background="#f9fafb")}
                onMouseLeave={e=>(e.currentTarget.style.background="#fff")}>
                <div style={{fontSize:22,marginBottom:10}}>{f.icon}</div>
                <div style={{fontSize:10,fontWeight:700,color:"#16a34a",letterSpacing:1,marginBottom:6}}>{f.n}</div>
                <h3 style={{fontSize:15,fontWeight:700,color:"#111",marginBottom:8}}>{f.t}</h3>
                <p style={{fontSize:13,color:"#6b7280",lineHeight:1.65,margin:0}}>{f.d}</p>
              </article>
            ))}
          </div>
          <div style={{textAlign:"center",marginTop:36}}>
            <button className="btn btn-lg btn-primary" onClick={()=>setLocation("/register")}>Começar grátis agora →</button>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section style={{background:"#f9fafb",borderTop:"1px solid #f0f0f0",borderBottom:"1px solid #f0f0f0",padding:"88px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:52}}>
              <div className="badge badge-green" style={{marginBottom:14}}>Como funciona</div>
              <h2 style={{fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14}}>3 passos. Campanha pronta.</h2>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}} className="grid-3">
              {[
                {n:"1",icon:"🎯",t:"Preencha o perfil do cliente",d:"Informe segmento, público e objetivos. O MECPro organiza tudo estrategicamente."},
                {n:"2",icon:"🔍",t:"IA analisa o mercado",d:"Pipeline de 7 camadas coleta dados reais de anúncios e estratégias da concorrência."},
                {n:"3",icon:"◈",t:"Receba a campanha pronta",d:"Copy, ad sets, orçamento e funil gerados e prontos para publicar."},
              ].map(s=>(
                <div key={s.n} style={{background:"#fff",borderRadius:16,padding:"32px 28px",border:"1px solid #e5e7eb"}}>
                  <div style={{fontSize:28,marginBottom:14}}>{s.icon}</div>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"#16a34a",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,marginBottom:16}}>{s.n}</div>
                  <h3 style={{fontSize:16,fontWeight:700,color:"#111",marginBottom:10}}>{s.t}</h3>
                  <p style={{fontSize:13,color:"#6b7280",lineHeight:1.65,margin:0}}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ACADEMY */}
        <section id="academy" style={{maxWidth:1080,margin:"0 auto",padding:"88px 24px"}}>
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:48,flexWrap:"wrap",gap:20}}>
            <div>
              <div className="badge badge-green" style={{marginBottom:14}}>MECPro Academy</div>
              <h2 style={{fontSize:"clamp(26px,3.5vw,40px)",fontWeight:900,letterSpacing:-1.5,marginBottom:12}}>
                Aprenda a criar campanhas<br/>usando a ferramenta
              </h2>
              <p style={{fontSize:15,color:"#6b7280",maxWidth:480,lineHeight:1.7,margin:0}}>
                Mini cursos práticos — do zero ao avançado. Inclusos em todos os planos.
              </p>
            </div>
            <a href="/courses" style={{fontSize:14,color:"#16a34a",fontWeight:700,textDecoration:"none",border:"1.5px solid #16a34a",padding:"10px 22px",borderRadius:10,whiteSpace:"nowrap"}}>
              Ver todos →
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
              <article key={c.slug} onClick={()=>setLocation(`/courses/${c.slug}`)} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:"22px",cursor:"pointer",transition:"box-shadow .2s,transform .2s"}}
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
        </section>

        {/* PRICING */}
        <section style={{background:"#f9fafb",borderTop:"1px solid #f0f0f0",padding:"88px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:52}}>
              <div className="badge badge-green" style={{marginBottom:14}}>Preços</div>
              <h2 style={{fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14}}>Simples e sem surpresa</h2>
              <p style={{fontSize:16,color:"#6b7280",lineHeight:1.7}}>Comece grátis. Escale quando precisar. Academy inclusa em todos os planos.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}} className="grid-3">
              {PLANS.map(p=>(
                <article key={p.name} style={{background:"#fff",border:`1.5px solid ${p.pop?"#16a34a":"#e5e7eb"}`,borderRadius:18,padding:28,position:"relative",boxShadow:p.pop?"0 0 0 4px rgba(22,163,74,.07)":"none"}}>
                  {p.pop&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:"#16a34a",color:"#fff",fontSize:10,fontWeight:800,padding:"3px 14px",borderRadius:99,whiteSpace:"nowrap"}}>⭐ Mais popular</div>}
                  <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>{p.name}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:2,marginBottom:4}}>
                    <span style={{fontSize:13,color:"#9ca3af"}}>R$</span>
                    <span style={{fontSize:44,fontWeight:900,color:"#111",letterSpacing:-2,lineHeight:1}}>{p.price}</span>
                    <span style={{fontSize:13,color:"#9ca3af"}}>/mês</span>
                  </div>
                  <div style={{fontSize:12,color:"#9ca3af",marginBottom:20}}>cobrado mensalmente</div>
                  <div style={{marginBottom:24}}>
                    {p.features.map(f=>(
                      <div key={f} style={{display:"flex",gap:8,fontSize:13,color:"#374151",marginBottom:9}}>
                        <span style={{color:"#16a34a",fontWeight:700}}>✓</span>{f}
                      </div>
                    ))}
                  </div>
                  <button className={`btn btn-full btn-lg ${p.style==="green"?"btn-green":p.style==="dark"?"btn-primary":"btn-outline"}`}
                    onClick={()=>setLocation("/register")}>
                    Assinar {p.name}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{padding:"72px 24px"}}>
          <div style={{maxWidth:720,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:40}}>
              <div className="badge badge-green" style={{marginBottom:14}}>FAQ</div>
              <h2 style={{fontSize:"clamp(24px,3vw,36px)",fontWeight:900,letterSpacing:-1.5,marginBottom:10}}>Perguntas frequentes</h2>
            </div>
            {[
              {q:"O MECPro é fácil de usar?",a:"Sim! Interface simples e intuitiva, sem código. Os mini cursos da Academy ensinam a usar cada módulo em poucos minutos."},
              {q:"Funciona para qualquer nicho?",a:"Sim. Agências, e-commerces, SaaS, consultorias e freelancers de todos os segmentos. A IA adapta as campanhas para o seu contexto."},
              {q:"Posso cancelar quando quiser?",a:"Sim, sem fidelidade. Cancele a qualquer momento direto no painel, sem burocracia e sem multa."},
              {q:"O MECPro integra com Meta Ads e Google Ads?",a:"Sim! Integração nativa com Meta, Google e TikTok Ads — publique campanhas sem copiar e colar."},
              {q:"Tem plano gratuito?",a:"Sim! Crie sua conta gratuitamente em menos de 2 minutos. Sem cartão de crédito necessário."},
            ].map((item,i)=>(
              <details key={i} style={{borderBottom:"1px solid #f0f0f0",padding:"18px 0"}}>
                <summary style={{fontWeight:700,fontSize:15,cursor:"pointer",color:"#111",listStyle:"none",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                  {item.q}
                  <span style={{fontSize:20,color:"#16a34a",fontWeight:300,flexShrink:0}}>+</span>
                </summary>
                <p style={{marginTop:12,fontSize:14,color:"#6b7280",lineHeight:1.7,marginBottom:0}}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA FINAL */}
        <section style={{padding:"0 24px 80px"}}>
          <div style={{background:"#111",borderRadius:24,maxWidth:1080,margin:"0 auto",padding:"72px 48px",textAlign:"center"}}>
            <h2 style={{color:"#fff",fontSize:"clamp(28px,3.5vw,44px)",fontWeight:900,letterSpacing:-1.5,marginBottom:14}}>
              Pronto para gerar sua<br/>primeira campanha com IA?
            </h2>
            <p style={{fontSize:16,color:"#6b7280",marginBottom:36}}>Comece grátis em menos de 2 minutos. Sem cartão.</p>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button className="btn btn-lg" style={{background:"#fff",color:"#111",fontWeight:700,borderRadius:10}} onClick={()=>setLocation("/register")}>
                Criar conta grátis →
              </button>
              <button className="btn btn-lg btn-outline" style={{borderColor:"#374151",color:"#9ca3af"}} onClick={()=>setLocation("/courses")}>
                Explorar a Academy
              </button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{borderTop:"1px solid #f0f0f0",padding:"32px 24px"}}>
          <div style={{maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:20}}>
            <a href="/" style={{textDecoration:"none",display:"flex",alignItems:"center",gap:8}}>
              <img src="/logo-512.png" alt="MECPro" height={32} style={{display:"block",borderRadius:8}}/>
            </a>
            <nav style={{display:"flex",gap:20,flexWrap:"wrap"}}>
              {[{l:"Plataforma",h:"/#recursos"},{l:"Academy",h:"/courses"},{l:"Preços",h:"/pricing"},{l:"FAQ",h:"/faq"},{l:"Termos",h:"/terms"},{l:"Privacidade",h:"/privacy"},{l:"Contato",h:"/contact"}].map(x=>(
                <a key={x.l} href={x.h} style={{fontSize:13,color:"#9ca3af",textDecoration:"none"}}>{x.l}</a>
              ))}
            </nav>
            <span style={{fontSize:12,color:"#9ca3af"}}>© 2026 MECPro</span>
          </div>
        </footer>

      </div>
      <WABtn/>
    </>
  );
}
