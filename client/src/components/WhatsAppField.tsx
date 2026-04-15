/**
 * WhatsAppField.tsx
 *
 * Campo reutilizável para adicionar/validar WhatsApp vinculado à conta Meta.
 * Usado em:
 *   - MetaIntegration (configurações)
 *   - CampaignResult (tela de publicação)
 *   - ClientProfile (cadastro do projeto)
 *
 * Props:
 *   value       — número atual (ex: "+5547999999999" ou "47999999999")
 *   onChange    — callback quando número muda
 *   pageId      — ID da página FB para validar vínculo (opcional)
 *   onSaved     — callback após salvar com sucesso
 *   compact     — versão menor para usar dentro de modais
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  value:    string;
  onChange: (v: string) => void;
  pageId?:  string;
  onSaved?: (phone: string, waUrl: string, linked: boolean) => void;
  compact?: boolean;
  label?:   string;
}

export default function WhatsAppField({ value, onChange, pageId, onSaved, compact, label }: Props) {
  const [checking,  setChecking]  = useState(false);
  const [status,    setStatus]    = useState<"idle" | "linked" | "saved" | "error">("idle");
  const [linkedPage, setLinkedPage] = useState("");

  const saveMutation = (trpc as any).integrations?.saveWhatsApp?.useMutation?.({
    onSuccess: (data: any) => {
      setChecking(false);
      if (data.linked) {
        setStatus("linked");
        setLinkedPage(data.linkedPageName || "");
        toast.success(`✅ WhatsApp +${data.phone} vinculado${data.linkedPageName ? ` à página "${data.linkedPageName}"` : ""}!`);
      } else {
        setStatus("saved");
        if (data.warning) {
          toast.warning(`⚠️ ${data.warning}`);
        } else {
          toast.success(`✅ WhatsApp salvo: ${data.phone}`);
        }
      }
      onSaved?.(data.phone, data.waUrl, data.linked);
    },
    onError: (e: any) => {
      setChecking(false);
      setStatus("error");
      toast.error(e.message);
    },
  }) ?? { mutate: () => {}, isPending: false };

  function handleSave() {
    if (!value.trim()) { toast.error("Digite o número do WhatsApp"); return; }
    const digits = value.replace(/\D/g, "");
    if (digits.length < 8) { toast.error("Número inválido — mínimo 8 dígitos"); return; }
    setChecking(true);
    setStatus("idle");
    (saveMutation as any).mutate({ phone: value.trim(), pageId: pageId || undefined });
  }

  // Formata número enquanto digita
  function handleChange(raw: string) {
    setStatus("idle");
    onChange(raw);
  }

  const digits = value.replace(/\D/g, "");
  const previewUrl = digits.length >= 8
    ? `https://wa.me/${digits.startsWith("55") ? digits : "55" + digits}`
    : null;

  const statusColors = {
    idle:   { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b" },
    linked: { bg: "#f0fdf4", border: "#86efac", text: "#059669" },
    saved:  { bg: "#eff6ff", border: "#93c5fd", text: "#2563eb" },
    error:  { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626" },
  };
  const sc = statusColors[status];

  return (
    <div style={{ width: "100%" }}>
      {label !== undefined && (
        <label style={{
          fontSize: 12, fontWeight: 700, color: "var(--black, #0f172a)",
          display: "block", marginBottom: 6,
        }}>
          {label || "WhatsApp para Anúncios"}
        </label>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        {/* Input do número */}
        <div style={{ flex: 1, position: "relative" }}>
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: compact ? 14 : 16, lineHeight: 1,
          }}>
            📱
          </span>
          <input
            value={value}
            onChange={e => handleChange(e.target.value)}
            placeholder="(47) 99999-9999"
            onKeyDown={e => e.key === "Enter" && handleSave()}
            style={{
              width: "100%", padding: compact ? "8px 12px 8px 36px" : "10px 14px 10px 40px",
              borderRadius: 10, fontSize: compact ? 13 : 14,
              border: `1.5px solid ${status !== "idle" ? sc.border : "#e2e8f0"}`,
              background: status !== "idle" ? sc.bg : "#fff",
              color: "#0f172a", outline: "none",
              transition: "border-color .15s",
            }}
          />
        </div>

        {/* Botão salvar/validar */}
        <button
          onClick={handleSave}
          disabled={checking || (saveMutation as any).isPending}
          style={{
            padding: compact ? "8px 14px" : "10px 18px",
            borderRadius: 10, border: "none", cursor: "pointer",
            background: checking
              ? "#e2e8f0"
              : status === "linked"
                ? "linear-gradient(135deg,#059669,#10b981)"
                : "linear-gradient(135deg,#25d366,#128c7e)",
            color: checking ? "#94a3b8" : "#fff",
            fontSize: compact ? 11 : 12, fontWeight: 700,
            whiteSpace: "nowrap", transition: "all .15s",
            flexShrink: 0,
          }}
        >
          {checking
            ? "⏳ Validando..."
            : status === "linked"
              ? "✅ Vinculado"
              : status === "saved"
                ? "💾 Salvo"
                : "💾 Salvar"}
        </button>
      </div>

      {/* Status e preview */}
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {status === "linked" && (
          <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>
            ✅ Vinculado{linkedPage ? ` à página "${linkedPage}"` : " na Meta"}
          </span>
        )}
        {status === "saved" && (
          <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>
            💾 Salvo — vincule no{" "}
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2563eb" }}
            >
              Meta Business Manager
            </a>
            {" "}para usar em anúncios
          </span>
        )}
        {status === "idle" && previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#25d366", fontWeight: 600, textDecoration: "none" }}
          >
            🔗 Testar link wa.me
          </a>
        )}
        {!compact && status === "idle" && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            Pressione Enter ou clique em Salvar para validar
          </span>
        )}
      </div>
    </div>
  );
}
