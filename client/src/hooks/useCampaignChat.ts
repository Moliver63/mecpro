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

export interface ChatImageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  campanha?: CampanhaGerada;
  attachments?: ChatImageAttachment[];
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

const MAX_CHAT_IMAGES = 10;
const MAX_CHAT_IMAGE_BYTES = 6 * 1024 * 1024;
const ACCEPTED_CHAT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

export function useCampaignChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Rola pro fim a cada mensagem nova
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const addAttachments = async (files: FileList | File[]) => {
    setAttachmentError("");
    const selected = Array.from(files).filter(Boolean);
    const availableSlots = Math.max(0, MAX_CHAT_IMAGES - attachments.length);
    const accepted = selected.slice(0, availableSlots);

    if (selected.length > availableSlots) {
      setAttachmentError(`O chat aceita até ${MAX_CHAT_IMAGES} fotos por campanha.`);
    }

    const next: ChatImageAttachment[] = [];
    for (const file of accepted) {
      if (!ACCEPTED_CHAT_IMAGE_TYPES.has(file.type)) {
        setAttachmentError("Envie apenas imagens nos formatos JPEG, PNG ou WEBP.");
        continue;
      }
      if (file.size > MAX_CHAT_IMAGE_BYTES) {
        setAttachmentError(`A foto "${file.name}" excede 6MB. Comprima antes de anexar.`);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
      });
    }

    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, MAX_CHAT_IMAGES));
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const send = async (textoOverride?: string) => {
    const texto = (textoOverride ?? input).trim();
    if ((!texto && attachments.length === 0) || loading) return;

    // needsLogin é resetado a cada nova tentativa (reset otimista) — sem
    // isso, o aviso de login ficaria colado pra sempre depois de setado
    // uma vez, mesmo após o usuário logar de novo e voltar a conversar.
    setNeedsLogin(false);

    const userContent = texto || `Use as ${attachments.length} foto(s) anexadas para montar a campanha.`;
    const anexosDoTurno = attachments;
    const anexosJaMostrados = new Set(messages.flatMap((m) => m.attachments?.map((file) => file.id) || []));
    const anexosParaExibir = anexosDoTurno.filter((file) => !anexosJaMostrados.has(file.id));
    const historico: ChatMessage[] = [
      ...messages,
      { role: "user", content: userContent, attachments: anexosParaExibir.length ? anexosParaExibir : undefined },
    ];
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
          attachments: anexosDoTurno.map((file) => ({
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size,
            imageBase64: file.dataUrl,
          })),
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
      if (data.campanha) setAttachments([]);
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

  return {
    messages,
    input,
    setInput,
    attachments,
    addAttachments,
    removeAttachment,
    attachmentError,
    loading,
    needsLogin,
    send,
    mostrarSugestoes,
    scrollRef,
  };
}
