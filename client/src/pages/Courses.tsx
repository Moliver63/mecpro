import BackButton from "@/components/BackButton";
import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import SEO, { SEO_CONFIGS } from "@/components/SEO";

const MOCK_COURSES = [
  {
    id: "1", slug: "campanha-zero-mecpro",
    title: "Campanha do Zero com MECPro",
    desc: "Aprenda a criar sua primeira campanha completa usando a plataforma — passo a passo em 45 minutos. Do perfil do cliente à publicação no Meta Ads.",
    instructor: "Equipe MECPro", duration: "45 min", lessons: 6, category: "MECPro Essentials",
    level: "Iniciante", rating: 4.9, students: 2140, thumb: "🚀",
    tags: ["MECPro", "Campanha", "Iniciante", "IA"],
    price: 0, isPro: false,
    badge: "NOVO",
  },
  {
    id: "2", slug: "analise-concorrentes-ia",
    title: "Análise de Concorrentes com IA",
    desc: "Domine o módulo de concorrentes do MECPro. Pipeline de 7 camadas, Meta Ads Library, extração de insights e estratégias.",
    instructor: "Equipe MECPro", duration: "6h 15min", lessons: 24, category: "IA & Marketing",
    level: "Intermediário", rating: 4.9, students: 856, thumb: "🔍",
    tags: ["IA", "Análise Competitiva", "Meta Ads Library", "MECPro"],
    price: 0, isPro: true,
    badge: "DESTAQUE",
  },
  {
    id: "3", slug: "copy-ia-guia-pratico",
    title: "Copy com IA — Guia Prático",
    desc: "Como usar o gerador de copy do MECPro para criar anúncios que convertem. Frameworks, exemplos reais e templates prontos.",
    instructor: "Equipe MECPro", duration: "1h 20min", lessons: 8, category: "MECPro Essentials",
    level: "Iniciante", rating: 4.8, students: 1560, thumb: "✍️",
    tags: ["Copy", "IA", "Anúncios", "MECPro"],
    price: 0, isPro: false,
    badge: "",
  },
  {
    id: "4", slug: "marketing-meta-ads",
    title: "Meta Ads do Zero ao Avançado",
    desc: "Aprenda a criar e gerenciar campanhas de alto desempenho no Facebook e Instagram Ads usando o MECPro como base.",
    instructor: "Equipe MECPro", duration: "12h 30min", lessons: 48, category: "Tráfego Pago",
    level: "Iniciante", rating: 4.8, students: 1240, thumb: "📘",
    tags: ["Meta Ads", "Facebook", "Instagram", "MECPro"],
    price: 0, isPro: true,
    badge: "",
  },
  {
    id: "5", slug: "copywriting-conversao",
    title: "Copywriting de Alta Conversão",
    desc: "Escreva textos que vendem. Aprenda frameworks de copy para anúncios, landing pages e e-mails integrados ao MECPro.",
    instructor: "Equipe MECPro", duration: "8h 45min", lessons: 36, category: "Copy & Conteúdo",
    level: "Intermediário", rating: 4.7, students: 1890, thumb: "✍️",
    tags: ["Copy", "Vendas", "Landing Page", "MECPro"],
    price: 0, isPro: true,
    badge: "",
  },
  {
    id: "6", slug: "estrategia-ecommerce",
    title: "Estratégia para E-commerce com MECPro",
    desc: "Escale seu e-commerce com estratégias de tráfego pago, remarketing e funil de vendas gerado pelo MECPro.",
    instructor: "Equipe MECPro", duration: "10h 20min", lessons: 42, category: "E-commerce",
    level: "Avançado", rating: 4.6, students: 643, thumb: "🛒",
    tags: ["E-commerce", "Remarketing", "Funil", "MECPro"],
    price: 0, isPro: true,
    badge: "",
  },
  {
    id: "7", slug: "google-ads-para-negocios",
    title: "Google Ads para Negócios Locais",
    desc: "Atraia clientes da sua região com campanhas otimizadas no Google Search e Display, geradas e monitoradas pelo MECPro.",
    instructor: "Equipe MECPro", duration: "7h 10min", lessons: 30, category: "Tráfego Pago",
    level: "Iniciante", rating: 4.5, students: 978, thumb: "🟢",
    tags: ["Google Ads", "Negócios Locais", "MECPro"],
    price: 0, isPro: false,
    badge: "",
  },
  {
    id: "8", slug: "relatorios-e-metricas",
    title: "Relatórios e Métricas que Importam",
    desc: "Aprenda a exportar relatórios profissionais pelo MECPro (PDF/XLSX) e interpretar os KPIs certos para cada cliente.",
    instructor: "Equipe MECPro", duration: "4h 30min", lessons: 18, category: "MECPro Essentials",
    level: "Iniciante", rating: 4.8, students: 1120, thumb: "📊",
    tags: ["Analytics", "KPIs", "Relatórios", "MECPro"],
    price: 0, isPro: false,
    badge: "",
  },
];

const CATEGORIES = ["Todos", "MECPro Essentials", "Tráfego Pago", "IA & Marketing", "Copy & Conteúdo", "E-commerce", "Analytics"];
const LEVELS = ["Todos os níveis", "Iniciante", "Intermediário", "Avançado"];

// JSON-LD para a página de cursos
const COURSES_JSONLD = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "MECPro Academy — Cursos de Marketing Digital",
  "description": "Mini cursos práticos de como criar campanhas usando o MECPro — análise de concorrentes, copy com IA, Meta Ads, Google Ads e muito mais.",
  "url": "https://mecpro-ai.onrender.com/courses",
  "numberOfItems": MOCK_COURSES.length,
  "itemListElement": MOCK_COURSES.map((c, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "item": {
      "@type": "Course",
      "name": c.title,
      "description": c.desc,
      "url": `https://mecpro-ai.onrender.com/courses/${c.slug}`,
      "provider": { "@type": "Organization", "name": "MECPro Academy", "url": "https://mecpro-ai.onrender.com" },
      "courseLevel": c.level,
      "inLanguage": "pt-BR",
      "isAccessibleForFree": !c.isPro,
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": c.rating.toString(), "reviewCount": "50", "bestRating": "5" },
    },
  })),
};

export default function Courses() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [level, setLevel] = useState("Todos os níveis");

  const filtered = MOCK_COURSES.filter(c => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.category.toLowerCase().includes(search.toLowerCase()) || c.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchCat = category === "Todos" || c.category === category;
    const matchLevel = level === "Todos os níveis" || c.level === level;
    return matchSearch && matchCat && matchLevel;
  });

  const freeCount = MOCK_COURSES.filter(c => !c.isPro).length;
  const totalLessons = MOCK_COURSES.reduce((a, c) => a + c.lessons, 0);

  return (
    <Layout>
      <BackButton to="/academy" label="Academia" style={{ marginBottom: 16 }} />
      <SEO
        title="MECPro Academy — Cursos Práticos de Campanha com IA"
        description={`${freeCount} cursos gratuitos + cursos PRO de como criar campanhas com o MECPro. Aprenda análise de concorrentes, copy com IA, Meta Ads, Google Ads e muito mais. ${totalLessons}+ aulas disponíveis.`}
        keywords="cursos MECPro, academy MECPro, mini cursos marketing digital, aprender campanha IA, curso meta ads, curso análise concorrentes, marketing digital gratuito"
        canonical="/courses"
        structuredData={COURSES_JSONLD}
      />

      {/* ── HERO DA ACADEMY ── */}
      <div style={{ background:"linear-gradient(135deg,#052e16 0%,#14532d 100%)",borderRadius:20,padding:"48px 40px",marginBottom:36,position:"relative",overflow:"hidden" }}>
        <div style={{ position:"absolute",right:-60,top:-60,width:300,height:300,borderRadius:"50%",background:"rgba(34,197,94,.08)" }} />
        <div style={{ position:"relative" }}>
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:"rgba(34,197,94,.15)",border:"1px solid #16a34a",borderRadius:99,padding:"4px 14px",marginBottom:16 }}>
            <span style={{ width:6,height:6,borderRadius:"50%",background:"#22c55e",display:"inline-block" }} />
            <span style={{ fontSize:12,color:"#86efac",fontWeight:600 }}>MECPro Academy</span>
          </div>
          <h1 style={{ fontSize:"clamp(24px,3vw,38px)",fontWeight:800,color:"white",marginBottom:12,letterSpacing:-.5 }}>
            Aprenda a criar campanhas<br />usando o MECPro
          </h1>
          <p style={{ fontSize:16,color:"#86efac",marginBottom:24,maxWidth:520,lineHeight:1.65 }}>
            Mini cursos práticos que ensinam como montar campanhas completas com a ferramenta — análise de concorrentes, copy com IA, Meta Ads, Google Ads e mais.
          </p>
          <div style={{ display:"flex",gap:24,flexWrap:"wrap" }}>
            {[
              {v:`${MOCK_COURSES.length}`,l:"Cursos disponíveis"},
              {v:`${totalLessons}+`,l:"Aulas"},
              {v:`${freeCount}`,l:"Gratuitos"},
              {v:"4.8★",l:"Avaliação média"},
            ].map(s=>(
              <div key={s.l}>
                <div style={{ fontSize:22,fontWeight:800,color:"white",fontFamily:"var(--font-display)" }}>{s.v}</div>
                <div style={{ fontSize:12,color:"#4ade80" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div style={{ display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",alignItems:"center" }}>
        <input
          type="search"
          placeholder="🔍  Buscar cursos..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
          style={{ flex:"1 1 220px",padding:"10px 16px",border:"1.5px solid var(--border)",borderRadius:10,fontSize:14,outline:"none",minWidth:200 }}
        />
        <select value={category} onChange={e=>setCategory(e.target.value)}
          style={{ padding:"10px 14px",border:"1.5px solid var(--border)",borderRadius:10,fontSize:14,background:"white",cursor:"pointer",minWidth:180 }}>
          {CATEGORIES.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={level} onChange={e=>setLevel(e.target.value)}
          style={{ padding:"10px 14px",border:"1.5px solid var(--border)",borderRadius:10,fontSize:14,background:"white",cursor:"pointer",minWidth:160 }}>
          {LEVELS.map(l=><option key={l}>{l}</option>)}
        </select>
        {(search || category !== "Todos" || level !== "Todos os níveis") && (
          <button onClick={()=>{setSearch("");setCategory("Todos");setLevel("Todos os níveis");}}
            style={{ padding:"10px 16px",border:"1.5px solid #fca5a5",borderRadius:10,background:"#fff1f2",color:"#dc2626",fontSize:13,cursor:"pointer",fontWeight:600 }}>
            ✕ Limpar
          </button>
        )}
        <span style={{ fontSize:13,color:"var(--muted)",marginLeft:"auto" }}>{filtered.length} curso{filtered.length!==1?"s":""} encontrado{filtered.length!==1?"s":""}</span>
      </div>

      {/* ── COURSES GRID ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:"center",padding:"60px 20px",color:"var(--muted)" }}>
          <div style={{ fontSize:48,marginBottom:12 }}>🎓</div>
          <div style={{ fontSize:16,fontWeight:600 }}>Nenhum curso encontrado</div>
          <div style={{ fontSize:14,marginTop:8 }}>Tente outra busca ou remova os filtros</div>
        </div>
      ) : (
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:20 }}>
          {filtered.map(course=>(
            <article key={course.id}
              onClick={()=>setLocation(`/courses/${course.slug}`)}
              style={{ background:"white",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden",cursor:"pointer",transition:"box-shadow .2s,transform .2s",display:"flex",flexDirection:"column" }}
              onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.1)"; e.currentTarget.style.transform="translateY(-3px)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="none"; }}>

              {/* Thumb */}
              <div style={{ background: course.isPro ? "linear-gradient(135deg,#1e1b4b,#312e81)" : "linear-gradient(135deg,#052e16,#14532d)",padding:"28px 24px",display:"flex",alignItems:"center",gap:14,position:"relative" }}>
                <span style={{ fontSize:36 }}>{course.thumb}</span>
                <div>
                  {course.badge && (
                    <span style={{ background:course.badge==="NOVO"?"#22c55e":"#f59e0b",color:"white",fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:99,letterSpacing:.5,display:"block",marginBottom:6 }}>{course.badge}</span>
                  )}
                  <div style={{ fontSize:11,color: course.isPro ? "#a5b4fc" : "#86efac",fontWeight:600 }}>{course.category}</div>
                </div>
                <span style={{ marginLeft:"auto",background: course.isPro ? "#7c3aed" : "#16a34a",color:"white",fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:99 }}>
                  {course.isPro ? "PRO" : "GRÁTIS"}
                </span>
              </div>

              {/* Content */}
              <div style={{ padding:"20px 20px",flex:1,display:"flex",flexDirection:"column" }}>
                <h3 style={{ fontSize:15,fontWeight:700,color:"var(--black)",marginBottom:8,lineHeight:1.4 }}>{course.title}</h3>
                <p style={{ fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:16,flex:1 }}>{course.desc}</p>

                {/* Meta */}
                <div style={{ display:"flex",gap:14,paddingTop:12,borderTop:"1px solid var(--border)",flexWrap:"wrap" }}>
                  {[
                    {icon:"⏱",v:course.duration},
                    {icon:"📚",v:`${course.lessons} aulas`},
                    {icon:"🎓",v:course.level},
                  ].map(m=>(
                    <span key={m.v} style={{ fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:4 }}>
                      {m.icon} {m.v}
                    </span>
                  ))}
                </div>

                {/* Rating + students */}
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ color:"#f59e0b",fontSize:13 }}>{"★".repeat(Math.round(course.rating))}</span>
                    <span style={{ fontSize:12,fontWeight:700,color:"var(--black)" }}>{course.rating}</span>
                    <span style={{ fontSize:12,color:"var(--muted)" }}>({course.students.toLocaleString("pt-BR")})</span>
                  </div>
                  <div style={{ fontSize:13,fontWeight:700,color: course.isPro ? "#7c3aed" : "#16a34a" }}>
                    {course.isPro ? "Acesso PRO" : "Gratuito"}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── ACADEMY CTA ── */}
      <div style={{ background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",border:"1px solid #bbf7d0",borderRadius:20,padding:"36px 40px",marginTop:48,display:"flex",alignItems:"center",justifyContent:"space-between",gap:24,flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:14,fontWeight:700,color:"#16a34a",marginBottom:8 }}>🎓 MECPro Academy</div>
          <h3 style={{ fontSize:20,fontWeight:800,color:"#14532d",marginBottom:8 }}>Acesso completo à Academy incluso no plano Premium e VIP</h3>
          <p style={{ fontSize:14,color:"#166534",margin:0,lineHeight:1.65 }}>Cursos, certificados, mentoria e acesso antecipado a novos conteúdos.</p>
        </div>
        <button className="btn btn-lg" style={{ background:"#16a34a",color:"white",fontWeight:700,borderRadius:12,whiteSpace:"nowrap" }}
          onClick={()=>setLocation("/register")}>
          Começar grátis →
        </button>
      </div>
    </Layout>
  );
}
