import { useState } from "react";
import { useLocation } from "wouter";
import SEO, { SEO_CONFIGS } from "@/components/SEO";

const LANDING_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "MECPro",
      "url": "https://mecpro-ai.onrender.com",
      "logo": "https://mecpro-ai.onrender.com/favicon-512.png",
      "description": "Plataforma de inteligÃªncia de campanhas com IA. Analise concorrentes via Meta Ads Library, gere campanhas completas, copy e relatÃ³rios PDF/XLSX em minutos.",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web Browser",
      "inLanguage": "pt-BR",
      "isAccessibleForFree": true,
      "offers": [
        { "@type": "Offer", "name": "Plano Basic",   "price": "97.00",  "priceCurrency": "BRL", "priceSpecification": { "@type": "UnitPriceSpecification", "price": "97.00",  "priceCurrency": "BRL", "unitText": "MONTH" } },
        { "@type": "Offer", "name": "Plano Premium", "price": "197.00", "priceCurrency": "BRL", "priceSpecification": { "@type": "UnitPriceSpecification", "price": "197.00", "priceCurrency": "BRL", "unitText": "MONTH" } },
        { "@type": "Offer", "name": "Plano VIP",     "price": "397.00", "priceCurrency": "BRL", "priceSpecification": { "@type": "UnitPriceSpecification", "price": "397.00", "priceCurrency": "BRL", "unitText": "MONTH" } },
      ],
      "featureList": [
        "GeraÃ§Ã£o automÃ¡tica de campanhas completas com IA",
        "AnÃ¡lise de concorrentes via Meta Ads Library",
        "Perfil de cliente estratÃ©gico com mapeamento de dores",
        "AnÃ¡lise de mercado e identificaÃ§Ã£o de gaps",
        "Mini cursos prÃ¡ticos de como usar a ferramenta",
        "ExportaÃ§Ã£o de relatÃ³rios em PDF e XLSX",
        "IntegraÃ§Ã£o direta com Meta Ads e Google Ads",
        "Pipeline de 7 camadas de inteligÃªncia artificial",
        "Copy de anÃºncios gerado por IA",
      ],
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "127", "bestRating": "5" },
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "O que Ã© o MECPro?", "acceptedAnswer": { "@type": "Answer", "text": "MECPro Ã© a plataforma lÃ­der em geraÃ§Ã£o de campanhas com IA. Em minutos vocÃª analisa concorrentes, mapeia o perfil do cliente, cruza dados de mercado e recebe a campanha completa â€” copy, ad sets, orÃ§amento e funil â€” pronta para rodar no Meta e Google Ads." } },
        { "@type": "Question", "name": "Preciso de cartÃ£o de crÃ©dito para comeÃ§ar?", "acceptedAnswer": { "@type": "Answer", "text": "NÃ£o! O MECPro oferece plano gratuito. Crie sua conta em menos de 2 minutos sem informar dados de pagamento." } },
        { "@type": "Question", "name": "O MECPro tem cursos sobre como usar a ferramenta?", "acceptedAnswer": { "@type": "Answer", "text": "Sim! A MECPro Academy oferece mini cursos prÃ¡ticos ensinando como montar campanhas usando a plataforma â€” do zero ao avanÃ§ado. Os cursos incluem anÃ¡lise de concorrentes, geraÃ§Ã£o de copy com IA, criaÃ§Ã£o de funis e muito mais." } },
        { "@type": "Question", "name": "Quanto custa o MECPro?", "acceptedAnswer": { "@type": "Answer", "text": "O MECPro oferece: Plano Basic (R$97/mÃªs), Premium (R$197/mÃªs) e VIP (R$397/mÃªs). HÃ¡ tambÃ©m plano gratuito." } },
        { "@type": "Question", "name": "O MECPro integra com Meta Ads e Google Ads?", "acceptedAnswer": { "@type": "Answer", "text": "Sim! IntegraÃ§Ã£o nativa com Meta Ads e Google Ads â€” publique campanhas sem copiar e colar." } },
      ],
    },
    {
      "@type": "ItemList",
      "name": "Mini Cursos MECPro Academy",
      "description": "Mini cursos prÃ¡ticos de como montar campanhas usando o MECPro",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Campanha do Zero com MECPro", "url": "https://mecpro-ai.onrender.com/courses/campanha-zero-mecpro" },
        { "@type": "ListItem", "position": 2, "name": "AnÃ¡lise de Concorrentes com IA", "url": "https://mecpro-ai.onrender.com/courses/analise-concorrentes-ia" },
        { "@type": "ListItem", "position": 3, "name": "Copy com IA â€” Guia PrÃ¡tico", "url": "https://mecpro-ai.onrender.com/courses/copy-ia-guia-pratico" },
        { "@type": "ListItem", "position": 4, "name": "Meta Ads do Zero ao AvanÃ§ado", "url": "https://mecpro-ai.onrender.com/courses/marketing-meta-ads" },
      ],
    },
  ],
};

// â”€â”€ Mini Cursos destacados na Landing â”€â”€
const MINI_COURSES = [
  {
    slug: "campanha-zero-mecpro",
    icon: "ðŸš€",
    tag: "GRATUITO",
    tagColor: "#16a34a",
    title: "Campanha do Zero com MECPro",
    desc: "Aprenda a criar sua primeira campanha completa usando a plataforma â€” passo a passo em 45 minutos.",
    duration: "45 min",
    lessons: 6,
    level: "Iniciante",
    highlight: true,
  },
  {
    slug: "analise-concorrentes-ia",
    icon: "ðŸ”",
    tag: "PRO",
    tagColor: "#7c3aed",
    title: "AnÃ¡lise de Concorrentes com IA",
    desc: "Domine o mÃ³dulo de concorrentes do MECPro e extraia insights que nenhum concorrente sabe que vocÃª tem.",
    duration: "6h 15min",
    lessons: 24,
    level: "IntermediÃ¡rio",
    highlight: false,
  },
  {
    slug: "copy-ia-guia-pratico",
    icon: "âœï¸",
    tag: "GRATUITO",
    tagColor: "#16a34a",
    title: "Copy com IA â€” Guia PrÃ¡tico",
    desc: "Como usar o gerador de copy do MECPro para criar anÃºncios que convertem â€” com exemplos reais.",
    duration: "1h 20min",
    lessons: 8,
    level: "Iniciante",
    highlight: false,
  },
  {
    slug: "marketing-meta-ads",
    icon: "ðŸ“˜",
    tag: "PRO",
    tagColor: "#7c3aed",
    title: "Meta Ads do Zero ao AvanÃ§ado",
    desc: "Campanha, pÃºblico, criativo e orÃ§amento â€” tudo dentro do MECPro conectado ao Meta Ads.",
    duration: "12h 30min",
    lessons: 48,
    level: "Completo",
    highlight: false,
  },
  {
    slug: "estrategia-ecommerce",
    icon: "ðŸ›’",
    tag: "PRO",
    tagColor: "#7c3aed",
    title: "EstratÃ©gia para E-commerce",
    desc: "Use o MECPro para escalar sua loja com trÃ¡fego pago, remarketing e funil de vendas automatizado.",
    duration: "10h 20min",
    lessons: 42,
    level: "AvanÃ§ado",
    highlight: false,
  },
  {
    slug: "relatorios-e-metricas",
    icon: "ðŸ“Š",
    tag: "GRATUITO",
    tagColor: "#16a34a",
    title: "RelatÃ³rios e MÃ©tricas que Importam",
    desc: "Exporte relatÃ³rios PDF/XLSX pelo MECPro e saiba quais KPIs realmente impactam seus resultados.",
    duration: "4h 30min",
    lessons: 18,
    level: "Iniciante",
    highlight: false,
  },
];


const WA_NUMBER = "554799465824";
const WA_MSG = encodeURIComponent("OlÃ¡! Tenho interesse no MECPro. Pode me ajudar? ðŸ˜Š");

function WAButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div style={{
          position: "fixed", bottom: 88, right: 20, zIndex: 9999,
          width: 286, background: "white", borderRadius: 16,
          boxShadow: "0 8px 36px rgba(0,0,0,.18)", padding: "18px 16px",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#25d366,#128c7e)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 32 32" fill="white">
                  <path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/>
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "#111" }}>Michel Leal</p>
                <p style={{ margin: 0, fontSize: 11, color: "#25d366", fontWeight: 600 }}>â— Gerente de Relacionamento</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: "2px 6px" }}>Ã—</button>
          </div>
          {/* BalÃ£o */}
          <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 13px", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
              ðŸ‘‹ OlÃ¡! Posso ajudar com dÃºvidas sobre o <strong>MECPro</strong> ou nossos planos. Fale comigo agora!
            </p>
          </div>
          {/* CTA */}
          <a
            href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(135deg,#25d366,#128c7e)", color: "white",
              borderRadius: 10, padding: "11px 16px", fontWeight: 800, fontSize: 13,
              textDecoration: "none", boxShadow: "0 4px 14px rgba(37,211,102,.4)",
            }}>
            <svg width="17" height="17" viewBox="0 0 32 32" fill="white">
              <path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z"/>
            </svg>
            Chamar no WhatsApp
          </a>
          <p style={{ margin: "10px 0 0", fontSize: 10, color: "#9ca3af", textAlign: "center" }}>
            (47) 99465-824 Â· Segâ€“Sex, 9hâ€“18h
          </p>
        </div>
      )}

      {/* BotÃ£o flutuante */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Falar no WhatsApp"
        style={{
          position: "fixed", bottom: 22, right: 22, zIndex: 9999,
          width: 58, height: 58, borderRadius: "50%", border: "none", cursor: "pointer",
          background: "linear-gradient(135deg,#25d366,#128c7e)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(37,211,102,.55)",
          transform: open ? "scale(1.08)" : "scale(1)",
          transition: "transform .2s, box-shadow .2s",
        }}>
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M16 2C8.268 2 2 8.268 2 16c0 2.428.651 4.704 1.788 6.668L2 30l7.54-1.764A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2z" fill="white"/>
            <path d="M21.5 19.3c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-1.75-.87-2.9-1.56-4.06-3.53-.3-.53.3-.49.87-1.63.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.91-2.19-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.57-.09 1.75-.72 2-1.41.24-.7.24-1.3.17-1.42-.07-.12-.27-.19-.57-.34z" fill="#128c7e"/>
          </svg>
        )}
      </button>
    </>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();

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

      <div style={{ fontFamily: "var(--font-body)", background: "var(--white)" }}>

        {/* â”€â”€ NAV â”€â”€ */}
        <nav style={{ position:"sticky",top:0,zIndex:100,height:60,background:"rgba(255,255,255,.95)",backdropFilter:"blur(16px)",borderBottom:"1px solid var(--border)" }}>
          <div style={{ maxWidth:1080,margin:"0 auto",padding:"0 32px",height:"100%",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <a href="/" aria-label="MECPro â€” pÃ¡gina inicial" style={{ textDecoration:"none", display:"flex", alignItems:"center" }}>
              <img src="/logo.png" alt="MECPro" height={38} style={{ display:"block" }} />
            </a>
            <nav aria-label="Menu principal" style={{ display:"flex",gap:24 }}>
              {[
                {label:"Plataforma", href:"/#recursos"},
                {label:"Academy", href:"/courses"},
                {label:"PreÃ§os", href:"/pricing"},
                {label:"FAQ", href:"/faq"},
              ].map(l=>(
                <a key={l.label} href={l.href} style={{ fontSize:14,color:"var(--muted)",textDecoration:"none",fontWeight:500 }}>{l.label}</a>
              ))}
            </nav>
            <div style={{ display:"flex",gap:8,alignItems:"center" }}>
              <button className="btn btn-md btn-ghost" onClick={()=>setLocation("/login")}>Entrar</button>
              <button className="btn btn-md btn-primary" onClick={()=>setLocation("/register")}>ComeÃ§ar grÃ¡tis</button>
            </div>
          </div>
        </nav>

        {/* â”€â”€ HERO â”€â”€ */}
        <header style={{ padding:"96px 32px 80px",textAlign:"center",maxWidth:1080,margin:"0 auto" }}>
          <div className="badge badge-green animate-fade-up" style={{ marginBottom:28 }}>
            <span style={{ width:6,height:6,borderRadius:"50%",background:"var(--green)",display:"inline-block",marginRight:8 }} />
            Plataforma #1 em GeraÃ§Ã£o de Campanhas com IA
          </div>
          <h1 className="animate-fade-up" style={{ fontSize:"clamp(42px,5.5vw,68px)",fontWeight:800,letterSpacing:-2,marginBottom:22,animationDelay:".1s",lineHeight:1.1 }}>
            Gere campanhas completas<br /><span style={{ color:"var(--green-d)" }}>em minutos com IA</span>
          </h1>
          <p className="animate-fade-up" style={{ fontSize:18,fontWeight:300,color:"var(--muted)",maxWidth:560,margin:"0 auto 40px",lineHeight:1.75,animationDelay:".2s" }}>
            Cruze dados do cliente, concorrentes e mercado. A IA cria a campanha completa â€” copy, ad sets, orÃ§amento e funil. Prontos para rodar.
          </p>
          <div className="animate-fade-up" style={{ display:"flex",gap:10,justifyContent:"center",marginBottom:14,animationDelay:".3s",flexWrap:"wrap" }}>
            <button className="btn btn-lg btn-primary" onClick={()=>setLocation("/register")}>Criar conta grÃ¡tis</button>
            <button className="btn btn-lg btn-outline" onClick={()=>setLocation("/courses")}>Ver Academy grÃ¡tis â†’</button>
          </div>
          <p style={{ fontSize:13,color:"#adb5bd" }}>Sem cartÃ£o de crÃ©dito Â· Plano gratuito para sempre Â· Mini cursos inclusos</p>
        </header>

        {/* â”€â”€ TRUST STRIP â”€â”€ */}
        <div role="complementary" aria-label="Segmentos atendidos" style={{ background:"var(--off)",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"18px 0" }}>
          <div style={{ maxWidth:1080,margin:"0 auto",padding:"0 32px",display:"flex",alignItems:"center",gap:32,flexWrap:"wrap" }}>
            <span style={{ fontSize:12,fontWeight:500,color:"#adb5bd",textTransform:"uppercase",letterSpacing:".8px",whiteSpace:"nowrap" }}>Usado por</span>
            <div style={{ width:1,height:20,background:"var(--border2)" }} />
            {["AgÃªncias","E-commerce","SaaS","Consultorias","Freelancers"].map(l=>(
              <span key={l} style={{ fontSize:14,fontWeight:600,color:"#ced4da",fontFamily:"var(--font-display)" }}>{l}</span>
            ))}
          </div>
        </div>

        {/* â”€â”€ STATS â”€â”€ */}
        <section aria-labelledby="stats-heading" style={{ background:"var(--black)",padding:"52px 32px" }}>
          <h2 id="stats-heading" style={{ display:"none" }}>NÃºmeros do MECPro</h2>
          <div style={{ maxWidth:1080,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:32,textAlign:"center" }}>
            {[
              {v:"500+",l:"AgÃªncias ativas"},
              {v:"10.000+",l:"Campanhas geradas"},
              {v:"7 camadas",l:"Pipeline de IA"},
              {v:"99,9%",l:"Uptime garantido"},
            ].map(s=>(
              <div key={s.v}>
                <div style={{ fontSize:36,fontWeight:800,color:"var(--green)",fontFamily:"var(--font-display)",letterSpacing:-1 }}>{s.v}</div>
                <div style={{ fontSize:13,color:"#6b7280",marginTop:6 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* â”€â”€ FEATURES / PLATAFORMA â”€â”€ */}
        <section id="recursos" aria-labelledby="features-heading" style={{ maxWidth:1080,margin:"0 auto",padding:"88px 32px" }}>
          <div style={{ marginBottom:52 }}>
            <div className="badge badge-green" style={{ marginBottom:14 }}>Plataforma de geraÃ§Ã£o de campanhas</div>
            <h2 id="features-heading" style={{ fontSize:"clamp(30px,3.5vw,42px)",marginBottom:14 }}>4 mÃ³dulos. 1 campanha pronta.</h2>
            <p style={{ fontSize:16,fontWeight:300,color:"var(--muted)",maxWidth:500,lineHeight:1.7 }}>Cada mÃ³dulo alimenta o prÃ³ximo. A IA pensa a campanha por vocÃª.</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:"var(--border)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden" }}>
            {[
              {n:"01",icon:"ðŸŽ¯",t:"Perfil do Cliente",d:"Mapeie dores, desejos, objeÃ§Ãµes e proposta de valor com profundidade estratÃ©gica. A base da campanha ideal."},
              {n:"02",icon:"ðŸ”",t:"AnÃ¡lise de Concorrentes",d:"Monitore anÃºncios ativos via Meta Ads Library. Extraia copy, criativos e estratÃ©gias dos concorrentes em tempo real."},
              {n:"03",icon:"ðŸ“Š",t:"InteligÃªncia de Mercado",d:"A IA cruza todos os dados e revela gaps, oportunidades e o posicionamento ideal para vencer."},
              {n:"04",icon:"ðŸš€",t:"Campanha AutomÃ¡tica",d:"Gere estrutura completa: ad sets, copy, orÃ§amento sugerido e funil de conversÃ£o prontos para rodar."},
              {n:"05",icon:"ðŸ“„",t:"ExportaÃ§Ã£o PDF & XLSX",d:"RelatÃ³rios profissionais para apresentar a clientes ou implementar diretamente na plataforma de anÃºncios."},
              {n:"06",icon:"âš¡",t:"Meta & Google Ads",d:"IntegraÃ§Ã£o nativa. Conecte suas contas e publique campanhas direto do MECPro, sem copiar e colar."},
            ].map(f=>(
              <article key={f.n} style={{ background:"white",padding:"28px 26px",transition:"background .2s",cursor:"default" }}
                onMouseEnter={e=>(e.currentTarget.style.background="var(--off)")}
                onMouseLeave={e=>(e.currentTarget.style.background="white")}>
                <div style={{ fontSize:24,marginBottom:10 }}>{f.icon}</div>
                <div style={{ fontSize:11,fontWeight:700,color:"var(--green)",letterSpacing:1,marginBottom:8 }}>{f.n}</div>
                <h3 style={{ fontSize:16,fontWeight:700,color:"var(--black)",marginBottom:8,fontFamily:"var(--font-display)" }}>{f.t}</h3>
                <p style={{ fontSize:13.5,color:"var(--muted)",lineHeight:1.65,margin:0 }}>{f.d}</p>
              </article>
            ))}
          </div>
        </section>

        {/* â”€â”€ COMO FUNCIONA â”€â”€ */}
        <section id="como-funciona" aria-labelledby="how-heading" style={{ background:"var(--off)",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"88px 32px" }}>
          <div style={{ maxWidth:1080,margin:"0 auto" }}>
            <div style={{ marginBottom:52,textAlign:"center" }}>
              <div className="badge badge-green" style={{ marginBottom:14 }}>Como funciona</div>
              <h2 id="how-heading" style={{ fontSize:"clamp(30px,3.5vw,42px)",marginBottom:14 }}>3 passos. Campanha pronta.</h2>
              <p style={{ fontSize:16,fontWeight:300,color:"var(--muted)",lineHeight:1.7 }}>Simples, rÃ¡pido e poderoso.</p>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:32 }}>
              {[
                {step:"1",icon:"ðŸŽ¯",t:"Preencha o perfil do cliente",d:"Informe segmento, pÃºblico, proposta de valor e objetivos. O MECPro organiza tudo estrategicamente."},
                {step:"2",icon:"ðŸ”",t:"IA analisa o mercado e concorrentes",d:"Pipeline de 7 camadas coleta dados reais de anÃºncios, estratÃ©gias e copies da concorrÃªncia automaticamente."},
                {step:"3",icon:"ðŸš€",t:"Receba a campanha pronta",d:"Copy, ad sets, orÃ§amento e funil de conversÃ£o gerados e prontos para rodar no Meta Ads e Google Ads."},
              ].map(s=>(
                <div key={s.step} style={{ background:"white",borderRadius:16,padding:"32px 28px",border:"1px solid var(--border)" }}>
                  <div style={{ fontSize:28,marginBottom:14 }}>{s.icon}</div>
                  <div style={{ width:32,height:32,borderRadius:"50%",background:"var(--green-d)",color:"white",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,marginBottom:16 }}>{s.step}</div>
                  <h3 style={{ fontSize:17,fontWeight:700,color:"var(--black)",marginBottom:10 }}>{s.t}</h3>
                  <p style={{ fontSize:14,color:"var(--muted)",lineHeight:1.65,margin:0 }}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            MINI CURSOS â€” ACADEMY SECTION
        â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <section id="academy" aria-labelledby="academy-heading" style={{ maxWidth:1080,margin:"0 auto",padding:"88px 32px" }}>
          <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:52,flexWrap:"wrap",gap:20 }}>
            <div>
              <div className="badge badge-green" style={{ marginBottom:14 }}>MECPro Academy</div>
              <h2 id="academy-heading" style={{ fontSize:"clamp(28px,3.5vw,42px)",marginBottom:12 }}>
                Aprenda a criar campanhas<br />usando a ferramenta
              </h2>
              <p style={{ fontSize:16,fontWeight:300,color:"var(--muted)",maxWidth:500,lineHeight:1.7,margin:0 }}>
                Mini cursos prÃ¡ticos que ensinam como montar campanhas completas com o MECPro â€”
                do perfil do cliente atÃ© publicar no Meta e Google Ads.
              </p>
            </div>
            <a href="/courses" style={{ fontSize:14,color:"var(--green-d)",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap",border:"1.5px solid var(--green-d)",padding:"10px 22px",borderRadius:10 }}>
              Ver todos os cursos â†’
            </a>
          </div>

          {/* Featured course â€” full width */}
          {MINI_COURSES.filter(c=>c.highlight).map(c=>(
            <div key={c.slug}
              onClick={()=>setLocation(`/courses/${c.slug}`)}
              style={{ background:"linear-gradient(135deg,#052e16 0%,#14532d 100%)",borderRadius:20,padding:"40px 48px",marginBottom:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:32,flexWrap:"wrap",border:"1px solid #16a34a" }}>
              <div>
                <div style={{ display:"flex",gap:10,marginBottom:14,alignItems:"center" }}>
                  <span style={{ fontSize:28 }}>{c.icon}</span>
                  <span style={{ background:c.tagColor,color:"white",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:99,letterSpacing:.5 }}>{c.tag}</span>
                  <span style={{ background:"rgba(255,255,255,.1)",color:"white",fontSize:11,padding:"3px 10px",borderRadius:99 }}>â­ Destaque</span>
                </div>
                <h3 style={{ fontSize:24,fontWeight:800,color:"white",marginBottom:10,fontFamily:"var(--font-display)" }}>{c.title}</h3>
                <p style={{ fontSize:15,color:"#86efac",lineHeight:1.65,maxWidth:500,margin:"0 0 20px" }}>{c.desc}</p>
                <div style={{ display:"flex",gap:20,flexWrap:"wrap" }}>
                  {[
                    {icon:"â±",v:c.duration},
                    {icon:"ðŸ“š",v:`${c.lessons} aulas`},
                    {icon:"ðŸŽ“",v:c.level},
                  ].map(m=>(
                    <span key={m.v} style={{ fontSize:13,color:"#4ade80",display:"flex",alignItems:"center",gap:5 }}>
                      {m.icon} {m.v}
                    </span>
                  ))}
                </div>
              </div>
              <button className="btn btn-lg" style={{ background:"white",color:"#14532d",fontWeight:800,borderRadius:12,whiteSpace:"nowrap",flexShrink:0 }}>
                ComeÃ§ar agora grÃ¡tis â†’
              </button>
            </div>
          ))}

          {/* Grid of remaining courses */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:20 }}>
            {MINI_COURSES.filter(c=>!c.highlight).map(c=>(
              <article key={c.slug}
                onClick={()=>setLocation(`/courses/${c.slug}`)}
                style={{ background:"white",border:"1px solid var(--border)",borderRadius:16,padding:"24px",cursor:"pointer",transition:"box-shadow .2s,transform .2s" }}
                onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.08)"; e.currentTarget.style.transform="translateY(-2px)"; }}
                onMouseLeave={e=>{ e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="none"; }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14 }}>
                  <span style={{ fontSize:28 }}>{c.icon}</span>
                  <span style={{ background:c.tagColor,color:"white",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:99,letterSpacing:.5 }}>{c.tag}</span>
                </div>
                <h3 style={{ fontSize:15,fontWeight:700,color:"var(--black)",marginBottom:8,lineHeight:1.4 }}>{c.title}</h3>
                <p style={{ fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:16 }}>{c.desc}</p>
                <div style={{ display:"flex",gap:14,borderTop:"1px solid var(--border)",paddingTop:14 }}>
                  {[
                    {icon:"â±",v:c.duration},
                    {icon:"ðŸ“š",v:`${c.lessons} aulas`},
                    {icon:"ðŸŽ“",v:c.level},
                  ].map(m=>(
                    <span key={m.v} style={{ fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:4 }}>
                      {m.icon} {m.v}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div style={{ textAlign:"center",marginTop:36 }}>
            <button className="btn btn-lg btn-outline" onClick={()=>setLocation("/courses")}>
              Ver todos os cursos da Academy â†’
            </button>
          </div>
        </section>

        {/* â”€â”€ PRICING â”€â”€ */}
        <section aria-labelledby="pricing-heading" style={{ background:"var(--off)",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"88px 32px" }}>
          <div style={{ maxWidth:1080,margin:"0 auto" }}>
            <div style={{ marginBottom:52 }}>
              <div className="badge badge-green" style={{ marginBottom:14 }}>PreÃ§os</div>
              <h2 id="pricing-heading" style={{ fontSize:"clamp(30px,3.5vw,42px)",marginBottom:14 }}>Simples e sem surpresa</h2>
              <p style={{ fontSize:16,fontWeight:300,color:"var(--muted)",lineHeight:1.7 }}>Comece grÃ¡tis. Escale quando precisar. Academy inclusa em todos os planos.</p>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16 }}>
              {[
                {tier:"Basic",price:"97",cadence:"por mÃªs",features:["3 projetos","5 concorrentes/projeto","10 campanhas/mÃªs","Academy gratuita","Suporte por e-mail"],cta:"Assinar Basic",style:"outline",pop:false},
                {tier:"Premium",price:"197",cadence:"por mÃªs",pop:true,features:["10 projetos","Concorrentes ilimitados","Campanhas ilimitadas","Academy completa + certificados","RelatÃ³rios PDF","Suporte prioritÃ¡rio"],cta:"Assinar Premium",style:"green"},
                {tier:"VIP",price:"397",cadence:"por mÃªs",features:["Projetos ilimitados","Tudo do Premium","Academy VIP + mentoria","API access","Manager dedicado","Onboarding personalizado"],cta:"Assinar VIP",style:"dark",pop:false},
              ].map(plan=>(
                <article key={plan.tier} style={{ background:"white",border:`1.5px solid ${plan.pop?"var(--green)":"var(--border)"}`,borderRadius:18,padding:28,position:"relative",boxShadow:plan.pop?"0 0 0 4px rgba(34,197,94,.07)":"none" }}>
                  {plan.pop&&<div style={{ position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",background:"var(--green-d)",color:"white",fontSize:10.5,fontWeight:700,padding:"3px 14px",borderRadius:99,whiteSpace:"nowrap" }}>Mais popular</div>}
                  <h3 style={{ fontSize:12,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".7px",marginBottom:10 }}>{plan.tier}</h3>
                  <div style={{ fontFamily:"var(--font-display)",fontSize:42,fontWeight:800,color:"var(--black)",letterSpacing:-1,lineHeight:1 }}>
                    <sup style={{ fontSize:18,verticalAlign:"top",marginTop:7 }}>R$</sup>{plan.price}
                  </div>
                  <div style={{ fontSize:13,color:"var(--muted)",marginBottom:22,marginTop:4 }}>{plan.cadence}</div>
                  <div style={{ height:1,background:"var(--border)",margin:"18px 0" }} />
                  {plan.features.map(f=><div key={f} style={{ display:"flex",gap:8,fontSize:13.5,color:"var(--body)",marginBottom:9 }}><span style={{ color:"var(--green)",fontWeight:700 }}>âœ“</span>{f}</div>)}
                  <button className={`btn btn-full btn-lg ${plan.style==="green"?"btn-green":plan.style==="dark"?"btn-primary":"btn-outline"}`} style={{ marginTop:22 }} onClick={()=>setLocation("/register")}>{plan.cta}</button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* â”€â”€ FAQ ACCORDION â”€â”€ */}
        <section aria-labelledby="faq-heading" style={{ padding:"72px 32px" }}>
          <div style={{ maxWidth:720,margin:"0 auto" }}>
            <div style={{ textAlign:"center",marginBottom:40 }}>
              <div className="badge badge-green" style={{ marginBottom:14 }}>FAQ</div>
              <h2 id="faq-heading" style={{ fontSize:"clamp(26px,3vw,36px)",marginBottom:10 }}>Perguntas frequentes</h2>
            </div>
            {[
              {q:"O MECPro Ã© uma plataforma de geraÃ§Ã£o de campanhas ou de cursos?",a:"As duas coisas! O MECPro Ã© primariamente uma plataforma de geraÃ§Ã£o de campanhas com IA â€” vocÃª entra com os dados do cliente e sai com a campanha pronta. Mas tambÃ©m oferece a Academy com mini cursos prÃ¡ticos ensinando como usar cada mÃ³dulo da ferramenta, para vocÃª extrair o mÃ¡ximo da plataforma."},
              {q:"Os mini cursos ensinam como usar o MECPro especificamente?",a:"Sim! Cada mini curso foca em um aspecto da ferramenta: como montar o perfil do cliente, como usar o mÃ³dulo de anÃ¡lise de concorrentes, como gerar copies com IA, como exportar relatÃ³rios e muito mais. Ã‰ o manual vivo da plataforma."},
              {q:"Preciso saber programar para usar o MECPro?",a:"NÃ£o! O MECPro foi criado para profissionais de marketing. Interface simples, intuitiva e sem cÃ³digo. Os mini cursos ainda tornam tudo mais fÃ¡cil."},
              {q:"Funciona para qualquer nicho de mercado?",a:"Sim! O MECPro Ã© usado por agÃªncias, e-commerces, SaaS, consultorias e freelancers em todos os segmentos. A IA adapta a anÃ¡lise e as campanhas para o contexto especÃ­fico do seu cliente."},
              {q:"Posso cancelar quando quiser?",a:"Sim, sem fidelidade. Cancele a qualquer momento direto no painel, sem burocracia e sem multa."},
            ].map((item,i)=>(
              <details key={i} style={{ borderBottom:"1px solid var(--border)",padding:"18px 0" }}>
                <summary style={{ fontWeight:600,fontSize:15,cursor:"pointer",color:"var(--black)",listStyle:"none",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12 }}>
                  {item.q}
                  <span style={{ fontSize:20,color:"var(--green)",fontWeight:300,flexShrink:0 }}>+</span>
                </summary>
                <p style={{ marginTop:12,fontSize:14,color:"var(--muted)",lineHeight:1.7,marginBottom:0 }}>{item.a}</p>
              </details>
            ))}
            <div style={{ textAlign:"center",marginTop:28 }}>
              <a href="/faq" style={{ fontSize:14,color:"var(--green-d)",fontWeight:600,textDecoration:"none" }}>Ver todas as perguntas â†’</a>
            </div>
          </div>
        </section>

        {/* â”€â”€ CTA FINAL â”€â”€ */}
        <section style={{ padding:"0 32px 80px" }}>
          <div style={{ background:"var(--black)",borderRadius:24,maxWidth:1080,margin:"0 auto",padding:"72px 48px",textAlign:"center" }}>
            <h2 style={{ color:"white",fontSize:"clamp(28px,3.5vw,44px)",marginBottom:14 }}>Pronto para gerar sua<br />primeira campanha com IA?</h2>
            <p style={{ fontSize:16,color:"#6b7280",marginBottom:12 }}>Comece grÃ¡tis em menos de 2 minutos. Sem cartÃ£o.</p>
            <p style={{ fontSize:14,color:"#374151",marginBottom:36 }}>âœ“ Academy gratuita inclusa &nbsp;Â·&nbsp; âœ“ Mini cursos prÃ¡ticos &nbsp;Â·&nbsp; âœ“ Campanha pronta em minutos</p>
            <div style={{ display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap" }}>
              <button className="btn btn-lg" style={{ background:"white",color:"var(--black)",fontWeight:700,borderRadius:10 }} onClick={()=>setLocation("/register")}>Criar conta grÃ¡tis â†’</button>
              <button className="btn btn-lg btn-outline" style={{ borderColor:"#374151",color:"#9ca3af" }} onClick={()=>setLocation("/courses")}>Explorar a Academy</button>
            </div>
          </div>
        </section>

        {/* â”€â”€ FOOTER â”€â”€ */}
        <footer style={{ borderTop:"1px solid var(--border)",padding:"32px 32px" }}>
          <div style={{ maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:20 }}>
            <a href="/" aria-label="MECPro" style={{ textDecoration:"none", display:"flex", alignItems:"center" }}>
              <img src="/logo.png" alt="MECPro" height={32} style={{ display:"block" }} />
            </a>
            <nav aria-label="Links do rodapÃ©" style={{ display:"flex",gap:20,flexWrap:"wrap" }}>
              {[
                {label:"Plataforma", href:"/#recursos"},
                {label:"Academy", href:"/courses"},
                {label:"PreÃ§os", href:"/pricing"},
                {label:"FAQ", href:"/faq"},
                {label:"Termos", href:"/terms"},
                {label:"Privacidade", href:"/privacy"},
                {label:"Contato", href:"/contact"},
              ].map(l=>(
                <a key={l.label} href={l.href} style={{ fontSize:13,color:"var(--muted)",textDecoration:"none" }}>{l.label}</a>
              ))}
              {/* Redes sociais */}
              <div style={{ display:"flex", gap:16, marginTop:12 }}>
                {[
                  { icon:"📸", label:"Instagram", href:"https://instagram.com/mecproai" },
                  { icon:"📘", label:"Facebook",  href:"https://facebook.com/mecproai" },
                  { icon:"🎵", label:"TikTok",    href:"https://tiktok.com/@mecproaibrl" },
                ].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
                    style={{ fontSize:13, color:"var(--muted)", textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}>
                    <span>{s.icon}</span><span>{s.label}</span>
                  </a>
                ))}
              </div>
              {/* FIM redes — remover este comentário e o fechamento abaixo se causar erro */
              ))}
            </nav>
            <span style={{ fontSize:12,color:"#adb5bd" }}>Â© 2026 MECPro</span>
          </div>
        </footer>
      </div>
      <WAButton />
    </>
  );
}


