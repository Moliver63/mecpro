/**
 * MetaPlacementValidatorPanel.tsx
 *
 * Painel visual de validação de compatibilidade criativo × placements Meta Ads.
 * Exibe status por placement: Aprovado, Aviso, Bloqueado.
 *
 * USO no FacebookCampaignCreator.tsx (Step Criativo) e CampaignResult.tsx:
 *
 *   import MetaPlacementValidatorPanel from "@/components/MetaPlacementValidatorPanel";
 *
 *   <MetaPlacementValidatorPanel
 *     selectedPlacements={["fb_feed", "fb_story", "ig_story", "ig_reels"]}
 *     mediaType={mediaType}
 *     mediaPreview={mediaPreview}
 *     hasInstagram={!!pageId}
 *     onPlacementsChange={(approved) => setSelectedPlacements(approved)}
 *   />
 */

import { useState, useEffect } from "react";
import {
  validatePublicationReadiness,
  suggestCompatiblePlacements,
  buildCreativeMetadata,
  META_PLACEMENT_RULES,
  type PublicationValidation,
  type ValidationStatus,
} from "./MetaPlacementValidator";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  selectedPlacements:  string[];
  mediaType?:          "image" | "video" | null;
  mediaFile?:          File | null;
  mediaPreview?:       string;
  uploadedHash?:       string;
  hasInstagram?:       boolean;
  hasThreads?:         boolean;
  // Dimensões do criativo (se conhecidas)
  creativeWidth?:      number;
  creativeHeight?:     number;
  videoDuration?:      number;
  // Callback quando placements são ajustados automaticamente
  onPlacementsChange?: (validPlacements: string[]) => void;
  // Modo compacto (para usar dentro de modais)
  compact?:            boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG VISUAL
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ValidationStatus, {
  icon: string; label: string; color: string; bg: string; border: string;
}> = {
  approved:            { icon: "✅", label: "Compatível",        color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  warning:             { icon: "⚠️", label: "Ajuste recomendado", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  blocked:             { icon: "❌", label: "Bloqueado",          color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  requires_adjustment: { icon: "🔧", label: "Ajuste necessário",  color: "#7c3aed", bg: "#fdf4ff", border: "#d8b4fe" },
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTE: Card de status por placement
// ─────────────────────────────────────────────────────────────────────────────

function PlacementStatusCard({
  result, onAutoFix, onRemove,
}: {
  result: ReturnType<typeof validatePublicationReadiness>["results"][0];
  onAutoFix?: () => void;
  onRemove?:  () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[result.status];

  return (
    <div style={{
      border: `1.5px solid ${config.border}`,
      borderRadius: 12, background: config.bg,
      padding: "12px 14px", marginBottom: 8,
      transition: "all 0.15s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{config.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{result.placementLabel}</span>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
              background: config.color + "20", color: config.color,
              textTransform: "uppercase", letterSpacing: "0.4px",
            }}>{config.label}</span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>
            {result.reason}
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expandido */}
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${config.border}` }}>
          {/* Detalhes */}
          {result.details.filter(Boolean).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {result.details.filter(Boolean).map((d, i) => (
                <div key={i} style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>• {d}</div>
              ))}
            </div>
          )}

          {/* Fix sugerido */}
          {result.fix && (
            <div style={{
              background: "rgba(255,255,255,0.7)", borderRadius: 8,
              padding: "8px 10px", marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: config.color, marginBottom: 3 }}>
                🔧 Como resolver:
              </div>
              <div style={{ fontSize: 11, color: "#334155" }}>{result.fix}</div>
            </div>
          )}

          {/* Botões de ação */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {result.autoFix && onAutoFix && (
              <button onClick={onAutoFix} style={{
                fontSize: 10, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                background: config.color, color: "white", border: "none", cursor: "pointer",
              }}>
                ⚡ {result.autoFix.label}
              </button>
            )}
            {result.status === "blocked" && onRemove && (
              <button onClick={onRemove} style={{
                fontSize: 10, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                background: "#fef2f2", color: "#dc2626",
                border: "1px solid #fca5a5", cursor: "pointer",
              }}>
                🗑️ Remover placement
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function MetaPlacementValidatorPanel({
  selectedPlacements,
  mediaType,
  mediaFile,
  mediaPreview,
  uploadedHash,
  hasInstagram = false,
  hasThreads   = false,
  creativeWidth,
  creativeHeight,
  videoDuration,
  onPlacementsChange,
  compact = false,
}: Props) {
  const [validation, setValidation] = useState<PublicationValidation | null>(null);
  const [autoRemovedCount, setAutoRemovedCount] = useState(0);

  useEffect(() => {
    if (selectedPlacements.length === 0) { setValidation(null); return; }

    const creative = buildCreativeMetadata({
      mediaFile,
      mediaPreview,
      mediaType,
      uploadedHash,
      hasInstagram,
      hasThreads,
      width:       creativeWidth,
      height:      creativeHeight,
      durationSec: videoDuration,
    });

    const result = validatePublicationReadiness(selectedPlacements, creative);
    setValidation(result);
  }, [selectedPlacements, mediaType, mediaFile, mediaPreview, hasInstagram, hasThreads, creativeWidth, creativeHeight, videoDuration]);

  if (!validation || selectedPlacements.length === 0) return null;

  const handleRemovePlacement = (placementId: string) => {
    if (onPlacementsChange) {
      onPlacementsChange(selectedPlacements.filter(p => p !== placementId));
      setAutoRemovedCount(c => c + 1);
    }
  };

  const handleRemoveAllBlocked = () => {
    if (onPlacementsChange) {
      const valid = selectedPlacements.filter(p => !validation.blockedPlacements.includes(p));
      onPlacementsChange(valid);
      setAutoRemovedCount(validation.blockedPlacements.length);
    }
  };

  const { approved, warning, blocked } = {
    approved: validation.approvedPlacements.length,
    warning:  validation.warningPlacements.length,
    blocked:  validation.blockedPlacements.length,
  };

  return (
    <div style={{
      background: "white",
      border: `2px solid ${blocked > 0 ? "#fca5a5" : warning > 0 ? "#fcd34d" : "#86efac"}`,
      borderRadius: 18, padding: compact ? 16 : 22, marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 3 }}>
            🎯 Validação de Placements Meta Ads
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Compatibilidade do criativo com os posicionamentos selecionados
          </div>
        </div>
        {/* Score */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{
            fontSize: 22, fontWeight: 900,
            color: validation.qualityScore >= 80 ? "#16a34a" : validation.qualityScore >= 50 ? "#d97706" : "#dc2626",
          }}>
            {validation.qualityScore}%
          </div>
          <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" }}>qualidade</div>
        </div>
      </div>

      {/* Resumo em badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {approved > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" }}>
            ✅ {approved} compatível{approved !== 1 ? "s" : ""}
          </div>
        )}
        {warning > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "#fffbeb", color: "#d97706", border: "1px solid #fcd34d" }}>
            ⚠️ {warning} com aviso
          </div>
        )}
        {blocked > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}>
            ❌ {blocked} bloqueado{blocked !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Resumo */}
      <div style={{
        fontSize: 12, padding: "10px 14px", borderRadius: 10, marginBottom: 14,
        background: !validation.canPublish ? "#fef2f2" : blocked > 0 ? "#fffbeb" : "#f0fdf4",
        color: !validation.canPublish ? "#dc2626" : blocked > 0 ? "#d97706" : "#16a34a",
        fontWeight: 600,
      }}>
        {validation.summary}
      </div>

      {/* Cards por placement */}
      <div style={{ marginBottom: 14 }}>
        {validation.results.map(result => (
          <PlacementStatusCard
            key={result.placementId}
            result={result}
            onAutoFix={result.autoFix?.type === "uncheck_placement"
              ? () => handleRemovePlacement(result.placementId)
              : undefined
            }
            onRemove={result.status === "blocked"
              ? () => handleRemovePlacement(result.placementId)
              : undefined
            }
          />
        ))}
      </div>

      {/* Ação rápida: remover todos os bloqueados */}
      {blocked > 0 && onPlacementsChange && (
        <div style={{
          background: "#fef2f2", borderRadius: 12, padding: "12px 14px",
          marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>
              ❌ {blocked} placement{blocked !== 1 ? "s bloqueados" : " bloqueado"} serão ignorados pela Meta
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              Remova-os para evitar erros de veiculação
            </div>
          </div>
          <button onClick={handleRemoveAllBlocked} style={{
            fontSize: 11, fontWeight: 700, padding: "7px 14px", borderRadius: 8,
            background: "#dc2626", color: "white", border: "none", cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0, marginLeft: 10,
          }}>
            🗑️ Remover {blocked > 1 ? "todos" : ""}
          </button>
        </div>
      )}

      {/* Sugestões */}
      {validation.suggestions.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
            Sugestões de melhoria
          </div>
          {validation.suggestions.map((s, i) => (
            <div key={i} style={{
              fontSize: 11, color: "#475569", padding: "6px 10px", borderRadius: 8,
              background: "#f8fafc", marginBottom: 4, lineHeight: 1.4,
            }}>
              {s}
            </div>
          ))}
        </div>
      )}

      {/* Placements compatíveis sugeridos (se há bloqueados) */}
      {blocked > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
            Placements recomendados para este criativo
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {suggestCompatiblePlacements(buildCreativeMetadata({
              mediaType, mediaFile, hasInstagram, hasThreads,
              width: creativeWidth, height: creativeHeight, durationSec: videoDuration,
            })).map(p => {
              const rule = META_PLACEMENT_RULES[p];
              const isAlreadySelected = selectedPlacements.includes(p);
              if (!rule) return null;
              return (
                <div key={p} style={{
                  fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                  background: isAlreadySelected ? "#f0fdf4" : "#f8fafc",
                  color: isAlreadySelected ? "#16a34a" : "#64748b",
                  border: `1px solid ${isAlreadySelected ? "#86efac" : "#e2e8f0"}`,
                }}>
                  {isAlreadySelected ? "✅ " : ""}{rule.label}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {autoRemovedCount > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: "#16a34a", fontWeight: 600, textAlign: "center" }}>
          ✅ {autoRemovedCount} placement{autoRemovedCount !== 1 ? "s removidos" : " removido"} automaticamente
        </div>
      )}
    </div>
  );
}
