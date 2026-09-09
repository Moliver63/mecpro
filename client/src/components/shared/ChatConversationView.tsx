import { ImagePlus, Send, X } from "lucide-react";
import type { RefObject } from "react";
import type { ChatImageAttachment, ChatMessage } from "@/hooks/useCampaignChat";
import { ASSISTANT_IMAGE, SUGESTOES } from "@/hooks/useCampaignChat";

function FormatarTexto({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{1,}/).filter((p) => p.trim().length > 0);
  return (
    <>
      {paragrafos.map((p, i) => {
        const partes = p.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
        return (
          <p key={i} className="campaign-chat-message-paragraph">
            {partes.map((parte, j) =>
              parte.startsWith("**") && parte.endsWith("**") ? (
                <strong key={j}>{parte.slice(2, -2)}</strong>
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
  attachments: ChatImageAttachment[];
  addAttachments: (files: FileList | File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  attachmentError: string;
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
  attachments,
  addAttachments,
  removeAttachment,
  attachmentError,
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
        {!!attachments.length && (
          <div className="campaign-chat-attachment-tray" aria-label="Fotos anexadas">
            {attachments.map((file) => (
              <div key={file.id} className="campaign-chat-attachment">
                <img src={file.dataUrl} alt={file.fileName} />
                <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`Remover ${file.fileName}`}>
                  <X size={13} strokeWidth={2.4} />
                </button>
              </div>
            ))}
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
            disabled={loading || (!input.trim() && attachments.length === 0)}
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
