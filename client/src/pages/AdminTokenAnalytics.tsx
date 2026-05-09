import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Layout from "@/components/layout/Layout";

const USD_TO_BRL = 5.10;

function fmt(n: any, dec = 0) {
  return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtUSD(n: any)  { return "$" + Number(n || 0).toFixed(4); }
function fmtBRL(n: any)  { return "R$ " + (Number(n || 0) * USD_TO_BRL).toFixed(2); }
function fmtMs(n: any)   { return fmt(n) + "ms"; }

const DAYS_OPTIONS = [1, 7, 14, 30, 90];
const PROVIDER_COLORS: Record<string, string> = {
  gemini: "#4285f4", groq: "#ff6b35", cloudflare: "#f48120", other: "#94a3b8",
};
const ENGINE_COLORS: Record<string, string> = {
  gemini: "#059669", groq: "#d97706", ml_first: "#1d4ed8",
};

// ─────────────────────────────────────────────────────────────────────────────
// TabErrors — Dashboard de erros críticos do MECPro
// ─────────────────────────────────────────────────────────────────────────────
const AREA_LABELS: Record<string, string> = {
  campaign_gen:  "🎯 Geração de Campanha",
  meta_publish:  "📘 Publicação Meta",
  ai_quota:      "⚡ Quota de IA",
  auth:          "🔑 Autenticação",
  db:            "🗄️ Banco de Dados",
  competitor:    "🔍 Concorrentes",
  image_gen:     "🖼️ Imagens",
  video_gen:     "🎬 Vídeo",
  payment:       "💳 Pagamentos",
  general:       "⚙️ Geral",
};

const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626",
  error:    "#ea580c",
  warn:     "#d97706",
};

function TabErrors() {
  const { trpc } = window as any;
  const errorsQuery = (trpc as any)?.admin?.getSystemErrors?.useQuery?.({ refetchInterval: 30000 });
  const resolveMut  = (trpc as any)?.admin?.resolveError?.useMutation?.({
    onSuccess: () => errorsQuery?.refetch?.(),
  });
  const resolveAllMut = (trpc as any)?.admin?.resolveAllErrors?.useMutation?.({
    onSuccess: () => errorsQuery?.refetch?.(),
  });

  const data = errorsQuery?.data;
  const summary = data?.summary;
  const errors  = data?.recent  || [];
  const topAreas = data?.topErrors || [];

  if (errorsQuery?.isLoading) return (
    <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>⏳ Carregando erros...</div>
  );

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Não resolvidos", value: summary?.unresolved ?? 0, color: "#dc2626", bg: "#fef2f2" },
          { label: "Últimas 24h",   value: summary?.last_24h   ?? 0, color: "#ea580c", bg: "#fff7ed" },
          { label: "Críticos",      value: summary?.critical   ?? 0, color: "#dc2626", bg: "#fef2f2" },
          { label: "Warnings",      value: summary?.warnings   ?? 0, color: "#d97706", bg: "#fffbeb" },
          { label: "Total",         value: summary?.total      ?? 0, color: "#475569", bg: "#f8fafc" },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 26, fontWeight: 900, color: k.color, margin: "0 0 2px" }}>{k.value}</p>
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Top áreas com problema */}
      {topAreas.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>🔥 Áreas com mais erros (7 dias)</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {topAreas.map((a: any) => (
              <span key={a.area} style={{ padding: "4px 12px", borderRadius: 20, background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 700 }}>
                {AREA_LABELS[a.area] || a.area}: {a.count} erros
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ações globais */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>
          🚨 Erros não resolvidos ({errors.length})
        </p>
        <button onClick={() => resolveAllMut?.mutate?.({})}
          disabled={resolveAllMut?.isPending || errors.length === 0}
          style={{ fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", color: "#475569" }}>
          ✅ Marcar todos como resolvidos
        </button>
      </div>

      {/* Lista de erros */}
      {errors.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, background: "#f0fdf4", borderRadius: 14 }}>
          <p style={{ fontSize: 32, margin: "0 0 8px" }}>✅</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#166534", margin: 0 }}>Nenhum erro pendente</p>
          <p style={{ fontSize: 12, color: "#16a34a", margin: "4px 0 0" }}>Sistema operando normalmente</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {errors.map((err: any) => (
            <div key={err.id} style={{
              background: "white", border: `1px solid ${SEV_COLOR[err.severity] || "#e2e8f0"}20`,
              borderLeft: `4px solid ${SEV_COLOR[err.severity] || "#e2e8f0"}`,
              borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${SEV_COLOR[err.severity]}15`, color: SEV_COLOR[err.severity] }}>
                      {err.severity?.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                      {AREA_LABELS[err.area] || err.area}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                      {err.code}
                    </span>
                    {err.occurrence_count > 1 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#f1f5f9", color: "#64748b" }}>
                        ×{err.occurrence_count}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "#0f172a", margin: "0 0 6px", lineHeight: 1.4 }}>{err.message}</p>
                  {err.suggestion && (
                    <div style={{ background: "#eff6ff", borderRadius: 8, padding: "6px 10px" }}>
                      <p style={{ fontSize: 11, color: "#1d4ed8", margin: 0 }}>
                        💡 <strong>Sugestão:</strong> {err.suggestion}
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 10, color: "#94a3b8", margin: "0 0 6px" }}>
                    {err.last_occurred ? new Date(err.last_occurred).toLocaleString("pt-BR") : "—"}
                  </p>
                  <button onClick={() => resolveMut?.mutate?.({ errorId: err.id })}
                    disabled={resolveMut?.isPending}
                    style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f0fdf4", color: "#16a34a", cursor: "pointer" }}>
                    ✓ Resolver
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// TabQuota — Quota em tempo real + capacidade de campanhas
// ─────────────────────────────────────────────────────────────────────────────
function TabQuota() {
  const quotaQuery    = (trpc as any).campaigns?.quotaStatus?.useQuery?.({ refetchInterval: 60000 });
  const tokenQuery    = (trpc as any).admin?.getTokenStats?.useQuery?.({ days: 1 });
  const campaignQuery = (trpc as any).admin?.getTokenStats?.useQuery?.({ days: 30 });

  const quota   = quotaQuery?.data?.quota;
  const keys    = quotaQuery?.data?.keys;   // dados REAIS das chaves configuradas
  const today   = tokenQuery?.data?.summary;
  const month   = campaignQuery?.data?.summary;

  // Tokens usados hoje do banco (reais)
  const geminiHoje = Number(tokenQuery?.data?.byModel?.find((m: any) => m.provider === "gemini")?.total_tokens || 0);
  const groqHoje   = Number(tokenQuery?.data?.byModel?.find((m: any) => m.provider === "groq")?.total_tokens   || 0);

  // Limites REAIS das chaves configuradas no Render
  const geminiLimit  = keys?.gemini?.dailyLimitTokens  ?? 1_000_000;
  const groqLimit    = keys?.groq?.dailyLimitTokens    ?? 500_000;
  const geminiKeys   = keys?.gemini?.total             ?? 1;
  const groqKeys     = keys?.groq?.total               ?? 1;
  const hasDuplicates = keys?.gemini?.hasDuplicates    ?? false;
  const uniqueProjects = keys?.gemini?.uniqueProjects  ?? 1;

  // Campanhas restantes (baseado em tokens reais e limites reais)
  const geminiRestante   = Math.max(0, geminiLimit - geminiHoje);
  const groqRestante     = Math.max(0, groqLimit   - groqHoje);
  const campanhasGemini  = Math.floor(geminiRestante / 12_000);
  const campanhasGroq    = Math.floor(groqRestante   / 3_000);
  const campanhasTotal   = campanhasGemini + campanhasGroq;

  // Campanhas hoje e mês
  const reqsHoje  = Number(today?.total_requests  || 0);
  const reqsMes   = Number(month?.total_requests  || 0);
  const custoHoje = Number(today?.total_cost_usd  || 0);
  const custoMes  = Number(month?.total_cost_usd  || 0);

  function ProgressBar({ used, total, color }: { used: number; total: number; color: string }) {
    const pct = Math.min(100, Math.round(used / total * 100));
    const bg  = pct > 90 ? "#dc2626" : pct > 70 ? "#d97706" : color;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>{used.toLocaleString("pt-BR")} usados</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: pct > 90 ? "#dc2626" : "#475569" }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: bg, borderRadius: 99, transition: "width .4s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>Limite: {total.toLocaleString("pt-BR")}</span>
          <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 700 }}>
            Restam: {Math.max(0, total - used).toLocaleString("pt-BR")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* KPIs de capacidade */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Campanhas possíveis hoje", value: campanhasTotal.toLocaleString("pt-BR"), color: "#16a34a", sub: "Gemini + Groq restante" },
          { label: "Requisições hoje",         value: reqsHoje.toLocaleString("pt-BR"),       color: "#0891b2", sub: "chamadas de IA" },
          { label: "Requisições este mês",     value: reqsMes.toLocaleString("pt-BR"),        color: "#7c3aed", sub: "total acumulado" },
          { label: "Custo hoje (USD)",         value: `$${custoHoje.toFixed(4)}`,             color: "#d97706", sub: `≈ R$${(custoHoje * 5.8).toFixed(2)}` },
          { label: "Custo mês (USD)",          value: `$${custoMes.toFixed(3)}`,              color: "#d97706", sub: `≈ R$${(custoMes * 5.8).toFixed(2)}` },
        ].map(k => (
          <div key={k.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: k.color, margin: "0 0 2px" }}>{k.value}</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>{k.label}</p>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Quota por IA */}
      <p style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>📊 Quota por IA — Hoje</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 24 }}>

        {/* Gemini */}
        <div style={{ background: "white", border: "2px solid #4285F420", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>✦</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: 0 }}>Google Gemini</p>
                <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>
                  {geminiKeys} chave{geminiKeys !== 1 ? "s" : ""} · {uniqueProjects} projeto{uniqueProjects !== 1 ? "s" : ""} único{uniqueProjects !== 1 ? "s" : ""} · {(geminiLimit/1_000_000).toFixed(1)}M tokens/dia
                </p>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8" }}>
              GRATUITO
            </span>
          </div>
          <ProgressBar used={geminiHoje} total={geminiLimit} color="#4285F4" />
          {hasDuplicates && (
            <div style={{ marginTop: 6, padding: "5px 10px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa" }}>
              <p style={{ fontSize: 11, color: "#92400e", margin: 0, fontWeight: 700 }}>
                ⚠️ {geminiKeys - uniqueProjects} chave(s) duplicadas detectadas — mesma quota do projeto 1
              </p>
              <p style={{ fontSize: 10, color: "#b45309", margin: "2px 0 0" }}>
                Crie as chaves em projetos Google separados para multiplicar a quota
              </p>
            </div>
          )}
          <div style={{ marginTop: 10, padding: "8px 10px", background: "#f0fdf4", borderRadius: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#166534", margin: 0 }}>
              🎯 Campanhas restantes hoje: <strong>{campanhasGemini.toLocaleString("pt-BR")}</strong>
            </p>
            <p style={{ fontSize: 10, color: "#16a34a", margin: "2px 0 0" }}>
              Baseado em ~12.000 tokens por campanha completa
            </p>
          </div>
        </div>

        {/* Groq */}
        <div style={{ background: "white", border: "2px solid #f9731620", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>⚡</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: 0 }}>Groq Llama 3.3 70B</p>
                <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>
                  {groqKeys} chave{groqKeys !== 1 ? "s" : ""} × 500k = {(groqLimit/1_000).toFixed(0)}k tokens/dia
                </p>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "#fff7ed", color: "#c2410c" }}>
              FALLBACK
            </span>
          </div>
          <ProgressBar used={groqHoje} total={groqLimit} color="#f97316" />
          <div style={{ marginTop: 10, padding: "8px 10px", background: "#fff7ed", borderRadius: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", margin: 0 }}>
              🎯 Campanhas restantes hoje: <strong>{campanhasGroq.toLocaleString("pt-BR")}</strong>
            </p>
            <p style={{ fontSize: 10, color: "#ea580c", margin: "2px 0 0" }}>
              Baseado em ~3.000 tokens por campanha via Groq
            </p>
          </div>
        </div>

        {/* Cloudflare */}
        <div style={{ background: "white", border: "2px solid #f59e0b20", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>🖼️</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: 0 }}>Cloudflare FLUX</p>
                <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>10.000 neurons/dia (imagens)</p>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "#fffbeb", color: "#b45309" }}>
              IMAGENS
            </span>
          </div>
          <div style={{ marginTop: 8, padding: "10px 12px", background: "#fffbeb", borderRadius: 10 }}>
            <p style={{ fontSize: 12, color: "#92400e", margin: "0 0 4px", fontWeight: 700 }}>
              ⚠️ Quota rastreada nos logs do servidor
            </p>
            <p style={{ fontSize: 11, color: "#b45309", margin: 0 }}>
              4 imagens por campanha = 4 neurons cada
              Quando esgota (429) → Pollinations como fallback automático
            </p>
          </div>
          <div style={{ marginTop: 8, padding: "8px 10px", background: "#f0fdf4", borderRadius: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#166534", margin: 0 }}>
              🎯 Campanhas com imagem CF: <strong>~2.500/dia</strong>
            </p>
            <p style={{ fontSize: 10, color: "#16a34a", margin: "2px 0 0" }}>
              Reset: todo dia às 21h (meia-noite UTC)
            </p>
          </div>
        </div>
      </div>

      {/* Projeção */}
      <div style={{ background: "#0f172a", borderRadius: 14, padding: "18px 22px" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.5)", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
          📈 Projeção de Capacidade
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            { label: "Campanhas/dia (atual)",  value: `~${campanhasTotal}`,          sub: "com quota disponível" },
            { label: "Com 5 chaves Gemini",    value: `~${campanhasGemini * 2}`,     sub: "+2 projetos separados" },
            { label: "Clientes suportados",    value: `~${Math.round(campanhasTotal * 10)}`, sub: "DAU 10% × 1 campanha/dia" },
            { label: "Custo por campanha",     value: `$${(custoHoje / Math.max(reqsHoje, 1)).toFixed(4)}`, sub: "média hoje" },
          ].map(p => (
            <div key={p.label} style={{ textAlign: "center" }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", margin: "0 0 4px" }}>{p.value}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.7)", margin: "0 0 2px" }}>{p.label}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.35)", margin: 0 }}>{p.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


export default function AdminTokenAnalytics() {
  const [days, setDays]         = useState(7);
  const [page, setPage]         = useState(1);
  const [logModel, setLogModel] = useState("");
  const [logEndpoint, setLogEndpoint] = useState("");
  const [activeTab, setActiveTab] = useState<"overview"|"models"|"endpoints"|"logs"|"efficiency">("overview");

  const { data, isLoading } = (trpc as any).admin?.getTokenStats?.useQuery?.(
    { days }, { refetchInterval: 30000 }
  ) ?? { data: null, isLoading: false };

  const { data: logs, isLoading: logsLoading } = (trpc as any).admin?.getTokenLogs?.useQuery?.(
    { page, limit: 50, days, model: logModel || undefined, endpoint: logEndpoint || undefined },
    { enabled: activeTab === "logs" }
  ) ?? { data: null, isLoading: false };

  const s = data?.summary || {};
  const cacheHitPct = s.total_requests > 0
    ? ((Number(s.cache_hits) / Number(s.total_requests)) * 100).toFixed(1)
    : "0";

  return (
    <Layout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              🔭 Token Analytics
            </h1>
            <p style={{ fontSize: 13, color: "#64748b", margin: "2px 0 0" }}>
              Observabilidade completa do consumo de IA
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {DAYS_OPTIONS.map(d => (
              <button key={d} onClick={() => setDays(d)}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: days === d ? "#0f172a" : "white",
                  color: days === d ? "white" : "#64748b",
                  border: "1px solid " + (days === d ? "#0f172a" : "#e2e8f0") }}>
                {d === 1 ? "Hoje" : `${d}d`}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
            ⏳ Carregando métricas...
          </div>
        ) : !data ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
            Nenhum dado disponível ainda. Gere uma campanha para começar o tracking.
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total Tokens", value: fmt(s.total_tokens), sub: fmt(s.total_requests) + " requests", color: "#0f172a", bg: "#f8fafc" },
                { label: "Custo Total (USD)", value: fmtUSD(s.total_cost_usd), sub: fmtBRL(s.total_cost_usd), color: "#dc2626", bg: "#fff1f2" },
                { label: "Média / Request", value: fmt(s.avg_tokens_per_req), sub: "tokens por chamada", color: "#7c3aed", bg: "#fdf4ff" },
                { label: "Latência Média", value: fmtMs(s.avg_latency_ms), sub: "tempo de resposta", color: "#0369a1", bg: "#f0f9ff" },
                { label: "Cache Hit", value: cacheHitPct + "%", sub: fmt(s.cache_hits) + " hits", color: "#059669", bg: "#f0fdf4" },
                { label: "Erros", value: fmt(Number(s.errors) + Number(s.timeouts)), sub: fmt(s.errors) + " err / " + fmt(s.timeouts) + " timeout", color: "#d97706", bg: "#fffbeb" },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 18px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", margin: "0 0 6px", letterSpacing: 0.5 }}>{card.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: card.color, margin: "0 0 2px" }}>{card.value}</p>
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0", paddingBottom: 0 }}>
              {([
                ["overview", "📊 Visão Geral"],
                ["models", "🤖 Por Modelo"],
                ["endpoints", "⚙️ Por Endpoint"],
                ["efficiency", "🔍 Eficiência"],
                ["logs", "📋 Logs Detalhados"],
                ["errors", "🚨 Erros"],
                ["quota",  "📊 Quota IA"],
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: "8px 16px", fontSize: 13, fontWeight: activeTab === tab ? 700 : 500,
                    color: activeTab === tab ? "#0f172a" : "#64748b",
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: "2px solid " + (activeTab === tab ? "#0f172a" : "transparent"),
                    marginBottom: -2 }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* Timeline */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20, gridColumn: "1 / -1" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>📈 Tokens por dia</p>
                  {data.timeline?.length > 0 ? (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                      {data.timeline.map((d: any) => {
                        const max = Math.max(...data.timeline.map((x: any) => Number(x.total_tokens)));
                        const h = max > 0 ? Math.max(4, (Number(d.total_tokens) / max) * 70) : 4;
                        return (
                          <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div title={`${d.day}: ${fmt(d.total_tokens)} tokens`}
                              style={{ width: "100%", height: h, background: "#4285f4", borderRadius: 4, minHeight: 4 }} />
                            <span style={{ fontSize: 9, color: "#94a3b8", transform: "rotate(-45deg)", transformOrigin: "center" }}>
                              {String(d.day).slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: "#94a3b8", fontSize: 13 }}>Sem dados no período</p>
                  )}
                </div>

                {/* By Engine */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>✍️ Por Engine de Copy</p>
                  {data.byCopyEngine?.map((e: any) => (
                    <div key={e.engine} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: ENGINE_COLORS[e.engine] || "#64748b" }}>
                          {e.engine === "gemini" ? "🟢" : e.engine === "groq" ? "🟡" : "🔵"} {e.engine}
                        </span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>
                          {fmtUSD(e.cost_usd)} · ratio {e.completion_ratio}
                        </span>
                      </div>
                      <div style={{ background: "#f1f5f9", borderRadius: 4, height: 6 }}>
                        <div style={{
                          width: Math.min(100, (Number(e.total_tokens) / Math.max(...data.byCopyEngine.map((x: any) => Number(x.total_tokens)))) * 100) + "%",
                          height: "100%", borderRadius: 4,
                          background: ENGINE_COLORS[e.engine] || "#94a3b8"
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(e.total_tokens)} tokens · {fmt(e.requests)} req</span>
                    </div>
                  ))}
                </div>

                {/* Cache */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>💾 Cache Performance</p>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1, background: "#f0fdf4", borderRadius: 10, padding: 12, textAlign: "center" }}>
                      <p style={{ fontSize: 24, fontWeight: 800, color: "#059669", margin: 0 }}>{cacheHitPct}%</p>
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>Hit Rate</p>
                    </div>
                    <div style={{ flex: 1, background: "#eff6ff", borderRadius: 10, padding: 12, textAlign: "center" }}>
                      <p style={{ fontSize: 24, fontWeight: 800, color: "#1d4ed8", margin: 0 }}>{fmt(s.cache_hits)}</p>
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>Hits totais</p>
                    </div>
                  </div>
                  {data.cacheStats?.map((c: any) => (
                    <div key={c.cache_type} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.cache_type === "ram" ? "⚡ RAM" : "🗄️ DB"}</span>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{fmt(c.count)} hits · {fmt(c.tokens_saved)} tokens salvos</span>
                    </div>
                  ))}
                </div>

                {/* Top Projects */}
                {data.topProjects?.length > 0 && (
                  <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20, gridColumn: "1 / -1" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>🏆 Top Projetos por Custo</p>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Projeto", "Requests", "Tokens", "Custo USD", "Custo BRL"].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProjects.map((p: any) => (
                          <tr key={p.project_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{p.project_name || "Projeto " + p.project_id}</td>
                            <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmt(p.requests)}</td>
                            <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmt(p.total_tokens)}</td>
                            <td style={{ padding: "10px 12px", color: "#dc2626", fontWeight: 700 }}>{fmtUSD(p.cost_usd)}</td>
                            <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmtBRL(p.cost_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Models Tab */}
            {activeTab === "models" && (
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>🤖 Métricas por Modelo</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Modelo", "Provider", "Requests", "Prompt Tokens", "Completion", "Total", "Custo USD", "Custo BRL", "Latência", "Cache Hits", "Erros"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.byModel?.map((m: any) => (
                        <tr key={m.model + m.provider} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>{m.model}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                              background: (PROVIDER_COLORS[m.provider] || "#94a3b8") + "22",
                              color: PROVIDER_COLORS[m.provider] || "#64748b" }}>
                              {m.provider}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmt(m.requests)}</td>
                          <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmt(m.prompt_tokens)}</td>
                          <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmt(m.completion_tokens)}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{fmt(m.total_tokens)}</td>
                          <td style={{ padding: "10px 12px", color: "#dc2626", fontWeight: 700 }}>{fmtUSD(m.cost_usd)}</td>
                          <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmtBRL(m.cost_usd)}</td>
                          <td style={{ padding: "10px 12px", color: "#64748b" }}>{fmtMs(m.avg_latency_ms)}</td>
                          <td style={{ padding: "10px 12px", color: "#059669" }}>{fmt(m.cache_hits)}</td>
                          <td style={{ padding: "10px 12px", color: m.errors > 0 ? "#dc2626" : "#94a3b8" }}>{fmt(m.errors)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Endpoints Tab */}
            {activeTab === "endpoints" && (
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>⚙️ Top Endpoints por Consumo</p>
                {data.byEndpoint?.map((e: any, i: number) => {
                  const maxTok = Math.max(...(data.byEndpoint || []).map((x: any) => Number(x.total_tokens)));
                  const pct = maxTok > 0 ? (Number(e.total_tokens) / maxTok) * 100 : 0;
                  return (
                    <div key={e.endpoint} style={{ marginBottom: 16, padding: "14px 16px", background: "#f8fafc", borderRadius: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", background: "#e2e8f0", padding: "2px 6px", borderRadius: 4 }}>#{i+1}</span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{e.endpoint}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#dc2626" }}>{fmtUSD(e.cost_usd)}</span>
                          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{fmt(e.requests)} req</span>
                        </div>
                      </div>
                      <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6, marginBottom: 6 }}>
                        <div style={{ width: pct + "%", height: "100%", borderRadius: 4, background: "#4285f4" }} />
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#64748b" }}>
                        <span>{fmt(e.total_tokens)} tokens total</span>
                        <span>~{fmt(e.avg_tokens)} / req</span>
                        <span>latência ~{fmtMs(e.avg_latency_ms)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Efficiency Tab */}
            {activeTab === "efficiency" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 14, padding: 20 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#ea580c", margin: "0 0 4px" }}>⚠️ Prompts Pesados (ratio completion/prompt &gt; 0.5)</p>
                  <p style={{ fontSize: 13, color: "#9a3412", margin: "0 0 16px" }}>Endpoints onde a IA responde mais do que recebe — possível otimização</p>
                  {data.inefficient?.length > 0 ? (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#ffedd5" }}>
                          {["Endpoint", "Modelo", "Count", "Avg Tokens", "Ratio", "Custo Total"].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#9a3412" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.inefficient.map((r: any, i: number) => (
                          <tr key={i} style={{ borderBottom: "1px solid #fed7aa" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.endpoint}</td>
                            <td style={{ padding: "10px 12px", color: "#64748b" }}>{r.model}</td>
                            <td style={{ padding: "10px 12px" }}>{fmt(r.count)}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "#ea580c" }}>{fmt(r.avg_tokens)}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontWeight: 700, color: Number(r.ratio) > 1 ? "#dc2626" : "#d97706" }}>
                                {Number(r.ratio).toFixed(2)}x
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", color: "#dc2626", fontWeight: 700 }}>{fmtUSD(r.total_cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ color: "#059669", fontWeight: 600 }}>✅ Nenhum endpoint com ratio problemático encontrado</p>
                  )}
                </div>

                {/* Optimization tips */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>💡 Sugestões de Otimização</p>
                  {[
                    { condition: Number(s.cache_hits) / Math.max(Number(s.total_requests),1) < 0.3, icon: "💾", title: "Cache hit abaixo de 30%", desc: "Considere aumentar TTL do cache ou cachear mais endpoints via cacheAs no prompt." },
                    { condition: Number(s.avg_latency_ms) > 15000, icon: "⚡", title: "Latência média alta (>15s)", desc: "Ative gemini-2.5-flash-lite para prompts menores. Reserve o flash-full para campanhas completas." },
                    { condition: Number(s.errors) > 5, icon: "🔁", title: "Taxa de erro alta", desc: "Verifique retries e se as 5 chaves Gemini estão rotacionando corretamente." },
                    { condition: data.byCopyEngine?.find((e: any) => e.engine === 'ml_first')?.completion_ratio > 1, icon: "✂️", title: "ML-First com ratio alto", desc: "ML-First com temperatura 0.5 deveria gerar respostas menores. Verifique se o system prompt do ML não está inflado." },
                    { condition: true, icon: "🔀", title: "Roteamento inteligente de modelo", desc: "Use gemini-2.5-flash-lite para matchScore e hooks. Reserve flash-full para generateCampaign completo." },
                  ].filter(t => t.condition).map((tip, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ fontSize: 20 }}>{tip.icon}</span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 2px" }}>{tip.title}</p>
                        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{tip.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === "errors" && <TabErrors />}
          {activeTab === "quota"  && <TabQuota />}
          {activeTab === "logs" && (
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                  <input placeholder="Filtrar por modelo..." value={logModel} onChange={e => setLogModel(e.target.value)}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, width: 180 }} />
                  <input placeholder="Filtrar por endpoint..." value={logEndpoint} onChange={e => setLogEndpoint(e.target.value)}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, width: 200 }} />
                  <button onClick={() => { /* TODO: export CSV */ }}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    📥 Export CSV
                  </button>
                </div>
                {logsLoading ? <p style={{ color: "#94a3b8" }}>Carregando...</p> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Hora", "Endpoint", "Modelo", "Prompt", "Completion", "Total", "Custo", "Latência", "Cache", "Engine", "Status"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {logs?.rows?.map((r: any) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                            <td style={{ padding: "8px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleTimeString("pt-BR")}</td>
                            <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.endpoint}</td>
                            <td style={{ padding: "8px 10px", color: PROVIDER_COLORS[r.provider] || "#64748b", whiteSpace: "nowrap" }}>{r.model?.replace("gemini-", "")}</td>
                            <td style={{ padding: "8px 10px", color: "#64748b" }}>{fmt(r.prompt_tokens)}</td>
                            <td style={{ padding: "8px 10px", color: "#64748b" }}>{fmt(r.completion_tokens)}</td>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>{fmt(r.total_tokens)}</td>
                            <td style={{ padding: "8px 10px", color: "#dc2626", fontWeight: 700 }}>{fmtUSD(r.estimated_cost_usd)}</td>
                            <td style={{ padding: "8px 10px", color: "#64748b" }}>{fmtMs(r.latency_ms)}</td>
                            <td style={{ padding: "8px 10px" }}>
                              {r.cache_hit
                                ? <span style={{ color: "#059669", fontWeight: 700 }}>✓ {r.cache_type}</span>
                                : <span style={{ color: "#94a3b8" }}>miss</span>}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10,
                                background: (ENGINE_COLORS[r.copy_engine] || "#94a3b8") + "22",
                                color: ENGINE_COLORS[r.copy_engine] || "#94a3b8" }}>
                                {r.copy_engine || "gemini"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ color: r.status === "ok" ? "#059669" : "#dc2626", fontWeight: 700 }}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Pagination */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>
                        {fmt(logs?.total)} registros no período
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button disabled={page <= 1} onClick={() => setPage(p => p-1)}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #e2e8f0", cursor: page > 1 ? "pointer" : "default", opacity: page <= 1 ? 0.4 : 1 }}>← Anterior</button>
                        <span style={{ padding: "6px 12px", fontSize: 12 }}>Pág {page}</span>
                        <button onClick={() => setPage(p => p+1)}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #e2e8f0", cursor: "pointer" }}>Próxima →</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
