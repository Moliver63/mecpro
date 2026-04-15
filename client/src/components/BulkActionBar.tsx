/**
 * BulkActionBar.tsx
 * Barra flutuante de ações em massa para campanhas.
 * Aparece quando há itens selecionados.
 */

interface Props {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearAll: () => void;
  onPause: () => void;
  onDelete: () => void;
  loading?: boolean;
  platform: "google" | "meta" | "tiktok";
}

const PLATFORM_COLORS: Record<string, string> = {
  google:  "linear-gradient(135deg,#4285f4,#34a853)",
  meta:    "linear-gradient(135deg,#1877f2,#e1306c)",
  tiktok:  "linear-gradient(135deg,#ff0050,#010101)",
};

export default function BulkActionBar({
  selectedCount, totalCount, onSelectAll, onClearAll,
  onPause, onDelete, loading, platform,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      zIndex: 1500, display: "flex", alignItems: "center", gap: 12,
      background: "#0f172a", borderRadius: 16, padding: "12px 20px",
      boxShadow: "0 8px 32px rgba(0,0,0,.35)",
      border: "1px solid rgba(255,255,255,.1)",
      animation: "slideUp .2s ease",
      minWidth: 420,
    }}>
      <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity:0 } to { transform: translateX(-50%) translateY(0); opacity:1 } }`}</style>

      {/* Badge selecionados */}
      <div style={{
        background: PLATFORM_COLORS[platform], borderRadius: 8,
        padding: "4px 12px", fontSize: 13, fontWeight: 800, color: "#fff",
        whiteSpace: "nowrap",
      }}>
        {selectedCount} selecionada{selectedCount !== 1 ? "s" : ""}
      </div>

      {/* Selecionar tudo / limpar */}
      <div style={{ display: "flex", gap: 6 }}>
        {selectedCount < totalCount ? (
          <button onClick={onSelectAll} style={{
            background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)",
            borderRadius: 8, padding: "5px 12px", fontSize: 12, color: "#e2e8f0",
            cursor: "pointer", fontWeight: 600,
          }}>
            Selecionar todas ({totalCount})
          </button>
        ) : (
          <button onClick={onClearAll} style={{
            background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)",
            borderRadius: 8, padding: "5px 12px", fontSize: 12, color: "#e2e8f0",
            cursor: "pointer", fontWeight: 600,
          }}>
            Limpar seleção
          </button>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Pausar */}
      <button
        onClick={onPause}
        disabled={loading}
        style={{
          background: "#f59e0b", border: "none", borderRadius: 8,
          padding: "7px 16px", fontSize: 13, fontWeight: 700,
          color: "#0f172a", cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1, whiteSpace: "nowrap",
        }}
      >
        ⏸️ Pausar
      </button>

      {/* Excluir */}
      <button
        onClick={onDelete}
        disabled={loading}
        style={{
          background: "#ef4444", border: "none", borderRadius: 8,
          padding: "7px 16px", fontSize: 13, fontWeight: 700,
          color: "#fff", cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1, whiteSpace: "nowrap",
        }}
      >
        🗑️ Excluir
      </button>

      {/* Fechar */}
      <button onClick={onClearAll} style={{
        background: "none", border: "none", color: "#94a3b8",
        fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1,
      }}>×</button>
    </div>
  );
}
