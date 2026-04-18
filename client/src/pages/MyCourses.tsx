import { useState } from "react";
import BackButton from "@/components/BackButton";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";

const ENROLLED_COURSES = [
  {
    id: "1", slug: "marketing-meta-ads", title: "Marketing no Meta Ads do Zero ao Avançado",
    thumb: "📘", progress: 65, totalLessons: 48, completedLessons: 31,
    lastLesson: { id: "2-1", title: "Públicos personalizados vs. Lookalike" },
    category: "Tráfego Pago", duration: "12h 30min", instructor: "Equipe MECPro"
  },
  {
    id: "2", slug: "analise-concorrentes-ia", title: "Análise de Concorrentes com IA",
    thumb: "🔍", progress: 20, totalLessons: 24, completedLessons: 5,
    lastLesson: { id: "1-3", title: "Interpretando os resultados do Raio-X" },
    category: "IA & Marketing", duration: "6h 15min", instructor: "Equipe MECPro"
  },
  {
    id: "6", slug: "relatorios-e-metricas", title: "Relatórios e Métricas que Importam",
    thumb: "📊", progress: 100, totalLessons: 18, completedLessons: 18,
    lastLesson: { id: "3-6", title: "Conclusão: seu sistema de relatórios" },
    category: "Analytics", duration: "4h 30min", instructor: "Equipe MECPro",
    completed: true
  },
];

export default function MyCourses() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "in-progress" | "completed">("all");

  const filtered = ENROLLED_COURSES.filter(c => {
    if (filter === "in-progress") return c.progress < 100;
    if (filter === "completed") return c.progress === 100;
    return true;
  });

  const totalTime = "23h 15min";
  const avgProgress = Math.round(ENROLLED_COURSES.reduce((acc, c) => acc + c.progress, 0) / ENROLLED_COURSES.length);

  return (
    <Layout>
      <BackButton to="/academy" label="Academia" style={{ marginBottom: 20 }} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
          Meus Cursos
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Acompanhe seu progresso nos cursos matriculados</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "📚", label: "Cursos matriculados", value: ENROLLED_COURSES.length, color: "#eff6ff" },
          { icon: "◎", label: "Cursos concluídos", value: ENROLLED_COURSES.filter(c => c.progress === 100).length, color: "#f0fdf4" },
          { icon: "📈", label: "Progresso médio", value: `${avgProgress}%`, color: "#fef3c7" },
          { icon: "🕐", label: "Total assistido", value: "15h", color: "#fdf4ff" },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10 }}>{s.icon}</div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["all", "in-progress", "completed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            background: filter === f ? "var(--black)" : "transparent",
            color: filter === f ? "white" : "var(--muted)",
            transition: "all .15s"
          }}>
            {f === "all" ? "Todos" : f === "in-progress" ? "Em andamento" : "Concluídos"}
          </button>
        ))}
        <button className="btn btn-sm btn-green" onClick={() => setLocation("/courses")} style={{ marginLeft: "auto" }}>
          + Explorar mais cursos
        </button>
      </div>

      {/* Cursos em andamento */}
      {filtered.length === 0 ? (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--dark)", marginBottom: 6 }}>Nenhum curso aqui</p>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Explore nosso catálogo de cursos.</p>
          <button className="btn btn-md btn-green" onClick={() => setLocation("/courses")}>Ver catálogo</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map(course => (
            <div key={course.id} style={{
              background: "white", border: "1px solid var(--border)", borderRadius: 16,
              padding: "20px 24px", display: "flex", gap: 20, alignItems: "center"
            }}>
              {/* Thumb */}
              <div style={{
                width: 80, height: 80, borderRadius: 14, flexShrink: 0,
                background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36
              }}>
                {course.thumb}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--off)", padding: "2px 8px", borderRadius: 5 }}>{course.category}</span>
                  {course.progress === 100 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green-dk)", background: "var(--green-l)", padding: "2px 8px", borderRadius: 5 }}>◎ Concluído</span>}
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--dark)", marginBottom: 4 }}>{course.title}</p>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                  {course.completedLessons}/{course.totalLessons} aulas • {course.duration}
                </p>
                {/* Barra de progresso */}
                <div style={{ width: "100%", height: 6, background: "var(--off)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ height: "100%", width: `${course.progress}%`, background: course.progress === 100 ? "var(--green)" : "#2563eb", borderRadius: 3, transition: "width .4s" }} />
                </div>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>{course.progress}% concluído</p>
              </div>

              {/* Ações */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                <button className="btn btn-sm btn-green"
                  onClick={() => setLocation(`/lesson/${course.lastLesson.id}`)}>
                  {course.progress === 100 ? "Rever curso" : "▶ Continuar"}
                </button>
                <button className="btn btn-sm btn-ghost"
                  onClick={() => setLocation(`/courses/${course.slug}`)}>
                  Ver detalhes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Próximos cursos recomendados */}
      <div style={{ marginTop: 28, background: "var(--off)", borderRadius: 16, padding: "20px 24px" }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 12 }}>
          💡 Recomendado para você
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          Com base nos seus cursos, você pode gostar de:
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { thumb: "✍️", title: "Copywriting de Alta Conversão", slug: "copywriting-conversao" },
            { thumb: "🛒", title: "Estratégia para E-commerce", slug: "estrategia-ecommerce" },
          ].map(r => (
            <div key={r.slug} onClick={() => setLocation(`/courses/${r.slug}`)}
              style={{ flex: 1, background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--green)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
            >
              <span style={{ fontSize: 24 }}>{r.thumb}</span>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{r.title}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
