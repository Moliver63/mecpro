/**
 * BackButton.tsx — Botão padronizado de voltar
 * Uso: <BackButton to="/projetos" label="Projetos" />
 */
import { useLocation } from "wouter";

interface BackButtonProps {
  to:      string;
  label:   string;
  style?:  React.CSSProperties;
}

export default function BackButton({ to, label, style }: BackButtonProps) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(to)}
      style={{
        display:     "inline-flex",
        alignItems:  "center",
        gap:         6,
        padding:     "6px 14px",
        borderRadius: "var(--r-sm)",
        border:      "1.5px solid var(--border)",
        background:  "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        color:       "var(--muted)",
        fontSize:    12,
        fontWeight:  600,
        cursor:      "pointer",
        fontFamily:  "var(--font)",
        transition:  "all .15s var(--ease)",
        boxShadow:   "var(--shadow-xs)",
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color       = "var(--dark)";
        e.currentTarget.style.borderColor = "var(--border2)";
        e.currentTarget.style.background  = "white";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color       = "var(--muted)";
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background  = "var(--glass-bg)";
      }}
    >
      ← {label}
    </button>
  );
}
