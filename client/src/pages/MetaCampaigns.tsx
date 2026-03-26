import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import PlacementSelector from "@/components/PlacementSelector";
import { PLATFORM_PLACEMENTS, type PlacementMode } from "@/components/PlacementConfig";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type Insight = { impressions: string; clicks: string; spend: string; cpc: string; cpm: string; ctr: string; reach?: string };
type Campaign = {
  id: string; name: string; objective: string; status: string;
  created_time: string; updated_time?: string;
  daily_budget?: string; lifetime_budget?: string;
  source: "mecpro" | "facebook";
  insights?: { data: Insight[] };
};
type AdSet = {
  id: string; name: string; status: string; daily_budget?: string;
  optimization_goal?: string;
  targeting?: {
    publisher_platforms?: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
  };
  insights?: { data: Insight[] };
};
type Ad = {
  id: string; name: string; status: string;
  creative?: { id: string; name?: string; title?: string; body?: string; image_url?: string; thumbnail_url?: string };
  insights?: { data: Insight[] };
};

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const STATUS: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  ACTIVE:   { bg: "#f0fdf4", color: "#15803d", dot: "#22c55e", label: "Ativa" },
  PAUSED:   { bg: "#fef9c3", color: "#854d0e", dot: "#f59e0b", label: "Pausada" },
  DELETED:  { bg: "#fef2f2", color: "#991b1b", dot: "#ef4444", label: "Deletada" },
  ARCHIVED: { bg: "#f1f5f9", color: "#475569", dot: "#94a3b8", label: "Arquivada" },
};
const OBJ_LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Leads", OUTCOME_SALES: "Vendas", OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_AWARENESS: "Alcance",
  OUTCOME_APP_PROMOTION: "App", OUTCOME_STORE_TRAFFIC: "Loja Física",
};

// Cores para o comparador
const COMPARE_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const R = (v?: string | number) =>
  v == null || v === "" ? "—" : `R$ ${(Number(v) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const N = (v?: string | number) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR");
const D = (v?: string) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const PCT = (v?: string | number) => (v == null || v === "" ? "—" : `${Number(v).toFixed(2)}%`);

// extrai métricas numéricas de uma campanha
function extractMetrics(c: Campaign) {
  const m = c.insights?.data?.[0];
  return {
    impressions: Number(m?.impressions || 0),
    clicks:      Number(m?.clicks || 0),
    spend:       Number(m?.spend || 0),
    cpc:         Number(m?.cpc || 0),
    cpm:         Number(m?.cpm || 0),
    ctr:         Number(m?.ctr || 0),
    budget:      Number(c.daily_budget || c.lifetime_budget || 0) / 100,
  };
}

// ─────────────────────────────────────────────
// SUB-COMPONENTES BÁSICOS
// ─────────────────────────────────────────────

function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "white", borderRadius: 20, padding: 32,
        width: wide ? 860 : 480, maxWidth: "96vw", maxHeight: "92vh",
        overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.25)",
        animation: "slideUp 0.18s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: "mecpro" | "facebook" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
      background: source === "mecpro" ? "linear-gradient(135deg,#dcfce7,#bbf7d0)" : "linear-gradient(135deg,#dbeafe,#bfdbfe)",
      color: source === "mecpro" ? "#15803d" : "#1d4ed8",
      border: `1px solid ${source === "mecpro" ? "#86efac" : "#93c5fd"}`,
    }}>
      {source === "mecpro" ? "🤖" : "📘"} {source === "mecpro" ? "MECPro AI" : "Facebook"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || STATUS.PAUSED;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function MiniBar({ val, max, color }: { val: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((val / max) * 100, 100) : 0;
  return (
    <div style={{ background: "#f1f5f9", borderRadius: 4, height: 4, width: "100%", marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color, transition: "width 0.4s ease" }} />
    </div>
  );
}

function MetricCard({ label, value, icon, sub, color }: { label: string; value: string; icon: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: "white", border: "1px solid var(--border)", borderRadius: 14,
      padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "var(--font-display)" }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function ActionDropdown({ campaign, onRename, onDelete, onToggleStatus, onView, onEditBudget }: {
  campaign: Campaign;
  onRename: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onView: () => void;
  onEditBudget: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const isActive = campaign.status === "ACTIVE";
  const items = [
    { icon: "🔍", label: "Ver detalhes", action: onView },
    { icon: "✏️", label: "Renomear", action: onRename },
    { icon: "💰", label: "Editar orçamento", action: onEditBudget },
    { icon: isActive ? "⏸️" : "▶️", label: isActive ? "Pausar campanha" : "Ativar campanha", action: onToggleStatus },
    { icon: "🗑️", label: "Excluir campanha", action: onDelete, danger: true },
  ];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: open ? "#f1f5f9" : "transparent", border: "1px solid var(--border)",
          borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 16, lineHeight: 1,
        }}>
        ⋯
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100,
          background: "white", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 12px 32px rgba(0,0,0,0.14)", padding: 6, minWidth: 200,
          animation: "slideDown 0.12s ease",
        }}>
          {items.map((item, i) => (
            <button key={i} onClick={() => { item.action(); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              background: "none", border: "none", padding: "9px 14px", borderRadius: 8,
              fontSize: 13, cursor: "pointer", textAlign: "left",
              color: item.danger ? "#dc2626" : "var(--black)",
              fontWeight: 500,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = item.danger ? "#fef2f2" : "#f8fafc")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// GRÁFICO DE BARRAS HORIZONTAL (sem lib externa)
// ─────────────────────────────────────────────
function HorizontalBar({ label, value, max, color, formattedValue }: {
  label: string; value: number; max: number; color: string; formattedValue: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "var(--body)", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{formattedValue}</span>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 6, height: 8 }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: color, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// RADAR CHART SVG (sem lib externa)
// ─────────────────────────────────────────────
function RadarChart({ campaigns, colors }: { campaigns: Campaign[]; colors: string[] }) {
  const cx = 180, cy = 180, r = 130;
  const metrics = [
    { key: "impressions", label: "Impressões" },
    { key: "clicks",      label: "Cliques" },
    { key: "ctr",         label: "CTR" },
    { key: "spend",       label: "Gasto" },
    { key: "cpc",         label: "CPC" },
    { key: "cpm",         label: "CPM" },
  ];
  const n = metrics.length;

  // Normaliza cada métrica 0-1 entre as campanhas selecionadas
  const allValues = metrics.map(m => campaigns.map(c => {
    const vals = extractMetrics(c);
    return (vals as any)[m.key] as number;
  }));
  const maxValues = allValues.map(vals => Math.max(...vals, 0.001));

  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  function getPoint(metricIdx: number, value: number): [number, number] {
    const angle = startAngle + metricIdx * angleStep;
    const dist = value * r;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  }

  // grades
  const grades = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg width={360} height={360} viewBox="0 0 360 360" style={{ overflow: "visible" }}>
      {/* Grade círculos */}
      {grades.map(g => {
        const points = metrics.map((_, i) => {
          const angle = startAngle + i * angleStep;
          return `${cx + g * r * Math.cos(angle)},${cy + g * r * Math.sin(angle)}`;
        }).join(" ");
        return <polygon key={g} points={points} fill="none" stroke="#e2e8f0" strokeWidth="1" />;
      })}

      {/* Eixos */}
      {metrics.map((m, i) => {
        const angle = startAngle + i * angleStep;
        const ex = cx + r * Math.cos(angle);
        const ey = cy + r * Math.sin(angle);
        const lx = cx + (r + 22) * Math.cos(angle);
        const ly = cy + (r + 22) * Math.sin(angle);
        return (
          <g key={m.key}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#e2e8f0" strokeWidth="1" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fill="#64748b" fontWeight="600">
              {m.label}
            </text>
          </g>
        );
      })}

      {/* Polígonos das campanhas */}
      {campaigns.map((c, ci) => {
        const vals = extractMetrics(c);
        const points = metrics.map((m, mi) => {
          const raw = (vals as any)[m.key] as number;
          const norm = maxValues[mi] > 0 ? raw / maxValues[mi] : 0;
          return getPoint(mi, norm);
        });
        const pathD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") + " Z";
        return (
          <g key={c.id}>
            <path d={pathD} fill={colors[ci]} fillOpacity={0.15} stroke={colors[ci]} strokeWidth="2.5" />
            {points.map(([x, y], pi) => (
              <circle key={pi} cx={x} cy={y} r={4} fill={colors[ci]} />
            ))}
          </g>
        );
      })}

      {/* Centro */}
      <circle cx={cx} cy={cy} r={3} fill="#94a3b8" />
    </svg>
  );
}

// ─────────────────────────────────────────────
// PAINEL DE ANÁLISE DE PERFORMANCE
// ─────────────────────────────────────────────
function PerformancePanel({ campaigns }: { campaigns: Campaign[] }) {
  const [metric, setMetric] = useState<"impressions" | "clicks" | "spend" | "ctr" | "cpc" | "cpm">("impressions");

  const METRIC_CONFIG: Record<string, { label: string; icon: string; color: string; format: (v: number) => string }> = {
    impressions: { label: "Impressões",  icon: "👁️",  color: "#3b82f6", format: v => N(v) },
    clicks:      { label: "Cliques",     icon: "🖱️",  color: "#8b5cf6", format: v => N(v) },
    spend:       { label: "Gasto (R$)",  icon: "💰",  color: "#ef4444", format: v => `R$\u00a0${v.toFixed(2)}` },
    ctr:         { label: "CTR (%)",     icon: "📈",  color: "#10b981", format: v => `${v.toFixed(2)}%` },
    cpc:         { label: "CPC (R$)",    icon: "💳",  color: "#f59e0b", format: v => `R$\u00a0${v.toFixed(2)}` },
    cpm:         { label: "CPM (R$)",    icon: "📣",  color: "#0891b2", format: v => `R$\u00a0${v.toFixed(2)}` },
  };

  const cfg = METRIC_CONFIG[metric];

  // Agrega totais gerais
  const totals = useMemo(() => campaigns.reduce((acc, c) => {
    const m = extractMetrics(c);
    return {
      impressions: acc.impressions + m.impressions,
      clicks:      acc.clicks + m.clicks,
      spend:       acc.spend + m.spend,
    };
  }, { impressions: 0, clicks: 0, spend: 0 }), [campaigns]);

  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const avgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const avgCpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

  // Ranking pela métrica selecionada
  const ranked = useMemo(() => {
    return [...campaigns]
      .map(c => {
        const m = extractMetrics(c);
        return { ...c, val: (m as any)[metric] as number };
      })
      .filter(c => c.val > 0)
      .sort((a, b) => b.val - a.val);
  }, [campaigns, metric]);

  const maxVal = ranked[0]?.val || 1;

  // Campanhas ativas vs pausadas
  const activeCount = campaigns.filter(c => c.status === "ACTIVE").length;
  const pausedCount = campaigns.filter(c => c.status === "PAUSED").length;

  // Score de saúde da conta (heurística simples)
  const healthScore = Math.min(100, Math.round(
    (activeCount / Math.max(campaigns.length, 1)) * 40 +
    (avgCtr > 1 ? 30 : avgCtr * 30) +
    (totals.impressions > 1000 ? 30 : (totals.impressions / 1000) * 30)
  ));
  const healthColor = healthScore >= 70 ? "#16a34a" : healthScore >= 40 ? "#d97706" : "#dc2626";
  const healthLabel = healthScore >= 70 ? "Boa" : healthScore >= 40 ? "Regular" : "Baixa";

  return (
    <div>
      {/* KPIs gerais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Impressões",  value: N(totals.impressions), icon: "👁️",  color: "#3b82f6" },
          { label: "Cliques",     value: N(totals.clicks),      icon: "🖱️",  color: "#8b5cf6" },
          { label: "Total gasto", value: `R$ ${totals.spend.toFixed(2)}`, icon: "💰", color: "#ef4444" },
          { label: "CTR médio",   value: `${avgCtr.toFixed(2)}%`, icon: "📈", color: "#10b981" },
          { label: "CPC médio",   value: `R$ ${avgCpc.toFixed(2)}`, icon: "💳", color: "#f59e0b" },
          { label: "CPM médio",   value: `R$ ${avgCpm.toFixed(2)}`, icon: "📣", color: "#0891b2" },
        ].map(s => <MetricCard key={s.label} {...s} />)}
      </div>

      {/* Saúde da conta + distribuição status */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        {/* Score */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 16 }}>🏥 Saúde da conta</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 80, height: 80 }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="30" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                <circle cx="40" cy="40" r="30" fill="none" stroke={healthColor} strokeWidth="8"
                  strokeDasharray={`${(healthScore / 100) * 188.5} 188.5`}
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: healthColor }}>{healthScore}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: healthColor }}>{healthLabel}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                {activeCount} ativa{activeCount !== 1 ? "s" : ""} · {pausedCount} pausada{pausedCount !== 1 ? "s" : ""}
              </div>
              {avgCtr < 0.5 && <div style={{ fontSize: 11, color: "#d97706", marginTop: 4 }}>⚠️ CTR abaixo de 0.5%</div>}
              {avgCpc > 5 && <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>⚠️ CPC acima de R$5</div>}
              {activeCount === 0 && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>⛔ Sem campanhas ativas</div>}
            </div>
          </div>
        </div>

        {/* Distribuição por objetivo */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 12 }}>🎯 Objetivos</div>
          {Object.entries(
            campaigns.reduce((acc, c) => {
              const label = OBJ_LABELS[c.objective] || c.objective;
              acc[label] = (acc[label] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COMPARE_COLORS[i % COMPARE_COLORS.length], flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--body)", flex: 1 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{count}</span>
              <div style={{ width: 60, background: "#f1f5f9", borderRadius: 4, height: 6 }}>
                <div style={{ width: `${(count / campaigns.length) * 100}%`, height: "100%", borderRadius: 4, background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ranking por métrica */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>📊 Ranking de campanhas por métrica</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(METRIC_CONFIG).map(([key, c]) => (
              <button key={key} onClick={() => setMetric(key as any)} style={{
                padding: "5px 12px", borderRadius: 20, border: "1px solid",
                borderColor: metric === key ? c.color : "var(--border)",
                background: metric === key ? c.color : "white",
                color: metric === key ? "white" : "var(--muted)",
                fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        {ranked.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>
            Nenhuma campanha com dados para "{cfg.label}"
          </div>
        ) : (
          <div>
            {ranked.map((c, i) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800,
                  background: i === 0 ? "#fef9c3" : i === 1 ? "#f1f5f9" : "#fff7ed",
                  color: i === 0 ? "#854d0e" : i === 1 ? "#475569" : "#c2410c",
                  flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--black)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ background: "#f1f5f9", borderRadius: 6, height: 8, marginTop: 4 }}>
                    <div style={{
                      width: `${(c.val / maxVal) * 100}%`, height: "100%", borderRadius: 6,
                      background: cfg.color, transition: "width 0.5s ease",
                    }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: cfg.color, whiteSpace: "nowrap", minWidth: 80, textAlign: "right" }}>
                  {cfg.format(c.val)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Insight automático */}
        {ranked.length > 0 && (
          <div style={{ marginTop: 20, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, borderLeft: `3px solid ${cfg.color}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", marginBottom: 4 }}>💡 Insight</div>
            <div style={{ fontSize: 12, color: "var(--body)", lineHeight: 1.6 }}>
              {metric === "impressions" && `"${ranked[0].name}" lidera em alcance com ${N(ranked[0].val)} impressões — ${ranked.length > 1 ? `${((ranked[0].val / ranked[ranked.length-1].val)).toFixed(1)}x mais que a última colocada.` : "única campanha com dados."}`}
              {metric === "clicks" && `"${ranked[0].name}" gera o maior volume de tráfego com ${N(ranked[0].val)} cliques.`}
              {metric === "spend" && `"${ranked[0].name}" é a campanha com maior investimento: R$ ${ranked[0].val.toFixed(2)}.`}
              {metric === "ctr" && (ranked[0].val > 2 ? `✅ "${ranked[0].name}" tem CTR excelente de ${ranked[0].val.toFixed(2)}% — bem acima da média do setor (1-2%).` : `"${ranked[0].name}" lidera em CTR com ${ranked[0].val.toFixed(2)}%.`)}
              {metric === "cpc" && (ranked[0].val < 2 ? `✅ "${ranked[0].name}" tem o menor CPC: R$ ${ranked[0].val.toFixed(2)} — custo por clique eficiente.` : `"${ranked[0].name}" apresenta o CPC mais alto: R$ ${ranked[0].val.toFixed(2)}. Considere revisar os criativos.`)}
              {metric === "cpm" && `"${ranked[0].name}" tem CPM de R$ ${ranked[0].val.toFixed(2)} — custo por mil impressões.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPARADOR DE CAMPANHAS
// ─────────────────────────────────────────────
function CampaignComparator({ campaigns, onClose }: { campaigns: Campaign[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [compareView, setCompareView] = useState<"table" | "bars" | "radar">("table");

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const selectedCampaigns = campaigns.filter(c => selected.includes(c.id));

  const METRICS = [
    { key: "impressions", label: "Impressões",   format: (v: number) => N(v),                  icon: "👁️" },
    { key: "clicks",      label: "Cliques",       format: (v: number) => N(v),                  icon: "🖱️" },
    { key: "spend",       label: "Gasto (R$)",    format: (v: number) => `R$ ${v.toFixed(2)}`,  icon: "💰" },
    { key: "ctr",         label: "CTR (%)",        format: (v: number) => `${v.toFixed(2)}%`,    icon: "📈" },
    { key: "cpc",         label: "CPC (R$)",       format: (v: number) => `R$ ${v.toFixed(2)}`,  icon: "💳" },
    { key: "cpm",         label: "CPM (R$)",       format: (v: number) => `R$ ${v.toFixed(2)}`,  icon: "📣" },
    { key: "budget",      label: "Orçamento/dia",  format: (v: number) => `R$ ${v.toFixed(2)}`,  icon: "🏦" },
  ];

  // Determina o "vencedor" de cada métrica
  function getWinner(metricKey: string): string | null {
    if (selectedCampaigns.length < 2) return null;
    const isLowerBetter = ["cpc", "cpm", "spend"].includes(metricKey);
    const vals = selectedCampaigns.map(c => ({ id: c.id, val: (extractMetrics(c) as any)[metricKey] as number })).filter(x => x.val > 0);
    if (vals.length === 0) return null;
    return (isLowerBetter
      ? vals.reduce((a, b) => a.val < b.val ? a : b)
      : vals.reduce((a, b) => a.val > b.val ? a : b)
    ).id;
  }

  return (
    <div>
      {/* Seleção de campanhas */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 10 }}>
          Selecione até 5 campanhas para comparar:
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400, marginLeft: 8 }}>
            {selected.length} selecionada{selected.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {campaigns.map((c, ci) => {
            const isSelected = selected.includes(c.id);
            const colorIdx = selected.indexOf(c.id);
            return (
              <div
                key={c.id}
                onClick={() => toggle(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                  border: `2px solid ${isSelected ? COMPARE_COLORS[colorIdx] || "#3b82f6" : "var(--border)"}`,
                  background: isSelected ? `${COMPARE_COLORS[colorIdx] || "#3b82f6"}10` : "white",
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 6,
                  background: isSelected ? COMPARE_COLORS[colorIdx] || "#3b82f6" : "#f1f5f9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: "white", fontWeight: 700, flexShrink: 0,
                }}>
                  {isSelected ? "✓" : ""}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--black)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    <StatusBadge status={c.status} /> · {OBJ_LABELS[c.objective] || c.objective}
                  </div>
                </div>
                {isSelected && (
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: COMPARE_COLORS[colorIdx], flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedCampaigns.length < 2 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", background: "#f8fafc", borderRadius: 12, color: "var(--muted)", fontSize: 13 }}>
          Selecione pelo menos 2 campanhas para comparar
        </div>
      ) : (
        <>
          {/* Legenda + seletor de view */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {selectedCampaigns.map((c, i) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: COMPARE_COLORS[i] }} />
                  <span style={{ color: "var(--body)", fontWeight: 600, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: "table", label: "📋 Tabela" },
                { key: "bars",  label: "📊 Barras" },
                { key: "radar", label: "🕸️ Radar" },
              ].map(v => (
                <button key={v.key} onClick={() => setCompareView(v.key as any)} style={{
                  padding: "6px 14px", borderRadius: 20, border: "1px solid",
                  borderColor: compareView === v.key ? "var(--navy)" : "var(--border)",
                  background: compareView === v.key ? "var(--navy)" : "white",
                  color: compareView === v.key ? "white" : "var(--muted)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{v.label}</button>
              ))}
            </div>
          </div>

          {/* VIEW: TABELA */}
          {compareView === "table" && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textAlign: "left", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Métrica</th>
                    {selectedCampaigns.map((c, i) => (
                      <th key={c.id} style={{ padding: "10px 14px", textAlign: "center", borderBottom: "1px solid var(--border)", borderLeft: `3px solid ${COMPARE_COLORS[i]}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: COMPARE_COLORS[i], maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <StatusBadge status={c.status} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map(m => {
                    const winner = getWinner(m.key);
                    return (
                      <tr key={m.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 14px", fontSize: 12, fontWeight: 600, color: "var(--body)" }}>
                          {m.icon} {m.label}
                        </td>
                        {selectedCampaigns.map((c, i) => {
                          const val = (extractMetrics(c) as any)[m.key] as number;
                          const isWinner = winner === c.id;
                          return (
                            <td key={c.id} style={{
                              padding: "12px 14px", textAlign: "center",
                              borderLeft: `3px solid ${COMPARE_COLORS[i]}20`,
                              background: isWinner ? `${COMPARE_COLORS[i]}08` : "white",
                            }}>
                              <span style={{
                                fontSize: 14, fontWeight: 700,
                                color: isWinner ? COMPARE_COLORS[i] : "var(--black)",
                              }}>
                                {val > 0 ? m.format(val) : "—"}
                              </span>
                              {isWinner && selectedCampaigns.length > 1 && val > 0 && (
                                <span style={{ marginLeft: 6, fontSize: 14 }}>🏆</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, padding: "0 4px" }}>
                🏆 = melhor valor nessa métrica (menor CPC/CPM/Gasto; maior nos demais)
              </div>
            </div>
          )}

          {/* VIEW: BARRAS */}
          {compareView === "bars" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {METRICS.filter(m => m.key !== "budget").map(m => {
                const vals = selectedCampaigns.map(c => ({ c, val: (extractMetrics(c) as any)[m.key] as number }));
                const maxV = Math.max(...vals.map(x => x.val), 0.001);
                return (
                  <div key={m.key}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                      {m.icon} {m.label}
                    </div>
                    {vals.map(({ c, val }, i) => (
                      <HorizontalBar
                        key={c.id}
                        label={c.name}
                        value={val}
                        max={maxV}
                        color={COMPARE_COLORS[i]}
                        formattedValue={val > 0 ? m.format(val) : "—"}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW: RADAR */}
          {compareView === "radar" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <RadarChart campaigns={selectedCampaigns} colors={COMPARE_COLORS} />
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                Cada eixo representa uma métrica normalizada (0–100% em relação à campanha com maior valor)
              </div>

              {/* Insights do radar */}
              {selectedCampaigns.length === 2 && (
                <div style={{ width: "100%", background: "#f8fafc", borderRadius: 12, padding: "14px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>💡 Análise comparativa</div>
                  {(() => {
                    const [a, b] = selectedCampaigns;
                    const ma = extractMetrics(a);
                    const mb = extractMetrics(b);
                    const lines = [];
                    if (ma.impressions > mb.impressions * 1.2) lines.push(`"${a.name}" tem ${((ma.impressions/mb.impressions - 1)*100).toFixed(0)}% mais impressões`);
                    else if (mb.impressions > ma.impressions * 1.2) lines.push(`"${b.name}" tem ${((mb.impressions/ma.impressions - 1)*100).toFixed(0)}% mais impressões`);
                    if (ma.ctr > mb.ctr * 1.1 && ma.ctr > 0) lines.push(`"${a.name}" tem CTR superior (${ma.ctr.toFixed(2)}% vs ${mb.ctr.toFixed(2)}%)`);
                    else if (mb.ctr > ma.ctr * 1.1 && mb.ctr > 0) lines.push(`"${b.name}" tem CTR superior (${mb.ctr.toFixed(2)}% vs ${ma.ctr.toFixed(2)}%)`);
                    if (ma.cpc > 0 && mb.cpc > 0) {
                      if (ma.cpc < mb.cpc * 0.9) lines.push(`"${a.name}" tem CPC mais eficiente (R$${ma.cpc.toFixed(2)} vs R$${mb.cpc.toFixed(2)})`);
                      else if (mb.cpc < ma.cpc * 0.9) lines.push(`"${b.name}" tem CPC mais eficiente (R$${mb.cpc.toFixed(2)} vs R$${ma.cpc.toFixed(2)})`);
                    }
                    if (lines.length === 0) lines.push("Campanhas com performance bastante similar nas métricas principais.");
                    return lines.map((l, i) => (
                      <div key={i} style={{ fontSize: 12, color: "var(--body)", lineHeight: 1.6, marginBottom: 4 }}>• {l}</div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAINEL DE DETALHES (subpágina)
// ─────────────────────────────────────────────
function CampaignDetailPanel({
  campaign, adSets, ads, loading, onBack, onRefresh,
}: {
  campaign: Campaign; adSets: AdSet[]; ads: Ad[]; loading: boolean; onBack: () => void; onRefresh: () => void;
}) {
  const [placementAdSetId,   setPlacementAdSetId]   = useState<string | null>(null);
  const [placementMode,      setPlacementMode]      = useState<PlacementMode>("auto");
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([]);
  const [savingPlacements,   setSavingPlacements]   = useState(false);

  const updatePlacementsMutation = (trpc as any).metaCampaigns?.updateAdSetPlacements?.useMutation?.({
    onSuccess: () => {
      toast.success("✅ Posicionamentos atualizados na Meta!");
      setPlacementAdSetId(null);
      setSavingPlacements(false);
    },
    onError: (e: any) => {
      toast.error("❌ " + (e?.message || "Erro ao atualizar placements"));
      setSavingPlacements(false);
    },
  }) ?? { mutate: () => {}, isPending: false };

  const ins = campaign.insights?.data?.[0];
  const maxImpressions = Math.max(...adSets.map(s => Number(s.insights?.data?.[0]?.impressions || 0)), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          ← Voltar à lista
        </button>
        <span style={{ color: "var(--border)" }}>›</span>
        <span style={{ fontSize: 13, color: "var(--black)", fontWeight: 600, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{campaign.name}</span>
      </div>

      <div style={{
        background: campaign.source === "mecpro"
          ? "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)"
          : "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
        borderRadius: 20, padding: "28px 32px", marginBottom: 24, color: "white",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -20, top: -20, fontSize: 120, opacity: 0.06, lineHeight: 1 }}>
          {campaign.source === "mecpro" ? "🤖" : "📘"}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <SourceBadge source={campaign.source} />
              <StatusBadge status={campaign.status} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", fontFamily: "var(--font-display)" }}>{campaign.name}</h1>
            <div style={{ fontSize: 13, opacity: 0.75 }}>ID: {campaign.id} · Objetivo: {OBJ_LABELS[campaign.objective] || campaign.objective}</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Criada: {D(campaign.created_time)} · Atualizada: {D(campaign.updated_time)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            {campaign.daily_budget && <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)" }}>{R(campaign.daily_budget)}</div>}
            {campaign.daily_budget && <div style={{ fontSize: 11, opacity: 0.7 }}>por dia</div>}
            {campaign.lifetime_budget && !campaign.daily_budget && (
              <>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)" }}>{R(campaign.lifetime_budget)}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>orçamento total</div>
              </>
            )}
          </div>
        </div>
      </div>

      {ins && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>📊 Performance Geral</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 28 }}>
            <MetricCard label="Impressões" value={N(ins.impressions)} icon="👁️" color="var(--navy)" />
            <MetricCard label="Cliques" value={N(ins.clicks)} icon="🖱️" color="#2563eb" />
            <MetricCard label="CTR" value={PCT(ins.ctr)} icon="📈" color="#7c3aed" sub="taxa de clique" />
            <MetricCard label="CPC médio" value={R(ins.cpc ? Number(ins.cpc) * 100 : undefined)} icon="💳" color="#0891b2" />
            <MetricCard label="CPM" value={R(ins.cpm ? Number(ins.cpm) * 100 : undefined)} icon="📣" color="#059669" sub="custo por mil" />
            <MetricCard label="Total gasto" value={R(ins.spend ? Number(ins.spend) * 100 : undefined)} icon="💰" color="#dc2626" />
          </div>
        </>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>⏳ Carregando detalhes...</div>
      ) : adSets.length > 0 ? (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>🎯 Conjuntos de Anúncios ({adSets.length})</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            {adSets.map(s => {
              const si = s.insights?.data?.[0];
              const imp = Number(si?.impressions || 0);
              return (
                <div key={s.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <StatusBadge status={s.status} />
                        {s.optimization_goal && <span style={{ fontSize: 11, color: "var(--muted)", background: "#f1f5f9", padding: "2px 8px", borderRadius: 6 }}>{s.optimization_goal}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>ID: {s.id}</div>
                      {s.daily_budget && <div style={{ fontSize: 12, color: "var(--body)", marginTop: 4 }}>💰 {R(s.daily_budget)}/dia</div>}
                    </div>
                    {si && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, minWidth: 260 }}>
                        {[
                          { l: "Impressões", v: N(si.impressions) },
                          { l: "Cliques",    v: N(si.clicks) },
                          { l: "Gasto",      v: `R$ ${Number(si.spend).toFixed(2)}` },
                          { l: "CPC",        v: `R$ ${Number(si.cpc).toFixed(2)}` },
                          { l: "CPM",        v: `R$ ${Number(si.cpm).toFixed(2)}` },
                          { l: "CTR",        v: PCT(si.ctr) },
                        ].map(m => (
                          <div key={m.l} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>{m.v}</div>
                            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <MiniBar val={imp} max={maxImpressions} color="#3b82f6" />

                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => {
                        if (placementAdSetId === s.id) {
                          setPlacementAdSetId(null);
                        } else {
                          setPlacementAdSetId(s.id);
                          const existing: string[] = [];
                          const t = s.targeting;
                          if (t?.facebook_positions) {
                            const MAP: Record<string,string> = { feed:"fb_feed", story:"fb_story", reels:"fb_reels", instream_video:"fb_instream", marketplace:"fb_marketplace", search:"fb_search", right_hand_column:"fb_right_column" };
                            t.facebook_positions.forEach((p: string) => { if (MAP[p]) existing.push(MAP[p]); });
                          }
                          if (t?.instagram_positions) {
                            const MAP: Record<string,string> = { stream:"ig_feed", story:"ig_story", reels:"ig_reels", explore:"ig_explore", shop:"ig_shop" };
                            t.instagram_positions.forEach((p: string) => { if (MAP[p]) existing.push(MAP[p]); });
                          }
                          setSelectedPlacements(existing.length > 0 ? existing : PLATFORM_PLACEMENTS["meta"] ?? []);
                          setPlacementMode(existing.length > 0 ? "manual" : "auto");
                        }
                      }}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                        border: `1.5px solid ${placementAdSetId === s.id ? "#1877f2" : "var(--border)"}`,
                        background: placementAdSetId === s.id ? "#eff6ff" : "white",
                        color: placementAdSetId === s.id ? "#1877f2" : "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      📍 {placementAdSetId === s.id ? "Fechar posicionamentos" : "Editar posicionamentos"}
                    </button>
                    {s.targeting?.publisher_platforms && (
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>
                        {s.targeting.publisher_platforms.join(", ")}
                      </span>
                    )}
                  </div>

                  {placementAdSetId === s.id && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      <PlacementSelector
                        platform="meta"
                        mode={placementMode}
                        selectedPlacements={selectedPlacements}
                        onModeChange={m => {
                          setPlacementMode(m);
                          if (m === "auto") setSelectedPlacements(PLATFORM_PLACEMENTS["meta"] ?? []);
                        }}
                        onPlacementsChange={setSelectedPlacements}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          disabled={savingPlacements}
                          onClick={() => {
                            setSavingPlacements(true);
                            (updatePlacementsMutation as any).mutate({ adSetId: s.id, placements: selectedPlacements, placementMode });
                          }}
                          style={{
                            fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 9,
                            background: savingPlacements ? "#93c5fd" : "#1877f2",
                            color: "white", border: "none", cursor: savingPlacements ? "wait" : "pointer",
                          }}
                        >
                          {savingPlacements ? "⏳ Salvando..." : "💾 Salvar posicionamentos"}
                        </button>
                        <button
                          onClick={() => setPlacementAdSetId(null)}
                          style={{ fontSize: 12, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "white", cursor: "pointer", color: "var(--muted)" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {!loading && ads.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", marginBottom: 14 }}>🎨 Anúncios ({ads.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {ads.map(ad => {
              const ai = ad.insights?.data?.[0];
              const thumb = ad.creative?.thumbnail_url || ad.creative?.image_url;
              return (
                <div key={ad.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                  {thumb ? (
                    <img src={thumb} alt={ad.name} style={{ width: "100%", height: 160, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: 100, background: "linear-gradient(135deg,#f0f4ff,#e0e7ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🖼️</div>
                  )}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <StatusBadge status={ad.status} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>{ad.name}</div>
                    {ad.creative?.title && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--body)", marginBottom: 2 }}>{ad.creative.title}</div>}
                    {ad.creative?.body && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>{ad.creative.body.slice(0, 100)}{ad.creative.body.length > 100 ? "..." : ""}</div>}
                    {ai && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                        {[{ l: "Impressões", v: N(ai.impressions) }, { l: "Cliques", v: N(ai.clicks) }, { l: "CPC", v: `R$ ${Number(ai.cpc).toFixed(2)}` }, { l: "CTR", v: PCT(ai.ctr) }].map(m => (
                          <div key={m.l}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>{m.v}</div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, fontFamily: "monospace" }}>ID: {ad.id}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && adSets.length === 0 && ads.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "white", border: "1px solid var(--border)", borderRadius: 14, color: "var(--muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Sem conjuntos ou anúncios</div>
          <div style={{ fontSize: 13 }}>Esta campanha ainda não possui ad sets ou anúncios criados.</div>
          <button onClick={onRefresh} className="btn btn-sm btn-ghost" style={{ marginTop: 16 }}>🔄 Tentar novamente</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function MetaCampaigns() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<"all" | "mecpro" | "facebook">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "created" | "spend" | "impressions">("created");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState({ total: 0, mecproCount: 0, facebookCount: 0 });
  const [loaded, setLoaded] = useState(false);

  // Sub-página detalhes
  const [view, setView] = useState<"list" | "detail" | "performance">("list");
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [detailAdSets, setDetailAdSets] = useState<AdSet[]>([]);
  const [detailAds, setDetailAds] = useState<Ad[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modais
  const [renameModal, setRenameModal] = useState<Campaign | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteModal, setDeleteModal] = useState<Campaign | null>(null);
  const [budgetModal, setBudgetModal] = useState<Campaign | null>(null);
  const [budgetValue, setBudgetValue] = useState("");
  const [compareModal, setCompareModal] = useState(false);
  const [perfModal, setPerfModal] = useState(false);

  // ─── mutations ───
  const listMutation = trpc.metaCampaigns.list.useMutation({
    onSuccess: (d) => {
      setCampaigns(d.campaigns);
      setStats({ total: d.total, mecproCount: d.mecproCount, facebookCount: d.facebookCount });
      setLoaded(true);
    },
    onError: (e) => toast.error(`❌ ${e.message}`),
  });

  const deleteMutation = trpc.metaCampaigns.delete.useMutation({
    onSuccess: () => {
      toast.success("✅ Campanha excluída com sucesso!");
      setDeleteModal(null);
      listMutation.mutate();
    },
    onError: (e) => toast.error(`❌ ${e.message}`),
  });

  const statusMutation = trpc.metaCampaigns.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      const action = vars.status === "ACTIVE" ? "ativada" : "pausada";
      toast.success(`✅ Campanha ${action}!`);
      listMutation.mutate();
    },
    onError: (e) => toast.error(`❌ ${e.message}`),
  });

  const renameMutation = trpc.metaCampaigns.rename.useMutation({
    onSuccess: () => {
      toast.success("✅ Campanha renomeada!");
      setRenameModal(null);
      listMutation.mutate();
    },
    onError: (e) => toast.error(`❌ ${e.message}`),
  });

  const detailsMutation = trpc.metaCampaigns.details.useMutation({
    onSuccess: (d) => {
      setDetailAdSets(d.adSets);
      setDetailAds(d.ads);
      setDetailLoading(false);
    },
    onError: (e) => { toast.error(`❌ ${e.message}`); setDetailLoading(false); },
  });

  const budgetMutation = trpc.metaCampaigns.updateBudget.useMutation({
    onSuccess: () => {
      toast.success("✅ Orçamento atualizado!");
      setBudgetModal(null);
      listMutation.mutate();
    },
    onError: (e) => toast.error(`❌ ${e.message}`),
  });

  const openDetail = (c: Campaign) => {
    setSelected(c);
    setDetailAdSets([]);
    setDetailAds([]);
    setDetailLoading(true);
    setView("detail");
    detailsMutation.mutate({ campaignId: c.id });
  };

  const filtered = useMemo(() => {
    let list = campaigns;
    if (filter !== "all") list = list.filter(c => c.source === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.id.includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortBy === "name")        return a.name.localeCompare(b.name);
      if (sortBy === "created")     return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
      if (sortBy === "spend")       return Number(b.insights?.data?.[0]?.spend || 0) - Number(a.insights?.data?.[0]?.spend || 0);
      if (sortBy === "impressions") return Number(b.insights?.data?.[0]?.impressions || 0) - Number(a.insights?.data?.[0]?.impressions || 0);
      return 0;
    });
  }, [campaigns, filter, search, sortBy]);

  const totalSpend       = campaigns.reduce((acc, c) => acc + Number(c.insights?.data?.[0]?.spend || 0), 0);
  const totalImpressions = campaigns.reduce((acc, c) => acc + Number(c.insights?.data?.[0]?.impressions || 0), 0);
  const totalClicks      = campaigns.reduce((acc, c) => acc + Number(c.insights?.data?.[0]?.clicks || 0), 0);

  // ─────────────────────────────────────────────
  // RENDER — Detalhe
  // ─────────────────────────────────────────────
  if (view === "detail" && selected) {
    return (
      <Layout>
        <CampaignDetailPanel
          campaign={selected}
          adSets={detailAdSets}
          ads={detailAds}
          loading={detailLoading}
          onBack={() => setView("list")}
          onRefresh={() => { setDetailLoading(true); detailsMutation.mutate({ campaignId: selected.id }); }}
        />
      </Layout>
    );
  }

  // ─────────────────────────────────────────────
  // RENDER — Painel de Performance (subpágina)
  // ─────────────────────────────────────────────
  if (view === "performance") {
    return (
      <Layout>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13 }}>
              ← Voltar à lista
            </button>
            <span style={{ color: "var(--border)" }}>›</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>📊 Análise de Performance</span>
          </div>
          <PerformancePanel campaigns={campaigns} />
        </div>
      </Layout>
    );
  }

  // ─────────────────────────────────────────────
  // RENDER — Lista
  // ─────────────────────────────────────────────
  return (
    <Layout>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .mc-row:hover { background: #f8fafc !important; }
        .mc-row:hover .mc-name { color: var(--navy) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/dashboard")} style={{ paddingLeft: 0, marginBottom: 12 }}>
          ← Dashboard
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 900, color: "var(--black)", margin: "0 0 6px" }}>
              📘 Campanhas Meta Ads
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
              Gerencie, analise e edite suas campanhas — criadas pelo MECPro AI ou no Facebook
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* Botões de análise — só aparecem quando carregado */}
            {loaded && campaigns.length > 0 && (
              <>
                <button
                  onClick={() => setView("performance")}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "9px 18px", borderRadius: 12, border: "1.5px solid #7c3aed",
                    background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
                    color: "#7c3aed", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  📊 Análise de Performance
                </button>
                <button
                  onClick={() => setCompareModal(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "9px 18px", borderRadius: 12, border: "1.5px solid #0891b2",
                    background: "linear-gradient(135deg,#ecfeff,#cffafe)",
                    color: "#0891b2", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  ⚖️ Comparar campanhas
                </button>
              </>
            )}
            <button className="btn btn-md btn-primary" onClick={() => listMutation.mutate()} disabled={listMutation.isPending}
              style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              {listMutation.isPending ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Carregando...</> : "🔄 Carregar campanhas"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats cards ── */}
      {loaded && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total", value: String(stats.total), icon: "📊", bg: "var(--navy)", color: "white", sub: "campanhas" },
            { label: "MECPro AI", value: String(stats.mecproCount), icon: "🤖", bg: "#f0fdf4", color: "#15803d", sub: "criadas aqui" },
            { label: "Facebook", value: String(stats.facebookCount), icon: "📘", bg: "#eff6ff", color: "#1d4ed8", sub: "criadas lá" },
            { label: "Total gasto", value: `R$\u00a0${totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: "💰", bg: "#fff7ed", color: "#c2410c", sub: "no período" },
            { label: "Impressões", value: N(totalImpressions), icon: "👁️", bg: "#f5f3ff", color: "#7c3aed", sub: "total" },
            { label: "Cliques", value: N(totalClicks), icon: "🖱️", bg: "#ecfdf5", color: "#059669", sub: "total" },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: 16, padding: "18px 20px",
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: s.bg === "var(--navy)" ? "0 4px 20px rgba(15,23,42,0.2)" : "0 2px 8px rgba(0,0,0,0.04)",
            }}>
              <span style={{ fontSize: 26 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "var(--font-display)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: s.color, opacity: 0.75, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.4px" }}>{s.label}</div>
                <div style={{ fontSize: 10, color: s.color, opacity: 0.55 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtros + busca + sort ── */}
      {loaded && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "all",      label: `Todas (${stats.total})` },
              { key: "mecpro",   label: `🤖 MECPro (${stats.mecproCount})` },
              { key: "facebook", label: `📘 Facebook (${stats.facebookCount})` },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key as any)} style={{
                padding: "7px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filter === f.key ? "var(--navy)" : "var(--border)",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: filter === f.key ? "var(--navy)" : "white",
                color: filter === f.key ? "white" : "var(--muted)",
                transition: "all 0.15s",
              }}>{f.label}</button>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--muted)" }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou ID..."
              style={{
                width: "100%", paddingLeft: 36, paddingRight: 12, height: 36,
                border: "1px solid var(--border)", borderRadius: 20, fontSize: 13,
                background: "white", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{
            height: 36, border: "1px solid var(--border)", borderRadius: 20,
            fontSize: 12, padding: "0 14px", background: "white", cursor: "pointer", outline: "none",
          }}>
            <option value="created">📅 Mais recentes</option>
            <option value="name">🔤 Nome A→Z</option>
            <option value="spend">💰 Maior gasto</option>
            <option value="impressions">👁️ Maior alcance</option>
          </select>

          {filtered.length > 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loaded && !listMutation.isPending && (
        <div style={{ background: "white", border: "2px dashed var(--border)", borderRadius: 20, padding: "70px 32px", textAlign: "center", animation: "fadeIn 0.3s ease" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📘</div>
          <p style={{ fontSize: 17, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Suas campanhas do Meta Ads</p>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28, maxWidth: 400, margin: "0 auto 28px" }}>
            Visualize, gerencie e analise todas as campanhas da sua conta — criadas pelo MECPro AI ou diretamente no Facebook.
          </p>
          <button className="btn btn-md btn-primary" onClick={() => listMutation.mutate()} style={{ gap: 8 }}>
            🔄 Carregar campanhas
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {listMutation.isPending && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 20, padding: "70px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12, animation: "fadeIn 0.3s ease" }}>⏳</div>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Buscando campanhas na API do Meta...</p>
        </div>
      )}

      {/* ── Tabela ── */}
      {loaded && filtered.length > 0 && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--border)" }}>
                {["Campanha", "Origem", "Objetivo", "Status", "Orçamento", "Impressões", "Cliques", "CTR", "Gasto", "Criada em", "Ações"].map(h => (
                  <th key={h} style={{ padding: "13px 16px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.6px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const m = c.insights?.data?.[0];
                return (
                  <tr key={c.id} className="mc-row" style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" }}>
                    <td style={{ padding: "14px 16px", maxWidth: 220 }}>
                      <div className="mc-name" style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200, transition: "color 0.15s" }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{c.id}</div>
                    </td>
                    <td style={{ padding: "14px 16px" }}><SourceBadge source={c.source} /></td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--body)", whiteSpace: "nowrap" }}>{OBJ_LABELS[c.objective] || c.objective}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <StatusBadge status={c.status} />
                        {(statusMutation.isPending && statusMutation.variables?.campaignId === c.id) && (
                          <span style={{ fontSize: 10, color: "var(--muted)" }}>...</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--body)", whiteSpace: "nowrap" }}>
                      {R(c.daily_budget || c.lifetime_budget)}
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{c.daily_budget ? "/ dia" : c.lifetime_budget ? "total" : ""}</div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, fontWeight: 600, color: "var(--body)" }}>
                      {m ? N(m.impressions) : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, fontWeight: 600, color: "var(--body)" }}>
                      {m ? N(m.clicks) : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, fontWeight: 600, color: "var(--body)" }}>
                      {m ? PCT(m.ctr) : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, fontWeight: 700, color: m?.spend && Number(m.spend) > 0 ? "#dc2626" : "var(--muted)" }}>
                      {m ? `R$ ${Number(m.spend).toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{D(c.created_time)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <ActionDropdown
                        campaign={c}
                        onView={() => openDetail(c)}
                        onRename={() => { setRenameModal(c); setRenameValue(c.name); }}
                        onDelete={() => setDeleteModal(c)}
                        onEditBudget={() => { setBudgetModal(c); setBudgetValue(String(Number(c.daily_budget || 0) / 100)); }}
                        onToggleStatus={() => {
                          const next = c.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
                          statusMutation.mutate({ campaignId: c.id, status: next });
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── No results ── */}
      {loaded && filtered.length === 0 && !listMutation.isPending && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "50px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 4 }}>Nenhuma campanha encontrada</p>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Tente outro filtro ou termo de busca.</p>
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 16 }} onClick={() => { setSearch(""); setFilter("all"); }}>Limpar filtros</button>
        </div>
      )}

      {/* ─────────── MODAIS ─────────── */}

      {/* Rename */}
      <Modal open={!!renameModal} onClose={() => setRenameModal(null)} title="✏️ Renomear Campanha">
        {renameModal && (
          <div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Renomeando: <strong>{renameModal.name}</strong>
            </p>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Novo nome</label>
            <input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              maxLength={100}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              autoFocus
            />
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, textAlign: "right" }}>{renameValue.length}/100</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setRenameModal(null)}>Cancelar</button>
              <button
                className="btn btn-sm btn-primary"
                disabled={renameValue.trim().length < 2 || renameMutation.isPending}
                onClick={() => renameMutation.mutate({ campaignId: renameModal.id, name: renameValue.trim() })}
              >
                {renameMutation.isPending ? "Salvando..." : "✅ Salvar nome"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="🗑️ Excluir Campanha">
        {deleteModal && (
          <div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#991b1b", margin: "0 0 4px" }}>⚠️ Ação irreversível</p>
              <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>A campanha será excluída permanentemente no Meta Ads.</p>
            </div>
            <p style={{ fontSize: 14, color: "var(--body)", marginBottom: 6 }}>Você está prestes a excluir:</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", marginBottom: 20, padding: "12px 16px", background: "#f8fafc", borderRadius: 10 }}>
              {deleteModal.name}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setDeleteModal(null)}>Cancelar</button>
              <button
                className="btn btn-sm"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ campaignId: deleteModal.id })}
                style={{ background: "#dc2626", color: "white", borderRadius: 8, padding: "8px 18px", border: "none", fontWeight: 700, cursor: "pointer" }}
              >
                {deleteMutation.isPending ? "Excluindo..." : "🗑️ Excluir definitivamente"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Budget */}
      <Modal open={!!budgetModal} onClose={() => setBudgetModal(null)} title="💰 Editar Orçamento Diário">
        {budgetModal && (
          <div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
              Campanha: <strong>{budgetModal.name}</strong>
            </p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
              Orçamento atual: <strong>{R(budgetModal.daily_budget)}</strong> / dia
            </p>
            <p style={{ fontSize: 12, color: "#854d0e", background: "#fef9c3", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>
              ⚠️ O orçamento é editado no primeiro Ad Set da campanha.
            </p>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Novo orçamento diário (R$)</label>
            <input
              type="number"
              value={budgetValue}
              onChange={e => setBudgetValue(e.target.value)}
              min={1}
              style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setBudgetModal(null)}>Cancelar</button>
              <button
                className="btn btn-sm btn-primary"
                disabled={!budgetValue || Number(budgetValue) < 1 || budgetMutation.isPending}
                onClick={async () => {
                  setDetailLoading(true);
                  try {
                    const res = await detailsMutation.mutateAsync({ campaignId: budgetModal.id });
                    const adSetId = res.adSets?.[0]?.id;
                    setDetailLoading(false);
                    if (!adSetId) { toast.error("Nenhum Ad Set encontrado."); setBudgetModal(null); return; }
                    budgetMutation.mutate({ adSetId, dailyBudget: Number(budgetValue) });
                  } catch { setDetailLoading(false); }
                }}
              >
                {budgetMutation.isPending || detailLoading ? "Salvando..." : "💾 Salvar orçamento"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Comparador ── */}
      <Modal open={compareModal} onClose={() => setCompareModal(false)} title="⚖️ Comparar Campanhas" wide>
        <CampaignComparator campaigns={campaigns} onClose={() => setCompareModal(false)} />
      </Modal>

    </Layout>
  );
}
