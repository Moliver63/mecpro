import { useCampaignChat } from "@/hooks/useCampaignChat";
import ChatConversationView from "@/components/shared/ChatConversationView";

/**
 * ChatHomeView — o assistente de campanhas embutido como conteúdo
 * principal da tela inicial (/dashboard), no lugar de ficar só disponível
 * atrás de uma bolha flutuante. Mesma lógica (useCampaignChat) e mesma UI
 * (ChatConversationView) do widget flutuante em CampaignChat.tsx — só
 * muda o "invólucro": aqui fica dentro do layout normal da página
 * (respeitando header/navegação), não como overlay em tela cheia.
 *
 * Altura calculada pra caber no espaço restante da viewport depois do
 * cabeçalho/navegação do Layout — sem isso, o campo de texto no rodapé
 * ficaria empurrado pra fora da tela em vez de fixo na base da área de
 * conversa.
 */
export default function ChatHomeView() {
  const chat = useCampaignChat();

  return (
    <div className="campaign-chat-home">
      <ChatConversationView
        messages={chat.messages}
        loading={chat.loading}
        needsLogin={chat.needsLogin}
        mostrarSugestoes={chat.mostrarSugestoes}
        input={chat.input}
        setInput={chat.setInput}
        send={chat.send}
        scrollRef={chat.scrollRef}
      />
    </div>
  );
}
