import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

// ─── DADOS DOS CURSOS ───────────────────────────────────────────────────────
const COURSES = [
  {
    id: 1,
    slug: "campanha-do-zero-com-mecpro",
    title: "Campanha do Zero com MECPro",
    description: "Aprenda a criar uma campanha completa do zero usando todos os módulos da plataforma: perfil do cliente, concorrentes, mercado e geração automática.",
    instructor: "Time MECPro",
    duration: "3h 20min",
    lessons: 12,
    level: "Iniciante",
    category: "Plataforma",
    rating: 4.9,
    students: 2140,
    isPro: false,
    badge: "GRATUITO",
    badgeColor: "#10b981",
    thumb: "◈",
    tags: ["campanha", "IA", "do zero"],
  },
  {
    id: 2,
    slug: "analise-de-concorrentes-ia",
    title: "Análise de Concorrentes com IA",
    description: "Domine a inteligência de concorrência do MECPro para mapear forças, fraquezas e oportunidades do mercado com 7 camadas de análise.",
    instructor: "Time MECPro",
    duration: "6h 15min",
    lessons: 18,
    level: "Intermediário",
    category: "Inteligência",
    rating: 4.9,
    students: 856,
    isPro: true,
    badge: "PRO",
    badgeColor: "#7c3aed",
    thumb: "🔍",
    tags: ["concorrentes", "análise", "mercado"],
  },
  {
    id: 3,
    slug: "copy-com-ia-guia-pratico",
    title: "Copy com IA — Guia Prático",
    description: "Use a IA do MECPro para escrever copies que convertem: headlines, CTAs, anúncios e e-mails com técnicas de copywriting avançado.",
    instructor: "Time MECPro",
    duration: "4h 10min",
    lessons: 14,
    level: "Intermediário",
    category: "Copywriting",
    rating: 4.8,
    students: 1890,
    isPro: false,
    badge: "GRATUITO",
    badgeColor: "#10b981",
    thumb: "✍️",
    tags: ["copy", "conversão", "anúncios"],
  },
  {
    id: 4,
    slug: "meta-ads-com-mecpro",
    title: "Meta Ads com MECPro",
    description: "Integre o MECPro ao Meta Ads e automatize a criação de campanhas no Facebook e Instagram com segmentação inteligente por IA.",
    instructor: "Time MECPro",
    duration: "5h 30min",
    lessons: 16,
    level: "Intermediário",
    category: "Tráfego Pago",
    rating: 4.8,
    students: 1240,
    isPro: true,
    badge: "PRO",
    badgeColor: "#7c3aed",
    thumb: "📘",
    tags: ["meta ads", "facebook", "instagram"],
  },
  {
    id: 5,
    slug: "estrategia-social-media-ia",
    title: "Estratégia de Social Media com IA",
    description: "Monte um calendário editorial completo para LinkedIn, Instagram e TikTok usando a IA do MECPro. Posts, carrosséis, Reels e scripts prontos.",
    instructor: "Time MECPro",
    duration: "4h 45min",
    lessons: 15,
    level: "Iniciante",
    category: "Social Media",
    rating: 4.7,
    students: 978,
    isPro: false,
    badge: "GRATUITO",
    badgeColor: "#10b981",
    thumb: "📱",
    tags: ["linkedin", "instagram", "tiktok"],
  },
  {
    id: 6,
    slug: "relatorios-pdf-metricas",
    title: "Relatórios PDF & Métricas que Importam",
    description: "Gere relatórios profissionais em PDF e aprenda a interpretar as métricas de campanha para tomar decisões orientadas por dados.",
    instructor: "Time MECPro",
    duration: "2h 50min",
    lessons: 10,
    level: "Iniciante",
    category: "Analytics",
    rating: 4.8,
    students: 1120,
    isPro: false,
    badge: "GRATUITO",
    badgeColor: "#10b981",
    thumb: "📊",
    tags: ["relatórios", "métricas", "PDF"],
  },
  {
    id: 7,
    slug: "google-ads-para-negocios",
    title: "Google Ads para Negócios com IA",
    description: "Configure campanhas no Google Ads usando os dados gerados pelo MECPro. Palavras-chave, segmentação e otimização de ROI.",
    instructor: "Time MECPro",
    duration: "5h 00min",
    lessons: 17,
    level: "Avançado",
    category: "Tráfego Pago",
    rating: 4.6,
    students: 643,
    isPro: true,
    badge: "PRO",
    badgeColor: "#7c3aed",
    thumb: "🎯",
    tags: ["google ads", "ROI", "palavras-chave"],
  },
  {
    id: 8,
    slug: "estrategia-ecommerce-ia",
    title: "Estratégia de E-commerce com IA",
    description: "Aplique o MECPro para e-commerces: análise de sazonalidade, campanhas de remarketing, promoções e crescimento de ticket médio.",
    instructor: "Time MECPro",
    duration: "6h 00min",
    lessons: 20,
    level: "Avançado",
    category: "E-commerce",
    rating: 4.7,
    students: 512,
    isPro: true,
    badge: "PRO",
    badgeColor: "#7c3aed",
    thumb: "🛒",
    tags: ["e-commerce", "remarketing", "conversão"],
  },
];

// ─── ESTRATÉGIA DE SOCIAL MEDIA ────────────────────────────────────────────
const SOCIAL_STRATEGY = {
  linkedin: [
    {
      id: 1,
      type: "Post de Autoridade",
      hook: "🤯 Nossa IA analisou 500 campanhas de marketing. O resultado vai te surpreender.",
      body: `Depois de cruzar dados de mais de 500 campanhas geradas no MECPro, descobrimos os 3 padrões que separam campanhas de alto ROI das medianas:\n\n📌 1. Campanhas com análise de concorrentes prévia convertem 3,2x mais\n📌 2. Copies geradas com perfil de cliente detalhado têm CTR 47% maior\n📌 3. Exportação em PDF + briefing visual reduz retrabalho em 68%\n\nTudo isso com IA. Em minutos. Não em dias.`,
      cta: "Teste grátis → mecpro-ai.onrender.com",
      hashtags: "#MarketingDigital #IA #Campanhas #MECPro #InteligênciaArtificial",
    },
    {
      id: 2,
      type: "Carrossel — 5 Slides",
      hook: "5 passos para criar uma campanha completa com IA (sem contratar agência)",
      slides: [
        "Slide 1: O problema — briefs vazios, campanhas genéricas, retrabalho infinito",
        "Slide 2: Perfil do Cliente — IA mapeia dores, desejos e comportamentos",
        "Slide 3: Análise de Concorrentes — 7 camadas de inteligência de mercado",
        "Slide 4: Campanha Automática — copy, criativos, segmentação em 1 clique",
        "Slide 5: Exportação — PDF profissional + integração Meta/Google Ads",
      ],
      cta: "Comece agora — plano grátis disponível",
      hashtags: "#SaaS #MarketingIA #Agências #ECommerce #CampanhaDigital",
    },
    {
      id: 3,
      type: "Post de Prova Social",
      hook: "De 3 dias de briefing para 18 minutos de campanha completa. Como?",
      body: `Uma agência parceira usou o MECPro para criar uma campanha completa de lançamento:\n\n⏱️ Antes: 3 dias de briefing + reuniões + retrabalho\n⚡ Depois: 18 minutos do zero ao PDF final\n\nO que mudou?\n→ Perfil do cliente gerado por IA\n→ Análise automática de 5 concorrentes\n→ Copy, segmentação e criativos em 1 clique\n→ Relatório PDF profissional exportado na hora\n\nIsso não é o futuro. É o presente.`,
      cta: "Crie sua conta grátis → mecpro-ai.onrender.com",
      hashtags: "#AgênciaDigital #AutomaçãoMarketing #IA #MECPro",
    },
  ],
  instagram: [
    {
      id: 1,
      type: "Reels — Script Completo",
      hook: "POV: você acaba de criar uma campanha completa de marketing em 18 minutos ⚡",
      script: [
        "[0-3s] Tela do MECPro abrindo — música energética",
        "[3-8s] Preenchendo perfil do cliente com IA completando automaticamente",
        "[8-14s] Análise de concorrentes aparecendo — gráficos e insights",
        "[14-20s] Campanha gerada — copy, segmentação, criativos",
        "[20-25s] PDF sendo exportado — logo profissional",
        "[25-30s] CTA: 'Link na bio — começa grátis hoje'",
      ],
      caption: "Da análise à campanha em minutos. Sem agência. Sem retrabalho. Com IA. 🤖✨\n\nO MECPro faz todo o trabalho pesado por você:\n◎ Perfil do cliente automático\n◎ Análise de concorrentes com IA\n◎ Campanha gerada em 1 clique\n◎ PDF profissional para o cliente\n\n👉 Link na bio para começar GRÁTIS",
      hashtags: "#MarketingDigital #IA #Campanhas #MECPro #AgênciaDigital #SaaS #InteligênciaArtificial #TráfegoPago",
    },
    {
      id: 2,
      type: "Carrossel — 6 Slides",
      hook: "6 recursos do MECPro que substituem horas de trabalho manual 🔥",
      slides: [
        "Capa: 6 recursos que vão transformar sua agência",
        "01 — Perfil do Cliente com IA (substitui 2h de briefing)",
        "02 — Análise de Concorrentes (substitui dias de pesquisa)",
        "03 — Análise de Mercado (dados em tempo real)",
        "04 — Campanha Automática (copy + segmentação + criativos)",
        "05 — Exportação PDF & XLSX (relatórios prontos para o cliente)",
        "06 — Integração Meta & Google Ads (publique direto da plataforma)",
        "Final: Plano grátis disponível — link na bio",
      ],
      hashtags: "#MarketingIA #Automação #AgênciaDigital #SaaS #MECPro",
    },
    {
      id: 3,
      type: "Post Estático — Comparação",
      hook: "SEM MECPro vs COM MECPro ⚡",
      content: [
        "✕ Sem MECPro: 3 dias de briefing | ◎ Com MECPro: 18 minutos",
        "✕ Sem MECPro: Análise manual de concorrentes | ◎ Com MECPro: IA automática",
        "✕ Sem MECPro: Copy genérico | ◎ Com MECPro: Copy personalizado por IA",
        "✕ Sem MECPro: Relatório manual | ◎ Com MECPro: PDF profissional",
      ],
      hashtags: "#MECPro #MarketingDigital #AutomaçãoMarketing #IA",
    },
  ],
  tiktok: [
    {
      id: 1,
      type: "TikTok — Tutorial",
      hook: "Você ainda demora 3 dias para criar uma campanha? Deixa eu te mostrar como fazer em 18 minutos 👀",
      script: [
        "[Hook 0-3s] 'Se você ainda faz briefing manual, para tudo agora'",
        "[Problema 3-10s] Mostrar planilha bagunçada, reuniões, retrabalho",
        "[Solução 10-25s] Abrir MECPro ao vivo — perfil do cliente em segundos",
        "[Demo 25-45s] Análise de concorrentes rodando — gráficos aparecendo",
        "[Resultado 45-55s] Campanha gerada — PDF exportado",
        "[CTA 55-60s] 'Link na bio, começa grátis, sem cartão'",
      ],
      trending_sounds: ["Trap instrumental energético", "Lo-fi motivacional"],
    },
    {
      id: 2,
      type: "TikTok — Trend 'POV'",
      hook: "POV: Você é uma agência que acabou de descobrir o MECPro 😱",
      script: [
        "[0-5s] Expressão de surpresa ao ver a plataforma pela primeira vez",
        "[5-15s] Navegando pelos módulos — reação genuína a cada feature",
        "[15-25s] Gerando campanha — 'isso é real???'",
        "[25-35s] PDF sendo exportado — 'ISSO É INCRÍVEL'",
        "[35-40s] CTA: 'Plano gratuito para sempre — link na bio'",
      ],
      trending_sounds: ["Som de surpresa/choque", "Beat viral atual"],
    },
    {
      id: 3,
      type: "TikTok — Educacional",
      hook: "3 motivos para parar de criar campanhas manualmente agora 🚫",
      script: [
        "[Hook 0-4s] Text overlay: '3 motivos para usar IA nas suas campanhas'",
        "[Motivo 1 4-18s] 'Você perde tempo em briefings que a IA faz em segundos'",
        "[Motivo 2 18-32s] 'Análise manual de concorrentes está desatualizada em horas'",
        "[Motivo 3 32-46s] 'Copy genérico não converte — IA personaliza para cada nicho'",
        "[CTA 46-60s] 'MECPro resolve tudo isso. Link na bio.'",
      ],
      trending_sounds: ["Voz em off calma", "Trilha motivacional suave"],
    },
  ],
};

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
export default function Academy() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"cursos" | "social" | "ebooks">("cursos");
  const [activePlatform, setActivePlatform] = useState<"linkedin" | "instagram" | "tiktok">("linkedin");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [levelFilter, setLevelFilter] = useState("Todos");

  const categories = ["Todos", "Plataforma", "Inteligência", "Copywriting", "Tráfego Pago", "Social Media", "Analytics", "E-commerce"];
  const levels = ["Todos", "Iniciante", "Intermediário", "Avançado"];

  const filteredCourses = COURSES.filter((c) => {
    const matchCat = categoryFilter === "Todos" || c.category === categoryFilter;
    const matchLevel = levelFilter === "Todos" || c.level === levelFilter;
    return matchCat && matchLevel;
  });

  const platformData = SOCIAL_STRATEGY[activePlatform];

  return (
    <Layout>
      <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f1f5f9" }}>
        {/* ── HERO ── */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
          borderBottom: "1px solid rgba(139,92,246,0.3)",
          padding: "48px 32px 40px",
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 36 }}>🎓</span>
              <span style={{
                background: "linear-gradient(90deg, #8b5cf6, #06b6d4)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}>MECPro Academy</span>
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.2 }}>
              Aprenda a dominar o MECPro
            </h1>
            <p style={{ fontSize: 16, color: "#94a3b8", maxWidth: 600, margin: "0 0 32px" }}>
              Mini cursos, estratégias de conteúdo e materiais exclusivos para você tirar o máximo da plataforma de geração de campanhas com IA.
            </p>

            {/* Stats */}
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              {[
                { n: "8", label: "Cursos disponíveis" },
                { n: "120+", label: "Aulas gravadas" },
                { n: "4 grátis", label: "Cursos gratuitos" },
                { n: "4.8★", label: "Avaliação média" },
              ].map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#8b5cf6" }}>{s.n}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 0 }}>
            {(["cursos", "social", "ebooks"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "16px 28px",
                  border: "none",
                  background: "none",
                  color: activeTab === tab ? "#8b5cf6" : "#64748b",
                  borderBottom: activeTab === tab ? "2px solid #8b5cf6" : "2px solid transparent",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  transition: "all 0.2s",
                }}
              >
                {tab === "cursos" ? "📚 Cursos" : tab === "social" ? "📱 Estratégia Social Media" : "📖 E-books"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 64px" }}>

          {/* ══ TAB: CURSOS ══════════════════════════════════════════════════ */}
          {activeTab === "cursos" && (
            <div>
              {/* Filtros */}
              <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {categories.map((c) => (
                    <button key={c} onClick={() => setCategoryFilter(c)} style={{
                      padding: "6px 14px", borderRadius: 20, border: "1px solid",
                      borderColor: categoryFilter === c ? "#8b5cf6" : "rgba(255,255,255,0.1)",
                      background: categoryFilter === c ? "rgba(139,92,246,0.15)" : "transparent",
                      color: categoryFilter === c ? "#a78bfa" : "#64748b",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>{c}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {levels.map((l) => (
                    <button key={l} onClick={() => setLevelFilter(l)} style={{
                      padding: "6px 14px", borderRadius: 20, border: "1px solid",
                      borderColor: levelFilter === l ? "#06b6d4" : "rgba(255,255,255,0.1)",
                      background: levelFilter === l ? "rgba(6,182,212,0.1)" : "transparent",
                      color: levelFilter === l ? "#22d3ee" : "#64748b",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Grid de cursos */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                {filteredCourses.map((course) => (
                  <div key={course.id} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    overflow: "hidden",
                    transition: "all 0.2s",
                    cursor: "pointer",
                  }}
                    onClick={() => setLocation(`/courses/${course.slug}`)}
                  >
                    {/* Thumb */}
                    <div style={{
                      height: 100,
                      background: `linear-gradient(135deg, ${course.isPro ? "#4c1d95" : "#064e3b"}, ${course.isPro ? "#7c3aed" : "#065f46"})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 48,
                      position: "relative",
                    }}>
                      {course.thumb}
                      <span style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        background: course.badgeColor,
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: 6,
                        letterSpacing: 0.5,
                      }}>{course.badge}</span>
                    </div>

                    {/* Conteúdo */}
                    <div style={{ padding: "16px 20px 20px" }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: "#64748b", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 4 }}>{course.level}</span>
                        <span style={{ fontSize: 10, color: "#64748b", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 4 }}>{course.category}</span>
                      </div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.3 }}>{course.title}</h3>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px", lineHeight: 1.5 }}>{course.description}</p>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#64748b" }}>
                        <span>⏱️ {course.duration}</span>
                        <span>📚 {course.lessons} aulas</span>
                        <span>👥 {course.students.toLocaleString()}</span>
                      </div>

                      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ color: "#f59e0b", fontSize: 13 }}>{"★".repeat(Math.round(course.rating))}</span>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{course.rating}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setLocation(`/courses/${course.slug}`); }}
                          style={{
                            background: course.isPro ? "linear-gradient(135deg,#7c3aed,#4c1d95)" : "linear-gradient(135deg,#059669,#047857)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "7px 16px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {course.isPro ? "Ver curso →" : "Acessar grátis →"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Banner PRO */}
              <div style={{
                marginTop: 40,
                background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.1))",
                border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: 16,
                padding: "28px 32px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>🎓 Acesso completo à Academy</h3>
                  <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Todos os cursos PRO + estratégias + novos conteúdos todo mês. Incluso no plano Premium e VIP.</p>
                </div>
                <button
                  onClick={() => setLocation("/pricing")}
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 28px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Ver planos →
                </button>
              </div>
            </div>
          )}

          {/* ══ TAB: SOCIAL MEDIA ════════════════════════════════════════════ */}
          {activeTab === "social" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>📱 Estratégia Completa de Social Media</h2>
                <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
                  Conteúdo pronto para publicar no LinkedIn, Instagram e TikTok. Copie, adapte e publique agora.
                </p>
              </div>

              {/* Platform selector */}
              <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
                {(["linkedin", "instagram", "tiktok"] as const).map((p) => {
                  const icons: Record<string, string> = { linkedin: "💼", instagram: "📸", tiktok: "🎵" };
                  const colors: Record<string, string> = { linkedin: "#0077b5", instagram: "#e1306c", tiktok: "#000" };
                  return (
                    <button
                      key={p}
                      onClick={() => setActivePlatform(p)}
                      style={{
                        padding: "10px 24px",
                        borderRadius: 10,
                        border: `2px solid ${activePlatform === p ? colors[p] : "rgba(255,255,255,0.1)"}`,
                        background: activePlatform === p ? `${colors[p]}22` : "transparent",
                        color: activePlatform === p ? "#fff" : "#64748b",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        transition: "all 0.2s",
                      }}
                    >
                      {icons[p]} {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  );
                })}
              </div>

              {/* Content cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {platformData.map((item: any) => (
                  <div key={item.id} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    padding: "24px 28px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
                      <div>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#8b5cf6",
                          background: "rgba(139,92,246,0.15)",
                          padding: "3px 10px",
                          borderRadius: 6,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}>{item.type}</span>
                        <p style={{ fontSize: 16, fontWeight: 700, margin: "10px 0 0", color: "#f1f5f9" }}>"{item.hook}"</p>
                      </div>
                      <button
                        onClick={() => navigator.clipboard?.writeText(item.hook + "\n\n" + (item.body || item.caption || item.slides?.join("\n") || item.script?.join("\n") || ""))}
                        style={{
                          background: "rgba(139,92,246,0.1)",
                          border: "1px solid rgba(139,92,246,0.3)",
                          color: "#a78bfa",
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        📋 Copiar
                      </button>
                    </div>

                    {/* Corpo do conteúdo */}
                    {item.body && (
                      <pre style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 14px", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6 }}>
                        {item.body}
                      </pre>
                    )}
                    {item.caption && (
                      <pre style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 14px", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6 }}>
                        {item.caption}
                      </pre>
                    )}
                    {item.slides && (
                      <div style={{ margin: "0 0 14px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6", marginBottom: 8 }}>SLIDES:</div>
                        {item.slides.map((s: string, i: number) => (
                          <div key={i} style={{ fontSize: 13, color: "#94a3b8", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.script && (
                      <div style={{ margin: "0 0 14px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6", marginBottom: 8 }}>SCRIPT:</div>
                        {item.script.map((s: string, i: number) => (
                          <div key={i} style={{ fontSize: 13, color: "#94a3b8", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.content && (
                      <div style={{ margin: "0 0 14px" }}>
                        {item.content.map((s: string, i: number) => (
                          <div key={i} style={{ fontSize: 13, color: "#94a3b8", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.trending_sounds && (
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                        🎵 <strong>Sons trending:</strong> {item.trending_sounds.join(" · ")}
                      </div>
                    )}

                    {/* Hashtags */}
                    {item.hashtags && (
                      <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, wordBreak: "break-word" }}>
                        {item.hashtags}
                      </div>
                    )}
                    {item.cta && (
                      <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#22d3ee" }}>
                        👉 {item.cta}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* CTA Download estratégia completa */}
              <div style={{
                marginTop: 36,
                background: "linear-gradient(135deg, rgba(14,165,233,0.1), rgba(124,58,237,0.1))",
                border: "1px solid rgba(14,165,233,0.25)",
                borderRadius: 14,
                padding: "24px 28px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}>
                <div>
                  <h4 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>📅 Calendário editorial completo — 30 dias</h4>
                  <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>42 posts prontos para os 3 canais com datas, formatos e CTAs. Incluso no plano Premium.</p>
                </div>
                <button
                  onClick={() => setLocation("/pricing")}
                  style={{
                    background: "linear-gradient(135deg,#0ea5e9,#7c3aed)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "11px 24px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Assinar Premium →
                </button>
              </div>
            </div>
          )}

          {/* ══ TAB: E-BOOKS ═════════════════════════════════════════════════ */}
          {activeTab === "ebooks" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>📖 E-books & Materiais</h2>
                <p style={{ fontSize: 14, color: "#94a3b8" }}>Guias práticos para dominar campanhas, copy e análise de mercado com IA.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                {[
                  { emoji: "📘", title: "Guia Completo de Campanhas com IA", desc: "Do briefing ao relatório final — passo a passo com o MECPro.", pages: 42, free: true },
                  { emoji: "🔍", title: "Manual de Análise de Concorrentes", desc: "Como mapear o mercado e encontrar oportunidades com inteligência artificial.", pages: 38, free: true },
                  { emoji: "✍️", title: "Copywriting com IA — 50 Templates", desc: "50 modelos prontos de copy para anúncios, e-mails e landing pages.", pages: 56, free: false },
                  { emoji: "📊", title: "Métricas que Importam no Marketing Digital", desc: "Quais KPIs acompanhar e como interpretar os dados da sua campanha.", pages: 30, free: true },
                ].map((book, i) => (
                  <div key={i} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: 90,
                      background: "linear-gradient(135deg, #1e1b4b, #312e81)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 44,
                      position: "relative",
                    }}>
                      {book.emoji}
                      {book.free && (
                        <span style={{ position: "absolute", top: 10, right: 10, background: "#10b981", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6 }}>
                          GRÁTIS
                        </span>
                      )}
                    </div>
                    <div style={{ padding: "16px 18px 20px" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>{book.title}</h3>
                      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>{book.desc}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>📄 {book.pages} páginas</span>
                        <button
                          onClick={() => setLocation(book.free ? "/ebooks" : "/pricing")}
                          style={{
                            background: book.free ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#7c3aed,#4c1d95)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {book.free ? "Baixar →" : "PRO →"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
