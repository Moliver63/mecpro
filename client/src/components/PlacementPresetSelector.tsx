// ============================================================
// COMPONENTE: PlacementPresetSelector
// Arquivo: src/components/PlacementPresetSelector.tsx
// ============================================================

import { useState } from "react";
import { PLACEMENT_PRESETS, PlacementPreset } from "../config/placementPresets";

interface Props {
  value:    string;
  onChange: (presetId: string, placements: string[]) => void;
}

export function PlacementPresetSelector({ value, onChange }: Props) {
  const [showTip, setShowTip] = useState<string | null>(null);

  function handleSelect(preset: PlacementPreset) {
    onChange(preset.id, preset.placements);
    setShowTip(preset.id);
  }

  const selected = PLACEMENT_PRESETS.find(p => p.id === value);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-700">
        🎯 Configuração otimizada por nicho
      </label>

      {/* Grid de nichos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLACEMENT_PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleSelect(preset)}
            className={`
              flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center
              transition-all duration-150 hover:shadow-md
              ${value === preset.id
                ? "border-blue-500 bg-blue-50 shadow-md"
                : "border-gray-200 bg-white hover:border-blue-300"
              }
            `}
          >
            <span className="text-2xl">{preset.emoji}</span>
            <span className={`text-xs font-semibold ${value === preset.id ? "text-blue-700" : "text-gray-700"}`}>
              {preset.label}
            </span>
          </button>
        ))}
      </div>

      {/* Dica do nicho selecionado */}
      {selected && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{selected.emoji}</span>
            <span className="font-semibold text-blue-800">{selected.label}</span>
            <span className="ml-auto text-xs text-blue-500">{selected.description}</span>
          </div>

          {/* Posicionamentos ativos */}
          {selected.placements.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selected.placements.map(p => (
                <span
                  key={p}
                  className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                >
                  ◎ {PLACEMENT_LABELS[p] || p}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-blue-600">
              🤖 Meta Advantage+ — posicionamentos automáticos
            </span>
          )}

          {/* Tip */}
          <p className="text-xs text-blue-700 border-t border-blue-200 pt-2">
            💡 {selected.tip}
          </p>

          {/* CTA recomendado */}
          <div className="flex gap-3 text-xs text-blue-600">
            <span>🎯 CTA: <strong>{selected.cta}</strong></span>
            <span>📊 Objetivo: <strong>{selected.objective}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

// Labels amigáveis dos posicionamentos
const PLACEMENT_LABELS: Record<string, string> = {
  fb_feed:         "Feed Facebook",
  fb_story:        "Stories Facebook",
  fb_reels:        "Reels Facebook",
  fb_instream:     "In-stream Facebook",
  fb_marketplace:  "Marketplace",
  fb_search:       "Busca Facebook",
  fb_right_column: "Coluna Direita",
  fb_audience_net: "Audience Network",
  ig_feed:         "Feed Instagram",
  ig_story:        "Stories Instagram",
  ig_reels:        "Reels Instagram",
  ig_explore:      "Explorar Instagram",
  ig_shop:         "Shop Instagram",
};
