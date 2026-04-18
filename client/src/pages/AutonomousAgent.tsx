import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AgentAction = "pause_campaign" | "adjust_budget" | "suggest_creative" | "scale_budget" | "no_action";

interface Decision {
  campaignId: number;
  action:     AgentAction;
  score:      number;
  reason:     string;
  executed:   boolean;
  llmUsed:    "claude" | "gemini" | "deterministic";
  metrics:    { ctr: number; cpc: number; spend: number } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<AgentAction, { label: string; color: string; bg: string; icon: string }> = {
  pause_campaign:   { label: "Pausar",          color: "#dc2626", bg: "#fef2f2", icon: "⏸️" },
  adjust_budget:    { label: "Ajustar Orçamento", color: "#d97706", bg: "#fffbeb", icon: "◈" },
  suggest_creative: { label: "Novo Criativo",   color: "#7c3aed", bg: "#f5f3ff", icon: "🎨" },
  scale_budget:     { label: "Escalar",         color: "#059669", bg: "#f0fdf4", icon: "📈" },
  no_action:        { label: "OK",              color: "#64748b", bg: "#f8fafc", icon: "◎" },
};

const LLM_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  claude:        { label: "Claude",        color: "#7c3aed", bg: "#f5f3ff" },
  gemini:        { label: "IA Cat. A",      color: "#0369a1", bg: "#eff6ff" },
  deterministic: { label: "Regras",        color: "#475569", bg: "#f1f5f9" },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AutonomousAgentPage() {
  const [projectId,  setProjectId]  = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [decisions,  setDecisions]  = useState<Decision[]>([]);
  const [summary,    setSummary]    = useState<any>(null);
  const [running,    setRunning]    = useState(false);

  // Queries e mutations
  const { data: status } = (trpc as any).agent?.status?.useQuery?.() ?? { data: null };
  const { data: llmMode, refetch: refetchLLM } = (trpc as any).llm?.getMode?.useQuery?.() ?? { data: null, refetch: () => {} };

  const setLLMMutation = (trpc as any).llm?.setMode?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success(`${data.label} ativado com sucesso!`);
      refetchLLM?.();
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutate: () => {}, isPending: false };

  const runProjectMutation = (trpc as any).agent?.runForProject?.useMutation?.({
    onSuccess: (data: any) => {
      setDecisions(data.decisions || []);
      setSummary(data.summary);
      toast.success(`◎ Agente concluído: ${data.total} campanha(s) analisada(s)`);
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutateAsync: async () => {} };

  const runCampaignMutation = (trpc as any).agent?.runForCampaign?.useMutation?.({
    onSuccess: (data: any) => {
      setDecisions([data]);
      setSummary(null);
      const cfg = ACTION_CONFIG[data.action as AgentAction];
      toast.success(`${cfg.icon} Análise concluída: ${cfg.label}`);
    },
    onError: (e: any) => toast.error(e.message),
  }) ?? { mutateAsync: async () => {} };

  async function handleRun() {
    if (!projectId.trim() && !campaignId.trim()) {
      toast.error("Informe o ID do projeto ou da campanha");
      return;
    }
    setRunning(true);
    setDecisions([]);
    setSummary(null);
    try {
      if (campaignId.trim()) {
        await (runCampaignMutation as any).mutateAsync({ campaignId: Number(campaignId.trim()) });
      } else {
        await (runProjectMutation as any).mutateAsync({ projectId: Number(projectId.trim()) });
      }
    } finally {
      setRunning(false);
    }
  }

  const modeColors: Record<string, string> = {
    observe: "#0369a1",
    semi:    "#d97706",
    active:  "#dc2626",
  };
  const modeLabels: Record<string, string> = {
    observe: "Observação",
    semi:    "Semi-autônomo",
    active:  "Ativo",
  };
  const currentMode = status?.mode || "observe";

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "clamp(14px, 2.5vw, 28px) clamp(14px, 2vw, 20px)" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "linear-gradient(135deg,#7c3aed,#2563eb)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, flexShrink: 0,
              boxShadow: "0 4px 16px rgba(124,58,237,.3)",
            }}>🤖</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                Agente Autônomo
              </h1>
              <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 13 }}>
                Analisa campanhas, detecta oportunidades e executa otimizações automaticamente
              </p>
            </div>
          </div>
        </div>

        {/* ── Status do agente ── */}
        {status && (
          <div style={{
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
            padding: "16px 20px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: modeColors[currentMode],
                boxShadow: `0 0 6px ${modeColors[currentMode]}`,
                animation: currentMode === "active" ? "pulse 1.5s infinite" : "none",
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: modeColors[currentMode] }}>
                {modeLabels[currentMode]}
              </span>
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>LLM principal:</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999,
                background: status.claudeEnabled ? "#f5f3ff" : "#eff6ff",
                color: status.claudeEnabled ? "#7c3aed" : "#0369a1",
                border: `1px solid ${status.claudeEnabled ? "#ddd6fe" : "#bfdbfe"}`,
              }}>
                {status.claudeEnabled ? "IA Categoria A+" : "IA Categoria A"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 12, marginLeft: "auto", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Pausar se score &lt; <strong>{status.thresholds?.pause}</strong>
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Escalar se score &gt; <strong>{status.thresholds?.scale}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── Toggle LLM Principal ── */}
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
          padding: "18px 24px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
                🔀 LLM Principal
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {llmMode?.mode === "on"
                  ? "Modo ligado — usando IA Categoria A (máxima qualidade)"
                  : "Modo desligado — usando IA Categoria B (econômica)"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* Badges dos LLMs */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: llmMode?.mode === "on" ? "#f0fdf4" : "#f8fafc",
                  color: llmMode?.mode === "on" ? "#059669" : "#94a3b8",
                  border: `1.5px solid ${llmMode?.mode === "on" ? "#bbf7d0" : "#e2e8f0"}`,
                  transition: "all .2s",
                }}>
                  🟢 IA Categoria A
                </div>
                <div style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: llmMode?.mode === "off" ? "#fffbeb" : "#f8fafc",
                  color: llmMode?.mode === "off" ? "#d97706" : "#94a3b8",
                  border: `1.5px solid ${llmMode?.mode === "off" ? "#fde68a" : "#e2e8f0"}`,
                  transition: "all .2s",
                }}>
                  🟡 IA Categoria B
                </div>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => (setLLMMutation as any).mutate({ mode: llmMode?.mode === "on" ? "off" : "on" })}
                disabled={(setLLMMutation as any).isPending}
                style={{
                  position: "relative", width: 56, height: 30,
                  borderRadius: 999, border: "none", cursor: "pointer",
                  background: llmMode?.mode === "on"
                    ? "linear-gradient(135deg,#059669,#10b981)"
                    : "#e2e8f0",
                  transition: "all .25s",
                  boxShadow: llmMode?.mode === "on" ? "0 2px 8px rgba(5,150,105,.4)" : "none",
                }}
              >
                <div style={{
                  position: "absolute", top: 3,
                  left: llmMode?.mode === "on" ? 29 : 3,
                  width: 24, height: 24, borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,.2)",
                  transition: "left .25s",
                }} />
              </button>

              <span style={{ fontSize: 12, fontWeight: 700, color: llmMode?.mode === "on" ? "#059669" : "#d97706" }}>
                {llmMode?.mode === "on" ? "LIGADO" : "DESLIGADO"}
              </span>
            </div>
          </div>

          {/* Info contextual */}
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10,
            background: llmMode?.mode === "on" ? "#f0fdf4" : "#fffbeb",
            border: `1px solid ${llmMode?.mode === "on" ? "#bbf7d0" : "#fde68a"}`,
            fontSize: 12, color: llmMode?.mode === "on" ? "#065f46" : "#92400e",
          }}>
            {llmMode?.mode === "on" ? (
              <>◎ <strong>IA Categoria A ativa</strong> — Máxima qualidade de copy e estrutura de campanha. Recomendada para clientes.</>
            ) : (
              <>⚡ <strong>IA Categoria B ativa</strong> — Alta disponibilidade e resposta rápida. Ideal para uso intensivo.</>
            )}
          </div>
        </div>

        {/* ── Configuração e disparo ── */}
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
          padding: "20px 24px", marginBottom: 20,
        }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            Executar análise
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                ID do Projeto
              </span>
              <input
                value={projectId}
                onChange={e => { setProjectId(e.target.value); setCampaignId(""); }}
                placeholder="Ex: 7"
                style={{
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid #e2e8f0", fontSize: 14,
                  background: "#fafbfc",
                }}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                Analisa todas as campanhas publicadas do projeto
              </span>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                ID da Campanha (específica)
              </span>
              <input
                value={campaignId}
                onChange={e => { setCampaignId(e.target.value); setProjectId(""); }}
                placeholder="Ex: 158"
                style={{
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid #e2e8f0", fontSize: 14,
                  background: "#fafbfc",
                }}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                Analisa apenas uma campanha
              </span>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                background: running
                  ? "#e2e8f0"
                  : "linear-gradient(135deg,#7c3aed,#2563eb)",
                color: running ? "#94a3b8" : "#fff",
                border: "none", borderRadius: 10,
                padding: "11px 28px", fontSize: 14, fontWeight: 700,
                cursor: running ? "wait" : "pointer",
                transition: "all .15s",
              }}
            >
              {running ? "⏳ Analisando..." : "🚀 Executar agente"}
            </button>

            {currentMode === "observe" && (
              <div style={{
                fontSize: 12, color: "#0369a1", background: "#eff6ff",
                border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 12px",
              }}>
                ℹ️ Modo Observação — analisa mas não executa ações
              </div>
            )}
            {currentMode === "active" && (
              <div style={{
                fontSize: 12, color: "#dc2626", background: "#fef2f2",
                border: "1px solid #fecaca", borderRadius: 8, padding: "6px 12px",
              }}>
                ⚠️ Modo Ativo — executa ações automaticamente nas APIs
              </div>
            )}
          </div>
        </div>

        {/* ── Summary ── */}
        {summary && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))",
            gap: 12, marginBottom: 20,
          }}>
            {[
              { label: "Pausadas",  value: summary.paused,    color: "#dc2626", icon: "⏸️" },
              { label: "Escaladas", value: summary.scaled,    color: "#059669", icon: "📈" },
              { label: "Ajustadas", value: summary.adjusted,  color: "#d97706", icon: "◈" },
              { label: "Criativos", value: summary.creatives,  color: "#7c3aed", icon: "🎨" },
              { label: "Executadas",value: summary.executed,  color: "#0369a1", icon: "◎" },
            ].map(s => (
              <div key={s.label} style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                padding: "12px 16px", textAlign: "center",
              }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 4 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Decisões ── */}
        {decisions.length > 0 && (
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
              Resultados ({decisions.length})
            </h2>
            <div style={{ display: "grid", gap: 12 }}>
              {decisions.map((d, i) => {
                const cfg  = ACTION_CONFIG[d.action];
                const llm  = LLM_BADGE[d.llmUsed] || LLM_BADGE.deterministic;
                return (
                  <div key={i} style={{
                    background: "#fff",
                    border: `1.5px solid ${d.action !== "no_action" ? cfg.color + "40" : "#e2e8f0"}`,
                    borderRadius: 14, padding: "16px 20px",
                    borderLeft: `4px solid ${cfg.color}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                              Campanha #{d.campaignId}
                            </span>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999,
                              background: cfg.bg, color: cfg.color,
                            }}>
                              {cfg.label}
                            </span>
                            {d.executed && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                                background: "#f0fdf4", color: "#059669", border: "1px solid #bbf7d0",
                              }}>
                                Executado ✓
                              </span>
                            )}
                          </div>
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                            {d.reason}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        {/* Score */}
                        <div style={{
                          textAlign: "center", padding: "6px 12px",
                          background: d.score >= 70 ? "#f0fdf4" : d.score >= 40 ? "#fffbeb" : "#fef2f2",
                          borderRadius: 10, border: `1px solid ${d.score >= 70 ? "#bbf7d0" : d.score >= 40 ? "#fde68a" : "#fecaca"}`,
                        }}>
                          <div style={{
                            fontSize: 18, fontWeight: 800,
                            color: d.score >= 70 ? "#059669" : d.score >= 40 ? "#d97706" : "#dc2626",
                          }}>
                            {d.score}
                          </div>
                          <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>SCORE</div>
                        </div>

                        {/* LLM badge */}
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                          background: llm.bg, color: llm.color,
                        }}>
                          {llm.label}
                        </span>
                      </div>
                    </div>

                    {/* Métricas */}
                    {d.metrics && (
                      <div style={{
                        display: "flex", gap: 16, marginTop: 12, padding: "10px 14px",
                        background: "#f8fafc", borderRadius: 8, flexWrap: "wrap",
                      }}>
                        {[
                          { label: "CTR",   value: d.metrics.ctr.toFixed(2) + "%" },
                          { label: "CPC",   value: "R$ " + d.metrics.cpc.toFixed(2) },
                          { label: "Gasto", value: "R$ " + d.metrics.spend.toFixed(2) },
                        ].map(m => (
                          <div key={m.label}>
                            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{m.label} </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{m.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Variáveis de ambiente ── */}
        <div style={{
          marginTop: 28, background: "#0f172a", borderRadius: 14,
          padding: "16px 20px", color: "#94a3b8",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>
            ⚙️ Configuração via variáveis de ambiente (Render)
          </div>
          {[
            ["AUTONOMOUS_AGENT_MODE", "observe | semi | active"],
            ["AGENT_PAUSE_THRESHOLD", "Score mínimo antes de pausar (padrão: 35)"],
            ["AGENT_SCALE_THRESHOLD", "Score para escalar orçamento (padrão: 78)"],
            ["AGENT_SCALE_MULTIPLIER","Multiplicador de orçamento ao escalar (padrão: 1.3)"],
            ["ANTHROPIC_API_KEY",     "Chave Claude — LLM principal do agente"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
              <code style={{ fontSize: 11, color: "#a78bfa", fontFamily: "monospace" }}>{k}</code>
              <span style={{ fontSize: 11, color: "#64748b" }}>{v}</span>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
    </Layout>
  );
}
