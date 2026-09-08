import { useState, useEffect, useRef } from "react";

/**
 * CampaignChat — Assistente de criação de campanhas via chat (MecProAI).
 *
 * Bolha flutuante global disponível em todas as páginas. Conversa com
 * server/chat.ts (/api/chat), que usa function calling (Gemini → Groq) para
 * coletar o briefing e chamar o motor oficial de geração de campanhas.
 *
 * Contrato com o backend:
 *   POST /api/chat  { mensagens: [{ role, content }] }
 *   → 200 { resposta: string, campanha: { id, name, projectId, url } | null, modo }
 *   → 401 { erro: "login_required" }  → exibe CTA de login
 *   → 429 { erro: "rate_limit" }
 *
 * Abertura programática (ex.: botões na landing):
 *   window.dispatchEvent(new Event("mecpro:open-chat"))
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CampanhaGerada {
  id: number;
  name: string;
  projectId: number;
  url: string;
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

export default function CampaignChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([MENSAGEM_INICIAL]);
  const [campanhas, setCampanhas] = useState<Record<number, CampanhaGerada>>({});
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

  const send = async () => {
    const texto = input.trim();
    if (!texto || loading) return;

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

      if (data.campanha) {
        setCampanhas((prev) => ({ ...prev, [data.campanha!.id]: data.campanha! }));
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.resposta?.trim() || "Pronto! Sua campanha foi gerada.",
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

  return (
    <>
      {/* Bolha flutuante */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        style={{ background: "linear-gradient(135deg, #4ade1a, #15803d)" }}
        title="Montar campanha no chat"
        aria-label="Abrir assistente de campanhas"
      >
        {open ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Painel do chat */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-40 w-80 md:w-96 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: 480, background: "#0a1a0e" }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3" style={{ background: "#0d2010" }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}
            >
              <span className="text-white text-xs font-bold">IA</span>
            </div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Monte sua campanha no chat</p>
              <p className="text-xs" style={{ color: "#4ade1a" }}>● Online</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/50 hover:text-white text-lg leading-none px-1"
              aria-label="Fechar chat"
            >
              ×
            </button>
          </div>

          {/* Mensagens */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap"
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg,#4ade1a,#15803d)", color: "white" }
                      : { background: "rgba(255,255,255,0.05)", color: "#d1fae5" }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Card da campanha recém-criada */}
            {Object.values(campanhas)
              .slice(-1)
              .map((c) => (
                <div key={c.id} className="flex justify-start">
                  <a
                    href={c.url}
                    className="block max-w-[85%] w-full px-3 py-3 rounded-xl border text-sm transition-colors hover:opacity-90"
                    style={{
                      background: "rgba(74,222,26,0.08)",
                      borderColor: "rgba(74,222,26,0.4)",
                      color: "#d1fae5",
                    }}
                  >
                    <p className="font-semibold text-white">✅ Campanha criada</p>
                    <p className="mt-1 truncate">{c.name}</p>
                    <p className="mt-2 text-xs font-medium" style={{ color: "#4ade1a" }}>
                      Ver campanha completa →
                    </p>
                  </a>
                </div>
              ))}

            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <span className="text-sm animate-pulse" style={{ color: "#4ade1a" }}>
                    Digitando...
                  </span>
                </div>
              </div>
            )}

            {/* CTA de login quando a sessão expirou */}
            {needsLogin && !loading && (
              <div className="flex justify-start">
                <a
                  href="/login"
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}
                >
                  Entrar na minha conta
                </a>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/10 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ex.: tenho uma loja de roupas em BC, quero leads..."
              className="flex-1 text-white text-sm px-3 py-2 rounded-lg border outline-none placeholder-gray-500"
              style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(74,222,26,0.3)" }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-3 py-2 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition-colors"
              style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}
              aria-label="Enviar mensagem"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
