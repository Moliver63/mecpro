import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

// ─── CURSOS ─────────────────────────────────────────────────────────────────
const COURSES = [
  {
    id: 1, slug: "campanha-do-zero-com-mecpro",
    title: "Campanha do Zero com MECPro",
    description: "Crie uma campanha completa do zero usando todos os módulos: perfil do cliente, concorrentes, mercado e geração automática.",
    instructor: "Time MECPro", duration: "3h 20min", lessons: 12,
    level: "Iniciante", category: "Plataforma", rating: 4.9, students: 2140,
    isPro: false, badge: "GRATUITO", badgeColor: "#10b981", thumb: "◈",
    gradient: "135deg, #064e3b, #065f46",
    tags: ["campanha", "IA", "do zero"],
    highlights: ["Criação de perfil com IA", "Análise de concorrentes", "Exportação PDF"],
  },
  {
    id: 2, slug: "analise-de-concorrentes-ia",
    title: "Análise de Concorrentes com IA",
    description: "Domine a inteligência de concorrência para mapear forças, fraquezas e oportunidades com 7 camadas de análise.",
    instructor: "Time MECPro", duration: "6h 15min", lessons: 18,
    level: "Intermediário", category: "Inteligência", rating: 4.9, students: 856,
    isPro: true, badge: "PRO", badgeColor: "#7c3aed", thumb: "🔍",
    gradient: "135deg, #4c1d95, #6d28d9",
    tags: ["concorrentes", "análise", "mercado"],
    highlights: ["7 camadas de análise", "Benchmark automático", "Relatório de gaps"],
  },
  {
    id: 3, slug: "copy-com-ia-guia-pratico",
    title: "Copy com IA — Guia Prático",
    description: "Escreva copies que convertem: headlines, CTAs, anúncios e e-mails com técnicas de copywriting avançado via IA.",
    instructor: "Time MECPro", duration: "4h 10min", lessons: 14,
    level: "Intermediário", category: "Copywriting", rating: 4.8, students: 1890,
    isPro: false, badge: "GRATUITO", badgeColor: "#10b981", thumb: "✍️",
    gradient: "135deg, #7c2d12, #c2410c",
    tags: ["copy", "conversão", "anúncios"],
    highlights: ["50 templates prontos", "Copy para Meta e Google", "Framework AIDA+IA"],
  },
  {
    id: 4, slug: "meta-ads-com-mecpro",
    title: "Meta Ads com MECPro",
    description: "Integre o MECPro ao Meta Ads e automatize campanhas no Facebook e Instagram com segmentação inteligente.",
    instructor: "Time MECPro", duration: "5h 30min", lessons: 16,
    level: "Intermediário", category: "Tráfego Pago", rating: 4.8, students: 1240,
    isPro: true, badge: "PRO", badgeColor: "#7c3aed", thumb: "📘",
    gradient: "135deg, #1e3a5f, #1877f2",
    tags: ["meta ads", "facebook", "instagram"],
    highlights: ["Publicação direta via API", "Segmentação por IA", "A/B testing"],
  },
  {
    id: 5, slug: "estrategia-social-media-ia",
    title: "Estratégia de Social Media com IA",
    description: "Monte um calendário editorial para LinkedIn, Instagram e TikTok. Posts, carrosséis, Reels e scripts prontos.",
    instructor: "Time MECPro", duration: "4h 45min", lessons: 15,
    level: "Iniciante", category: "Social Media", rating: 4.7, students: 978,
    isPro: false, badge: "GRATUITO", badgeColor: "#10b981", thumb: "📱",
    gradient: "135deg, #be185d, #9d174d",
    tags: ["linkedin", "instagram", "tiktok"],
    highlights: ["30 dias de conteúdo", "Scripts para Reels", "Templates de carrossel"],
  },
  {
    id: 6, slug: "relatorios-pdf-metricas",
    title: "Relatórios PDF & Métricas",
    description: "Gere relatórios profissionais em PDF e aprenda a interpretar métricas de campanha para decisões orientadas a dados.",
    instructor: "Time MECPro", duration: "2h 50min", lessons: 10,
    level: "Iniciante", category: "Analytics", rating: 4.8, students: 1120,
    isPro: false, badge: "GRATUITO", badgeColor: "#10b981", thumb: "📊",
    gradient: "135deg, #0c4a6e, #0369a1",
    tags: ["relatórios", "métricas", "PDF"],
    highlights: ["PDF automático", "KPIs essenciais", "Dashboard visual"],
  },
  {
    id: 7, slug: "google-ads-para-negocios",
    title: "Google Ads para Negócios com IA",
    description: "Configure campanhas no Google Ads usando dados do MECPro. Palavras-chave, segmentação e otimização de ROI.",
    instructor: "Time MECPro", duration: "5h 00min", lessons: 17,
    level: "Avançado", category: "Tráfego Pago", rating: 4.6, students: 643,
    isPro: true, badge: "PRO", badgeColor: "#7c3aed", thumb: "🎯",
    gradient: "135deg, #14532d, #166534",
    tags: ["google ads", "ROI", "palavras-chave"],
    highlights: ["Smart bidding com IA", "Quality Score otimizado", "ROAS 3x+"],
  },
  {
    id: 8, slug: "estrategia-ecommerce-ia",
    title: "Estratégia de E-commerce com IA",
    description: "MECPro para e-commerces: sazonalidade, remarketing, promoções e crescimento de ticket médio.",
    instructor: "Time MECPro", duration: "6h 00min", lessons: 20,
    level: "Avançado", category: "E-commerce", rating: 4.7, students: 512,
    isPro: true, badge: "PRO", badgeColor: "#7c3aed", thumb: "🛒",
    gradient: "135deg, #7f1d1d, #991b1b",
    tags: ["e-commerce", "remarketing", "conversão"],
    highlights: ["Funil completo com IA", "Sazonalidade automática", "Upsell inteligente"],
  },
  {
    id: 9, slug: "publicacao-meta-ads-com-mecpro",
    title: "Publicação no Meta Ads com MECPro",
    description: "Conecte sua conta Meta, publique campanhas no Facebook e Instagram e use publicação em múltiplas páginas com detecção automática de WhatsApp.",
    instructor: "Time MECPro", duration: "2h 45min", lessons: 9,
    level: "Intermediário", category: "Tráfego Pago", rating: 4.9, students: 320,
    isPro: false, badge: "NOVO", badgeColor: "#2563eb", thumb: "📤",
    gradient: "135deg, #1e3a5f, #1877f2",
    tags: ["meta ads", "publicação", "facebook", "instagram"],
    highlights: ["Conectar conta Meta via API", "Publicação em múltiplas páginas", "WhatsApp automático por página"],
  },
  {
    id: 10, slug: "marketplace-mecpro-do-zero",
    title: "Marketplace MECPro — Publique e Venda",
    description: "Crie landing pages com IA em 4 passos, publique no Marketplace, edite fotos e vídeos e gerencie suas ofertas pelo Dashboard do Vendedor.",
    instructor: "Time MECPro", duration: "1h 50min", lessons: 7,
    level: "Iniciante", category: "Marketplace", rating: 4.8, students: 185,
    isPro: false, badge: "NOVO", badgeColor: "#2563eb", thumb: "🛍️",
    gradient: "135deg, #064e3b, #0d9488",
    tags: ["marketplace", "landing page", "venda"],
    highlights: ["Landing page gerada por IA", "Upload de foto e vídeo", "Dashboard do Vendedor"],
  },
  {
    id: 11, slug: "agente-autonomo-e-qualidade-de-ia",
    title: "Agente Autônomo — Controle e Qualidade",
    description: "Entenda como o Agente Autônomo funciona, controle o uso de IA, interprete o painel de qualidade e opere em modo econômico sem perder resultados.",
    instructor: "Time MECPro", duration: "1h 30min", lessons: 6,
    level: "Intermediário", category: "Plataforma", rating: 4.9, students: 97,
    isPro: true, badge: "PRO", badgeColor: "#7c3aed", thumb: "🤖",
    gradient: "135deg, #1e1b4b, #4c1d95",
    tags: ["agente", "autonomo", "IA", "qualidade"],
    highlights: ["Painel de qualidade em tempo real", "Motor determinístico como backup", "Controle de quota e modo econômico"],
  },
];

const SOCIAL_STRATEGY: Record<string, any[]> = {
  linkedin: [
    {
      id: 1, type: "Post de Autoridade",
      hook: "🤯 Nossa IA analisou 500 campanhas. O resultado vai te surpreender.",
      body: `Depois de cruzar dados de mais de 500 campanhas no MECPro:\n\n📌 Campanhas com análise de concorrentes prévia convertem 3,2x mais\n📌 Copies com perfil detalhado têm CTR 47% maior\n📌 Briefing visual reduz retrabalho em 68%\n\nTudo isso com IA. Em minutos.`,
      cta: "Teste grátis → mecproai.com",
      hashtags: "#MarketingDigital #IA #Campanhas #MECPro",
    },
    {
      id: 2, type: "Carrossel — 5 Slides",
      hook: "5 passos para criar uma campanha completa com IA (sem contratar agência)",
      slides: [
        "Slide 1 · O problema — briefs vazios, campanhas genéricas",
        "Slide 2 · Perfil do Cliente — IA mapeia dores e desejos",
        "Slide 3 · Análise de Concorrentes — 7 camadas de mercado",
        "Slide 4 · Campanha Automática — copy e segmentação em 1 clique",
        "Slide 5 · Exportação — PDF profissional + Meta/Google Ads",
      ],
      cta: "Comece agora — plano grátis disponível",
      hashtags: "#SaaS #MarketingIA #Agências #CampanhaDigital",
    },
    {
      id: 3, type: "Prova Social",
      hook: "De 3 dias de briefing para 18 minutos. Como?",
      body: `Uma agência parceira usou o MECPro para lançamento:\n\n⏱️ Antes: 3 dias de briefing + reuniões + retrabalho\n⚡ Depois: 18 minutos do zero ao PDF final\n\nO que mudou?\n→ Perfil do cliente por IA\n→ 5 concorrentes analisados automaticamente\n→ Copy, segmentação e criativos em 1 clique`,
      cta: "Crie sua conta grátis → mecproai.com",
      hashtags: "#AgênciaDigital #AutomaçãoMarketing #IA #MECPro",
    },
  ],
  instagram: [
    {
      id: 1, type: "Reels — Script",
      hook: "POV: você acaba de criar uma campanha em 18 minutos ⚡",
      script: [
        "[0-3s] MECPro abrindo — música energética",
        "[3-8s] Perfil do cliente sendo gerado com IA",
        "[8-14s] Análise de concorrentes — gráficos e insights",
        "[14-20s] Campanha gerada — copy, segmentação, criativos",
        "[20-25s] PDF sendo exportado",
        "[25-30s] CTA: 'Link na bio — começa grátis'",
      ],
      hashtags: "#MarketingDigital #IA #MECPro #AgênciaDigital #SaaS #TráfegoPago",
    },
    {
      id: 2, type: "Carrossel — 6 Slides",
      hook: "6 recursos que substituem horas de trabalho manual 🔥",
      slides: [
        "Capa: 6 recursos que vão transformar sua agência",
        "01 — Perfil do Cliente com IA (substitui 2h de briefing)",
        "02 — Análise de Concorrentes (substitui dias de pesquisa)",
        "03 — Análise de Mercado (dados em tempo real)",
        "04 — Campanha Automática (copy + segmentação)",
        "05 — Export PDF & XLSX (relatórios prontos)",
        "06 — Integração Meta & Google Ads",
      ],
      hashtags: "#MarketingIA #Automação #AgênciaDigital #MECPro",
    },
    {
      id: 3, type: "Post Comparativo",
      hook: "SEM MECPro vs COM MECPro ⚡",
      content: [
        "✕ 3 dias de briefing  →  ◎ 18 minutos",
        "✕ Análise manual      →  ◎ IA automática",
        "✕ Copy genérico       →  ◎ Copy personalizado",
        "✕ Relatório manual    →  ◎ PDF profissional",
      ],
      hashtags: "#MECPro #MarketingDigital #AutomaçãoMarketing",
    },
  ],
  tiktok: [
    {
      id: 1, type: "Tutorial",
      hook: "Você ainda demora 3 dias para criar uma campanha? 👀",
      script: [
        "[0-3s] 'Se você faz briefing manual, para tudo agora'",
        "[3-10s] Mostrar planilha bagunçada, reuniões",
        "[10-25s] MECPro ao vivo — perfil do cliente em segundos",
        "[25-45s] Análise de concorrentes — gráficos aparecendo",
        "[45-55s] Campanha gerada — PDF exportado",
        "[55-60s] 'Link na bio, começa grátis, sem cartão'",
      ],
      trending_sounds: ["Trap instrumental energético", "Lo-fi motivacional"],
    },
    {
      id: 2, type: "Trend POV",
      hook: "POV: Você é uma agência que achou o MECPro 😱",
      script: [
        "[0-5s] Surpresa ao ver a plataforma pela 1ª vez",
        "[5-15s] Navegando pelos módulos — reação a cada feature",
        "[15-25s] Gerando campanha — 'isso é real???'",
        "[25-35s] PDF exportado — 'INCRÍVEL'",
        "[35-40s] 'Plano gratuito — link na bio'",
      ],
      trending_sounds: ["Som de surpresa/choque", "Beat viral atual"],
    },
    {
      id: 3, type: "Educacional",
      hook: "3 motivos para parar de criar campanhas manualmente 🚫",
      script: [
        "[0-4s] '3 motivos para usar IA nas campanhas'",
        "[4-18s] 'Você perde tempo em briefings que a IA faz em segundos'",
        "[18-32s] 'Análise manual fica desatualizada em horas'",
        "[32-46s] 'Copy genérico não converte — IA personaliza por nicho'",
        "[46-60s] 'MECPro resolve tudo. Link na bio.'",
      ],
      trending_sounds: ["Voz em off calma", "Trilha motivacional suave"],
    },
  ],
};

const EBOOKS = [
  { emoji: "📘", title: "Guia Completo de Campanhas com IA", desc: "Do briefing ao relatório — passo a passo com o MECPro.", pages: 42, free: true, color: "#1e3a5f" },
  { emoji: "🔍", title: "Manual de Análise de Concorrentes", desc: "Mapeie o mercado e encontre oportunidades com IA.", pages: 38, free: true, color: "#4c1d95" },
  { emoji: "✍️", title: "Copywriting com IA — 50 Templates", desc: "50 modelos prontos para anúncios, e-mails e landing pages.", pages: 56, free: false, color: "#7c2d12" },
  { emoji: "📊", title: "Métricas que Importam no Marketing", desc: "Quais KPIs acompanhar e como interpretar os dados.", pages: 30, free: true, color: "#0c4a6e" },
  { emoji: "🚀", title: "Lançamento com IA — Playbook", desc: "Framework completo para lançar produtos com campanhas geradas por IA.", pages: 64, free: false, color: "#14532d" },
  { emoji: "📅", title: "Calendário Editorial 30 Dias", desc: "42 posts prontos para LinkedIn, Instagram e TikTok.", pages: 28, free: false, color: "#be185d" },
];

const COMING_SOON = [
  { emoji: "🎬", title: "VSL Maker — Roteiro e Vídeo com IA", eta: "Maio/2026", category: "Criativo" },
  { emoji: "📡", title: "TikTok Ads com MECPro", eta: "Junho/2026", category: "Tráfego Pago" },
  { emoji: "🧠", title: "Matching Engine — Masterclass", eta: "Julho/2026", category: "Avançado" },
];

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
export default function Academy() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"cursos"|"social"|"ebooks">("cursos");
  const [activePlatform, setActivePlatform] = useState<"linkedin"|"instagram"|"tiktok">("linkedin");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [levelFilter, setLevelFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<number|null>(null);

  const categories = ["Todos","Plataforma","Inteligência","Copywriting","Tráfego Pago","Social Media","Analytics","E-commerce","Marketplace"];
  const levels = ["Todos","Iniciante","Intermediário","Avançado"];

  const filteredCourses = COURSES.filter(c => {
    const matchCat   = categoryFilter === "Todos" || c.category === categoryFilter;
    const matchLevel = levelFilter === "Todos" || c.level === levelFilter;
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.tags.some(t => t.includes(search.toLowerCase()));
    return matchCat && matchLevel && matchSearch;
  });

  const platformData = SOCIAL_STRATEGY[activePlatform];

  function copyContent(item: any, id: number) {
    const text = [item.hook, item.body, item.caption, item.slides?.join("\n"), item.script?.join("\n"), item.content?.join("\n"), item.hashtags, item.cta].filter(Boolean).join("\n\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); });
  }

  const LEVEL_COLOR: Record<string, string> = { "Iniciante": "#10b981", "Intermediário": "#f59e0b", "Avançado": "#ef4444" };

  return (
    <Layout>
      <style>{`
        .ac-course-card { transition: transform .2s, box-shadow .2s, border-color .2s; }
        .ac-course-card:hover { transform: translateY(-4px) !important; box-shadow: 0 16px 48px rgba(139,92,246,0.2) !important; border-color: rgba(139,92,246,0.4) !important; }
        .ac-filter-btn { transition: all .15s; }
        .ac-filter-btn:hover { opacity: .8; }
        .ac-ebook-card { transition: transform .2s, box-shadow .2s; }
        .ac-ebook-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.3) !important; }
        .ac-social-card { transition: border-color .2s; }
        .ac-social-card:hover { border-color: rgba(139,92,246,0.35) !important; }
        .ac-cta-btn { transition: transform .15s, opacity .15s; }
        .ac-cta-btn:hover { transform: scale(1.03); }
        .ac-search:focus { border-color: #8b5cf6 !important; box-shadow: 0 0 0 3px rgba(139,92,246,0.2) !important; outline: none; }
        @keyframes shimmer { 0%,100% { opacity:.6 } 50% { opacity:1 } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f1f5f9" }}>

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
          borderBottom: "1px solid rgba(139,92,246,0.3)",
          padding: "52px 32px 44px",
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 38 }}>🎓</span>
              <span style={{
                background: "linear-gradient(90deg, #8b5cf6, #06b6d4)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                fontSize: 12, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase",
              }}>MECPro Academy</span>
            </div>

            <h1 style={{ fontSize: 38, fontWeight: 900, margin: "0 0 14px", lineHeight: 1.15, letterSpacing: "-0.03em" }}>
              Domine o marketing com IA<br />
              <span style={{ background: "linear-gradient(90deg,#8b5cf6,#06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                do zero ao avançado
              </span>
            </h1>
            <p style={{ fontSize: 16, color: "#94a3b8", maxWidth: 580, margin: "0 0 36px", lineHeight: 1.7 }}>
              Mini cursos, estratégias de conteúdo e materiais exclusivos para tirar o máximo da plataforma.
            </p>

            {/* Stats */}
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[
                { n: "8",      label: "Cursos" },
                { n: "107",    label: "Aulas" },
                { n: "4 free", label: "Gratuitos" },
                { n: "4.8★",   label: "Avaliação" },
                { n: "8.2K",   label: "Alunos" },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#a78bfa", letterSpacing: "-0.04em" }}>{s.n}</div>
                  <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── TABS ─────────────────────────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0f172a", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex" }}>
            {[
              { key: "cursos", label: "📚 Cursos" },
              { key: "social", label: "📱 Social Media" },
              { key: "ebooks", label: "📖 E-books" },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{
                padding: "17px 28px", border: "none", background: "none",
                color: activeTab === tab.key ? "#a78bfa" : "#475569",
                borderBottom: activeTab === tab.key ? "2px solid #8b5cf6" : "2px solid transparent",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                transition: "color .15s, border-color .15s", fontFamily: "inherit",
              }}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 32px 80px" }}>

          {/* ══ CURSOS ══════════════════════════════════════════════════ */}
          {activeTab === "cursos" && (
            <div>
              {/* Search + Filtros */}
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  className="ac-search"
                  placeholder="🔍 Buscar cursos…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{
                    flex: "0 0 220px", padding: "9px 14px", borderRadius: 10,
                    border: "1.5px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
                    color: "#f1f5f9", fontSize: 13, fontFamily: "inherit",
                  }}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {categories.map(c => (
                    <button key={c} className="ac-filter-btn" onClick={() => setCategoryFilter(c)} style={{
                      padding: "6px 13px", borderRadius: 20, border: "1px solid",
                      borderColor: categoryFilter === c ? "#8b5cf6" : "rgba(255,255,255,0.08)",
                      background: categoryFilter === c ? "rgba(139,92,246,0.18)" : "transparent",
                      color: categoryFilter === c ? "#a78bfa" : "#475569",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}>{c}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {levels.map(l => (
                    <button key={l} className="ac-filter-btn" onClick={() => setLevelFilter(l)} style={{
                      padding: "6px 13px", borderRadius: 20, border: "1px solid",
                      borderColor: levelFilter === l ? "#06b6d4" : "rgba(255,255,255,0.08)",
                      background: levelFilter === l ? "rgba(6,182,212,0.12)" : "transparent",
                      color: levelFilter === l ? "#22d3ee" : "#475569",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Destaques — curso em evidência */}
              {filteredCourses.filter(c => !c.isPro).slice(0,1).map(course => (
                <div key={course.id} className="ac-course-card" onClick={() => setLocation(`/courses/${course.slug}`)}
                  style={{
                    background: `linear-gradient(${course.gradient})`,
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18,
                    padding: "28px 32px", marginBottom: 24, cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap",
                  }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                      <span style={{ background: course.badgeColor, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 6 }}>{course.badge}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4 }}>{course.level}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4 }}>⭐ DESTAQUE</span>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px", letterSpacing: "-0.02em" }}>{course.title}</h2>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 16px", lineHeight: 1.6 }}>{course.description}</p>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                      <span>⏱ {course.duration}</span>
                      <span>📚 {course.lessons} aulas</span>
                      <span>👥 {course.students.toLocaleString()} alunos</span>
                      <span>★ {course.rating}</span>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setLocation(`/courses/${course.slug}`); }}
                    className="ac-cta-btn"
                    style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.25)", borderRadius: 12, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                    Acessar grátis →
                  </button>
                </div>
              ))}

              {/* Grid de cursos */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(295px, 1fr))", gap: 18 }}>
                {filteredCourses.map(course => (
                  <div key={course.id} className="ac-course-card" onClick={() => setLocation(`/courses/${course.slug}`)}
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
                    {/* Thumb */}
                    <div style={{ height: 96, background: `linear-gradient(${course.gradient})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, position: "relative" }}>
                      {course.thumb}
                      <span style={{ position: "absolute", top: 10, right: 10, background: course.badgeColor, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6 }}>{course.badge}</span>
                    </div>
                    {/* Body */}
                    <div style={{ padding: "16px 18px 20px" }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 9, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: LEVEL_COLOR[course.level] || "#94a3b8", background: `${LEVEL_COLOR[course.level]}18`, padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>{course.level}</span>
                        <span style={{ fontSize: 10, color: "#64748b", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 4 }}>{course.category}</span>
                      </div>
                      <h3 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 7px", lineHeight: 1.35, letterSpacing: "-0.01em" }}>{course.title}</h3>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 10px", lineHeight: 1.55 }}>{course.description}</p>
                      {/* Highlights */}
                      <div style={{ marginBottom: 12 }}>
                        {course.highlights.map((h, i) => (
                          <div key={i} style={{ fontSize: 11, color: "#64748b", padding: "2px 0", display: "flex", gap: 5, alignItems: "center" }}>
                            <span style={{ color: "#8b5cf6", fontWeight: 700 }}>◎</span> {h}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#475569", marginBottom: 12 }}>
                        <span>⏱ {course.duration}</span>
                        <span>📚 {course.lessons} aulas</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ color: "#f59e0b" }}>★</span>
                          <span>{course.rating}</span>
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setLocation(`/courses/${course.slug}`); }}
                        className="ac-cta-btn"
                        style={{
                          width: "100%", padding: "9px", borderRadius: 10, border: "none", cursor: "pointer",
                          background: course.isPro ? "linear-gradient(135deg,#7c3aed,#4c1d95)" : "linear-gradient(135deg,#059669,#047857)",
                          color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                        }}>
                        {course.isPro ? "Ver curso PRO →" : "Acessar grátis →"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredCourses.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Nenhum curso encontrado</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Tente outro filtro ou busca</div>
                </div>
              )}

              {/* Em breve */}
              <div style={{ marginTop: 48 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                  <span style={{ fontSize: 18 }}>🔜</span>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Em breve na Academy</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                  {COMING_SOON.map((c, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12, padding: "16px 18px", display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 28 }}>{c.emoji}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{c.title}</div>
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{c.category} · {c.eta}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Banner PRO */}
              <div style={{
                marginTop: 40, background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.1))",
                border: "1px solid rgba(139,92,246,0.35)", borderRadius: 18, padding: "28px 32px",
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16,
              }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 6px", letterSpacing: "-0.02em" }}>🎓 Acesso completo à Academy</h3>
                  <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Todos os cursos PRO + novos conteúdos todo mês. Incluso no plano Premium e VIP.</p>
                </div>
                <button onClick={() => setLocation("/pricing")} className="ac-cta-btn"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#06b6d4)", color: "#fff", border: "none", borderRadius: 12, padding: "13px 30px", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                  Ver planos →
                </button>
              </div>
            </div>
          )}

          {/* ══ SOCIAL MEDIA ════════════════════════════════════════════ */}
          {activeTab === "social" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 8px", letterSpacing: "-0.03em" }}>📱 Estratégia Completa de Social Media</h2>
                <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Conteúdo pronto para publicar. Copie, adapte e publique agora.</p>
              </div>

              {/* Platform tabs */}
              <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
                {(["linkedin","instagram","tiktok"] as const).map(p => {
                  const meta: Record<string, {icon:string,color:string,label:string}> = {
                    linkedin:  { icon:"💼", color:"#0077b5", label:"LinkedIn" },
                    instagram: { icon:"📸", color:"#e1306c", label:"Instagram" },
                    tiktok:    { icon:"🎵", color:"#69c9d0", label:"TikTok" },
                  };
                  const m = meta[p];
                  return (
                    <button key={p} onClick={() => setActivePlatform(p)}
                      style={{
                        padding: "11px 24px", borderRadius: 12,
                        border: `2px solid ${activePlatform===p ? m.color : "rgba(255,255,255,0.08)"}`,
                        background: activePlatform===p ? `${m.color}22` : "rgba(255,255,255,0.03)",
                        color: activePlatform===p ? "#fff" : "#475569",
                        fontWeight: 700, fontSize: 14, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 8,
                        transition: "all .2s", fontFamily: "inherit",
                      }}>
                      {m.icon} {m.label}
                    </button>
                  );
                })}
              </div>

              {/* Content cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {platformData.map((item: any) => (
                  <div key={item.id} className="ac-social-card"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
                    {/* Header */}
                    <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#8b5cf6", background: "rgba(139,92,246,0.15)", padding: "3px 10px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.type}</span>
                        <p style={{ fontSize: 15, fontWeight: 700, margin: "10px 0 0", color: "#f1f5f9", lineHeight: 1.4 }}>"{item.hook}"</p>
                      </div>
                      <button onClick={() => copyContent(item, item.id)}
                        style={{
                          background: copied===item.id ? "rgba(16,185,129,0.15)" : "rgba(139,92,246,0.1)",
                          border: `1px solid ${copied===item.id ? "rgba(16,185,129,0.4)" : "rgba(139,92,246,0.3)"}`,
                          color: copied===item.id ? "#10b981" : "#a78bfa",
                          borderRadius: 9, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit",
                        }}>
                        {copied===item.id ? "✅ Copiado!" : "📋 Copiar"}
                      </button>
                    </div>
                    {/* Body */}
                    <div style={{ padding: "16px 24px 20px" }}>
                      {item.body && <pre style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 14px", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.7 }}>{item.body}</pre>}
                      {item.caption && <pre style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 14px", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.7 }}>{item.caption}</pre>}
                      {(item.slides||item.script||item.content) && (
                        <div style={{ margin: "0 0 14px" }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#8b5cf6", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {item.slides?"SLIDES":item.script?"SCRIPT":"CONTEÚDO"}
                          </div>
                          {(item.slides||item.script||item.content).map((s: string, i: number) => (
                            <div key={i} style={{ fontSize: 13, color: "#94a3b8", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 10 }}>
                              <span style={{ color: "#475569", minWidth: 20, fontWeight: 700, fontSize: 11 }}>{i+1}</span>
                              <span style={{ lineHeight: 1.5 }}>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.trending_sounds && (
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                          🎵 <strong>Sons trending:</strong> {item.trending_sounds.join(" · ")}
                        </div>
                      )}
                      {item.hashtags && (
                        <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, wordBreak: "break-word", marginBottom: item.cta ? 8 : 0 }}>{item.hashtags}</div>
                      )}
                      {item.cta && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee" }}>👉 {item.cta}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA calendário */}
              <div style={{ marginTop: 36, background: "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(124,58,237,0.12))", border: "1px solid rgba(14,165,233,0.25)", borderRadius: 16, padding: "26px 30px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <h4 style={{ margin: "0 0 5px", fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}>📅 Calendário editorial completo — 30 dias</h4>
                  <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>42 posts para LinkedIn, Instagram e TikTok. Incluso no plano Premium.</p>
                </div>
                <button onClick={() => setLocation("/pricing")} className="ac-cta-btn"
                  style={{ background: "linear-gradient(135deg,#0ea5e9,#7c3aed)", color: "#fff", border: "none", borderRadius: 12, padding: "12px 26px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                  Assinar Premium →
                </button>
              </div>
            </div>
          )}

          {/* ══ E-BOOKS ═════════════════════════════════════════════════ */}
          {activeTab === "ebooks" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 8px", letterSpacing: "-0.03em" }}>📖 E-books & Materiais</h2>
                <p style={{ fontSize: 14, color: "#94a3b8" }}>Guias práticos para dominar campanhas, copy e análise de mercado com IA.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px,1fr))", gap: 18 }}>
                {EBOOKS.map((book, i) => (
                  <div key={i} className="ac-ebook-card"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ height: 88, background: `linear-gradient(135deg, ${book.color}, ${book.color}cc)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, position: "relative" }}>
                      {book.emoji}
                      {book.free && <span style={{ position: "absolute", top: 10, right: 10, background: "#10b981", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6 }}>GRÁTIS</span>}
                      {!book.free && <span style={{ position: "absolute", top: 10, right: 10, background: "#7c3aed", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6 }}>PRO</span>}
                    </div>
                    <div style={{ padding: "16px 18px 20px" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 7px", lineHeight: 1.35, letterSpacing: "-0.01em" }}>{book.title}</h3>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px", lineHeight: 1.5 }}>{book.desc}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#475569" }}>📄 {book.pages} páginas</span>
                        <button onClick={() => setLocation(book.free ? "/ebooks" : "/pricing")} className="ac-cta-btn"
                          style={{
                            background: book.free ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#7c3aed,#4c1d95)",
                            color: "#fff", border: "none", borderRadius: 9, padding: "7px 16px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                          }}>
                          {book.free ? "Baixar →" : "Assinar PRO →"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Banner */}
              <div style={{ marginTop: 40, background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.1))", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 18, padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 6px", letterSpacing: "-0.02em" }}>📚 Biblioteca PRO completa</h3>
                  <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Todos os e-books + templates + novos materiais todo mês. Incluso no plano Premium e VIP.</p>
                </div>
                <button onClick={() => setLocation("/pricing")} className="ac-cta-btn"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#06b6d4)", color: "#fff", border: "none", borderRadius: 12, padding: "13px 30px", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                  Ver planos →
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
