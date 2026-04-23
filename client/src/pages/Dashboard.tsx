/**
 * Dashboard.tsx — Layout fluido com header rico e botão de promoção
 */
import { useState, useEffect } from "react";
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

function EmailResendButton({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const send = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setSent(true);
    } catch { } finally { setLoading(false); }
  };
  if (sent) return <span style={{ fontSize: 12, color: "var(--green-d)", fontWeight: 700, flexShrink: 0 }}>◎ Enviado!</span>;
  return (
    <button onClick={send} disabled={loading} className="btn btn-sm"
      style={{ background: "var(--orange)", color: "white", fontWeight: 700, flexShrink: 0, opacity: loading ? 0.7 : 1 }}>
      {loading ? "Enviando…" : "Reenviar"}
    </button>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab]   = useState<"projects" | "campaigns">("projects");
  const [deleting,  setDeleting]    = useState<number | null>(null);
  const [selected,  setSelected]    = useState<Set<number>>(new Set());
  const [confirmDel, setConfirmDel] = useState<number | "bulk" | null>(null);
  const [landingMode, setLandingMode] = useState<"promo" | "normal">("promo");

  const { data: projects, isLoading: loadingProj } = trpc.projects.list.useQuery();
  const { data: campaigns, isLoading: loadingCamp, refetch: refetchCamp } =
    (trpc as any).campaigns?.listAll?.useQuery?.() ?? { data: [], isLoading: false, refetch: () => {} };
  const { data: counts } =
    (trpc as any).campaigns?.countAll?.useQuery?.() ?? { data: { total: 0, byPlatform: {} } };

  // Busca o modo de landing para saber se exibe botão de promoção
  useEffect(() => {
    fetch("/api/trpc/public.getLandingMode", { credentials: "include" })
      .then(r => r.json())
      .then(d => setLandingMode(d?.result?.data?.mode ?? "promo"))
      .catch(() => setLandingMode("promo"));
  }, []);

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
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const handleBulkDelete = async () => {
    for (const id of Array.from(selected)) { setDeleting(id); await deleteMutation?.mutateAsync({ id }).catch(() => {}); }
    setSelected(new Set()); setConfirmDel(null);
  };

  // Mostra botão de promoção se: modo promo ativo E usuário não tem plano pago E não é admin
  const showPromo = landingMode === "promo" && (user?.plan === "free" || user?.plan === "FREE" || !user?.plan);

  const STATS = [
    { icon: "◫",  label: "Projetos ativos",  value: String(active.length),  color: "var(--green)",  bg: "rgba(48,209,88,0.1)",  tab: null },
    { icon: "▣",  label: "Campanhas",         value: String(totalCamp),      color: "var(--blue)",   bg: "var(--blue-l)",         tab: "campaigns" },
    { icon: "◈",  label: "Plano atual",       value: (user?.plan ?? "FREE").toUpperCase(), color: "var(--orange)", bg: "rgba(255,159,10,0.1)", tab: null },
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
        .promo-btn { animation: promo-pulse 2.5s ease-in-out infinite; }
        @keyframes promo-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,159,10,0); } 50% { box-shadow: 0 0 0 6px rgba(255,159,10,0.15); } }
        .header-chip { transition: all .15s; }
        .header-chip:hover { transform: translateY(-1px); opacity: 0.85; }
      `}</style>

      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "clamp(14px,2.5vw,24px) clamp(14px,2vw,20px)", fontFamily: "var(--font)", paddingBottom: "env(safe-area-inset-bottom,0)" }}>

        {/* ═══ CABEÇALHO RICO ═══════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 20 }}>

          {/* Linha 1: saudação + botão novo projeto */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, boxShadow: "var(--shadow-blue)", color: "white", flexShrink: 0 }}>⊞</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.04em" }}>
                  Olá, {user?.name?.split(" ")[0] ?? "Usuário"} 👋
                </h1>
                <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", marginTop: 1 }}>Resumo dos seus projetos e campanhas</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Botão de promoção — só aparece se landing_mode = promo e plano free */}
              {showPromo && (
                <button
                  className="btn btn-sm promo-btn"
                  onClick={() => setLocation("/checkout-anual")}
                  style={{ background: "linear-gradient(135deg,#ff9f0a,#ff6b00)", color: "white", fontWeight: 800, fontSize: 12, padding: "7px 14px", borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  🔥 Promoção Anual
                </button>
              )}
              <button className="btn btn-primary btn-md" onClick={() => setLocation("/projects/new")}>
                + Novo projeto
              </button>
            </div>
          </div>

          {/* Linha 2: chips de acesso rápido ao header */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>

            {/* Dashboard Unificado */}
            <button className="header-chip" onClick={() => setLocation("/unified-dashboard")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: "var(--blue-l)", border: "1.5px solid rgba(0,113,227,0.2)", cursor: "pointer", fontFamily: "var(--font)" }}>
              <span style={{ fontSize: 13 }}>📊</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)" }}>Dashboard Unificado</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Métricas em tempo real</span>
              <div style={{ display: "flex", gap: 3, marginLeft: 2 }}>
                {["Meta", "Google", "TikTok"].map(p => (
                  <span key={p} style={{ fontSize: 9, fontWeight: 700, color: "var(--blue)", background: "rgba(0,113,227,0.1)", padding: "1px 5px", borderRadius: 99 }}>{p}</span>
                ))}
              </div>
            </button>

            {/* Consulta CPF/CNPJ */}
            <button className="header-chip" onClick={() => setLocation("/consultas")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: "white", border: "1.5px solid var(--border)", cursor: "pointer", fontFamily: "var(--font)" }}>
              <span style={{ fontSize: 13 }}>🔍</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dark)" }}>Consulta CPF/CNPJ</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Receita · Processos</span>
              <div style={{ display: "flex", gap: 3, marginLeft: 2 }}>
                {["Receita", "CNJ", "Gratuito"].map(t => (
                  <span key={t} style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", background: "var(--off)", padding: "1px 5px", borderRadius: 99 }}>{t}</span>
                ))}
              </div>
            </button>

            {/* Campanhas por plataforma — chips inline */}
            {totalCamp > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 99, background: "white", border: "1.5px solid var(--border)" }}>
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginRight: 2 }}>Campanhas</span>
                {/* Total */}
                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, color: "#5856d6", background: "rgba(88,86,214,0.08)", padding: "2px 7px", borderRadius: 99 }}>
                  📊 ALL {totalCamp}
                </span>
                {Object.entries(counts?.byPlatform ?? {}).map(([plat, cnt]: [string, any]) => (
                  <span key={plat} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, color: PLAT_COLOR[plat] || "#333", background: (PLAT_COLOR[plat] || "#333") + "12", padding: "2px 7px", borderRadius: 99 }}>
                    {PLAT_ICON[plat]} {plat.toUpperCase()} {cnt}
                  </span>
                ))}
              </div>
            )}

            {/* Matching Engine */}
            {active.length > 0 && (
              <button className="header-chip" onClick={() => setLocation(`/projects/${active[0]?.id}/campaign`)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: "linear-gradient(135deg,rgba(0,113,227,0.06),rgba(88,86,214,0.06))", border: "1.5px solid rgba(88,86,214,0.2)", cursor: "pointer", fontFamily: "var(--font)" }}>
                <span style={{ fontSize: 13 }}>🧠</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#5856d6" }}>Matching Engine</span>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>Calcular Match →</span>
              </button>
            )}
          </div>
        </div>

        {/* Banner: email não verificado */}
        {user && !(user as any).emailVerified && (user as any).loginMethod === "manual" && (
          <div style={{ background: "rgba(255,159,10,0.08)", border: "1.5px solid rgba(255,159,10,0.25)", borderRadius: "var(--r)", padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 20, color: "var(--orange)", flexShrink: 0 }}>◬</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#b25000", marginBottom: 2 }}>Confirme seu email para desbloquear todos os recursos</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Enviamos um link para <strong>{(user as any).email}</strong>. Verifique também a pasta de spam.</div>
            </div>
            <EmailResendButton email={(user as any).email} />
          </div>
        )}

        {/* Stats KPIs */}
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
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

        {/* Layout principal */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, marginBottom: 20 }}>

          {/* Painel principal com abas */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 4px" }}>
              {([ { id: "projects", label: "Projetos", count: projects?.length ?? 0 }, { id: "campaigns", label: "Campanhas", count: totalCamp } ] as const).map(tab => (
                <button key={tab.id} className="tab-btn"
                  onClick={() => { setActiveTab(tab.id); setSelected(new Set()); }}
                  style={{ padding: "12px 16px", border: "none", background: "none", fontFamily: "var(--font)", fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500, color: activeTab === tab.id ? "var(--blue)" : "var(--muted)", borderBottom: activeTab === tab.id ? "2px solid var(--blue)" : "2px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {tab.label}
                  <span style={{ fontSize: 10, background: activeTab === tab.id ? "var(--blue-l)" : "var(--off)", color: activeTab === tab.id ? "var(--blue)" : "var(--muted)", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>{tab.count}</span>
                </button>
              ))}
              {activeTab === "campaigns" && selected.size > 0 && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{selected.size} selecionada{selected.size > 1 ? "s" : ""}</span>
                  <button className="btn btn-sm del-btn" onClick={() => setConfirmDel("bulk")}
                    style={{ background: "rgba(255,59,48,0.08)", color: "var(--red)", border: "1px solid rgba(255,59,48,0.2)", fontSize: 12, padding: "4px 10px" }}>
                    🗑 Excluir {selected.size}
                  </button>
                  <button className="btn btn-sm" onClick={() => setSelected(new Set())}
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
                  <div style={{ padding: "8px 20px", background: "var(--off)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="checkbox" className="cb-row"
                      checked={selected.size === campList.length}
                      onChange={e => setSelected(e.target.checked ? new Set(campList.map((c: any) => c.id)) : new Set())} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {selected.size > 0 ? `${selected.size} selecionada${selected.size > 1 ? "s" : ""}` : "Selecionar todas"}
                    </span>
                  </div>
                  {campList.map((camp: any) => (
                    <div key={camp.id} className="camp-row"
                      style={{ padding: "11px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, transition: "background .1s", background: selected.has(camp.id) ? "var(--blue-l)" : undefined }}>
                      <input type="checkbox" className="cb-row" checked={selected.has(camp.id)}
                        onChange={() => toggleSelect(camp.id)} onClick={e => e.stopPropagation()} />
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: (PLAT_COLOR[camp.platform] || "#333") + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                        {PLAT_ICON[camp.platform] || "📊"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={() => setLocation(`/projects/${camp.projectId}/campaign/result/${camp.id}`)}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{camp.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                          {camp.projectName} · {OBJ_LABEL[camp.objective] || camp.objective}
                          {camp.suggestedBudgetDaily ? ` · R$ ${(camp.suggestedBudgetDaily / 100).toFixed(0)}/dia` : ""}
                        </div>
                      </div>
                      <span className="badge" style={{ fontSize: 10, background: (PLAT_COLOR[camp.platform] || "#333") + "14", color: PLAT_COLOR[camp.platform] || "#333", flexShrink: 0 }}>
                        {camp.platform?.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                        {camp.generatedAt ? new Date(camp.generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}
                      </span>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button title="Ver resultado" className="btn btn-sm"
                          onClick={() => setLocation(`/projects/${camp.projectId}/campaign/result/${camp.id}`)}
                          style={{ background: "var(--off)", color: "var(--muted)", padding: "4px 8px", fontSize: 12 }}>Ver →</button>
                        <button title="Arquivar" className="btn btn-sm arc-btn"
                          onClick={() => archiveMutation?.mutate({ id: camp.id })}
                          style={{ background: "transparent", color: "var(--muted)", padding: "4px 8px", fontSize: 12, border: "1px solid var(--border)" }}>⬇</button>
                        <button title="Excluir" className="btn btn-sm del-btn"
                          onClick={() => setConfirmDel(camp.id)}
                          style={{ background: "transparent", color: "var(--muted)", padding: "4px 8px", fontSize: 12, border: "1px solid var(--border)" }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* CTA upgrade — plano free sem promoção ativa */}
        {(user?.plan === "free" || user?.plan === "FREE" || !user?.plan) && !showPromo && (
          <div className="card" style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg,var(--black),#1a1a2e)", borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 3 }}>Desbloqueie todo o potencial do MECPro</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Projetos ilimitados · IA completa · Exportação PDF/XLSX</p>
            </div>
            <button className="btn btn-sm" style={{ background: "var(--green)", color: "var(--black)", fontWeight: 800, flexShrink: 0 }} onClick={() => setLocation("/pricing")}>
              Ver planos →
            </button>
          </div>
        )}

        {/* CTA promoção anual — plano free COM promoção ativa */}
        {showPromo && (
          <div className="card promo-btn" style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg,#7c3aed,#1e40af)", borderColor: "rgba(255,255,255,0.1)", cursor: "pointer" }}
            onClick={() => setLocation("/checkout-anual")}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 3 }}>🔥 Oferta Especial — Plano Anual</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>100 MecCoins · IA ilimitada · Economize 20% · Válido por tempo limitado</p>
            </div>
            <button className="btn btn-sm" style={{ background: "#ff9f0a", color: "white", fontWeight: 800, flexShrink: 0, border: "none" }}>
              Ver oferta →
            </button>
          </div>
        )}
      </div>

      {/* Modal confirmação exclusão */}
      {confirmDel !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={() => setConfirmDel(null)}>
          <div className="card" style={{ padding: 28, maxWidth: 380, width: "90%", boxShadow: "var(--shadow-xl)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 12 }}>🗑</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", textAlign: "center", marginBottom: 8 }}>
              {confirmDel === "bulk" ? `Excluir ${selected.size} campanha${selected.size > 1 ? "s" : ""}?` : "Excluir campanha?"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginBottom: 20 }}>
              {confirmDel === "bulk" ? "As campanhas selecionadas serão excluídas permanentemente." : "Esta campanha será excluída permanentemente. Esta ação não pode ser desfeita."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-md" style={{ flex: 1 }} onClick={() => setConfirmDel(null)}>Cancelar</button>
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
