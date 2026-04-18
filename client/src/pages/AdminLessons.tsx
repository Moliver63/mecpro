import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const MOCK_LESSONS_ADMIN = [
  { id: "l1", courseId: "c1", courseName: "Marketing no Meta Ads", title: "O que é o Meta Ads", duration: "15min", order: 1, published: true, free: true, videoUrl: "" },
  { id: "l2", courseId: "c1", courseName: "Marketing no Meta Ads", title: "Criando sua conta de anunciante", duration: "12min", order: 2, published: true, free: true, videoUrl: "" },
  { id: "l3", courseId: "c1", courseName: "Marketing no Meta Ads", title: "Estrutura de campanhas", duration: "22min", order: 3, published: false, free: false, videoUrl: "" },
  { id: "l4", courseId: "c2", courseName: "Análise de Concorrentes com IA", title: "Como funciona a cascata 7 camadas", duration: "18min", order: 1, published: true, free: true, videoUrl: "" },
  { id: "l5", courseId: "c2", courseName: "Análise de Concorrentes com IA", title: "Interpretando o Raio-X", duration: "22min", order: 2, published: false, free: false, videoUrl: "" },
];

type Lesson = typeof MOCK_LESSONS_ADMIN[0];

export default function AdminLessons() {
  const [, setLocation] = useLocation();
  const [lessons, setLessons] = useState(MOCK_LESSONS_ADMIN);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [form, setForm] = useState({ title: "", duration: "", order: 1, free: false, videoUrl: "", courseId: "c1", courseName: "Marketing no Meta Ads" });
  const [saving, setSaving] = useState(false);

  const courses = [
    { id: "c1", name: "Marketing no Meta Ads" },
    { id: "c2", name: "Análise de Concorrentes com IA" },
  ];

  const courseFilter = ["Todos", ...courses.map(c => c.name)];

  const filtered = lessons.filter(l => {
    const matchSearch = !search || l.title.toLowerCase().includes(search.toLowerCase());
    const matchCourse = filterCourse === "Todos" || l.courseName === filterCourse;
    return matchSearch && matchCourse;
  });

  function openNew() {
    setEditLesson(null);
    setForm({ title: "", duration: "", order: lessons.length + 1, free: false, videoUrl: "", courseId: "c1", courseName: "Marketing no Meta Ads" });
    setShowForm(true);
  }

  function openEdit(lesson: Lesson) {
    setEditLesson(lesson);
    setForm({ title: lesson.title, duration: lesson.duration, order: lesson.order, free: lesson.free, videoUrl: lesson.videoUrl, courseId: lesson.courseId, courseName: lesson.courseName });
    setShowForm(true);
  }

  async function saveLesson() {
    if (!form.title) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    if (editLesson) {
      setLessons(prev => prev.map(l => l.id === editLesson.id ? { ...l, ...form } : l));
    } else {
      setLessons(prev => [...prev, { id: `l${Date.now()}`, published: false, ...form }]);
    }
    setSaving(false);
    setShowForm(false);
  }

  function togglePublish(id: string) {
    setLessons(prev => prev.map(l => l.id === id ? { ...l, published: !l.published } : l));
  }

  function deleteLesson(id: string) {
    if (confirm("Tem certeza que deseja excluir esta aula?")) {
      setLessons(prev => prev.filter(l => l.id !== id));
    }
  }

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/admin")} style={{ paddingLeft: 0, marginBottom: 8 }}>
          ← Painel Admin
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
              Gerenciar Aulas
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>Crie e gerencie as aulas de todos os cursos</p>
          </div>
          <button className="btn btn-md btn-green" onClick={openNew}>+ Nova Aula</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total de aulas", value: lessons.length, icon: "📖", color: "#eff6ff" },
          { label: "Publicadas", value: lessons.filter(l => l.published).length, icon: "◎", color: "#f0fdf4" },
          { label: "Não publicadas", value: lessons.filter(l => !l.published).length, icon: "⏸️", color: "#fef3c7" },
          { label: "Aulas gratuitas", value: lessons.filter(l => l.free).length, icon: "🆓", color: "#fdf4ff" },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10 }}>{s.icon}</div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar aula..."
          style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, outline: "none" }}
        />
        <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", cursor: "pointer" }}>
          {courseFilter.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Modal de formulário */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 24
        }}>
          <div style={{ background: "white", borderRadius: 20, padding: "32px 28px", width: "100%", maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)" }}>
                {editLesson ? "Editar Aula" : "Nova Aula"}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", display: "block", marginBottom: 5 }}>CURSO</label>
                <select value={form.courseId}
                  onChange={e => {
                    const c = courses.find(c => c.id === e.target.value);
                    setForm(f => ({ ...f, courseId: e.target.value, courseName: c?.name ?? "" }));
                  }}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }}>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", display: "block", marginBottom: 5 }}>TÍTULO DA AULA *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Introdução ao Meta Ads"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", display: "block", marginBottom: 5 }}>DURAÇÃO</label>
                  <input type="text" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                    placeholder="Ex: 15min"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", display: "block", marginBottom: 5 }}>ORDEM</label>
                  <input type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 1 }))}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", display: "block", marginBottom: 5 }}>URL DO VÍDEO</label>
                <input type="text" value={form.videoUrl} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                  placeholder="https://..."
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={form.free} onChange={e => setForm(f => ({ ...f, free: e.target.checked }))} />
                <span style={{ fontSize: 13, color: "var(--body)" }}>Aula gratuita (disponível sem assinatura)</span>
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button className="btn btn-md btn-green btn-full" onClick={saveLesson} disabled={saving}>
                {saving ? "Salvando..." : editLesson ? "💾 Salvar alterações" : "◎ Criar aula"}
              </button>
              <button className="btn btn-md btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela de aulas */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", background: "var(--off)" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{filtered.length} aulas encontradas</p>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📖</div>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>Nenhuma aula encontrada</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--off)" }}>
                {["#", "Título", "Curso", "Duração", "Gratuita", "Status", "Ações"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lesson => (
                <tr key={lesson.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>#{lesson.order}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--dark)", maxWidth: 200 }}>
                    <p style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.title}</p>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 5, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {lesson.courseName.substring(0, 20)}...
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>{lesson.duration}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className={`badge ${lesson.free ? "badge-green" : "badge-gray"}`} style={{ fontSize: 10 }}>
                      {lesson.free ? "Grátis" : "Pro"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span className={`badge ${lesson.published ? "badge-green" : "badge-gray"}`} style={{ fontSize: 10 }}>
                      {lesson.published ? "◎ Publicada" : "⏸️ Rascunho"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(lesson)} style={{ padding: "4px 10px" }}>✏️</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => togglePublish(lesson.id)} style={{ padding: "4px 10px", fontSize: 11 }}>
                        {lesson.published ? "⏸️" : "▶️"}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => deleteLesson(lesson.id)} style={{ padding: "4px 10px", color: "#ef4444" }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
