import { ImagePlus, Send, X, Video, Loader2, Zap, Gauge, Turtle } from "lucide-react";
import type { RefObject } from "react";
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
  addAttachments: (files: FileList | File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  attachmentError: string;
  videoAttachment: ChatVideoAttachment | null;
  addVideoAttachment: (file: File) => Promise<void>;
  removeVideoAttachment: () => void;
  send: (textoOverride?: string) => void;
  scrollRef: RefObject<HTMLDivElement>;
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
  addAttachments,
  removeAttachment,
  attachmentError,
  videoAttachment,
  addVideoAttachment,
  removeVideoAttachment,
  send,
  scrollRef,
  fullScreen = false,
}: ChatConversationViewProps) {
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
                    <a href={msg.campanha.url} className="campaign-chat-campaign-card">
                      <strong>Campanha criada</strong>
                      <span>{msg.campanha.name}</span>
                      <em>Ver campanha completa</em>
                    </a>
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

      <footer className="campaign-chat-footer">
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
        {!!attachments.length && (
          <div className="campaign-chat-attachment-tray" aria-label="Fotos anexadas">
            {attachments.map((file, index) => (
              <div key={file.id} className="campaign-chat-attachment" data-status={file.status}>
                <img src={file.dataUrl} alt={file.fileName} />
                {file.status === "uploading" && (
                  <div className="campaign-chat-attachment-overlay" title="Enviando...">
                    <Loader2 size={16} className="campaign-chat-spin" strokeWidth={2.4} />
                  </div>
                )}
                {file.status === "error" && (
                  <div className="campaign-chat-attachment-overlay campaign-chat-attachment-overlay-error" title={file.erro || "Falha ao enviar"}>
                    <X size={16} strokeWidth={2.6} />
                  </div>
                )}
                <span>{index + 1}</span>
                <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`Remover ${file.fileName}`}>
                  <X size={13} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        )}

        {videoAttachment && (
          <div className="campaign-chat-video-chip" data-status={videoAttachment.status}>
            {videoAttachment.status === "uploading" && <Loader2 size={14} className="campaign-chat-spin" strokeWidth={2.4} />}
            {videoAttachment.status === "done" && <Video size={14} strokeWidth={2.4} />}
            {videoAttachment.status === "error" && <X size={14} strokeWidth={2.4} />}
            <span>
              {videoAttachment.status === "uploading" && `Enviando ${videoAttachment.fileName}…`}
              {videoAttachment.status === "done" && videoAttachment.fileName}
              {videoAttachment.status === "error" && (videoAttachment.erro || "Falha ao enviar o vídeo")}
            </span>
            <button type="button" onClick={removeVideoAttachment} aria-label="Remover vídeo">
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>
        )}

        <div className="campaign-chat-composer">
          <label className="campaign-chat-attach" title="Anexar fotos da campanha">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                const files = e.currentTarget.files;
                if (files?.length) void addAttachments(files);
                e.currentTarget.value = "";
              }}
            />
            <ImagePlus size={18} strokeWidth={2.3} />
          </label>
          <label className="campaign-chat-attach" title="Anexar vídeo da campanha">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void addVideoAttachment(file);
                e.currentTarget.value = "";
              }}
            />
            <Video size={18} strokeWidth={2.3} />
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
            disabled={loading || videoAttachment?.status === "uploading" || attachments.some((a) => a.status === "uploading") || (!input.trim() && attachments.length === 0)}
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
