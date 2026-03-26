import { useState } from "react";

interface Message { role: "user" | "assistant"; content: string; }

export default function MECPROAssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Olá! Sou o assistente MECPro. Como posso ajudar com suas campanhas?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: userMsg }) });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply ?? "Desculpe, tente novamente." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Erro ao conectar. Tente novamente." }]);
    } finally { setLoading(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(!open)} className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform" style={{ background: "linear-gradient(135deg, #4ade1a, #15803d)" }} title="Assistente MECPro">
        {open
          ? <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          : <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-80 md:w-96 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ height: 420, background: "#0a1a0e" }}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3" style={{ background: "#0d2010" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}>
              <span className="text-white text-xs font-bold">IA</span>
            </div>
            <div>
              <p className="text-white font-medium text-sm">Assistente MECPro</p>
              <p className="text-xs" style={{ color: "#4ade1a" }}>● Online</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm`} style={msg.role === "user" ? { background: "linear-gradient(135deg,#4ade1a,#15803d)", color: "white" } : { background: "rgba(255,255,255,0.05)", color: "#d1fae5" }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}><span className="text-sm animate-pulse" style={{ color: "#4ade1a" }}>Digitando...</span></div></div>}
          </div>
          <div className="p-3 border-t border-white/10 flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Pergunte algo..." className="flex-1 text-white text-sm px-3 py-2 rounded-lg border outline-none placeholder-gray-500" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(74,222,26,0.3)" }} />
            <button onClick={send} disabled={loading || !input.trim()} className="px-3 py-2 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition-colors" style={{ background: "linear-gradient(135deg,#4ade1a,#15803d)" }}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
