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

// Achado real (pedido de Michel, 13/09): vídeo não cabe no mesmo modelo
// das fotos (base64 dentro do JSON da mensagem) — um vídeo de poucos
// segundos já passa fácil de 20-50mb, o que deixaria a requisição do
// chat gigante e lenta. Em vez disso, o vídeo é enviado assim que
// escolhido (upload multipart pra /api/chat/upload-video, que sobe pro
// Cloudinary) e só a URL resultante entra na mensagem — status rastreia
// o progresso desse upload separado na interface.
export interface ChatVideoAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: "uploading" | "done" | "error";
  videoUrl?: string;
  erro?: string;
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
  sessionId?: number | null;
}

export interface ChatSessionResumo {
  id: number;
  title: string;
  lastCampaignId: number | null;
  lastCampaignName: string | null;
  lastCampaignUrl: string | null;
  createdAt: string;
  updatedAt: string;
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

// Achado real (pedido de Michel, 13/09): "salvar/excluir chats" + "mostrar
// a última campanha gerada" + "memória pra não repetir passos" — só o
// sessionId fica no localStorage (nunca o conteúdo da conversa), pra
// restaurar automaticamente ao recarregar a página sem guardar dados
// sensíveis no navegador.
const CHAVE_SESSAO_LOCAL = "mecpro_chat_session_id";

const MAX_CHAT_IMAGES = 10;
const MAX_CHAT_IMAGE_BYTES = 6 * 1024 * 1024;
const ACCEPTED_CHAT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MAX_CHAT_VIDEO_BYTES = 100 * 1024 * 1024; // mesmo limite do servidor (multer)
const ACCEPTED_CHAT_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska"]);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

export function useCampaignChat() {
  const sending = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessoes, setSessoes] = useState<ChatSessionResumo[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Rola pro fim a cada mensagem nova
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const carregarSessoes = async () => {
    try {
      const res = await fetch("/api/chat/sessions", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setSessoes(Array.isArray(data?.sessoes) ? data.sessoes : []);
    } catch {
      // silencioso — lista de histórico é conveniência, não bloqueia o chat
    }
  };

  const carregarConversa = async (id: number) => {
    setCarregandoHistorico(true);
    try {
      const res = await fetch(`/api/chat/sessions/${id}/messages`, { credentials: "include" });
      if (!res.ok) {
        // sessão não existe mais (ex: excluída em outra aba) — começa do zero
        localStorage.removeItem(CHAVE_SESSAO_LOCAL);
        setSessionId(null);
        setMessages([MENSAGEM_INICIAL]);
        return;
      }
      const data = await res.json();
      const carregadas: ChatMessage[] = (Array.isArray(data?.mensagens) ? data.mensagens : []).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
        campanha: m.campanha || undefined,
      }));
      setMessages(carregadas.length ? carregadas : [MENSAGEM_INICIAL]);
      setSessionId(id);
      localStorage.setItem(CHAVE_SESSAO_LOCAL, String(id));
    } catch {
      // conexão falhou — mantém o que já estava na tela
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const novaConversa = () => {
    localStorage.removeItem(CHAVE_SESSAO_LOCAL);
    setSessionId(null);
    setMessages([MENSAGEM_INICIAL]);
    setInput("");
    setAttachments([]);
    setAttachmentError("");
    setVideoAttachment(null);
    setNeedsLogin(false);
  };

  const excluirSessao = async (id: number) => {
    try {
      const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) return false;
      setSessoes((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) novaConversa();
      return true;
    } catch {
      return false;
    }
  };

  // Restaura a conversa automaticamente ao carregar a página — resolve o
  // "ficar repetindo passos": sem isso, um reload perdia tudo que já tinha
  // sido conversado/confirmado com o usuário.
  useEffect(() => {
    const salva = localStorage.getItem(CHAVE_SESSAO_LOCAL);
    const id = salva ? Number(salva) : NaN;
    if (Number.isFinite(id) && id > 0) carregarConversa(id);
    carregarSessoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Última campanha gerada pelo usuário via chat, entre todas as
  // conversas (sessoes já vem ordenada por mais recente primeiro).
  const sessaoComCampanha = sessoes.find((s) => s.lastCampaignId);
  const ultimaCampanha = sessaoComCampanha
    ? { id: sessaoComCampanha.lastCampaignId as number, name: sessaoComCampanha.lastCampaignName as string, url: sessaoComCampanha.lastCampaignUrl || "" }
    : null;

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

  // Um vídeo por vez (diferente das fotos, que aceitam várias) — o upload
  // já acontece aqui, assim que o arquivo é escolhido, não só quando a
  // mensagem é enviada.
  const [videoAttachment, setVideoAttachment] = useState<ChatVideoAttachment | null>(null);

  const addVideoAttachment = async (file: File) => {
    if (!ACCEPTED_CHAT_VIDEO_TYPES.has(file.type)) {
      setVideoAttachment({ id: crypto.randomUUID(), fileName: file.name, mimeType: file.type, size: file.size, status: "error", erro: "Formato não suportado. Use MP4, MOV, WEBM, AVI ou MKV." });
      return;
    }
    if (file.size > MAX_CHAT_VIDEO_BYTES) {
      setVideoAttachment({ id: crypto.randomUUID(), fileName: file.name, mimeType: file.type, size: file.size, status: "error", erro: "Vídeo muito grande — o limite é 100MB." });
      return;
    }
    const id = crypto.randomUUID();
    setVideoAttachment({ id, fileName: file.name, mimeType: file.type, size: file.size, status: "uploading" });
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/chat/upload-video", { method: "POST", credentials: "include", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.videoUrl) {
        setVideoAttachment({ id, fileName: file.name, mimeType: file.type, size: file.size, status: "error", erro: data?.erro || "Não foi possível enviar o vídeo." });
        return;
      }
      setVideoAttachment({ id, fileName: file.name, mimeType: file.type, size: file.size, status: "done", videoUrl: data.videoUrl });
    } catch {
      setVideoAttachment({ id, fileName: file.name, mimeType: file.type, size: file.size, status: "error", erro: "Erro de conexão ao enviar o vídeo." });
    }
  };

  const removeVideoAttachment = () => setVideoAttachment(null);

  const send = async (textoOverride?: string) => {
    const texto = (textoOverride ?? input).trim();
    if ((!texto && attachments.length === 0) || sending.current) return;
    sending.current = true;

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
          sessionId,
          attachments: anexosDoTurno.map((file) => ({
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size,
            imageBase64: file.dataUrl,
          })),
          videoUrl: videoAttachment?.status === "done" ? videoAttachment.videoUrl : undefined,
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

      const data = (await res.json()) as Partial<RespostaChat> & { mensagem?: string; erro?: string };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.mensagem || data.erro || "Não consegui processar agora. Tente novamente em instantes." },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.resposta?.trim() || (data.campanha ? `Rascunho criado: ${data.campanha.name} (#${data.campanha.id}).` : "Nao recebi uma resposta conclusiva. Nenhuma criacao foi confirmada nesta resposta."),
          campanha: data.campanha || undefined,
        },
      ]);
      if (data.campanha) setAttachments([]);
      // Vídeo é anexo de "uma vez só" (diferente de fotos, que podem se
      // acumular por algumas mensagens até a campanha ser gerada) — já
      // foi enviado nesta troca, não faz sentido reenviar na próxima.
      if (videoAttachment?.status === "done") setVideoAttachment(null);
      // Sessão criada/confirmada pelo servidor nesta troca — salva pra
      // sobreviver a um recarregamento de página, e atualiza a lista
      // (título/última campanha podem ter mudado nesta troca).
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(CHAVE_SESSAO_LOCAL, String(data.sessionId));
      }
      carregarSessoes();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro de conexão. Verifique sua internet e tente de novo." },
      ]);
    } finally {
      sending.current = false;
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
    videoAttachment,
    addVideoAttachment,
    removeVideoAttachment,
    loading,
    needsLogin,
    send,
    mostrarSugestoes,
    scrollRef,
    sessionId,
    sessoes,
    carregandoHistorico,
    ultimaCampanha,
    novaConversa,
    carregarConversa,
    excluirSessao,
  };
}
