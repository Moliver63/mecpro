import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { ASSISTANT_IMAGE, useCampaignChat } from "@/hooks/useCampaignChat";
import ChatConversationView, { AvatarIA } from "@/components/shared/ChatConversationView";

/**
 * CampaignChat — bolha flutuante que abre o assistente de campanhas em
 * tela cheia, disponível em qualquer página. A tela inicial também usa a
 * mesma conversa de forma embutida por ChatHomeView.
 */
export default function CampaignChat() {
  const [open, setOpen] = useState(false);
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
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="campaign-chat-close"
          aria-label="Fechar chat"
          title="Voltar ao painel"
        >
          <X size={20} strokeWidth={2.2} />
        </button>
      </header>

      <ChatConversationView
        messages={chat.messages}
        loading={chat.loading}
        needsLogin={chat.needsLogin}
        mostrarSugestoes={chat.mostrarSugestoes}
        input={chat.input}
        setInput={chat.setInput}
        send={chat.send}
        scrollRef={chat.scrollRef}
        fullScreen
      />
    </div>
  );
}
