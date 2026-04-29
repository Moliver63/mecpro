/**
 * PlacementPresetSelector — UI dinâmica com validação visual
 * Mostra claramente o que é enviado para a Meta e por quê
 */

import { useState } from "react";
import { PLACEMENT_PRESETS, PlacementPreset } from "../config/placementPresets";

interface Props {
  value:    string;
  onChange: (presetId: string, placements: string[]) => void;
}

const PLACEMENT_LABELS: Record<string, { label: string; icon: string; platform: "fb" | "ig" | "an"; disabled?: boolean }> = {
  fb_feed:         { label: "Feed Facebook",       icon: "📘", platform: "fb" },
  fb_story:        { label: "Stories Facebook",    icon: "📘", platform: "fb" },
  fb_reels:        { label: "Reels FB ⚠️",          icon: "📘", platform: "fb", disabled: true }, // API rejeita
  fb_instream:     { label: "In-stream Facebook",  icon: "📘", platform: "fb" },
  fb_marketplace:  { label: "Marketplace",         icon: "📘", platform: "fb" },
  fb_search:       { label: "Busca Facebook",      icon: "📘", platform: "fb" },
  fb_right_column: { label: "Coluna Direita",      icon: "📘", platform: "fb" },
  fb_audience_net: { label: "Audience Network",    icon: "🌐", platform: "an" },
  ig_feed:         { label: "Feed Instagram",      icon: "📸", platform: "ig" },
  ig_story:        { label: "Stories Instagram",   icon: "📸", platform: "ig" },
  ig_reels:        { label: "Reels Instagram",     icon: "📸", platform: "ig" },
  ig_explore:      { label: "Explorar Instagram",  icon: "📸", platform: "ig" },
  ig_shop:         { label: "Shop Instagram",      icon: "📸", platform: "ig" },
};

const PLATFORM_COLORS = {
  fb: { bg: "#e8f0fe", text: "#1877f2", border: "#bfcef7" },
  ig: { bg: "#fce4ec", text: "#c2185b", border: "#f48fb1" },
  an: { bg: "#f3e5f5", text: "#7b1fa2", border: "#ce93d8" },
};

export function PlacementPresetSelector({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const selected = PLACEMENT_PRESETS.find(p => p.id === value);
  const isAdvantage = !selected || selected.placements.length === 0;

  function handleSelect(preset: PlacementPreset) {
    onChange(preset.id, preset.placements);
    setExpanded(false);
  }

  // Agrupa posicionamentos por plataforma
  const grouped = selected?.placements.reduce((acc: Record<string, string[]>, id) => {
    const meta = PLACEMENT_LABELS[id];
    if (!meta) return acc;
    if (!acc[meta.platform]) acc[meta.platform] = [];
    acc[meta.platform].push(id);
    return acc;
  }, {}) ?? {};

  const platformLabels: Record<string, string> = {
    fb: "Facebook",
    ig: "Instagram",
    an: "Audience Network",
  };

  return (
    <div style={{ fontFamily: "var(--font, system-ui)" }}>
      {/* Label */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted, #64748b)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
        🎯 Estratégia de posicionamento
      </div>

      {/* Seletor compacto */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderRadius: 10, cursor: "pointer",
          border: `1.5px solid ${isAdvantage ? "#a78bfa" : "#60a5fa"}`,
          background: isAdvantage ? "rgba(139,92,246,0.06)" : "rgba(59,130,246,0.05)",
          fontFamily: "inherit",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{selected?.emoji ?? "🤖"}</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{selected?.label ?? "Advantage+"}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {isAdvantage ? "🤖 Meta IA escolhe automaticamente" : `${selected!.placements.length} posicionamentos selecionados`}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8", transition: "transform .2s", transform: expanded ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {/* Dropdown de presets */}
      {expanded && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, marginTop: 6, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          {PLACEMENT_PRESETS.map((preset, i) => {
            const isSelected = value === preset.id;
            const isAuto = preset.placements.length === 0;
            return (
              <button key={preset.id} onClick={() => handleSelect(preset)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 16px", border: "none", cursor: "pointer", textAlign: "left",
                  background: isSelected ? "rgba(59,130,246,0.08)" : i % 2 === 0 ? "#fafafa" : "white",
                  borderBottom: i < PLACEMENT_PRESETS.length - 1 ? "1px solid #f1f5f9" : "none",
                  fontFamily: "inherit",
                }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{preset.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{preset.label}</span>
                    {isAuto && (
                      <span style={{ fontSize: 9, fontWeight: 800, background: "#7c3aed", color: "white", padding: "1px 6px", borderRadius: 99, textTransform: "uppercase" }}>Advantage+</span>
                    )}
                    {isSelected && <span style={{ fontSize: 10, color: "#2563eb", marginLeft: "auto" }}>✓ Ativo</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {isAuto ? "Meta IA distribui o budget automaticamente" : `${preset.placements.length} posicionamentos`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Painel de validação — o que será enviado para Meta */}
      {selected && (
        <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>

          {/* Header */}
          <div style={{ padding: "10px 14px", background: isAdvantage ? "rgba(124,58,237,0.08)" : "#f0f9ff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>{isAdvantage ? "🤖" : "✅"}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: isAdvantage ? "#7c3aed" : "#0369a1" }}>
              {isAdvantage ? "Advantage+ Placements — Meta decide" : "Posicionamentos que serão enviados para Meta"}
            </span>
          </div>

          {isAdvantage ? (
            /* Advantage+ explainer */
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, background: "rgba(124,58,237,0.06)", border: "1px solid #ddd6fe", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed", marginBottom: 4 }}>O QUE A META FAZ</div>
                  <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>Testa automaticamente todos os posicionamentos disponíveis e redistribui o budget para onde o CPM é mais baixo e a conversão mais alta.</div>
                </div>
                <div style={{ flex: 1, background: "rgba(16,185,129,0.06)", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#059669", marginBottom: 4 }}>QUANDO USAR</div>
                  <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>Ideal para campanhas novas, branding e quando o público ainda está em fase de aprendizado (primeiros 7-14 dias).</div>
                </div>
              </div>
              <div style={{ fontSize: 11, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", color: "#92400e" }}>
                ⚡ O que o MECPro envia para a API: <code style={{ fontFamily: "monospace" }}>device_platforms: ["mobile","desktop"]</code> — sem publisher_platforms (ativa Advantage+)
              </div>
            </div>
          ) : (
            /* Posicionamentos manuais agrupados por plataforma */
            <div style={{ padding: "12px 16px" }}>
              {Object.entries(grouped).map(([plat, ids]) => {
                const colors = PLATFORM_COLORS[plat as keyof typeof PLATFORM_COLORS] ?? PLATFORM_COLORS.fb;
                return (
                  <div key={plat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: colors.text, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                      {platformLabels[plat]}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {ids.map(id => {
                        const meta = PLACEMENT_LABELS[id];
                        return (
                          <div key={id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                            <span>✓</span> {meta?.label ?? id}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* O que é enviado para a API */}
              <div style={{ marginTop: 10, fontSize: 11, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 12px", color: "#0369a1" }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>⚡ O que o MECPro envia para a API Meta:</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, lineHeight: 1.8, wordBreak: "break-all" }}>
                  publisher_platforms: [{[...new Set(selected.placements.map(id => {
                    const m = PLACEMENT_LABELS[id];
                    if (!m) return null;
                    return m.platform === "fb" ? '"facebook"' : m.platform === "ig" ? '"instagram"' : '"audience_network"';
                  }).filter(Boolean))].join(", ")}]<br/>
                  {grouped.fb?.length ? <>facebook_positions: [{grouped.fb.map(id => `"${id.replace("fb_", "")}"`) .join(", ")}]<br/></> : null}
                  {grouped.ig?.length ? <>instagram_positions: [{grouped.ig.map(id => `"${id === "ig_feed" ? "stream" : id.replace("ig_", "")}"`) .join(", ")}]</> : null}
                </div>
              </div>
            </div>
          )}

          {/* Warning específico do segmento */}
          {(selected as any).warning && (
            <div style={{ padding:"8px 16px", background:"#fffbeb", borderTop:"1px solid #fde68a", display:"flex", gap:6 }}>
              <span style={{ fontSize:11, color:"#92400e", fontWeight:700, flexShrink:0 }}>⚠️</span>
              <span style={{ fontSize:11, color:"#92400e", lineHeight:1.5 }}>{(selected as any).warning}</span>
            </div>
          )}
          {/* Plataformas compatíveis */}
          <div style={{ padding:"6px 16px", background:"#f8fafc", borderTop:"1px solid #f1f5f9", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const }}>
            <span style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase" as const, letterSpacing:".05em" }}>Compatível:</span>
            {((selected as any).platforms||[]).map((p:string) => {
              const PM: Record<string,{icon:string;color:string;bg:string}> = {
                meta:  {icon:"📘",color:"#1877f2",bg:"#e8f0fe"},
                google:{icon:"🔵",color:"#1a73e8",bg:"#e3f2fd"},
                tiktok:{icon:"◼",color:"#010101",bg:"#f3f4f6"},
              };
              const m = PM[p]||{icon:"◈",color:"#64748b",bg:"#f1f5f9"};
              return <span key={p} style={{ fontSize:11, fontWeight:700, color:m.color, background:m.bg, padding:"2px 8px", borderRadius:99 }}>{m.icon} {p.charAt(0).toUpperCase()+p.slice(1)}</span>;
            })}
          </div>
          {/* Tip do nicho */}
          <div style={{ padding:"8px 16px", background:"#f8fafc", borderTop:"1px solid #f1f5f9", display:"flex", gap:6 }}>
            <span style={{ fontSize:11, color:"#7c3aed", fontWeight:700, flexShrink:0 }}>💡</span>
            <span style={{ fontSize:11, color:"#475569", lineHeight:1.5 }}>{selected.tip}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlacementPresetSelector;
