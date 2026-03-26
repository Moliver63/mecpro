import { useState } from "react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--off)", display:"flex", flexDirection:"column" }}>
      <nav style={{ height:60, background:"white", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", padding:"0 32px" }}>
        <a href="/" style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:800, color:"var(--black)", textDecoration:"none" }}>
          MEC<span style={{ color:"var(--green-d)" }}>PRO</span>
        </a>
      </nav>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ width:"100%", maxWidth:420 }}>
          <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:20, padding:40, boxShadow:"var(--shadow-sm)" }}>
            {sent ? (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:40, marginBottom:16 }}>📧</div>
                <h2 style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:800, marginBottom:8 }}>Verifique seu e-mail</h2>
                <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, marginBottom:24 }}>
                  Se existe uma conta com este e-mail, você receberá um link para redefinir sua senha.
                </p>
                <a href="/login" style={{ fontSize:14, color:"var(--green-d)", fontWeight:600, textDecoration:"none" }}>← Voltar ao login</a>
              </div>
            ) : (
              <>
                <h1 style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:800, color:"var(--black)", marginBottom:6 }}>Esqueci minha senha</h1>
                <p style={{ fontSize:14, color:"var(--muted)", marginBottom:28 }}>Digite seu e-mail para receber o link de redefinição</p>
                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom:20 }}>
                    <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>E-mail</label>
                    <input className="input-field" type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <button type="submit" className="btn btn-lg btn-primary btn-full" disabled={loading}>
                    {loading ? "Enviando..." : "Enviar link"}
                  </button>
                </form>
                <div style={{ height:1, background:"var(--border)", margin:"20px 0" }} />
                <p style={{ textAlign:"center", fontSize:14 }}>
                  <a href="/login" style={{ color:"var(--green-d)", fontWeight:600, textDecoration:"none" }}>← Voltar ao login</a>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
