import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const MODULES = [
  { key: "client",      num: 1, title: "Perfil do Cliente",       icon: "👤", desc: "Dados estratégicos do cliente",      path: "client" },
  { key: "competitors", num: 2, title: "Análise de Concorrentes", icon: "🔍", desc: "Inteligência competitiva",            path: "competitors" },
  { key: "market",      num: 3, title: "Análise de Mercado",      icon: "📊", desc: "Insights de mercado com IA",         path: "market" },
  { key: "campaign",    num: 4, title: "Gerar Campanha",          icon: "🚀", desc: "Campanha completa gerada pela IA",   path: "campaign" },
];

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const { data: project, isLoading } = trpc.projects.get.useQuery({ id }, { enabled: !!id });
  const { data: profile } = trpc.clientProfile.get.useQuery({ projectId: id }, { enabled: !!id });
  const { data: competitors = [] } = trpc.competitors.list.useQuery({ projectId: id }, { enabled: !!id });
  const { data: campaigns = [] } = trpc.campaigns.list.useQuery({ projectId: id }, { enabled: !!id });

  if (isLoading) return <Layout><div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Carregando...</div></Layout>;
  if (!project) return <Layout><div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Projeto não encontrado</div></Layout>;

  const progress = [!!profile, competitors.length > 0, false, campaigns.length > 0];
  const pct = Math.round((progress.filter(Boolean).length / 4) * 100);

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/projects")} style={{ paddingLeft: 0, marginBottom: 12 }}>← Projetos</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>{project.name}</h1>
            {project.description && <p style={{ fontSize: 14, color: "var(--muted)" }}>{project.description}</p>}
          </div>
          <span className={`badge ${project.status === "completed" ? "badge-green" : project.status === "analyzing" ? "badge-navy" : "badge-gray"}`}>
            {project.status === "completed" ? "Concluído" : project.status === "analyzing" ? "Analisando" : project.status === "draft" ? "Rascunho" : "Arquivado"}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>Progresso do projeto</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green-d)" }}>{pct}%</span>
        </div>
        <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      </div>

      {/* Modules */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {MODULES.map((mod, i) => {
          const done = progress[i];
          return (
            <div key={mod.key} className="card card-green" style={{ cursor: "pointer", opacity: i > 0 && !progress[i-1] ? .5 : 1 }}
              onClick={() => { if (i === 0 || progress[i-1]) setLocation(`/projects/${id}/${mod.path}`); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: done ? "var(--green-l)" : "var(--off2)", border: `1px solid ${done ? "var(--green-xl)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{mod.icon}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: done ? "var(--green-d)" : "var(--muted)", letterSpacing: ".5px", marginBottom: 2 }}>MÓDULO {mod.num}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", fontFamily: "var(--font-display)" }}>{mod.title}</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  {done ? <span className="badge badge-green" style={{ fontSize: 11 }}>✓ Feito</span> : <span className="badge badge-gray" style={{ fontSize: 11 }}>Pendente</span>}
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{mod.desc}</p>
              <button className={`btn btn-sm ${done ? "btn-outline" : "btn-green"} btn-full`}
                disabled={i > 0 && !progress[i-1]}>
                {done ? "Editar" : i > 0 && !progress[i-1] ? "Complete o módulo anterior" : "Iniciar →"}
              </button>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
