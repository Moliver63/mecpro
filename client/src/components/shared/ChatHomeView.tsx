import { useState } from "react";
import { MessageSquarePlus, History } from "lucide-react";
import { useCampaignChat } from "@/hooks/useCampaignChat";
import ChatConversationView from "@/components/shared/ChatConversationView";
import ChatHistoryPanel from "@/components/shared/ChatHistoryPanel";

/**
 * ChatHomeView — o assistente de campanhas embutido como conteúdo
 * principal da tela inicial (/dashboard), no lugar de ficar só disponível
 * atrás de uma bolha flutuante. Mesma lógica (useCampaignChat) e mesma UI
 * (ChatConversationView) do widget flutuante em CampaignChat.tsx — só
 * muda o "invólucro": aqui fica dentro do layout normal da página
 * (respeitando header/navegação), não como overlay em tela cheia.
 *
 * Cabeçalho com "nova conversa" / histórico / última campanha — pedido de
 * Michel (13/09): salvar/excluir conversas, mostrar a última campanha
 * gerada, e restaurar a conversa automaticamente pra não repetir passos.
 */
export default function ChatHomeView() {
  const chat = useCampaignChat();
  const [historicoAberto, setHistoricoAberto] = useState(false);

  return (
    <div className="campaign-chat-home">
      <div className="campaign-chat-home-header">
        <span className="campaign-chat-home-titulo">💬 Assistente de campanhas</span>
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
      </div>

      {chat.ultimaCampanha && (
        <a href={chat.ultimaCampanha.url || "#"} className="campaign-chat-ultima-campanha">
          Última campanha gerada: <strong>{chat.ultimaCampanha.name}</strong>
        </a>
      )}

      <div className="campaign-chat-home-conteudo">
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
          velocidade={chat.velocidade}
          escolherVelocidade={chat.escolherVelocidade}
          videoAttachment={chat.videoAttachment}
          addVideoAttachment={chat.addVideoAttachment}
          removeVideoAttachment={chat.removeVideoAttachment}
          send={chat.send}
          scrollRef={chat.scrollRef}
        />
      </div>
    </div>
  );
}
