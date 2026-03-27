import { useState } from "react";
import { useLocation } from "wouter";

export default function Contact() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", type: "support" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) { setError("Preencha todos os campos obrigatórios."); return; }
    setSending(true);
    setError("");
    // Simulate sending
    await new Promise(r => setTimeout(r, 1500));
    setSending(false);
    setSent(true);
  }

  const contactMethods = [
    { icon: "📧", label: "E-mail", value: "contato@mecproai.com", action: () => window.open("mailto:contato@mecproai.com") },
    { icon: "📱", label: "WhatsApp", value: "(47) 99465-824", action: () => window.open("https://wa.me/554799465824") },
    { icon: "🕐", label: "Horário", value: "Seg–Sex, 9h–18h (BRT)", action: null },
    { icon: "⚡", label: "Resposta", value: "Até 24 horas úteis", action: null },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--white)" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        padding: "60px 24px", textAlign: "center", color: "white"
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 900, marginBottom: 10 }}>
          Fale Conosco
        </h1>
        <p style={{ fontSize: 16, color: "#cbd5e1" }}>
          Estamos aqui para ajudar. Envie sua mensagem e responderemos em breve.
        </p>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 32 }}>
          {/* Info de contato */}
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>
              Informações de contato
            </h2>

            {/* Card Michel Leal */}
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1e3a5f)", borderRadius: 16, padding: "20px 22px", marginBottom: 20, color: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  👤
                </div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>Michel Leal</p>
                  <p style={{ fontSize: 12, color: "#94a3b8" }}>Gerente de Relacionamento ao Cliente</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📱</span>
                  <a href="https://wa.me/554799465824" target="_blank" rel="noreferrer"
                    style={{ color: "#4ade80", fontWeight: 600, textDecoration: "none" }}>
                    (47) 99465-824
                  </a>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📧</span>
                  <a href="mailto:contato@mecproai.com"
                    style={{ color: "#93c5fd", fontWeight: 600, textDecoration: "none" }}>
                    contato@mecproai.com
                  </a>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📍</span>
                  <span style={{ color: "#cbd5e1" }}>Balneário Camboriú - SC | Centro</span>
                </div>
                <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", marginTop: 6, paddingTop: 10, fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
                  MecPro AI — Inteligência para campanhas que convertem
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
              {contactMethods.map(m => (
                <div key={m.label}
                  onClick={m.action ?? undefined}
                  style={{
                    background: "white", border: "1px solid var(--border)", borderRadius: 12,
                    padding: "16px 18px", display: "flex", gap: 12, alignItems: "center",
                    cursor: m.action ? "pointer" : "default",
                    transition: "all .15s"
                  }}
                  onMouseEnter={e => { if (m.action) e.currentTarget.style.borderColor = "var(--green)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                    {m.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>{m.label}</p>
                    <p style={{ fontSize: 13, color: "var(--dark)", fontWeight: 600 }}>{m.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "var(--off)", borderRadius: 14, padding: "18px 20px" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)", marginBottom: 10 }}>Links rápidos</p>
              {[
                { label: "Perguntas frequentes", path: "/faq" },
                { label: "Política de privacidade", path: "/privacy" },
                { label: "Termos de uso", path: "/terms" },
              ].map(l => (
                <div key={l.path} onClick={() => setLocation(l.path)}
                  style={{ fontSize: 13, color: "var(--green-d)", cursor: "pointer", marginBottom: 6, fontWeight: 500 }}>
                  → {l.label}
                </div>
              ))}
            </div>
          </div>

          {/* Formulário */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 20, padding: "32px 30px" }}>
            {sent ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
                  Mensagem enviada!
                </h3>
                <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>
                  Recebemos sua mensagem e responderemos em até 24 horas úteis.
                </p>
                <button className="btn btn-md btn-green" onClick={() => setSent(false)}>Enviar outra mensagem</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 22 }}>
                  Envie uma mensagem
                </h2>

                {/* Tipo de assunto */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 6, display: "block" }}>TIPO DE SOLICITAÇÃO</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { value: "support", label: "Suporte Técnico" },
                      { value: "billing", label: "Financeiro" },
                      { value: "feature", label: "Sugestão" },
                      { value: "other", label: "Outro" },
                    ].map(t => (
                      <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value }))}
                        style={{
                          padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)",
                          cursor: "pointer", fontSize: 11, fontWeight: 600,
                          background: form.type === t.value ? "var(--black)" : "transparent",
                          color: form.type === t.value ? "white" : "var(--muted)"
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 6, display: "block" }}>NOME *</label>
                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Seu nome"
                      style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 6, display: "block" }}>E-MAIL *</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="seu@email.com"
                      style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 6, display: "block" }}>ASSUNTO</label>
                  <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Descreva brevemente o assunto"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 6, display: "block" }}>MENSAGEM *</label>
                  <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Descreva em detalhes sua dúvida, problema ou sugestão..."
                    rows={5}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                </div>

                {error && (
                  <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
                    {error}
                  </div>
                )}

                <button type="submit" className="btn btn-md btn-green btn-full" disabled={sending}>
                  {sending ? "Enviando..." : "📧 Enviar mensagem"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

