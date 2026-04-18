import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

const MOCK_COURSES = [
  { id: 1, title: "Tráfego Pago do Zero",        category: "Marketing",  lessons: 24, students: 142, status: "published", thumb: "◈" },
  { id: 2, title: "Copywriting Avançado",         category: "Conteúdo",   lessons: 18, students: 89,  status: "published", thumb: "✍️" },
  { id: 3, title: "Meta Ads para Agências",       category: "Marketing",  lessons: 32, students: 63,  status: "draft",     thumb: "📘" },
  { id: 4, title: "Análise de Dados com IA",      category: "Tecnologia", lessons: 15, students: 0,   status: "draft",     thumb: "🤖" },
];

export default function AdminCourses() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState("all");

  const filtered = MOCK_COURSES.filter(c => filter === "all" || c.status === filter);

  return (
    <Layout>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Cursos</h1>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{MOCK_COURSES.length} cursos cadastrados</p>
        </div>
        <button className="btn btn-md btn-green" onClick={() => alert("Editor de curso em breve.")}>+ Novo curso</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["all", "published", "draft"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline"}`}>
            {f === "all" ? "Todos" : f === "published" ? "Publicados" : "Rascunhos"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {filtered.map(course => (
          <div key={course.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 22 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--off)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{course.thumb}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 3 }}>{course.title}</p>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>{course.category}</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: course.status === "published" ? "var(--green-xl)" : "#fef9c3", color: course.status === "published" ? "var(--green-dk)" : "#713f12" }}>
                {course.status === "published" ? "PUBLICADO" : "RASCUNHO"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>{course.lessons}</p>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>Aulas</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>{course.students}</p>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>Alunos</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm btn-outline" onClick={() => setLocation(`/admin/courses/${course.id}/lessons`)}>Aulas</button>
              <button className="btn btn-sm btn-outline">Editar</button>
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto", color: "#ef4444" }}>Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
