import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
type TabMain = "dashboard" | "campaigns" | "ranking" | "patterns" | "learning" | "ml" | "compare";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS VISUAIS
// ─────────────────────────────────────────────────────────────────────────────
const SCORE_COLOR = (s: number) =>
  s >= 80 ? "#16a34a" : s >= 60 ? "#0891b2" : s >= 40 ? "#d97706" : "#dc2626";
const SCORE_LABEL = (s: number) =>
  s >= 80 ? "Excelente" : s >= 60 ? "Bom" : s >= 40 ? "Regular" : "Baixo";

const PLATFORM_ICONS: Record<string, string> = {
  meta: "📘", google: "🔍", tiktok: "🎵", default: "📡",
};
const NICHE_ICONS: Record<string, string> = {
  imobiliario: "🏠", juridico: "⚖️", saude: "💊", educacao: "📚",
  estetica: "💄", varejo: "🛍️", automotivo: "🚗", servicos: "🔧",
  infoprodutos: "💻", lancamentos: "◈", geral: "🌐",
};

const N   = (v?: number) => v == null ? "—" : Number(v).toLocaleString("pt-BR");
const R   = (v?: number) => v == null ? "—" : `R$ ${Number(v).toFixed(2)}`;
const PCT = (v?: number) => v == null ? "—" : `${Number(v).toFixed(2)}%`;

const selectStyle: React.CSSProperties = {
  height: 36, border: "1px solid #e2e8f0", borderRadius: 20,
  fontSize: 12, padding: "0 14px", background: "white", cursor: "pointer", outline: "none",
};
const actionBtn = (color: string): React.CSSProperties => ({
  fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
  background: `${color}18`, color, border: `1px solid ${color}30`, cursor: "pointer",
});
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 16px", borderRadius: 20, border: "1px solid #e2e8f0",
  background: disabled ? "#f8fafc" : "white", color: disabled ? "#94a3b8" : "#334155",
  fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600,
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES BASE
// ─────────────────────────────────────────────────────────────────────────────

function ScoreGauge({ score, size = 56 }: { score: number; size?: number }) {
  const r     = size * 0.38;
  const circ  = 2 * Math.PI * r;
  const dash  = (Math.min(100, Math.max(0, score)) / 100) * circ;
  const color = SCORE_COLOR(score);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={size * 0.1} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size * 0.1}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 800, color, lineHeight: 1 }}>{Math.round(score)}</span>
        {size >= 70 && <span style={{ fontSize: size * 0.12, color: "#94a3b8" }}>/ 100</span>}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color, bg }: {
  icon: string; label: string; value: string; sub?: string; color: string; bg: string;
}) {
  return (
    <div style={{ background: bg, borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
      <span style={{ fontSize: 28, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color, opacity: 0.7, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color, opacity: 0.55, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max = 10, color }: { label: string; value: number; max?: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{value.toFixed(1)}/{max}</span>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 4, height: 6 }}>
        <div style={{ width: `${(value / max) * 100}%`, height: "100%", borderRadius: 4, background: color, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function Loader({ text = "Carregando..." }: { text?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
      <p style={{ fontSize: 14 }}>{text}</p>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "50px 20px", color: "#94a3b8" }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 15, fontWeight: 700, color: "#334155", marginBottom: 4 }}>{title}</p>
      {sub && <p style={{ fontSize: 13 }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function TabDashboard() {
  const stats = (trpc as any).intelligence?.getDashboardStats?.useQuery?.();
  const s = stats?.data;

  if (stats?.isLoading) return <Loader />;

  const mlColor = s?.mlReadiness === "ready" ? "#16a34a" : s?.mlReadiness === "preparing" ? "#d97706" : "#64748b";
  const mlLabel = s?.mlReadiness === "ready" ? "◎ Pronto para treino" : s?.mlReadiness === "preparing" ? "⚙️ Coletando dados" : "📊 Iniciando coleta";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 14, marginBottom: 32 }}>
        <KpiCard icon="👥" label="Usuários"         value={N(s?.users)                      || "0"} color="#1d4ed8" bg="#eff6ff" />
        <KpiCard icon="◫" label="Projetos"          value={N(s?.projects)                   || "0"} color="#7c3aed" bg="#f5f3ff" />
        <KpiCard icon="🎯" label="Campanhas"         value={N(s?.campaigns)                  || "0"} color="#0f172a" bg="#f8fafc" />
        <KpiCard icon="⚡" label="Com Score"         value={N(s?.scoreStats?.totalScored)    || "0"} sub="calculados"             color="#0891b2" bg="#ecfeff" />
        <KpiCard icon="◆" label="Vencedoras"        value={N(s?.scoreStats?.winners)        || "0"} sub="score ≥ 70"             color="#16a34a" bg="#f0fdf4" />
        <KpiCard icon="🧠" label="Padrões"           value={N(s?.patternStats?.total)        || "0"} sub={`${s?.patternStats?.approved || 0} aprovados`} color="#7c3aed" bg="#fdf4ff" />
        <KpiCard icon="📚" label="Base aprendizado"  value={N(s?.learningStats?.total)       || "0"} sub={`${s?.learningStats?.niches || 0} nichos`}     color="#d97706" bg="#fffbeb" />
        <KpiCard icon="🔬" label="Dataset ML"        value={N(s?.mlStats?.totalSamples)      || "0"} sub="amostras"               color={mlColor}  bg={s?.mlReadiness === "ready" ? "#f0fdf4" : "#fffbeb"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Score médio */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>📊 Score Médio Global</div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <ScoreGauge score={Math.round(s?.scoreStats?.avgScore || 0)} size={90} />
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: SCORE_COLOR(s?.scoreStats?.avgScore || 0) }}>
                {(s?.scoreStats?.avgScore || 0).toFixed(1)}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Score médio das campanhas analisadas</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Melhor score: <strong style={{ color: SCORE_COLOR(s?.scoreStats?.topScore || 0) }}>{s?.scoreStats?.topScore || 0}/100</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Status ML */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>🤖 Status do Motor de ML</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Camada 1 — Score ponderado",       ready: true,                                           detail: "Ativo" },
              { label: "Camada 2 — Aprendizado estatístico", ready: (s?.mlStats?.totalSamples || 0) >= 10,        detail: `${s?.mlStats?.totalSamples || 0} amostras` },
              { label: "Camada 3 — Dataset ML",             ready: (s?.mlStats?.totalSamples || 0) >= 30,        detail: mlLabel },
            ].map(layer => (
              <div key={layer.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: layer.ready ? "#22c55e" : "#94a3b8" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{layer.label}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{layer.detail}</div>
                </div>
                <span style={{ fontSize: 12, color: layer.ready ? "#16a34a" : "#94a3b8" }}>{layer.ready ? "◎" : "⏳"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fluxo de inteligência */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 18, padding: 24, color: "white" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>🔄 Fluxo de Inteligência MECProAI</div>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
          {[
            { icon: "🎯", label: "Campanhas criadas" },
            { icon: "⚡", label: "Score calculado" },
            { icon: "◆", label: "Vencedoras identificadas" },
            { icon: "🔍", label: "Parâmetros extraídos" },
            { icon: "🧠", label: "Learning base atualizada" },
            { icon: "◇", label: "Futuras campanhas melhoram" },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ textAlign: "center", padding: "10px 12px" }}>
                <div style={{ fontSize: 22 }}>{step.icon}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 4, maxWidth: 70 }}>{step.label}</div>
              </div>
              {i < arr.length - 1 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>→</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA CAMPANHAS
// ─────────────────────────────────────────────────────────────────────────────
function TabCampaigns({ onScore, onExtract }: { onScore: (id: number) => void; onExtract: (id: number) => void }) {
  const [page, setPage]         = useState(1);
  const [platform, setPlatform] = useState("");
  const [niche, setNiche]       = useState("");
  const [sortBy, setSortBy]     = useState<"created" | "score">("created");

  const query = (trpc as any).intelligence?.listAllCampaigns?.useQuery?.({
    page, limit: 30,
    platform:  platform || undefined,
    niche:     niche    || undefined,
    sortBy,
  });
  const data = query?.data;

  if (query?.isLoading) return <Loader />;

  return (
    <div>
      <SectionHeader
        title="Todas as campanhas da plataforma"
        sub={`${data?.total || 0} campanhas encontradas`}
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select value={platform} onChange={e => setPlatform(e.target.value)} style={selectStyle}>
          <option value="">Todas as plataformas</option>
          {["meta","google","tiktok"].map(p => <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>)}
        </select>
        <select value={niche} onChange={e => setNiche(e.target.value)} style={selectStyle}>
          <option value="">Todos os nichos</option>
          {Object.keys(NICHE_ICONS).map(n => <option key={n} value={n}>{NICHE_ICONS[n]} {n}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={selectStyle}>
          <option value="created">📅 Mais recentes</option>
          <option value="score">⚡ Maior score</option>
        </select>
      </div>

      {!data?.campaigns?.length ? (
        <EmptyState icon="📭" title="Nenhuma campanha encontrada" sub="Ajuste os filtros ou aguarde a criação de campanhas" />
      ) : (
        <>
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Campanha", "Usuário", "Plataforma", "Objetivo", "Nicho", "Score", "Ações"].map(h => (
                    <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
                    onMouseLeave={e => (e.currentTarget.style.background = "white")}
                  >
                    <td style={{ padding: "13px 14px" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>#{c.id} · {c.projectName}</div>
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <div style={{ fontWeight: 600, color: "#334155" }}>{c.userName}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{c.userPlan}</div>
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8" }}>
                        {PLATFORM_ICONS[c.platform] || "📡"} {c.platform || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 14px", color: "#475569", fontSize: 11 }}>{c.objective || "—"}</td>
                    <td style={{ padding: "13px 14px", fontSize: 11 }}>{NICHE_ICONS[c.niche] || "🌐"} {c.niche}</td>
                    <td style={{ padding: "13px 14px" }}>
                      {c.scoreTotal > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ScoreGauge score={Math.round(c.scoreTotal)} size={36} />
                          <span style={{ fontSize: 10, color: SCORE_COLOR(c.scoreTotal), fontWeight: 700 }}>
                            {SCORE_LABEL(c.scoreTotal)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>Não calculado</span>
                      )}
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => onScore(c.id)} style={actionBtn("#3b82f6")}>⚡ Score</button>
                        {c.scoreTotal >= 50 && (
                          <button onClick={() => onExtract(c.id)} style={actionBtn("#7c3aed")}>🔍 Extrair</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pageBtn(page <= 1)}>← Anterior</button>
            <span style={{ fontSize: 12, color: "#64748b", alignSelf: "center" }}>Página {page} de {data?.totalPages || 1}</span>
            <button disabled={page >= (data?.totalPages || 1)} onClick={() => setPage(p => p + 1)} style={pageBtn(page >= (data?.totalPages || 1))}>Próxima →</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA RANKING
// ─────────────────────────────────────────────────────────────────────────────
function TabRanking() {
  const [platform, setPlatform] = useState("");
  const [niche, setNiche]       = useState("");

  const query   = (trpc as any).intelligence?.getGlobalRanking?.useQuery?.({ limit: 25, platform: platform || undefined, niche: niche || undefined });
  const ranking = query?.data?.ranking ?? [];

  if (query?.isLoading) return <Loader />;

  return (
    <div>
      <SectionHeader title="🏆 Ranking Global de Campanhas" sub="Campanhas ordenadas por score do motor de inteligência" />

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <select value={platform} onChange={e => setPlatform(e.target.value)} style={selectStyle}>
          <option value="">Todas as plataformas</option>
          {["meta","google","tiktok"].map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={niche} onChange={e => setNiche(e.target.value)} style={selectStyle}>
          <option value="">Todos os nichos</option>
          {Object.keys(NICHE_ICONS).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {ranking.length === 0 ? (
        <EmptyState icon="📊" title="Nenhum score encontrado" sub="Calcule o score das campanhas na aba Campanhas primeiro" />
      ) : (
        <>
          {/* Top 3 */}
          {ranking.length >= 3 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 14, marginBottom: 24 }}>
              {[ranking[1], ranking[0], ranking[2]].map((c: any, idx: number) => {
                const pos    = idx === 1 ? 1 : idx === 0 ? 2 : 3;
                const medals = ["🥈","🥇","🥉"];
                return (
                  <div key={c.campaign_id} style={{
                    background: pos === 1 ? "linear-gradient(135deg,#fef9c3,#fde68a)" : "white",
                    border: `2px solid ${pos === 1 ? "#f59e0b" : "#e2e8f0"}`,
                    borderRadius: 18, padding: 20, textAlign: "center",
                    transform: pos === 1 ? "translateY(-8px)" : "none",
                    boxShadow: pos === 1 ? "0 8px 30px rgba(245,158,11,0.2)" : "none",
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{medals[idx]}</div>
                    <ScoreGauge score={Math.round(c.score_total || 0)} size={pos === 1 ? 80 : 60} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginTop: 10, lineHeight: 1.3 }}>{c.campaign_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      {PLATFORM_ICONS[c.platform] || "📡"} {c.platform} · {c.objective}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lista completa */}
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
            {ranking.map((c: any, i: number) => (
              <div key={c.campaign_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < ranking.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0,
                  background: i === 0 ? "#fef9c3" : i === 1 ? "#f1f5f9" : i === 2 ? "#fff7ed" : "#f8fafc",
                  color: i === 0 ? "#854d0e" : i === 1 ? "#475569" : i === 2 ? "#c2410c" : "#94a3b8",
                }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </div>
                <ScoreGauge score={Math.round(c.score_total || 0)} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.campaign_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {PLATFORM_ICONS[c.platform] || "📡"} {c.platform} · {c.objective} · {NICHE_ICONS[c.niche] || "🌐"} {c.niche}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, textAlign: "center", fontSize: 11, minWidth: 200 }}>
                  {[
                    { l: "CTR",     v: c.score_ctr },
                    { l: "CPC",     v: c.score_cpc },
                    { l: "ROAS",    v: c.score_roas },
                    { l: "Criativo", v: c.score_creative },
                  ].map(m => (
                    <div key={m.l}>
                      <div style={{ fontWeight: 700, color: "#334155" }}>{(m.v || 0).toFixed(1)}/10</div>
                      <div style={{ color: "#94a3b8", fontSize: 9, textTransform: "uppercase" }}>{m.l}</div>
                    </div>
                  ))}
                </div>
                {c.is_winner === 1 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#fef9c3", color: "#854d0e" }}>◆</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA PADRÕES VENCEDORES
// ─────────────────────────────────────────────────────────────────────────────
function TabPatterns({ onApprove }: { onApprove: (id: number) => void }) {
  const [platform, setPlatform] = useState("");
  const [niche, setNiche]       = useState("");
  const [approvedOnly, setApprovedOnly] = useState(false);

  const query    = (trpc as any).intelligence?.getWinnerPatterns?.useQuery?.({ platform: platform || undefined, niche: niche || undefined, approvedOnly, limit: 30 });
  const patterns = query?.data?.patterns ?? [];

  if (query?.isLoading) return <Loader />;

  return (
    <div>
      <SectionHeader title="🔍 Padrões Vencedores Extraídos" sub={`${patterns.length} padrões identificados — aprovados são usados pelo MECProAI em novas campanhas`} />

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select value={platform} onChange={e => setPlatform(e.target.value)} style={selectStyle}>
          <option value="">Todas as plataformas</option>
          {["meta","google","tiktok"].map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={niche} onChange={e => setNiche(e.target.value)} style={selectStyle}>
          <option value="">Todos os nichos</option>
          {Object.keys(NICHE_ICONS).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={approvedOnly} onChange={e => setApprovedOnly(e.target.checked)} />
          Apenas aprovados
        </label>
      </div>

      {patterns.length === 0 ? (
        <EmptyState icon="🔍" title="Nenhum padrão encontrado" sub="Extraia parâmetros de campanhas com score ≥ 50 na aba Campanhas" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))", gap: 16 }}>
          {patterns.map((p: any) => (
            <div key={p.id} style={{ background: "white", border: `2px solid ${p.approved_by_admin ? "#86efac" : "#e2e8f0"}`, borderRadius: 18, padding: 22, position: "relative" }}>
              {/* Badge status */}
              <div style={{
                position: "absolute", top: 14, right: 14, fontSize: 10, fontWeight: 800,
                padding: "3px 10px", borderRadius: 20,
                background: p.approved_by_admin ? "#dcfce7" : "#fef9c3",
                color: p.approved_by_admin ? "#15803d" : "#854d0e",
              }}>
                {p.approved_by_admin ? "◎ Aprovado" : "⏳ Pendente"}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <ScoreGauge score={Math.round(p.pattern_score || 0)} size={50} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                    {PLATFORM_ICONS[p.platform] || "📡"} {p.platform} · {p.objective}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {NICHE_ICONS[p.niche] || "🌐"} {p.niche} · #{p.campaign_id}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                  { l: "Formato",       v: p.ad_format },
                  { l: "CTA",           v: p.cta_type },
                  { l: "Estrutura copy", v: p.copy_structure },
                  { l: "Orçamento",     v: p.budget_range },
                  { l: "Duração",       v: p.duration_range },
                  { l: "Audiência",     v: p.audience_size },
                  { l: "Faixa etária",  v: `${p.age_min || "?"}–${p.age_max || "?"}` },
                  { l: "Variações",     v: p.num_variations },
                ].map(m => (
                  <div key={m.l} style={{ background: "#f8fafc", borderRadius: 8, padding: "6px 10px" }}>
                    <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.l}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{m.v || "—"}</div>
                  </div>
                ))}
              </div>

              {/* Gatilhos */}
              {Array.isArray(p.trigger_types) && p.trigger_types.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Gatilhos</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {p.trigger_types.map((t: string) => (
                      <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#fdf4ff", color: "#7c3aed", fontWeight: 700 }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Por que venceu */}
              {p.why_it_won && (
                <div style={{ background: "#f0f9ff", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#0891b2", fontWeight: 700, marginBottom: 4 }}>💡 Por que venceu</div>
                  <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.5 }}>{p.why_it_won}</div>
                </div>
              )}

              {/* Recomendações */}
              {Array.isArray(p.recommendations) && p.recommendations.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Recomendações</div>
                  {p.recommendations.slice(0, 3).map((r: string, i: number) => (
                    <div key={i} style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>• {r}</div>
                  ))}
                </div>
              )}

              {!p.approved_by_admin && (
                <button onClick={() => onApprove(p.id)} style={{
                  width: "100%", padding: "10px", borderRadius: 10,
                  background: "linear-gradient(135deg,#16a34a,#15803d)",
                  color: "white", fontWeight: 700, fontSize: 12, border: "none", cursor: "pointer",
                }}>
                  ◎ Aprovar e ativar padrão
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA BASE DE APRENDIZADO
// ─────────────────────────────────────────────────────────────────────────────
function TabLearning() {
  const query   = (trpc as any).intelligence?.getLearningBase?.useQuery?.({});
  const entries = query?.data?.entries ?? [];

  if (query?.isLoading) return <Loader />;

  return (
    <div>
      <SectionHeader title="🧠 Base de Aprendizado por Segmento" sub="Inteligência acumulada por plataforma + objetivo + nicho. Usada para sugerir parâmetros em novas campanhas." />

      {entries.length === 0 ? (
        <EmptyState icon="🧠" title="Base de aprendizado vazia" sub="Calcule scores e extraia padrões para popular a base" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {entries.map((e: any) => (
            <div key={e.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: "#eff6ff" }}>
                    {PLATFORM_ICONS[e.platform] || "📡"}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                      {e.platform} · {e.objective} · {NICHE_ICONS[e.niche] || "🌐"} {e.niche}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {e.sample_count} amostra{e.sample_count !== 1 ? "s" : ""} · v{e.version}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <ScoreGauge score={Math.round(e.avg_score || 0)} size={56} />
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Score médio</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: SCORE_COLOR(e.best_score) }}>{(e.best_score || 0).toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>Melhor score</div>
                  </div>
                </div>
              </div>

              {/* Métricas médias */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px,1fr))", gap: 10, marginBottom: 18 }}>
                {[
                  { l: "CTR médio",  v: PCT(e.avg_ctr),                      color: "#3b82f6" },
                  { l: "CPC médio",  v: R(e.avg_cpc),                        color: "#ef4444" },
                  { l: "CPM médio",  v: R(e.avg_cpm),                        color: "#f59e0b" },
                  { l: "ROAS médio", v: `${(e.avg_roas || 0).toFixed(1)}x`,  color: "#10b981" },
                ].map(m => (
                  <div key={m.l} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: m.color }}>{m.v}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{m.l}</div>
                  </div>
                ))}
              </div>

              {/* Top parâmetros */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 14 }}>
                {[
                  { title: "Top formatos",        data: e.topAdFormats },
                  { title: "Top CTAs",            data: e.topCtaTypes },
                  { title: "Top posicionamentos", data: e.topPlacements },
                  { title: "Top gatilhos",        data: e.topTriggers },
                ].map(section => (
                  <div key={section.title}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>{section.title}</div>
                    {Object.entries(section.data || {}).slice(0, 3).map(([k, v]) => {
                      const maxV = Math.max(...Object.values(section.data || {}) as number[]);
                      return (
                        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#334155" }}>{k}</div>
                            <div style={{ background: "#f1f5f9", borderRadius: 3, height: 4, marginTop: 3 }}>
                              <div style={{ width: `${((v as number) / maxV) * 100}%`, height: "100%", borderRadius: 3, background: "#3b82f6" }} />
                            </div>
                          </div>
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>{v as number}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Template recomendado */}
              {e.recommendedTemplate && (
                <div style={{ marginTop: 18, background: "linear-gradient(135deg,#f0f9ff,#e0f2fe)", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0891b2", marginBottom: 8 }}>
                    ✨ Template recomendado para este segmento
                    <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.8 }}>(confiança: {e.recommendedTemplate?.confidenceLabel || "baixa"})</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      `Formato: ${e.recommendedTemplate?.recommendedFormat}`,
                      `CTA: ${e.recommendedTemplate?.recommendedCta}`,
                      `Gatilho: ${e.recommendedTemplate?.recommendedTrigger}`,
                      `Orçamento: ${e.recommendedTemplate?.recommendedBudgetRange}`,
                    ].map(tag => (
                      <span key={tag} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "white", color: "#0891b2", fontWeight: 600, border: "1px solid #bae6fd" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA DATASET ML
// ─────────────────────────────────────────────────────────────────────────────
function TabML() {
  const query = (trpc as any).intelligence?.exportMLDataset?.useQuery?.({ splitGroup: "all" });
  const data  = query?.data;

  const trainCount  = data?.dataset?.filter((d: any) => d.split_group === "train").length || 0;
  const testCount   = data?.dataset?.filter((d: any) => d.split_group === "test").length  || 0;
  const winnerCount = data?.dataset?.filter((d: any) => d.label_is_winner === 1).length  || 0;
  const total       = data?.count || 0;
  const mlReadiness = total >= 100 ? "ready" : total >= 30 ? "preparing" : "collecting";
  const mlColor     = mlReadiness === "ready" ? "#22c55e" : "#f59e0b";

  if (query?.isLoading) return <Loader />;

  return (
    <div>
      <SectionHeader title="🔬 Dataset para Machine Learning" sub="Features normalizadas prontas para treino de modelos preditivos" />

      {/* Banner status */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)", borderRadius: 18, padding: 24, color: "white", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              {mlReadiness === "ready" ? "◎ Dataset pronto para treino" : mlReadiness === "preparing" ? "⚙️ Coletando amostras" : "📊 Iniciando coleta"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              {mlReadiness === "ready"
                ? "Você tem amostras suficientes para treinar modelos básicos."
                : `Precisa de ${100 - total} amostras adicionais.`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {[{ l: "Total", v: total }, { l: "Treino", v: trainCount }, { l: "Teste", v: testCount }, { l: "Vencedoras", v: winnerCount }].map(s => (
              <div key={s.l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{s.v}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
            <span>0</span><span>30</span><span>100 (pronto)</span><span>500 (robusto)</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 6, height: 8 }}>
            <div style={{ width: `${Math.min(100, (total / 500) * 100)}%`, height: "100%", borderRadius: 6, background: mlColor }} />
          </div>
        </div>
      </div>

      {/* Camadas */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>🏗️ Arquitetura de ML</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 16 }}>
          {[
            { layer: "Camada 1", title: "Score ponderado",       desc: "Ranking por métricas com pesos configuráveis",               status: "◎ Ativo",     color: "#16a34a" },
            { layer: "Camada 2", title: "Análise estatística",   desc: "Correlações, clusters, padrões por nicho",                   status: total >= 10 ? "◎ Ativo" : "⏳ Coletando", color: total >= 10 ? "#16a34a" : "#d97706" },
            { layer: "Camada 3", title: "Dataset ML",             desc: "Features normalizadas para modelos preditivos",             status: mlReadiness === "ready" ? "◎ Pronto" : "📊 Coletando", color: mlReadiness === "ready" ? "#16a34a" : "#64748b" },
            { layer: "Camada 4", title: "ML Supervisionado",     desc: "Modelos de classificação e regressão (futuro)",              status: "🔮 Futuro",   color: "#7c3aed" },
          ].map(l => (
            <div key={l.layer} style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: l.color, textTransform: "uppercase", marginBottom: 4 }}>{l.layer}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{l.title}</div>
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, marginBottom: 8 }}>{l.desc}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: l.color }}>{l.status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>📋 Features disponíveis</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["platform","objective","niche","ad_format","age_range","budget_range","duration","placement","bid_strategy","copy_length","num_creatives","has_video","has_carousel","used_emoji","used_urgency","used_social_proof"].map(f => (
            <span key={f} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8", fontWeight: 600 }}>{f}</span>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "#64748b", borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <strong>Labels:</strong> score_total (0–100) · ctr · cpc · roas · is_winner (0/1)
        </div>
      </div>

      {/* Preview */}
      {data?.dataset && data.dataset.length > 0 && (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            Preview ({Math.min(data.dataset.length, 10)} de {total} amostras)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["ID","Plataforma","Objetivo","Nicho","Formato","Score","CTR","CPC","Vencedora","Split"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#94a3b8", fontSize: 9, textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.dataset.slice(0, 10).map((row: any) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace" }}>{row.id}</td>
                    <td style={{ padding: "9px 12px" }}>{row.feature_platform}</td>
                    <td style={{ padding: "9px 12px" }}>{row.feature_objective}</td>
                    <td style={{ padding: "9px 12px" }}>{row.feature_niche}</td>
                    <td style={{ padding: "9px 12px" }}>{row.feature_ad_format}</td>
                    <td style={{ padding: "9px 12px" }}><span style={{ fontWeight: 800, color: SCORE_COLOR(row.label_score) }}>{(row.label_score || 0).toFixed(1)}</span></td>
                    <td style={{ padding: "9px 12px" }}>{(row.label_ctr || 0).toFixed(2)}</td>
                    <td style={{ padding: "9px 12px" }}>{(row.label_cpc || 0).toFixed(2)}</td>
                    <td style={{ padding: "9px 12px" }}>{row.label_is_winner ? <span style={{ color: "#16a34a", fontWeight: 700 }}>◎</span> : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: row.split_group === "train" ? "#eff6ff" : "#f5f3ff", color: row.split_group === "train" ? "#1d4ed8" : "#7c3aed", fontWeight: 700 }}>
                        {row.split_group}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA COMPARAR CAMPANHAS
// ─────────────────────────────────────────────────────────────────────────────
function TabCompare() {
  const [ids, setIds]       = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const compareMutation = (trpc as any).intelligence?.compareCampaigns?.useMutation?.({
    onSuccess: (d: any) => { setResult(d); setLoading(false); },
    onError:   (e: any) => { toast.error(`✕ ${e.message}`); setLoading(false); },
  });

  const handleCompare = () => {
    const idList = ids.split(/[\s,]+/).map(Number).filter(Boolean);
    if (idList.length < 2) { toast.error("Digite pelo menos 2 IDs separados por vírgula"); return; }
    setLoading(true);
    compareMutation?.mutate({ campaignIds: idList });
  };

  return (
    <div>
      <SectionHeader title="⚖️ Análise Comparativa Avançada" sub="Compare campanhas com score ponderado e explicação automática por IA" />

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
          IDs das campanhas (mín. 2, máx. 20 — separados por vírgula):
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={ids}
            onChange={e => setIds(e.target.value)}
            placeholder="Ex: 1, 5, 12, 34"
            style={{ flex: 1, padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, outline: "none" }}
          />
          <button onClick={handleCompare} disabled={loading} style={{
            padding: "10px 24px", borderRadius: 10,
            background: loading ? "#93c5fd" : "#0f172a",
            color: "white", fontWeight: 700, fontSize: 13, border: "none", cursor: loading ? "wait" : "pointer",
          }}>
            {loading ? "⏳ Analisando..." : "⚡ Comparar"}
          </button>
        </div>
      </div>

      {result && (
        <div>
          {/* Campanha vencedora */}
          <div style={{ background: "linear-gradient(135deg,#fef9c3,#fde68a)", border: "2px solid #f59e0b", borderRadius: 20, padding: 28, marginBottom: 24, boxShadow: "0 8px 32px rgba(245,158,11,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>◆</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#854d0e", textTransform: "uppercase" }}>Campanha Vencedora</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{result.winner?.context?.name}</div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <ScoreGauge score={Math.round(result.winner?.score?.total || 0)} size={72} />
              </div>
            </div>

            {/* Score breakdown */}
            <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#854d0e", marginBottom: 12 }}>Breakdown do Score</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                {[
                  { l: "CTR",          v: result.winner?.score?.ctr          || 0 },
                  { l: "CPC",          v: result.winner?.score?.cpc          || 0 },
                  { l: "CPM",          v: result.winner?.score?.cpm          || 0 },
                  { l: "ROAS",         v: result.winner?.score?.roas         || 0 },
                  { l: "Conversão",    v: result.winner?.score?.conversion   || 0 },
                  { l: "Criativo",     v: result.winner?.score?.creative     || 0 },
                  { l: "Consistência", v: result.winner?.score?.consistency  || 0 },
                  { l: "Escala",       v: result.winner?.score?.scalability  || 0 },
                ].map(m => <ScoreBar key={m.l} label={m.l} value={m.v} color="#d97706" />)}
              </div>
            </div>

            {result.winner?.whyItWon && (
              <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#854d0e", marginBottom: 8 }}>💡 Por que venceu</div>
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{result.winner.whyItWon}</div>
              </div>
            )}

            {Array.isArray(result.winner?.recommendations) && result.winner.recommendations.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#854d0e", marginBottom: 8 }}>🎯 Recomendações</div>
                {result.winner.recommendations.map((r: string, i: number) => (
                  <div key={i} style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>• {r}</div>
                ))}
              </div>
            )}
          </div>

          {/* Tabela comparativa */}
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              Comparação detalhada ({result.comparison?.length} campanhas)
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Rank","Campanha","Score","CTR","CPC","CPM","ROAS","Conversão","Dist. ao 1º"].map(h => (
                      <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.comparison?.map((c: any) => (
                    <tr key={c.campaignId} style={{ borderBottom: "1px solid #f1f5f9", background: c.isWinner ? "#fffbeb" : "white" }}>
                      <td style={{ padding: "12px 14px" }}>
                        {c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : c.rank === 3 ? "🥉" : `#${c.rank}`}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{c.platform} · {c.objective}</div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ScoreGauge score={Math.round(c.score?.total || 0)} size={36} />
                          <span style={{ fontWeight: 800, color: SCORE_COLOR(c.score?.total || 0) }}>{(c.score?.total || 0).toFixed(0)}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#3b82f6"  }}>{(c.score?.ctr        || 0).toFixed(1)}/10</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#ef4444"  }}>{(c.score?.cpc        || 0).toFixed(1)}/10</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#f59e0b"  }}>{(c.score?.cpm        || 0).toFixed(1)}/10</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#10b981"  }}>{(c.score?.roas       || 0).toFixed(1)}/10</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#7c3aed"  }}>{(c.score?.conversion || 0).toFixed(1)}/10</td>
                      <td style={{ padding: "12px 14px" }}>
                        {c.gapToWinner === 0
                          ? <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>🏆 Líder</span>
                          : <span style={{ fontSize: 11, color: "#dc2626" }}>-{c.gapToWinner} pts</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminCampaignIntelligence() {
  const [, setLocation]  = useLocation();
  const [activeTab, setActiveTab] = useState<TabMain>("dashboard");

  const scoreMutation = (trpc as any).intelligence?.calculateCampaignScore?.useMutation?.({
    onSuccess: (d: any) => toast.success(`◎ Score calculado: ${d.score.total}/100`),
    onError:   (e: any) => toast.error(`✕ ${e.message}`),
  });

  const extractMutation = (trpc as any).intelligence?.extractAndSavePattern?.useMutation?.({
    onSuccess: (d: any) => toast.success(`◎ Padrão extraído! Score ${d.score.total}/100`),
    onError:   (e: any) => toast.error(`✕ ${e.message}`),
  });

  const approveMutation = (trpc as any).intelligence?.approvePattern?.useMutation?.({
    onSuccess: () => toast.success("◎ Padrão aprovado e ativo no MECProAI!"),
    onError:   (e: any) => toast.error(`✕ ${e.message}`),
  });

  const batchMutation = (trpc as any).intelligence?.calculateBatchScores?.useMutation?.({
    onSuccess: (d: any) => toast.success(`◎ ${d.processed} campanhas processadas!`),
    onError:   (e: any) => toast.error(`✕ ${e.message}`),
  });

  const TABS: Array<{ key: TabMain; icon: string; label: string }> = [
    { key: "dashboard", icon: "📊", label: "Dashboard"  },
    { key: "campaigns", icon: "🎯", label: "Campanhas"  },
    { key: "ranking",   icon: "◆", label: "Ranking"    },
    { key: "compare",   icon: "⚖️",  label: "Comparar"   },
    { key: "patterns",  icon: "🔍", label: "Padrões"    },
    { key: "learning",  icon: "🧠", label: "Aprendizado" },
    { key: "ml",        icon: "🔬", label: "Dataset ML"  },
  ];

  return (
    <Layout>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .intel-content { animation: fadeSlide 0.2s ease; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => setLocation("/admin")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13, marginBottom: 12, padding: 0 }}>
          ← Painel Admin
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
              🧠 Inteligência de Campanhas
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
              Análise comparativa · Ranking por performance · Aprendizado contínuo · Preparação para ML
            </p>
          </div>
          <button
            onClick={() => batchMutation?.mutate({ limit: 100 })}
            disabled={batchMutation?.isPending}
            style={{
              padding: "9px 18px", borderRadius: 12,
              background: batchMutation?.isPending ? "#f1f5f9" : "linear-gradient(135deg,#0f172a,#1e3a5f)",
              color: batchMutation?.isPending ? "#94a3b8" : "white",
              fontWeight: 700, fontSize: 12, border: "none", cursor: batchMutation?.isPending ? "wait" : "pointer",
            }}
          >
            {batchMutation?.isPending ? "⏳ Processando..." : "⚡ Score em lote"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "2px solid #e2e8f0", overflowX: "auto" }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "12px 20px", border: "none", cursor: "pointer", background: "transparent",
            color: activeTab === tab.key ? "#0f172a" : "#94a3b8",
            fontWeight: activeTab === tab.key ? 800 : 500,
            fontSize: 13, whiteSpace: "nowrap",
            borderBottom: `2px solid ${activeTab === tab.key ? "#0f172a" : "transparent"}`,
            marginBottom: -2, transition: "all 0.15s",
          }}>
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="intel-content">
        {activeTab === "dashboard" && <TabDashboard />}
        {activeTab === "campaigns" && (
          <TabCampaigns
            onScore={id  => scoreMutation?.mutate({ campaignId: id })}
            onExtract={id => extractMutation?.mutate({ campaignId: id, approveNow: false })}
          />
        )}
        {activeTab === "ranking"  && <TabRanking />}
        {activeTab === "compare"  && <TabCompare />}
        {activeTab === "patterns" && <TabPatterns onApprove={id => approveMutation?.mutate({ patternId: id })} />}
        {activeTab === "learning" && <TabLearning />}
        {activeTab === "ml"       && <TabML />}
      </div>
    </Layout>
  );
}
