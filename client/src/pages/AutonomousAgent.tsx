import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Motor de Qualidade — configuração por função ─────────────────────────────

const ENGINE_FUNCTIONS = [
  {
    id: "insights",
    label: "Insights do Concorrente",
    icon: "🔍",
    description: "Análise de formatos, CTAs e padrões dos ads coletados",
    qualityWithLLM: 100,
    qualityWithoutLLM: 100,
    fn: "generateLocalInsights()",
    status: "full" as const,
    detail: "Parser determinístico — analisa ads reais sem depender de IA",
  },
  {
    id: "scraping",
    label: "Scraping do Site",
    icon: "🌐",
    description: "Extração de dados públicos do site do concorrente",
    qualityWithLLM: 100,
    qualityWithoutLLM: 100,
    fn: "parseHtmlIntoAds()",
    status: "full" as const,
    detail: "Extrai title, h1, og:title, meta description, CTAs reais do HTML",
  },
  {
    id: "campaign",
    label: "Geração de Campanha",
    icon: "📢",
    description: "Creatives, adSets e estratégia baseados nos concorrentes",
    qualityWithLLM: 100,
    qualityWithoutLLM: 80,
    fn: "buildCampaignFromAds()",
    status: "partial" as const,
    detail: "Usa ads reais dos concorrentes + motor híbrido para creatives por tom",
  },
  {
    id: "market",
    label: "Análise de Mercado",
    icon: "📊",
    description: "Gaps, oportunidades e posicionamento competitivo",
    qualityWithLLM: 100,
    qualityWithoutLLM: 50,
    fn: "generateMarketAnalysis()",
    status: "degraded" as const,
    detail: "Sem LLM retorna template por nicho — LLM gera análise personalizada",
  },
  {
    id: "seo",
    label: "Análise SEO / Estimativa",
    icon: "🔎",
    description: "Anúncios estimados quando Meta e site não estão disponíveis",
    qualityWithLLM: 100,
    qualityWithoutLLM: 50,
    fn: "fetchViaSEOAnalysis()",
    status: "degraded" as const,
    detail: "buildBaseTemplate() por nicho — funcional mas genérico sem LLM",
  },
] as const;

type FunctionStatus = "full" | "partial" | "degraded";

const STATUS_CONFIG: Record<FunctionStatus, { color: string; bg: string; border: string; label: string }> = {
  full:     { color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", label: "100% funcional" },
  partial:  { color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "80% sem LLM" },
  degraded: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "50% sem LLM" },
};

function QualityBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: 0, top: 0, height: "100%",
        width: `${pct}%`,
        borderRadius: 999,
        background: color,
        transition: "width .6s cubic-bezier(.4,0,.2,1)",
        boxShadow: `0 0 6px ${color}60`,
      }} />
    </div>
  );
}

function QuotaMonitor({ quota, cache, onRefresh }: { quota?: any; cache?: any; onRefresh?: () => void }) {
  if (!quota) return null;

  const q = quota;
  const c = cache;
  const usagePct = Math.max(q.callsPct || 0, q.tokensPct || 0);
  const barColor = usagePct >= 80 ? "#dc2626" : usagePct >= 60 ? "#d97706" : "#059669";

  return (
    <div style={{
      background: "#fff", border: `1px solid ${q.ecoMode ? "#fde68a" : "#e2e8f0"}`,
      borderRadius: 16, padding: "18px 24px", marginBottom: 20,
      transition: "border-color .3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>
            {q.ecoMode ? "🔋 Modo Econômico ATIVO" : "📡 Monitor de Quota"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {q.ecoMode
              ? "LLM reservado para operações críticas — motor determinístico ativo"
              : `Janela atual: ${q.windowMinutes} min restantes`}
          </div>
        </div>
        <button onClick={onRefresh} style={{
          background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
          padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "#64748b",
        }}>↻ Atualizar</button>
      </div>

      {/* Barras de uso */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        {[
          { label: "Chamadas LLM", value: q.callsPct, used: q.calls, max: q.maxCalls, unit: "req" },
          { label: "Tokens",       value: q.tokensPct, used: Math.round(q.tokens/1000), max: Math.round(q.maxTokens/1000), unit: "k" },
        ].map(m => (
          <div key={m.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{m.label}</span>
              <span style={{ fontSize: 11, color: barColor, fontWeight: 700 }}>{m.value}% ({m.used}/{m.max}{m.unit})</span>
            </div>
            <div style={{ height: 6, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${Math.min(m.value, 100)}%`,
                background: barColor, borderRadius: 999,
                transition: "width .5s ease, background .3s",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Cache stats */}
      {c && (
        <div style={{
          display: "flex", gap: 16, padding: "10px 14px",
          background: "#f8fafc", borderRadius: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            💾 Cache: <strong style={{ color: "#0f172a" }}>{c.size} entradas</strong>
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            ✅ Hits: <strong style={{ color: "#059669" }}>{c.hits}</strong>
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            ❌ Misses: <strong style={{ color: "#dc2626" }}>{c.misses}</strong>
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            📈 Hit rate: <strong style={{ color: c.hitRate >= 30 ? "#059669" : "#d97706" }}>{c.hitRate}%</strong>
          </span>
        </div>
      )}

      {q.ecoMode && (
        <div style={{
          marginTop: 12, padding: "8px 12px", borderRadius: 8,
          background: "#fffbeb", border: "1px solid #fde68a",
          fontSize: 12, color: "#92400e",
        }}>
          ⚡ Modo econômico: apenas operações com prioridade <strong>alta</strong> usarão LLM.
          Análise de concorrentes e scraping continuam 100% funcionais.
          Reset em <strong>{q.windowMinutes} minutos</strong>.
        </div>
      )}
    </div>
  );
}

function QualityControlPanel({ llmMode }: { llmMode?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const isLLMOn = llmMode !== "off";

  const overallQuality = Math.round(
    ENGINE_FUNCTIONS.reduce((acc, f) =>
      acc + (isLLMOn ? f.qualityWithLLM : f.qualityWithoutLLM), 0
    ) / ENGINE_FUNCTIONS.length
  );

  const overallColor = overallQuality >= 90 ? "#059669"
    : overallQuality >= 70 ? "#d97706"
    : "#dc2626";

  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
      padding: "20px 24px", marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>
            ⚡ Controle de Qualidade do Motor
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {isLLMOn
              ? "LLM ativo — qualidade máxima em todas as funções"
              : "LLM desligado — motor determinístico operando"}
          </div>
        </div>

        {/* Score global */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: overallQuality >= 90 ? "#f0fdf4" : overallQuality >= 70 ? "#fffbeb" : "#fef2f2",
          border: `1.5px solid ${overallColor}30`,
          borderRadius: 12, padding: "8px 16px",
        }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: overallColor, lineHeight: 1 }}>
            {overallQuality}%
          </div>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.3 }}>
            qualidade<br />geral
          </div>
        </div>
      </div>

      {/* Barra global */}
      <div style={{ marginBottom: 20 }}>
        <QualityBar value={overallQuality} color={overallColor} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>0%</span>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>100%</span>
        </div>
      </div>

      {/* Funções individuais */}
      <div style={{ display: "grid", gap: 10 }}>
        {ENGINE_FUNCTIONS.map(fn => {
          const quality = isLLMOn ? fn.qualityWithLLM : fn.qualityWithoutLLM;
          const color   = quality === 100 ? "#059669" : quality >= 80 ? "#d97706" : "#dc2626";
          const cfg     = STATUS_CONFIG[isLLMOn ? "full" : fn.status];
          const isOpen  = expanded === fn.id;

          return (
            <div key={fn.id} style={{
              border: `1px solid ${isOpen ? color + "40" : "#e2e8f0"}`,
              borderRadius: 12,
              overflow: "hidden",
              transition: "border-color .2s",
            }}>
              {/* Row */}
              <button
                onClick={() => setExpanded(isOpen ? null : fn.id)}
                style={{
                  width: "100%", display: "grid",
                  gridTemplateColumns: "28px 1fr auto auto",
                  alignItems: "center", gap: 12,
                  padding: "12px 16px",
                  background: isOpen ? `${color}08` : "#fafbfc",
                  border: "none", cursor: "pointer",
                  textAlign: "left", transition: "background .15s",
                }}
              >
                {/* Icon */}
                <span style={{ fontSize: 16 }}>{fn.icon}</span>

                {/* Label + bar */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 5 }}>
                    {fn.label}
                  </div>
                  <QualityBar value={quality} color={color} />
                </div>

                {/* Percentage */}
                <div style={{
                  fontSize: 15, fontWeight: 800, color,
                  width: 42, textAlign: "right", flexShrink: 0,
                }}>
                  {quality}%
                </div>

                {/* Status badge */}
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 9px",
                  borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
                  background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                }}>
                  {isLLMOn ? "✅ LLM ativo" : cfg.label}
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{
                  padding: "12px 16px 14px",
                  borderTop: `1px solid ${color}20`,
                  background: `${color}04`,
                }}>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
                    {fn.description}
                  </div>
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10,
                  }}>
                    <div style={{
                      padding: "8px 12px", borderRadius: 8,
                      background: "#f0fdf4", border: "1px solid #bbf7d0",
                    }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginBottom: 2 }}>
                        COM LLM
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#059669" }}>
                        {fn.qualityWithLLM}%
                      </div>
                    </div>
                    <div style={{
                      padding: "8px 12px", borderRadius: 8,
                      background: fn.qualityWithoutLLM === 100 ? "#f0fdf4" : fn.qualityWithoutLLM >= 80 ? "#fffbeb" : "#fef2f2",
                      border: `1px solid ${fn.qualityWithoutLLM === 100 ? "#bbf7d0" : fn.qualityWithoutLLM >= 80 ? "#fde68a" : "#fecaca"}`,
                    }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginBottom: 2 }}>
                        SEM LLM
                      </div>
                      <div style={{
                        fontSize: 18, fontWeight: 800,
                        color: fn.qualityWithoutLLM === 100 ? "#059669" : fn.qualityWithoutLLM >= 80 ? "#d97706" : "#dc2626",
                      }}>
                        {fn.qualityWithoutLLM}%
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 11, color: "#64748b", padding: "8px 12px",
                    background: "#f8fafc", borderRadius: 8,
                    fontFamily: "monospace",
                  }}>
                    <span style={{ color: "#7c3aed", fontWeight: 700 }}>{fn.fn}</span>
                    {" — "}{fn.detail}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      {!isLLMOn && (
        <div style={{
          marginTop: 14, padding: "10px 14px", borderRadius: 10,
          background: "#fffbeb", border: "1px solid #fde68a",
          fontSize: 12, color: "#92400e",
        }}>
          ⚡ <strong>Motor determinístico ativo</strong> — 2 funções em 100%, 1 em 80%, 2 em 50%.
          Ative o LLM para qualidade máxima em todas as funções.
        </div>
      )}
    </div>
  );
}



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
  const { data: quotaData, refetch: refetchQuota } = (trpc as any).campaigns?.quotaStatus?.useQuery?.() ?? { data: null, refetch: () => {} };

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

        {/* ── Painel de Controle de Qualidade do Motor ── */}
        <QualityControlPanel llmMode={llmMode?.mode} />

        {/* ── Monitor de Quota e Cache ── */}
        <QuotaMonitor quota={quotaData?.quota} cache={quotaData?.cache} onRefresh={() => refetchQuota?.()} />

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
