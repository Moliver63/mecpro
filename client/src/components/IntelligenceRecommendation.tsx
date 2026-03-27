/**
 * IntelligenceRecommendation.tsx
 *
 * Componente de recomendação automática baseado na learning base.
 * Adicione no CampaignBuilder.tsx logo antes do formulário de criação.
 *
 * USO:
 *   import IntelligenceRecommendation from "@/components/IntelligenceRecommendation";
 *
 *   <IntelligenceRecommendation
 *     platform={platform}
 *     objective={objective}
 *     niche={clientProfile?.niche || "geral"}
 *     onApply={(rec) => {
 *       // preenche os campos do formulário automaticamente
 *       setBudget(rec.recommendedBudget);
 *       setFormat(rec.recommendedFormat);
 *       // etc...
 *     }}
 *   />
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface Props {
  platform:  string;
  objective: string;
  niche:     string;
  onApply?:  (rec: any) => void;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  alta:  "#16a34a",
  média: "#d97706",
  baixa: "#94a3b8",
};

const FORMAT_ICONS: Record<string, string> = {
  video_curto:    "🎬",
  video_longo:    "📹",
  video:          "🎥",
  imagem_produto: "🖼️",
  imagem_pessoa:  "👤",
  carrossel:      "🎠",
  carousel:       "🎠",
  reels:          "📱",
  stories:        "⭕",
  image:          "🖼️",
};

const TRIGGER_ICONS: Record<string, string> = {
  urgência:        "⏰",
  gratuidade:      "🎁",
  prova_social:    "👥",
  prova_resultado: "✅",
  escassez:        "⚡",
  garantia:        "🛡️",
  desconto:        "💸",
  autoridade:      "🏆",
  informacional:   "📋",
};

const BUDGET_LABELS: Record<string, string> = {
  low:     "< R$100/mês",
  mid:     "R$100–500/mês",
  high:    "R$500–2.000/mês",
  premium: "> R$2.000/mês",
  unknown: "Não definido",
};

const DURATION_LABELS: Record<string, string> = {
  short:   "< 7 dias",
  mid:     "7–30 dias",
  long:    "> 30 dias",
  unknown: "Não definido",
};

export default function IntelligenceRecommendation({ platform, objective, niche, onApply }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [applied,  setApplied]  = useState(false);

  const query = (trpc as any).intelligence?.getRecommendation?.useQuery?.(
    { platform, objective, niche },
    { enabled: !!(platform && objective) }
  );

  const rec = query?.data;

  // Não mostra nada se não tiver dados
  if (!rec || rec.sampleCount === 0) return null;

  const handleApply = () => {
    if (onApply && rec) {
      onApply(rec);
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    }
  };

  const confColor = CONFIDENCE_COLOR[rec.confidenceLabel] || "#94a3b8";
  const successColor = rec.successProbability >= 70 ? "#16a34a" : rec.successProbability >= 50 ? "#d97706" : "#dc2626";

  return (
    <div style={{
      background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
      border: "2px solid #0891b2",
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Badge de confiança */}
      <div style={{
        position: "absolute", top: 14, right: 14,
        fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20,
        background: `${confColor}15`, color: confColor,
        border: `1px solid ${confColor}40`,
      }}>
        🧠 Confiança {rec.confidenceLabel} · {rec.sampleCount} amostra{rec.sampleCount !== 1 ? "s" : ""}
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 24 }}>✨</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
            Recomendação Inteligente
          </div>
          <div style={{ fontSize: 12, color: "#0891b2" }}>
            Baseada em campanhas reais de {niche} · {platform} · {objective}
          </div>
        </div>
      </div>

      {/* Previsão de sucesso */}
      <div style={{
        background: "white", borderRadius: 12, padding: "12px 16px",
        marginBottom: 14, display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="20" fill="none" stroke="#f1f5f9" strokeWidth="5" />
            <circle cx="26" cy="26" r="20" fill="none" stroke={successColor} strokeWidth="5"
              strokeDasharray={`${(rec.successProbability / 100) * 125.6} 125.6`}
              strokeLinecap="round" transform="rotate(-90 26 26)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: successColor }}>{rec.successProbability}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
            Previsão de sucesso: <span style={{ color: successColor }}>{rec.successProbability}%</span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            Baseado nas campanhas que mais performaram neste segmento
          </div>
          {rec.bestCombination && (
            <div style={{ fontSize: 11, color: "#0891b2", marginTop: 4, fontWeight: 600 }}>
              🏆 Melhor combinação detectada: {rec.bestCombination}
            </div>
          )}
        </div>
      </div>

      {/* Parâmetros recomendados — grid compacto */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: 8, marginBottom: 14 }}>
        {[
          { icon: FORMAT_ICONS[rec.recommendedFormat] || "🎯", label: "Formato",    value: rec.recommendedFormat },
          { icon: TRIGGER_ICONS[rec.recommendedTrigger] || "⚡", label: "Gatilho",  value: rec.recommendedTrigger },
          { icon: "📣",                                           label: "CTA",       value: rec.recommendedCta },
          { icon: "💰",                                           label: "Orçamento", value: BUDGET_LABELS[rec.recommendedBudget] || rec.recommendedBudget },
          { icon: "📅",                                           label: "Duração",   value: DURATION_LABELS[rec.recommendedDuration] || rec.recommendedDuration },
          { icon: "📍",                                           label: "Placement", value: rec.recommendedPlacement },
        ].map(item => (
          <div key={item.label} style={{
            background: "white", borderRadius: 10, padding: "8px 10px",
            border: "1px solid #e0f2fe",
          }}>
            <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{item.icon} {item.value}</div>
          </div>
        ))}
      </div>

      {/* Métricas esperadas */}
      <div style={{ background: "white", borderRadius: 10, padding: "10px 14px", marginBottom: 14, border: "1px solid #e0f2fe" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
          Métricas esperadas (média do segmento)
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { l: "CTR esperado",  v: `${(rec.expectedCtr || 0).toFixed(2)}%`,  color: "#3b82f6" },
            { l: "CPC esperado",  v: `R$ ${(rec.expectedCpc || 0).toFixed(2)}`, color: "#ef4444" },
            { l: "ROAS esperado", v: `${(rec.expectedRoas || 0).toFixed(1)}x`,  color: "#10b981" },
          ].map(m => (
            <div key={m.l}>
              <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.v}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{m.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas */}
      {rec.alerts && rec.alerts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {rec.alerts.map((alert: string, i: number) => (
            <div key={i} style={{ fontSize: 11, color: "#854d0e", background: "#fffbeb", borderRadius: 8, padding: "6px 10px", marginBottom: 4 }}>
              {alert}
            </div>
          ))}
        </div>
      )}

      {/* Botões */}
      <div style={{ display: "flex", gap: 8 }}>
        {onApply && (
          <button
            onClick={handleApply}
            style={{
              flex: 1, padding: "10px", borderRadius: 10,
              background: applied ? "#16a34a" : "#0891b2",
              color: "white", fontWeight: 700, fontSize: 12,
              border: "none", cursor: "pointer", transition: "background 0.2s",
            }}
          >
            {applied ? "✅ Parâmetros aplicados!" : "⚡ Aplicar parâmetros recomendados"}
          </button>
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            padding: "10px 14px", borderRadius: 10,
            background: "white", color: "#0891b2",
            fontWeight: 700, fontSize: 11,
            border: "1px solid #0891b2", cursor: "pointer",
          }}
        >
          {expanded ? "▲ Menos" : "▼ Detalhes"}
        </button>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0891b2", marginBottom: 8, textTransform: "uppercase" }}>
            Parâmetros completos validados
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { l: "Tipo de copy",    v: rec.recommendedCopyType },
              { l: "Audiência",       v: rec.recommendedAudience },
              { l: "Score médio",     v: `${(rec.avgScoreContext || 0).toFixed(1)}/100` },
              { l: "Melhor score",    v: `${(rec.bestScoreContext || 0).toFixed(0)}/100` },
              { l: "Amostras",        v: `${rec.sampleCount} campanhas analisadas` },
              { l: "Confiança",       v: rec.confidenceLabel },
            ].map(m => (
              <div key={m.l} style={{ background: "white", borderRadius: 8, padding: "7px 10px", border: "1px solid #e0f2fe" }}>
                <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" }}>{m.l}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{m.v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: "#94a3b8" }}>
            🔒 Recomendações geradas automaticamente pela base de aprendizado do MECProAI.
            Aprovadas pelo admin com base em campanhas reais.
          </div>
        </div>
      )}
    </div>
  );
}
