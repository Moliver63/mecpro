import { useState, useEffect, useRef } from "react";

/**
 * CampaignChat — Assistente de criação de campanhas via chat (MecProAI).
 *
 * Experiência no formato estilo ChatGPT: tela cheia, conversa em coluna
 * central, sugestões de prompts no início, respostas com markdown-lite.
 * A bolha flutuante continua sendo a porta de entrada em todas as páginas.
 *
 * Contrato com o backend (inalterado):
 *   POST /api/chat  { mensagens: [{ role, content }] }
 *   → 200 { resposta: string, campanha: { id, name, projectId, url } | null, modo }
 *   → 401 { erro: "login_required" }  → exibe CTA de login
 *   → 429 { erro: "rate_limit" }
 *
 * Abertura programática (botões na landing):
 *   window.dispatchEvent(new Event("mecpro:open-chat"))
 */

interface CampanhaGerada {
  id: number;
  name: string;
  projectId: number;
  url: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Achado real (auditoria da feature de chat, 08/09): o card "✅
  // Campanha criada" era decidido por "existe alguma campanha? é a
  // última mensagem?" — depois de qualquer pergunta de acompanhamento
  // sem gerar campanha nova, o card antigo reaparecia grudado na
  // resposta errada. Anexado direto na mensagem onde a campanha foi de
  // fato criada, pra só aparecer ali.
  campanha?: CampanhaGerada;
}

interface RespostaChat {
  resposta: string;
  campanha: CampanhaGerada | null;
  modo: "assistente" | "local";
}

const MENSAGEM_INICIAL: ChatMessage = {
  role: "assistant",
  content:
    "Me conta sobre o seu negócio e eu monto a campanha pra você. " +
    "Qual é o nome do cliente/negócio e o que você vende?",
};

const SUGESTOES = [
  "Quero uma campanha de leads pro meu negócio",
  "Tenho uma loja de roupas e quero mais vendas",
  "Monte uma campanha pra minha clínica odontológica em São Paulo",
  "Como vocês definem o orçamento da campanha?",
];

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

function AvatarIA() {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
      style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}
    >
      <span className="text-white text-xs font-bold">IA</span>
    </div>
  );
}

export default function CampaignChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Botões na landing/abertura programática disparam o evento global
  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener("mecpro:open-chat", abrir);
    return () => window.removeEventListener("mecpro:open-chat", abrir);
  }, []);

  // Rola pro fim a cada mensagem nova
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  const send = async (textoOverride?: string) => {
    const texto = (textoOverride ?? input).trim();
    if (!texto || loading) return;

    // Achado real (auditoria da feature de chat, 08/09): needsLogin nunca
    // era resetado depois de setado uma vez — se a sessão expirasse no
    // meio da conversa, o CTA "Entre na sua conta" ficava colado embaixo
    // de toda resposta futura pra sempre, mesmo depois do usuário logar
    // de novo e voltar a conversar com sucesso. Reset otimista aqui: uma
    // nova tentativa some com o aviso antigo, e ele só volta se a
    // tentativa nova também levar 401.
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

  // ── Bolha flutuante (estado fechado) ─────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        style={{ background: "linear-gradient(135deg, #4ade1a, #15803d)" }}
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
      {/* Header */}
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
                      anexado direto na mensagem (msg.campanha), não mais
                      inferido por "é a última mensagem e existe alguma
                      campanha" (isso fazia o card reaparecer em respostas
                      de acompanhamento sem relação com a criação). */}
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

      {/* Input fixo no rodapé */}
      <footer className="shrink-0 px-4 pb-4 pt-2" style={{ background: "#0d1117" }}>
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
