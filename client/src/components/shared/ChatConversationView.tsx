import type { ChatMessage } from "@/hooks/useCampaignChat";
import { SUGESTOES } from "@/hooks/useCampaignChat";

/** Markdown-lite: quebra em parágrafos e renderiza **negrito**. */
function FormatarTexto({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{1,}/).filter((p) => p.trim().length > 0);
  return (
    <>
      {paragrafos.map((p, i) => {
        const partes = p.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
        return (
          <p key={i} className={i > 0 ? "mt-2" : undefined}>
            {partes.map((parte, j) =>
              parte.startsWith("**") && parte.endsWith("**") ? (
                <strong key={j} className="font-semibold text-white">
                  {parte.slice(2, -2)}
                </strong>
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
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
      style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}
    >
      <span className="text-white text-xs font-bold">IA</span>
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
  send: (textoOverride?: string) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  /** true = ocupa a tela inteira (overlay do widget flutuante); false =
   * embutido dentro do layout normal da página (tela inicial). */
  fullScreen?: boolean;
}

/**
 * ChatConversationView — a conversa em si (lista de mensagens + campo de
 * texto no rodapé), sem o header/bolha. Reaproveitada por CampaignChat.tsx
 * (overlay flutuante) e ChatHomeView.tsx (embutido na tela inicial) —
 * mesma UI, mesmo comportamento, uma fonte só.
 */
export default function ChatConversationView({
  messages,
  loading,
  needsLogin,
  mostrarSugestoes,
  input,
  setInput,
  send,
  scrollRef,
  fullScreen = false,
}: ChatConversationViewProps) {
  return (
    <div className="flex flex-col h-full" style={{ background: fullScreen ? "#0d1117" : "transparent" }}>
      {/* Conversa em coluna central */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div
                  className="max-w-[80%] px-4 py-2.5 rounded-3xl text-sm whitespace-pre-wrap text-white"
                  style={{ background: "#2f2f2f" }}
                >
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-3">
                <AvatarIA />
                <div className="flex-1 min-w-0 text-sm leading-relaxed" style={{ color: "#e6edf3" }}>
                  <FormatarTexto texto={msg.content} />

                  {/* Card da campanha criada nesta mensagem específica —
                      anexado direto na mensagem (msg.campanha), não
                      inferido por "é a última mensagem", pra não reaparecer
                      em respostas de acompanhamento sem relação. */}
                  {msg.campanha && (
                    <a
                      href={msg.campanha.url}
                      className="mt-3 block px-4 py-3 rounded-2xl border text-sm transition-opacity hover:opacity-90"
                      style={{
                        background: "rgba(74,222,26,0.08)",
                        borderColor: "rgba(74,222,26,0.4)",
                        color: "#d1fae5",
                      }}
                    >
                      <p className="font-semibold text-white">✅ Campanha criada</p>
                      <p className="mt-1 truncate">{msg.campanha.name}</p>
                      <p className="mt-2 text-xs font-medium" style={{ color: "#4ade1a" }}>
                        Ver campanha completa →
                      </p>
                    </a>
                  )}

                  {/* CTA de login quando a sessão expirou */}
                  {needsLogin && i === messages.length - 1 && !loading && (
                    <a
                      href="/login"
                      className="mt-3 inline-block px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}
                    >
                      Entrar na minha conta
                    </a>
                  )}
                </div>
              </div>
            )
          )}

          {/* Indicador de digitação (3 pontinhos) */}
          {loading && (
            <div className="flex items-start gap-3">
              <AvatarIA />
              <div className="flex items-center gap-1.5 px-1 py-2">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: "#4ade1a", animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sugestões de prompts (estado inicial, estilo ChatGPT) */}
          {mostrarSugestoes && (
            <div className="grid sm:grid-cols-2 gap-3 pt-4">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left px-4 py-3 rounded-2xl border text-sm transition-colors"
                  style={{
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "#e6edf3",
                    background: "rgba(255,255,255,0.02)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(74,222,26,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Input fixo no rodapé — padding-bottom soma env(safe-area-inset-bottom)
          quando em tela cheia, pra não ficar atrás da barra do Safari/
          indicador de home do iPhone. Embutido não precisa (a página já
          cuida do espaçamento inferior padrão). */}
      <footer
        className="shrink-0 px-4 pt-2"
        style={{
          background: fullScreen ? "#0d1117" : "transparent",
          paddingBottom: fullScreen ? "calc(1rem + env(safe-area-inset-bottom, 0px))" : "1rem",
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="flex items-end gap-2 rounded-3xl border px-4 py-2.5"
            style={{ borderColor: "rgba(255,255,255,0.15)", background: "#161b22" }}
          >
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
              placeholder="Descreva seu negócio e o que você quer alcançar… (Enter envia, Shift+Enter quebra linha)"
              className="flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder-gray-500 max-h-40"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-opacity"
              style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}
              aria-label="Enviar mensagem"
              title="Enviar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[11px] mt-2" style={{ color: "#6e7681" }}>
            O assistente pode gerar a campanha direto no seu projeto. Entre na sua conta para salvar.
          </p>
        </div>
      </footer>
    </div>
  );
}
