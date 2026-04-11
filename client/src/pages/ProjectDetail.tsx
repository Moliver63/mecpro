import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
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
  const deleteProject = (trpc as any).projects?.delete?.useMutation?.({
    onSuccess: () => setLocation("/projects"),
    onError: (e: any) => alert("Erro ao deletar: " + e.message),
  }) ?? { mutate: () => {} };
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) return <Layout><div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Carregando...</div></Layout>;
  if (!project) return <Layout><div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Projeto não encontrado</div></Layout>;

  // Módulo 3: Análise de mercado concluída se tem dados reais
  const hasMarket = !!(project as any)?.marketAnalysis || (campaigns as any[]).length > 0;
  // Módulo 4: Campanha publicada se tem publishedAdId ou publishStatus
  const hasCampaignPublished = (campaigns as any[]).some((c: any) =>
    c.publishedAdId || c.publishStatus === "published" || c.metaCampaignId || c.googleCampaignId
  );
  const hasCampaign = (campaigns as any[]).length > 0;

  const progress = [
    !!profile,                          // M1: Perfil do cliente
    (competitors as any[]).length > 0,  // M2: Concorrentes analisados
    hasMarket,                          // M3: Mercado analisado
    hasCampaign,                        // M4: Campanha gerada
  ];
  const pct = Math.round((progress.filter(Boolean).length / 4) * 100);

  // Publicação: verifica se foi publicado em alguma plataforma
  const publishedMeta    = (campaigns as any[]).some((c: any) => c.metaCampaignId || c.publishedAdId);
  const publishedGoogle  = (campaigns as any[]).some((c: any) => c.googleCampaignId);
  const publishedTikTok  = (campaigns as any[]).some((c: any) => c.tiktokCampaignId);
  const totalPublished   = [publishedMeta, publishedGoogle, publishedTikTok].filter(Boolean).length;
  const publishPct       = hasCampaign ? Math.round((totalPublished / 3) * 100) : 0;

  return (
    <Layout>
      {/* Modal de confirmação de delete */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 16, padding: 32, maxWidth: 400, width: "90%", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Deletar projeto?</h3>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24, lineHeight: 1.5 }}>
              Esta ação é irreversível. Todos os dados do projeto, concorrentes e campanhas serão deletados permanentemente.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(false)}
                style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={() => { deleteProject.mutate({ id }); setConfirmDelete(false); }}
                style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#ef4444", color: "white", cursor: "pointer", fontWeight: 700 }}>
                Sim, deletar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/projects")} style={{ paddingLeft: 0 }}>← Projetos</button>
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
        {/* Indicadores de publicação por plataforma */}
        {hasCampaign && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
              background: publishedMeta ? "#dcfce7" : "#f1f5f9",
              color: publishedMeta ? "#166534" : "#94a3b8" }}>
              {publishedMeta ? "✅" : "⭕"} Meta Ads
            </span>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
              background: publishedGoogle ? "#dcfce7" : "#f1f5f9",
              color: publishedGoogle ? "#166534" : "#94a3b8" }}>
              {publishedGoogle ? "✅" : "⭕"} Google Ads
            </span>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
              background: publishedTikTok ? "#dcfce7" : "#f1f5f9",
              color: publishedTikTok ? "#166534" : "#94a3b8" }}>
              {publishedTikTok ? "✅" : "⭕"} TikTok Ads
            </span>
            {totalPublished > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8" }}>
                📊 {publishPct}% publicado
              </span>
            )}
          </div>
        )}
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
