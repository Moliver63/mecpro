import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout/Layout";

const MOCK_LESSONS = [
  { id: 1, title: "Introdução ao módulo",          duration: "08:20", order: 1, status: "published", type: "video" },
  { id: 2, title: "Conceitos fundamentais",        duration: "15:30", order: 2, status: "published", type: "video" },
  { id: 3, title: "Exercício prático 1",           duration: "—",     order: 3, status: "published", type: "exercise" },
  { id: 4, title: "Configuração avançada",         duration: "22:15", order: 4, status: "draft",     type: "video" },
  { id: 5, title: "Quiz de revisão",               duration: "—",     order: 5, status: "published", type: "quiz" },
];

export default function AdminCourseLessons() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/admin/courses")} style={{ paddingLeft: 0, marginBottom: 10 }}>← Cursos</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Aulas do Curso #{params.id}</h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>{MOCK_LESSONS.length} aulas cadastradas</p>
          </div>
          <button className="btn btn-md btn-green" onClick={() => alert("Editor de aula em breve.")}>+ Nova aula</button>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        {MOCK_LESSONS.map((l, i) => (
          <div key={l.id} style={{ padding: "16px 22px", borderBottom: i < MOCK_LESSONS.length - 1 ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--off)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "var(--muted)", cursor: "grab" }}>⋮⋮</div>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "white" }}>{l.order}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)", marginBottom: 2 }}>{l.title}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{l.type === "video" ? "🎬" : l.type === "exercise" ? "📝" : "❓"} {l.type}</span>
                {l.duration !== "—" && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>⏱ {l.duration}</span>}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: l.status === "published" ? "var(--green-xl)" : "#fef9c3", color: l.status === "published" ? "var(--green-dk)" : "#713f12" }}>
              {l.status === "published" ? "PUBLICADO" : "RASCUNHO"}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }}>Editar</button>
              <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, color: "#ef4444" }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
