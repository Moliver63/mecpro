import { useState, useEffect, useRef } from "react";

/**
 * useCampaignChat — lógica compartilhada do assistente de campanhas via
 * chat. Extraída de CampaignChat.tsx pra ser reaproveitada tanto pelo
 * widget flutuante (disponível em qualquer página) quanto pela versão
 * embutida na tela inicial (ChatHomeView.tsx) — uma fonte só de verdade
 * pra estado/envio, sem duplicar a lógica de rede/erro em dois lugares
 * que poderiam divergir com o tempo.
 *
 * Contrato com o backend (inalterado):
 *   POST /api/chat  { mensagens: [{ role, content }] }
 *   → 200 { resposta: string, campanha: { id, name, projectId, url } | null, modo }
 *   → 401 { erro: "login_required" }  → exibe CTA de login
 *   → 429 { erro: "rate_limit" }
 */

export interface CampanhaGerada {
  id: number;
  name: string;
  projectId: number;
  url: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  campanha?: CampanhaGerada;
}

interface RespostaChat {
  resposta: string;
  campanha: CampanhaGerada | null;
  modo: "assistente" | "local";
}

export const MENSAGEM_INICIAL: ChatMessage = {
  role: "assistant",
  content:
    "Me conta sobre o seu negócio e eu monto a campanha pra você. " +
    "Qual é o nome do cliente/negócio e o que você vende?",
};

export const SUGESTOES = [
  "Quero uma campanha de leads para meu negócio",
  "Tenho uma loja de roupas e quero mais vendas",
  "Monte uma campanha para minha clínica odontológica em São Paulo",
  "Como vocês definem o orçamento da campanha?",
];

export const ASSISTANT_IMAGE = "/mecproai-assistant.jpg";

export function useCampaignChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Rola pro fim a cada mensagem nova
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const send = async (textoOverride?: string) => {
    const texto = (textoOverride ?? input).trim();
    if (!texto || loading) return;

    // needsLogin é resetado a cada nova tentativa (reset otimista) — sem
    // isso, o aviso de login ficaria colado pra sempre depois de setado
    // uma vez, mesmo após o usuário logar de novo e voltar a conversar.
    setNeedsLogin(false);

    const historico: ChatMessage[] = [...messages, { role: "user", content: texto }];
    setInput("");
    setMessages(historico);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mensagens: historico.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.status === 401) {
        setNeedsLogin(true);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Para gerar campanhas eu preciso que você esteja logado. Entre na sua conta e continue de onde parou.",
          },
        ]);
        return;
      }

      const data = (await res.json()) as Partial<RespostaChat> & { mensagem?: string };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.mensagem || "Não consegui processar agora. Tente novamente em instantes." },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.resposta?.trim() || "Pronto! Sua campanha foi gerada.",
          campanha: data.campanha || undefined,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro de conexão. Verifique sua internet e tente de novo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const mostrarSugestoes = !loading && messages.length <= 1;

  return { messages, input, setInput, loading, needsLogin, send, mostrarSugestoes, scrollRef };
}
