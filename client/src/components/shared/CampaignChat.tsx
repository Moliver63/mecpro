import { useEffect, useState } from "react";
import { useCampaignChat } from "@/hooks/useCampaignChat";
import ChatConversationView, { AvatarIA } from "@/components/shared/ChatConversationView";

/**
 * CampaignChat — bolha flutuante que abre o assistente de campanhas em
 * tela cheia, disponível em qualquer página. A tela inicial (/dashboard)
 * agora mostra o mesmo chat de forma embutida por padrão
 * (ChatHomeView.tsx) — esta bolha continua sendo a porta de entrada nas
 * demais páginas do site.
 *
 * Estado e lógica de envio vêm de useCampaignChat() — a mesma fonte usada
 * por ChatHomeView.tsx, pra não duplicar a lógica de rede/erro em dois
 * lugares que poderiam divergir com o tempo.
 *
 * Abertura programática (botões na landing):
 *   window.dispatchEvent(new Event("mecpro:open-chat"))
 */
export default function CampaignChat() {
  const [open, setOpen] = useState(false);
  const chat = useCampaignChat();

  // Botões na landing/abertura programática disparam o evento global
  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener("mecpro:open-chat", abrir);
    return () => window.removeEventListener("mecpro:open-chat", abrir);
  }, []);

  // ── Bolha flutuante (estado fechado) ─────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        // Botão usa env(safe-area-inset-bottom) — sem isso, fica posicionado
        // embaixo da barra do Safari/indicador de home do iPhone,
        // efetivamente invisível/inacessível em iOS. z-index elevado — o
        // widget de ajuda do WhatsApp usa 9999.
        className="fixed right-6 z-[9990] w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        style={{
          background: "linear-gradient(135deg, #4ade1a, #15803d)",
          bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
        }}
        title="Montar campanha no chat"
        aria-label="Abrir assistente de campanhas"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      </button>
    );
  }

  // ── Tela cheia estilo ChatGPT ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0d1117" }}>
      <header
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#0d1117" }}
      >
        <AvatarIA />
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">Assistente MecProAI</p>
          <p className="text-xs" style={{ color: "#4ade1a" }}>
            ● Online — monte sua campanha conversando
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-white/50 hover:text-white text-2xl leading-none px-2 py-1"
          aria-label="Fechar chat"
          title="Voltar ao site"
        >
          ×
        </button>
      </header>

      <div className="flex-1 min-h-0">
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
    </div>
  );
}
