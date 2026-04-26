import BackButton from "@/components/BackButton";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { calcCampaignScore } from "@/lib/campaignScore";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const MODULES = [
  { key: "client",      num: 1, title: "Perfil do Cliente",       icon: "👤", desc: "Dados estratégicos do cliente",      path: "client" },
  { key: "competitors", num: 2, title: "Análise de Concorrentes", icon: "🔍", desc: "Inteligência competitiva",            path: "competitors" },
  { key: "market",      num: 3, title: "Análise de Mercado",      icon: "📊", desc: "Insights de mercado com IA",         path: "market" },
  { key: "campaign",    num: 4, title: "Gerar Campanha",          icon: "◈", desc: "Campanha completa gerada pela IA",   path: "campaign" },
];

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: project, isLoading } = trpc.projects.get.useQuery({ id }, { enabled: !!id });
  const { data: profile }             = trpc.clientProfile.get.useQuery({ projectId: id }, { enabled: !!id });
  const { data: competitors = [] }    = trpc.competitors.list.useQuery({ projectId: id }, { enabled: !!id });
  const { data: campaigns = [] }      = trpc.campaigns.list.useQuery({ projectId: id }, { enabled: !!id });
  const { data: clientProfile }        = trpc.clientProfile.get.useQuery({ projectId: id }, { enabled: !!id });
  const deleteProject                 = (trpc as any).projects?.delete?.useMutation?.({
    onSuccess: () => setLocation("/projects"),
    onError:   (e: any) => alert("Erro ao deletar: " + e.message),
  }) ?? { mutate: () => {} };

  if (isLoading) return <Layout><div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Carregando...</div></Layout>;
  if (!project)  return <Layout><div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Projeto não encontrado</div></Layout>;

  // ── Percentual de conclusão ───────────────────────────────────────────────
  const hasMarket = !!(project as any)?.marketAnalysis || (campaigns as any[]).length > 0;
  const hasCampaign = (campaigns as any[]).length > 0;
  const latestCampaign = (campaigns as any[])[0] || null;
  const campaignScore = latestCampaign ? calcCampaignScore(latestCampaign, clientProfile) : null;

  const progress = [
    !!profile,                          // M1: Perfil do cliente
    (competitors as any[]).length > 0,  // M2: Concorrentes analisados
    hasMarket,                          // M3: Mercado analisado
    hasCampaign,                        // M4: Campanha gerada
  ];
  const pct = Math.round((progress.filter(Boolean).length / 4) * 100);

  // ── Indicadores de publicação por plataforma ─────────────────────────────
  const publishedMeta   = (campaigns as any[]).some((c: any) => c.metaCampaignId || c.publishedAdId);
  const publishedGoogle = (campaigns as any[]).some((c: any) => c.googleCampaignId);
  const publishedTikTok = (campaigns as any[]).some((c: any) => c.tiktokCampaignId);
  const totalPublished  = [publishedMeta, publishedGoogle, publishedTikTok].filter(Boolean).length;
  const publishPct      = hasCampaign ? Math.round((totalPublished / 3) * 100) : 0;

  return (
    <Layout>
      {/* Modal confirmação de delete */}
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
        {/* Header com botão voltar e deletar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/projects")} style={{ paddingLeft: 0 }}>
            ← Projetos
          </button>
          <button onClick={() => setConfirmDelete(true)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            🗑️ Deletar projeto
          </button>
        </div>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, color: "var(--black)", marginBottom: 4 }}>
          {(project as any).name}
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span className={`badge ${(project as any).status === "completed" ? "badge-green" : (project as any).status === "analyzing" ? "badge-navy" : "badge-gray"}`}>
            {(project as any).status === "completed" ? "Concluído" : (project as any).status === "analyzing" ? "Analisando" : (project as any).status === "draft" ? "Rascunho" : "Arquivado"}
          </span>
        </div>

        {/* Progresso do projeto */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>Progresso do projeto</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green-d)" }}>{pct}%</span>
          </div>
          <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        </div>

        {/* Indicadores de publicação por plataforma */}
        {hasCampaign && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
              background: publishedMeta ? "#dcfce7" : "#f1f5f9",
              color: publishedMeta ? "#166534" : "#94a3b8" }}>
              {publishedMeta ? "◎" : "⭕"} Meta Ads
            </span>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
              background: publishedGoogle ? "#dcfce7" : "#f1f5f9",
              color: publishedGoogle ? "#166534" : "#94a3b8" }}>
              {publishedGoogle ? "◎" : "⭕"} Google Ads
            </span>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700,
              background: publishedTikTok ? "#dcfce7" : "#f1f5f9",
              color: publishedTikTok ? "#166534" : "#94a3b8" }}>
              {publishedTikTok ? "◎" : "⭕"} TikTok Ads
            </span>
            {totalPublished > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8" }}>
                📊 {publishPct}% publicado
              </span>
            )}
            {campaignScore && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 800,
                background: campaignScore.bg, color: campaignScore.color,
                display: "inline-flex", alignItems: "center", gap: 4,
                border: `1px solid ${campaignScore.color}33` }}>
                🔍 Auditoria: {campaignScore.grade}/{campaignScore.score}
                {campaignScore.isMock && " ⚠️"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Módulos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {MODULES.map((mod, i) => {
          const done = progress[i];
          return (
            <div key={mod.key} className="card card-green" style={{ cursor: "pointer", opacity: i > 0 && !progress[i-1] ? .5 : 1 }}
              onClick={() => { if (i === 0 || progress[i-1]) setLocation(`/projects/${id}/${mod.path}`); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: done ? "var(--green-l)" : "var(--off)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {mod.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: done ? "var(--green-d)" : "var(--muted)", letterSpacing: ".5px", marginBottom: 2 }}>MÓDULO {mod.num}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>{mod.title}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{mod.desc}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {done ? (
                    <span style={{ fontSize: 11, fontWeight: 700, background: "var(--green-l)", color: "var(--green-d)", padding: "3px 10px", borderRadius: 20 }}>◎ Concluído</span>
                  ) : (
                    <button className="btn btn-sm btn-primary"
                      disabled={i > 0 && !progress[i-1]}>
                      {i > 0 && !progress[i-1] ? "Complete o módulo anterior" : "Iniciar →"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
