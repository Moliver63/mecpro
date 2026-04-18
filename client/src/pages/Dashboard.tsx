/**
 * Dashboard.tsx — Projetos + Campanhas com gestão completa
 */
import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";

const PLAT_ICON: Record<string, string> = { meta: "📘", google: "🔵", tiktok: "◼", both: "📊" };
const PLAT_COLOR: Record<string, string> = { meta: "#1877f2", google: "#1a73e8", tiktok: "#333", both: "#5856d6" };
const OBJ_LABEL: Record<string, string> = {
  leads: "Leads", traffic: "Tráfego", sales: "Vendas",
  branding: "Branding", app: "App", video_views: "Visualizações",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab]   = useState<"projects" | "campaigns">("projects");
  const [deleting,  setDeleting]    = useState<number | null>(null);
  const [selected,  setSelected]    = useState<Set<number>>(new Set());
  const [confirmDel, setConfirmDel] = useState<number | "bulk" | null>(null);

  const { data: projects, isLoading: loadingProj } = trpc.projects.list.useQuery();
  const { data: campaigns, isLoading: loadingCamp, refetch: refetchCamp } =
    (trpc as any).campaigns?.listAll?.useQuery?.() ?? { data: [], isLoading: false, refetch: () => {} };
  const { data: counts } =
    (trpc as any).campaigns?.countAll?.useQuery?.() ?? { data: { total: 0, byPlatform: {} } };

  const deleteMutation = (trpc as any).campaigns?.delete?.useMutation?.({
    onSuccess: () => { toast.success("Campanha excluída"); refetchCamp?.(); setDeleting(null); setConfirmDel(null); setSelected(new Set()); },
    onError: (e: any) => { toast.error(e.message); setDeleting(null); },
  });

  const archiveMutation = (trpc as any).campaigns?.archive?.useMutation?.({
    onSuccess: () => { toast.success("Campanha arquivada"); refetchCamp?.(); setConfirmDel(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const active    = projects?.filter((p: any) => p.status !== "archived") ?? [];
  const campList  = (campaigns as any[]) ?? [];
  const totalCamp = counts?.total ?? campList.length;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    for (const id of Array.from(selected)) {
      setDeleting(id);
      await deleteMutation?.mutateAsync({ id }).catch(() => {});
    }
    setSelected(new Set());
    setConfirmDel(null);
  };

  const STATS = [
    { icon: "◫",  label: "Projetos ativos",  value: String(active.length),  color: "var(--green)",  bg: "rgba(48,209,88,0.1)",  tab: null },
    { icon: "▣",  label: "Campanhas geradas", value: String(totalCamp),      color: "var(--blue)",   bg: "var(--blue-l)",         tab: "campaigns" },
    { icon: "⭐", label: "Plano atual",        value: (user?.plan ?? "FREE").toUpperCase(), color: "var(--orange)", bg: "rgba(255,159,10,0.1)", tab: null },
  ];

  return (
    <Layout>
      <style>{`
        .dash-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md) !important; }
        .dash-card { transition: all .2s var(--ease); }
        .dash-stat { transition: all .2s; cursor: pointer; }
        .dash-stat:hover { transform: translateY(-2px); box-shadow: var(--shadow-md) !important; }
        .list-row:hover { background: var(--off) !important; }
        .camp-row:hover { background: var(--off) !important; }
        .tab-btn { transition: all .15s; }
        .cb-row { accent-color: var(--blue); width: 15px; height: 15px; cursor: pointer; }
        .del-btn:hover { background: rgba(255,59,48,0.12) !important; color: var(--red) !important; }
        .arc-btn:hover { background: rgba(255,159,10,0.1) !important; color: var(--orange) !important; }
      `}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "var(--shadow-blue)", color: "white", flexShrink: 0 }}>⊞</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.04em" }}>
                Olá, {user?.name?.split(" ")[0] ?? "Usuário"} 👋
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Resumo dos seus projetos e campanhas</p>
            </div>
          </div>
          <button className="btn btn-primary btn-md" onClick={() => setLocation("/projects/new")}>
            + Novo projeto
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
          {STATS.map(s => (
            <div key={s.label} className="dash-stat card"
              onClick={() => s.tab && setActiveTab(s.tab as any)}
              style={{ padding: "16px 20px", borderColor: activeTab === s.tab ? s.color + "40" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: s.color }}>{s.icon}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</span>
                {s.tab && <span style={{ marginLeft: "auto", fontSize: 10, color: s.color, fontWeight: 700 }}>ver →</span>}
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.color, letterSpacing: "-0.05em", lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Layout: lista principal + acesso rápido */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, marginBottom: 20 }}>

          {/* Painel principal com abas */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>

            {/* Abas */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 4px" }}>
              {([
                { id: "projects",  label: "Projetos",  count: projects?.length ?? 0 },
                { id: "campaigns", label: "Campanhas", count: totalCamp },
              ] as const).map(tab => (
                <button key={tab.id} className="tab-btn"
                  onClick={() => { setActiveTab(tab.id); setSelected(new Set()); }}
                  style={{
                    padding: "12px 16px", border: "none", background: "none",
                    fontFamily: "var(--font)", fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
                    color: activeTab === tab.id ? "var(--blue)" : "var(--muted)",
                    borderBottom: activeTab === tab.id ? "2px solid var(--blue)" : "2px solid transparent",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  }}>
                  {tab.label}
                  <span style={{ fontSize: 10, background: activeTab === tab.id ? "var(--blue-l)" : "var(--off)", color: activeTab === tab.id ? "var(--blue)" : "var(--muted)", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>
                    {tab.count}
                  </span>
                </button>
              ))}

              {/* Ações em lote — só aparece quando tem seleção na aba campanhas */}
              {activeTab === "campaigns" && selected.size > 0 && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{selected.size} selecionada{selected.size > 1 ? "s" : ""}</span>
                  <button className="btn btn-sm del-btn"
                    onClick={() => setConfirmDel("bulk")}
                    style={{ background: "rgba(255,59,48,0.08)", color: "var(--red)", border: "1px solid rgba(255,59,48,0.2)", fontSize: 12, padding: "4px 10px" }}>
                    🗑 Excluir {selected.size}
                  </button>
                  <button className="btn btn-sm"
                    onClick={() => setSelected(new Set())}
                    style={{ background: "var(--off)", color: "var(--muted)", fontSize: 12, padding: "4px 10px" }}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* ABA: Projetos */}
            {activeTab === "projects" && (
              loadingProj ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Carregando...</div>
              ) : !projects?.length ? (
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>◫</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 6 }}>Nenhum projeto ainda</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>Crie seu primeiro projeto e gere campanhas com IA</p>
                  <button className="btn btn-primary btn-md" onClick={() => setLocation("/projects/new")}>Criar primeiro projeto</button>
                </div>
              ) : (
                <div>
                  {projects.slice(0, 10).map((proj: any) => (
                    <div key={proj.id} className="list-row"
                      onClick={() => setLocation(`/projects/${proj.id}`)}
                      style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", transition: "background .1s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--blue-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "var(--blue)", flexShrink: 0 }}>◫</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{proj.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{proj.description || "Sem descrição"}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`badge ${proj.status === "completed" ? "badge-green" : proj.status === "analyzing" ? "badge-blue" : "badge-gray"}`}>
                          {proj.status === "completed" ? "Concluído" : proj.status === "analyzing" ? "Analisando" : "Rascunho"}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
                      </div>
                    </div>
                  ))}
                  {projects.length > 10 && (
                    <div style={{ padding: "10px 20px", textAlign: "center" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setLocation("/projects")}>Ver todos os projetos →</button>
                    </div>
                  )}
                </div>
              )
            )}

            {/* ABA: Campanhas */}
            {activeTab === "campaigns" && (
              loadingCamp ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Carregando campanhas...</div>
              ) : !campList.length ? (
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>▣</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 6 }}>Nenhuma campanha gerada</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>Gere sua primeira campanha a partir de um projeto</p>
                  <button className="btn btn-primary btn-md" onClick={() => setLocation("/projects")}>Ir para projetos</button>
                </div>
              ) : (
                <div>
                  {/* Header da lista */}
                  <div style={{ padding: "8px 20px", background: "var(--off)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="checkbox" className="cb-row"
                      checked={selected.size === campList.length}
                      onChange={e => setSelected(e.target.checked ? new Set(campList.map((c: any) => c.id)) : new Set())}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {selected.size > 0 ? `${selected.size} selecionada${selected.size > 1 ? "s" : ""}` : "Selecionar todas"}
                    </span>
                  </div>

                  {campList.map((camp: any) => (
                    <div key={camp.id} className="camp-row"
                      style={{ padding: "11px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, transition: "background .1s", background: selected.has(camp.id) ? "var(--blue-l)" : undefined }}>

                      {/* Checkbox */}
                      <input type="checkbox" className="cb-row" checked={selected.has(camp.id)}
                        onChange={() => toggleSelect(camp.id)}
                        onClick={e => e.stopPropagation()}
                      />

                      {/* Ícone plataforma */}
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: (PLAT_COLOR[camp.platform] || "#333") + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                        {PLAT_ICON[camp.platform] || "📊"}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={() => setLocation(`/projects/${camp.projectId}/campaign/result/${camp.id}`)}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{camp.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                          {camp.projectName} · {OBJ_LABEL[camp.objective] || camp.objective}
                          {camp.suggestedBudgetDaily ? ` · R$ ${(camp.suggestedBudgetDaily / 100).toFixed(0)}/dia` : ""}
                        </div>
                      </div>

                      {/* Badge plataforma */}
                      <span className="badge" style={{ fontSize: 10, background: (PLAT_COLOR[camp.platform] || "#333") + "14", color: PLAT_COLOR[camp.platform] || "#333", flexShrink: 0 }}>
                        {camp.platform?.toUpperCase()}
                      </span>

                      {/* Data */}
                      <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                        {camp.generatedAt ? new Date(camp.generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}
                      </span>

                      {/* Ações */}
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button title="Ver resultado" className="btn btn-sm"
                          onClick={() => setLocation(`/projects/${camp.projectId}/campaign/result/${camp.id}`)}
                          style={{ background: "var(--off)", color: "var(--muted)", padding: "4px 8px", fontSize: 12 }}>
                          Ver →
                        </button>
                        <button title="Arquivar" className="btn btn-sm arc-btn"
                          onClick={() => archiveMutation?.mutate({ id: camp.id })}
                          style={{ background: "transparent", color: "var(--muted)", padding: "4px 8px", fontSize: 12, border: "1px solid var(--border)" }}>
                          ⬇
                        </button>
                        <button title="Excluir" className="btn btn-sm del-btn"
                          onClick={() => setConfirmDel(camp.id)}
                          style={{ background: "transparent", color: "var(--muted)", padding: "4px 8px", fontSize: 12, border: "1px solid var(--border)" }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Coluna direita */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Dashboard Unificado */}
            <div className="card dash-card" onClick={() => setLocation("/unified-dashboard")}
              style={{ padding: "14px 16px", cursor: "pointer", background: "var(--blue-l)", borderColor: "rgba(0,113,227,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📊</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--blue)" }}>Dashboard Unificado</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>Métricas em tempo real</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {["Meta", "Google", "TikTok"].map(p => <span key={p} className="badge badge-blue" style={{ fontSize: 10 }}>{p}</span>)}
              </div>
            </div>

            {/* Consulta CPF/CNPJ */}
            <div className="card dash-card" onClick={() => setLocation("/consultas")}
              style={{ padding: "14px 16px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--blue-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🔍</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--dark)" }}>Consulta CPF/CNPJ</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>Receita · Processos judiciais</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {["Receita", "CNJ", "Gratuito"].map(t => <span key={t} className="badge badge-gray" style={{ fontSize: 10 }}>{t}</span>)}
              </div>
            </div>

            {/* Breakdown de campanhas por plataforma */}
            {totalCamp > 0 && (
              <div className="card" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                  Campanhas por plataforma
                </div>
                {Object.entries(counts?.byPlatform ?? {}).map(([plat, count]: [string, any]) => (
                  <div key={plat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{PLAT_ICON[plat] || "📊"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: PLAT_COLOR[plat] || "#333" }}>{plat.toUpperCase()}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dark)" }}>{count}</span>
                      </div>
                      <div style={{ height: 3, background: "var(--border2)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round((count / totalCamp) * 100)}%`, height: "100%", background: PLAT_COLOR[plat] || "#333", borderRadius: 99 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Matching Engine */}
            {active.length > 0 && (
              <div className="card" style={{ padding: "14px 16px", background: "linear-gradient(135deg,rgba(0,113,227,0.06),rgba(88,86,214,0.06))", borderColor: "rgba(0,113,227,0.15)" }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>🧠 Matching Engine</p>
                <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Score de compatibilidade para sua próxima campanha</p>
                <button className="btn btn-gradient btn-sm btn-full"
                  onClick={() => setLocation(`/projects/${active[0]?.id}/campaign`)}>
                  Calcular Match →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CTA upgrade */}
        {user?.plan === "free" && (
          <div className="card" style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg,var(--black),#1a1a2e)", borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 3 }}>Desbloqueie todo o potencial do MECPro</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Projetos ilimitados · IA completa · Exportação PDF/XLSX</p>
            </div>
            <button className="btn btn-sm" style={{ background: "var(--green)", color: "var(--black)", fontWeight: 800, flexShrink: 0 }}
              onClick={() => setLocation("/pricing")}>
              Ver planos →
            </button>
          </div>
        )}
      </div>

      {/* Modal de confirmação de exclusão */}
      {confirmDel !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={() => setConfirmDel(null)}>
          <div className="card" style={{ padding: 28, maxWidth: 380, width: "90%", boxShadow: "var(--shadow-xl)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 12 }}>🗑</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", textAlign: "center", marginBottom: 8 }}>
              {confirmDel === "bulk" ? `Excluir ${selected.size} campanha${selected.size > 1 ? "s" : ""}?` : "Excluir campanha?"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginBottom: 20 }}>
              {confirmDel === "bulk"
                ? "As campanhas selecionadas serão excluídas permanentemente."
                : "Esta campanha será excluída permanentemente. Esta ação não pode ser desfeita."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-md" style={{ flex: 1 }} onClick={() => setConfirmDel(null)}>
                Cancelar
              </button>
              <button className="btn btn-md" style={{ flex: 1, background: "var(--red)", color: "white" }}
                onClick={() => {
                  if (confirmDel === "bulk") { handleBulkDelete(); }
                  else { setDeleting(confirmDel); deleteMutation?.mutate({ id: confirmDel as number }); }
                }}>
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
