/**
 * FineTuningFeedback.tsx
 *
 * Widget de feedback humano sobre a geração de uma campanha — alimenta
 * server/fineTuningService.ts via trpc.fineTuning.*.
 *
 * Design deliberadamente silencioso: se a tabela fine_tuning_examples
 * ainda não existir (migration não rodou) ou não houver exemplo pendente
 * para esta campanha, o componente não renderiza NADA — nunca quebra ou
 * polui a tela de resultado da campanha.
 *
 * Um exemplo é capturado por geração completa (todos os criativos juntos),
 * não por criativo individual — por isso o widget aparece uma vez no topo
 * da página, não em cada card de criativo.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function FineTuningFeedback({
  campaignId,
  projectId,
}: {
  campaignId: number;
  projectId: number;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [correctedText, setCorrectedText] = useState("");

  const pending = trpc.fineTuning.listPending.useQuery(
    { projectId },
    { enabled: !!projectId, retry: false },
  );

  const approveMutation = trpc.fineTuning.approve.useMutation({
    onSuccess: () => { toast.success("◎ Feedback registrado — obrigado!"); pending.refetch(); },
    onError:   (e: any) => toast.error(`✕ ${e.message}`),
  });
  const correctMutation = trpc.fineTuning.correct.useMutation({
    onSuccess: () => { toast.success("◎ Correção registrada — obrigado!"); setCorrecting(false); setCorrectedText(""); pending.refetch(); },
    onError:   (e: any) => toast.error(`✕ ${e.message}`),
  });
  const rejectMutation = trpc.fineTuning.reject.useMutation({
    onSuccess: () => { toast.success("Feedback registrado."); pending.refetch(); },
    onError:   (e: any) => toast.error(`✕ ${e.message}`),
  });

  // Silencioso em qualquer cenário que não seja "tenho um exemplo pendente
  // para aprovar" — tabela ausente, erro de rede, nada pendente, etc.
  if (pending.isLoading || pending.isError) return null;
  const example = (pending.data || []).find((e: any) => e.campaignId === campaignId);
  if (!example) return null;

  const busy = approveMutation.isPending || correctMutation.isPending || rejectMutation.isPending;

  return (
    <div style={{
      background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12,
      padding: "10px 14px", margin: "8px 0 4px", display: "flex",
      alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
        Essa geração ficou boa? Seu feedback ajuda a treinar o motor.
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => approveMutation.mutate({ id: example.id })}
          disabled={busy}
          style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", cursor: busy ? "wait" : "pointer", fontWeight: 600 }}>
          👍 Aprovar
        </button>
        <button
          onClick={() => setCorrecting((v) => !v)}
          disabled={busy}
          style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", cursor: busy ? "wait" : "pointer", fontWeight: 600 }}>
          ✏️ Corrigir
        </button>
        <button
          onClick={() => rejectMutation.mutate({ id: example.id })}
          disabled={busy}
          style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", cursor: busy ? "wait" : "pointer", fontWeight: 600 }}>
          👎 Rejeitar
        </button>
      </div>

      {correcting && (
        <div style={{ width: "100%", marginTop: 4 }}>
          <textarea
            value={correctedText}
            onChange={(e) => setCorrectedText(e.target.value)}
            placeholder="Descreva a versão correta (o que estava errado)..."
            style={{ width: "100%", minHeight: 70, fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "inherit" }}
          />
          <button
            onClick={() => {
              if (!correctedText.trim()) return;
              correctMutation.mutate({ id: example.id, correctedOutput: correctedText.trim() });
            }}
            disabled={correctMutation.isPending || !correctedText.trim()}
            style={{ marginTop: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "none", background: "#0f172a", color: "white", cursor: correctMutation.isPending ? "wait" : "pointer", fontWeight: 700 }}>
            {correctMutation.isPending ? "Enviando..." : "Enviar correção"}
          </button>
        </div>
      )}
    </div>
  );
}
