import { useEffect, useState } from "react";
import { MessageCircle, X, MessageSquarePlus, History } from "lucide-react";
import { ASSISTANT_IMAGE, useCampaignChat } from "@/hooks/useCampaignChat";
import ChatConversationView, { AvatarIA } from "@/components/shared/ChatConversationView";
import ChatHistoryPanel from "@/components/shared/ChatHistoryPanel";

/**
 * CampaignChat — bolha flutuante que abre o assistente de campanhas em
 * tela cheia, disponível em qualquer página. A tela inicial também usa a
 * mesma conversa de forma embutida por ChatHomeView.
 */
export default function CampaignChat() {
  const [open, setOpen] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const chat = useCampaignChat();

  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener("mecpro:open-chat", abrir);
    return () => window.removeEventListener("mecpro:open-chat", abrir);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="campaign-chat-fab"
        title="Montar campanha no chat"
        aria-label="Abrir assistente de campanhas"
      >
        <img src={ASSISTANT_IMAGE} alt="" />
        <MessageCircle className="campaign-chat-fab-icon" size={18} strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <div className="campaign-chat-shell" role="dialog" aria-modal="true" aria-label="Assistente MecProAI">
      <header className="campaign-chat-header">
        <AvatarIA />
        <div className="campaign-chat-header-copy">
          <strong>Assistente MecProAI</strong>
          <span>Online - monte sua campanha conversando</span>
        </div>
        <div className="campaign-chat-header-actions">
          <button
            type="button"
            onClick={() => chat.novaConversa()}
            className="campaign-chat-header-btn"
            aria-label="Nova conversa"
            title="Nova conversa"
          >
            <MessageSquarePlus size={17} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            className="campaign-chat-header-btn"
            aria-label="Ver conversas salvas"
            title="Conversas salvas"
          >
            <History size={17} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="campaign-chat-close"
            aria-label="Fechar chat"
            title="Voltar ao painel"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>
        {historicoAberto && (
          <ChatHistoryPanel
            sessoes={chat.sessoes}
            sessionIdAtual={chat.sessionId}
            onCarregar={(id) => { chat.carregarConversa(id); setHistoricoAberto(false); }}
            onExcluir={(id) => chat.excluirSessao(id)}
            onFechar={() => setHistoricoAberto(false)}
          />
        )}
      </header>

      {chat.ultimaCampanha && (
        <a href={chat.ultimaCampanha.url || "#"} className="campaign-chat-ultima-campanha">
          Última campanha gerada: <strong>{chat.ultimaCampanha.name}</strong>
        </a>
      )}

      <ChatConversationView
        messages={chat.messages}
        loading={chat.loading}
        needsLogin={chat.needsLogin}
        mostrarSugestoes={chat.mostrarSugestoes}
        input={chat.input}
        setInput={chat.setInput}
        attachments={chat.attachments}
        addAttachments={chat.addAttachments}
        removeAttachment={chat.removeAttachment}
        attachmentError={chat.attachmentError}
        videoAttachment={chat.videoAttachment}
        addVideoAttachment={chat.addVideoAttachment}
        removeVideoAttachment={chat.removeVideoAttachment}
        send={chat.send}
        scrollRef={chat.scrollRef}
        fullScreen
      />
    </div>
  );
}
