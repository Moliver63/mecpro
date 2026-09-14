import { useState } from "react";
import { Trash2, History, X } from "lucide-react";
import type { ChatSessionResumo } from "@/hooks/useCampaignChat";

function formatarData(iso: string): string {
  try {
    const d = new Date(iso);
    const agora = new Date();
    const mesmodia = d.toDateString() === agora.toDateString();
    if (mesmodia) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

interface ChatHistoryPanelProps {
  sessoes: ChatSessionResumo[];
  sessionIdAtual: number | null;
  onCarregar: (id: number) => void;
  onExcluir: (id: number) => void;
  onFechar: () => void;
}

/**
 * ChatHistoryPanel — painel flutuante com a lista de conversas salvas.
 * Cada item abre a conversa ao clicar e tem um botão de excluir (com
 * confirmação inline, pra evitar exclusão acidental com um clique só).
 */
export default function ChatHistoryPanel({ sessoes, sessionIdAtual, onCarregar, onExcluir, onFechar }: ChatHistoryPanelProps) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<number | null>(null);

  return (
    <div className="campaign-chat-history-panel">
      <div className="campaign-chat-history-header">
        <span>
          <History size={15} strokeWidth={2.2} /> Conversas salvas
        </span>
        <button type="button" onClick={onFechar} aria-label="Fechar histórico" title="Fechar">
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>

      {sessoes.length === 0 && (
        <p className="campaign-chat-history-vazio">Nenhuma conversa salva ainda.</p>
      )}

      <ul className="campaign-chat-history-lista">
        {sessoes.map((s) => (
          <li key={s.id} className={s.id === sessionIdAtual ? "ativa" : undefined}>
            {confirmandoExclusao === s.id ? (
              <div className="campaign-chat-history-confirmar">
                <span>Excluir esta conversa?</span>
                <button type="button" onClick={() => { onExcluir(s.id); setConfirmandoExclusao(null); }}>Excluir</button>
                <button type="button" onClick={() => setConfirmandoExclusao(null)}>Cancelar</button>
              </div>
            ) : (
              <>
                <button type="button" className="campaign-chat-history-item" onClick={() => onCarregar(s.id)}>
                  <span className="titulo">{s.title || "Nova conversa"}</span>
                  {s.lastCampaignName && <span className="campanha">✅ {s.lastCampaignName}</span>}
                  <span className="data">{formatarData(s.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="campaign-chat-history-excluir"
                  onClick={() => setConfirmandoExclusao(s.id)}
                  aria-label="Excluir conversa"
                  title="Excluir conversa"
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
