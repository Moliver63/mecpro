import { useState } from "react";
import {
  PLACEMENT_GROUPS,
  AUTO_PLACEMENTS,
  PLATFORM_PLACEMENTS,
  validatePlacement,
  type PlacementMode,
} from "./PlacementConfig";

interface PlacementSelectorProps {
  platform:           string;   // meta | google | tiktok | both | all
  objective?:         string;   // leads | traffic | sales | engagement | awareness
  hasVideo?:          boolean;
  mode:               PlacementMode;
  selectedPlacements: string[];
  onModeChange:       (mode: PlacementMode) => void;
  onPlacementsChange: (placements: string[]) => void;
}

export default function PlacementSelector({
  platform, objective, hasVideo = false,
  mode, selectedPlacements,
  onModeChange, onPlacementsChange,
}: PlacementSelectorProps) {

  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  // Filtra grupos por plataforma da campanha
  const platformMap: Record<string, string[]> = {
    meta:   ["facebook", "instagram"],
    google: ["google"],
    tiktok: ["tiktok"],
    both:   ["facebook", "instagram", "google"],
    all:    ["facebook", "instagram", "tiktok", "google"],
  };
  const activePlatforms = platformMap[platform] ?? ["facebook", "instagram"];
  const visibleGroups   = PLACEMENT_GROUPS.filter(g => activePlatforms.includes(g.platform));

  // Auto placements baseado em objetivo + plataforma
  const getAutoLabel = () => {
    const base = PLATFORM_PLACEMENTS[platform] ?? [];
    const obj  = objective ? (AUTO_PLACEMENTS[objective] ?? []) : [];
    const merged = [...new Set([...base, ...obj])];
    return merged.filter(id =>
      visibleGroups.some(g => g.placements.some(p => p.id === id))
    );
  };

  const autoIds = getAutoLabel();

  function togglePlacement(id: string) {
    if (selectedPlacements.includes(id)) {
      onPlacementsChange(selectedPlacements.filter(p => p !== id));
    } else {
      onPlacementsChange([...selectedPlacements, id]);
    }
  }

  const warnings = selectedPlacements
    .map(id => ({ id, ...validatePlacement(id, hasVideo) }))
    .filter(v => v.warning);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 800, color: "var(--black)", margin: 0 }}>
            📍 Onde deseja divulgar?
          </p>
          <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>
            Escolha os posicionamentos do seu anúncio
          </p>
        </div>
        {mode === "manual" && selectedPlacements.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
            background: "var(--green-l)", color: "var(--green-d)",
          }}>
            {selectedPlacements.length} selecionado(s)
          </span>
        )}
      </div>

      {/* Toggle Automático / Manual */}
      <div style={{
        display: "flex", gap: 0, borderRadius: 10, overflow: "hidden",
        border: "1.5px solid var(--border)", marginBottom: 14, width: "fit-content",
      }}>
        {(["auto", "manual"] as PlacementMode[]).map(m => (
          <button key={m} onClick={() => {
            onModeChange(m);
            if (m === "auto") onPlacementsChange(autoIds);
          }} style={{
            padding: "8px 18px", border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 12, transition: "all .15s",
            background: mode === m ? "var(--navy)" : "white",
            color: mode === m ? "white" : "var(--muted)",
          }}>
            {m === "auto" ? "⚡ Automático" : "🎯 Manual"}
          </button>
        ))}
      </div>

      {/* Modo Automático */}
      {mode === "auto" && (
        <div style={{
          background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
          border: "1.5px solid #86efac", borderRadius: 12, padding: "12px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>◎</span>
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: "#166534", margin: 0 }}>
                Recomendado pelo MECPro
              </p>
              <p style={{ fontSize: 11, color: "#15803d", margin: "1px 0 0" }}>
                Selecionamos os melhores posicionamentos para o objetivo "{objective || platform}"
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {autoIds.map(id => {
              const group = visibleGroups.find(g => g.placements.find(p => p.id === id));
              const plc   = group?.placements.find(p => p.id === id);
              if (!plc) return null;
              return (
                <span key={id} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: `${group!.color}15`, color: group!.color,
                  border: `1.5px solid ${group!.color}40`,
                }}>
                  {plc.icon} {plc.label}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>({group!.label})</span>
                </span>
              );
            })}
          </div>
          <p style={{ fontSize: 10, color: "#15803d", marginTop: 8, marginBottom: 0 }}>
            💡 Alterne para Manual para personalizar
          </p>
        </div>
      )}

      {/* Modo Manual */}
      {mode === "manual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {visibleGroups.map(group => (
            <div key={group.platform}>
              {/* Platform header */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: `${group.color}20`, border: `1.5px solid ${group.color}40`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                }}>
                  {group.icon}
                </div>
                <p style={{ fontSize: 12, fontWeight: 800, color: "var(--black)", margin: 0 }}>
                  {group.label}
                </p>
              </div>

              {/* Placement chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {group.placements.map(plc => {
                  const isSelected = selectedPlacements.includes(plc.id);
                  const validation = validatePlacement(plc.id, hasVideo);
                  const hasWarn    = !!validation.requiresVideo;

                  return (
                    <div key={plc.id} style={{ position: "relative" }}>
                      <button
                        onClick={() => togglePlacement(plc.id)}
                        onMouseEnter={() => setShowTooltip(plc.id)}
                        onMouseLeave={() => setShowTooltip(null)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                          fontSize: 12, fontWeight: isSelected ? 700 : 500,
                          border: `1.5px solid ${isSelected ? group.color : hasWarn ? "#fca5a5" : "var(--border)"}`,
                          background: isSelected ? `${group.color}18` : hasWarn ? "#fff1f1" : "white",
                          color: isSelected ? group.color : hasWarn ? "#dc2626" : "var(--body)",
                          transition: "all .15s",
                          boxShadow: isSelected ? `0 0 0 3px ${group.color}25` : "none",
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{plc.icon}</span>
                        {plc.label}
                        {plc.recommended && !isSelected && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "1px 5px", borderRadius: 8 }}>rec</span>
                        )}
                        {isSelected && <span style={{ fontSize: 12 }}>✓</span>}
                      </button>

                      {/* Tooltip */}
                      {showTooltip === plc.id && (
                        <div style={{
                          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
                          transform: "translateX(-50%)",
                          background: "#1e293b", color: "white", fontSize: 11,
                          padding: "6px 10px", borderRadius: 8, whiteSpace: "normal" as any,
                          zIndex: 100, pointerEvents: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,.3)",
                          maxWidth: 220, textAlign: "center",
                        }}>
                          {plc.tooltip}
                          <div style={{
                            position: "absolute", top: "100%", left: "50%",
                            transform: "translateX(-50%)",
                            width: 0, height: 0,
                            borderLeft: "5px solid transparent",
                            borderRight: "5px solid transparent",
                            borderTop: "5px solid #1e293b",
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Selecionar todos / limpar */}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => onPlacementsChange(autoIds)}
              style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                background: "var(--off)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--body)" }}>
              ⚡ Aplicar recomendados
            </button>
            <button onClick={() => onPlacementsChange([])}
              style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                background: "none", border: "1px solid var(--border)", cursor: "pointer", color: "var(--muted)" }}>
              ✕ Limpar
            </button>
          </div>
        </div>
      )}

      {/* Avisos de validação */}
      {warnings.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {warnings.map(w => (
            <div key={w.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: w.requiresVideo ? "#fef2f2" : "#fffbeb",
              border: `1px solid ${w.requiresVideo ? "#fca5a5" : "#fcd34d"}`,
              borderRadius: 8, padding: "6px 10px", fontSize: 11,
              color: w.requiresVideo ? "#dc2626" : "#92400e",
            }}>
              {w.requiresVideo ? "✕" : "◬"} {w.warning}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
