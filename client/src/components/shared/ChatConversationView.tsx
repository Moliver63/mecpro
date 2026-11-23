import { ImagePlus, Send, X, Video, Loader2, Zap, Gauge, Turtle, ArrowDown, Megaphone, Camera, RefreshCw, Play } from "lucide-react";
import { useState, type RefObject } from "react";
import { ACEITA_FOTOS_E_VIDEOS } from "@/lib/chatUploads";
import type { ChatImageAttachment, ChatMessage, ChatVideoAttachment, ChatVelocidade } from "@/hooks/useCampaignChat";
import { ASSISTANT_IMAGE, SUGESTOES } from "@/hooks/useCampaignChat";

function FormatarTexto({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{1,}/).filter((p) => p.trim().length > 0);
  return (
    <>
      {paragrafos.map((p, i) => {
        const partes = p.split(/(\*\*[^*]+\*\*|\/projects\/\d+\/campaign\/result\/\d+)/g).filter((s) => s.length > 0);
        return (
          <p key={i} className="campaign-chat-message-paragraph">
            {partes.map((parte, j) =>
              parte.startsWith("**") && parte.endsWith("**") ? (
                <strong key={j}>{parte.slice(2, -2)}</strong>
              ) : /^\/projects\/\d+\/campaign\/result\/\d+$/.test(parte) ? (
                <a key={j} href={parte}>Ver campanha</a>
              ) : (
                <span key={j}>{parte}</span>
              )
            )}
          </p>
        );
      })}
    </>
  );
}

export function AvatarIA() {
  return (
    <div className="campaign-chat-avatar" aria-hidden="true">
      <img src={ASSISTANT_IMAGE} alt="" />
    </div>
  );
}

interface ChatConversationViewProps {
  messages: ChatMessage[];
  loading: boolean;
  needsLogin: boolean;
  mostrarSugestoes: boolean;
  input: string;
  setInput: (v: string) => void;
  velocidade: ChatVelocidade;
  escolherVelocidade: (v: ChatVelocidade) => void;
  attachments: ChatImageAttachment[];
  addFiles: (files: FileList | File[]) => Promise<void>;
  substituirAnexo: (id: string, arquivo: File) => Promise<void>;
  removeAttachment: (id: string) => void;
  attachmentError: string;
  videoAttachments: ChatVideoAttachment[];
  removeVideoAttachment: (id: string) => void;
  send: (textoOverride?: string) => void;
  scrollRef: RefObject<HTMLDivElement>;
  longeDoFim: boolean;
  naoLidas: number;
  irParaUltima: () => void;
  fullScreen?: boolean;
}

export default function ChatConversationView({
  messages,
  loading,
  needsLogin,
  mostrarSugestoes,
  input,
  setInput,
  velocidade,
  escolherVelocidade,
  attachments,
  addFiles,
  substituirAnexo,
  removeAttachment,
  attachmentError,
  videoAttachments,
  removeVideoAttachment,
  send,
  scrollRef,
  longeDoFim,
  naoLidas,
  irParaUltima,
  fullScreen = false,
}: ChatConversationViewProps) {
  // Arrastar e soltar (desktop): o contador evita piscar ao passar por elementos filhos.
  const [arrastando, setArrastando] = useState(false);
  const [entradas, setEntradas] = useState(0);
  const temArquivos = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const algumEnviando = attachments.some((a) => a.status === "uploading") || videoAttachments.some((v) => v.status === "uploading");
  const videosProntos = videoAttachments.filter((v) => v.status === "done").length;
  return (
    <div className={fullScreen ? "campaign-chat-conversation campaign-chat-conversation-full" : "campaign-chat-conversation"}>
      <main ref={scrollRef} className="campaign-chat-main">
        <div className="campaign-chat-thread">
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="campaign-chat-row campaign-chat-row-user">
                <div className="campaign-chat-bubble campaign-chat-bubble-user">
                  {msg.content}
                  {!!msg.attachments?.length && (
                    <div className="campaign-chat-message-attachments">
                      {msg.attachments.map((file) => (
                        <img key={file.id} src={file.dataUrl} alt={file.fileName} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key={i} className="campaign-chat-row campaign-chat-row-assistant">
                <AvatarIA />
                <div className="campaign-chat-response">
                  <FormatarTexto texto={msg.content} />

                  {msg.campanha && (
                    <div className="campaign-chat-campaign-card">
                      <a href={msg.campanha.url} className="campaign-chat-campaign-link">
                        <strong>Campanha criada</strong>
                        <span>{msg.campanha.name}</span>
                        <em>Ver campanha completa</em>
                      </a>
                      {/*
                        Publicar e acao de dinheiro: este botao NAO publica. Ele
                        pede as paginas conectadas e o que falta confirmar, e a
                        publicacao so acontece depois de escolher a pagina e
                        confirmar na conversa. `publicar_campanha` exige pageId,
                        entao um clique direto seria impossivel de qualquer forma.
                      */}
                      <button
                        type="button"
                        className="campaign-chat-publicar"
                        disabled={loading}
                        onClick={() =>
                          send(
                            `Quero publicar a campanha #${msg.campanha!.id} na Meta. ` +
                            "Liste minhas paginas conectadas e me diga o que falta confirmar antes de publicar. " +
                            "Nao publique nada ainda."
                          )
                        }
                      >
                        <Megaphone size={14} strokeWidth={2.4} />
                        Publicar na Meta
                      </button>
                    </div>
                  )}

                  {needsLogin && i === messages.length - 1 && !loading && (
                    <a href="/login" className="btn btn-md btn-primary campaign-chat-login">
                      Entrar na minha conta
                    </a>
                  )}
                </div>
              </div>
            )
          )}

          {loading && (
            <div className="campaign-chat-row campaign-chat-row-assistant">
              <AvatarIA />
              <div className="campaign-chat-typing" aria-label="Assistente digitando">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {mostrarSugestoes && (
            <>
              <section className="campaign-chat-guide-card" aria-label="Guia MecProAI">
                <img src={ASSISTANT_IMAGE} alt="Personagem guia do MecProAI" />
                <div>
                  <strong>Vamos montar sua campanha do jeito certo.</strong>
                  <span>Me diga o segmento, objetivo, região, orçamento e os materiais que você já tem.</span>
                </div>
              </section>

              <div className="campaign-chat-suggestions">
                {SUGESTOES.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="campaign-chat-suggestion">
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <div className="campaign-chat-descer-camada">
        {longeDoFim && (
        <button
          type="button"
          className="campaign-chat-descer"
          onClick={irParaUltima}
          aria-label={naoLidas > 0 ? `Ir para a ultima mensagem (${naoLidas} nova(s))` : "Ir para a ultima mensagem"}
          title="Ir para a ultima mensagem"
        >
          <ArrowDown size={18} strokeWidth={2.6} />
          {naoLidas > 0 && <span className="campaign-chat-descer-badge">{naoLidas > 9 ? "9+" : naoLidas}</span>}
        </button>
        )}
      </div>

      <footer
        className="campaign-chat-footer"
        data-arrastando={arrastando ? "true" : undefined}
        onDragEnter={(e) => { if (temArquivos(e)) { e.preventDefault(); setEntradas((n) => n + 1); setArrastando(true); } }}
        onDragOver={(e) => { if (temArquivos(e)) e.preventDefault(); }}
        onDragLeave={(e) => { if (temArquivos(e)) { setEntradas((n) => { const novo = Math.max(0, n - 1); if (novo === 0) setArrastando(false); return novo; }); } }}
        onDrop={(e) => {
          if (!temArquivos(e)) return;
          e.preventDefault(); setEntradas(0); setArrastando(false);
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => { const f = e.clipboardData?.files; if (f?.length) { e.preventDefault(); void addFiles(f); } }}
      >
        {arrastando && <div className="campaign-chat-dropzone" role="status">Solte as fotos e vídeos aqui para anexar</div>}
        <div className="campaign-chat-velocidade" role="radiogroup" aria-label="Velocidade da resposta">
          <button
            type="button"
            role="radio"
            aria-checked={velocidade === "rapida"}
            className={velocidade === "rapida" ? "ativo" : undefined}
            onClick={() => escolherVelocidade("rapida")}
            title="Respostas diretas e imediatas, sem pesquisar a web"
          >
            <Zap size={13} strokeWidth={2.4} /> Rápida
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={velocidade === "media"}
            className={velocidade === "media" ? "ativo" : undefined}
            onClick={() => escolherVelocidade("media")}
            title="Equilíbrio entre velocidade e profundidade (padrão)"
          >
            <Gauge size={13} strokeWidth={2.4} /> Média
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={velocidade === "lenta"}
            className={velocidade === "lenta" ? "ativo" : undefined}
            onClick={() => escolherVelocidade("lenta")}
            title="Respostas mais completas, pode pesquisar a web quando ajudar"
          >
            <Turtle size={13} strokeWidth={2.4} /> Lenta
          </button>
        </div>
        {(!!attachments.length || !!videoAttachments.length) && (
          <div className="campaign-chat-attachment-tray" aria-label="Anexos da conversa">
            {attachments.map((file, index) => (
              <div key={file.id} className="campaign-chat-attachment" data-status={file.status}>
                <img src={file.dataUrl} alt={file.fileName} />
                {file.status === "uploading" && (
                  <div className="campaign-chat-attachment-overlay" title={`Enviando ${file.progresso ?? 0}%`}>
                    <Loader2 size={16} className="campaign-chat-spin" strokeWidth={2.4} />
                    <span className="campaign-chat-attachment-pct">{file.progresso ?? 0}%</span>
                  </div>
                )}
                {file.status === "error" && (
                  <div className="campaign-chat-attachment-overlay campaign-chat-attachment-overlay-error" title={file.erro || "Falha ao enviar"}>
                    <X size={16} strokeWidth={2.6} />
                  </div>
                )}
                {file.status === "uploading" && <i className="campaign-chat-attachment-bar" style={{ width: `${file.progresso ?? 0}%` }} />}
                <span>{index + 1}</span>
                <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`Remover ${file.fileName}`}>
                  <X size={13} strokeWidth={2.4} />
                </button>
                <label className="campaign-chat-attachment-swap" title="Substituir por outro arquivo" aria-label={`Substituir ${file.fileName}`}>
                  <input type="file" accept={ACEITA_FOTOS_E_VIDEOS} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void substituirAnexo(file.id, f); e.currentTarget.value = ""; }} />
                  <RefreshCw size={11} strokeWidth={2.4} />
                </label>
              </div>
            ))}
            {videoAttachments.map((v) => (
              <div key={v.id} className="campaign-chat-attachment campaign-chat-attachment-video" data-status={v.status} title={v.status === "error" ? v.erro : v.fileName}>
                {v.previewUrl ? <video src={`${v.previewUrl}#t=0.1`} muted playsInline preload="metadata" aria-label={v.fileName} /> : <div className="campaign-chat-attachment-novideo"><Video size={20} strokeWidth={2.2} /></div>}
                {v.status === "done" && <span className="campaign-chat-attachment-play"><Play size={12} strokeWidth={2.6} /></span>}
                {v.status === "uploading" && (
                  <div className="campaign-chat-attachment-overlay" title={`Enviando ${v.progresso ?? 0}%`}>
                    <Loader2 size={16} className="campaign-chat-spin" strokeWidth={2.4} />
                    <span className="campaign-chat-attachment-pct">{v.progresso ?? 0}%</span>
                  </div>
                )}
                {v.status === "error" && (
                  <div className="campaign-chat-attachment-overlay campaign-chat-attachment-overlay-error">
                    <X size={16} strokeWidth={2.6} />
                  </div>
                )}
                {v.status === "uploading" && <i className="campaign-chat-attachment-bar" style={{ width: `${v.progresso ?? 0}%` }} />}
                {v.status === "done" && v.duracaoS ? <em className="campaign-chat-attachment-dur">{Math.floor(v.duracaoS / 60)}:{String(Math.round(v.duracaoS % 60)).padStart(2, "0")}</em> : null}
                <button type="button" onClick={() => removeVideoAttachment(v.id)} aria-label={`Remover ${v.fileName}`}>
                  <X size={13} strokeWidth={2.4} />
                </button>
                <label className="campaign-chat-attachment-swap" title="Substituir por outro arquivo" aria-label={`Substituir ${v.fileName}`}>
                  <input type="file" accept={ACEITA_FOTOS_E_VIDEOS} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void substituirAnexo(v.id, f); e.currentTarget.value = ""; }} />
                  <RefreshCw size={11} strokeWidth={2.4} />
                </label>
              </div>
            ))}
          </div>
        )}
        {videoAttachments.some((v) => v.status === "error") && (
          <p className="campaign-chat-error" role="alert">{videoAttachments.filter((v) => v.status === "error").map((v) => `${v.fileName}: ${v.erro || "falha ao enviar"}`).join(" ")}</p>
        )}
        {attachments.some((a) => a.status === "error") && (
          <p className="campaign-chat-error" role="alert">{attachments.filter((a) => a.status === "error").map((a) => `${a.fileName}: ${a.erro || "falha ao enviar"}`).join(" ")}</p>
        )}

        <div className="campaign-chat-composer">
          <label className="campaign-chat-attach" title="Anexar fotos e vídeos" aria-label="Anexar fotos e vídeos">
            <input
              type="file"
              accept={ACEITA_FOTOS_E_VIDEOS}
              multiple
              onChange={(e) => {
                const files = e.currentTarget.files;
                if (files?.length) void addFiles(files);
                e.currentTarget.value = "";
              }}
            />
            <ImagePlus size={18} strokeWidth={2.3} />
          </label>
          <label className="campaign-chat-attach campaign-chat-attach-camera" title="Tirar foto ou gravar vídeo" aria-label="Abrir a câmera">
            <input
              type="file"
              accept="image/*,video/*"
              capture="environment"
              onChange={(e) => {
                const files = e.currentTarget.files;
                if (files?.length) void addFiles(files);
                e.currentTarget.value = "";
              }}
            />
            <Camera size={18} strokeWidth={2.3} />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={Math.min(5, Math.max(1, input.split("\n").length))}
            placeholder="Descreva seu negócio e o que você quer alcançar..."
            className="campaign-chat-input"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={loading || algumEnviando || (!input.trim() && attachments.length === 0 && videosProntos === 0)}
            className="campaign-chat-send"
            aria-label="Enviar mensagem"
            title="Enviar"
          >
            <Send size={17} strokeWidth={2.5} />
          </button>
        </div>
        {attachmentError && <p className="campaign-chat-error">{attachmentError}</p>}
        <p className="campaign-chat-hint">O assistente pode gerar a campanha direto no seu projeto. Entre na sua conta para salvar.</p>
      </footer>
    </div>
  );
}
