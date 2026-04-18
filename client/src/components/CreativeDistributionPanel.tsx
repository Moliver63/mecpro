/**
 * CreativeDistributionPanel.tsx
 *
 * Painel visual de distribuição inteligente de anúncios.
 * Exibe formatos recomendados, alertas de incompatibilidade e sugestões de variações.
 *
 * USO no CampaignBuilder (Step 3 — Plataforma):
 *   import CreativeDistributionPanel from "@/components/CreativeDistributionPanel";
 *
 *   <CreativeDistributionPanel
 *     platform={form.platform}
 *     objective={form.objective}
 *     onFormatSelect={(format, ratio) => { ... }}
 *   />
 */

import { useState } from "react";
import {
  getFormatRecommendations,
  getDistributionRecommendation,
  detectAspectRatio,
  getRatioLabel,
  getRatioIcon,
  type AspectRatio,
  type CreativeSpec,
  type Platform,
  type CampaignObjective,
  type FormatRecommendation,
} from "./CreativeDistributionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  platform:    string;
  objective:   string;
  // Opcional: se o usuário já tem um criativo com dimensões conhecidas
  creativeWidth?:    number;
  creativeHeight?:   number;
  creativeType?:     "image" | "video" | "carousel";
  creativeDuration?: number;
  // Callback quando o usuário seleciona um formato
  onFormatSelect?: (format: FormatRecommendation) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES VISUAIS
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  primary:   { label: "Primário",   color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  secondary: { label: "Secundário", color: "#0891b2", bg: "#ecfeff", border: "#67e8f9" },
  optional:  { label: "Opcional",   color: "#7c3aed", bg: "#fdf4ff", border: "#d8b4fe" },
};

const ALERT_CONFIG = {
  error:   { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626" },
  warning: { bg: "#fffbeb", border: "#fcd34d", text: "#d97706" },
  info:    { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
  success: { bg: "#f0fdf4", border: "#86efac", text: "#16a34a" },
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTE: Preview visual de proporção
// ─────────────────────────────────────────────────────────────────────────────

function RatioPreview({ ratio, size = 48 }: { ratio: AspectRatio; size?: number }) {
  const dims: Record<AspectRatio, { w: number; h: number }> = {
    "9:16":   { w: 0.5625, h: 1 },
    "4:5":    { w: 0.8,    h: 1 },
    "1:1":    { w: 1,      h: 1 },
    "16:9":   { w: 1,      h: 0.5625 },
    "1.91:1": { w: 1,      h: 0.524 },
    "4:3":    { w: 1,      h: 0.75 },
    "unknown": { w: 1,    h: 1 },
  };

  const d    = dims[ratio] || { w: 1, h: 1 };
  const maxW = size;
  const maxH = size;
  const w    = Math.round(maxW * d.w);
  const h    = Math.round(maxH * d.h);

  return (
    <div style={{ width: maxW, height: maxH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{
        width: w, height: h,
        background: "linear-gradient(135deg, #0891b2, #1d4ed8)",
        borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, color: "white", fontWeight: 700,
      }}>
        {ratio}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTE: Card de formato recomendado
// ─────────────────────────────────────────────────────────────────────────────

function FormatCard({
  rec, selected, onClick,
}: {
  rec: FormatRecommendation;
  selected: boolean;
  onClick: () => void;
}) {
  const config = PRIORITY_CONFIG[rec.priority];
  return (
    <div
      onClick={onClick}
      style={{
        border: `2px solid ${selected ? config.color : config.border}`,
        borderRadius: 14, padding: "14px 16px", cursor: "pointer",
        background: selected ? config.bg : "white",
        transition: "all 0.15s",
        boxShadow: selected ? `0 0 0 3px ${config.color}20` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <RatioPreview ratio={rec.ratio} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 16 }}>{getRatioIcon(rec.ratio)}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{rec.ratio}</span>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
              background: config.bg, color: config.color, border: `1px solid ${config.border}`,
              textTransform: "uppercase",
            }}>{config.label}</span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{getRatioLabel(rec.ratio)}</div>
        </div>
        {selected && <span style={{ color: config.color, fontSize: 18, flexShrink: 0 }}>✓</span>}
      </div>

      <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, lineHeight: 1.5 }}>
        💡 {rec.reason}
      </div>

      <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", background: "#f8fafc", borderRadius: 6, padding: "4px 8px", marginBottom: 8 }}>
        📐 {rec.specs}
      </div>

      {rec.placements.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {rec.placements.map(p => (
            <span key={p} style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 10,
              background: "#f1f5f9", color: "#64748b", fontWeight: 600,
            }}>📍 {p.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function CreativeDistributionPanel({
  platform, objective, creativeWidth, creativeHeight,
  creativeType = "image", creativeDuration,
  onFormatSelect,
}: Props) {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [expanded, setExpanded]             = useState(false);
  const [customWidth,  setCustomWidth]      = useState("");
  const [customHeight, setCustomHeight]     = useState("");

  const plt = platform  as Platform;
  const obj = objective as CampaignObjective;

  // Formatos recomendados para esta combinação plataforma + objetivo
  const recommendations = getFormatRecommendations(plt, obj);

  // Se tem dimensões do criativo, analisa compatibilidade
  const w = creativeWidth  || Number(customWidth)  || 0;
  const h = creativeHeight || Number(customHeight) || 0;
  const detectedRatio = w && h ? detectAspectRatio(w, h) : "unknown" as AspectRatio;

  const creativeSpec: CreativeSpec | null = w && h ? {
    width: w, height: h,
    ratio:       detectedRatio,
    orientation: detectedRatio === "9:16" || detectedRatio === "4:5" ? "vertical"
               : detectedRatio === "1:1" ? "square" : "horizontal",
    type:        creativeType,
    durationSec: creativeDuration,
  } : null;

  const distribution = creativeSpec
    ? getDistributionRecommendation(creativeSpec, plt, obj)
    : null;

  const hasPrimary   = recommendations.filter(r => r.priority === "primary").length;
  const hasSecondary = recommendations.filter(r => r.priority === "secondary").length;

  if (recommendations.length === 0) return null;

  return (
    <div style={{
      background: "white",
      border: "2px solid #e2e8f0",
      borderRadius: 18, padding: 22,
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
            🎨 Distribuição Inteligente de Formatos
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Formatos recomendados para <strong>{platform}</strong> · objetivo <strong>{objective}</strong>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} style={{
          fontSize: 11, padding: "5px 12px", borderRadius: 20,
          border: "1px solid #e2e8f0", background: "white", cursor: "pointer",
          color: "#64748b", fontWeight: 600,
        }}>
          {expanded ? "▲ Menos" : "▼ Mais"}
        </button>
      </div>

      {/* Cards de formatos recomendados */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
        {recommendations.map(rec => (
          <FormatCard
            key={`${rec.ratio}_${rec.type}_${rec.priority}`}
            rec={rec}
            selected={selectedFormat === `${rec.ratio}_${rec.type}`}
            onClick={() => {
              const key = `${rec.ratio}_${rec.type}`;
              setSelectedFormat(prev => prev === key ? null : key);
              if (onFormatSelect) onFormatSelect(rec);
            }}
          />
        ))}
      </div>

      {/* Sumário rápido */}
      <div style={{
        background: "#f8fafc", borderRadius: 12, padding: "10px 14px",
        fontSize: 12, color: "#475569", marginBottom: distribution ? 16 : 0,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span>📋</span>
        <span>
          <strong>{hasPrimary} formato(s) primário(s)</strong> e <strong>{hasSecondary} secundário(s)</strong> recomendados para esta configuração.
          {" "}Clique em um formato para selecioná-lo.
        </span>
      </div>

      {/* Análise do criativo existente (se dimensões fornecidas) */}
      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>

          {/* Input de dimensões customizadas */}
          {!creativeWidth && !creativeHeight && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                📐 Verificar compatibilidade do seu criativo
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="number" placeholder="Largura (px)"
                  value={customWidth}
                  onChange={e => setCustomWidth(e.target.value)}
                  style={{ width: 120, padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                />
                <span style={{ color: "#94a3b8" }}>×</span>
                <input
                  type="number" placeholder="Altura (px)"
                  value={customHeight}
                  onChange={e => setCustomHeight(e.target.value)}
                  style={{ width: 120, padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                />
                {detectedRatio !== "unknown" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac" }}>
                    <span>{getRatioIcon(detectedRatio)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>
                      Proporção detectada: {detectedRatio}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resultado da análise */}
          {distribution && (
            <div>
              {/* Score de qualidade */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, background: "#f8fafc", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                  <svg width="52" height="52" viewBox="0 0 52 52">
                    <circle cx="26" cy="26" r="20" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                    <circle cx="26" cy="26" r="20" fill="none"
                      stroke={distribution.qualityScore >= 70 ? "#16a34a" : distribution.qualityScore >= 40 ? "#d97706" : "#dc2626"}
                      strokeWidth="5"
                      strokeDasharray={`${(distribution.qualityScore / 100) * 125.6} 125.6`}
                      strokeLinecap="round" transform="rotate(-90 26 26)" />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: distribution.qualityScore >= 70 ? "#16a34a" : "#d97706" }}>
                      {distribution.qualityScore}%
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>
                    Score de qualidade da distribuição
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{distribution.summary}</div>
                </div>
              </div>

              {/* Placements por categoria */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                {[
                  { label: "◎ Prioritários", items: distribution.priorityPlacements, color: "#16a34a", bg: "#f0fdf4" },
                  { label: "⚡ Compatíveis", items: distribution.compatiblePlacements, color: "#0891b2", bg: "#ecfeff" },
                  { label: "✕ Bloqueados",  items: distribution.blockedPlacements,   color: "#dc2626", bg: "#fef2f2" },
                ].map(cat => (
                  <div key={cat.label} style={{ background: cat.bg, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: cat.color, marginBottom: 6 }}>{cat.label}</div>
                    {cat.items.length === 0 ? (
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Nenhum</div>
                    ) : cat.items.map(p => (
                      <div key={p} style={{ fontSize: 10, color: "#334155", marginBottom: 2 }}>
                        • {p.replace(/_/g, " ")}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Alertas */}
              {distribution.alerts.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
                    Alertas de compatibilidade
                  </div>
                  {distribution.alerts.slice(0, 6).map((alert, i) => {
                    const config = ALERT_CONFIG[alert.type];
                    return (
                      <div key={i} style={{
                        background: config.bg, border: `1px solid ${config.border}`,
                        borderRadius: 8, padding: "8px 12px", marginBottom: 6,
                        display: "flex", gap: 8, alignItems: "flex-start",
                      }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{alert.icon}</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: config.text }}>{alert.title}</div>
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>{alert.message}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Variações sugeridas */}
              {distribution.suggestedVariations.length > 0 && (
                <div style={{ background: "linear-gradient(135deg, #eff6ff, #f0f9ff)", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>
                    💡 Variações recomendadas para maximizar alcance
                  </div>
                  {distribution.suggestedVariations.map((v, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <RatioPreview ratio={v.fromRatio} size={32} />
                      <span style={{ color: "#94a3b8", fontSize: 14 }}>→</span>
                      <RatioPreview ratio={v.toRatio} size={32} />
                      <div style={{ flex: 1, fontSize: 11, color: "#334155" }}>
                        <strong>{v.toRatio}</strong> — {v.reason}
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
                          Libera: {v.forPlacements.map(p => p.replace(/_/g, " ")).join(", ")}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, padding: "2px 7px", borderRadius: 10,
                        background: v.priority === "high" ? "#fef9c3" : "#f1f5f9",
                        color: v.priority === "high" ? "#854d0e" : "#64748b",
                        fontWeight: 700,
                      }}>
                        {v.priority === "high" ? "🔥 Alta" : v.priority === "medium" ? "⚡ Média" : "💡 Opcional"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tabela de referência rápida */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
              Referência: formatos por placement
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    {["Placement", "Ideal", "Aceito", "Bloqueado"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "FB/IG Stories",   ideal: "9:16",        accepted: "4:5",             blocked: "16:9, 1:1" },
                    { label: "FB/IG Reels",     ideal: "9:16",        accepted: "—",               blocked: "Tudo exceto 9:16" },
                    { label: "IG Feed",         ideal: "4:5, 1:1",    accepted: "1.91:1",          blocked: "9:16, 16:9" },
                    { label: "FB Feed",         ideal: "4:5, 1:1",    accepted: "16:9, 1.91:1",    blocked: "9:16" },
                    { label: "YouTube",         ideal: "16:9",        accepted: "4:3",             blocked: "9:16, 1:1, 4:5" },
                    { label: "Google Display",  ideal: "16:9, 1:1",   accepted: "4:3",             blocked: "9:16, 4:5" },
                    { label: "TikTok Feed",     ideal: "9:16",        accepted: "1:1",             blocked: "16:9, 4:5, 1.91:1" },
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: "#334155" }}>{row.label}</td>
                      <td style={{ padding: "7px 12px", color: "#16a34a", fontWeight: 600 }}>{row.ideal}</td>
                      <td style={{ padding: "7px 12px", color: "#d97706" }}>{row.accepted}</td>
                      <td style={{ padding: "7px 12px", color: "#dc2626" }}>{row.blocked}</td>
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
