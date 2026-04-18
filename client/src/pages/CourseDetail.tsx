import { useState } from "react";
import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const COURSES: Record<string, any> = {
  "campanha-do-zero-com-mecpro": {
    slug: "campanha-do-zero-com-mecpro", title: "Campanha do Zero com MECPro",
    desc: "Aprenda a criar uma campanha completa do zero usando todos os módulos da plataforma.",
    instructor: "Time MECPro", duration: "3h 20min", category: "Plataforma",
    level: "Iniciante", rating: 4.9, students: 2140, thumb: "◈", isPro: false,
    modules: [
      { title: "Módulo 1 – Introdução ao MECPro", lessons: [
        { id: "m1-1", title: "Visão geral da plataforma", duration: "12min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "m1-2", title: "Criando seu primeiro projeto", duration: "15min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "m1-3", title: "Navegando pelos módulos", duration: "10min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – Perfil do Cliente com IA", lessons: [
        { id: "m2-1", title: "Preenchendo o perfil com IA", duration: "18min", free: false, videoId: null },
        { id: "m2-2", title: "Dores, desejos e objeções", duration: "20min", free: false, videoId: null },
        { id: "m2-3", title: "Proposta de valor única", duration: "16min", free: false, videoId: null },
      ]},
      { title: "Módulo 3 – Geração de Campanha", lessons: [
        { id: "m3-1", title: "Analisando concorrentes", duration: "22min", free: false, videoId: null },
        { id: "m3-2", title: "Gerando a campanha com IA", duration: "25min", free: false, videoId: null },
        { id: "m3-3", title: "Exportando o relatório PDF", duration: "14min", free: false, videoId: null },
        { id: "m3-4", title: "Integrando com Meta Ads", duration: "18min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Criar projetos e perfis de cliente", "Gerar campanhas completas com IA", "Analisar concorrentes automaticamente", "Exportar relatórios profissionais em PDF", "Integrar com Meta Ads"],
  },
  "analise-de-concorrentes-ia": {
    slug: "analise-de-concorrentes-ia", title: "Análise de Concorrentes com IA",
    desc: "Domine a inteligência de concorrência do MECPro com 7 camadas de análise.",
    instructor: "Time MECPro", duration: "6h 15min", category: "Inteligência",
    level: "Intermediário", rating: 4.9, students: 856, thumb: "🔍", isPro: true,
    modules: [
      { title: "Módulo 1 – A Cascata 7 Camadas", lessons: [
        { id: "ac1-1", title: "Como funciona a análise do MECPro", duration: "18min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "ac1-2", title: "API Meta vs. Ads Library", duration: "14min", free: false, videoId: null },
        { id: "ac1-3", title: "Interpretando o Raio-X dos concorrentes", duration: "22min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – Estratégias com os Dados", lessons: [
        { id: "ac2-1", title: "Identificando padrões nos anúncios", duration: "24min", free: false, videoId: null },
        { id: "ac2-2", title: "IA para gerar insights competitivos", duration: "30min", free: false, videoId: null },
        { id: "ac2-3", title: "Campanhas baseadas na análise", duration: "28min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Monitorar concorrentes com MECPro", "Interpretar dados do Meta Ads Library", "Identificar estratégias da concorrência", "Usar IA para insights de mercado", "Criar campanhas baseadas em dados"],
  },
  "copy-com-ia-guia-pratico": {
    slug: "copy-com-ia-guia-pratico", title: "Copy com IA — Guia Prático",
    desc: "Escreva copies que convertem com a IA do MECPro: headlines, CTAs, anúncios e e-mails.",
    instructor: "Time MECPro", duration: "4h 10min", category: "Copywriting",
    level: "Intermediário", rating: 4.8, students: 1890, thumb: "✍️", isPro: false,
    modules: [
      { title: "Módulo 1 – Fundamentos de Copy com IA", lessons: [
        { id: "cp1-1", title: "O que é copywriting de conversão", duration: "14min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "cp1-2", title: "Como a IA do MECPro escreve copy", duration: "16min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "cp1-3", title: "Estrutura AIDA e PAS na prática", duration: "20min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – Headlines, CTAs e Anúncios", lessons: [
        { id: "cp2-1", title: "20 fórmulas de headline que convertem", duration: "25min", free: false, videoId: null },
        { id: "cp2-2", title: "CTAs irresistíveis com IA", duration: "18min", free: false, videoId: null },
        { id: "cp2-3", title: "Copy para Facebook e Instagram Ads", duration: "22min", free: false, videoId: null },
      ]},
      { title: "Módulo 3 – E-mails e Landing Pages", lessons: [
        { id: "cp3-1", title: "Sequência de e-mails com IA", duration: "28min", free: false, videoId: null },
        { id: "cp3-2", title: "Landing page de alta conversão", duration: "30min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Escrever headlines que param o scroll", "Criar CTAs que aumentam conversão", "Copy para anúncios com IA", "Sequências de e-mail automatizadas", "Landing pages persuasivas"],
  },
  "meta-ads-com-mecpro": {
    slug: "meta-ads-com-mecpro", title: "Meta Ads com MECPro",
    desc: "Automatize a criação de campanhas no Facebook e Instagram com segmentação inteligente por IA.",
    instructor: "Time MECPro", duration: "5h 30min", category: "Tráfego Pago",
    level: "Intermediário", rating: 4.8, students: 1240, thumb: "📘", isPro: true,
    modules: [
      { title: "Módulo 1 – Fundamentos do Meta Ads", lessons: [
        { id: "ma1-1", title: "Estrutura: Campanha → Conjunto → Anúncio", duration: "20min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "ma1-2", title: "Pixel do Facebook: instalação e eventos", duration: "18min", free: false, videoId: null },
        { id: "ma1-3", title: "Objetivos de campanha e quando usar", duration: "22min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – Integração MECPro + Meta", lessons: [
        { id: "ma2-1", title: "Configurando Access Token e Ad Account", duration: "15min", free: false, videoId: null },
        { id: "ma2-2", title: "Publicando campanhas direto do MECPro", duration: "25min", free: false, videoId: null },
        { id: "ma2-3", title: "Upload de imagens e image_hash", duration: "20min", free: false, videoId: null },
        { id: "ma2-4", title: "Lead Forms e geração de leads", duration: "28min", free: false, videoId: null },
      ]},
      { title: "Módulo 3 – Otimização Avançada", lessons: [
        { id: "ma3-1", title: "Testes A/B de criativos com IA", duration: "22min", free: false, videoId: null },
        { id: "ma3-2", title: "Remarketing e públicos lookalike", duration: "26min", free: false, videoId: null },
        { id: "ma3-3", title: "Interpretando métricas e otimizando", duration: "24min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Conectar MECPro ao Meta Ads", "Publicar campanhas com um clique", "Configurar Pixel e conversões", "Criar públicos lookalike", "Otimizar campanhas com dados reais"],
  },
  "estrategia-social-media-ia": {
    slug: "estrategia-social-media-ia", title: "Estratégia de Social Media com IA",
    desc: "Monte calendário editorial completo para LinkedIn, Instagram e TikTok com IA.",
    instructor: "Time MECPro", duration: "4h 45min", category: "Social Media",
    level: "Iniciante", rating: 4.7, students: 978, thumb: "📱", isPro: false,
    modules: [
      { title: "Módulo 1 – Estratégia de Conteúdo", lessons: [
        { id: "ss1-1", title: "Pilares de conteúdo para cada rede social", duration: "18min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "ss1-2", title: "Calendário editorial com IA", duration: "20min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "ss1-3", title: "Frequência e horários ideais", duration: "14min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – LinkedIn, Instagram e TikTok", lessons: [
        { id: "ss2-1", title: "Conteúdo de autoridade no LinkedIn", duration: "24min", free: false, videoId: null },
        { id: "ss2-2", title: "Reels e carrosséis no Instagram", duration: "28min", free: false, videoId: null },
        { id: "ss2-3", title: "Scripts de TikTok que viralizam", duration: "22min", free: false, videoId: null },
        { id: "ss2-4", title: "Usando o MECPro Academy para criar conteúdo", duration: "18min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Calendário editorial com IA", "Conteúdo para LinkedIn, Instagram e TikTok", "Scripts de Reels e TikTok", "Carrosséis de alta performance", "Medir e otimizar engajamento"],
  },
  "relatorios-pdf-metricas": {
    slug: "relatorios-pdf-metricas", title: "Relatórios PDF & Métricas que Importam",
    desc: "Gere relatórios profissionais em PDF e interprete métricas para decisões orientadas por dados.",
    instructor: "Time MECPro", duration: "2h 50min", category: "Analytics",
    level: "Iniciante", rating: 4.8, students: 1120, thumb: "📊", isPro: false,
    modules: [
      { title: "Módulo 1 – Métricas Essenciais", lessons: [
        { id: "rp1-1", title: "CPM, CPC, CTR, CPA — o que realmente importa", duration: "20min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "rp1-2", title: "ROAS vs. ROI: diferenças e quando usar", duration: "16min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "rp1-3", title: "Funil de conversão e taxas de cada etapa", duration: "18min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – Relatórios com MECPro", lessons: [
        { id: "rp2-1", title: "Gerando relatório PDF em 1 clique", duration: "14min", free: false, videoId: null },
        { id: "rp2-2", title: "Exportando para XLSX e Google Sheets", duration: "16min", free: false, videoId: null },
        { id: "rp2-3", title: "Apresentando resultados para o cliente", duration: "20min", free: false, videoId: null },
        { id: "rp2-4", title: "Dashboard de métricas em tempo real", duration: "22min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Interpretar métricas que importam", "Gerar relatórios PDF profissionais", "Exportar dados para Excel", "Apresentar resultados para clientes", "Montar dashboards de acompanhamento"],
  },
  "google-ads-para-negocios": {
    slug: "google-ads-para-negocios", title: "Google Ads para Negócios com IA",
    desc: "Configure campanhas no Google Ads usando dados do MECPro. Palavras-chave, segmentação e ROI.",
    instructor: "Time MECPro", duration: "5h 00min", category: "Tráfego Pago",
    level: "Avançado", rating: 4.6, students: 643, thumb: "🎯", isPro: true,
    modules: [
      { title: "Módulo 1 – Google Ads do Zero", lessons: [
        { id: "ga1-1", title: "Estrutura: Customer → Campaign → AdGroup → Ad", duration: "22min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "ga1-2", title: "Tipos de campanha: Search, Display, YouTube, PMax", duration: "25min", free: false, videoId: null },
        { id: "ga1-3", title: "Estratégias de lance: CPA, ROAS, Maximizar", duration: "20min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – Integração MECPro + Google", lessons: [
        { id: "ga2-1", title: "Obtendo Developer Token e credenciais OAuth", duration: "18min", free: false, videoId: null },
        { id: "ga2-2", title: "Publicando campanha Search com MECPro", duration: "28min", free: false, videoId: null },
        { id: "ga2-3", title: "Keywords e negativas geradas por IA", duration: "24min", free: false, videoId: null },
        { id: "ga2-4", title: "Responsive Search Ads com IA", duration: "22min", free: false, videoId: null },
      ]},
      { title: "Módulo 3 – Otimização de ROI", lessons: [
        { id: "ga3-1", title: "Quality Score e como melhorar", duration: "20min", free: false, videoId: null },
        { id: "ga3-2", title: "Análise de termos de pesquisa", duration: "18min", free: false, videoId: null },
        { id: "ga3-3", title: "Relatórios de conversão e ROAS", duration: "22min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Criar campanhas Search, Display e YouTube", "Integrar MECPro com Google Ads API", "Gerar palavras-chave com IA", "Otimizar lances por CPA e ROAS", "Melhorar Quality Score"],
  },
  "estrategia-ecommerce-ia": {
    slug: "estrategia-ecommerce-ia", title: "Estratégia de E-commerce com IA",
    desc: "Aplique o MECPro para e-commerces: sazonalidade, remarketing, promoções e crescimento de ticket médio.",
    instructor: "Time MECPro", duration: "6h 00min", category: "E-commerce",
    level: "Avançado", rating: 4.7, students: 512, thumb: "🛒", isPro: true,
    modules: [
      { title: "Módulo 1 – E-commerce e Sazonalidade", lessons: [
        { id: "ec1-1", title: "Calendário sazonal do e-commerce brasileiro", duration: "20min", free: true, videoId: "dQw4w9WgXcQ" },
        { id: "ec1-2", title: "Análise de concorrentes em marketplaces", duration: "22min", free: false, videoId: null },
        { id: "ec1-3", title: "Mapeando oportunidades com IA", duration: "18min", free: false, videoId: null },
      ]},
      { title: "Módulo 2 – Remarketing e Conversão", lessons: [
        { id: "ec2-1", title: "Funil de e-commerce: topo, meio e fundo", duration: "24min", free: false, videoId: null },
        { id: "ec2-2", title: "Campanhas de carrinho abandonado", duration: "26min", free: false, videoId: null },
        { id: "ec2-3", title: "Públicos de clientes e lookalike", duration: "22min", free: false, videoId: null },
        { id: "ec2-4", title: "Catálogo dinâmico no Meta Ads", duration: "28min", free: false, videoId: null },
      ]},
      { title: "Módulo 3 – Crescimento e Escala", lessons: [
        { id: "ec3-1", title: "Estratégias para aumentar ticket médio", duration: "22min", free: false, videoId: null },
        { id: "ec3-2", title: "Upsell e cross-sell com IA", duration: "20min", free: false, videoId: null },
        { id: "ec3-3", title: "Escalando campanhas de forma sustentável", duration: "25min", free: false, videoId: null },
      ]},
    ],
    whatYouLearn: ["Planejar campanhas sazonais com IA", "Configurar remarketing para e-commerce", "Criar públicos de alta conversão", "Usar catálogo dinâmico no Meta Ads", "Escalar campanhas com ROI positivo"],
  },
};

export default function CourseDetail() {
  const [, setLocation] = useLocation();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [openModule, setOpenModule] = useState<number | null>(0);

  const { data: progressData = [] } = (trpc as any).academy?.getCourseProgress?.useQuery?.(
    { courseSlug: slug }, { enabled: !!slug }
  ) ?? { data: [] };

  const completedIds = new Set((progressData as any[]).filter(p => p.completed).map((p: any) => p.lessonId));
  const course = COURSES[slug];
  const totalLessons = course?.modules?.reduce((acc: number, m: any) => acc + m.lessons.length, 0) ?? 0;
  const progressPct = totalLessons > 0 ? Math.round((completedIds.size / totalLessons) * 100) : 0;

  if (!course) {
    return (
      <Layout>
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <p style={{ fontSize: 15, color: "var(--muted)" }}>Curso não encontrado</p>
          <button className="btn btn-sm btn-green" style={{ marginTop: 16 }} onClick={() => setLocation("/academy")}>← Voltar para Academy</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/academy")} style={{ paddingLeft: 0, marginBottom: 16 }}>← Academy</button>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) clamp(260px,32%,340px)", gap: 28, alignItems: "flex-start" }}>
        <div>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", borderRadius: 18, padding: "32px 28px", marginBottom: 24, color: "white" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>{course.thumb}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ background: "rgba(255,255,255,.1)", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, color: "#cbd5e1" }}>{course.category}</span>
              <span style={{ background: "rgba(255,255,255,.1)", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, color: "#cbd5e1" }}>{course.level}</span>
              <span style={{ background: course.isPro ? "#7c3aed" : "#10b981", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6 }}>{course.isPro ? "PRO" : "GRATUITO"}</span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, marginBottom: 10, lineHeight: 1.2 }}>{course.title}</h1>
            <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>{course.desc}</p>
            <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>⭐ {course.rating} ({course.students.toLocaleString()} alunos)</span>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>🕐 {course.duration}</span>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>📖 {totalLessons} aulas</span>
            </div>
            {completedIds.size > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
                  <span>Seu progresso</span><span>{completedIds.size}/{totalLessons} aulas — {progressPct}%</span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${progressPct}%`, background: "#10b981", borderRadius: 3, transition: "width .3s" }} />
                </div>
              </div>
            )}
          </div>

          {/* O que vai aprender */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", marginBottom: 24 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>🎯 O que você vai aprender</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {course.whatYouLearn?.map((w: string, i: number) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--green)", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: "var(--body)" }}>{w}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Conteúdo */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, color: "var(--black)" }}>📚 Conteúdo do curso</h2>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{course.modules?.length} módulos • {totalLessons} aulas • {course.duration}</p>
            </div>
            {course.modules?.map((mod: any, mi: number) => (
              <div key={mi} style={{ borderBottom: "1px solid var(--border)" }}>
                <button onClick={() => setOpenModule(openModule === mi ? null : mi)}
                  style={{ width: "100%", padding: "16px 24px", background: openModule === mi ? "var(--off)" : "white", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)" }}>{mod.title}</p>
                    <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{mod.lessons.length} aulas • {mod.lessons.filter((l: any) => completedIds.has(l.id)).length} concluídas</p>
                  </div>
                  <span style={{ fontSize: 14, color: "var(--muted)", transform: openModule === mi ? "rotate(90deg)" : "none", transition: "transform .2s" }}>▶</span>
                </button>
                {openModule === mi && mod.lessons.map((lesson: any) => {
                  const done = completedIds.has(lesson.id);
                  const canAccess = lesson.free || !course.isPro;
                  return (
                    <div key={lesson.id}
                      onClick={() => canAccess ? setLocation(`/lesson/${lesson.id}?course=${slug}`) : null}
                      style={{ padding: "12px 24px 12px 44px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: canAccess ? "pointer" : "default", background: "white" }}
                      onMouseEnter={e => { if (canAccess) e.currentTarget.style.background = "var(--off)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "white"; }}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 14 }}>{done ? "◎" : canAccess ? "▶️" : "🔒"}</span>
                        <span style={{ fontSize: 13, color: "var(--body)" }}>{lesson.title}</span>
                        {lesson.free && <span style={{ fontSize: 10, background: "var(--green-l)", color: "var(--green-dk)", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>GRÁTIS</span>}
                        {done && <span style={{ fontSize: 10, background: "#dcfce7", color: "#16a34a", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>CONCLUÍDA</span>}
                      </div>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{lesson.duration}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ position: "sticky", top: 20 }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.08)" }}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 10 }}>{course.thumb}</div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>{course.isPro ? "Plano Pro" : "Gratuito"}</p>
              {course.isPro && <p style={{ fontSize: 12, color: "var(--muted)" }}>Disponível no plano Premium ou VIP</p>}
            </div>
            <div style={{ padding: "20px 22px" }}>
              <button className="btn btn-md btn-full btn-green"
                onClick={() => {
                  const first = course.modules?.[0]?.lessons?.find((l: any) => l.free || !course.isPro);
                  if (first) setLocation(`/lesson/${first.id}?course=${slug}`);
                  else setLocation("/pricing");
                }}>
                {course.isPro ? "⭐ Assinar para acessar" : "▶ Começar agora"}
              </button>
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { icon: "🕐", text: `${course.duration} de conteúdo` },
                  { icon: "📖", text: `${totalLessons} aulas` },
                  { icon: "📱", text: "Acesso em qualquer dispositivo" },
                  { icon: "◆", text: "Certificado de conclusão" },
                  { icon: "◈", text: `${course.rating}/5 (${course.students.toLocaleString()} alunos)` },
                  { icon: "📊", text: `Seu progresso: ${progressPct}%` },
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 14 }}>{f.icon}</span>
                    <span style={{ fontSize: 13, color: "var(--body)" }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
