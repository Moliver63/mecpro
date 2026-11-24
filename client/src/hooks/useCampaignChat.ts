import { useState, useEffect, useRef } from "react";
import { estaAcompanhandoOFim } from "@/lib/chatScroll";
import { LIMITES_PADRAO, classificarArquivo, separarArquivos, subirAnexo, type LimitesDeMidia } from "@/lib/chatUploads";

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
  // Achado real (achados colados por Michel, 14/09): antes, a foto só
  // virava base64 em memória e só era persistida (Cloudinary) quando a
  // mensagem inteira era enviada — perdida silenciosamente em qualquer
  // recarregamento antes disso. Agora sobe pro Cloudinary assim que
  // escolhida (mesmo padrão já usado pro vídeo) — dataUrl continua
  // existindo só pra preview instantâneo local, photoUrl é a referência
  // persistida de verdade.
  status: "uploading" | "done" | "error";
  /** 0-100, progresso real do envio. */
  progresso?: number;
  photoUrl?: string;
  erro?: string;
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
  progresso?: number;
  videoUrl?: string;
  /** Pre-visualizacao local (object URL) enquanto envia; depois vale a videoUrl. */
  previewUrl?: string;
  duracaoS?: number;
  proporcao?: string;
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
// Achado real (pedido de Michel, 16/09): "precisamos de velocidade, o
// usuario precisar de a opcao lenta, media e rapida de resposta" —
// persistida no navegador (preferência do usuário, não da conversa
// específica) pra não precisar escolher de novo toda vez que abre o chat.
const CHAVE_VELOCIDADE_LOCAL = "mecpro_chat_velocidade";
export type ChatVelocidade = "rapida" | "media" | "lenta";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

export interface CorteSugerido { formato: "stories" | "feed" | "square"; rotulo: string; usos: string; inicioS: number; fimS: number; duracaoS: number; modo: string; pontuacao: number | null; motivo: string; previaUrl: string | null; previaErro: string | null }
export interface PropostaDeCortes { id: string; status: "proposta" | "aprovada" | "rejeitada" | "processada"; videoUrl: string; limitacoes: string[]; analise: { duracaoS: number; cenas: number; cenasAvaliadas: number; provedorDeVisao: string | null }; cortes: CorteSugerido[] }

export function useCampaignChat() {
  const sending = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState("");
  const [velocidade, setVelocidade] = useState<ChatVelocidade>(() => {
    const salva = typeof window !== "undefined" ? localStorage.getItem(CHAVE_VELOCIDADE_LOCAL) : null;
    return salva === "rapida" || salva === "lenta" ? salva : "media";
  });
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [videoAttachments, setVideoAttachments] = useState<ChatVideoAttachment[]>([]);
  const [limites, setLimites] = useState<LimitesDeMidia>(LIMITES_PADRAO);
  // A sessao precisa ser lida NA HORA de cada envio (estado de render fica velho dentro de um laco de uploads).
  const sessaoRef = useRef<number | null>(null);
  const cancelamentos = useRef(new Map<string, () => void>());
  // Estado mais recente para decisoes assincronas (o closure de um envio em andamento enxerga um render antigo).
  const anexosRef = useRef<{ fotos: ChatImageAttachment[]; videos: ChatVideoAttachment[] }>({ fotos: [], videos: [] });
  anexosRef.current = { fotos: attachments, videos: videoAttachments };
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [sessionId, setSessionIdState] = useState<number | null>(null);
  const setSessionId = (id: number | null) => { sessaoRef.current = id; setSessionIdState(id); };
  const [sessoes, setSessoes] = useState<ChatSessionResumo[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Rolagem do chat.
   *
   * Pedido do Michel (15/10): "a seta para rolar melhor e ver as mensagens".
   *
   * O que havia: `el.scrollTop = el.scrollHeight` num efeito disparado por
   * `[messages, loading]`. Ou seja, o chat era jogado pro fim a cada mensagem
   * nova E a cada vez que o `loading` mudava — mesmo que a pessoa tivesse
   * rolado pra cima pra reler algo. Ler uma resposta anterior enquanto outra
   * chegava era impossivel: o scroll voltava sozinho.
   *
   * E, uma vez la em cima, nao havia como voltar pro fim sem arrastar.
   *
   * Agora: so rola sozinho se a pessoa ESTAVA acompanhando o fim. Se ela subiu,
   * fica onde esta e aparece a seta pra voltar, com contagem do que chegou
   * enquanto ela lia.
   */
  const [longeDoFim, setLongeDoFim] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const acompanhandoOFim = useRef(true);
  const temConversa = messages.length > 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const aoRolar = () => {
      const noFim = estaAcompanhandoOFim(el);
      acompanhandoOFim.current = noFim;
      setLongeDoFim(!noFim);
      if (noFim) setNaoLidas(0);
    };
    el.addEventListener("scroll", aoRolar, { passive: true });
    aoRolar();
    return () => el.removeEventListener("scroll", aoRolar);
    // Reatacha quando a view da conversa aparece: antes da primeira mensagem o
    // elemento nao esta montado e o listener nao teria onde entrar.
  }, [temConversa]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (acompanhandoOFim.current) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    // Chegou algo enquanto a pessoa lia mais acima: avisa em vez de arrastar.
    setNaoLidas((n) => n + 1);
  }, [messages]);

  // `loading` nao conta como mensagem nova: o "digitando" nao pode somar no
  // contador nem puxar o scroll de quem subiu.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && acompanhandoOFim.current) el.scrollTop = el.scrollHeight;
  }, [loading]);

  const irParaUltima = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    acompanhandoOFim.current = true;
    setLongeDoFim(false);
    setNaoLidas(0);
  };

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

  // Cortes sugeridos pela IA aguardando o OK do usuario (previas leves; nada final foi processado).
  const [cortes, setCortes] = useState<PropostaDeCortes[]>([]);
  const carregarCortes = async (id: number | null) => {
    if (!id) { setCortes([]); return; }
    try {
      const res = await fetch(`/api/chat/sessions/${id}/cortes`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setCortes(Array.isArray(data?.propostas) ? data.propostas.filter((p: PropostaDeCortes) => p.status === "proposta") : []);
    } catch { /* sem cortes pendentes na tela; a conversa segue normal */ }
  };
  // A aprovacao e um clique do usuario, enviado direto ao servidor (o modelo nao aprova). Depois avisa o chat para processar.
  const decidirCortes = async (id: string, acao: "aprovar" | "rejeitar", formatos?: string[]) => {
    try {
      const res = await fetch(`/api/chat/cortes/${id}/${acao}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formatos }) });
      if (!res.ok) { setAttachmentError("Essa sugestão de corte expirou. Peça novas sugestões."); setCortes((c) => c.filter((p) => p.id !== id)); return; }
    } catch { setAttachmentError("Não consegui registrar sua decisão agora. Tente de novo."); return; }
    setCortes((c) => c.filter((p) => p.id !== id));
    if (acao === "aprovar") await send(`Aprovei os cortes sugeridos${formatos?.length ? ` (formatos: ${formatos.join(", ")})` : ""}. Processe os vídeos nos formatos aprovados.`);
    else await send("Recusei esses cortes. Sugira outros trechos ou me pergunte o que prefere.");
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
      void carregarCortes(id);
      // Achado real (achados colados por Michel, 14/09): sem isso, um
      // recarregamento de página perdia as fotos já enviadas nesta
      // conversa mesmo com o upload já persistido no Cloudinary — o
      // usuário precisava reenviar tudo de novo. pendingPhotoUrls (ver
      // db.addPendingChatPhoto) sobrevive no servidor; aqui só restaura
      // pro estado local pra aparecer de novo na bandeja de anexos.
      const todosPendentes = Array.isArray(data?.sessao?.pendingPhotoUrls) ? data.sessao.pendingPhotoUrls : [];
      // Videos guardados na sessao (kind:"video") voltam como videoAttachment, nao como foto.
      const videosGuardados = todosPendentes.filter((p: { kind?: string }) => p?.kind === "video") as Array<{ url: string; fileName: string }>;
      setVideoAttachments(videosGuardados.slice(-limites.videosPorMensagem).map((v, i) => ({ id: `restaurado-${id}-${i}-${v.url}`, fileName: v.fileName || "video", mimeType: "video/mp4", size: 0, status: "done" as const, progresso: 100, videoUrl: v.url, previewUrl: v.url })));
      const pendentes = todosPendentes.filter((p: { kind?: string }) => p?.kind !== "video");
      if (pendentes.length) {
        setAttachments(pendentes.map((p: { url: string; fileName: string }, i: number) => ({
          id: `restaurada-${id}-${i}-${p.url}`,
          fileName: p.fileName || `foto-${i + 1}`,
          mimeType: "image/jpeg",
          size: 0,
          dataUrl: p.url,
          status: "done" as const,
          progresso: 100,
          photoUrl: p.url,
        })));
      } else {
        setAttachments([]);
      }
    } catch {
      // conexão falhou — mantém o que já estava na tela
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const novaConversa = () => {
    setCortes([]);
    localStorage.removeItem(CHAVE_SESSAO_LOCAL);
    setSessionId(null);
    setMessages([MENSAGEM_INICIAL]);
    setInput("");
    setAttachments([]);
    setAttachmentError("");
    setVideoAttachments([]);
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

  // Limites tecnicos vem do servidor (configuraveis por ambiente); se falhar, vale o padrao.
  useEffect(() => {
    fetch("/api/chat/media-limits", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.fotoBytes > 0 && d.videoBytes > 0) setLimites({ fotoBytes: d.fotoBytes, videoBytes: d.videoBytes, fotosPorConversa: d.fotosPorConversa || LIMITES_PADRAO.fotosPorConversa, videosPorMensagem: d.videosPorMensagem || LIMITES_PADRAO.videosPorMensagem }); })
      .catch(() => {});
  }, []);

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

  const contextoDeUpload = {
    sessionId: () => sessaoRef.current,
    adotarSessao: (id: number) => { setSessionId(id); localStorage.setItem(CHAVE_SESSAO_LOCAL, String(id)); },
  };

  // Arquivos ainda no navegador, para "tentar novamente" sem pedir ao usuario que escolha de novo.
  const arquivosPorId = useRef(new Map<string, File>());

  const enviarFoto = async (file: File) => {
    const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
    arquivosPorId.current.set(id, file);
    const ehHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    // Preview instantâneo local (não espera o upload) — o upload real acontece em seguida, com progresso.
    // HEIC nao renderiza fora do Safari: a miniatura vem do JPEG convertido que o servidor devolve.
    const dataUrl = ehHeic ? "" : await fileToDataUrl(file).catch(() => "");
    setAttachments((prev) => [...prev, { id, fileName: file.name, mimeType: file.type, size: file.size, dataUrl, status: "uploading" as const, progresso: 0 }]);
    let cancelado = false;
    cancelamentos.current.set(id, () => { cancelado = true; });
    const r = await subirAnexo("foto", file, contextoDeUpload, (pct) => setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, progresso: pct } : a))),
      { abortado: false, aoAbortar: (cb) => cancelamentos.current.set(id, () => { cancelado = true; cb(); }) });
    cancelamentos.current.delete(id);
    if (cancelado) return;
    // O servidor reconhece a mesma foto (mesmo conteudo, outro nome): nao entra duas vezes na campanha.
    if (r.ok && r.reaproveitado && anexosRef.current.fotos.some((a) => a.id !== id && a.photoUrl === r.url)) {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      setAttachmentError(`"${file.name}" é a mesma foto que você já anexou; mantive uma só.`);
      return;
    }
    setAttachments((prev) => prev.map((a) => (a.id !== id ? a : r.ok ? { ...a, status: "done", progresso: 100, photoUrl: r.url, ...(ehHeic ? { dataUrl: r.url } : {}) } : { ...a, status: "error", erro: r.erro })));
    if (r.ok) arquivosPorId.current.delete(id);
  };

  const enviarVideo = async (file: File) => {
    const id = crypto.randomUUID();
    arquivosPorId.current.set(id, file);
    const previewUrl = typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : undefined;
    setVideoAttachments((prev) => [...prev, { id, fileName: file.name, mimeType: file.type || "video/mp4", size: file.size, status: "uploading", progresso: 0, previewUrl }]);
    let cancelado = false;
    const r = await subirAnexo("video", file, contextoDeUpload, (pct) => setVideoAttachments((prev) => prev.map((v) => (v.id === id ? { ...v, progresso: pct } : v))),
      { abortado: false, aoAbortar: (cb) => cancelamentos.current.set(id, () => { cancelado = true; cb(); }) });
    cancelamentos.current.delete(id);
    if (cancelado) { if (previewUrl) URL.revokeObjectURL(previewUrl); return; }
    if (r.ok && r.reaproveitado && anexosRef.current.videos.some((x) => x.id !== id && x.videoUrl === r.url)) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setVideoAttachments((prev) => prev.filter((x) => x.id !== id));
      setAttachmentError(`"${file.name}" é o mesmo vídeo que você já anexou; mantive um só.`);
      return;
    }
    setVideoAttachments((prev) => prev.map((v) => (v.id !== id ? v : r.ok
      ? { ...v, status: "done", progresso: 100, videoUrl: r.url, duracaoS: typeof r.extra.duracaoS === "number" ? r.extra.duracaoS : undefined, proporcao: typeof r.extra.proporcao === "string" ? r.extra.proporcao : undefined }
      : { ...v, status: "error", erro: r.erro })));
  };

  /** Ponto unico de entrada: botao, camera, arrastar e soltar, colar. Fotos e videos juntos. */
  const addFiles = async (files: FileList | File[]) => {
    setAttachmentError("");
    const selecao = separarArquivos(
      Array.from(files).filter(Boolean),
      { fotos: Math.max(0, limites.fotosPorConversa - attachments.length), videos: Math.max(0, limites.videosPorMensagem - videoAttachments.length) },
      limites,
      [...attachments, ...videoAttachments],
    );
    if (selecao.erros.length) setAttachmentError(selecao.erros.join(" "));
    // Em sequencia: o primeiro envio cria a conversa e os demais entram nela (ver subirAnexo).
    for (const f of selecao.fotos) await enviarFoto(f);
    for (const v of selecao.videos) await enviarVideo(v);
  };
  const addAttachments = addFiles;

  /** Reenvia um anexo que falhou, com o mesmo arquivo (sem reabrir o seletor). */
  const tentarNovamente = async (id: string) => {
    const arquivo = arquivosPorId.current.get(id);
    if (!arquivo) { setAttachmentError("Não tenho mais esse arquivo. Escolha-o de novo."); return; }
    setAttachmentError("");
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setVideoAttachments((prev) => prev.filter((v) => v.id !== id));
    arquivosPorId.current.delete(id);
    if (classificarArquivo(arquivo) === "video") await enviarVideo(arquivo); else await enviarFoto(arquivo);
  };
  const addVideoAttachment = (file: File) => addFiles([file]);

  const escolherVelocidade = (v: ChatVelocidade) => {
    setVelocidade(v);
    localStorage.setItem(CHAVE_VELOCIDADE_LOCAL, v);
  };

  const removeAttachment = (id: string) => {
    cancelamentos.current.get(id)?.();
    // Achado real (revisao apontada por Michel, 16/09): antes, isso so
    // mexia no estado local — a foto continuava salva na sessao no
    // servidor, reaparecendo depois de um recarregamento mesmo tendo
    // sido removida explicitamente. Sincroniza a remoção quando a foto
    // já foi persistida (tem photoUrl); se ainda estava só subindo ou
    // deu erro, não há nada persistido pra remover no servidor.
    setAttachments((prev) => {
      const alvo = prev.find((item) => item.id === id);
      if (alvo?.photoUrl && sessaoRef.current) {
        fetch("/api/chat/pending-photo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sessionId: sessaoRef.current, url: alvo.photoUrl }),
        }).catch(() => {
          // silencioso — a remoção local já aconteceu; pior caso, a foto
          // reaparece se a sessão for recarregada antes de uma nova troca
        });
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const removeVideoAttachment = (id: string) => {
    cancelamentos.current.get(id)?.();
    setVideoAttachments((prev) => {
      const alvo = prev.find((v) => v.id === id);
      if (alvo?.status === "done" && alvo.videoUrl && sessaoRef.current) {
        fetch("/api/chat/pending-photo", {
          method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ sessionId: sessaoRef.current, url: alvo.videoUrl }),
        }).catch(() => {});
      }
      if (alvo?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(alvo.previewUrl);
      return prev.filter((v) => v.id !== id);
    });
  };

  /** Troca um anexo por outro arquivo: remove o antigo (inclusive no servidor) e envia o novo. */
  const substituirAnexo = async (id: string, arquivo: File) => {
    if (videoAttachments.some((v) => v.id === id)) removeVideoAttachment(id); else removeAttachment(id);
    await addFiles([arquivo]);
  };

  const send = async (textoOverride?: string) => {
    const texto = (textoOverride ?? input).trim();
    const videosProntos = videoAttachments.filter((v) => v.status === "done" && v.videoUrl);
    if ((!texto && attachments.length === 0 && videosProntos.length === 0) || sending.current) return;
    sending.current = true;

    // Quem acabou de enviar quer ver a propria mensagem: voltar a acompanhar o
    // fim aqui e o unico caso em que puxar o scroll e o comportamento esperado.
    acompanhandoOFim.current = true;
    setLongeDoFim(false);
    setNaoLidas(0);

    // needsLogin é resetado a cada nova tentativa (reset otimista) — sem
    // isso, o aviso de login ficaria colado pra sempre depois de setado
    // uma vez, mesmo após o usuário logar de novo e voltar a conversar.
    setNeedsLogin(false);

    const userContent = texto || (attachments.length
      ? `Use as ${attachments.length} foto(s) anexadas${videosProntos.length ? ` e ${videosProntos.length === 1 ? "o vídeo" : `os ${videosProntos.length} vídeos`}` : ""} para montar a campanha.`
      : `Analise ${videosProntos.length === 1 ? "o vídeo anexado" : `os ${videosProntos.length} vídeos anexados`} e me diga como usar na campanha.`);
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
            // Preferimos a URL já persistida (upload imediato ao anexar) —
            // só cai pra base64 se o upload ainda não tiver terminado quando
            // o usuário enviar a mensagem (raro, mas o servidor aceita os
            // dois formatos como retrocompatibilidade).
            photoUrl: file.status === "done" ? file.photoUrl : undefined,
            imageBase64: file.status === "done" ? undefined : file.dataUrl,
          })),
          videoUrls: videosProntos.map((v) => v.videoUrl),
          velocidade,
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
      if (videosProntos.length) setVideoAttachments((prev) => prev.filter((v) => !videosProntos.some((p) => p.id === v.id)));
      // Sessão criada/confirmada pelo servidor nesta troca — salva pra
      // sobreviver a um recarregamento de página, e atualiza a lista
      // (título/última campanha podem ter mudado nesta troca).
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(CHAVE_SESSAO_LOCAL, String(data.sessionId));
      }
      carregarSessoes();
      void carregarCortes(data.sessionId || sessionId);
    } catch {
      // O texto digitado nao se perde se a conexao cair no envio.
      setInput((atual) => atual || texto);
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
    velocidade,
    escolherVelocidade,
    attachments,
    addAttachments,
    removeAttachment,
    attachmentError,
    videoAttachments,
    addVideoAttachment,
    removeVideoAttachment,
    addFiles,
    substituirAnexo,
    tentarNovamente,
    limites,
    cortes,
    decidirCortes,
    loading,
    needsLogin,
    send,
    mostrarSugestoes,
    scrollRef,
    longeDoFim,
    naoLidas,
    irParaUltima,
    sessionId,
    sessoes,
    carregandoHistorico,
    ultimaCampanha,
    novaConversa,
    carregarConversa,
    excluirSessao,
  };
}
